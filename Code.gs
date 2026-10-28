/**
 * Code.gs — web app entry points, storage (Google Sheet), email, scheduled deliveries.
 *
 * Hosting: Google Apps Script web app (free). Data: a Google Sheet you own.
 * Run setup() once from the Apps Script editor. See README.md.
 */

// ===================== CONFIG =====================
// Prices are placeholders: change them here. They are always enforced on the SERVER.
var PLANS = {
  daily:   { id: 'daily',   name: 'Daily guidance',      blurb: 'A personal note every morning for 30 days, based on where the planets are today and what they touch in your chart.', price: '9.00',  cadence: 'daily',   count: 30, step: 'day' },
  weekly:  { id: 'weekly',  name: 'Weekly guidance',     blurb: 'A week-ahead reading every week for 12 weeks: moon dates, key contacts to your chart, and one question to carry.',   price: '12.00', cadence: 'weekly',  count: 12, step: 'week' },
  monthly: { id: 'monthly', name: 'Monthly guidance',    blurb: 'A month-ahead reading every month for 6 months, with new and full moons placed in your houses.',                    price: '15.00', cadence: 'monthly', count: 6,  step: 'month' },
  yearly:  { id: 'yearly',  name: 'Year-ahead report',   blurb: 'One in-depth report for the twelve months ahead: your lord of the year, where luck and pressure land, and dated key periods.', price: '19.00', cadence: 'once', count: 1, step: 'once' },
  video:   { id: 'video',   name: 'Spoken chart video',  blurb: 'A personal, in-depth video walk-through of your full chart, recorded for you and delivered within 7 days.',          price: '49.00', cadence: 'manual',  count: 1, step: 'once' }
};

var READER_HEADERS = ['id', 'createdAt', 'name', 'email', 'birthDate', 'birthTime', 'place', 'lat', 'lon', 'tz', 'consent', 'token', 'status', 'freeSentAt', 'unsubscribed'];
var ORDER_HEADERS = ['orderId', 'readerId', 'plan', 'amount', 'currency', 'status', 'paypalOrderId', 'createdAt', 'paidAt', 'remaining', 'nextSendDate', 'lastSentAt', 'videoUrl', 'notes'];

function prop_(name, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return (v === null || v === '') ? fallback : v;
}
function siteName_() { return prop_('SITE_NAME', 'Celestial Compass'); }
function currency_() { return prop_('CURRENCY', 'EUR'); }
function execUrl_() { return prop_('SITE_URL', '') || ScriptApp.getService().getUrl(); }

// ===================== ACCESS CONTROL =====================
// Every top-level function WITHOUT a trailing underscore can be called from a visitor's browser
// (google.script.run). Helpers therefore end in "_". Owner-only entry points call this guard.
function assertOwner_() {
  var active = Session.getActiveUser().getEmail(), owner = Session.getEffectiveUser().getEmail();
  if (!active || active !== owner) throw new Error('Not allowed.');
}

// ===================== SETUP =====================
/** Run once from the editor (Run > setup). Creates the database sheets, triggers and default settings. */
function setup() {
  assertOwner_();
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* standalone project */ }
  if (!ss) ss = SpreadsheetApp.create(siteName_() + ' database');
  props.setProperty('SHEET_ID', ss.getId());
  ensureSheet_(ss, 'Readers', READER_HEADERS, ['id', 'name', 'email', 'birthDate', 'birthTime', 'place', 'tz', 'token', 'status']);
  ensureSheet_(ss, 'Orders', ORDER_HEADERS, ['orderId', 'readerId', 'plan', 'currency', 'status', 'paypalOrderId', 'nextSendDate', 'videoUrl', 'notes']);
  ensureSheet_(ss, 'Log', ['time', 'event', 'detail']);
  var defaults = { SITE_NAME: 'Celestial Compass', CURRENCY: 'EUR', PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: '', PAYPAL_SECRET: '', ADMIN_EMAIL: Session.getEffectiveUser().getEmail(), SITE_URL: '', GEONAMES_USER: '', PRIVACY_URL: '', SIGNUPS_PER_HOUR: '120' };
  Object.keys(defaults).forEach(function (k) { if (props.getProperty(k) === null) props.setProperty(k, defaults[k]); });

  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction(); if (f === 'processQueue' || f === 'runDeliveries') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processQueue').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('runDeliveries').timeBased().everyDays(1).atHour(7).create();
  Logger.log('Setup done. Sheet: ' + ss.getUrl() + '\nNext: Project Settings > Script properties: add PAYPAL_CLIENT_ID and PAYPAL_SECRET, then Deploy > New deployment > Web app.');
  return ss.getUrl();
}

