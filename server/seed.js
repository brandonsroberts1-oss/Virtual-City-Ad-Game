// Adds or removes the made-up sample data from the command line.
//
//   npm run seed            add the samples (does nothing if they exist)
//   npm run seed -- --clear remove them again

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { addSamples, clearSamples } from './samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(path.join(process.env.DATA_DIR || path.join(root, 'data'), 'island.db'));

if (process.argv.includes('--clear')) {
  console.log(`Removed ${clearSamples(db)} sample accounts and everything they owned.`);
} else {
  const out = await addSamples(db);
  if (out.already) console.log('Sample data is already there. Run "npm run seed -- --clear" to remove it.');
  else console.log(`Added ${out.properties} sample properties and ${out.donations} sample donations.`);
}
