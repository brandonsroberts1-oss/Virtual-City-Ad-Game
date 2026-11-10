// Entry point: open the database, pick the payment provider, start listening.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createPayments } from './payments.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const db = openDb(path.join(dataDir, 'island.db'));
const payments = createPayments(process.env);
const app = createApp({ db, payments, env: process.env });

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Brand Island is running at http://localhost:${port}`);
  console.log(`Payments: ${payments.mode === 'demo' ? 'DEMO MODE (no real charges)' : 'Stripe Checkout'}`);
  if (payments.mode === 'stripe' && !process.env.PUBLIC_URL) {
    console.warn('Warning: set PUBLIC_URL (e.g. https://your-site.com) so Stripe can send buyers back after paying.');
  }
});
