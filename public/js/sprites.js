// Procedural pixel-art sprites for everything that is not a building:
// palms, trees, rocks, beach umbrellas, vehicles, pedestrians, boats, birds.

import { mulberry32 } from '/shared/world.js';
import { PixelBuf, hex, shade, pack, spriteFromArt } from './pixel.js';
import { Iso } from './isodraw.js';

// A sprite is a pixel buffer plus the pixel that should sit on the ground.
export function sprite(buf, ax, ay) {
  let canvas = null;
  return {
    buf,
    ax,
    ay,
    w: buf.w,
    h: buf.h,
    get canvas() {
      if (!canvas) canvas = buf.toCanvas();
      return canvas;
    },
  };
}

const SHADOW = pack(10, 30, 20, 70);

function groundShadow(buf, cx, cy, rx, ry) {
  buf.ellipse(cx, cy, rx, ry, (x, y) => (buf.get(x, y) >>> 24 ? 0 : SHADOW));
}

// ---- vegetation --------------------------------------------------------------

const TRUNK = [hex('#6b4a2b'), hex('#8a623a'), hex('#a57a4a')];
const FROND = [hex('#1f6b2c'), hex('#2f8a35'), hex('#49a83f'), hex('#7cc653')];

export function makePalm(seed) {
  const r = mulberry32(seed * 7919 + 13);
  const H = 15 + Math.floor(r() * 9);
  const lean = Math.round((r() - 0.5) * 9);
  const W = 34;
  const HT = H + 16;
  const buf = new PixelBuf(W, HT);
  const bx = 16 - Math.round(lean / 2);
  const by = HT - 3;
  groundShadow(buf, bx + 4, by + 1, 5, 2);
  for (let i = 0; i <= H; i++) {
    const t = i / H;
    const x = Math.round(bx + lean * t * t);
    const y = by - i;
    const ring = i % 3 === 0;
    buf.set(x, y, ring ? TRUNK[0] : TRUNK[1]);
    if (t < 0.75) buf.set(x + 1, y, ring ? TRUNK[1] : TRUNK[2]);
  }
  const cx = bx + lean;
  const cy = by - H;
  const n = 7 + Math.floor(r() * 3);
  const fronds = [];
  for (let f = 0; f < n; f++) {
    const a = (-172 + (164 * f) / (n - 1) + (r() - 0.5) * 14) * (Math.PI / 180);
    fronds.push({ a, L: 8 + r() * 5, droop: 4 + r() * 5 });
  }
  // back fronds darker, front fronds lighter
  fronds.sort((p, q) => Math.abs(Math.cos(p.a)) - Math.abs(Math.cos(q.a)));
  fronds.forEach((fr, idx) => {
    const light = idx >= fronds.length / 2;
    for (let s = 0; s <= fr.L; s += 0.5) {
      const t = s / fr.L;
      const x = Math.round(cx + Math.cos(fr.a) * s);
      const y = Math.round(cy + Math.sin(fr.a) * s * 0.75 + fr.droop * t * t);
      buf.set(x, y, light ? FROND[2] : FROND[1]);
      buf.set(x, y + 1, light ? FROND[1] : FROND[0]);
      if (t > 0.35 && t < 0.9) buf.set(x, y + 2, FROND[0]);
      if (light && t > 0.15 && t < 0.6) buf.set(x, y - 1, FROND[3]);
    }
  });
  buf.set(cx, cy + 1, TRUNK[0]);
  buf.set(cx + 1, cy + 2, TRUNK[0]);
  buf.set(cx - 1, cy + 2, hex('#4a3319'));
  return sprite(buf, bx, by);
}

const LEAF_SETS = [
  [hex('#1e5e2a'), hex('#2a7a33'), hex('#3c963c'), hex('#62b84a')],
  [hex('#24602a'), hex('#35803a'), hex('#4fa040'), hex('#86c456')],
  [hex('#1c5536'), hex('#28733f'), hex('#3a8f4a'), hex('#5aae58')],
];

