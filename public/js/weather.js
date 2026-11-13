// Weather: clear skies, drifting cloud, rain, thunderstorms and sea fog.
// In "auto" mode the weather is derived from the wall clock, so every visitor
// sees the same sky at the same time.

import { hash2 } from '/shared/world.js';
import { PixelBuf, pack } from './pixel.js';
import { MAP_W, MAP_H } from './iso.js';

export const WEATHER = {
  clear: { name: 'Clear', cloud: 0.18, rain: 0, fog: 0, dark: 0 },
  cloudy: { name: 'Cloudy', cloud: 0.85, rain: 0, fog: 0, dark: 0.16 },
  rain: { name: 'Rain', cloud: 1, rain: 0.55, fog: 0.1, dark: 0.3 },
  storm: { name: 'Thunderstorm', cloud: 1, rain: 1, fog: 0.15, dark: 0.46 },
  fog: { name: 'Sea Fog', cloud: 0.3, rain: 0, fog: 1, dark: 0.06 },
};

const SLOT_MS = 100 * 1000;
const TABLE = ['clear', 'clear', 'clear', 'clear', 'cloudy', 'cloudy', 'rain', 'rain', 'storm', 'fog'];

function autoWeather(now) {
  const slot = Math.floor(now / SLOT_MS);
  return TABLE[Math.floor(hash2(slot, 4242) * TABLE.length)];
}

// Soft-edged blob used for both cloud shadows and the clouds themselves.
function makeCloud(seed, colour, alphaMax) {
  const w = 150;
  const h = 70;
  const buf = new PixelBuf(w, h);
  const puffs = [];
  for (let i = 0; i < 6; i++) puffs.push({ x: 30 + hash2(seed, i) * 90, y: 22 + hash2(i, seed) * 26, r: 18 + hash2(seed + i, 7) * 16 });
  const [r, g, b] = colour;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d = 0;
      for (const p of puffs) {
        const dx = (x - p.x) / p.r;
        const dy = (y - p.y) / (p.r * 0.5);
        d = Math.max(d, 1 - (dx * dx + dy * dy));
      }
      if (d <= 0) continue;
      // two alpha steps with a dithered fringe keep it looking like pixel art
      const edge = d < 0.25 ? ((x + y) & 1 ? 0 : 0.5) : d < 0.5 ? 0.6 : 1;
      if (edge) buf.data[y * w + x] = pack(r, g, b, Math.round(alphaMax * edge));
    }
  }
  return buf.toCanvas();
}

export class Weather {
  constructor() {
    this.mode = 'auto';
    this.kind = autoWeather(Date.now());
    const k = WEATHER[this.kind];
    this.cloud = k.cloud;
    this.rain = k.rain;
    this.fog = k.fog;
    this.dark = k.dark;
    this.flash = 0;
    this.bolt = null;
    this.nextStrike = 3;
    this.time = 0;
    this.shadows = [0, 1, 2, 3].map((i) => makeCloud(11 + i * 5, [8, 22, 48], 120));
    this.clouds = [0, 1, 2, 3].map((i) => makeCloud(11 + i * 5, [236, 240, 246], 190));
    this.sky = [];
    for (let i = 0; i < 40; i++) {
      this.sky.push({ x: hash2(i, 1) * (MAP_W + 400) - 200, y: hash2(i, 2) * MAP_H, v: i % 4, speed: 5 + hash2(i, 3) * 6 });
    }
    this.drops = [];
    for (let i = 0; i < 640; i++) this.drops.push({ x: Math.random(), y: Math.random(), s: 0.9 + Math.random() * 0.6 });
    this.fogBanks = [0, 1, 2, 3, 4, 5].map((i) => ({ x: hash2(i, 9), y: 0.1 + i * 0.15, w: 0.5 + hash2(i, 5) * 0.5, speed: 0.008 + hash2(i, 6) * 0.01 }));
  }

  setMode(mode) {
    this.mode = mode;
  }

