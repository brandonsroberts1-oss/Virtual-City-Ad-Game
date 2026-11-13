import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, Client, SHOP } from './helpers.js';
import { createPayments, signWebhook } from '../server/payments/index.js';

// These tests stand in for the payment processors with fake HTTP clients:
// they check that we ask for the right checkout, hold the lot while the buyer
// pays, and build only once the processor says the money has arrived.

// ---------------------------------------------------------------- a fake Stripe
function fakeStripe() {
  const f = { created: [], expired: [], sessions: new Map(), fail: false };
  f.fetch = async (url, opts = {}) => {
    const reply = (ok, body) => ({ ok, status: ok ? 200 : 400, json: async () => body });
    if (url.endsWith('/expire')) {
      f.expired.push(url);
      return reply(true, {});
    }
    if ((opts.method || 'GET') === 'GET') {
      const id = decodeURIComponent(url.split('/').pop());
      return reply(true, f.sessions.get(id) || { payment_status: 'unpaid', status: 'open' });
    }
    if (f.fail) return reply(false, { error: { message: 'No such price.' } });
    const form = new URLSearchParams(opts.body);
    const id = `cs_test_${f.created.length + 1}`;
    f.created.push({ url, opts, form, id });
    f.sessions.set(id, { payment_status: 'unpaid', status: 'open' });
    return reply(true, { id, url: `https://checkout.stripe.test/pay/${id}` });
  };
  f.pay = (id) => f.sessions.set(id, { payment_status: 'paid', status: 'complete' });
  f.lapse = (id) => f.sessions.set(id, { payment_status: 'unpaid', status: 'expired' });
  return f;
}

const KEY_ONLY = { STRIPE_SECRET_KEY: 'sk_test_123', PUBLIC_URL: 'https://island.test/' };
const WITH_WEBHOOK = { ...KEY_ONLY, STRIPE_WEBHOOK_SECRET: 'whsec_test' };

let stripe;
let app;
before(async () => {
  stripe = fakeStripe();
  app = await startApp(WITH_WEBHOOK, stripe.fetch);
});
after(() => app.close());

const webhook = (c, event, header, path = '/api/payments/webhook') => {
  const raw = JSON.stringify(event);
  return c.request('POST', path, raw, { 'content-type': 'application/json', 'stripe-signature': header ?? signWebhook(raw, WITH_WEBHOOK.STRIPE_WEBHOOK_SECRET) });
};
const paid = (orderId, sessionId) => ({ type: 'checkout.session.completed', data: { object: { id: sessionId, client_reference_id: orderId, payment_status: 'paid' } } });

