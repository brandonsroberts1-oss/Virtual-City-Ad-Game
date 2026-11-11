// Entry point: open the database, pick the payment provider, start listening.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createPayments } from './payments.js';
import { createApp } from './app.js';
import { addSamples, clearSamples } from './samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const db = openDb(path.join(dataDir, 'island.db'));

// SAMPLE_DATA=on fills the island with made-up sample properties (handy for a
// preview site); SAMPLE_DATA=off removes them again. Unset leaves things alone.
const samples = (process.env.SAMPLE_DATA || '').toLowerCase();
if (samples === 'on') {
  const out = await addSamples(db);
  if (!out.already) console.log(`Sample data: added ${out.properties} properties and ${out.donations} donations.`);
} else if (samples === 'off') {
  const removed = clearSamples(db);
  if (removed) console.log(`Sample data: removed ${removed} sample accounts and everything they owned.`);
}

// Hosts such as Render tell us our public address; use it unless one is set.
const env = { ...process.env, PUBLIC_URL: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '' };
const payments = createPayments(env);
const app = createApp({ db, payments, env });

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Brand Island is running on port ${port}${env.PUBLIC_URL ? ` (${env.PUBLIC_URL})` : ` - http://localhost:${port}`}`);
  console.log(`Payments: ${payments.mode === 'demo' ? 'DEMO MODE (no real charges)' : 'Stripe Checkout'}`);
  if (payments.mode === 'stripe' && !env.PUBLIC_URL) {
    console.warn('Warning: set PUBLIC_URL (e.g. https://your-site.com) so Stripe can send buyers back after paying.');
  }
});

// Hosts stop a site by sending SIGTERM; finish up and close the database.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    setTimeout(() => process.exit(0), 5000).unref();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeIdleConnections?.();
  });
}