export function makeTree(seed) {
  const r = mulberry32(seed * 104729 + 7);
  const pal = LEAF_SETS[seed % LEAF_SETS.length];
  const R = 5 + Math.floor(r() * 3);
  const W = R * 2 + 10;
  const HT = R * 2 + 12;
  const buf = new PixelBuf(W, HT);
  const bx = W >> 1;
  const by = HT - 3;
  groundShadow(buf, bx + 3, by + 1, R, 2.5);
  buf.rect(bx - 1, by - 4, 2, 5, TRUNK[0]);
  buf.set(bx, by - 4, TRUNK[1]);
  buf.set(bx, by - 3, TRUNK[1]);
  const blobs = [
    { x: bx, y: by - 5 - R * 0.75, r: R },
    { x: bx - R * 0.45, y: by - 5 - R * 0.45, r: R * 0.7 },
    { x: bx + R * 0.5, y: by - 5 - R * 0.5, r: R * 0.65 },
    { x: bx + (r() - 0.5) * R * 0.6, y: by - 5 - R * 1.25, r: R * 0.6 },
  ];
  for (const b of blobs) {
    buf.ellipse(b.x, b.y, b.r, b.r * 0.85, (x, y) => {
      const lx = (x - b.x) / b.r;
      const ly = (y - b.y) / (b.r * 0.85);
      const l = -lx * 0.55 - ly * 0.75 + (((x + y) & 1) ? 0.12 : -0.12) + (r() - 0.5) * 0.25;
      return l > 0.55 ? pal[3] : l > 0.05 ? pal[2] : l > -0.5 ? pal[1] : pal[0];
    });
  }
  return sprite(buf, bx, by);
}

const PINE = [hex('#14452d'), hex('#1d5c36'), hex('#2a7742'), hex('#3f9450')];

export function makePine(seed) {
  const r = mulberry32(seed * 31337 + 3);
  const H = 13 + Math.floor(r() * 8);
  const W = 15;
  const HT = H + 6;
  const buf = new PixelBuf(W, HT);
  const bx = 7;
  const by = HT - 3;
  groundShadow(buf, bx + 2, by + 1, 4, 1.8);
  buf.rect(bx, by - 2, 1, 3, TRUNK[0]);
  const tiers = 3 + (H > 17 ? 1 : 0);
  const tierH = (H - 2) / tiers;
  for (let i = 0; i < H - 2; i++) {
    const y = by - 2 - (H - 2) + i;
    const tier = Math.floor(i / tierH);
    const within = (i - tier * tierH) / tierH;
    const half = Math.max(0, Math.round(0.6 + tier * 1.1 + within * 2.6));
    for (let x = -half; x <= half; x++) {
      const edge = x === half || (i + 1) % Math.round(tierH) === 0;
      let c = x < -half * 0.3 ? PINE[2] : x > half * 0.35 ? PINE[0] : PINE[1];
      if (x === -half && half > 1 && within > 0.3) c = PINE[3];
      if (edge && x > 0) c = PINE[0];
      buf.set(bx + x, y, c);
    }
  }
  return sprite(buf, bx, by);
}

export function makeBush(seed) {
  const pal = LEAF_SETS[(seed + 1) % LEAF_SETS.length];
  const buf = new PixelBuf(12, 9);
  groundShadow(buf, 7, 7, 4, 1.5);
  buf.ellipse(5.5, 4.5, 4.5, 3.2, (x, y) => (y < 3 && x < 6 ? pal[3] : y > 5 || x > 7 ? pal[0] : ((x + y) & 1) ? pal[2] : pal[1]));
  return sprite(buf, 5, 7);
}

const STONE = [hex('#6a655c'), hex('#8c867b'), hex('#a8a297'), hex('#c2bdb2')];

export function makeBoulder(seed) {
  const big = seed % 3 === 0;
  const w = big ? 11 : 8;
  const h = big ? 8 : 6;
  const buf = new PixelBuf(w + 4, h + 3);
  groundShadow(buf, w / 2 + 2.5, h + 0.5, w / 2, 1.6);
  buf.ellipse(w / 2 + 0.5, h / 2 + 1, w / 2, h / 2, (x, y) => {
    const l = -(x - w / 2) / w - (y - h / 2) / h;
    return l > 0.35 ? STONE[3] : l > 0.05 ? STONE[2] : l > -0.3 ? STONE[1] : STONE[0];
  });
  return sprite(buf, Math.round(w / 2), h);
}

const UMBRELLA_COLOURS = [
  [hex('#e04a3a'), hex('#f4efe6')],
  [hex('#2f7fd0'), hex('#f4efe6')],
  [hex('#f0b830'), hex('#e96a2c')],
  [hex('#2fa77a'), hex('#f6e58a')],
];
const TOWELS = [hex('#e86a8a'), hex('#4ab0d8'), hex('#f2c94c'), hex('#8e6cd0')];

