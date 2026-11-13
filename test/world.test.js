import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, TILE, N } from '../shared/world.js';

const world = createWorld();

test('the island is generated the same way every time', () => {
  assert.equal(createWorld(), world);
  assert.equal(world.type.length, N * N);
  const land = world.type.filter((t) => t !== TILE.WATER).length;
  assert.ok(land > 6000 && land < N * N * 0.8, `unexpected land area ${land}`);
});

test('every road tile is flat or a straight ramp, and above sea level', () => {
  let count = 0;
  for (const road of world.roads) {
    for (const t of road.tiles) {
      count++;
      const c = world.corners(t.x, t.y);
      const lo = Math.min(...c);
      const hi = Math.max(...c);
      const ramp = hi - lo === 1 && ((c[0] === c[1] && c[2] === c[3]) || (c[0] === c[3] && c[1] === c[2]));
      assert.ok(lo === hi || ramp, `${road.name} ${t.x},${t.y} is not drivable: ${c}`);
      assert.ok(lo >= 1, `${road.name} ${t.x},${t.y} is under water`);
    }
  }
  assert.ok(count > 1000, 'the big island has a lot of road');
});

test('the road network is one connected piece', () => {
  const start = world.roads[0].tiles[0];
  const seen = new Set([world.ti(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const t = queue.pop();
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (world.isRoad(x, y) && !seen.has(world.ti(x, y))) {
        seen.add(world.ti(x, y));
        queue.push({ x, y });
      }
    }
  }
  const total = world.roads.reduce((s, r) => s + r.tiles.length, 0);
  assert.equal(seen.size, total);
});

test('there is plenty to build on in every kind of location', () => {
  const zones = {};
  let total = 0;
  for (let i = 0; i < N * N; i++) {
    if (!world.buildable[i]) continue;
    total++;
    zones[world.zone[i]] = (zones[world.zone[i]] || 0) + 1;
  }
  assert.ok(total > 4000, `only ${total} buildable tiles`);
  for (const z of ['town', 'downtown', 'oceanview', 'waterfront', 'hillside', 'ridge', 'summit']) assert.ok(zones[z] > 100, `too few ${z} lots: ${zones[z]}`);
});

test('civic buildings sit on flat, dry ground and never on a road or a lot', () => {
  const kinds = world.civics.map((c) => c.kind);
  for (const k of ['hospital', 'school', 'university', 'foodbank', 'park']) assert.ok(kinds.includes(k), `missing ${k}`);
  for (const c of world.civics) {
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        const corners = world.corners(x, y);
        assert.ok(corners.every((h) => h === c.level && h >= 1), `${c.id} is not level at ${x},${y}: ${corners}`);
        assert.ok(!world.isRoad(x, y), `${c.id} overlaps a road`);
        assert.equal(world.buildable[world.ti(x, y)], 0, `${c.id} overlaps a buildable lot`);
      }
    }
  }
});

test('lots must be buildable, free, level and touch a road', () => {
  const free = new Set();
  const ok = world.checkLot(20, 99, 2, 2, free);
  assert.equal(ok.ok, true);
  assert.equal(ok.zone, 'waterfront');
  assert.match(ok.address, /Ocean Drive/);
  assert.deepEqual(ok.zones, { waterfront: 4 });

  assert.equal(world.checkLot(0, 0, 1, 1, free).ok, false, 'open sea');
  assert.equal(world.checkLot(14, 98, 1, 1, free).ok, false, 'on a road');
  assert.equal(world.checkLot(50, 71, 1, 1, free).ok, false, 'on the hospital');
  assert.equal(world.checkLot(-1, 5, 1, 1, free).ok, false, 'off the map');
  assert.equal(world.checkLot(20, 99, 2.5, 2, free).ok, false, 'fractional size');
  assert.match(world.checkLot(20, 100, 1, 1, free).reason, /touch a road/);

  const taken = new Set([world.ti(21, 100)]);
  assert.match(world.checkLot(20, 99, 2, 2, taken).reason, /already owned/);

  // a whole town block is usable, right through the middle
  assert.equal(world.checkLot(15, 71, 6, 6, free).ok, true);
});

test('every zone has roadside lots that report that zone', () => {
  for (const zone of ['town', 'downtown', 'oceanview', 'waterfront', 'hillside', 'ridge', 'summit']) {
    let found = null;
    for (let y = 0; y < N && !found; y++) {
      for (let x = 0; x < N && !found; x++) {
        if (world.buildable[world.ti(x, y)] && world.zone[world.ti(x, y)] === zone && world.checkLot(x, y, 1, 1, new Set()).ok) found = { x, y };
      }
    }
    assert.ok(found, `no roadside lot in ${zone}`);
    assert.equal(world.checkLot(found.x, found.y, 1, 1, new Set()).zone, zone);
  }
});
