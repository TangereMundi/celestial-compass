const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const load = require('./load'), makeMocks = require('./mocks');
const OUT = process.env.SHOTS || '/tmp/astro-shots'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok || !d ? '' : '  -> ' + d)); };

(async () => {
  const M = makeMocks({ bound: true }), S = M.state;
  const ctx = load(['Astro.gs', 'Reading.gs', 'Code.gs', 'Payments.gs'], M.globals);
  ctx.setup(); Object.assign(S.props, { PAYPAL_CLIENT_ID: 'id', PAYPAL_SECRET: 's', ADMIN_EMAIL: 'hello@example.com' });
  S.geo['amsterdam'] = { status: 'OK', results: [{ geometry: { location: { lat: 52.3676, lng: 4.9041 } }, formatted_address: 'Amsterdam, Netherlands' }] };
  const cfgJson = ctx.doGet({ parameter: {} }).t.cfgJson;
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8').replace('<?!= cfgJson ?>', cfgJson).replace('<?= siteName ?>', 'Celestial Compass');

  const browser = await chromium.launch(); const errors = [];
  async function newPage(opts, extraCfg) {
    const context = await browser.newContext(opts), page = await context.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.route(/paypal\.com/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>PayPal sandbox page</h1>' }));
    await page.exposeFunction('__call', async (fn, args) => JSON.parse(JSON.stringify(ctx[fn].apply(null, args) ?? null)));
    await page.addInitScript(() => {
      function chain(ok, bad) { return new Proxy({}, { get(_, name) {
        if (name === 'withSuccessHandler') return f => chain(f, bad); if (name === 'withFailureHandler') return f => chain(ok, f);
        return (...args) => { window.__call(String(name), args).then(r => ok && ok(r)).catch(e => bad && bad(e)); }; } }); }
      window.google = { script: { run: chain(null, null) } };
    });
    const h = extraCfg ? html.replace(cfgJson, JSON.stringify(Object.assign(JSON.parse(cfgJson), extraCfg))) : html;
    await page.route('http://astro.test/', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: h }));
    await page.goto('http://astro.test/', { waitUntil: 'domcontentloaded' });
    return page;
  }

  console.log('desktop 1280x900');
  let page = await newPage({ viewport: { width: 1280, height: 900 } });
  await page.waitForSelector('#wheel text'); await page.waitForTimeout(1900);
  const cap0 = await page.textContent('#wheelCap');
  check('live sky caption: ' + cap0.slice(0, 70) + '…', /The sky right now: Sun in \w+, Moon in \w+/.test(cap0));
  check('wheel has 12 sign glyphs + 11 bodies', (await page.$$eval('#wheel text', t => t.length)) >= 23);
  check('test-mode banner visible (sandbox)', await page.isVisible('#testmode'));
  await page.screenshot({ path: OUT + '/1-desktop-home.png' });

  // validation errors
  await page.fill('#name', 'Anna de Vries'); await page.click('#go');
  check('empty form shows a clear error', /email/i.test(await page.textContent('#status')), await page.textContent('#status'));

  await page.fill('#email', 'anna@example.com'); await page.fill('#date', '1990-06-15'); await page.fill('#time', '14:30'); await page.fill('#place', 'Amsterdam'); await page.click('#tzSummary'); await page.fill('#tz', 'Europe/Amsterdam');
  await page.click('#go');
  check('missing consent is refused', /agree|tick/i.test(await page.textContent('#status')), await page.textContent('#status'));
  await page.check('#consent'); await page.click('#go');
  await page.waitForSelector('#result:not([hidden])', { timeout: 8000 });
  const title = await page.textContent('#resultTitle'), rows = await page.$$eval('#readingBody .row', r => r.length);
  check('reading displayed: "' + title + '", ' + rows + ' sections', rows >= 8);
  check('form replaced by confirmation naming the email', (await page.textContent('#doneMsg')).includes('anna@example.com') && await page.isHidden('#form'));
  check('one email actually sent', S.mails.length === 1 && S.mails[0].to === 'anna@example.com');
  check('wheel switched to natal chart (AC + MC + houses)', (await page.$$eval('#wheel text', t => t.map(x => x.textContent))).includes('AC') && (await page.textContent('#wheelCap')).startsWith('Your sky at birth'));
  check('aspect key shown', await page.isVisible('#key'));
  check('page scrolled to the wheel + confirmation after submit', await page.evaluate(() => document.activeElement.id === 'done'));
  check('reading text is real (no undefined/NaN)', !/undefined|NaN|\[object/.test(await page.textContent('#readingBody')));
  await page.waitForTimeout(1800); await page.screenshot({ path: OUT + '/2-desktop-result-top.png' });
  await page.screenshot({ path: OUT + '/3-desktop-full.png', fullPage: true });

  console.log('checkout');
  const plansBtn = page.locator('.plan button').first();
  check('plan buttons are labelled with price for screen readers', /Pay .*9.*Daily guidance/.test(await plansBtn.getAttribute('aria-label')));
  await plansBtn.click();
  await page.waitForURL(/paypal\.com/, { timeout: 8000 }).catch(() => {});
  check('browser is sent to PayPal approve URL: ' + page.url().slice(0, 55), /paypal\.com\/checkoutnow\?token=PPORDER/.test(page.url()));
  check('server created a CREATED order for 9.00 EUR', ctx.dateCell_ && S.props.SHEET_ID && M.books[S.props.SHEET_ID].sheets.Orders.data.length === 2 && M.books[S.props.SHEET_ID].sheets.Orders.data[1][3] === '9.00');
  await page.close();

  console.log('mobile 390x844');
  page = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.waitForSelector('#wheel text'); await page.waitForTimeout(1900);
  await page.screenshot({ path: OUT + '/4-mobile-home.png' });
  check('no horizontal scroll on phone', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.fill('#name', 'Sam Okafor'); await page.fill('#email', 'sam@example.com'); await page.fill('#date', '1984-11-03'); await page.check('#timeUnknown'); await page.click('#tzSummary'); await page.fill('#tz', 'Africa/Lagos'); await page.check('#consent');
  check('time field disabled when "don’t know" ticked', await page.isDisabled('#time'));
  await page.click('#go'); await page.waitForSelector('#result:not([hidden])', { timeout: 8000 }); await page.waitForTimeout(1800);
  check('no-time reading works and says Rising is hidden', /still hidden/i.test(await page.textContent('#readingBody')));
  await page.screenshot({ path: OUT + '/5-mobile-result.png' });
  await page.screenshot({ path: OUT + '/6-mobile-full.png', fullPage: true });
  check('no horizontal scroll after result', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.close();

  console.log('returning visitor (resume link) + reduced motion');
  const tok = M.books[S.props.SHEET_ID].sheets.Readers.data[1][11];
  page = await newPage({ viewport: { width: 1024, height: 800 }, reducedMotion: 'reduce' }, { resume: { id: M.books[S.props.SHEET_ID].sheets.Readers.data[1][0], token: tok, name: 'Anna' } });
  await page.waitForSelector('#wheel text');
  check('resume banner greets by first name', /Welcome back, Anna/.test(await page.textContent('#resume')));
  const anim = await page.$eval('#wheel .ring', e => getComputedStyle(e).animationName); check('reduced motion: no draw animation', anim === 'none');
  const b4 = M.books[S.props.SHEET_ID].sheets.Orders.data.length; await page.locator('.plan button').nth(1).click(); await page.waitForURL(/paypal\.com/, { timeout: 8000 }).catch(() => {});
  check('returning visitor can buy without re-entering details', M.books[S.props.SHEET_ID].sheets.Orders.data.length === b4 + 1);
  await page.close();

  console.log('purchase before free reading is redirected to the form');
  page = await newPage({ viewport: { width: 1280, height: 900 } }); await page.waitForSelector('#wheel text');
  await page.locator('.plan button').first().click();
  check('asks to start with the free reading', /free reading/i.test(await page.textContent('#status')));
  await page.close();

  check('no JavaScript errors in any page', errors.length === 0, errors.join(' | '));
  await browser.close(); console.log(`\n${pass} passed, ${fail} failed\nScreenshots: ${OUT}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
