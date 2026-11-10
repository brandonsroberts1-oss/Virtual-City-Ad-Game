// Sprites for the pre-placed civic buildings (the ones that take donations).

import { hash2 } from '/shared/world.js';
import { hex, shade } from './pixel.js';
import { Iso, windowWall } from './isodraw.js';
import { sprite, decorSprite, vehicleSprite, makeUmbrella } from './sprites.js';
import { _kit } from './buildings.js';

const { lawn, plaza, hedgeBox, backHedges, path, fountain, flowers, withDoor, flatRoof, tree, bush, palmTree, WHITE, STONE, DARK, WOOD, WOOD_D, WATER, WATER_L, GLASS, LIT } = _kit;

const RED = hex('#d8362c');

function pair(opts) {
  return {
    left: windowWall({ floorH: 7, winH: 3, winW: 2, gap: 2, sill: 2, margin: 2, lit: LIT, litChance: 0.12, glass: GLASS, ...opts }),
    right: windowWall({ floorH: 7, winH: 3, winW: 2, gap: 2, sill: 2, margin: 2, lit: shade(LIT, 0.9), litChance: 0.12, ...opts, glass: shade(opts.glass || GLASS, 0.85), wall: shade(opts.wall, 0.8), seed: (opts.seed || 1) + 4 }),
  };
}

function fence(iso, ax, ay, bx, by, colour = WHITE) {
  const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) * 4));
  for (let i = 0; i <= steps; i++) iso.pole(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps, 0, 3, colour);
  iso.buf.line(iso.X(ax, ay), iso.Y(ax, ay, 2), iso.X(bx, by), iso.Y(bx, by, 2), colour);
}

function flag(iso, x, y, colour) {
  iso.pole(x, y, 0, 16, hex('#d8d8d8'));
  const px = Math.round(iso.X(x, y));
  const py = Math.round(iso.Y(x, y, 16));
  iso.buf.rect(px + 1, py, 5, 3, colour);
  iso.buf.rect(px + 1, py + 1, 5, 1, shade(colour, 1.3));
}

function hospital(iso, w, h) {
  plaza(iso, 0, 0, w, h, hex('#d9d6cb'));
  lawn(iso, 0.1, h - 0.7, 1.0, h - 0.12);
  const wall = hex('#f2f4f5');
  const glass = hex('#4f86ad');
  const main = pair({ wall, glass, winW: 3, gap: 1, floorH: 7, seed: 3, trim: hex('#c6ccd0') });
  const H = 6 * 7 + 3;
  // low wing behind/left, main tower, right wing
  const wing = pair({ wall, glass, winW: 3, gap: 1, seed: 8, trim: hex('#c6ccd0') });
  iso.box(0.2, 0.5, 0.8, 1.7, 0, 24, { top: null, left: wing.left, right: null });
  flatRoof(iso, 0.2, 0.5, 0.8, 1.7, 24, hex('#d5d8da'), hex('#b9bdc0'));
  const BLUE = hex('#2f6fd0');
  const cross = (fn) => (c, k, len, hgt) => {
    // blue "H" hospital sign near the top of the facade
    const cx = Math.round(len / 2);
    const cy = hgt - 8;
    const dx = Math.abs(c - cx);
    const dy = Math.abs(k - cy);
    if (dx <= 4 && dy <= 4) return dx <= 3 && dy <= 3 && (dx === 2 || (dy === 0 && dx < 2)) ? WHITE : BLUE;
    return fn(c, k, len, hgt);
  };
  const canopy = (fn) => (c, k, len, hgt) => (k < 7 && Math.abs(c - len / 2) < 6 ? (k === 6 ? RED : k < 5 && Math.abs(c - len / 2) < 4 ? hex('#8fc3de') : wall) : fn(c, k, len, hgt));
  iso.box(0.8, 0.3, 2.1, 1.8, 0, H, { top: null, left: cross(canopy(main.left)), right: cross(main.right) });
  flatRoof(iso, 0.8, 0.3, 2.1, 1.8, H, hex('#d5d8da'), hex('#a9adb1'));
  // helipad
  const hx = iso.X(1.45, 1.05);
  const hy = iso.Y(1.45, 1.05, H);
  iso.buf.ellipse(hx, hy, 11, 5.5, RED);
  iso.buf.ellipse(hx, hy, 9.5, 4.5, (px, py) => (Math.abs(px - hx) > 2.2 && Math.abs(px - hx) < 4 && Math.abs(py - hy) < 3 ? WHITE : Math.abs(py - hy) < 0.8 && Math.abs(px - hx) < 3.5 ? WHITE : hex('#5d646c')));
  iso.box(2.1, 0.5, 2.8, 1.6, 0, 17, { top: null, left: wing.left, right: wing.right });
  flatRoof(iso, 2.1, 0.5, 2.8, 1.6, 17, hex('#d5d8da'), hex('#b9bdc0'));
  // entrance canopy
  iso.face([[1.15, 1.8, 8], [1.75, 1.8, 8], [1.75, 2.1, 7], [1.15, 2.1, 7]], RED);
  iso.pole(1.17, 2.08, 0, 7, WHITE);
  iso.pole(1.73, 2.08, 0, 7, WHITE);
  iso.stamp(vehicleSprite('#f1efe8', 0, 'van'), 2.3, 2.35);
  const ax = Math.round(iso.X(2.3, 2.35));
  const ay = Math.round(iso.Y(2.3, 2.35));
  iso.buf.rect(ax - 3, ay - 5, 4, 1, RED);
  tree(iso, 0.4, h - 0.4, 2);
  tree(iso, 0.85, h - 0.3, 5);
  tree(iso, w - 0.25, 0.4, 3);
  bush(iso, w - 0.3, h - 0.25, 1);
}

