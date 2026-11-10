// Tiny software rasteriser for crisp, un-antialiased pixel art.
// Everything on the island (terrain, buildings, trees, cars) is drawn into a
// PixelBuf first and then blitted to the screen with smoothing turned off.

export function pack(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function hex(str, a = 255) {
  const s = str.replace('#', '');
  const n = parseInt(s.length === 3 ? s.replace(/(.)/g, '$1$1') : s, 16);
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

export function unpack(c) {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// Multiply brightness (f > 1 lightens)
export function shade(c, f) {
  return pack(clamp255((c & 255) * f), clamp255(((c >>> 8) & 255) * f), clamp255(((c >>> 16) & 255) * f), c >>> 24);
}

export function mix(a, b, t) {
  const u = 1 - t;
  return pack(
    clamp255((a & 255) * u + (b & 255) * t),
    clamp255(((a >>> 8) & 255) * u + ((b >>> 8) & 255) * t),
    clamp255(((a >>> 16) & 255) * u + ((b >>> 16) & 255) * t),
    clamp255((a >>> 24) * u + (b >>> 24) * t),
  );
}

export function withAlpha(c, a) {
  return ((c & 0x00ffffff) | (a << 24)) >>> 0;
}

export function cssColor(c) {
  return `rgba(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255},${(c >>> 24) / 255})`;
}

export class PixelBuf {
  constructor(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    this.data = new Uint32Array(this.w * this.h);
  }

  set(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  get(x, y) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  // Alpha-blend a translucent colour over what is already there.
  blend(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = (c >>> 24) / 255;
    if (a >= 1) {
      this.data[y * this.w + x] = c;
      return;
    }
    const d = this.data[y * this.w + x];
    if (d >>> 24 === 0) {
      this.data[y * this.w + x] = c;
      return;
    }
    this.data[y * this.w + x] = pack(
      (c & 255) * a + (d & 255) * (1 - a),
      ((c >>> 8) & 255) * a + ((d >>> 8) & 255) * (1 - a),
      ((c >>> 16) & 255) * a + ((d >>> 16) & 255) * (1 - a),
      Math.max(d >>> 24, c >>> 24),
    );
  }

  rect(x, y, w, h, c) {
    x |= 0;
    y |= 0;
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let yy = Math.max(0, y); yy < y1; yy++) {
      for (let xx = Math.max(0, x); xx < x1; xx++) this.data[yy * this.w + xx] = c;
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  // Scanline polygon fill sampling pixel centres. `paint` is a packed colour
  // or a function (x, y) => colour (return 0 to skip the pixel).
  poly(pts, paint) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const y0 = Math.max(0, Math.ceil(minY - 0.5));
    const y1 = Math.min(this.h - 1, Math.floor(maxY - 0.5));
    const fn = typeof paint === 'function' ? paint : null;
    const n = pts.length;
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
          xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
        const xb = Math.min(this.w - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
        const row = y * this.w;
        if (fn) {
          for (let x = xa; x <= xb; x++) {
            const c = fn(x, y);
            if (c) this.data[row + x] = c;
          }
        } else {
          for (let x = xa; x <= xb; x++) this.data[row + x] = paint;
        }
      }
    }
  }

  // Filled ellipse (used for domes, silos, ponds, tree crowns)
  ellipse(cx, cy, rx, ry, paint) {
    const fn = typeof paint === 'function' ? paint : null;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const c = fn ? fn(x, y) : paint;
          if (c) this.set(x, y, c);
        }
      }
    }
  }

  // Copy another buffer on top (pixels with zero alpha are skipped).
  blit(src, dx, dy) {
    dx |= 0;
    dy |= 0;
    for (let y = 0; y < src.h; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= this.h) continue;
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + x];
        if (c >>> 24 === 0) continue;
        const tx = x + dx;
        if (tx < 0 || tx >= this.w) continue;
        if (c >>> 24 === 255) this.data[ty * this.w + tx] = c;
        else this.blend(tx, ty, c);
      }
    }
  }

  flipX() {
    const out = new PixelBuf(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) out.data[y * this.w + (this.w - 1 - x)] = this.data[y * this.w + x];
    }
    return out;
  }

  // Dark 1px outline around the opaque shape (gives sprites a readable edge).
  outline(c) {
    const src = this.data.slice();
    const w = this.w;
    const h = this.h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[y * w + x] >>> 24) continue;
        const near =
          (x > 0 && src[y * w + x - 1] >>> 24) ||
          (x < w - 1 && src[y * w + x + 1] >>> 24) ||
          (y > 0 && src[(y - 1) * w + x] >>> 24) ||
          (y < h - 1 && src[(y + 1) * w + x] >>> 24);
        if (near) this.data[y * w + x] = c;
      }
    }
    return this;
  }

  // Tight bounding box of non-transparent pixels, or null if empty.
  bounds() {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.data[y * this.w + x] >>> 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const img = new ImageData(new Uint8ClampedArray(this.data.buffer, this.data.byteOffset, this.data.byteLength), this.w, this.h);
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv;
  }
}

// Build a sprite from rows of characters and a palette map.
//   art: ['..aa..', '.abba.'], palette: { a: colour, b: colour }, '.' = empty
export function spriteFromArt(art, palette) {
  const h = art.length;
  const w = Math.max(...art.map((r) => r.length));
  const buf = new PixelBuf(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < art[y].length; x++) {
      const ch = art[y][x];
      if (ch === '.' || ch === ' ') continue;
      const c = palette[ch];
      if (c !== undefined) buf.data[y * w + x] = c;
    }
  }
  return buf;
}