test('the processor is chosen from the keys that are set', async () => {
  const demo = createPayments({});
  assert.equal(demo.mode, 'demo');
  assert.deepEqual(await demo.start({ id: 'x', amount_cents: 100 }, {}), { status: 'paid', ref: 'demo' });
  assert.equal(createPayments({ STRIPE_SECRET_KEY: 'sk' }).id, 'stripe');
  assert.equal(createPayments({ PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' }).id, 'paypal');
  assert.equal(createPayments({ PAYPAL_CLIENT_ID: 'a' }).id, 'demo', 'half a set of keys is not enough');
  // with both configured, PAYMENT_PROVIDER decides
  const both = { STRIPE_SECRET_KEY: 'sk', PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' };
  assert.equal(createPayments(both).id, 'stripe');
  assert.equal(createPayments({ ...both, PAYMENT_PROVIDER: 'paypal' }).id, 'paypal');
  assert.equal(createPayments({ ...both, PAYMENT_PROVIDER: 'demo' }).id, 'demo');
  assert.throws(() => createPayments({ PAYMENT_PROVIDER: 'bitcoin' }), /Unknown PAYMENT_PROVIDER/);
  assert.throws(() => createPayments({ PAYMENT_PROVIDER: 'stripe' }), /keys are not set/);
});

test('webhook signatures are checked', () => {
  const p = createPayments(WITH_WEBHOOK, stripe.fetch);
  const raw = JSON.stringify({ type: 'ping' });
  assert.deepEqual(p.parseWebhook(raw, signWebhook(raw, 'whsec_test')), { type: 'ping' });
  assert.throws(() => p.parseWebhook(raw, signWebhook(raw, 'whsec_wrong')), /does not match/);
  assert.throws(() => p.parseWebhook(`${raw} `, signWebhook(raw, 'whsec_test')), /does not match/);
  assert.throws(() => p.parseWebhook(raw, signWebhook(raw, 'whsec_test', Math.floor(Date.now() / 1000) - 3600)), /tolerance/);
  assert.throws(() => p.parseWebhook(raw, ''), /Malformed/);
});

test('a purchase is held during checkout and built only after a signed "paid" webhook', async () => {
  const buyer = new Client(app.base);
  await buyer.register('Summit Analytics', 'summit@example.com');
  const start = await buyer.post('/api/properties', { ...SHOP, x: 20, y: 99, name: 'Summit Analytics' });
  assert.equal(start.status, 200);
  assert.equal(start.json.status, 'redirect');
  assert.match(start.json.url, /^https:\/\/checkout\.stripe\.test\//);
  const orderId = start.json.orderId;

  // what we asked Stripe for
  const call = stripe.created.at(-1);
  assert.equal(call.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(call.opts.headers.Authorization, 'Bearer sk_test_123');
  assert.equal(call.form.get('line_items[0][price_data][unit_amount]'), '9500');
  assert.equal(call.form.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(call.form.get('client_reference_id'), orderId);
  assert.equal(call.form.get('success_url'), `https://island.test/?order=${orderId}`);
  assert.equal(call.form.get('customer_email'), 'summit@example.com');
  const life = Number(call.form.get('expires_at')) - Date.now() / 1000;
  assert.ok(life > 30 * 60 && life < 33 * 60, 'the payment page closes when our hold on the lot does');

  // nothing is built yet, but nobody else can take the lot
  assert.equal((await buyer.get('/api/state')).json.properties.length, 0);
  assert.equal((await buyer.get(`/api/orders/${orderId}`)).json.status, 'pending');
  const rival = new Client(app.base);
  await rival.register('Rival');
  assert.equal((await rival.post('/api/properties', { ...SHOP, x: 20, y: 99, name: 'Rival' })).status, 409);

  // forged and unpaid notifications do nothing
  assert.equal((await webhook(rival, paid(orderId, call.id), 't=1,v1=deadbeef')).status, 400);
  await webhook(rival, { type: 'checkout.session.completed', data: { object: { client_reference_id: orderId, payment_status: 'unpaid' } } });
  assert.equal((await buyer.get('/api/state')).json.properties.length, 0);

  // the real one builds it, replays are harmless, and the older address still works
  assert.equal((await webhook(rival, paid(orderId, call.id))).status, 200);
  assert.equal((await webhook(rival, paid(orderId, call.id), undefined, '/api/stripe/webhook')).status, 200);
  const state = (await buyer.get('/api/state')).json;
  assert.equal(state.properties.length, 1);
  assert.equal(state.properties[0].name, 'Summit Analytics');
  const order = (await buyer.get(`/api/orders/${orderId}`)).json;
  assert.equal(order.status, 'paid');
  assert.equal(order.property.id, state.properties[0].id);
});

test('an abandoned or expired checkout frees the lot again', async () => {
  const a = new Client(app.base);
  const b = new Client(app.base);
  await a.register('First Buyer');
  await b.register('Second Buyer');
  const first = (await a.post('/api/properties', { ...SHOP, x: 40, y: 99, name: 'First' })).json;
  assert.equal((await b.post('/api/properties', { ...SHOP, x: 40, y: 99, name: 'Second' })).status, 409);
  await a.post(`/api/orders/${first.orderId}/cancel`);
  assert.match(stripe.expired.at(-1), /checkout\/sessions\/cs_test_\d+\/expire$/, 'the hosted checkout page is closed too');
  const second = (await b.post('/api/properties', { ...SHOP, x: 40, y: 99, name: 'Second' })).json;
  assert.equal(second.status, 'redirect');
  await webhook(b, { type: 'checkout.session.expired', data: { object: { client_reference_id: second.orderId } } });
  assert.equal((await b.get(`/api/orders/${second.orderId}`)).json.status, 'expired');
  assert.equal((await a.post('/api/properties', { ...SHOP, x: 40, y: 99, name: 'First again' })).json.status, 'redirect');
  // Money arriving late for the cancelled order, after someone else has the
  // lot on hold: nothing is built and the order is flagged for a refund.
  await webhook(a, paid(first.orderId, 'cs_late'));
  assert.equal((await a.get('/api/state')).json.properties.filter((p) => p.x === 40).length, 0);
  assert.equal((await a.get(`/api/orders/${first.orderId}`)).json.status, 'conflict');
});

test('a late payment on a cancelled checkout is still honoured if the lot is free', async () => {
  const c = new Client(app.base);
  await c.register('Changed My Mind');
  const start = (await c.post('/api/properties', { ...SHOP, x: 46, y: 99, name: 'Late Payer' })).json;
  await c.post(`/api/orders/${start.orderId}/cancel`);
  assert.equal((await c.get(`/api/orders/${start.orderId}`)).json.status, 'cancelled');
  await webhook(c, paid(start.orderId, 'cs_back_button'));
  const order = (await c.get(`/api/orders/${start.orderId}`)).json;
  assert.equal(order.status, 'paid');
  assert.equal(order.property.name, 'Late Payer');
});

test('donations use the same checkout, and processor errors stay out of sight', async () => {
  const c = new Client(app.base);
  const gift = await c.post('/api/donations', { civicId: 'school', amountCents: 2500, donorName: 'Priya' });
  assert.equal(gift.json.status, 'redirect');
  assert.equal(stripe.created.at(-1).form.get('line_items[0][price_data][unit_amount]'), '2500');
  assert.equal((await c.get('/api/civics/school')).json.totalCents, 0);
  await webhook(c, paid(gift.json.orderId, 'cs_gift'));
  assert.equal((await c.get('/api/civics/school')).json.totalCents, 2500);

  stripe.fail = true;
  const failed = await c.post('/api/donations', { civicId: 'school', amountCents: 2500 });
  stripe.fail = false;
  assert.equal(failed.status, 502);
  assert.match(failed.json.error, /could not start the checkout/);
  assert.doesNotMatch(failed.json.error, /No such price/, 'processor wording stays in the server log');
  assert.equal((await c.get('/api/civics/school')).json.totalCents, 2500);
});

test('Stripe works with the secret key alone: paid checkouts are found by asking Stripe', async () => {
  const s = fakeStripe();
  const site = await startApp(KEY_ONLY, s.fetch);
  try {
    const cfg = (await new Client(site.base).get('/api/config')).json;
    assert.equal(cfg.payments, 'stripe');
    assert.equal(cfg.paymentLabel, 'Stripe');

    const buyer = new Client(site.base);
    await buyer.register('Key Only');
    const start = (await buyer.post('/api/properties', { ...SHOP, x: 20, y: 99, name: 'Key Only Shop' })).json;
    assert.equal((await buyer.get(`/api/orders/${start.orderId}`)).json.status, 'pending');
    // without a webhook secret, pushed notifications are refused
    assert.equal((await webhook(buyer, paid(start.orderId, 'cs_test_1'))).status, 400);

    // the buyer pays on Stripe and comes back: the site asks Stripe and builds
    s.pay('cs_test_1');
    const back = (await buyer.get(`/api/orders/${start.orderId}`)).json;
    assert.equal(back.status, 'paid');
    assert.equal(back.property.name, 'Key Only Shop');

    // a buyer who pays but never comes back is picked up by the sweep
    const gift = (await buyer.post('/api/donations', { civicId: 'hospital', amountCents: 4200, donorName: 'Closed The Tab' })).json;
    s.pay('cs_test_2');
    site.db.prepare('UPDATE orders SET created_at = created_at - 60000 WHERE id = ?').run(gift.orderId);
    await site.app.locals.sweep();
    assert.equal((await buyer.get('/api/civics/hospital')).json.totalCents, 4200);

    // a checkout that lapses unpaid is released by the sweep
    const stale = (await buyer.post('/api/properties', { ...SHOP, x: 30, y: 99, name: 'Never Paid' })).json;
    s.lapse('cs_test_3');
    site.db.prepare('UPDATE orders SET created_at = created_at - 60000 WHERE id = ?').run(stale.orderId);
    await site.app.locals.sweep();
    assert.equal((await buyer.get(`/api/orders/${stale.orderId}`)).json.status, 'expired');
    assert.equal((await buyer.post('/api/quote', { ...SHOP, x: 30, y: 99 })).status, 200, 'the lot is for sale again');
  } finally {
    await site.close();
  }
});

// ---------------------------------------------------------------- a fake PayPal
function fakePayPal() {
  const f = { calls: [], orders: new Map() };
  f.fetch = async (url, opts = {}) => {
    const reply = (ok, body) => ({ ok, status: ok ? 200 : 400, json: async () => body });
    const method = opts.method || 'GET';
    f.calls.push({ url, method, headers: opts.headers, body: opts.body });
    if (url.endsWith('/v1/oauth2/token')) return reply(true, { access_token: 'tok_1', expires_in: 3600 });
    if (method === 'POST' && url.endsWith('/v2/checkout/orders')) {
      const id = `PP${f.orders.size + 1}`;
      f.orders.set(id, { id, status: 'PAYER_ACTION_REQUIRED', request: JSON.parse(opts.body) });
      return reply(true, { id, status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'self', href: 'x' }, { rel: 'payer-action', href: `https://paypal.test/checkoutnow?token=${id}` }] });
    }
    const m = /\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/.exec(url);
    const o = m && f.orders.get(m[1]);
    if (!o) return reply(false, { message: 'not found' });
    if (m[2]) {
      if (o.status !== 'APPROVED') return reply(false, { message: 'ORDER_NOT_APPROVED' });
      o.status = 'COMPLETED';
      return reply(true, { id: o.id, status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ status: 'COMPLETED' }] } }] });
    }
    return reply(true, { id: o.id, status: o.status });
  };
  return f;
}

