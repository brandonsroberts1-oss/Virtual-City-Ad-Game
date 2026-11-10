// Isometric sculpting toolkit: boxes, walls with window patterns, roofs,
// cylinders. Buildings and vehicles are assembled from these primitives.
//
// Local coordinates: x and y in tiles (matching the world axes), z in pixels.
// Only the two camera-facing walls of a box are ever visible:
//   "left" wall  = the +y face (lit),   "right" wall = the +x face (in shade).

import { PixelBuf, shade } from './pixel.js';

export class Iso {
  constructor(w, h, zmax, pad = 2) {
    this.w = w;
    this.h = h;
    this.zmax = zmax;
    this.pad = pad;
    this.ox = h * 16 + pad;       // buffer x of local (0, 0)
    this.oy = zmax + pad;         // buffer y of local (0, 0, 0)
    this.buf = new PixelBuf((w + h) * 16 + pad * 2, (w + h) * 8 + zmax + pad * 2);
  }

  X(x, y) {
    return this.ox + (x - y) * 16;
  }

  Y(x, y, z = 0) {
    return this.oy + (x + y) * 8 - z;
  }

  P(x, y, z = 0) {
    return [this.X(x, y), this.Y(x, y, z)];
  }

  // Buffer pixel -> local tile coordinates on the plane at height z.
  local(px, py, z = 0) {
    const a = (px + 0.5 - this.ox) / 16;
    const b = (py + 0.5 - this.oy + z) / 8;
    return [(a + b) / 2, (b - a) / 2];
  }

  // Horizontal rectangle at height z.
  top(x0, y0, x1, y1, z, paint) {
    this.buf.poly([this.P(x0, y0, z), this.P(x1, y0, z), this.P(x1, y1, z), this.P(x0, y1, z)], paint);
  }

  // Arbitrary polygon through 3D points [x, y, z].
  face(points, paint) {
    this.buf.poly(points.map((p) => this.P(p[0], p[1], p[2] || 0)), paint);
  }

  // Vertical wall standing on the ground segment A->B between heights z0..z1.
  // `paint` may be a colour or (c, k, len, hgt) => colour, where c is the
  // pixel column along the wall and k the pixel height above its base.
  wall(ax, ay, bx, by, z0, z1, paint) {
    let xa = this.X(ax, ay);
    let ya = this.Y(ax, ay, z0);
    let xb = this.X(bx, by);
    let yb = this.Y(bx, by, z0);
    if (xb < xa) {
      [xa, xb] = [xb, xa];
      [ya, yb] = [yb, ya];
    }
    const hgt = z1 - z0;
    if (hgt <= 0 || xa === xb) return;
    const pts = [[xa, ya - hgt], [xb, yb - hgt], [xb, yb], [xa, ya]];
    if (typeof paint !== 'function') {
      this.buf.poly(pts, paint);
      return;
    }
    const len = xb - xa;
    const slope = (yb - ya) / (xb - xa);
    this.buf.poly(pts, (x, y) => {
      const base = ya + (x + 0.5 - xa) * slope;
      let k = Math.floor(base - (y + 0.5));
      if (k < 0) k = 0;
      else if (k > hgt - 1) k = hgt - 1;
      return paint(x - xa, k, len, hgt);
    });
  }

  wallLeft(x0, x1, y, z0, z1, paint) {
    this.wall(x0, y, x1, y, z0, z1, paint);
  }

  wallRight(x, y0, y1, z0, z1, paint) {
    this.wall(x, y1, x, y0, z0, z1, paint);
  }

  // A box showing its top and its two camera-facing walls.
  box(x0, y0, x1, y1, z0, z1, { top, left, right }) {
    if (left !== null) this.wallLeft(x0, x1, y1, z0, z1, left);
    if (right !== null) this.wallRight(x1, y0, y1, z0, z1, right);
    if (top !== null) this.top(x0, y0, x1, y1, z1, top);
  }

