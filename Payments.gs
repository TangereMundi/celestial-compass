/**
 * Payments.gs — PayPal Orders v2 (server-side, redirect flow).
 *
 * Flow:  page -> startCheckout() creates an order on PayPal -> visitor approves on paypal.com
 *        -> PayPal redirects to  <web app URL>?pp=return&o=<our order>&token=<paypal order>
 *        -> captureAndFulfil_() captures the money, verifies amount + currency, marks the order
 *           paid and sends the first delivery.
 * Prices come from PLANS on the server; nothing the browser sends can change the amount.
 * If a visitor approves but never returns, no money is taken (the order is only captured here).
 *
 * To add Stripe later: add a second provider with the same two functions (create / capture) and
 * let the page choose; the Orders sheet already has a generic status + paypalOrderId column.
 */

function paypalBase_() { return prop_('PAYPAL_MODE', 'sandbox') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }

function paypalToken_() {
  var cache = CacheService.getScriptCache(), key = 'pp_token_' + prop_('PAYPAL_MODE', 'sandbox'), t = cache.get(key);
  if (t) return t;
  var id = prop_('PAYPAL_CLIENT_ID', ''), secret = prop_('PAYPAL_SECRET', '');
  if (!id || !secret) throw new Error('PayPal is not configured (set PAYPAL_CLIENT_ID and PAYPAL_SECRET in Script properties).');
  var res = UrlFetchApp.fetch(paypalBase_() + '/v1/oauth2/token', {
    method: 'post', payload: 'grant_type=client_credentials', muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) }
  });
  var j = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200 || !j.access_token) throw new Error('PayPal auth failed: ' + res.getResponseCode());
  cache.put(key, j.access_token, Math.max(60, Math.min(21000, (j.expires_in || 3600) - 300)));
  return j.access_token;
}

function paypalCall_(method, path, body, requestId) {
  var headers = { Authorization: 'Bearer ' + paypalToken_(), 'Content-Type': 'application/json' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  var res = UrlFetchApp.fetch(paypalBase_() + path, { method: method, headers: headers, payload: body ? JSON.stringify(body) : undefined, muteHttpExceptions: true });
  var text = res.getContentText(), json = {};
  try { json = JSON.parse(text); } catch (e) { /* non-JSON error body */ }
  return { code: res.getResponseCode(), json: json, text: text };
}

/** Called from the page. Returns {ok, approveUrl} or {ok:false, error}. */
function startCheckout(readerId, token, planId) {
  var plan = PLANS[planId], reader = findReader_(String(readerId));
  if (!plan || !reader || reader.token !== token) return { ok: false, error: 'Please request your free reading first, then choose a plan.' };
  var orderId = newId_(), amount = plan.price, cur = currency_(), base = execUrl_();
  var body = {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: orderId, custom_id: orderId, description: siteName_() + ': ' + plan.name, amount: { currency_code: cur, value: amount } }],
    payment_source: { paypal: { experience_context: {
      brand_name: siteName_().slice(0, 127), user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', landing_page: 'LOGIN',
      return_url: base + (base.indexOf('?') > -1 ? '&' : '?') + 'pp=return&o=' + orderId,
      cancel_url: base + (base.indexOf('?') > -1 ? '&' : '?') + 'pp=cancel&o=' + orderId
    } } }
  };
  var r;
  try { r = paypalCall_('post', '/v2/checkout/orders', body, orderId); } catch (e) { log_('paypal create error', e.message); return { ok: false, error: 'Payments are not available right now. Please try again later.' }; }
  if (r.code !== 200 && r.code !== 201) { log_('paypal create failed', r.code + ' ' + r.text); return { ok: false, error: 'PayPal could not start the payment. Please try again.' }; }
  var link = (r.json.links || []).filter(function (l) { return l.rel === 'payer-action' || l.rel === 'approve'; })[0];
  if (!link) { log_('paypal no approve link', r.text); return { ok: false, error: 'PayPal did not return a payment link.' }; }
  withLock_(function () {
    appendRow_('Orders', ORDER_HEADERS, { orderId: orderId, readerId: reader.id, plan: plan.id, amount: amount, currency: cur, status: 'CREATED', paypalOrderId: r.json.id, createdAt: new Date() });
  });
  return { ok: true, approveUrl: link.href };
}

