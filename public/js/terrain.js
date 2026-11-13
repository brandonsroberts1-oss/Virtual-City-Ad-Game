// Rasterises the island's ground (grass, sand, rock, roads and the still
// shallows) into one big pixel image, plus small "occluder" sprites for the
// cliff tiles that can hide things standing behind them.

import { N, TILE, hash2, valueNoise } from '/shared/world.js';
import { PixelBuf, hex, shade } from './pixel.js';
import { shallowColour } from './surf.js';
import { sx, sy, MAP_W, MAP_H, MARGIN } from './iso.js';

const PAL = {
  grass: [hex('#3c8a3b'), hex('#45963f'), hex('#337c36'), hex('#51a046')],
  lot: [hex('#5aa84a'), hex('#63b250'), hex('#52a046')],
  lotHill: [hex('#6dae4c'), hex('#77b852'), hex('#63a446')],
  lotSummit: [hex('#83b658'), hex('#8dc05e'), hex('#78ab50')],
  sand: [hex('#e9d48e'), hex('#f2dfa0'), hex('#dcc47c'), hex('#f7e8b4')],
  rock: [hex('#8b8478'), hex('#9c968a'), hex('#736d62'), hex('#a9a498')],
  asphalt: [hex('#50545b'), hex('#575b62'), hex('#4a4e55')],
  sidewalk: [hex('#bdb9ad'), hex('#c7c3b7'), hex('#b1ada1')],
  curb: hex('#8c887d'),
  lane: hex('#e8cf5a'),
  zebra: hex('#ecebe2'),
};

// Roads: which pixels of a tile are carriageway vs. pavement.
const SIDEWALK = 0.2;
function onAsphalt(u, v, mask) {
  const inU = u >= SIDEWALK && u <= 1 - SIDEWALK;
  const inV = v >= SIDEWALK && v <= 1 - SIDEWALK;
  if (inU && inV) return true;
  if (inV && u > 1 - SIDEWALK) return (mask & 1) !== 0;
  if (inU && v > 1 - SIDEWALK) return (mask & 2) !== 0;
  if (inV && u < SIDEWALK) return (mask & 4) !== 0;
  if (inU && v < SIDEWALK) return (mask & 8) !== 0;
  return false;
}

function roadColor(u, v, mask, px, py) {
  const n = hash2(px, py);
  if (!onAsphalt(u, v, mask)) {
    // kerb where pavement meets the carriageway
    const e = 0.07;
    if (onAsphalt(u + e, v, mask) || onAsphalt(u - e, v, mask) || onAsphalt(u, v + e, mask) || onAsphalt(u, v - e, mask)) return PAL.curb;
    // paving joints
    if ((Math.floor(u * 5) + Math.floor(v * 5)) % 2 === 0 && n < 0.5) return PAL.sidewalk[2];
    return n < 0.85 ? PAL.sidewalk[0] : PAL.sidewalk[1];
  }
  const links = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
  const alongX = (mask & 5) !== 0;
  const alongY = (mask & 10) !== 0;
  const centre = u > SIDEWALK && u < 1 - SIDEWALK && v > SIDEWALK && v < 1 - SIDEWALK;
  if (links >= 3) {
    // zebra crossings on every arm of a junction
    const band = (t) => t > 0.05 && t < 0.17;
    const stripe = (t) => Math.floor(t * 10) % 2 === 0;
    if ((mask & 1) && band(1 - u) && stripe(v)) return PAL.zebra;
    if ((mask & 4) && band(u) && stripe(v)) return PAL.zebra;
    if ((mask & 2) && band(1 - v) && stripe(u)) return PAL.zebra;
    if ((mask & 8) && band(v) && stripe(u)) return PAL.zebra;
  } else {
    const dash = (t) => Math.floor(t * 4) % 2 === 0;
    const thin = 0.034;
    if (alongX && !alongY && Math.abs(v - 0.5) < thin && dash(u)) return PAL.lane;
    if (alongY && !alongX && Math.abs(u - 0.5) < thin && dash(v)) return PAL.lane;
    if (alongX && alongY && !centre) {
      // a bend: keep the dashes on both arms
      if (Math.abs(v - 0.5) < thin && dash(u) && ((u > 0.5 && (mask & 1)) || (u < 0.5 && (mask & 4)))) return PAL.lane;
      if (Math.abs(u - 0.5) < thin && dash(v) && ((v > 0.5 && (mask & 2)) || (v < 0.5 && (mask & 8)))) return PAL.lane;
    }
  }
  return n < 0.8 ? PAL.asphalt[0] : n < 0.92 ? PAL.asphalt[1] : PAL.asphalt[2];
}

