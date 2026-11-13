import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, TIERS, COLOURS, LAND, validateSpec, quote, formatMoney } from '../shared/catalog.js';

const home = { type: 'home', style: 'cottage', tier: 'standard', colour: 'coral', floors: 1, w: 1, h: 1 };

test('a valid design passes and is normalised', () => {
  const v = validateSpec({ ...home, extra: 'ignored' });
  assert.equal(v.ok, true);
  assert.deepEqual(v.spec, home);
});

test('bad designs are rejected with a reason', () => {
  for (const bad of [
    { ...home, type: 'castle' },
    { ...home, style: 'slab' },
    { ...home, tier: 'platinum' },
    { ...home, colour: 'neon' },
    { ...home, floors: 9 },
    { ...home, floors: 1.5 },
    { ...home, w: 5 },
    { type: 'mansion', style: 'estate', tier: 'standard', colour: 'coral', floors: 2, w: 1, h: 1 },
    null,
  ]) {
    const v = validateSpec(bad);
    assert.equal(v.ok, false, JSON.stringify(bad));
    assert.ok(v.reason.length > 5);
  }
});

test('every catalogue entry can be priced', () => {
  for (const [type, t] of Object.entries(BUILDINGS)) {
    for (const style of Object.keys(t.styles)) {
      for (const tier of Object.keys(TIERS)) {
        const [w, h] = t.styles[style].minLot || t.minLot;
        const spec = { type, style, tier, colour: Object.keys(COLOURS)[0], floors: t.floors[0], w, h };
        assert.equal(validateSpec(spec).ok, true);
        const q = quote(spec, { town: spec.w * spec.h });
        assert.ok(Number.isInteger(q.total) && q.total > 0);
        assert.equal(q.total, q.land + q.build);
      }
    }
  }
});

test('location drives land price, from town up to the summit', () => {
  const price = (zone) => quote(home, { [zone]: 1 }).land;
  const order = ['town', 'downtown', 'oceanview', 'hillside', 'ridge', 'waterfront', 'summit'];
  for (let i = 1; i < order.length; i++) assert.ok(price(order[i]) > price(order[i - 1]), `${order[i]} should cost more than ${order[i - 1]}`);
  assert.equal(price('town'), LAND.basePerTile);
  assert.deepEqual(Object.keys(LAND.zones).sort(), order.slice().sort());
});

test('skyscrapers go up to 60 floors and 5x5 lots, and landmark styles cost more', () => {
  const tower = { type: 'skyscraper', style: 'slab', tier: 'standard', colour: 'slate', floors: 60, w: 5, h: 5 };
  assert.equal(validateSpec(tower).ok, true);
  assert.equal(validateSpec({ ...tower, floors: 61 }).ok, false);
  assert.equal(validateSpec({ ...tower, w: 6 }).ok, false);
  const cost = (style) => quote({ ...tower, style }, { town: 25 }).build;
  const styles = ['slab', 'setback', 'twin', 'glass', 'rotunda', 'deco', 'crystal', 'citadel'];
  assert.deepEqual(Object.keys(BUILDINGS.skyscraper.styles), styles);
  for (let i = 1; i < styles.length; i++) assert.ok(cost(styles[i]) > cost(styles[i - 1]), `${styles[i]} should cost more than ${styles[i - 1]}`);
  // the multi-tower citadel needs room
  assert.match(validateSpec({ ...tower, style: 'citadel', w: 2, h: 2 }).reason, /at least 3x3/);
  assert.equal(validateSpec({ ...tower, style: 'citadel', w: 3, h: 3 }).ok, true);
});

test('bigger, taller, fancier and more luxurious all cost more', () => {
  const base = quote(home, { town: 1 }).total;
  assert.ok(quote({ ...home, w: 2, h: 2 }, { town: 4 }).total > base, 'bigger lot');
  assert.ok(quote({ ...home, floors: 3 }, { town: 1 }).total > base, 'taller');
  assert.ok(quote({ ...home, style: 'modern' }, { town: 1 }).total > base, 'more complex style');
  assert.ok(quote({ ...home, tier: 'premium' }, { town: 1 }).total > base, 'premium');
  assert.ok(quote({ ...home, tier: 'luxury' }, { town: 1 }).total > quote({ ...home, tier: 'premium' }, { town: 1 }).total, 'luxury');
  const tower = { type: 'skyscraper', style: 'glass', tier: 'luxury', colour: 'slate', floors: 30, w: 4, h: 4 };
  assert.ok(quote(tower, { waterfront: 16 }).total > 100 * base, 'a luxury tower dwarfs a cottage');
});

test('money is formatted for people', () => {
  assert.equal(formatMoney(500), '$5');
  assert.equal(formatMoney(128000), '$1,280');
  assert.equal(formatMoney(1050), '$10.50');
});
