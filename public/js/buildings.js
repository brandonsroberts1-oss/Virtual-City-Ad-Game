// Procedural building sprites. A design (type, style, finish, floors, colour,
// lot size) always produces the same picture, so the builder preview is exactly
// what ends up on the island.

import { hash2, mulberry32 } from '/shared/world.js';
import { COLOURS } from '/shared/catalog.js';
import { hex, shade, mix } from './pixel.js';
import { Iso, windowWall, curtainWall, stripes } from './isodraw.js';
import { sprite, decorSprite } from './sprites.js';

const FLOOR = 7;
const GLASS = hex('#2f4d6e');
const LIT = hex('#ffe38a');
const WHITE = hex('#f4f1e8');
const STONE = hex('#b9b5a8');
const CONCRETE = hex('#c9c6bb');
const DARK = hex('#3a3d44');
const GOLD = hex('#e6b93a');
const WOOD = hex('#8a5a34');
const WOOD_D = hex('#6b4426');
const WATER = hex('#3fb6d8');
const WATER_L = hex('#9be4ef');
const TERRACOTTA = hex('#d27548');
const LAWN = [hex('#62b24e'), hex('#70bd58'), hex('#56a546')];
const HEDGE = [hex('#2f7d3a'), hex('#256a31'), hex('#3d9446')];
const SOIL = [hex('#8a6a44'), hex('#7a5c3a'), hex('#9a7850')];

function palette(colourId) {
  const c = COLOURS[colourId] || COLOURS.coral;
  const wall = hex(c.wall);
  const roof = hex(c.roof);
  const accent = hex(c.accent);
  return {
    wall,
    wallR: shade(wall, 0.8),
    roof,
    roofD: shade(roof, 0.72),
    roofL: shade(roof, 1.15),
    accent,
    accentD: shade(accent, 0.75),
    dark: colourId === 'midnight',
  };
}

