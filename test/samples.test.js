import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { addSamples, clearSamples, hasSamples } from '../server/samples.js';
import { createWorld } from '../shared/world.js';
import { startApp, Client, SHOP } from './helpers.js';

test('sample data can be added once and removed without touching real owners', async () => {
  const db = openDb(':memory:');
  const world = createWorld();

  // a real owner is already on the island
  db.prepare("INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES ('real@example.com', 'Real Owner', 'x', 'y', 1)").run();
  db.prepare(
    "INSERT INTO properties (owner_id, type, style, tier, colour, floors, x, y, w, h, name, zone, land_cents, build_cents, value_cents, created_at) VALUES (1, 'shop', 'corner', 'standard', 'coral', 1, 14, 44, 1, 1, 'Real Shop', 'waterfront', 5000, 4500, 9500, 1)",
  ).run();
  db.prepare("INSERT INTO donations (charity, civic_id, user_id, donor_name, amount_cents, created_at) VALUES ('health', 'hospital', 1, 'Real Owner', 1234, 1)").run();

  assert.equal(hasSamples(db), false);
  const added = await addSamples(db);
  assert.ok(added.properties >= 30, `only ${added.properties} sample properties`);
  assert.equal(added.donations, 60);
  assert.equal(hasSamples(db), true);
  assert.equal((await addSamples(db)).already, true, 'adding twice does nothing');

  // nothing overlaps, and the real shop kept its lot
  const seen = new Set();
  for (const p of db.prepare('SELECT x, y, w, h FROM properties').all()) {
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        const i = world.ti(x, y);
        assert.ok(world.buildable[i], `sample on unbuildable tile ${x},${y}`);
        assert.ok(!seen.has(i), `two properties share tile ${x},${y}`);
        seen.add(i);
      }
    }
  }

  assert.ok(clearSamples(db) >= 30);
  assert.equal(hasSamples(db), false);
  assert.deepEqual(db.prepare('SELECT name FROM properties').all().map((r) => r.name), ['Real Shop']);
  assert.deepEqual(db.prepare('SELECT donor_name, amount_cents FROM donations').all().map((r) => [r.donor_name, r.amount_cents]), [['Real Owner', 1234]]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(clearSamples(db), 0, 'clearing twice does nothing');
});

test('a preview site says so, and sample lots cannot be bought over', async () => {
  const app = await startApp({ SAMPLE_DATA: 'on' });
  try {
    await addSamples(app.db);
    const c = new Client(app.base);
    assert.equal((await c.get('/api/config')).json.preview, true);
    const state = (await c.get('/api/state')).json;
    assert.ok(state.properties.length >= 30);
    await c.register('Late Arrival');
    const taken = state.properties[0];
    assert.equal((await c.post('/api/properties', { ...SHOP, x: taken.x, y: taken.y, name: 'Squatter' })).status, 409);
  } finally {
    await app.close();
  }
  const plain = await startApp();
  try {
    assert.equal((await new Client(plain.base).get('/api/config')).json.preview, false);
  } finally {
    await plain.close();
  }
});
