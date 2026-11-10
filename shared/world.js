// Deterministic island generator.
//
// The same module runs on the server (lot validation, land pricing) and in the
// browser (rendering), so both sides always agree about what the island looks
// like without shipping map data over the wire.
//
// Coordinates: tile (x, y) with x growing toward the lower-right of the screen
// and y toward the lower-left. Heights live on tile *corners* (vertices), so a
// tile can be flat or sloped. Sea level is 0, the coastal plain is level 1,
// the two mountain terraces are levels 3 and 5.

export const N = 56;            // tiles per side
export const NV = N + 1;        // vertices per side
export const MAX_H = 13;        // highest vertex level

export const TILE = { WATER: 0, BEACH: 1, GRASS: 2, ROCK: 3, ROAD: 4 };

export const ZONES = {
  town: { name: 'Town' },
  oceanview: { name: 'Ocean View' },
  waterfront: { name: 'Waterfront' },
  hillside: { name: 'Hillside' },
  summit: { name: 'Summit' },
};

// Ocean Drive runs along these tile lines; the coast sits a few tiles outside.
const RING_LO = 12;
const RING_HI = 43;
const RECT0 = RING_LO;          // core rectangle in vertex coordinates
const RECT1 = RING_HI + 1;
const MC = 17;                  // mountain centre (vertex)
const CENTER = N / 2;

