const load = require('./load'), makeMocks = require('./mocks');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } }

const M = makeMocks({ bound: true }), S = M.state;
const ctx = load(['Astro.gs', 'Reading.gs', 'Code.gs', 'Payments.gs'], M.globals);
const run = (src) => require('vm').runInContext(src, ctx);

S.geo['amsterdam'] = { status: 'OK', results: [{ geometry: { location: { lat: 52.3676, lng: 4.9041 } }, formatted_address: 'Amsterdam, Netherlands' }] };
const good = { name: 'Anna de Vries', email: 'Anna@Example.com', date: '1990-06-15', time: '14:30', timeUnknown: false, place: 'Amsterdam', tz: 'Europe/Amsterdam', consent: true, website: '' };
const sheetRows = (n) => M.books[S.props.SHEET_ID].sheets[n].data;

console.log('access control');
S.activeUser = ''; let blocked = false; try { ctx.setup(); } catch (e) { blocked = /not allowed/i.test(e.message); }
check('anonymous visitor cannot run setup()', blocked && Object.keys(S.props).length === 0);
S.activeUser = 'owner@example.com';
const builtins = ['Date','Object','Array','String','Number','parseInt','parseFloat','isFinite','isNaN','RegExp','Error','encodeURIComponent','decodeURIComponent','setTimeout'];
const publicFns = Object.keys(ctx).filter(k => typeof ctx[k] === 'function' && !k.endsWith('_') && !builtins.includes(k));
console.log('       browser-callable functions:', publicFns.join(', '));
const allowed = ['setup', 'onOpen', 'doGet', 'submitFree', 'startCheckout', 'skyNow', 'processQueue', 'runDeliveries', 'adminSendVideo'];
check('only intended functions are browser-callable', publicFns.every(f => allowed.includes(f)) && allowed.every(f => publicFns.includes(f)), publicFns.join(','));
check('no helper can leak script properties', typeof ctx.prop === 'undefined' && typeof ctx.siteName === 'undefined');

console.log('setup');
ctx.setup();
check('sheets created', ['Readers', 'Orders', 'Log'].every(n => sheetRows(n).length === 1));
check('text columns configured on Readers', Object.keys(M.books[S.props.SHEET_ID].sheets.Readers.formats).length >= 8);
check('2 triggers installed', S.triggers.length === 2);
ctx.setup(); check('setup is re-runnable (still 2 triggers)', S.triggers.length === 2);

console.log('validation');
const bad = (patch, label) => { const r = ctx.submitFree(Object.assign({}, good, patch)); check(label + ' -> ' + (r.error || '').slice(0, 50), r.ok === false); };
bad({ name: '' }, 'empty name'); bad({ name: '=HYPERLINK("x")' }, 'formula name'); bad({ name: 'A' }, 'one-letter name'); bad({ email: 'nope' }, 'bad email');
bad({ date: '2999-01-01' }, 'future date'); bad({ date: '1990-02-31' }, 'impossible date'); bad({ date: '1850-01-01' }, 'too old'); bad({ time: '25:00' }, 'bad time');
bad({ tz: 'Mars/Base' }, 'bad tz'); bad({ consent: false }, 'no consent'); bad({ website: 'http://spam' }, 'honeypot'); bad({ place: 'x'.repeat(200) }, 'long place');
bad({ place: 'Atlantis' }, 'unknown place');
check('nothing stored for rejected input', sheetRows('Readers').length === 1);

console.log('free reading');
let r = ctx.submitFree(good);
check('ok + reading + chart', r.ok && r.reading.sections.length >= 8 && r.chart.asc !== null, JSON.stringify(r).slice(0, 200));
check('email sent once, html + text', S.mails.length === 1 && /free birth chart/i.test(S.mails[0].subject) && S.mails[0].htmlBody.includes('Unsubscribe') && S.mails[0].to === 'anna@example.com');
check('reader stored with plain strings', sheetRows('Readers').length === 2 && sheetRows('Readers')[1][4] === '1990-06-15' && sheetRows('Readers')[1][5] === '14:30');
check('place geocoded', r.place === 'Amsterdam, Netherlands' && sheetRows('Readers')[1][12] === 'free_sent');
const r2 = ctx.submitFree(good);
check('same person again: no duplicate row, no second email', sheetRows('Readers').length === 2 && S.mails.length === 1 && r2.ok && r2.emailStatus === 'skipped' && r2.token === r.token);
const r3 = ctx.submitFree(Object.assign({}, good, { email: 'Bob@example.com', timeUnknown: true, time: '', place: '' }));
check('no time + no place works, chart has no ascendant', r3.ok && r3.chart.asc === null && S.mails.length === 2);
const r4 = ctx.submitFree(Object.assign({}, good, { email: '=cmd|calc@example.com', name: 'Eve Smith' }));
check('formula-looking email is neutralised in the sheet', r4.ok && String(sheetRows('Readers').slice(-1)[0][3]).startsWith("'="));
S.props.GEONAMES_USER = 'demo'; const r5 = ctx.submitFree(Object.assign({}, good, { email: 'geo@example.com' })); S.props.GEONAMES_USER = '';
check('GeoNames timezone override used when configured', r5.ok && sheetRows('Readers').slice(-1)[0][9] === 'America/New_York');