function ensureSheet_(ss, name, headers, textCols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); sh.getRange(1, 1, 1, headers.length).setFontWeight('bold'); }
  // Plain-text columns: stops Sheets turning "1990-06-15" or "14:30" into date objects (which can shift a birth date by a day)
  (textCols || []).forEach(function (h) { sh.getRange(1, headers.indexOf(h) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  return sh;
}

/** Adds an admin menu when the script is attached to the Sheet. */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Astro admin')
      .addItem('Send video link for selected order', 'adminSendVideo')
      .addItem('Run deliveries now', 'runDeliveries')
      .addItem('Send queued free readings now', 'processQueue')
      .addToUi();
  } catch (e) { /* not bound to a sheet */ }
}

// ===================== DATABASE HELPERS =====================
function db_() { return SpreadsheetApp.openById(prop_('SHEET_ID', '')); }
function sheet_(name) { return db_().getSheetByName(name); }

function safeCell_(v) { // block spreadsheet formula injection
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}
function rows_(name, headers) {
  var sh = sheet_(name), n = sh.getLastRow();
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, headers.length).getValues();
  return vals.map(function (r, i) { var o = { _row: i + 2 }; headers.forEach(function (h, c) { o[h] = r[c]; }); return o; });
}
function readers_() { return rows_('Readers', READER_HEADERS); }
function orders_() { return rows_('Orders', ORDER_HEADERS); }
function appendRow_(name, headers, obj) { sheet_(name).appendRow(headers.map(function (h) { return safeCell_(obj[h] === undefined ? '' : obj[h]); })); }
function setCells_(name, headers, rowNum, patch) {
  var sh = sheet_(name);
  Object.keys(patch).forEach(function (k) { sh.getRange(rowNum, headers.indexOf(k) + 1).setValue(safeCell_(patch[k])); });
}
function log_(event, detail) { try { sheet_('Log').appendRow([new Date(), event, String(detail).slice(0, 500)]); } catch (e) { /* never block on logging */ } }
function findReader_(id) { return readers_().filter(function (r) { return r.id === id; })[0]; }
function findOrder_(id) { return orders_().filter(function (o) { return o.orderId === id; })[0]; }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function dateStr_(d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
/** Tolerant cell readers: work whether Sheets returned text or a Date object. */
function dateCell_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v).slice(0, 10); }
function timeCell_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm') : String(v || ''); }

// ===================== WEB APP =====================
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.pp === 'return') return pageMessage_(captureAndFulfil_(p.o, p.token));
    if (p.pp === 'cancel') { var co = p.o ? findOrder_(String(p.o)) : null, cr = co ? findReader_(co.readerId) : null; return pageMessage_({ title: 'Payment cancelled', body: 'No payment was taken. You can pick a plan again whenever you like.', home: cr ? resumeUrl_(cr.token) : null }); }
    if (p.u) return pageMessage_(unsubscribe_(p.u));
  } catch (err) {
    log_('doGet error', err && err.message);
    return pageMessage_({ title: 'Something went wrong', body: 'We could not complete that step. If you were charged, reply to your PayPal receipt email or contact us and we will sort it out.' });
  }
  var cfg = {
    siteName: siteName_(), currency: currency_(), sandbox: prop_('PAYPAL_MODE', 'sandbox') !== 'live',
    privacyUrl: prop_('PRIVACY_URL', ''), contact: prop_('ADMIN_EMAIL', ''),
    plans: Object.keys(PLANS).map(function (k) { var x = PLANS[k]; return { id: x.id, name: x.name, blurb: x.blurb, price: x.price }; })
  };
  if (p.r) { var rr = readers_().filter(function (x) { return x.token === String(p.r); })[0]; if (rr) cfg.resume = { id: rr.id, token: rr.token, name: String(rr.name).split(' ')[0] }; }
  var t = HtmlService.createTemplateFromFile('Index');
  t.cfgJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  t.siteName = cfg.siteName;
  return t.evaluate().setTitle(cfg.siteName + ': your birth chart reading')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resumeUrl_(token) { return execUrl_() + (execUrl_().indexOf('?') > -1 ? '&' : '?') + 'r=' + encodeURIComponent(token); }