  // Gabled roof. axis 'x' => ridge runs along x (triangular end on the right
  // wall); axis 'y' => ridge along y (triangular end on the left wall).
  gable(x0, y0, x1, y1, z, rise, axis, { lit, dark, end, over = 0 }) {
    const a0 = x0 - over;
    const b0 = y0 - over;
    const a1 = x1 + over;
    const b1 = y1 + over;
    const zr = z + rise;
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      this.face([[a0, b0, z], [a1, b0, z], [a1, ym, zr], [a0, ym, zr]], dark);
      this.face([[x1, y0, z], [x1, y1, z], [x1, ym, zr]], end);
      this.face([[a0, b1, z], [a1, b1, z], [a1, ym, zr], [a0, ym, zr]], lit);
    } else {
      const xm = (x0 + x1) / 2;
      this.face([[a0, b0, z], [a0, b1, z], [xm, b1, zr], [xm, b0, zr]], shade(lit, 0.92));
      this.face([[x0, y1, z], [x1, y1, z], [xm, y1, zr]], end);
      this.face([[a1, b0, z], [a1, b1, z], [xm, b1, zr], [xm, b0, zr]], dark);
    }
  }

  // Hipped roof; inset = how far the ridge is pulled in from each end (tiles).
  // With a large inset it becomes a pyramid.
  hip(x0, y0, x1, y1, z, rise, { lit, dark, over = 0 }) {
    const a0 = x0 - over;
    const b0 = y0 - over;
    const a1 = x1 + over;
    const b1 = y1 + over;
    const zr = z + rise;
    const w = a1 - a0;
    const h = b1 - b0;
    const inset = Math.min(w, h) / 2;
    const rx0 = a0 + inset;
    const rx1 = a1 - inset;
    const ry0 = b0 + inset;
    const ry1 = b1 - inset;
    // back faces first, then the two that face the camera
    this.face([[a0, b0, z], [a1, b0, z], [rx1, ry0, zr], [rx0, ry0, zr]], shade(dark, 0.9));
    this.face([[a0, b0, z], [a0, b1, z], [rx0, ry1, zr], [rx0, ry0, zr]], shade(lit, 0.9));
    this.face([[a1, b0, z], [a1, b1, z], [rx1, ry1, zr], [rx1, ry0, zr]], dark);
    this.face([[a0, b1, z], [a1, b1, z], [rx1, ry1, zr], [rx0, ry1, zr]], lit);
  }

  // Upright cylinder centred on (cx, cy) with radius r tiles.
  cylinder(cx, cy, r, z0, z1, { side, top }) {
    const px = this.X(cx, cy);
    const rx = r * 22.6;
    const ry = r * 11.3;
    const yb = this.Y(cx, cy, z0);
    const yt = this.Y(cx, cy, z1);
    const paintSide = (x) => {
      const t = (x + 0.5 - (px - rx)) / (2 * rx);
      return t < 0.25 ? shade(side, 1.12) : t < 0.6 ? side : t < 0.85 ? shade(side, 0.85) : shade(side, 0.72);
    };
    this.buf.ellipse(px, yb, rx, ry, (x) => paintSide(x));
    for (let y = Math.round(yt); y <= Math.round(yb); y++) {
      for (let x = Math.ceil(px - rx - 0.5); x <= Math.floor(px + rx - 0.5); x++) this.buf.set(x, y, paintSide(x));
    }
    this.buf.ellipse(px, yt, rx, ry, top);
  }

  // Dome / cone sitting on a circle of radius r tiles.
  dome(cx, cy, r, z, rise, colour) {
    const px = this.X(cx, cy);
    const rx = r * 22.6;
    const ry = r * 11.3;
    const yb = this.Y(cx, cy, z);
    this.buf.ellipse(px, yb - rise / 2, rx, ry + rise / 2, (x, y) => {
      if (y > yb && Math.pow((x + 0.5 - px) / rx, 2) + Math.pow((y + 0.5 - yb) / ry, 2) > 1) return 0;
      const t = (x + 0.5 - (px - rx)) / (2 * rx) + (y - (yb - rise)) / (rise + ry) * 0.25;
      return t < 0.35 ? shade(colour, 1.15) : t < 0.7 ? colour : shade(colour, 0.8);
    });
  }

  cone(cx, cy, r, z, rise, { lit, dark }) {
    const px = this.X(cx, cy);
    const rx = r * 22.6;
    const ry = r * 11.3;
    const yb = this.Y(cx, cy, z);
    const apex = [px, yb - rise];
    this.buf.poly([[px - rx, yb], apex, [px, yb + ry]], lit);
    this.buf.poly([[px, yb + ry], apex, [px + rx, yb]], dark);
    this.buf.ellipse(px, yb, rx, ry, (x, y) => (y >= yb ? (x < px ? lit : dark) : 0));
  }

  // Thin vertical pole.
  pole(x, y, z0, z1, colour, width = 1) {
    const px = Math.round(this.X(x, y)) - (width >> 1);
    this.buf.rect(px, Math.round(this.Y(x, y, z1)), width, z1 - z0, colour);
  }

  // Stamp another sprite so that its anchor lands on local point (x, y, z).
  stamp(sprite, x, y, z = 0) {
    this.buf.blit(sprite.buf, Math.round(this.X(x, y)) - sprite.ax, Math.round(this.Y(x, y, z)) - sprite.ay);
  }
}

