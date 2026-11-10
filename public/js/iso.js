// Isometric projection shared by every renderer module.
// A tile is 32x16 pixels on screen and one height level lifts it by 8 pixels.

import { N, MAX_H } from '/shared/world.js';

export const TW = 32;
export const TH = 16;
export const HW = 16;
export const HH = 8;
export const ZH = 8;

// The map image extends a few tiles past the grid on every side so the
// shallows and surf can fade out into open sea instead of being cut off.
export const MARGIN = 8;
export const PAD_TOP = MAX_H * ZH + 8;
export const OX = (N + 2 * MARGIN) * HW;
export const OY = PAD_TOP + 2 * MARGIN * HH;
export const MAP_W = (N + 2 * MARGIN) * TW;
export const MAP_H = (2 * N + 4 * MARGIN) * HH + PAD_TOP + 8;

// Tile-space (may be fractional) + height level -> map pixel
export function sx(x, y) {
  return (x - y) * HW + OX;
}
export function sy(x, y, h = 0) {
  return (x + y) * HH - h * ZH + OY;
}

// Map pixel -> tile-space on the plane at height level h
export function unproject(px, py, h = 0) {
  const a = (px - OX) / HW;
  const b = (py - OY + h * ZH) / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