function specSeed(s) {
  const str = `${s.type}|${s.style}|${s.tier}|${s.floors}|${s.colour}|${s.w}x${s.h}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---- ground covers -----------------------------------------------------------

function lawn(iso, x0, y0, x1, y1, tones = LAWN) {
  iso.top(x0, y0, x1, y1, 0, (x, y) => {
    const n = hash2(x, y);
    return n < 0.08 ? tones[1] : n > 0.94 ? tones[2] : tones[0];
  });
}

function plaza(iso, x0, y0, x1, y1, tone = CONCRETE) {
  const dark = shade(tone, 0.9);
  iso.top(x0, y0, x1, y1, 0, (x, y) => {
    const [u, v] = iso.local(x, y);
    const fu = u * 4 - Math.floor(u * 4);
    const fv = v * 4 - Math.floor(v * 4);
    return fu < 0.12 || fv < 0.12 ? dark : tone;
  });
}

function hedgeBox(iso, x0, y0, x1, y1, z = 3) {
  iso.box(x0, y0, x1, y1, 0, z, { top: HEDGE[2], left: HEDGE[0], right: HEDGE[1] });
}

function backHedges(iso, w, h) {
  hedgeBox(iso, 0.04, 0.03, w - 0.04, 0.1);
  hedgeBox(iso, 0.03, 0.04, 0.1, h - 0.04);
}

function frontHedges(iso, w, h, gapAt) {
  // leave a gap in the left-front hedge for the driveway
  if (gapAt == null) hedgeBox(iso, 0.04, h - 0.1, w - 0.04, h - 0.03);
  else {
    hedgeBox(iso, 0.04, h - 0.1, gapAt - 0.14, h - 0.03);
    hedgeBox(iso, gapAt + 0.14, h - 0.1, w - 0.04, h - 0.03);
  }
  hedgeBox(iso, w - 0.1, 0.04, w - 0.03, h - 0.04);
}

function pool(iso, x0, y0, x1, y1) {
  iso.top(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, 0, WHITE);
  iso.top(x0, y0, x1, y1, 0, (x, y) => (hash2(x, y >> 1) > 0.8 ? WATER_L : WATER));
}

function path(iso, x0, y0, x1, y1, tone = hex('#d8cfb8')) {
  iso.top(x0, y0, x1, y1, 0, tone);
}

function fountain(iso, x, y) {
  iso.cylinder(x, y, 0.13, 0, 2, { side: STONE, top: WATER });
  iso.pole(x, y, 2, 6, WATER_L);
  iso.buf.set(iso.X(x, y) - 1, iso.Y(x, y, 5), WATER_L);
  iso.buf.set(iso.X(x, y) + 1, iso.Y(x, y, 5), WATER_L);
}

function flowers(iso, x0, y0, x1, y1, seed) {
  const cols = [hex('#f06a8a'), hex('#f6d04a'), hex('#f4f1e8'), hex('#c06ad8'), hex('#f08a3a')];
  iso.top(x0, y0, x1, y1, 0, (x, y) => {
    const n = hash2(x + seed, y);
    return n < 0.45 ? cols[Math.floor(n * 11)] : HEDGE[2];
  });
}

// Wrap a wall texture with a door near the given position along the wall.
function withDoor(paint, colour, pos = 0.5, dw = 3, dh = 5, frame = 0) {
  return (c, k, len, hgt) => {
    const d0 = Math.round(len * pos - dw / 2);
    if (c >= d0 && c < d0 + dw && k < dh) {
      if (frame && (k === dh - 1 || c === d0 || c === d0 + dw - 1)) return frame;
      return colour;
    }
    return typeof paint === 'function' ? paint(c, k, len, hgt) : paint;
  };
}

// Left/right wall textures that differ only in shading.
function wallPair(p, opts = {}) {
  const glass = opts.glass || GLASS;
  const lit = opts.lit === undefined ? LIT : opts.lit;
  const base = { floorH: FLOOR, winH: 3, winW: 2, gap: 2, sill: 2, margin: 2, litChance: p.dark ? 0.45 : 0.16, ...opts };
  return {
    left: windowWall({ ...base, wall: opts.wall || p.wall, glass, lit }),
    right: windowWall({ ...base, wall: shade(opts.wall || p.wall, 0.8), glass: shade(glass, 0.85), lit: lit ? shade(lit, 0.9) : 0, seed: (base.seed || 1) + 5 }),
  };
}

function flatRoof(iso, x0, y0, x1, y1, z, tone, inner) {
  iso.top(x0, y0, x1, y1, z, tone);
  if (x1 - x0 > 0.3 && y1 - y0 > 0.3) iso.top(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.06, z, inner || shade(tone, 0.88));
}

function tree(iso, x, y, n = 0) {
  iso.stamp(decorSprite('tree', n), x, y);
}
function bush(iso, x, y, n = 0) {
  iso.stamp(decorSprite('bush', n), x, y);
}
function palmTree(iso, x, y, n = 0) {
  iso.stamp(decorSprite('palm', n), x, y);
}

// ---- homes -------------------------------------------------------------------

function genHome(iso, s, p, seed) {
  const { w, h, floors, style, tier } = s;
  const prem = tier !== 'standard';
  const lux = tier === 'luxury';
  lawn(iso, 0, 0, w, h);
  if (prem) backHedges(iso, w, h);

  let x0 = 0.16;
  let y0 = 0.14;
  let x1 = w > 1 ? w - 0.66 : 0.84;
  let y1 = h > 1 ? h - 0.7 : 0.8;
  if (style === 'bungalow' && w === 1) { x0 = 0.1; x1 = 0.9; }
  const H = floors * FLOOR + 2;
  const door = lux ? GOLD : p.accent;
  const trim = lux ? GOLD : 0;

  if (h > 1) path(iso, (x0 + x1) / 2 - 0.08, y1, (x0 + x1) / 2 + 0.08, h);
  else path(iso, (x0 + x1) / 2 - 0.08, y1, (x0 + x1) / 2 + 0.08, 1);

  if (style === 'townhouse') {
    // a short terrace of narrow houses with alternating fronts
    const units = Math.max(1, Math.round((x1 - x0) / 0.44));
    const uw = (x1 - x0) / units;
    const fronts = [p.wall, mix(p.wall, p.accent, 0.35), mix(p.wall, p.roof, 0.3)];
    const TH = floors * 8 + 3;
    for (let i = 0; i < units; i++) {
      const a = x0 + i * uw;
      const b = a + uw;
      const tone = fronts[i % fronts.length];
      const wp = wallPair(p, { wall: tone, floorH: 8, winH: 4, margin: 1, gap: 1, seed: seed + i, trim });
      iso.box(a, y0, b, y1, 0, TH, { top: null, left: withDoor(wp.left, door, 0.5, 2, 5), right: i === units - 1 ? wp.right : null });
      iso.gable(a, y0, b, y1, TH, 6, 'y', { lit: p.roof, dark: p.roofD, end: tone, over: 0.02 });
    }
  } else if (style === 'modern') {
    const glass = hex('#3f6f96');
    const wp = wallPair(p, { winW: 4, gap: 1, winH: 4, sill: 2, margin: 1, glass, seed, trim: trim || shade(p.wall, 0.7) });
    const lower = Math.max(1, floors - 1) * FLOOR + 2;
    iso.box(x0, y0, x1, y1, 0, lower, { top: null, left: withDoor(wp.left, door, 0.25, 3, 5), right: (c, k, l, hh) => (c < 3 ? p.accentD : wp.right(c, k, l, hh)) });
    flatRoof(iso, x0, y0, x1, y1, lower, WHITE, hex('#d9d5c8'));
    if (floors > 1) {
      // top floor is a smaller pavilion, leaving a roof terrace
      const ux1 = x0 + (x1 - x0) * 0.68;
      const uy1 = y0 + (y1 - y0) * 0.72;
      iso.box(x0, y0, ux1, uy1, lower, H, { top: null, left: wp.left, right: wp.right });
      flatRoof(iso, x0 - 0.04, y0 - 0.04, ux1 + 0.05, uy1 + 0.05, H, WHITE, hex('#d9d5c8'));
    }
  } else {
    const wp = wallPair(p, { seed, trim });
    iso.box(x0, y0, x1, y1, 0, H, { top: null, left: withDoor(wp.left, door, 0.5, 3, 5, lux ? WHITE : 0), right: wp.right });
    const alongX = x1 - x0 >= y1 - y0;
    const short = Math.min(x1 - x0, y1 - y0);
    if (style === 'bungalow') {
      iso.hip(x0, y0, x1, y1, H, Math.round(3 + short * 5), { lit: p.roof, dark: p.roofD, over: 0.07 });
      // porch roof in the accent colour
      iso.face([[x0 + 0.05, y1, 6], [x1 - 0.05, y1, 6], [x1 - 0.05, y1 + 0.14, 4], [x0 + 0.05, y1 + 0.14, 4]], p.accent);
      iso.pole(x0 + 0.08, y1 + 0.13, 0, 4, WHITE);
      iso.pole(x1 - 0.08, y1 + 0.13, 0, 4, WHITE);
    } else {
      iso.gable(x0, y0, x1, y1, H, Math.round(4 + short * 6), alongX ? 'x' : 'y', { lit: p.roof, dark: p.roofD, end: alongX ? p.wallR : p.wall, over: 0.05 });
      if (prem) {
        const cx = x0 + (x1 - x0) * 0.3;
        const cy = y0 + (y1 - y0) * 0.35;
        iso.box(cx, cy, cx + 0.1, cy + 0.1, H + 2, H + 9, { top: DARK, left: hex('#a5533c'), right: hex('#84402e') });
      }
    }
  }

  // yard
  const yardRight = w > 1;
  const yardFront = h > 1;
  if (lux && yardRight) pool(iso, x1 + 0.16, y0 + 0.12, w - 0.16, Math.max(y0 + 0.5, y1 - 0.1));
  else if (yardRight) {
    tree(iso, w - 0.4, 0.45, seed % 9);
    if (prem) flowers(iso, x1 + 0.12, y1 - 0.4, w - 0.14, y1 - 0.2, seed);
  }
  if (yardFront) {
    tree(iso, 0.3, h - 0.32, (seed >>> 3) % 9);
    if (prem) bush(iso, x1 - 0.1, h - 0.28, seed % 3);
    if (lux) palmTree(iso, w - 0.35, h - 0.3, seed % 10);
  }
  if (!yardRight && !yardFront) {
    if (prem) bush(iso, 0.9, 0.9, seed % 3);
    if (lux) flowers(iso, 0.06, 0.84, 0.36, 0.96, seed);
  } else if (prem) frontHedges(iso, w, h, (x0 + x1) / 2);
}

// ---- shops -------------------------------------------------------------------

function awning(iso, x0, x1, y, z, a, b) {
  iso.face([[x0, y, z], [x1, y, z], [x1, y + 0.15, z - 3], [x0, y + 0.15, z - 3]], (px) => (Math.floor(px / 2) % 2 === 0 ? a : b));
}

function signBoard(iso, x0, x1, y, z, colour, lux) {
  iso.box(x0, y - 0.05, x1, y, z, z + 6, {
    top: shade(colour, 0.7),
    right: shade(colour, 0.7),
    left: (c, k, len, hgt) => {
      if (k === 0 || k === hgt - 1 || c === 0 || c === len - 1) return lux ? GOLD : shade(colour, 0.75);
      if ((k === 2 || k === 3) && c > 1 && c < len - 2 && c % 3 !== 0) return WHITE;
      return colour;
    },
  });
}

function genShop(iso, s, p, seed) {
  const { w, h, floors, style, tier } = s;
  const prem = tier !== 'standard';
  const lux = tier === 'luxury';
  plaza(iso, 0, 0, w, h);
  const x0 = 0.08;
  const y0 = 0.08;
  const x1 = w - (w > 1 ? 0.3 : 0.1);
  const y1 = h - (h > 1 ? 0.42 : 0.22);
  const G = 9; // ground floor height
  const H = G + (floors - 1) * FLOOR + 2;
  const front = (shadeF) => (c, k, len) => {
    // shop window with a dark base and mullions
    if (k === 0) return shade(DARK, shadeF);
    if (k >= G - 1) return shade(p.accentD, shadeF);
    if (c < 1 || c >= len - 1) return shade(p.wall, shadeF);
    if (c % 5 === 0) return shade(p.wall, shadeF * 0.9);
    return k > 5 ? shade(hex('#7fb4d6'), shadeF) : shade(hex('#4f86ad'), shadeF);
  };
  const upper = wallPair(p, { seed, baseH: 0, trim: lux ? GOLD : shade(p.wall, 0.75) });
  const stack = (l, r) => ({
    left: (c, k, len, hgt) => (k < G ? l(c, k, len, hgt) : upper.left(c, k - G, len, hgt - G)),
    right: (c, k, len, hgt) => (k < G ? r(c, k, len, hgt) : upper.right(c, k - G, len, hgt - G)),
  });

  if (style === 'market') {
    const mw = stack(
      (c, k, len) => {
        // open arcade
        const bay = c % 6;
        if (k === 0) return DARK;
        if (bay === 0 || c >= len - 1) return p.wall;
        return k > 6 ? p.wall : k > 5 && (bay === 1 || bay === 5) ? p.wall : hex('#2b2f38');
      },
      front(0.8),
    );
    iso.box(x0, y0, x1, y1, 0, H, { top: null, left: mw.left, right: mw.right });
    const alongX = x1 - x0 >= y1 - y0;
    iso.gable(x0, y0, x1, y1, H, Math.round(5 + Math.min(x1 - x0, y1 - y0) * 4), alongX ? 'x' : 'y', {
      lit: stripes(p.roof, p.roofL, 1, true),
      dark: stripes(p.roofD, shade(p.roofD, 1.12), 1, true),
      end: alongX ? p.wallR : p.wall,
      over: 0.06,
    });
    // market stalls out front
    const stalls = Math.max(1, Math.floor((x1 - x0) / 0.45));
    const tones = [hex('#e2493a'), hex('#f2c230'), hex('#3a7bd5'), hex('#37a866')];
    for (let i = 0; i < stalls; i++) {
      const a = x0 + 0.08 + i * ((x1 - x0 - 0.1) / stalls);
      const yy = y1 + (h > 1 ? 0.16 : 0.06);
      if (h > 1) {
        iso.box(a, yy, a + 0.26, yy + 0.14, 0, 3, { top: hex('#f0d9a0'), left: WOOD, right: WOOD_D });
        iso.face([[a - 0.03, yy - 0.03, 8], [a + 0.29, yy - 0.03, 8], [a + 0.29, yy + 0.19, 6], [a - 0.03, yy + 0.19, 6]], (px) => (px % 4 < 2 ? tones[(i + seed) % 4] : WHITE));
      }
    }
  } else {
    const sw = stack(withDoor(front(1), hex('#2b2f38'), 0.5, 3, 6, p.wall), front(0.8));
    iso.box(x0, y0, x1, y1, 0, H, { top: null, left: sw.left, right: sw.right });
    if (style === 'boutique') {
      iso.hip(x0, y0, x1, y1, H, 5, { lit: p.roof, dark: p.roofD, over: 0.03 });
      const ins = Math.min(x1 - x0, y1 - y0) / 2 - 0.02;
      if (x1 - x0 - ins * 2 > 0.1 || y1 - y0 - ins * 2 > 0.1) iso.top(x0 + ins, y0 + ins, x1 - ins, y1 - ins, H + 5, p.roofL);
      awning(iso, x0 + 0.04, x1 - 0.04, y1, G + 1, p.accent, lux ? GOLD : WHITE);
    } else {
      flatRoof(iso, x0, y0, x1, y1, H, shade(p.wall, 0.9), hex('#9a968c'));
      // roof clutter
      iso.box(x0 + 0.12, y0 + 0.12, x0 + 0.3, y0 + 0.26, H, H + 3, { top: hex('#d6d3c9'), left: hex('#b0ada3'), right: hex('#8f8c83') });
      awning(iso, x0 + 0.04, x1 - 0.04, y1, G + 1, p.accent, WHITE);
      iso.face([[x1, y0 + 0.04, G + 1], [x1, y1 - 0.04, G + 1], [x1 + 0.15, y1 - 0.04, G - 2], [x1 + 0.15, y0 + 0.04, G - 2]], (px, py) => (Math.floor(py / 2) % 2 === 0 ? p.accentD : shade(WHITE, 0.85)));
    }
    signBoard(iso, x0 + 0.1, x1 - 0.1, y1 - 0.02, H + (style === 'boutique' ? 1 : 0), p.accent, lux);
  }

  // forecourt
  if (w > 1) {
    // parking bays on the right-hand strip
    for (let yy = 0.3; yy < h - 0.5; yy += 0.34) iso.top(x1 + 0.04, yy, w - 0.04, yy + 0.03, 0, WHITE);
  }
  if (prem && h > 1) {
    tree(iso, 0.22, h - 0.2, seed % 9);
    if (w > 1) tree(iso, w - 0.25, h - 0.2, (seed >>> 2) % 9);
  }
  if (lux && h > 1 && w > 1) fountain(iso, (x0 + x1) / 2 + 0.3, h - 0.22);
  if (lux && (w === 1 || h === 1)) flowers(iso, 0.04, h - 0.16, 0.5, h - 0.05, seed);
}

// ---- mansions ----------------------------------------------------------------

function genMansion(iso, s, p, seed) {
  const { w, h, floors, style, tier } = s;
  const prem = tier !== 'standard';
  const lux = tier === 'luxury';
  lawn(iso, 0, 0, w, h);
  backHedges(iso, w, h);
  tree(iso, 0.32, 0.36, seed % 9);
  tree(iso, w - 0.3, 0.34, (seed >>> 2) % 9);

  const cx = w * 0.42;
  const yFront = h * 0.56;
  // driveway to the front door
  path(iso, cx - 0.16, yFront, cx + 0.16, h, hex('#d9d2bf'));
  const trim = lux ? GOLD : WHITE;
  const H = floors * FLOOR + 2;

  if (style === 'modern') {
    const glass = hex('#4a84ad');
    const cw = { left: curtainWall({ glass, glass2: shade(glass, 1.15), mullion: WHITE, floorH: FLOOR, bay: 5, seed }), right: curtainWall({ glass: shade(glass, 0.8), glass2: shade(glass, 0.92), mullion: shade(WHITE, 0.82), floorH: FLOOR, bay: 5, seed }) };
    const solid = { left: p.wall, right: p.wallR };
    const x0 = 0.24;
    const x1 = w * 0.74;
    const y0 = 0.26;
    let z = 0;
    for (let f = 0; f < floors; f++) {
      // each floor is a slab that slides a little, giving cantilevers
      const shift = (f % 2) * 0.16;
      const a0 = x0 + shift;
      const a1 = x1 + shift - f * 0.08;
      const b1 = yFront - f * 0.06 - (f % 2) * 0.08;
      const mats = f % 2 === 0 ? { left: cw.left, right: solid.right } : { left: solid.left, right: cw.right };
      iso.box(a0, y0, a1, b1, z, z + FLOOR, { top: null, ...mats });
      flatRoof(iso, a0 - 0.05, y0 - 0.05, a1 + 0.06, b1 + 0.06, z + FLOOR, WHITE, f === floors - 1 ? hex('#d9d5c8') : hex('#cfc8b4'));
      z += FLOOR;
    }
    if (lux) iso.top(x0 + 0.2, y0 + 0.1, x0 + 0.7, y0 + 0.5, z, hex('#5fa04a'));
    pool(iso, x1 + 0.3, h * 0.3, w - 0.3, h * 0.3 + Math.min(1.2, h * 0.4));
  } else {
    const villa = style === 'villa';
    const roof = villa ? { lit: TERRACOTTA, dark: shade(TERRACOTTA, 0.74) } : { lit: p.roof, dark: p.roofD };
    const wp = wallPair(p, { seed, trim, winH: 4, sill: 2 });
    const wpLow = wallPair(p, { seed: seed + 3, trim, winH: 4, sill: 2 });
    const mx0 = w * 0.24;
    const mx1 = w * 0.6;
    const my0 = 0.24;
    const wingH = Math.max(1, floors - 1) * FLOOR + 2;
    // left wing, main block, right wing (back to front along x)
    iso.box(0.2, my0 + 0.1, mx0, yFront - 0.14, 0, wingH, { top: null, left: wpLow.left, right: null });
    iso.hip(0.2, my0 + 0.1, mx0 + 0.1, yFront - 0.14, wingH, 6, { ...roof, over: 0.05 });
    const columns = (c, k, len, hgt) => {
      // portico: white columns across the middle of the facade
      const mid = c > len * 0.3 && c < len * 0.7;
      if (!villa && mid && k < hgt - 3 && c % 3 === 0) return WHITE;
      if (villa && k < 6 && c % 5 > 0 && c % 5 < 4 && !(k === 5 && (c % 5 === 1 || c % 5 === 3))) return hex('#3a2f2a');
      return wp.left(c, k, len, hgt);
    };
    iso.box(mx0, my0, mx1, yFront, 0, H, { top: null, left: withDoor(columns, lux ? GOLD : WOOD, 0.5, 3, 6, WHITE), right: wp.right });
    iso.hip(mx0, my0, mx1, yFront, H, Math.round(6 + w), { ...roof, over: 0.06 });
    if (!villa) {
      // pediment over the entrance
      const pc = (mx0 + mx1) / 2;
      iso.face([[pc - 0.3, yFront, H], [pc + 0.3, yFront, H], [pc, yFront, H + 6]], WHITE);
    }
    iso.box(mx1, my0 + 0.1, w * 0.8, yFront - 0.14, 0, wingH, { top: null, left: wpLow.left, right: wpLow.right });
    iso.hip(mx1 - 0.1, my0 + 0.1, w * 0.8, yFront - 0.14, wingH, 6, { ...roof, over: 0.05 });
    if (villa) {
      // bell tower on the corner
      const tx = mx1 - 0.16;
      const ty = yFront - 0.36;
      const tw = wallPair(p, { seed: seed + 9, winW: 2, margin: 1, gap: 1, winH: 4 });
      iso.box(tx, ty, tx + 0.36, ty + 0.36, wingH, H + 12, { top: null, left: tw.left, right: tw.right });
      iso.hip(tx, ty, tx + 0.36, ty + 0.36, H + 12, 7, { ...roof, over: 0.05 });
    }
  }

  // grounds: pool to the right of the drive, tennis court to the left
  const tennis = lux && w >= 3 && h >= 3;
  if (prem && style !== 'modern') {
    const px0 = cx + 0.4;
    const py0 = yFront + 0.24;
    pool(iso, px0, py0, Math.min(w - 0.3, px0 + 1.3), Math.min(h - 0.32, py0 + 0.7));
  } else if (!prem) {
    flowers(iso, cx + 0.3, yFront + 0.12, Math.min(w - 0.3, cx + 1.1), yFront + 0.3, seed);
  }
  if (tennis) {
    const a = 0.32;
    const b = yFront + 0.22;
    const a1 = cx - 0.34;
    const b1 = h - 0.32;
    iso.top(a, b, a1, b1, 0, hex('#3f8f6a'));
    iso.top(a + 0.08, b + 0.08, a1 - 0.08, b1 - 0.08, 0, hex('#4a7fc0'));
    iso.top(a + 0.08, (b + b1) / 2 - 0.02, a1 - 0.08, (b + b1) / 2 + 0.02, 0, WHITE);
  } else {
    tree(iso, 0.3, h - 0.4, (seed >>> 4) % 9);
  }
  if (lux) fountain(iso, cx, yFront + (h - yFront) * 0.45);
  if (prem) palmTree(iso, w - 0.34, h - 0.36, seed % 10);
  frontHedges(iso, w, h, cx);
}

// ---- skyscrapers ---------------------------------------------------------------

const SKY_FLOOR = 5;

function genSkyscraper(iso, s, p, seed) {
  const { w, h, floors, style, tier } = s;
  const prem = tier !== 'standard';
  const lux = tier === 'luxury';
  plaza(iso, 0, 0, w, h, hex('#d2cec2'));
  const x0 = 0.14;
  const y0 = 0.14;
  const x1 = w - 0.14;
  const y1 = h - 0.14;
  const LOBBY = 6;
  const H = LOBBY + floors * SKY_FLOOR;
  const crown = lux ? GOLD : 0;
  const tint = mix(hex('#3f7fb0'), p.accent, 0.3);
  const lobby = (f) => (c, k, len) => (k === LOBBY - 1 ? shade(p.wall, 0.7 * f) : c % 4 === 0 || c >= len - 1 ? shade(p.wall, f) : shade(hex('#7fb4d6'), f));
  const stone = wallPair(p, { floorH: SKY_FLOOR, winH: 3, winW: 2, gap: 1, sill: 1, margin: 1, seed, litChance: p.dark ? 0.4 : 0.09, baseH: LOBBY, trim: crown });
  const withLobby = (pair) => ({
    left: (c, k, len, hgt) => (k < LOBBY ? lobby(1)(c, k, len) : pair.left(c, k, len, hgt)),
    right: (c, k, len, hgt) => (k < LOBBY ? lobby(0.8)(c, k, len) : pair.right(c, k, len, hgt)),
  });
  const glassPair = (sd, z0 = LOBBY) => ({
    left: curtainWall({ glass: tint, glass2: shade(tint, 1.2), mullion: shade(tint, 0.6), floorH: SKY_FLOOR, bay: 4, seed: sd, lit: LIT, litChance: 0.07, crown, baseH: z0, base: shade(p.wall, 0.9) }),
    right: curtainWall({ glass: shade(tint, 0.72), glass2: shade(tint, 0.85), mullion: shade(tint, 0.45), floorH: SKY_FLOOR, bay: 4, seed: sd + 3, lit: shade(LIT, 0.9), litChance: 0.07, crown: crown ? shade(crown, 0.8) : 0, baseH: z0, base: shade(p.wall, 0.72) }),
  });
  const antenna = (x, y, z, len) => {
    iso.pole(x, y, z, z + len, hex('#8a8e96'));
    iso.buf.set(iso.X(x, y), iso.Y(x, y, z + len), hex('#e2493a'));
  };
  const roofKit = (a0, b0, a1, b1, z) => {
    flatRoof(iso, a0, b0, a1, b1, z, shade(p.wall, 0.86), hex('#8f8c83'));
    if (lux && a1 - a0 > 0.9 && b1 - b0 > 0.9) {
      // helipad
      const cxp = (a0 + a1) / 2;
      const cyp = (b0 + b1) / 2;
      iso.buf.ellipse(iso.X(cxp, cyp), iso.Y(cxp, cyp, z), 9, 4.5, hex('#5a5f68'));
      iso.buf.ellipse(iso.X(cxp, cyp), iso.Y(cxp, cyp, z), 7, 3.5, (px, py) => (Math.abs(px - iso.X(cxp, cyp)) < 1.2 || (Math.abs(py - iso.Y(cxp, cyp, z)) < 0.8 && Math.abs(px - iso.X(cxp, cyp)) < 4) ? hex('#f2c230') : hex('#5a5f68')));
    } else if (prem && a1 - a0 > 0.7) {
      iso.top(a0 + 0.14, b0 + 0.14, a1 - 0.14, (b0 + b1) / 2, z, hex('#5fa04a'));
      iso.box(a0 + 0.14, (b0 + b1) / 2 + 0.08, a0 + 0.44, (b0 + b1) / 2 + 0.3, z, z + 4, { top: hex('#d6d3c9'), left: hex('#b0ada3'), right: hex('#8f8c83') });
    } else {
      iso.box(a0 + 0.14, b0 + 0.14, a0 + 0.5, b0 + 0.4, z, z + 4, { top: hex('#d6d3c9'), left: hex('#b0ada3'), right: hex('#8f8c83') });
    }
  };

  if (style === 'setback') {
    const pair = withLobby(stone);
    const z1 = LOBBY + Math.round(floors * 0.55) * SKY_FLOOR;
    const z2 = LOBBY + Math.round(floors * 0.84) * SKY_FLOOR;
    const upper = wallPair(p, { floorH: SKY_FLOOR, winH: 4, winW: 1, gap: 1, sill: 1, margin: 1, seed: seed + 1, litChance: p.dark ? 0.4 : 0.1, trim: crown });
    iso.box(x0, y0, x1, y1, 0, z1, { top: shade(p.wall, 0.86), left: pair.left, right: pair.right });
    const i1 = Math.min(0.22, (x1 - x0) * 0.12);
    iso.box(x0 + i1, y0 + i1, x1 - i1, y1 - i1, z1, z2, { top: shade(p.wall, 0.86), left: upper.left, right: upper.right });
    const i2 = i1 * 2.1;
    iso.box(x0 + i2, y0 + i2, x1 - i2, y1 - i2, z2, H, { top: null, left: upper.left, right: upper.right });
    iso.hip(x0 + i2, y0 + i2, x1 - i2, y1 - i2, H, 8 + w * 2, { lit: lux ? GOLD : p.roof, dark: lux ? shade(GOLD, 0.75) : p.roofD });
    antenna(w / 2, h / 2, H + 8 + w * 2, 12);
  } else if (style === 'twin') {
    const podium = LOBBY + 3 * SKY_FLOOR;
    const pp = withLobby(stone);
    iso.box(x0, y0, x1, y1, 0, podium, { top: null, left: pp.left, right: pp.right });
    flatRoof(iso, x0, y0, x1, y1, podium, shade(p.wall, 0.86), prem ? hex('#5fa04a') : hex('#8f8c83'));
    const xm = (x0 + x1) / 2;
    const ga = glassPair(seed, 0);
    const gb = glassPair(seed + 11, 0);
    const hb = podium + Math.round((H - podium) * 0.84);
    iso.box(x0 + 0.06, y0 + 0.1, xm - 0.1, y1 - 0.1, podium, H, { top: null, left: ga.left, right: ga.right });
    roofKit(x0 + 0.06, y0 + 0.1, xm - 0.1, y1 - 0.1, H);
    antenna(x0 + 0.2, y0 + 0.25, H, 10);
    // skybridge
    const zb = podium + Math.round((hb - podium) * 0.6);
    iso.box(xm - 0.1, (y0 + y1) / 2 - 0.12, xm + 0.1, (y0 + y1) / 2 + 0.12, zb, zb + 5, { top: WHITE, left: hex('#7fb4d6'), right: hex('#5b86b0') });
    iso.box(xm + 0.1, y0 + 0.1, x1 - 0.06, y1 - 0.1, podium, hb, { top: null, left: gb.left, right: gb.right });
    roofKit(xm + 0.1, y0 + 0.1, x1 - 0.06, y1 - 0.1, hb);
  } else if (style === 'glass') {
    const g = glassPair(seed);
    const shaft = LOBBY + Math.round(floors * 0.86) * SKY_FLOOR;
    iso.box(x0, y0, x1, y1, 0, shaft, { top: null, left: (c, k, len, hgt) => (k < LOBBY ? lobby(1)(c, k, len) : g.left(c, k, len, hgt)), right: (c, k, len, hgt) => (k < LOBBY ? lobby(0.8)(c, k, len) : g.right(c, k, len, hgt)) });
    // tapered crown
    const rise = H - shaft + 10 + w * 3;
    iso.hip(x0, y0, x1, y1, shaft, rise, { lit: lux ? mix(tint, GOLD, 0.55) : shade(tint, 1.25), dark: lux ? mix(shade(tint, 0.7), GOLD, 0.35) : shade(tint, 0.8) });
    antenna(w / 2, h / 2, shaft + rise, 14);
  } else {
    // office slab with coloured corner piers
    const pair = withLobby(stone);
    const pier = (fn, f) => (c, k, len, hgt) => (k >= LOBBY && (c < 2 || c >= len - 2) ? shade(p.accentD, f) : fn(c, k, len, hgt));
    iso.box(x0, y0, x1, y1, 0, H, { top: null, left: pier(pair.left, 1), right: pier(pair.right, 0.8) });
    roofKit(x0, y0, x1, y1, H);
    antenna(x0 + 0.3, y0 + 0.3, H, 12);
  }

  if (prem && (w > 2 || h > 2)) {
    tree(iso, 0.1, h - 0.06, seed % 9);
    tree(iso, w - 0.08, h - 0.08, (seed >>> 2) % 9);
  }
}

// ---- farms -------------------------------------------------------------------

const CROPS = [
  [hex('#e3c552'), hex('#cfae3c')], // wheat
  [hex('#5fae45'), hex('#4b9638')], // greens
  [hex('#8a6a44'), hex('#775a38')], // ploughed
  [hex('#86b83e'), hex('#6fa032')], // corn
];

function barn(iso, x0, y0, n, p, lux) {
  const bw = 0.62 + n * 0.16;
  const bd = 0.5 + n * 0.1;
  const H = 8 + n * 2;
  const red = p.roof;
  const boards = (f) => (c, k, len, hgt) => {
    const mid = Math.abs(c - len / 2) < 2.5;
    if (mid && k < 6) return k === 5 || Math.abs(c - len / 2) > 1.6 || Math.abs((c - len / 2) * 1.6 - (k - 2.5)) < 0.9 ? shade(WHITE, f) : shade(red, f * 0.8);
    if (k === hgt - 1) return shade(WHITE, f);
    return c % 3 === 0 ? shade(red, f * 0.9) : shade(red, f);
  };
  iso.box(x0, y0, x0 + bw, y0 + bd, 0, H, { top: null, left: boards(1), right: boards(0.78) });
  const roofTone = lux ? hex('#5a7f9a') : hex('#6f6a63');
  iso.gable(x0, y0, x0 + bw, y0 + bd, H, Math.round(5 + n), 'x', { lit: roofTone, dark: shade(roofTone, 0.72), end: shade(red, 0.78), over: 0.05 });
  return { x1: x0 + bw, y1: y0 + bd };
}

function silo(iso, x, y, n) {
  const H = 14 + n * 3;
  iso.cylinder(x, y, 0.15, 0, H, { side: hex('#c9ccd2'), top: hex('#aeb2b9') });
  iso.dome(x, y, 0.15, H, 4, hex('#9aa0a8'));
}

function genFarm(iso, s, p, seed) {
  const { w, h, floors: n, style, tier } = s;
  const prem = tier !== 'standard';
  const lux = tier === 'luxury';
  const rnd = mulberry32(seed);
  const yardX = Math.min(w, 1.5 + n * 0.12);
  const yardY = Math.min(h, 1.15 + n * 0.08);
  const inYard = (u, v) => u < yardX && v < yardY;

  if (style === 'crops') {
    iso.top(0, 0, w, h, 0, (x, y) => {
      const [u, v] = iso.local(x, y);
      if (inYard(u, v)) return hash2(x, y) < 0.1 ? SOIL[2] : SOIL[0];
      // rectangular parcels, each planted in rows
      const parcel = (Math.floor(u / 1.25) * 3 + Math.floor(v / 1.0) * 5 + seed) % CROPS.length;
      const row = Math.floor((parcel % 2 ? u : v) * 8) % 2;
      const edge = (u / 1.25) % 1 < 0.05 || (v / 1.0) % 1 < 0.07;
      return edge ? SOIL[1] : CROPS[parcel][row];
    });
  } else if (style === 'vineyard') {
    iso.top(0, 0, w, h, 0, (x, y) => {
      const [u, v] = iso.local(x, y);
      if (inYard(u, v)) return hash2(x, y) < 0.1 ? hex('#d9cfb4') : hex('#cfc4a6');
      const row = (u * 4) % 1;
      if (row < 0.42) return hash2(x, y) < 0.16 ? hex('#7a3f8a') : hash2(y, x) < 0.5 ? hex('#3f8a3a') : hex('#2f7030');
      return hash2(x, y) < 0.1 ? SOIL[2] : SOIL[0];
    });
  } else {
    const tones = style === 'ranch' ? [hex('#8cc05a'), hex('#9bcb66'), hex('#7db24e')] : LAWN;
    iso.top(0, 0, w, h, 0, (x, y) => {
      const [u, v] = iso.local(x, y);
      if (inYard(u, v) && style === 'ranch') return hash2(x, y) < 0.1 ? SOIL[2] : SOIL[0];
      const nn = hash2(x, y);
      return nn < 0.08 ? tones[1] : nn > 0.94 ? tones[2] : tones[0];
    });
  }

  // fence along the two back edges (ranch gets one all round)
  const post = style === 'ranch' || lux ? WHITE : WOOD;
  const fence = (ax, ay, bx, by) => {
    const steps = Math.round(Math.hypot(bx - ax, by - ay) * 4);
    for (let i = 0; i <= steps; i++) {
      const x = ax + ((bx - ax) * i) / steps;
      const y = ay + ((by - ay) * i) / steps;
      iso.pole(x, y, 0, 3, post);
    }
    iso.buf.line(iso.X(ax, ay), iso.Y(ax, ay, 2), iso.X(bx, by), iso.Y(bx, by, 2), post);
  };
  fence(0.04, 0.04, w - 0.04, 0.04);
  fence(0.04, 0.04, 0.04, h - 0.04);

  // farmyard buildings
  if (style === 'vineyard') {
    const wp = wallPair(p, { wall: hex('#d8cdb0'), seed, winH: 3 });
    const bw = 0.7 + n * 0.14;
    iso.box(0.25, 0.22, 0.25 + bw, 0.8, 0, 9 + n * 2, { top: null, left: withDoor(wp.left, WOOD, 0.5, 3, 5), right: wp.right });
    iso.gable(0.25, 0.22, 0.25 + bw, 0.8, 9 + n * 2, 6, 'x', { lit: TERRACOTTA, dark: shade(TERRACOTTA, 0.74), end: shade(hex('#d8cdb0'), 0.8), over: 0.05 });
    iso.stamp(decorSprite('pine', seed % 8), 0.25 + bw + 0.18, 0.3);
    if (prem) iso.stamp(decorSprite('pine', (seed + 3) % 8), 0.18, 0.95);
    // barrels
    for (let i = 0; i < n + (lux ? 2 : 0); i++) iso.cylinder(0.35 + i * 0.16, 0.98, 0.055, 0, 3, { side: WOOD, top: hex('#a57a4a') });
  } else {
    const b = barn(iso, 0.22, 0.2, n, p, lux);
    if (n >= 2 || prem) silo(iso, b.x1 + 0.22, 0.42, n);
    if (lux) silo(iso, b.x1 + 0.22, 0.78, Math.max(1, n - 1));
    // hay bales
    for (let i = 0; i < n; i++) iso.cylinder(0.3 + i * 0.17, b.y1 + 0.2, 0.06, 0, 3, { side: hex('#d9b54a'), top: hex('#eccb62') });
  }

  if (style === 'orchard') {
    const fruit = [hex('#f08a2c'), hex('#e2493a'), hex('#f2d24a')][seed % 3];
    for (let yy = 0.3; yy < h - 0.1; yy += 0.5) {
      for (let xx = 0.3; xx < w - 0.1; xx += 0.5) {
        if (inYard(xx - 0.2, yy - 0.2)) continue;
        const px = Math.round(iso.X(xx, yy));
        const py = Math.round(iso.Y(xx, yy));
        iso.buf.rect(px, py - 3, 1, 3, WOOD_D);
        iso.buf.ellipse(px + 0.5, py - 6, 4, 3.6, (ax, ay) => (hash2(ax + seed, ay) < 0.14 ? fruit : ax < px && ay < py - 6 ? HEDGE[2] : ax > px + 1 ? HEDGE[1] : HEDGE[0]));
      }
    }
  } else if (style === 'ranch') {
    fence(0.04, h - 0.04, w - 0.04, h - 0.04);
    fence(w - 0.04, 0.04, w - 0.04, h - 0.04);
    const herd = Math.round(w * h * 0.9);
    for (let i = 0; i < herd; i++) {
      const xx = 0.3 + rnd() * (w - 0.6);
      const yy = 0.3 + rnd() * (h - 0.6);
      if (inYard(xx - 0.15, yy - 0.15)) continue;
      const px = Math.round(iso.X(xx, yy));
      const py = Math.round(iso.Y(xx, yy));
      const coat = rnd() < 0.5 ? WHITE : hex('#7a4a26');
      iso.buf.rect(px, py - 2, 3, 2, coat);
      iso.buf.set(px + (rnd() < 0.5 ? 3 : -1), py - 3, coat === WHITE ? hex('#2b2b2b') : coat);
      iso.buf.set(px + 1, py - 2, coat === WHITE ? hex('#2b2b2b') : shade(coat, 1.3));
    }
    if (lux) {
      const cxp = iso.X(w - 0.8, h - 0.8);
      const cyp = iso.Y(w - 0.8, h - 0.8);
      iso.buf.ellipse(cxp, cyp, 11, 5, hex('#7a6a48'));
      iso.buf.ellipse(cxp, cyp, 9.5, 4, WATER);
    }
  } else if (style === 'crops' && prem) {
    // little tractor
    iso.box(w - 0.75, h - 0.6, w - 0.5, h - 0.45, 1, 5, { top: hex('#4fae45'), left: hex('#3f9a3a'), right: hex('#2f7a2e') });
    iso.box(w - 0.62, h - 0.58, w - 0.5, h - 0.47, 5, 8, { top: hex('#3f9a3a'), left: GLASS, right: shade(GLASS, 0.8) });
  }
  if (lux && style !== 'ranch') {
    // glasshouse
    const gx = Math.max(yardX + 0.1, w - 1.1);
    iso.box(gx, 0.25, gx + 0.7, 0.7, 0, 6, { top: null, left: (c, k) => (c % 3 === 0 || k === 5 ? WHITE : hex('#a9dbe6')), right: (c, k) => (c % 3 === 0 || k === 5 ? shade(WHITE, 0.85) : hex('#86c2d0')) });
    iso.gable(gx, 0.25, gx + 0.7, 0.7, 6, 4, 'x', { lit: hex('#c4ecf2'), dark: hex('#93cbd8'), end: hex('#86c2d0') });
  }
}

// ---- public API ----------------------------------------------------------------

const GENERATORS = { home: genHome, shop: genShop, mansion: genMansion, skyscraper: genSkyscraper, farm: genFarm };

function heightBudget(s) {
  switch (s.type) {
    case 'skyscraper': return 6 + s.floors * SKY_FLOOR + 60;
    case 'mansion': return s.floors * FLOOR + 44;
    case 'farm': return 46;
    default: return s.floors * 8 + 40;
  }
}

const cache = new Map();

export function buildingSprite(spec) {
  const key = `${spec.type}|${spec.style}|${spec.tier}|${spec.floors}|${spec.colour}|${spec.w}x${spec.h}`;
  let s = cache.get(key);
  if (s) return s;
  const iso = new Iso(spec.w, spec.h, heightBudget(spec), 2);
  const gen = GENERATORS[spec.type] || genHome;
  gen(iso, spec, palette(spec.colour), specSeed(spec));
  s = sprite(iso.buf, iso.ox, iso.oy);
  cache.set(key, s);
  return s;
}

export const _kit = { palette, lawn, plaza, hedgeBox, backHedges, frontHedges, pool, path, fountain, flowers, withDoor, wallPair, flatRoof, tree, bush, palmTree, awning, FLOOR, GLASS, LIT, WHITE, STONE, CONCRETE, DARK, GOLD, WOOD, WOOD_D, WATER, WATER_L, TERRACOTTA, LAWN, HEDGE };