/** Live sky for the page header. Cached for 10 minutes. */
function skyNow() {
  var cache = CacheService.getScriptCache(), hit = cache.get('sky_now');
  if (hit) return JSON.parse(hit);
  var now = Date.now(), pos = ASTRO.positions(now), bodies = {};
  ASTRO.PLANETS.concat(['Node']).forEach(function (n) { bodies[n] = { lon: pos[n].lon, retro: pos[n].retro }; });
  var retro = ['Mercury', 'Venus', 'Mars'].filter(function (n) { return pos[n].retro; });
  var pts = {}; ASTRO.PLANETS.forEach(function (n) { pts[n] = pos[n].lon; });
  var aspects = ASTRO.natalAspects(pts).slice(0, 18).map(function (x) { return { a: x.a, b: x.b, type: x.type }; });
  var out = { bodies: bodies, asc: null, mc: null, aspects: aspects, houseKnown: false,
    moonSign: ASTRO.signInfo(pos.Moon.lon).sign, sunSign: ASTRO.signInfo(pos.Sun.lon).sign, phase: ASTRO.phaseName(ASTRO.phaseAngle(now)), retro: retro };
  cache.put('sky_now', JSON.stringify(out), 600);
  return out;
}

function pageMessage_(m) {
  var home = m.home || execUrl_();
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top">' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1226;color:#ece8dc;font:17px/1.6 Georgia,serif;padding:24px}' +
    'main{max-width:34rem}h1{font-weight:500;font-size:1.9rem;margin:0 0 .6rem;color:#e8c872}a{color:#e8c872}p{margin:.5rem 0}</style></head><body><main><h1>' +
    READING.esc(m.title) + '</h1><p>' + READING.esc(m.body) + '</p>' + (m.extra ? '<p>' + READING.esc(m.extra) + '</p>' : '') +
    '<p><a href="' + READING.esc(home) + '" target="_top">Back to ' + READING.esc(siteName_()) + '</a></p></main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(m.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===================== FREE READING =====================
var NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]{0,78}[\p{L}\p{M}.]$/u;
var EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

function validate_(f) {
  if (!f || typeof f !== 'object') return 'Please fill in the form.';
  if (f.website) return 'Invalid submission.'; // honeypot
  var name = String(f.name || '').trim();
  if (name.length < 2 || !NAME_RE.test(name)) return 'Please enter your full name (letters only).';
  var email = String(f.email || '').trim();
  if (email.length > 120 || !EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f.date || ''));
  if (!m) return 'Please enter your date of birth.';
  var y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getTime() > Date.now()) return 'That date of birth does not look right.';
  if (!f.timeUnknown && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(f.time || ''))) return 'Please enter your birth time, or tick "I don’t know my birth time".';
  if (String(f.place || '').length > 120) return 'Birth place is too long.';
  if (!ASTRO.isValidTz(String(f.tz || ''))) return 'Please choose the time zone where you were born (for example Europe/London).';
  if (f.consent !== true) return 'Please tick the box to agree to receive your reading by email.';
  return null;
}

function rateLimit_(email) {
  var cache = CacheService.getScriptCache(), hour = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var key = 'rl_' + hour, n = +(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 3600);
  if (n > +prop_('SIGNUPS_PER_HOUR', '120')) return 'We are very busy right now. Please try again in a little while.';
  var ek = 'em_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email.toLowerCase())).slice(0, 20);
  var c = +(cache.get(ek) || 0) + 1; cache.put(ek, String(c), 86400);
  if (c > 6) return 'This email address has already been used several times today. Please try again tomorrow.';
  return null;
}