  update(dt) {
    this.time += dt;
    this.kind = this.mode === 'auto' ? autoWeather(Date.now()) : this.mode;
    const target = WEATHER[this.kind] || WEATHER.clear;
    const ease = Math.min(1, dt * 0.6);
    for (const key of ['cloud', 'rain', 'fog', 'dark']) this[key] += (target[key] - this[key]) * ease;
    for (const c of this.sky) {
      c.x += c.speed * dt * (1 + this.rain);
      if (c.x > MAP_W + 200) c.x = -200;
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.kind === 'storm' && this.rain > 0.7) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 2.5 + Math.random() * 6;
        this.flash = 1;
        const x = 0.15 + Math.random() * 0.7;
        const pts = [[x, 0]];
        let px = x;
        for (let y = 0.08; y < 0.5 + Math.random() * 0.25; y += 0.06) {
          px += (Math.random() - 0.5) * 0.06;
          pts.push([px, y]);
        }
        this.bolt = { pts, life: 0.14 };
      }
    }
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life <= 0) this.bolt = null;
    }
  }

  get raining() {
    return this.rain > 0.3;
  }

  // Cloud shadows slide across the ground (world space, under the UI).
  drawWorld(ctx) {
    if (this.cloud < 0.02) return;
    ctx.globalAlpha = Math.min(1, this.cloud * 0.85);
    for (const c of this.sky) ctx.drawImage(this.shadows[c.v], Math.round(c.x), Math.round(c.y));
    if (this.cloud > 0.5) {
      ctx.globalAlpha = (this.cloud - 0.5) * 1.1;
      for (const c of this.sky) {
        if (c.v % 2) continue;
        ctx.drawImage(this.clouds[c.v], Math.round(c.x - 30), Math.round(c.y - 110));
      }
    }
    ctx.globalAlpha = 1;
  }

  // Screen-space effects on top of everything in the world.
  drawScreen(ctx, w, h, scale) {
    if (this.dark > 0.01) {
      const d = this.dark;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${Math.round(255 - d * 150)},${Math.round(255 - d * 125)},${Math.round(255 - d * 70)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.fog > 0.02) {
      ctx.fillStyle = `rgba(226,234,240,${0.2 * this.fog})`;
      ctx.fillRect(0, 0, w, h);
      // big soft banks of mist drifting across the screen
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = Math.min(1, this.fog) * 0.5;
      for (const b of this.fogBanks) {
        const bw = b.w * w * 1.3;
        const bx = (((b.x + this.time * b.speed) % 1.8) - 0.6) * w;
        const by = (b.y - 0.12 + Math.sin(this.time * 0.1 + b.x * 9) * 0.02) * h;
        ctx.drawImage(this.clouds[Math.floor(b.w * 7) % this.clouds.length], bx, by, bw, bw * 0.42);
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = smooth;
    }
    if (this.rain > 0.02) {
      const count = Math.round(this.drops.length * Math.min(1, this.rain) * Math.min(1, (w * h) / (1400 * 800)));
      const len = Math.max(2, Math.round(3 * scale));
      const px = Math.max(1, Math.round(scale * 0.5));
      ctx.fillStyle = `rgba(214,232,255,${0.45 + this.rain * 0.3})`;
      for (let i = 0; i < count; i++) {
        const d = this.drops[i];
        const y = ((d.y + this.time * d.s * 1.4) % 1) * (h + 40) - 20;
        const x = ((d.x + this.time * d.s * -0.16 + 10) % 1) * (w + 80) - 20;
        ctx.fillRect(Math.round(x), Math.round(y), px, len);
        ctx.fillRect(Math.round(x) - px, Math.round(y) + len, px, len);
      }
    }
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.45})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.bolt) {
      ctx.fillStyle = '#fffbe0';
      const t = Math.max(2, Math.round(scale * 1.5));
      const pts = this.bolt.pts;
      for (let i = 0; i + 1 < pts.length; i++) {
        const steps = 12;
        for (let k = 0; k <= steps; k++) {
          const x = pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / steps;
          const y = pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / steps;
          ctx.fillRect(Math.round(x * w), Math.round(y * h), t, t);
        }
      }
    }
  }
}
