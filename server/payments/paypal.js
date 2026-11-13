// PayPal Checkout (Orders API v2): the buyer approves the payment on PayPal,
// comes back, and the site captures it.
//
// Needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. Set PAYPAL_ENV=sandbox to
// use PayPal's test system. No webhook is needed: the site asks PayPal about
// each payment when the buyer returns and again every minute.

export function paypal(env, fetchImpl) {
  const id = env.PAYPAL_CLIENT_ID;
  const secret = env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const base = String(env.PAYPAL_ENV || 'live').toLowerCase() === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  let token = null;
  let tokenExpires = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExpires) return token;
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error(json.error_description || 'PayPal did not accept the client id and secret.');
    token = json.access_token;
    tokenExpires = Date.now() + Math.max(60, (json.expires_in || 300) - 60) * 1000;
    return token;
  }

  async function call(method, path, body, requestId) {
    const headers = { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' };
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.error_description || `PayPal error ${res.status}`);
    return json;
  }

  const captured = (json) => json.status === 'COMPLETED' && (json.purchase_units || []).every((u) => (u.payments?.captures || []).every((c) => c.status === 'COMPLETED'));

  return {
    id: 'paypal',
    mode: 'paypal',
    label: 'PayPal',

    async start(order, { description, successUrl, cancelUrl }) {
      const json = await call(
        'POST',
        '/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [{ reference_id: order.id, custom_id: order.id, description: description.slice(0, 127), amount: { currency_code: 'USD', value: (order.amount_cents / 100).toFixed(2) } }],
          payment_source: { paypal: { experience_context: { return_url: successUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' } } },
        },
        order.id,
      );
      const link = (json.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
      if (!json.id || !link) throw new Error('PayPal did not return a payment page.');
      return { status: 'redirect', url: link.href, ref: json.id };
    },

    async check(order) {
      if (!order.provider_ref) return 'pending';
      const ref = encodeURIComponent(order.provider_ref);
      const json = await call('GET', `/v2/checkout/orders/${ref}`);
      if (captured(json)) return 'paid';
      if (json.status === 'VOIDED') return 'failed';
      if (json.status !== 'APPROVED') return 'pending';
      // the buyer has approved it: take the money
      const done = await call('POST', `/v2/checkout/orders/${ref}/capture`, {}, `${order.id}-capture`);
      return captured(done) ? 'paid' : 'pending';
    },
  };
}
