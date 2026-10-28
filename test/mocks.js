// In-memory stand-ins for the Google Apps Script services used by Code.gs / Payments.gs.
const crypto = require('crypto');
module.exports = function makeMocks(opts) {
  opts = opts || {};
  const state = { mails: [], props: {}, cache: {}, fetches: [], quota: 100, triggers: [], ppMode: 'ok', ppSeq: 0, ppOrders: {}, geo: {}, alerts: [], activeRow: null, activeSheet: null, templateValues: null };
  const TZ = 'Europe/Amsterdam';
  function offsetStr(date, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const p = {}; dtf.formatToParts(date).forEach(x => p[x.type] = x.value);
    const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
    const m = Math.round(off / 60000), a = Math.abs(m);
    return (m < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0');
  }
  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    formatDate(date, tz, fmt) {
      if (fmt === 'Z') return offsetStr(date, tz);
      const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const p = {}; dtf.formatToParts(date).forEach(x => p[x.type] = x.value);
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour % 24 === 0 ? '00' : p.hour).replace('mm', p.minute);
    },
    base64Encode: s => Buffer.from(s).toString('base64'),
    base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    computeDigest: (alg, s) => Array.from(crypto.createHash('md5').update(s).digest()),
    DigestAlgorithm: { MD5: 'MD5' }
  };
  class Range { constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j] ?? ''); out.push(row); } return out; }
    setValue(v) { while (this.sh.data.length < this.r) this.sh.data.push([]); this.sh.data[this.r - 1][this.c - 1] = v; return this; }
    setFontWeight() { return this; } setNumberFormat(f) { this.sh.formats[this.c] = f; return this; }
    getRow() { return this.r; } }
  class Sheet { constructor(n) { this.name = n; this.data = []; this.formats = {}; }
    getName() { return this.name; } getLastRow() { return this.data.length; } getMaxRows() { return 1000; } setFrozenRows() {}
    appendRow(a) { this.data.push(a.slice()); } getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); } }
  class Spreadsheet { constructor() { this.id = 'sheet' + Math.random().toString(36).slice(2, 8); this.sheets = {}; }
    getId() { return this.id; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
    getSheetByName(n) { return this.sheets[n] || null; } insertSheet(n) { return (this.sheets[n] = new Sheet(n)); } }
  const books = {};
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => opts.bound ? (books.active = books.active || (() => { const s = new Spreadsheet(); books[s.id] = s; return s; })()) : null,
    create: () => { const s = new Spreadsheet(); books[s.id] = s; return s; },
    openById: id => books[id],
    getUi: () => ({ alert: m => state.alerts.push(m), createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }),
    getActiveSheet: () => state.activeSheet,
  };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in state.props ? state.props[k] : null), setProperty: (k, v) => { state.props[k] = v; } }) };
  const CacheService = { getScriptCache: () => ({ get: k => state.cache[k] ?? null, put: (k, v) => { state.cache[k] = v; } }) };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const MailApp = {
    sendEmail(a, b, c) { if (state.quota <= 0) throw new Error('Service invoked too many times: email'); state.quota--; state.mails.push(typeof a === 'object' ? a : { to: a, subject: b, body: c }); },
    getRemainingDailyQuota: () => state.quota
  };
  const ScriptApp = {
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
    getProjectTriggers: () => state.triggers, deleteTrigger: t => { state.triggers = state.triggers.filter(x => x !== t); },
    newTrigger(fn) { const t = { getHandlerFunction: () => fn, spec: fn }; const chain = { timeBased: () => chain, everyHours: () => chain, everyDays: () => chain, atHour: () => chain, create: () => { state.triggers.push(t); return t; } }; return chain; }
  };
  const Session = { getActiveUser: () => ({ getEmail: () => (state.activeUser === undefined ? 'owner@example.com' : state.activeUser) }), getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }), getScriptTimeZone: () => TZ };
  const Maps = { newGeocoder: () => ({ geocode: p => state.geo[p.toLowerCase()] || { status: 'ZERO_RESULTS', results: [] } }) };
  const Logger = { log() {} };
  const HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile: n => { const t = { file: n }; t.evaluate = () => { const o = { html: '[template ' + n + ']', t }; o.setTitle = x => { o.title = x; return o; }; o.addMetaTag = () => o; o.setXFrameOptionsMode = () => o; return o; }; return t; },
    createHtmlOutput: h => { const o = { html: h }; o.setTitle = x => { o.title = x; return o; }; o.setXFrameOptionsMode = () => o; return o; }
  };
  const UrlFetchApp = { fetch(url, o) {
    o = o || {}; const call = { url, method: (o.method || 'get').toLowerCase(), headers: o.headers || {}, body: o.payload }; state.fetches.push(call);
    const res = (code, obj) => ({ getResponseCode: () => code, getContentText: () => typeof obj === 'string' ? obj : JSON.stringify(obj) });
    const path = url.replace(/^https:\/\/[^/]+/, '');
    if (/oauth2\/token/.test(path)) return state.ppMode === 'authfail' ? res(401, { error: 'invalid_client' }) : res(200, { access_token: 'tok', expires_in: 32400 });
    if (/geonames/.test(url)) return res(200, { timezoneId: 'America/New_York' });
    if (call.method === 'post' && path === '/v2/checkout/orders') {
      const b = JSON.parse(o.payload), id = 'PPORDER' + (++state.ppSeq); state.ppOrders[id] = { amount: b.purchase_units[0].amount, body: b };
      return res(201, { id, status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'self', href: 'x' }, { rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + id }] });
    }
    let m = /\/v2\/checkout\/orders\/([^/]+)\/capture/.exec(path);
    if (m) {
      const ord = state.ppOrders[m[1]]; if (!ord) return res(404, { name: 'RESOURCE_NOT_FOUND' });
      if (state.ppMode === 'decline') return res(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] });
      if (ord.captured) return res(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      ord.captured = true;
      const amt = state.ppMode === 'mismatch' ? { value: '0.01', currency_code: ord.amount.currency_code } : ord.amount;
      return res(201, { id: m[1], status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP' + m[1], status: 'COMPLETED', amount: amt }] } }] });
    }
    m = /\/v2\/checkout\/orders\/([^/?]+)$/.exec(path);
    if (m && call.method === 'get') { const ord = state.ppOrders[m[1]]; return res(200, { id: m[1], status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP' + m[1], status: 'COMPLETED', amount: ord.amount }] } }] }); }
    return res(404, { error: 'unmocked ' + path });
  } };
  return { state, books, globals: { Utilities, SpreadsheetApp, PropertiesService, CacheService, LockService, MailApp, ScriptApp, Session, Maps, Logger, HtmlService, UrlFetchApp, Date, Intl, crypto } };
};