function school(iso, w, h) {
  lawn(iso, 0, 0, w, h);
  backHedges(iso, w, h);
  // playground
  iso.top(w - 0.95, h - 0.85, w - 0.15, h - 0.15, 0, (x, y) => (hash2(x, y) < 0.1 ? hex('#dcc47c') : hex('#e9d48e')));
  const brick = hex('#c9744f');
  const wp = pair({ wall: brick, glass: hex('#e8f1f6'), lit: 0, winW: 2, gap: 1, seed: 2, trim: WHITE });
  const H = 2 * 7 + 2;
  iso.box(0.25, 0.22, 2.35, 1.0, 0, H, { top: null, left: wp.left, right: wp.right });
  iso.gable(0.25, 0.22, 2.35, 1.0, H, 8, 'x', { lit: hex('#5d646c'), dark: hex('#454b52'), end: shade(brick, 0.8), over: 0.05 });
  // clock tower over the entrance
  const tw = pair({ wall: brick, glass: hex('#e8f1f6'), lit: 0, winW: 2, gap: 1, margin: 1, seed: 5 });
  const clock = (fn) => (c, k, len, hgt) => {
    const dx = c - len / 2 + 0.5;
    const dy = k - (hgt - 5);
    if (dx * dx + dy * dy < 6.5) return dx * dx + dy * dy < 0.6 || (dx === 0.5 && dy > 0 && dy < 2.2) ? DARK : WHITE;
    return fn(c, k, len, hgt);
  };
  iso.box(1.05, 0.72, 1.5, 1.1, 0, H + 13, { top: null, left: withDoor(clock(tw.left), WOOD, 0.5, 3, 6, WHITE), right: tw.right });
  iso.hip(1.05, 0.72, 1.5, 1.1, H + 13, 7, { lit: RED, dark: shade(RED, 0.72), over: 0.04 });
  path(iso, 1.17, 1.1, 1.38, h);
  flag(iso, 0.75, 1.35, hex('#2f6fd0'));
  iso.stamp(vehicleSprite('#f2c230', 0, 'bus'), 2.0, 1.55);
  // swing set + slide hints
  const sx = Math.round(iso.X(w - 0.55, h - 0.5));
  const sy = Math.round(iso.Y(w - 0.55, h - 0.5));
  iso.buf.rect(sx - 4, sy - 6, 1, 6, RED);
  iso.buf.rect(sx + 4, sy - 4, 1, 6, RED);
  iso.buf.line(sx - 4, sy - 6, sx + 4, sy - 4, RED);
  iso.buf.set(sx, sy - 2, hex('#2f6fd0'));
  iso.buf.set(sx - 1, sy - 2, hex('#2f6fd0'));
  tree(iso, 0.35, h - 0.3, 4);
  tree(iso, 2.6, 0.45, 7);
}