export function makeUmbrella(seed) {
  const [a, b] = UMBRELLA_COLOURS[seed % UMBRELLA_COLOURS.length];
  const buf = new PixelBuf(22, 15);
  const bx = 8;
  const by = 12;
  groundShadow(buf, bx + 3, by + 1, 5, 1.6);
  // beach towel beside the pole
  const tw = TOWELS[(seed >> 2) % TOWELS.length];
  for (let i = 0; i < 6; i++) {
    buf.set(bx + 5 + i, by - 1 + Math.floor(i / 2), i % 3 === 2 ? shade(tw, 1.3) : tw);
    buf.set(bx + 5 + i, by + Math.floor(i / 2), tw);
  }
  buf.rect(bx, by - 8, 1, 9, hex('#e8e4d8'));
  for (let y = 0; y < 5; y++) {
    const half = [3, 5, 6, 7, 7][y];
    for (let x = -half; x <= half; x++) {
      const seg = Math.floor((x + 8) / 3) % 2 === 0;
      let c = seg ? a : b;
      if (x > half * 0.5) c = shade(c, 0.82);
      if (y === 4 && (x + 8) % 3 === 1) continue;
      buf.set(bx + x, by - 12 + y, c);
    }
  }
  return sprite(buf, bx, by);
}

// "For sale" sign that marks a few empty lots.
export function makeSaleSign() {
  const buf = spriteFromArt(
    [
      'wwwwwww',
      'wrrrrrw',
      'wrwrwrw',
      'wwwwwww',
      '...p...',
      '...p...',
    ],
    { w: hex('#f4f0e4'), r: hex('#d8432e'), p: hex('#6b4a2b') },
  );
  return sprite(buf, 3, 5);
}

const decorCache = new Map();
const VARIANTS = { palm: 10, tree: 9, pine: 8, bush: 3, boulder: 6, umbrella: 8 };
const MAKERS = { palm: makePalm, tree: makeTree, pine: makePine, bush: makeBush, boulder: makeBoulder, umbrella: makeUmbrella };

export function decorSprite(kind, v) {
  const variant = Math.abs(v | 0) % (VARIANTS[kind] || 1);
  const key = `${kind}:${variant}`;
  let s = decorCache.get(key);
  if (!s) {
    s = MAKERS[kind](variant + 1);
    decorCache.set(key, s);
  }
  return s;
}

// ---- vehicles -----------------------------------------------------------------

export const CAR_COLOURS = ['#d8402f', '#2f6fd0', '#f1efe8', '#f2c230', '#2f9a55', '#33373d', '#e9822c', '#7d5bc4', '#3cb7c4', '#c8ccd2'];

const GLASS = hex('#26405e');
const TYRE = hex('#1c1e22');

// dir: 0 +x, 1 +y, 2 -x, 3 -y (see DIRS in shared/world.js)
function makeVehicle(colourHex, dir, kind) {
  const body = hex(colourHex);
  const iso = new Iso(1, 1, 12, 3);
  const alongX = dir === 0 || dir === 2;
  const forward = dir === 0 || dir === 1;
  const len = kind === 'bus' ? 0.74 : kind === 'van' ? 0.56 : 0.46;
  const wid = kind === 'bus' ? 0.28 : 0.25;
  const a0 = 0.5 - len / 2;
  const a1 = 0.5 + len / 2;
  const b0 = 0.5 - wid / 2;
  const b1 = 0.5 + wid / 2;
  const R = (lo, hi, c0, c1) => (alongX ? [lo, c0, hi, c1] : [c0, lo, c1, hi]);
  const bodyH = kind === 'car' ? 3 : 6;
  const front = hex('#fff3b0');
  const rear = hex('#c8281c');
  const lamp = forward ? front : rear;

  // shadow under the vehicle
  iso.top(...R(a0 - 0.02, a1 + 0.05, b0, b1 + 0.06), 0, SHADOW);

  const sideLong = (c, k, l) => {
    if (k === 0) return c === 1 || c === 2 || c === l - 2 || c === l - 3 ? TYRE : shade(body, 0.6);
    if (kind !== 'car' && k >= 3 && k <= 4 && c > 0 && c < l - 1 && c % 3 !== 0) return GLASS;
    return alongX ? body : shade(body, 0.78);
  };
  const sideEnd = (c, k, l) => {
    if (k === 0) return shade(body, 0.6);
    if (k === 1 && (c === 0 || c === l - 1)) return lamp;
    if (kind !== 'car' && k >= 3 && k <= 4 && c > 0 && c < l - 1) return GLASS;
    return alongX ? shade(body, 0.78) : body;
  };
  const [x0, y0, x1, y1] = R(a0, a1, b0, b1);
  iso.box(x0, y0, x1, y1, 1, 1 + bodyH, {
    top: shade(body, 1.18),
    left: alongX ? sideLong : sideEnd,
    right: alongX ? sideEnd : sideLong,
  });
  if (kind === 'car') {
    // cabin sits toward the back of the car
    const c0 = forward ? a0 + len * 0.18 : a0 + len * 0.32;
    const c1 = c0 + len * 0.5;
    const [cx0, cy0, cx1, cy1] = R(c0, c1, b0 + 0.02, b1 - 0.02);
    const glassSide = (c, k, l, hgt) => (k === hgt - 1 ? shade(body, 0.95) : GLASS);
    iso.box(cx0, cy0, cx1, cy1, 4, 7, { top: shade(body, 1.1), left: glassSide, right: (c, k, l, hgt) => (k === hgt - 1 ? shade(body, 0.8) : shade(GLASS, 0.85)) });
  } else if (kind === 'bus') {
    iso.top(...R(a0 + 0.08, a1 - 0.08, b0 + 0.05, b1 - 0.05), 1 + bodyH, shade(body, 1.3));
  }
  return sprite(iso.buf, Math.round(iso.X(0.5, 0.5)), Math.round(iso.Y(0.5, 0.5)));
}

