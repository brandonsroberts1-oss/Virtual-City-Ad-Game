// Payment providers.
//
// "demo" (the default) approves every checkout instantly and moves no money,
// so the whole site can be tried end to end. Setting STRIPE_SECRET_KEY switches
// to Stripe Checkout: the buyer is redirected to Stripe's hosted payment page
// and the purchase is completed when Stripe calls our webhook.

import crypto from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions';
const WEBHOOK_TOLERANCE_S = 300;

export function createPayments(env = process.env, fetchImpl = globalThis.fetch) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      mode: 'demo',
      async start() {
        return { status: 'paid', ref: 'demo' };
      },
    };
  }
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
  return {
    mode: 'stripe',

    // Create a hosted checkout page for an order and return its URL.
    async start(order, { description, successUrl, cancelUrl, email }) {
      const form = new URLSearchParams({
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: order.id,
        'metadata[order_id]': order.id,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(order.amount_cents),
        'line_items[0][price_data][product_data][name]': description,
      });
      if (email) form.set('customer_email', email);
      const res = await fetchImpl(STRIPE_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': order.id,
        },
        body: form.toString(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json?.error?.message || 'The payment provider rejected the checkout.');
      return { status: 'redirect', url: json.url, ref: json.id };
    },

    // Verify the Stripe-Signature header and return the parsed event.
    // Throws if the signature is missing, wrong or too old.
    parseWebhook(rawBody, signatureHeader, now = Date.now()) {
      if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
      const parts = String(signatureHeader || '').split(',').map((p) => p.trim().split('='));
      const t = parts.find((p) => p[0] === 't')?.[1];
      const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
      if (!t || !sigs.length) throw new Error('Malformed signature header.');
      if (Math.abs(now / 1000 - Number(t)) > WEBHOOK_TOLERANCE_S) throw new Error('Webhook timestamp is outside the tolerance window.');
      const expected = crypto.createHmac('sha256', webhookSecret).update(`${t}.${rawBody}`).digest();
      const ok = sigs.some((s) => {
        const given = Buffer.from(s, 'hex');
        return given.length === expected.length && crypto.timingSafeEqual(given, expected);
      });
      if (!ok) throw new Error('Webhook signature does not match.');
      return JSON.parse(rawBody);
    },
  };
}

// Used by tests (and handy for local webhook experiments).
export function signWebhook(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