function university(iso, w, h) {
  lawn(iso, 0, 0, w, h);
  backHedges(iso, w, h);
  const stone = hex('#e6dcc4');
  const roof = { lit: hex('#a8553c'), dark: hex('#7f3d2a') };
  const wp = pair({ wall: stone, winH: 4, seed: 6, trim: WHITE });
  // quad paths
  path(iso, 1.85, 1.25, 2.15, h);
  path(iso, 0.3, h - 0.95, w - 0.3, h - 0.75);
  // left wing, hall, right wing
  iso.box(0.25, 0.42, 1.25, 1.1, 0, 16, { top: null, left: wp.left, right: null });
  iso.hip(0.25, 0.42, 1.3, 1.1, 16, 7, { ...roof, over: 0.05 });
  const columns = (c, k, len, hgt) => {
    if (k >= hgt - 2) return WHITE;
    if (c > len * 0.2 && c < len * 0.8) return c % 3 === 0 ? WHITE : k < 2 ? shade(stone, 0.8) : hex('#3b3430');
    return wp.left(c, k, len, hgt);
  };
  iso.box(1.25, 0.25, 2.75, 1.25, 0, 23, { top: null, left: columns, right: wp.right });
  flatRoof(iso, 1.25, 0.25, 2.75, 1.25, 23, shade(stone, 0.92), shade(stone, 0.8));
  iso.face([[1.45, 1.25, 23], [2.55, 1.25, 23], [2.0, 1.25, 31]], WHITE);
  // dome on a drum
  iso.cylinder(2.0, 0.72, 0.3, 23, 29, { side: stone, top: stone });
  iso.dome(2.0, 0.72, 0.3, 29, 10, hex('#5fa7a0'));
  iso.pole(2.0, 0.72, 39, 44, hex('#e6b93a'));
  iso.box(2.75, 0.42, 3.75, 1.1, 0, 16, { top: null, left: wp.left, right: wp.right });
  iso.hip(2.7, 0.42, 3.75, 1.1, 16, 7, { ...roof, over: 0.05 });
  // steps
  iso.box(1.6, 1.25, 2.4, 1.36, 0, 2, { top: WHITE, left: shade(WHITE, 0.9), right: shade(WHITE, 0.8) });
  fountain(iso, 2.0, h - 0.85);
  for (const [tx, ty, n] of [[0.45, 1.6, 1], [0.5, h - 0.4, 6], [1.3, h - 0.35, 3], [2.8, h - 0.35, 8], [3.55, 1.6, 2], [3.6, h - 0.4, 5]]) tree(iso, tx, ty, n);
  flowers(iso, 2.35, 1.45, 3.3, 1.62, 3);
  flowers(iso, 0.75, 1.45, 1.65, 1.62, 7);
  flag(iso, 1.5, 1.5, hex('#7d2a3a'));
}

function foodbank(iso, w, h) {
  plaza(iso, 0, 0, w, h, hex('#cfcbbf'));
  const wall = hex('#e8e2c8');
  const green = hex('#3d9a55');
  const sheet = (f) => (c, k, len, hgt) => {
    if (k === hgt - 1) return shade(green, f);
    if (k < 6 && c > len * 0.55 && c < len * 0.9) return k === 5 ? shade(DARK, f) : shade(hex('#6a7078'), f * (k % 2 ? 1 : 0.9));
    return c % 2 === 0 ? shade(wall, f) : shade(wall, f * 0.94);
  };
  const H = 14;
  iso.box(0.15, 0.15, 1.5, 1.2, 0, H, { top: null, left: withDoor(sheet(1), hex('#2b2f38'), 0.22, 3, 6, WHITE), right: sheet(0.8) });
  iso.gable(0.15, 0.15, 1.5, 1.2, H, 5, 'x', { lit: hex('#9aa0a6'), dark: hex('#757b82'), end: shade(wall, 0.8), over: 0.04 });
  // sign: green board with a white heart
  iso.box(0.35, 1.14, 1.3, 1.2, H - 1, H + 8, {
    top: shade(green, 0.7),
    right: shade(green, 0.7),
    left: (c, k, len, hgt) => {
      const dx = Math.abs(c - 4.5);
      const dy = hgt - 1 - k - 3;
      const heart = (dy === 0 && dx >= 0.5 && dx <= 2.5) || (dy === 1 && dx <= 3) || (dy === 2 && dx <= 2.5) || (dy === 3 && dx <= 1.5) || (dy === 4 && dx <= 0.5);
      if (heart) return WHITE;
      if ((k === 3 || k === 5) && c > 9 && c < len - 2 && c % 4 !== 0) return WHITE;
      return green;
    },
  });
  // crates and a delivery van
  for (const [cx, cy, z] of [[0.25, 1.4, 0], [0.42, 1.4, 0], [0.33, 1.42, 3], [0.62, 1.45, 0]]) iso.box(cx, cy, cx + 0.14, cy + 0.14, z, z + 3, { top: hex('#c79a5c'), left: WOOD, right: WOOD_D });
  iso.stamp(vehicleSprite('#f1efe8', 1, 'van'), 1.72, 1.1);
  tree(iso, w - 0.25, 0.35, 6);
  bush(iso, 0.2, h - 0.2, 2);
  bush(iso, w - 0.3, h - 0.2, 0);
}

