// Shoreline: shallow-water shading plus waves that roll in, break into foam on
// the sand, wash up the beach and drain back leaving wet sand.
//
// The terrain pass gives every sea-level pixel its signed distance to the
// waterline (positive up the beach, negative out to sea). Each animation tick
// recolours just the coastal pixels that are on screen.

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
const WAVES_OUT = 5.6; // waves are only drawn this far out
const WAVE_GAP = 2.7;  // distance between incoming crests (tiles)
const PERIOD = 4.6;    // seconds between waves at any one spot

// Still water near the shore: dithered bands from pale aqua at the sand out to
// open-sea blue. The terrain pass paints this straight into the ground image.
export function shallowColour(s, x, y) {
  const d = -s;
  const t = d < 0.5 ? d / 0.5 : d < 1.8 ? 1 + (d - 0.5) / 1.3 : d < 3.6 ? 2 + (d - 1.8) / 1.8 : 3 + Math.min(1, (d - 3.6) / (OUT - 3.6));
  const band = Math.min(3, Math.floor(t));
  return SHALLOW[t - band > BAYER[(y & 3) * 4 + (x & 3)] ? band + 1 : band];
}

const CHUNK = 256;

// The animated part. The coast is split into square chunks so only the
// stretch of shoreline that is on screen gets recomputed and redrawn.
export class Surf {
  constructor(shoreMap) {
    this.chunks = [];
    const coastal = (s) => s > -WAVES_OUT && s < 1.6;
    for (let cy = 0; cy < MAP_H; cy += CHUNK) {
      for (let cx = 0; cx < MAP_W; cx += CHUNK) {
        const w = Math.min(CHUNK, MAP_W - cx);
        const h = Math.min(CHUNK, MAP_H - cy);
        let count = 0;
        for (let y = 0; y < h; y++) {
          const row = (cy + y) * MAP_W + cx;
          for (let x = 0; x < w; x++) if (coastal(shoreMap[row + x])) count++;
        }
        if (!count) continue;
        const c = {
          x: cx, y: cy, w, h,
          idx: new Uint32Array(count),
          dist: new Float32Array(count),
          lag: new Float32Array(count),
          reach: new Float32Array(count),
          grain: new Float32Array(count),
          canvas: document.createElement('canvas'),
          tick: -1,
        };
        c.canvas.width = w;
        c.canvas.height = h;
        c.ctx = c.canvas.getContext('2d');
        let n = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const s = shoreMap[(cy + y) * MAP_W + cx + x];
            if (!coastal(s)) continue;
            const gx = cx + x;
            const gy = cy + y;
            c.idx[n] = y * CHUNK + x;
            c.dist[n] = s;
            // waves reach different stretches of coast at slightly different times
            c.lag[n] = valueNoise(gx * 0.006 + 5, gy * 0.012 + 9) * 1.1 + valueNoise(gx * 0.04, gy * 0.08) * 0.12;
            c.reach[n] = 0.7 + valueNoise(gx * 0.03 + 30, gy * 0.06 + 2) * 0.6;
            c.grain[n] = hash2(gx, gy);
            n++;
          }
        }
        this.chunks.push(c);
      }
    }
    // one scratch image shared by every chunk
    this.image = new ImageData(CHUNK, CHUNK);
    this.px = new Uint32Array(this.image.data.buffer);
  }

  // Recompute the chunks that overlap the view. t in seconds; storm > 0 makes
  // the surf bigger and messier; fps is how often the picture changes.
  update(t, storm, view, fps = 10) {
    const tick = Math.floor(t * fps);
    const time = tick / fps;
    for (const c of this.chunks) {
      if (c.tick === tick) continue;
      if (c.x >= view.x1 || c.x + c.w <= view.x0 || c.y >= view.y1 || c.y + c.h <= view.y0) continue;
      c.tick = tick;
      this.paint(c, time, tick, storm);
    }
  }

  draw(ctx, view) {
    for (const c of this.chunks) {
      if (c.tick < 0 || c.x >= view.x1 || c.x + c.w <= view.x0 || c.y >= view.y1 || c.y + c.h <= view.y0) continue;
      ctx.drawImage(c.canvas, c.x, c.y);
    }
  }

  paint(c, time, tick, storm) {
    const { idx, dist, lag, reach, grain } = c;
    const px = this.px;
    px.fill(0);
    const flicker = tick * 0.618;
    const big = 1 + storm * 0.6;
    for (let i = 0; i < idx.length; i++) {
      const s = dist[i];
      const g = grain[i];
      const phase = time / PERIOD + lag[i];
      const f = phase - Math.floor(phase);      // 0 just after a wave lands
      let col = 0;
      if (s < 0) {
        const d = -s;
        // nearest crest: it sits WAVE_GAP offshore at f = 0 and lands at f = 1
        const crest = WAVE_GAP * (1 - f);
        const near = Math.abs(d - crest);
        const thick = (0.1 + 0.2 * f) * big;
        if (near < thick) col = f > 0.45 ? FOAM : FOAM_SOFT;
        else if (d > crest && d - crest < 0.55 * big && f > 0.3) {
          // broken water trailing behind the crest
          const sparkle = g + flicker;
          if (sparkle - Math.floor(sparkle) < 0.34 * f) col = FOAM_SOFT;
        } else {
          const far = Math.abs(d - crest - WAVE_GAP);
          if (far < 0.07 && d < OUT - 2) col = SWELL;
        }
        // a thin permanent lace of foam right at the waterline
        if (!col && d < 0.1) col = FOAM_SOFT;
      } else {
        // swash: rushes up the sand, then drains back more slowly
        const run = reach[i] * big;
        const up = f < 0.16 ? f / 0.16 : f < 0.62 ? 1 - (f - 0.16) / 0.46 : 0;
        const edge = run * Math.sin((up * Math.PI) / 2);
        if (edge > 0.02 && s <= edge) {
          col = edge - s < (f < 0.16 ? 0.2 : 0.11) ? FOAM : s < edge * 0.5 || g < 0.6 ? FILM : FOAM_SOFT;
        } else if (s <= run) {
          // wet sand dries out until the next wave
          const dry = f < 0.16 ? 1 : (f - 0.16) / 0.84;
          if (g > dry * dry) col = WET;
        }
      }
      px[idx[i]] = col;
    }
    c.ctx.putImageData(this.image, 0, 0, 0, 0, c.w, c.h);
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
