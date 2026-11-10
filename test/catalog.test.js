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
        const spec = { type, style, tier, colour: Object.keys(COLOURS)[0], floors: t.floors[0], w: t.minLot[0], h: t.minLot[1] };
        assert.equal(validateSpec(spec).ok, true);
        const q = quote(spec, { town: spec.w * spec.h });
        assert.ok(Number.isInteger(q.total) && q.total > 0);
        assert.equal(q.total, q.land + q.build);
      }
    }
  }
});

test('location drives land price: summit > waterfront > hillside > ocean view > town', () => {
  const price = (zone) => quote(home, { [zone]: 1 }).land;
  assert.ok(price('summit') > price('waterfront'));
  assert.ok(price('waterfront') > price('hillside'));
  assert.ok(price('hillside') > price('oceanview'));
  assert.ok(price('oceanview') > price('town'));
  assert.equal(price('town'), LAND.basePerTile);
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
