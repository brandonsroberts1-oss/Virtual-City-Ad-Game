// Payment processors.
//
// Each processor is one small file in this folder that exports a function
// returning an object with this shape (only `start` is required):
//
//   id      short name, e.g. 'stripe'
//   label   what buyers see, e.g. 'Stripe'
//   start(order, { description, successUrl, cancelUrl, email })
//           Begin a payment for order.amount_cents (US cents). Return
//             { status: 'paid', ref }             if it is already settled, or
//             { status: 'redirect', url, ref }    to send the buyer to a hosted
//           payment page. `ref` is the processor's own id for the payment.
//   check(order)
//           Ask the processor about a payment that was started earlier
//           (order.provider_ref). Return 'paid', 'pending' or 'failed'. The
//           site calls this when the buyer comes back and again every minute
//           for anything still unpaid, so no webhook is needed.
//   cancel(ref)
//           Optional: close a payment page the buyer walked away from.
//   webhook(rawBody, headers)
//           Optional: verify a notification pushed by the processor and return
//           { orderId, ref, status: 'paid' | 'expired' | 'ignored' }.
//
// To add a processor: copy demo.js, fill in those functions, and add it to
// PROVIDERS below. It is picked automatically when its keys are present, or
// by setting PAYMENT_PROVIDER to its id.

import { demo } from './demo.js';
import { stripe } from './stripe.js';
import { paypal } from './paypal.js';

const PROVIDERS = { stripe, paypal, demo };

export function createPayments(env = process.env, fetchImpl = globalThis.fetch) {
  const wanted = String(env.PAYMENT_PROVIDER || '').toLowerCase();
  if (wanted) {
    if (!PROVIDERS[wanted]) throw new Error(`Unknown PAYMENT_PROVIDER "${wanted}". Choose one of: ${Object.keys(PROVIDERS).join(', ')}.`);
    const p = PROVIDERS[wanted](env, fetchImpl);
    if (!p) throw new Error(`PAYMENT_PROVIDER is "${wanted}" but its keys are not set.`);
    return p;
  }
  // otherwise use the first real processor whose keys are present
  for (const id of Object.keys(PROVIDERS)) {
    const p = PROVIDERS[id](env, fetchImpl);
    if (p) return p;
  }
  return demo();
}

export { signWebhook } from './stripe.js';