/** Handles the redirect back from PayPal. Returns {title, body, extra} for pageMessage_. */
function captureAndFulfil_(orderId, paypalToken) {
  var order = withLock_(function () { return findOrder_(String(orderId || '')); });
  if (!order || !paypalToken || order.paypalOrderId !== paypalToken) return { title: 'Payment not found', body: 'We could not match this payment to an order. If you were charged, please contact us.' };
  if (order.status !== 'CREATED') return { title: 'Payment received', body: 'This payment was already confirmed. Check your inbox for your guidance.' };

  var plan = PLANS[order.plan];
  var r = paypalCall_('post', '/v2/checkout/orders/' + encodeURIComponent(order.paypalOrderId) + '/capture', {}, 'cap-' + order.orderId);
  var status = r.json && r.json.status;
  if (r.code === 422 && /ORDER_ALREADY_CAPTURED/.test(r.text)) { // retried redirect: fetch and verify instead
    r = paypalCall_('get', '/v2/checkout/orders/' + encodeURIComponent(order.paypalOrderId));
    status = r.json && r.json.status;
  }
  if (status !== 'COMPLETED') {
    log_('capture not completed', order.orderId + ' ' + r.code + ' ' + r.text);
    setCells_('Orders', ORDER_HEADERS, order._row, { notes: 'capture failed: ' + r.code });
    return { title: 'Payment not completed', body: 'PayPal did not complete the payment, so nothing was charged. You can try again, or use a different payment method.' };
  }
  var pu = (r.json.purchase_units || [])[0] || {}, cap = ((pu.payments || {}).captures || [])[0] || {};
  var amt = cap.amount || {};
  if (cap.status !== 'COMPLETED' || String(amt.value) !== String(order.amount) || amt.currency_code !== order.currency) {
    log_('capture mismatch', order.orderId + ' ' + JSON.stringify(amt) + ' status ' + cap.status);
    setCells_('Orders', ORDER_HEADERS, order._row, { status: 'REVIEW', notes: 'amount/status mismatch: ' + JSON.stringify(amt) });
    return { title: 'We are checking your payment', body: 'Your payment needs a quick manual check. We will email you shortly.' };
  }

  var manual = plan.cadence === 'manual', today = dateStr_(new Date());
  setCells_('Orders', ORDER_HEADERS, order._row, {
    status: manual ? 'AWAITING_VIDEO' : 'ACTIVE', paidAt: new Date(), remaining: plan.count, nextSendDate: manual ? '' : today,
    notes: 'capture ' + (cap.id || '')
  });
  var reader = findReader_(order.readerId), msg;
  try {
    var fresh = findOrder_(order.orderId);
    if (manual) {
      sendMail_(reader, 'We received your order', { title: 'Thank you', sections: [{ h: 'Your spoken chart video', p: ['Thank you, ' + String(reader.name).split(' ')[0] + '. Your payment was received and your video is being prepared. It will arrive by email within 7 days.'] }] });
      var admin = prop_('ADMIN_EMAIL', '');
      if (admin) MailApp.sendEmail(admin, 'New video order: ' + reader.name, 'Order ' + order.orderId + '\nName: ' + reader.name + '\nEmail: ' + reader.email + '\nBorn: ' + reader.birthDate + ' ' + reader.birthTime + ' ' + reader.place + '\n\nOpen the Orders sheet, paste the video link in videoUrl, select the row and use Astro admin > Send video link.');
    } else {
      deliverOrder_(fresh, reader); // first guidance goes out immediately
    }
  } catch (e) { log_('post-payment delivery error', order.orderId + ' ' + e.message); }
  return {
    home: resumeUrl_(reader.token),
    title: 'Thank you, your payment is complete',
    body: manual ? 'Your spoken chart video is being prepared and will reach your inbox within 7 days.' : 'Your first ' + plan.name.toLowerCase() + ' is on its way to ' + reader.email + '.',
    extra: manual ? '' : (plan.cadence === 'once' ? '' : 'Following guidance arrives automatically on schedule.')
  };
}