function geocode_(place) {
  var res = Maps.newGeocoder().geocode(place);
  if (!res || res.status !== 'OK' || !res.results || !res.results.length) return null;
  var r = res.results[0];
  return { lat: r.geometry.location.lat, lon: r.geometry.location.lng, label: r.formatted_address };
}

/** Optional: if GEONAMES_USER is set, find the true IANA zone for the birthplace. */
function lookupTimezone_(lat, lon) {
  var user = prop_('GEONAMES_USER', '');
  if (!user) return null;
  try {
    var r = UrlFetchApp.fetch('https://secure.geonames.org/timezoneJSON?lat=' + lat + '&lng=' + lon + '&username=' + encodeURIComponent(user), { muteHttpExceptions: true });
    var j = JSON.parse(r.getContentText());
    return (j && j.timezoneId && ASTRO.isValidTz(j.timezoneId)) ? j.timezoneId : null;
  } catch (e) { return null; }
}

/** Called from the page via google.script.run. */
function submitFree(form) {
  var err = validate_(form);
  if (err) return { ok: false, error: err };
  var email = String(form.email).trim().toLowerCase(), name = String(form.name).trim().replace(/\s+/g, ' ');
  var rl = rateLimit_(email);
  if (rl) return { ok: false, error: rl };

  var place = String(form.place || '').trim(), geo = null, tz = String(form.tz);
  if (place) {
    try { geo = geocode_(place); } catch (e) { log_('geocode error', e.message); }
    if (!geo) return { ok: false, error: 'We could not find that birth place. Try "City, Country", or clear the box and we will make your reading without houses.' };
    tz = lookupTimezone_(geo.lat, geo.lon) || tz;
  }
  var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.date), tm = form.timeUnknown ? null : /^(\d{2}):(\d{2})$/.exec(form.time);
  var input = { year: +dm[1], month: +dm[2], day: +dm[3], hour: tm ? +tm[1] : 12, minute: tm ? +tm[2] : 0, timeKnown: !!tm, lat: geo ? geo.lat : null, lon: geo ? geo.lon : null, tz: tz };

  var chart, reading;
  try {
    chart = ASTRO.buildChart(input);
    reading = READING.free(chart, Date.now(), { firstName: name.split(' ')[0], tz: tz });
  } catch (e) {
    log_('chart error', e.message);
    return { ok: false, error: 'We could not calculate that chart. Please check the date, time and time zone.' };
  }

  var saved = withLock_(function () {
    var existing = readers_().filter(function (r) { return String(r.email).toLowerCase() === email; })[0];
    var rec = {
      id: existing ? existing.id : newId_(), createdAt: existing ? existing.createdAt : new Date(), name: name, email: email,
      birthDate: form.date, birthTime: tm ? form.time : '', place: geo ? geo.label : '', lat: geo ? geo.lat : '', lon: geo ? geo.lon : '', tz: tz,
      consent: true, token: existing ? existing.token : newId_() + newId_(), status: existing ? existing.status : 'free_queued',
      freeSentAt: existing ? existing.freeSentAt : '', unsubscribed: false
    };
    if (existing) setCells_('Readers', READER_HEADERS, existing._row, rec); else appendRow_('Readers', READER_HEADERS, rec);
    rec._existing = !!existing;
    return rec;
  });

  // email (once per 7 days per address); queue if the daily Google mail quota is used up
  var emailStatus = 'skipped';
  var sentRecently = saved.freeSentAt && (Date.now() - new Date(saved.freeSentAt).getTime() < 7 * 86400000);
  if (!sentRecently) emailStatus = sendFreeReading_(saved, reading);
  return {
    ok: true, readerId: saved.id, token: saved.token, emailStatus: emailStatus, reading: reading,
    chart: wheelData_(chart), place: geo ? geo.label : ''
  };
}

