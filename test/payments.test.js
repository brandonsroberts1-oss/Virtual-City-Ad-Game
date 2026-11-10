import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, Client, SHOP } from './helpers.js';
import { createPayments, signWebhook } from '../server/payments.js';

// These tests stand in for Stripe with a fake HTTP client: they check that we
// ask for the right checkout, hold the lot while the buyer pays, and only
// build once a correctly signed "paid" webhook arrives.

const ENV = { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_test', PUBLIC_URL: 'https://island.test/' };
const calls = [];
let fail = false;
const expired = [];
const fakeFetch = async (url, opts) => {
  if (url.endsWith('/expire')) {
    expired.push(url);
    return { ok: true, json: async () => ({}) };
  }
  calls.push({ url, opts, form: new URLSearchParams(opts.body) });
  if (fail) return { ok: false, json: async () => ({ error: { message: 'Your card was declined.' } }) };
  const n = calls.length;
  return { ok: true, json: async () => ({ id: `cs_test_${n}`, url: `https://checkout.stripe.test/pay/cs_test_${n}` }) };
};

let app;
before(async () => {
  app = await startApp(ENV, fakeFetch);
});
after(() => app.close());

const webhook = (c, event, header) => {
  const raw = JSON.stringify(event);
  return c.request('POST', '/api/stripe/webhook', raw, { 'content-type': 'application/json', 'stripe-signature': header ?? signWebhook(raw, ENV.STRIPE_WEBHOOK_SECRET) });
};
const paid = (orderId, sessionId = 'cs_test_1') => ({ type: 'checkout.session.completed', data: { object: { id: sessionId, client_reference_id: orderId, payment_status: 'paid' } } });

test('demo mode is the default and approves instantly', async () => {
  const demo = createPayments({});
  assert.equal(demo.mode, 'demo');
  assert.deepEqual(await demo.start({ id: 'x', amount_cents: 100 }, {}), { status: 'paid', ref: 'demo' });
});

test('webhook signatures are checked', () => {
  const stripe = createPayments(ENV, fakeFetch);
  const raw = JSON.stringify({ type: 'ping' });
  assert.deepEqual(stripe.parseWebhook(raw, signWebhook(raw, ENV.STRIPE_WEBHOOK_SECRET)), { type: 'ping' });
  assert.throws(() => stripe.parseWebhook(raw, signWebhook(raw, 'whsec_wrong')), /does not match/);
  assert.throws(() => stripe.parseWebhook(`${raw} `, signWebhook(raw, ENV.STRIPE_WEBHOOK_SECRET)), /does not match/);
  assert.throws(() => stripe.parseWebhook(raw, signWebhook(raw, ENV.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600)), /tolerance/);
  assert.throws(() => stripe.parseWebhook(raw, ''), /Malformed/);
});

test('a purchase is held during checkout and built only after a signed "paid" webhook', async () => {
  const buyer = new Client(app.base);
  await buyer.register('Summit Analytics', 'summit@example.com');
  const start = await buyer.post('/api/properties', { ...SHOP, x: 14, y: 44, name: 'Summit Analytics' });
  assert.equal(start.status, 200);
  assert.equal(start.json.status, 'redirect');
  assert.match(start.json.url, /^https:\/\/checkout\.stripe\.test\//);
  const orderId = start.json.orderId;

  // what we asked Stripe for
  const call = calls.at(-1);
  assert.equal(call.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(call.opts.headers.Authorization, 'Bearer sk_test_123');
  assert.equal(call.form.get('line_items[0][price_data][unit_amount]'), '9500');
  assert.equal(call.form.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(call.form.get('client_reference_id'), orderId);
  assert.equal(call.form.get('success_url'), `https://island.test/?order=${orderId}`);
  assert.equal(call.form.get('customer_email'), 'summit@example.com');

  // nothing is built yet, but nobody else can take the lot
  assert.equal((await buyer.get('/api/state')).json.properties.length, 0);
  assert.equal((await buyer.get(`/api/orders/${orderId}`)).json.status, 'pending');
  const rival = new Client(app.base);
  await rival.register('Rival');
  assert.equal((await rival.post('/api/properties', { ...SHOP, x: 14, y: 44, name: 'Rival' })).status, 409);

  // forged and unpaid webhooks do nothing
  assert.equal((await webhook(rival, paid(orderId), 't=1,v1=deadbeef')).status, 400);
  await webhook(rival, { type: 'checkout.session.completed', data: { object: { client_reference_id: orderId, payment_status: 'unpaid' } } });
  assert.equal((await buyer.get('/api/state')).json.properties.length, 0);

  // the real one builds it, and replays are harmless
  assert.equal((await webhook(rival, paid(orderId))).status, 200);
  assert.equal((await webhook(rival, paid(orderId))).status, 200);
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
  const first = (await a.post('/api/properties', { ...SHOP, x: 20, y: 44, name: 'First' })).json;
  assert.equal((await b.post('/api/properties', { ...SHOP, x: 20, y: 44, name: 'Second' })).status, 409);
  await a.post(`/api/orders/${first.orderId}/cancel`);
  assert.match(expired.at(-1), /checkout\/sessions\/cs_test_\d+\/expire$/, 'the hosted checkout page is closed too');
  const second = (await b.post('/api/properties', { ...SHOP, x: 20, y: 44, name: 'Second' })).json;
  assert.equal(second.status, 'redirect');
  await webhook(b, { type: 'checkout.session.expired', data: { object: { client_reference_id: second.orderId } } });
  assert.equal((await b.get(`/api/orders/${second.orderId}`)).json.status, 'expired');
  assert.equal((await a.post('/api/properties', { ...SHOP, x: 20, y: 44, name: 'First again' })).json.status, 'redirect');
  // Money arriving late for the cancelled order, after someone else has the
  // lot on hold: nothing is built and the order is flagged for a refund.
  await webhook(a, paid(first.orderId, 'cs_late'));
  assert.equal((await a.get('/api/state')).json.properties.filter((p) => p.x === 20).length, 0);
  assert.equal((await a.get(`/api/orders/${first.orderId}`)).json.status, 'conflict');
});

test('a late payment on a cancelled checkout is still honoured if the lot is free', async () => {
  const c = new Client(app.base);
  await c.register('Changed My Mind');
  const start = (await c.post('/api/properties', { ...SHOP, x: 26, y: 44, name: 'Late Payer' })).json;
  await c.post(`/api/orders/${start.orderId}/cancel`);
  assert.equal((await c.get(`/api/orders/${start.orderId}`)).json.status, 'cancelled');
  await webhook(c, paid(start.orderId, 'cs_back_button'));
  const order = (await c.get(`/api/orders/${start.orderId}`)).json;
  assert.equal(order.status, 'paid');
  assert.equal(order.property.name, 'Late Payer');
});

test('donations use the same checkout, and provider errors are reported', async () => {
  const c = new Client(app.base);
  const gift = await c.post('/api/donations', { civicId: 'school', amountCents: 2500, donorName: 'Priya' });
  assert.equal(gift.json.status, 'redirect');
  assert.equal(calls.at(-1).form.get('line_items[0][price_data][unit_amount]'), '2500');
  assert.equal((await c.get('/api/civics/school')).json.totalCents, 0);
  await webhook(c, paid(gift.json.orderId, 'cs_gift'));
  assert.equal((await c.get('/api/civics/school')).json.totalCents, 2500);

  fail = true;
  const declined = await c.post('/api/donations', { civicId: 'school', amountCents: 2500 });
  fail = false;
  assert.equal(declined.status, 502);
  assert.match(declined.json.error, /could not start the checkout/);
  assert.doesNotMatch(declined.json.error, /declined/, 'provider wording stays in the server log');
  assert.equal((await c.get('/api/civics/school')).json.totalCents, 2500);
});