// ---- wall textures ---------------------------------------------------------

// Regular grid of windows. Options are in pixels.
export function windowWall({ wall, glass, lit = 0, frame = 0, floorH = 7, winH = 3, winW = 2, gap = 2, sill = 2, margin = 2, seed = 1, litChance = 0.18, base = 0, baseH = 0, trim = 0 }) {
  const cell = winW + gap;
  return (c, k, len, hgt) => {
    if (baseH && k < baseH) return base || shade(wall, 0.85);
    if (trim && k === hgt - 1) return trim;
    const kk = k - baseH;
    const fl = Math.floor(kk / floorH);
    const fk = kk % floorH;
    const usable = len - margin * 2;
    const cols = Math.floor((usable + gap) / cell);
    const start = margin + Math.floor((usable - (cols * cell - gap)) / 2);
    const cc = c - start;
    if (cc < 0 || cols <= 0) return wall;
    const col = Math.floor(cc / cell);
    const ck = cc % cell;
    if (col >= cols || ck >= winW) return wall;
    if (fk < sill || fk >= sill + winH) return wall;
    if ((fl + 1) * floorH > hgt - baseH + 1) return wall;
    if (lit) {
      const r = Math.abs(Math.sin((col + 1) * 12.9898 + (fl + 1) * 78.233 + seed * 37.719)) * 43758.5453;
      if (r - Math.floor(r) < litChance) return lit;
    }
    if (frame && fk === sill + winH - 1) return frame;
    return fk === sill + winH - 1 && winH > 2 ? shade(glass, 1.25) : glass;
  };
}

// Glass curtain wall: bands of glass split by mullions and floor slabs.
export function curtainWall({ glass, glass2, mullion, floorH = 5, bay = 4, seed = 1, litChance = 0.1, lit = 0, crown = 0, base = 0, baseH = 0 }) {
  return (c, k, len, hgt) => {
    if (baseH && k < baseH) return base;
    if (crown && k >= hgt - 2) return crown;
    const kk = k - baseH;
    if (kk % floorH === floorH - 1) return mullion;
    if (c % bay === 0) return mullion;
    const fl = Math.floor(kk / floorH);
    const col = Math.floor(c / bay);
    const r = Math.abs(Math.sin((col + 1) * 12.9898 + (fl + 1) * 78.233 + seed * 37.719)) * 43758.5453;
    const f = r - Math.floor(r);
    if (lit && f < litChance) return lit;
    return f > 0.55 ? glass2 : glass;
  };
}

// Horizontal boards / stripes (barns, awnings, siding).
export function stripes(a, b, every = 2, vertical = false) {
  return (c, k) => ((vertical ? c : k) % (every * 2) < every ? a : b);
}

export { PixelBuf };