function wheelData_(chart) {
  var bodies = {};
  ASTRO.PLANETS.concat(['Node']).forEach(function (n) { bodies[n] = { lon: chart.bodies[n].lon, retro: chart.bodies[n].retro, label: chart.bodies[n].label }; });
  var aspects = chart.aspects.filter(function (a) { return a.type !== 'sextile' || a.orb < 3; }).slice(0, 18).map(function (a) { return { a: a.a, b: a.b, type: a.type }; });
  return { bodies: bodies, asc: chart.asc ? chart.asc.lon : null, mc: chart.mc ? chart.mc.lon : null, aspects: aspects, houseKnown: chart.houseKnown };
}

// ===================== EMAIL =====================
function unsubLink_(token) { return execUrl_() + '?u=' + encodeURIComponent(token); }

function renderEmail_(reading, reader, extraHtml) {
  var html = '<div style="max-width:620px;margin:0 auto;padding:24px;background:#fbf8ef;border:1px solid #e6dcc0;font-family:Georgia,serif">' +
    '<p style="margin:0 0 14px;color:#7a5c12;font-size:13px;letter-spacing:.04em">' + READING.esc(siteName_()) + '</p>' + READING.toHtml(reading) + (extraHtml || '') +
    '<hr style="border:none;border-top:1px solid #e6dcc0;margin:26px 0 12px">' +
    '<p style="font-size:12px;color:#6b6b78;line-height:1.5">For reflection and entertainment. Astrology is not medical, legal or financial advice.<br>' +
    'You are receiving this because you asked for it at ' + READING.esc(siteName_()) + '. <a href="' + READING.esc(unsubLink_(reader.token)) + '">Unsubscribe</a></p></div>';
  var text = READING.toText(reading) + '\n' + (extraHtml ? '' : '') + '--\nFor reflection and entertainment. Unsubscribe: ' + unsubLink_(reader.token);
  return { html: html, text: text };
}

function canSend_() { return MailApp.getRemainingDailyQuota() > 0; }

function sendMail_(reader, subject, reading, extraHtml) {
  var r = renderEmail_(reading, reader, extraHtml);
  MailApp.sendEmail({ to: reader.email, subject: subject, body: r.text, htmlBody: r.html, name: siteName_(), replyTo: prop_('ADMIN_EMAIL', '') });
}

function sendFreeReading_(reader, reading) {
  if (!canSend_()) return 'queued';
  try {
    var cta = '<p style="margin:22px 0 0;padding:14px;background:#f3ecd4;line-height:1.6">Want to go deeper? Daily, weekly and monthly guidance, a year-ahead report, and a spoken video walk-through of your chart are available at <a href="' + READING.esc(resumeUrl_(reader.token)) + '">' + READING.esc(siteName_()) + '</a>.</p>';
    sendMail_(reader, 'Your free birth chart reading', reading, cta);
    var row = readers_().filter(function (x) { return x.id === reader.id; })[0];
    if (row) setCells_('Readers', READER_HEADERS, row._row, { status: 'free_sent', freeSentAt: new Date() });
    return 'sent';
  } catch (e) { log_('free mail error', e.message); return 'queued'; }
}

function chartInputFromReader_(r) {
  var d = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateCell_(r.birthDate));
  var t = /^(\d{1,2}):(\d{2})/.exec(timeCell_(r.birthTime));
  return { year: +d[1], month: +d[2], day: +d[3], hour: t ? +t[1] : 12, minute: t ? +t[2] : 0, timeKnown: !!t,
    lat: r.lat === '' ? null : +r.lat, lon: r.lon === '' ? null : +r.lon, tz: String(r.tz) };
}

/** Hourly trigger: send free readings that were queued because the daily mail quota ran out. */
function processQueue() {
  readers_().filter(function (r) { return r.status === 'free_queued' && !r.unsubscribed && String(r.unsubscribed).toUpperCase() !== 'TRUE'; }).some(function (r) {
    if (!canSend_()) return true; // stop; try again next hour/day
    try {
      var input = chartInputFromReader_(r);
      var reading = READING.free(ASTRO.buildChart(input), Date.now(), { firstName: String(r.name).split(' ')[0], tz: input.tz });
      sendFreeReading_(r, reading);
    } catch (e) { log_('queue error', r.id + ' ' + e.message); }
    return false;
  });
}