test('PayPal: the buyer approves on PayPal, and the site captures the money when they return', async () => {
  const pp = fakePayPal();
  const site = await startApp({ PAYPAL_CLIENT_ID: 'client', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_ENV: 'sandbox', PUBLIC_URL: 'https://island.test' }, pp.fetch);
  try {
    assert.equal((await new Client(site.base).get('/api/config')).json.paymentLabel, 'PayPal');
    const buyer = new Client(site.base);
    await buyer.register('PayPal Buyer');
    const start = (await buyer.post('/api/properties', { ...SHOP, x: 20, y: 99, name: 'Paid With PayPal' })).json;
    assert.equal(start.status, 'redirect');
    assert.equal(start.url, 'https://paypal.test/checkoutnow?token=PP1');

    // what we asked PayPal for
    const token = pp.calls[0];
    assert.equal(token.url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
    assert.equal(token.headers.Authorization, `Basic ${Buffer.from('client:secret').toString('base64')}`);
    const req = pp.orders.get('PP1').request;
    assert.equal(req.intent, 'CAPTURE');
    assert.deepEqual(req.purchase_units[0].amount, { currency_code: 'USD', value: '95.00' });
    assert.equal(req.purchase_units[0].custom_id, start.orderId);
    assert.equal(req.payment_source.paypal.experience_context.return_url, `https://island.test/?order=${start.orderId}`);

    // not approved yet: still waiting, nothing built, nothing captured
    assert.equal((await buyer.get(`/api/orders/${start.orderId}`)).json.status, 'pending');
    assert.equal(pp.calls.filter((c) => c.url.endsWith('/capture')).length, 0);

    // approved: the next look captures it and builds
    pp.orders.get('PP1').status = 'APPROVED';
    const back = (await buyer.get(`/api/orders/${start.orderId}`)).json;
    assert.equal(back.status, 'paid');
    assert.equal(back.property.name, 'Paid With PayPal');
    assert.equal(pp.calls.filter((c) => c.url.endsWith('/capture')).length, 1);
    assert.equal(pp.calls.filter((c) => c.url.endsWith('/oauth2/token')).length, 1, 'the access token is reused');

    // a cancelled checkout is never captured, even if the buyer approves later
    const second = (await buyer.post('/api/properties', { ...SHOP, x: 30, y: 99, name: 'Cancelled' })).json;
    await buyer.post(`/api/orders/${second.orderId}/cancel`);
    pp.orders.get('PP2').status = 'APPROVED';
    await site.app.locals.sweep();
    assert.equal((await buyer.get(`/api/orders/${second.orderId}`)).json.status, 'cancelled');
    assert.equal(pp.calls.filter((c) => c.url.endsWith('/capture')).length, 1);
  } finally {
    await site.close();
  }
});
