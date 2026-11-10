// Animated shoreline: shallow water shading plus waves that roll in, break
// into foam on the sand, wash up the beach and drain back leaving wet sand.
//
// The terrain pass gives every sea-level pixel its signed distance to the
// waterline (positive up the beach, negative out to sea). Each animation tick
// recolours just those coastal pixels.

import { valueNoise, hash2 } from '/shared/world.js';
import { hex, pack } from './pixel.js';
import { MAP_W, MAP_H } from './iso.js';

export const SEA = hex('#1c63ad');
const SHALLOW = [hex('#8fe6dc'), hex('#55cdd6'), hex('#2fa7cf'), hex('#2386c4'), SEA];
const FOAM = hex('#f6fcff');
const FOAM_SOFT = hex('#c9f1f4');
const FILM = hex('#a9e9e6');
const SWELL = hex('#4fb8dc');
const WET = pack(120, 96, 50, 105);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const OUT = 6.5;       // how far offshore the shallows reach (tiles)
const WAVE_GAP = 2.7;  // distance between incoming crests (tiles)
const PERIOD = 4.6;    // seconds between waves at any one spot

export class Surf {
  constructor(shoreMap) {
    let x0 = MAP_W;
    let y0 = MAP_H;
    let x1 = 0;
    let y1 = 0;
    let count = 0;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const s = shoreMap[y * MAP_W + x];
        if (s > -OUT && s < 1.6) {
          count++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    this.x = x0;
    this.y = y0;
    this.w = x1 - x0 + 1;
    this.h = y1 - y0 + 1;

    // static shallows: dithered bands from pale aqua at the sand to open sea
    const still = new Uint32Array(this.w * this.h);
    this.idx = new Uint32Array(count);
    this.dist = new Float32Array(count);
    this.lag = new Float32Array(count);
    this.reach = new Float32Array(count);
    this.grain = new Float32Array(count);
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const s = shoreMap[y * MAP_W + x];
        if (!(s > -OUT && s < 1.6)) continue;
        const k = (y - y0) * this.w + (x - x0);
        if (s < 0) {
          const d = -s;
          const t = d < 0.5 ? d / 0.5 : d < 1.8 ? 1 + (d - 0.5) / 1.3 : d < 3.6 ? 2 + (d - 1.8) / 1.8 : 3 + Math.min(1, (d - 3.6) / (OUT - 3.6));
          const band = Math.min(3, Math.floor(t));
          const frac = t - band;
          still[k] = SHALLOW[frac > BAYER[(y & 3) * 4 + (x & 3)] ? band + 1 : band];
        }
        this.idx[n] = k;
        this.dist[n] = s;
        // waves reach different stretches of coast at slightly different times
        this.lag[n] = valueNoise(x * 0.006 + 5, y * 0.012 + 9) * 1.1 + valueNoise(x * 0.04, y * 0.08) * 0.12;
        this.reach[n] = 0.7 + valueNoise(x * 0.03 + 30, y * 0.06 + 2) * 0.6;
        this.grain[n] = hash2(x, y);
        n++;
      }
    }
    this.still = document.createElement('canvas');
    this.still.width = this.w;
    this.still.height = this.h;
    this.still.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(still.buffer), this.w, this.h), 0, 0);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d');
    this.image = this.ctx.createImageData(this.w, this.h);
    this.px = new Uint32Array(this.image.data.buffer);
    this.lastTick = -1;
  }

  // t in seconds; storm > 0 makes the surf bigger and messier
  update(t, storm = 0) {
    const tick = Math.floor(t * 10);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    const time = tick / 10;
    const { idx, dist, lag, reach, grain, px } = this;
    const flicker = tick * 0.618;
    const big = 1 + storm * 0.6;
    for (let i = 0; i < idx.length; i++) {
      const s = dist[i];
      const g = grain[i];
      const phase = time / PERIOD + lag[i];
      const f = phase - Math.floor(phase);      // 0 just after a wave lands
      let c = 0;
      if (s < 0) {
        const d = -s;
        // nearest crest: it sits WAVE_GAP offshore at f = 0 and lands at f = 1
        const crest = WAVE_GAP * (1 - f);
        const near = Math.abs(d - crest);
        const thick = (0.1 + 0.2 * f) * big;
        if (near < thick) c = f > 0.45 ? FOAM : FOAM_SOFT;
        else if (d > crest && d - crest < 0.55 * big && f > 0.3) {
          // broken water trailing behind the crest
          const sparkle = g + flicker;
          if (sparkle - Math.floor(sparkle) < 0.34 * f) c = FOAM_SOFT;
        } else {
          const far = Math.abs(d - crest - WAVE_GAP);
          if (far < 0.07 && d < OUT - 2) c = SWELL;
        }
        // a thin permanent lace of foam right at the waterline
        if (!c && d < 0.1) c = FOAM_SOFT;
      } else {
        // swash: rushes up the sand, then drains back more slowly
        const run = reach[i] * big;
        const up = f < 0.16 ? f / 0.16 : f < 0.62 ? 1 - (f - 0.16) / 0.46 : 0;
        const edge = run * Math.sin((up * Math.PI) / 2);
        if (edge > 0.02 && s <= edge) {
          c = edge - s < (f < 0.16 ? 0.2 : 0.11) ? FOAM : s < edge * 0.5 || g < 0.6 ? FILM : FOAM_SOFT;
        } else if (s <= run) {
          // wet sand dries out until the next wave
          const dry = f < 0.16 ? 1 : (f - 0.16) / 0.84;
          if (g > dry * dry) c = WET;
        }
      }
      px[idx[i]] = c;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

// Open-sea texture: a few frames of scattered highlights, tiled.
export function makeSeaFrames() {
  const frames = [];
  const W = 256;
  const H = 128;
  for (let f = 0; f < 4; f++) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = new Uint32Array(img.data.buffer);
    const light = hex('#2f7cc4');
    const bright = hex('#5fa6dc');
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash2(i, 17) * W);
      const y = Math.floor(hash2(i, 53) * H);
      const life = (i + f) % 4;
      if (life === 3) continue;
      const len = 3 + Math.floor(hash2(i, 91) * 5) - life;
      for (let k = 0; k < len; k++) {
        // dashes follow the 2:1 isometric grain
        const xx = (x + k + f) % W;
        const yy = (y + (k >> 1)) % H;
        px[yy * W + xx] = life === 0 && k > 0 && k < len - 1 ? bright : light;
      }
    }
    ctx.putImageData(img, 0, 0);
    frames.push(cv);
  }
  return frames;
}
