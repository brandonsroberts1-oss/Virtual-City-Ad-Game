// Stripe Checkout: the buyer pays on Stripe's hosted page.
//
// Only STRIPE_SECRET_KEY is needed. The site asks Stripe whether a checkout
// was paid when the buyer returns (and again every minute for stragglers), so
// a webhook is optional; if STRIPE_WEBHOOK_SECRET is set, notifications sent
// to /api/payments/webhook are accepted too and make confirmation instant.

import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1/checkout/sessions';
const WEBHOOK_TOLERANCE_S = 300;
const HOLD_MINUTES = 31; // Stripe's minimum lifetime for a checkout page is 30 minutes

export function stripe(env, fetchImpl) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
  const auth = { Authorization: `Bearer ${key}` };

  // Verify the Stripe-Signature header and return the parsed event.
  function parseWebhook(rawBody, signatureHeader, now = Date.now()) {
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
  }

  return {
    id: 'stripe',
    mode: 'stripe',
    label: 'Stripe',

    async start(order, { description, successUrl, cancelUrl, email }) {
      const form = new URLSearchParams({
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: order.id,
        expires_at: String(Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60),
        'metadata[order_id]': order.id,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(order.amount_cents),
        'line_items[0][price_data][product_data][name]': description,
      });
      if (email) form.set('customer_email', email);
      const res = await fetchImpl(API, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': order.id },
        body: form.toString(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json?.error?.message || 'Stripe rejected the checkout.');
      return { status: 'redirect', url: json.url, ref: json.id };
    },

    async check(order) {
      if (!order.provider_ref) return 'pending';
      const res = await fetchImpl(`${API}/${encodeURIComponent(order.provider_ref)}`, { headers: auth });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Stripe could not be reached.');
      if (json.payment_status === 'paid') return 'paid';
      return json.status === 'expired' ? 'failed' : 'pending';
    },

    // Best effort: expire a checkout page the buyer walked away from.
    async cancel(sessionId) {
      try {
        await fetchImpl(`${API}/${encodeURIComponent(sessionId)}/expire`, { method: 'POST', headers: auth });
      } catch {
        // if this fails the session simply expires on its own later
      }
    },

    parseWebhook,

    webhook(rawBody, headers) {
      const event = parseWebhook(rawBody, headers['stripe-signature']);
      const session = event?.data?.object || {};
      const orderId = session.client_reference_id || session.metadata?.order_id || null;
      const paid = (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid';
      const status = paid ? 'paid' : event.type === 'checkout.session.expired' ? 'expired' : 'ignored';
      return { orderId, ref: session.id || null, status };
    },
  };
}

// Used by tests (and handy for local webhook experiments).
export function signWebhook(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