// ===================== DELIVERY OF PAID GUIDANCE =====================
function addStep_(dateStrVal, step) {
  var d = new Date(dateStrVal + 'T00:00:00Z');
  if (step === 'day') d.setUTCDate(d.getUTCDate() + 1);
  else if (step === 'week') d.setUTCDate(d.getUTCDate() + 7);
  else if (step === 'month') { var day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); }
  return dateStr_(d);
}

/** Sends one guidance email for a paid order and advances its schedule. */
function deliverOrder_(order, reader) {
  var plan = PLANS[order.plan];
  if (!plan || plan.cadence === 'manual') return false;
  if (!canSend_()) return false;
  var input = chartInputFromReader_(reader), chart = ASTRO.buildChart(input), now = Date.now();
  var kind = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', once: 'yearly' }[plan.cadence];
  var reading = READING.guidance(kind, chart, now, { tz: input.tz, firstName: String(reader.name).split(' ')[0] });
  var intro = { title: reading.title, sections: [{ h: 'Hello ' + String(reader.name).split(' ')[0], p: [kind === 'yearly' ? 'Here is your year-ahead report.' : 'Here is today’s ' + kind + ' guidance, calculated from the sky right now and your birth chart.'] }].concat(reading.sections) };
  sendMail_(reader, reading.title, intro);
  var remaining = Math.max(0, (+order.remaining) - 1), today = dateStr_(new Date());
  setCells_('Orders', ORDER_HEADERS, order._row, {
    remaining: remaining, lastSentAt: new Date(),
    nextSendDate: remaining > 0 ? addStep_(today, plan.step) : '', status: remaining > 0 ? 'ACTIVE' : 'COMPLETED'
  });
  return true;
}

/** Daily 07:00 trigger. */
function runDeliveries() {
  var today = dateStr_(new Date()), readers = {};
  readers_().forEach(function (r) { readers[r.id] = r; });
  orders_().forEach(function (o) {
    if (o.status !== 'ACTIVE' || !(+o.remaining > 0)) return;
    var due = dateCell_(o.nextSendDate);
    if (due > today) return;
    var r = readers[o.readerId];
    if (!r || String(r.unsubscribed).toUpperCase() === 'TRUE') return;
    try { if (!deliverOrder_(o, r)) log_('delivery deferred', o.orderId); } catch (e) { log_('delivery error', o.orderId + ' ' + e.message); }
  });
}

function unsubscribe_(token) {
  var r = readers_().filter(function (x) { return x.token === token; })[0];
  if (!r) return { title: 'Link not recognised', body: 'This unsubscribe link is not valid. Reply to any of our emails and we will remove you by hand.' };
  setCells_('Readers', READER_HEADERS, r._row, { unsubscribed: true });
  return { title: 'You are unsubscribed', body: 'We will not email you again. If you paid for a plan, contact us for a refund of the unused part.' };
}

// ===================== ADMIN: SPOKEN VIDEO DELIVERY =====================
/** Select an order row in the Orders sheet, paste the video URL in the videoUrl column, then use Astro admin > Send video link. */
function adminSendVideo() {
  assertOwner_();
  var ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== 'Orders') { ui.alert('Open the Orders sheet and click a video order row first.'); return; }
  var row = sh.getActiveRange().getRow();
  var order = orders_().filter(function (o) { return o._row === row; })[0];
  if (!order || order.plan !== 'video' || order.status !== 'AWAITING_VIDEO') { ui.alert('Select a paid video order row that is awaiting its video.'); return; }
  if (!/^https:\/\//.test(String(order.videoUrl))) { ui.alert('Paste the https:// video link in the videoUrl column first.'); return; }
  var reader = findReader_(order.readerId);
  var reading = { title: 'Your spoken chart video is ready', sections: [{ h: 'Hello ' + String(reader.name).split(' ')[0], p: ['Your personal video walk-through of your birth chart is ready.', 'Watch it here: ' + order.videoUrl, 'Take your time, and reply to this email with any questions.'] }] };
  sendMail_(reader, 'Your spoken chart video is ready', reading);
  setCells_('Orders', ORDER_HEADERS, row, { status: 'DELIVERED', lastSentAt: new Date() });
  ui.alert('Sent to ' + reader.email);
}