function groundColor(t, u, v, px, py) {
  const n = hash2(px, py);
  switch (t.type) {
    case TILE.ROAD:
      return roadColor(u, v, t.mask, px, py);
    case TILE.BEACH: {
      const p = PAL.sand;
      const dune = valueNoise(px * 0.09, py * 0.18);
      if (n < 0.06) return p[2];
      if (n > 0.95) return p[3];
      return dune > 0.62 ? p[1] : p[0];
    }
    case TILE.ROCK: {
      const p = PAL.rock;
      // horizontal strata give the cliffs a layered look
      const band = (py + Math.floor(valueNoise(px * 0.12, 3) * 6)) % 7;
      if (band === 0) return p[2];
      if (n < 0.1) return p[2];
      if (n > 0.9) return p[3];
      return band === 3 ? p[1] : p[0];
    }
    default: {
      if (t.buildable) {
        const p = t.top >= 5 ? PAL.lotSummit : t.top >= 3 ? PAL.lotHill : PAL.lot;
        // faint survey lines so empty lots read as a grid
        if (u < 0.065 || v < 0.065) return ((px + py) & 1) === 0 ? p[2] : p[0];
        return n < 0.07 ? p[1] : n > 0.95 ? p[2] : p[0];
      }
      const p = PAL.grass;
      const patch = valueNoise(px * 0.07 + 9, py * 0.14 + 4);
      if (n < 0.1) return p[2];
      if (n > 0.93) return p[3];
      return patch > 0.55 ? p[1] : p[0];
    }
  }
}