const vehicleCache = new Map();
export function vehicleSprite(colour, dir, kind = 'car') {
  const key = `${colour}:${dir}:${kind}`;
  let s = vehicleCache.get(key);
  if (!s) {
    s = makeVehicle(colour, dir, kind);
    vehicleCache.set(key, s);
  }
  return s;
}

// ---- people --------------------------------------------------------------------

const SKIN = ['#f1c9a0', '#d9a273', '#a8703f', '#7a4a26', '#f6dcc0'];
const HAIR = ['#2a1d14', '#5a3a1c', '#c9a14a', '#8a8a8a', '#111111', '#a2452a'];
export const SHIRTS = ['#e2493a', '#3a7bd5', '#f2c230', '#f4f1ea', '#37a866', '#8e5bd0', '#ef7fa8', '#2b2f38', '#f08a2c', '#38bcc8'];
const PANTS = ['#2f3b5c', '#4a4a4a', '#6b4a2b', '#d8d2c0', '#1f2a3a'];

const personCache = new Map();
// frame 0/1 = walk cycle; brolly = carrying an umbrella (rain)
export function personSprite(v, frame, brolly) {
  const key = `${v % 60}:${frame}:${brolly ? 1 : 0}`;
  let s = personCache.get(key);
  if (s) return s;
  const pal = {
    h: hex(HAIR[v % HAIR.length]),
    s: hex(SKIN[(v >> 1) % SKIN.length]),
    t: hex(SHIRTS[(v >> 2) % SHIRTS.length]),
    T: shade(hex(SHIRTS[(v >> 2) % SHIRTS.length]), 0.75),
    p: hex(PANTS[(v >> 3) % PANTS.length]),
    u: hex(SHIRTS[(v >> 1) % SHIRTS.length]),
    U: shade(hex(SHIRTS[(v >> 1) % SHIRTS.length]), 0.7),
    k: hex('#3a3a3a'),
  };
  const body = frame === 0
    ? ['.hh.', '.ss.', '.tT.', '.tT.', '.pp.', '.pp.']
    : ['.hh.', '.ss.', '.tT.', '.tT.', '.pp.', 'p..p'];
  const art = brolly ? ['.uuUU.', 'uuuuUU', '...k..'].concat(body.map((r) => `.${r}.`)) : body;
  const buf = spriteFromArt(art, pal);
  s = sprite(buf, brolly ? 3 : 2, art.length - 1);
  personCache.set(key, s);
  return s;
}

// ---- boats and birds ----------------------------------------------------------

export function makeSailboat(v, flip) {
  const sail = [hex('#f6f2e6'), hex('#e6564a'), hex('#f2c94c'), hex('#5ab0e0')][v % 4];
  const art = [
    '......s......',
    '.....ss......',
    '.....sss.....',
    '....ssss.....',
    '....sssst....',
    '...ssssstt...',
    '...ssssstt...',
    '..sssssttt...',
    '......m......',
    'hhhhhhhhhhhhh',
    '.HHHHHHHHHHH.',
    '..HHHHHHHHH..',
  ];
  let buf = spriteFromArt(art, { s: sail, t: shade(sail, 0.82), m: hex('#5a3a1c'), h: hex('#f4f0e4'), H: hex('#8a5a34') });
  if (flip) buf = buf.flipX();
  return sprite(buf, 6, 11);
}

export function makeGull(frame) {
  const art = frame === 0 ? ['w...w', '.w.w.', '..w..'] : ['.....', 'ww.ww', '..w..'];
  return sprite(spriteFromArt(art, { w: hex('#f8f8f4') }), 2, 2);
}