function park(iso, w, h) {
  lawn(iso, 0, 0, w, h, [hex('#58ad48'), hex('#66b852'), hex('#4c9f40')]);
  const cx = w / 2;
  const cy = h / 2;
  const gravel = hex('#dccfae');
  // paths: a cross and a ring around the fountain
  path(iso, 0, cy - 0.12, w, cy + 0.12, gravel);
  path(iso, cx - 0.12, 0, cx + 0.12, h, gravel);
  iso.buf.ellipse(iso.X(cx, cy), iso.Y(cx, cy), 17, 8.5, gravel);
  // pond
  const px = iso.X(w - 1.2, h - 1.0);
  const py = iso.Y(w - 1.2, h - 1.0);
  iso.buf.ellipse(px, py, 19, 8.5, hex('#3f8a42'));
  iso.buf.ellipse(px, py, 17, 7, (x, y) => (hash2(x >> 1, y) > 0.86 ? WATER_L : WATER));
  iso.buf.set(px - 5, py - 1, WHITE);
  iso.buf.set(px - 4, py - 1, WHITE);
  iso.buf.set(px - 3, py - 2, hex('#f08a2c'));
  hedgeBox(iso, 0.04, 0.03, w - 0.04, 0.1);
  hedgeBox(iso, 0.03, 0.04, 0.1, cy - 0.2);
  hedgeBox(iso, 0.03, cy + 0.2, 0.1, h - 0.04);
  flowers(iso, 0.35, 0.35, 1.3, 0.6, 2);
  flowers(iso, cx + 0.45, 0.35, w - 0.4, 0.6, 9);
  // bandstand
  const gx = 1.0;
  const gy = h - 1.0;
  iso.cylinder(gx, gy, 0.3, 0, 2, { side: STONE, top: hex('#d9d2bf') });
  for (const [dx, dy] of [[-0.24, 0], [0.24, 0], [0, 0.24], [0, -0.24], [-0.17, 0.17], [0.17, 0.17]]) iso.pole(gx + dx, gy + dy, 2, 10, WHITE);
  iso.cone(gx, gy, 0.36, 10, 8, { lit: RED, dark: shade(RED, 0.72) });
  const trees = [[0.5, 1.2, 0], [1.6, 0.95, 3], [0.45, cy + 0.6, 5], [cx + 0.7, 1.1, 7], [w - 0.5, 0.9, 2], [w - 0.45, cy - 0.45, 4], [cx - 0.7, cy + 0.55, 8], [cx + 0.55, h - 0.4, 1], [w - 0.35, h - 0.3, 6], [cx - 0.5, h - 0.35, 3], [2.0, cy - 0.55, 6], [cx + 1.3, cy - 0.5, 0]];
  trees.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [tx, ty, n] of trees) tree(iso, tx, ty, n);
  fountain(iso, cx, cy);
  // benches
  for (const [bx, by] of [[cx - 0.5, cy - 0.3], [cx + 0.45, cy + 0.32]]) iso.box(bx, by, bx + 0.22, by + 0.07, 1, 3, { top: hex('#a57a4a'), left: WOOD, right: WOOD_D });
  hedgeBox(iso, w - 0.1, 0.04, w - 0.03, cy - 0.2);
  hedgeBox(iso, w - 0.1, cy + 0.2, w - 0.03, h - 0.04);
  hedgeBox(iso, 0.04, h - 0.1, cx - 0.2, h - 0.03);
  hedgeBox(iso, cx + 0.2, h - 0.1, w - 0.04, h - 0.03);
}