console.log('mail quota overflow -> queue');
S.quota = 0; const rq = ctx.submitFree(Object.assign({}, good, { email: 'queue@example.com' }));
check('queued when quota is 0, still shows reading', rq.ok && rq.emailStatus === 'queued' && sheetRows('Readers').slice(-1)[0][12] === 'free_queued');
const before = S.mails.length; ctx.processQueue(); check('processQueue does nothing without quota', S.mails.length === before);
S.quota = 50; ctx.processQueue();
check('processQueue sends after quota returns', S.mails.length === before + 1 && S.mails.slice(-1)[0].to === 'queue@example.com' && sheetRows('Readers').slice(-1)[0][12] === 'free_sent');

console.log('checkout');
const rid = r.readerId, tok = r.token;
S.props.PAYPAL_CLIENT_ID = ''; S.props.PAYPAL_SECRET = '';
check('unconfigured PayPal -> friendly error, no row', ctx.startCheckout(rid, tok, 'daily').ok === false && sheetRows('Orders').length === 1);
S.props.PAYPAL_CLIENT_ID = 'id'; S.props.PAYPAL_SECRET = 'secret'; S.props.PAYPAL_MODE = 'sandbox';
check('wrong token rejected', ctx.startCheckout(rid, 'wrong', 'daily').ok === false);
check('unknown plan rejected', ctx.startCheckout(rid, tok, 'free-everything').ok === false);
const c1 = ctx.startCheckout(rid, tok, 'daily');
check('approve URL returned', c1.ok && /paypal\.com/.test(c1.approveUrl));
const ordCall = S.fetches.filter(f => f.url.endsWith('/v2/checkout/orders'))[0], ob = JSON.parse(ordCall.body);
check('server-side price used (9.00 EUR)', ob.purchase_units[0].amount.value === '9.00' && ob.purchase_units[0].amount.currency_code === 'EUR');
check('uses sandbox host + idempotency header + auth', /api-m\.sandbox\.paypal\.com/.test(ordCall.url) && !!ordCall.headers['PayPal-Request-Id'] && ordCall.headers.Authorization === 'Bearer tok');
check('return/cancel URLs point at the web app', ob.payment_source.paypal.experience_context.return_url.startsWith('https://script.google.com/macros/s/TEST/exec?pp=return&o='));
const o1 = sheetRows('Orders')[1], orderId = o1[0], ppId = o1[6];
check('order stored as CREATED', o1[5] === 'CREATED' && o1[3] === '9.00');

console.log('capture');
let m = ctx.captureAndFulfil_(orderId, 'WRONGTOKEN'); check('wrong paypal token -> not found', /not found/i.test(m.title) && sheetRows('Orders')[1][5] === 'CREATED');
S.ppMode = 'decline'; m = ctx.captureAndFulfil_(orderId, ppId); check('declined -> no activation', /not completed/i.test(m.title) && sheetRows('Orders')[1][5] === 'CREATED');
S.ppMode = 'ok'; const mailsBefore = S.mails.length;
m = ctx.captureAndFulfil_(orderId, ppId);
let o = sheetRows('Orders')[1];
check('paid -> ACTIVE, first daily sent immediately, 29 left', /complete/i.test(m.title) && o[5] === 'ACTIVE' && o[9] === 29 && S.mails.length === mailsBefore + 1 && /daily guidance/i.test(S.mails.slice(-1)[0].subject), JSON.stringify(o));
const dateOf = (x) => ctx.dateCell_(x);
check('next send scheduled for tomorrow', dateOf(o[10]) === ctx.addStep_(ctx.dateStr_(new Date()), 'day'));
m = ctx.captureAndFulfil_(orderId, ppId); check('replayed redirect is idempotent (no extra email)', /already/i.test(m.body) && S.mails.length === mailsBefore + 1);

console.log('fraud / error paths');
const c2 = ctx.startCheckout(rid, tok, 'weekly'); const o2 = sheetRows('Orders')[2];
S.ppMode = 'mismatch'; m = ctx.captureAndFulfil_(o2[0], o2[6]);
check('amount mismatch -> REVIEW, nothing delivered', sheetRows('Orders')[2][5] === 'REVIEW' && /checking/i.test(m.title));
S.ppMode = 'authfail'; S.cache = {}; const c3 = ctx.startCheckout(rid, tok, 'monthly'); check('PayPal auth failure handled', c3.ok === false); S.ppMode = 'ok';