// Draw one screen-space triangle, interpolating (u, v) across it.
function rasterTri(p0, p1, p2, write) {
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
  if (Math.abs(area) < 1e-6) return;
  const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
  const maxX = Math.min(MAP_W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
  const maxY = Math.min(MAP_H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  const inv = 1 / area;
  const eps = -1e-4;
  for (let y = minY; y <= maxY; y++) {
    const cy = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5;
      const w0 = ((p1[0] - cx) * (p2[1] - cy) - (p1[1] - cy) * (p2[0] - cx)) * inv;
      const w1 = ((p2[0] - cx) * (p0[1] - cy) - (p2[1] - cy) * (p0[0] - cx)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < eps || w1 < eps || w2 < eps) continue;
      write(x, y, w0, w1, w2);
    }
  }
}

export function renderTerrain(world) {
  const base = new PixelBuf(MAP_W, MAP_H);
  // Signed shore distance for every pixel at sea level (99 = inland).
  const shoreMap = new Float32Array(MAP_W * MAP_H).fill(-99);
  const occluderTiles = [];

  const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const lowest = (x, y) => (world.inTiles(x, y) ? Math.min(...world.corners(x, y)) : 0);

  // A tile hides what stands behind it only where the ground rises toward the
  // camera faster than one level per row (cliffs, the back of the peak).
  const hidesSomething = (x, y, top) => {
    for (let i = 0; i <= top; i++) {
      for (let j = 0; j <= top; j++) {
        const rows = i + j;
        if (rows === 0 || rows >= top || Math.abs(i - j) > 3) continue;
        if (top - lowest(x - i, y - j) > rows) return true;
      }
    }
    return false;
  };

  const lo0 = -MARGIN;
  const hi0 = N - 1 + MARGIN;
  for (let d = 2 * lo0; d <= 2 * hi0; d++) {
    for (let x = Math.max(lo0, d - hi0); x <= Math.min(hi0, d - lo0); x++) {
      const y = d - x;
      const inside = world.inTiles(x, y);
      const i = inside ? world.ti(x, y) : -1;
      const type = inside ? world.type[i] : TILE.WATER;
      const hs = inside ? world.corners(x, y) : [0, 0, 0, 0];
      const ss = inside
        ? [world.shore[world.vi(x, y)], world.shore[world.vi(x + 1, y)], world.shore[world.vi(x + 1, y + 1)], world.shore[world.vi(x, y + 1)]]
        : [world.shoreAt(x, y), world.shoreAt(x + 1, y), world.shoreAt(x + 1, y + 1), world.shoreAt(x, y + 1)];
      if (type === TILE.WATER && Math.max(...ss) < -7) continue;
      const pts = [
        [sx(x, y), sy(x, y, hs[0])],
        [sx(x + 1, y), sy(x + 1, y, hs[1])],
        [sx(x + 1, y + 1), sy(x + 1, y + 1, hs[2])],
        [sx(x, y + 1), sy(x, y + 1, hs[3])],
      ];
      const lo = Math.min(...hs);
      const hi = Math.max(...hs);
      const coastal = type === TILE.WATER || lo === 0;
      const tile = { type, mask: inside ? world.roadMask[i] : 0, buildable: inside && world.buildable[i] === 1, top: hi };
      // Road tiles are left out: they never hide anything, and it keeps cars
      // from being clipped as they cross from one tile to the next.
      if (hi >= 2 && type !== TILE.ROAD && hidesSomething(x, y, hi)) occluderTiles.push({ pts, row: d });

      // choose the diagonal that keeps flat halves flat
      const tris = hs[0] === hs[2] || hs[1] !== hs[3]
        ? [[0, 1, 2], [0, 2, 3]]
        : [[0, 1, 3], [1, 2, 3]];
      for (const [a, b, c] of tris) {
        // slope of this facet in tile space -> simple directional light
        const ua = UV[a], ub = UV[b], uc = UV[c];
        const det = (ub[0] - ua[0]) * (uc[1] - ua[1]) - (ub[1] - ua[1]) * (uc[0] - ua[0]);
        const gx = ((hs[b] - hs[a]) * (uc[1] - ua[1]) - (hs[c] - hs[a]) * (ub[1] - ua[1])) / det;
        const gy = ((hs[c] - hs[a]) * (ub[0] - ua[0]) - (hs[b] - hs[a]) * (uc[0] - ua[0])) / det;
        let light = Math.max(0.6, Math.min(1.3, 1 + 0.11 * gx - 0.13 * gy));
        if (type === TILE.BEACH) light = 1 + (light - 1) * 0.45; // soft dunes, not cliffs
        rasterTri(pts[a], pts[b], pts[c], (px, py, w0, w1, w2) => {
          const u = w0 * ua[0] + w1 * ub[0] + w2 * uc[0];
          const v = w0 * ua[1] + w1 * ub[1] + w2 * uc[1];
          const k = py * MAP_W + px;
          if (!coastal) {
            shoreMap[k] = 99;
          } else {
            // exact (not per-tile interpolated) distance keeps the waterline smooth
            const s = world.shoreAt(x + u, y + v);
            shoreMap[k] = s;
            if (s < 0) {
              // under water: paint the still shallows straight into the image
              base.data[k] = shallowColour(s, px, py);
              return;
            }
          }
          if (type === TILE.WATER) return;
          let col = groundColor(tile, u, v, px, py);
          if (light !== 1) col = shade(col, light);
          base.data[k] = col;
        });
      }
    }
  }

  // Occluders are cut straight out of the finished image, one small sprite
  // per tile, so they always match it pixel for pixel.
  const occluders = occluderTiles.map((t) => {
    const x0 = Math.floor(Math.min(...t.pts.map((p) => p[0])));
    const x1 = Math.ceil(Math.max(...t.pts.map((p) => p[0])));
    const y0 = Math.floor(Math.min(...t.pts.map((p) => p[1])));
    const y1 = Math.ceil(Math.max(...t.pts.map((p) => p[1])));
    const buf = new PixelBuf(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    buf.poly(t.pts.map(([px, py]) => [px - x0, py - y0]), (px, py) => base.data[(py + y0) * MAP_W + (px + x0)]);
    return { row: t.row, px: x0, py: y0, w: buf.w, h: buf.h, canvas: buf.toCanvas() };
  });

  return { baseCanvas: base.toCanvas(), shoreMap, occluders };
}