// Direction table shared by roads, cars and pedestrians.
export const DIRS = [
  { dx: 1, dy: 0 },   // 0: +x  (screen lower-right)
  { dx: 0, dy: 1 },   // 1: +y  (screen lower-left)
  { dx: -1, dy: 0 },  // 2: -x  (screen upper-left)
  { dx: 0, dy: -1 },  // 3: -y  (screen upper-right)
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap deterministic hash of two integers -> [0, 1)
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Smooth value noise in [0, 1)
export function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function distRect(px, py) {
  const dx = Math.max(RECT0 - px, 0, px - RECT1);
  const dy = Math.max(RECT0 - py, 0, py - RECT1);
  return Math.hypot(dx, dy);
}

// Small sandbars off the coast and a cape at the southern tip keep the island
// from reading as a perfect diamond.
const ISLETS = [
  { x: 53.2, y: 22.5, r: 1.8 },
  { x: 19.5, y: 53.0, r: 2.1 },
  { x: 52.4, y: 37.0, r: 1.2 },
];
const CAPES = [{ x: 47.0, y: 47.0, r: 3.8 }];

// How far the coast sits outside the core rectangle, as a function of bearing.
function coastReach(px, py) {
  const a = Math.atan2(py - CENTER, px - CENTER);
  const wobble = (valueNoise(px * 0.21 + 40, py * 0.21 + 17) - 0.5) * 1.8;
  return Math.max(4.7, 6.0 + 0.6 * Math.sin(2 * a + 0.5) + 0.45 * Math.sin(5 * a + 2.0) + wobble);
}

// Signed distance to the waterline in tiles: positive on land, negative at sea.
function shoreDistance(px, py) {
  let s = coastReach(px, py) - distRect(px, py);
  // blunt the two side tips of the diamond
  const tip = (37.6 + (valueNoise(px * 0.3, py * 0.3) - 0.5) * 2 - Math.abs(py - px)) / Math.SQRT2;
  s = Math.min(s, tip);
  for (const c of CAPES) s = Math.max(s, c.r - Math.hypot(px - c.x, py - c.y));
  for (const c of ISLETS) s = Math.max(s, c.r - Math.hypot(px - c.x, py - c.y));
  return s;
}

function squircle(dx, dy) {
  return Math.pow(Math.pow(Math.abs(dx), 6) + Math.pow(Math.abs(dy), 6), 1 / 6);
}

function mountainLevel(vx, vy) {
  const dx = vx - MC;
  const dy = vy - MC;
  const d = squircle(dx, dy);
  if (d >= 15.5) return 1;
  if (d >= 14.5) return 2;
  if (d >= 9.5) return 3;       // lower terrace (Ridge Road)
  if (d >= 8.5) return 4;
  if (d >= 4.5) return 5;       // upper terrace (Skyline Drive)
  const round = Math.hypot(dx, dy);
  const bump = (valueNoise(vx * 0.9 + 3.1, vy * 0.9 + 7.7) - 0.5) * 1.6;
  const extra = Math.round((5.3 - round) * 1.5 + bump);
  return 5 + Math.max(0, Math.min(MAX_H - 5, extra));
}

const ROADS = [
  { name: 'Ocean Drive', segs: [[12, 33, 12, 43], [12, 43, 43, 43], [43, 43, 43, 12], [43, 12, 33, 12]] },
  { name: 'Ridge Road', segs: [[12, 32, 12, 28], [12, 28, 28, 28], [28, 28, 28, 12], [28, 12, 32, 12]] },
  { name: 'Center Avenue', segs: [[13, 38, 42, 38]] },
  { name: 'East Avenue', segs: [[38, 13, 38, 42]] },
  { name: 'Main Street', segs: [[20, 42, 20, 29]] },
  { name: 'Summit Road', segs: [[42, 21, 24, 21]] },
  { name: 'Skyline Drive', segs: [[14, 23, 23, 23], [23, 23, 23, 14]] },
];

// Pre-placed civic buildings. Each one collects donations for one charity
// (see shared/catalog.js for the charity list).
const CIVICS = [
  { id: 'hospital', kind: 'hospital', name: 'Island General Hospital', charity: 'health', x: 30, y: 35, w: 3, h: 3 },
  { id: 'school', kind: 'school', name: 'Palm Grove School', charity: 'education', x: 14, y: 39, w: 3, h: 2 },
  { id: 'university', kind: 'university', name: 'Island University', charity: 'scholarship', x: 39, y: 25, w: 4, h: 3 },
  { id: 'foodbank', kind: 'foodbank', name: 'Community Food Bank', charity: 'hunger', x: 21, y: 39, w: 2, h: 2 },
  { id: 'central-park', kind: 'park', name: 'Central Park', charity: 'parks', x: 26, y: 39, w: 5, h: 4 },
  { id: 'beach-park', kind: 'beachpark', name: 'South Point Beach Park', charity: 'parks', x: 44, y: 44, w: 2, h: 2 },
  { id: 'lookout', kind: 'lookout', name: 'Summit Lookout', charity: 'parks', x: 24, y: 24, w: 2, h: 2, level: 5 },
];

const BUILD_DEPTH = 3; // how many tiles back from a road a lot may reach

let cached = null;

export function createWorld() {
  if (cached) return cached;

  const vi = (x, y) => y * NV + x;
  const ti = (x, y) => y * N + x;
  const inTiles = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  // --- vertex heights + shoreline distance -------------------------------
  const hv = new Uint8Array(NV * NV);
  const shore = new Float32Array(NV * NV);
  for (let y = 0; y < NV; y++) {
    for (let x = 0; x < NV; x++) {
      const s = shoreDistance(x, y);
      shore[vi(x, y)] = s;
      let h = 0;
      if (s >= 1.3) h = mountainLevel(x, y);
      hv[vi(x, y)] = h;
    }
  }

  // Civic sites that need the ground levelled (the lookout juts out of the
  // upper terrace like a balcony).
  for (const c of CIVICS) {
    if (c.level == null) continue;
    for (let y = c.y; y <= c.y + c.h; y++) {
      for (let x = c.x; x <= c.x + c.w; x++) hv[vi(x, y)] = c.level;
    }
  }

  // --- tiles ---------------------------------------------------------------
  const type = new Uint8Array(N * N);
  const level = new Int8Array(N * N);       // flat level, or -1 when sloped
  const roadId = new Int8Array(N * N).fill(-1);
  const roadMask = new Uint8Array(N * N);   // bit d set => connects in DIRS[d]
  const civicAt = new Int8Array(N * N).fill(-1);
  const buildable = new Uint8Array(N * N);
  const zone = new Array(N * N).fill(null);

  const corners = (x, y) => [hv[vi(x, y)], hv[vi(x + 1, y)], hv[vi(x + 1, y + 1)], hv[vi(x, y + 1)]];

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = corners(x, y);
      const s4 = [shore[vi(x, y)], shore[vi(x + 1, y)], shore[vi(x + 1, y + 1)], shore[vi(x, y + 1)]];
      const lo = Math.min(...c);
      const hi = Math.max(...c);
      level[ti(x, y)] = lo === hi ? lo : -1;
      let t;
      if (Math.max(...s4) <= 0) t = TILE.WATER;
      else if (hi <= 1 && (distRect(x + 0.5, y + 0.5) > 2.1 || shoreDistance(x + 0.5, y + 0.5) < 2.4)) t = TILE.BEACH;
      else if (hi - lo >= 2 || (lo + hi) / 2 >= 6.5) t = TILE.ROCK;
      else if (lo === 0) t = hi <= 1 ? TILE.BEACH : TILE.ROCK;
      else t = TILE.GRASS;
      type[ti(x, y)] = t;
    }
  }

  // --- roads -----------------------------------------------------------------
  const roads = ROADS.map((r, id) => ({ id, name: r.name, tiles: [] }));
  ROADS.forEach((r, id) => {
    for (const [x0, y0, x1, y1] of r.segs) {
      const sx = Math.sign(x1 - x0);
      const sy = Math.sign(y1 - y0);
      let x = x0;
      let y = y0;
      for (;;) {
        if (roadId[ti(x, y)] === -1) {
          roadId[ti(x, y)] = id;
          type[ti(x, y)] = TILE.ROAD;
          roads[id].tiles.push({ x, y });
        }
        if (x === x1 && y === y1) break;
        x += sx;
        y += sy;
      }
    }
  });
  const isRoad = (x, y) => inTiles(x, y) && type[ti(x, y)] === TILE.ROAD;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!isRoad(x, y)) continue;
      let m = 0;
      DIRS.forEach((d, i) => {
        if (isRoad(x + d.dx, y + d.dy)) m |= 1 << i;
      });
      roadMask[ti(x, y)] = m;
    }
  }

  // --- civic buildings -----------------------------------------------------
  const civics = CIVICS.map((c, idx) => {
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        civicAt[ti(x, y)] = idx;
        if (type[ti(x, y)] !== TILE.ROAD) type[ti(x, y)] = TILE.GRASS;
        level[ti(x, y)] = hv[vi(x, y)];
      }
    }
    return { ...c, level: hv[vi(c.x, c.y)] };
  });

  // --- zones + buildable lots ---------------------------------------------
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = ti(x, y);
      const lv = level[i];
      if (type[i] === TILE.WATER) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      let z = 'town';
      const top = lv >= 0 ? lv : Math.max(...corners(x, y));
      if (top >= 5) z = 'summit';
      else if (top >= 3) z = 'hillside';
      else if (distRect(cx, cy) > 0) z = 'waterfront';
      else {
        const inset = Math.min(cx - RECT0, RECT1 - cx, cy - RECT0, RECT1 - cy);
        if (inset < 4) z = 'oceanview';
      }
      zone[i] = z;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = ti(x, y);
      if (type[i] !== TILE.GRASS || level[i] < 1 || civicAt[i] !== -1) continue;
      let near = false;
      for (let dy = -BUILD_DEPTH; dy <= BUILD_DEPTH && !near; dy++) {
        for (let dx = -BUILD_DEPTH; dx <= BUILD_DEPTH; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (isRoad(xx, yy) && level[ti(xx, yy)] === level[i]) {
            near = true;
            break;
          }
        }
      }
      if (near) buildable[i] = 1;
    }
  }

  // --- decoration ------------------------------------------------------------
  const rand = mulberry32(20261109);
  const decor = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = ti(x, y);
      const t = type[i];
      if (t === TILE.WATER || t === TILE.ROAD || civicAt[i] !== -1 || buildable[i]) continue;
      const sMid = (shore[vi(x, y)] + shore[vi(x + 1, y)] + shore[vi(x + 1, y + 1)] + shore[vi(x, y + 1)]) / 4;
      const r = rand();
      const ox = 0.2 + rand() * 0.6;
      const oy = 0.2 + rand() * 0.6;
      const v = Math.floor(rand() * 1000);
      if (t === TILE.BEACH) {
        const islet = distRect(x + 0.5, y + 0.5) > 6.5;
        if (islet ? sMid > 0.6 && r < 0.7 : sMid > 2.3 && r < 0.42) decor.push({ kind: 'palm', x: x + ox, y: y + oy, v });
        else if (sMid > 1.7 && sMid <= 2.6 && r > 0.93) decor.push({ kind: 'umbrella', x: x + ox, y: y + oy, v });
      } else if (t === TILE.GRASS) {
        const top = Math.max(...corners(x, y));
        const groves = valueNoise(x * 0.35 + 11, y * 0.35 + 5);
        if (top >= 2) {
          if (r < 0.62) decor.push({ kind: 'pine', x: x + ox, y: y + oy, v });
          if (r > 0.3 && r < 0.62) decor.push({ kind: 'pine', x: x + (ox + 0.4) % 1, y: y + (oy + 0.45) % 1, v: v + 7 });
        } else if (zone[i] === 'waterfront') {
          if (r < 0.3) decor.push({ kind: 'palm', x: x + ox, y: y + oy, v });
        } else if (r < 0.25 + groves * 0.5) {
          decor.push({ kind: r < 0.08 ? 'bush' : 'tree', x: x + ox, y: y + oy, v });
        }
      } else if (t === TILE.ROCK) {
        if (r < 0.2) decor.push({ kind: 'boulder', x: x + ox, y: y + oy, v });
        else if (r > 0.82 && Math.max(...corners(x, y)) < 8) decor.push({ kind: 'pine', x: x + ox, y: y + oy, v });
      }
    }
  }

  // --- helpers ---------------------------------------------------------------
  function heightAt(fx, fy) {
    const x = Math.max(0, Math.min(N - 1, Math.floor(fx)));
    const y = Math.max(0, Math.min(N - 1, Math.floor(fy)));
    const u = fx - x;
    const v = fy - y;
    const a = hv[vi(x, y)];
    const b = hv[vi(x + 1, y)];
    const c = hv[vi(x + 1, y + 1)];
    const d = hv[vi(x, y + 1)];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * u * v + d * (1 - u) * v;
  }

  function shoreAt(fx, fy) {
    return shoreDistance(fx, fy);
  }

  // Street address for a lot: the closest road tile gives the street name and
  // the house number.
  function addressOf(x, y, w = 1, h = 1) {
    let best = null;
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        const corner = (xx === x - 1 || xx === x + w) && (yy === y - 1 || yy === y + h);
        if (!corner && isRoad(xx, yy)) {
          best = best || { x: xx, y: yy };
        }
      }
    }
    if (!best) {
      let bd = Infinity;
      for (let yy = y - BUILD_DEPTH - 1; yy <= y + h + BUILD_DEPTH; yy++) {
        for (let xx = x - BUILD_DEPTH - 1; xx <= x + w + BUILD_DEPTH; xx++) {
          if (!isRoad(xx, yy)) continue;
          const d = Math.hypot(xx - (x + w / 2 - 0.5), yy - (y + h / 2 - 0.5));
          if (d < bd) {
            bd = d;
            best = { x: xx, y: yy };
          }
        }
      }
    }
    if (!best) return '';
    const road = roads[roadId[ti(best.x, best.y)]];
    const n = road.tiles.findIndex((t) => t.x === best.x && t.y === best.y);
    const side = (x + y) % 2;
    return `${(n + 1) * 2 + side} ${road.name}`;
  }

  // Validate a w*h lot whose top corner is tile (x, y).
  // `occupied` is a Set of tile indices that already belong to a property.
  function checkLot(x, y, w, h, occupied) {
    if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1) return { ok: false, reason: 'Invalid lot.' };
    if (!inTiles(x, y) || !inTiles(x + w - 1, y + h - 1)) return { ok: false, reason: 'That is off the map.' };
    let lv = null;
    let frontage = false;
    const zones = {};
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = ti(xx, yy);
        if (!buildable[i]) return { ok: false, reason: 'Part of this lot is not buildable land.' };
        if (occupied && occupied.has(i)) return { ok: false, reason: 'Part of this lot is already owned.' };
        if (lv === null) lv = level[i];
        else if (lv !== level[i]) return { ok: false, reason: 'A lot must sit on level ground.' };
        zones[zone[i]] = (zones[zone[i]] || 0) + 1;
        for (const d of DIRS) {
          if (isRoad(xx + d.dx, yy + d.dy)) frontage = true;
        }
      }
    }
    if (!frontage) return { ok: false, reason: 'A lot must touch a road.' };
    // The lot is named after its best zone.
    const rank = ['town', 'oceanview', 'hillside', 'waterfront', 'summit'];
    const main = Object.keys(zones).sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0];
    return { ok: true, level: lv, zones, zone: main, address: addressOf(x, y, w, h) };
  }

  cached = {
    N, NV, MAX_H,
    hv, shore, type, level, roadId, roadMask, civicAt, buildable, zone,
    roads, civics, decor,
    vi, ti, inTiles, isRoad, corners, heightAt, shoreAt, addressOf, checkLot,
  };
  return cached;
}