console.log('scheduled deliveries');
ctx.runDeliveries(); check('not due yet -> nothing sent', sheetRows('Orders')[1][9] === 29);
const setRow = (n, col, v) => { sheetRows('Orders')[n][col] = v; };
let sent = 0;
for (let i = 0; i < 40; i++) { setRow(1, 10, '2000-01-01'); const b = S.mails.length; ctx.runDeliveries(); sent += S.mails.length - b; if (sheetRows('Orders')[1][5] === 'COMPLETED') break; }
check('30 daily readings total then COMPLETED (29 more sent)', sent === 29 && sheetRows('Orders')[1][5] === 'COMPLETED' && sheetRows('Orders')[1][9] === 0, 'sent ' + sent);
const b4 = S.mails.length; setRow(1, 10, '2000-01-01'); ctx.runDeliveries(); check('completed orders never send again', S.mails.length === b4);
check('monthly step clamps (31 Jan -> 28 Feb)', ctx.addStep_('2027-01-31', 'month') === '2027-02-28' && ctx.addStep_('2026-12-15', 'month') === '2027-01-15' && ctx.addStep_('2026-10-27', 'week') === '2026-11-03');

console.log('all plan types deliver');
['weekly', 'monthly', 'yearly'].forEach(p => {
  const c = ctx.startCheckout(rid, tok, p), row = sheetRows('Orders').slice(-1)[0], b = S.mails.length;
  const mm = ctx.captureAndFulfil_(row[0], row[6]);
  check(p + ': paid + first email (' + (S.mails.slice(-1)[0] || {}).subject + ')', S.mails.length === b + 1 && /complete/i.test(mm.title));
});
const yr = sheetRows('Orders').slice(-1)[0]; check('year-ahead completes after one send', yr[5] === 'COMPLETED' && yr[9] === 0);

console.log('video order (manual fulfilment)');
ctx.startCheckout(rid, tok, 'video'); const vo = sheetRows('Orders').slice(-1)[0]; const mb = S.mails.length;
ctx.captureAndFulfil_(vo[0], vo[6]);
check('customer confirmation + admin notification', S.mails.length === mb + 2 && S.mails.slice(-1)[0].to === 'owner@example.com' && S.mails.slice(-2)[0].to === 'anna@example.com');
check('status AWAITING_VIDEO', sheetRows('Orders').slice(-1)[0][5] === 'AWAITING_VIDEO');
const sh = M.books[S.props.SHEET_ID].sheets.Orders, rowNum = sh.data.length;
S.activeSheet = Object.assign(sh, { getActiveRange: () => ({ getRow: () => rowNum }) });
ctx.adminSendVideo(); check('admin send without link is blocked', /video link/i.test(S.alerts.slice(-1)[0]));
sh.data[rowNum - 1][12] = 'https://example.com/v/abc'; const mb2 = S.mails.length; ctx.adminSendVideo();
check('admin sends video link, order DELIVERED', S.mails.length === mb2 + 1 && /example\.com\/v\/abc/.test(S.mails.slice(-1)[0].body) && sh.data[rowNum - 1][5] === 'DELIVERED');
ctx.runDeliveries(); check('video orders are never auto-delivered', S.mails.length === mb2 + 1);

console.log('unsubscribe + Sheets date quirk');
const rdr = sheetRows('Readers')[1]; const un = ctx.doGet({ parameter: { u: rdr[11] } });
check('unsubscribe link works', /unsubscribed/i.test(un.title) && rdr[14] === true);
check('bad unsubscribe token handled', /not recognised/i.test(ctx.doGet({ parameter: { u: 'nope' } }).title));
const rd = Object.assign({}, rdr, {}); // simulate Sheets turning text into Date objects
const asObj = { birthDate: new Date('1990-06-14T22:00:00Z'), birthTime: new Date('1899-12-30T13:30:00+01:00'), lat: 52.3676, lon: 4.9041, tz: 'Europe/Amsterdam' };
const ci = ctx.chartInputFromReader_(asObj); check('Date-typed cells still resolve to 1990-06-15', ci.year === 1990 && ci.month === 6 && ci.day === 15, JSON.stringify(ci));

console.log('sky now + resume link');
const sky = ctx.skyNow(); check('skyNow returns live positions', Object.keys(sky.bodies).length === 11 && !!sky.moonSign && !!sky.phase && Array.isArray(sky.retro));
const resumeHome = ctx.doGet({ parameter: { r: sheetRows('Readers')[2][11] } }); check('resume link identifies the returning reader', JSON.parse(resumeHome.t.cfgJson).resume.name === 'Anna');
check('bad resume token ignored', JSON.parse(ctx.doGet({ parameter: { r: 'zzz' } }).t.cfgJson).resume === undefined);
check('free email links to the resume URL', S.mails[0].htmlBody.includes('exec?r='));
S.mails.length = 0;

console.log('doGet routing');
check('home renders template', ctx.doGet({ parameter: {} }).t && ctx.doGet({ parameter: {} }).t.file === 'Index');
check('cancel page', /cancelled/i.test(ctx.doGet({ parameter: { pp: 'cancel' } }).title));
check('return page w/ unknown order is safe', /not found/i.test(ctx.doGet({ parameter: { pp: 'return', o: 'zzz', token: 'zzz' } }).title));
const home = ctx.doGet({ parameter: {} }); check('config JSON escapes "<" (no script injection)', !/</.test(home.t.cfgJson));
check('HTML escaping in confirmation pages', !/<script/i.test(ctx.doGet({ parameter: { pp: 'return', o: '<script>', token: '<script>' } }).html));

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