function beachpark(iso, w, h) {
  const sand = [hex('#e9d48e'), hex('#f2dfa0'), hex('#dcc47c')];
  iso.top(0, 0, w, h, 0, (x, y) => {
    const n = hash2(x, y);
    return n < 0.07 ? sand[2] : n > 0.93 ? sand[1] : sand[0];
  });
  lawn(iso, 0.08, 0.08, 1.05, 0.95);
  // boardwalk
  iso.top(0, 1.0, w, 1.2, 0, (x) => (x % 3 === 0 ? WOOD_D : hex('#b98a56')));
  palmTree(iso, 0.3, 0.35, 2);
  palmTree(iso, 1.75, 0.3, 5);
  // thatched pavilion
  const posts = [[0.5, 0.45], [0.95, 0.45], [0.5, 0.85], [0.95, 0.85]];
  for (const [px, py] of posts) iso.pole(px, py, 0, 9, WOOD);
  iso.hip(0.4, 0.35, 1.05, 0.95, 9, 7, { lit: hex('#d9b860'), dark: hex('#b08e3e'), over: 0.06 });
  iso.stamp(makeUmbrella(1), 1.5, 0.75);
  iso.stamp(makeUmbrella(2), 0.5, 1.6);
  iso.stamp(makeUmbrella(4), 1.45, 1.6);
  palmTree(iso, 1.8, 1.75, 8);
  palmTree(iso, 0.2, 1.85, 1);
}

function lookout(iso, w, h) {
  plaza(iso, 0, 0, w, h, hex('#c2bba8'));
  lawn(iso, 0.1, 0.1, 0.9, 0.8);
  tree(iso, 0.35, 0.4, 4);
  iso.stamp(decorSprite('pine', 3), 0.75, 0.3);
  // gazebo
  const gx = 1.25;
  const gy = 0.7;
  iso.cylinder(gx, gy, 0.3, 0, 2, { side: STONE, top: hex('#d9d2bf') });
  for (const [dx, dy] of [[-0.24, 0], [0.24, 0], [0, 0.24], [0, -0.24], [-0.17, 0.17], [0.17, 0.17]]) iso.pole(gx + dx, gy + dy, 2, 10, WHITE);
  iso.cone(gx, gy, 0.36, 10, 8, { lit: hex('#3f8f5a'), dark: hex('#2d6a42') });
  // benches and a coin telescope
  iso.box(0.45, 1.35, 0.75, 1.42, 1, 3, { top: hex('#a57a4a'), left: WOOD, right: WOOD_D });
  iso.pole(1.55, 1.6, 0, 5, hex('#5d646c'));
  iso.buf.rect(Math.round(iso.X(1.55, 1.6)) - 1, Math.round(iso.Y(1.55, 1.6, 6)), 3, 2, hex('#2f6fd0'));
  flag(iso, 1.75, 0.25, RED);
  // railing along the cliff edge
  fence(iso, 0.05, h - 0.05, w - 0.05, h - 0.05, WHITE);
  fence(iso, w - 0.05, 0.05, w - 0.05, h - 0.05, WHITE);
}

const GEN = { hospital, school, university, foodbank, park, beachpark, lookout };
const HEIGHT = { hospital: 70, school: 50, university: 60, foodbank: 40, park: 40, beachpark: 44, lookout: 40 };
const cache = new Map();

export function civicSprite(c) {
  const key = `${c.kind}:${c.w}x${c.h}`;
  let s = cache.get(key);
  if (s) return s;
  const iso = new Iso(c.w, c.h, HEIGHT[c.kind] || 50, 2);
  (GEN[c.kind] || park)(iso, c.w, c.h);
  s = sprite(iso.buf, iso.ox, iso.oy);
  cache.set(key, s);
  return s;
}


