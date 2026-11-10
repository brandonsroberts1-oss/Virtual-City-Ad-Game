// The island renderer: camera, layered drawing and mouse picking.
//
// Draw order each frame:
//   sea -> terrain image -> shallows + surf -> boats ->
//   depth-sorted pass (trees, buildings, cars, people, overlays) ->
//   cloud shadows -> markers -> screen-space weather.

import { N, MAX_H, hash2 } from '/shared/world.js';
import { sx, sy, MAP_W, MAP_H, unproject } from './iso.js';
import { renderTerrain } from './terrain.js';
import { Surf, makeSeaFrames } from './surf.js';
import { PixelBuf, hex, pack, spriteFromArt } from './pixel.js';
import { decorSprite, makeSaleSign, sprite } from './sprites.js';
import { buildingSprite } from './buildings.js';
import { civicSprite } from './civic.js';

const ZOOMS = [0.5, 1, 2, 3, 4];
const ROWS = 2 * N;

function diamond(fill, edge) {
  const buf = new PixelBuf(32, 16);
  buf.poly([[16, 0], [32, 8], [16, 16], [0, 8]], fill);
  if (edge) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 32; x++) {
        if (!(buf.get(x, y) >>> 24)) continue;
        if (!(buf.get(x - 1, y) >>> 24) || !(buf.get(x + 1, y) >>> 24) || !(buf.get(x, y - 1) >>> 24) || !(buf.get(x, y + 1) >>> 24)) buf.set(x, y, edge);
      }
    }
  }
  return buf.toCanvas();
}

const HEART = spriteFromArt(
  ['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
  { k: hex('#5a1020'), r: hex('#f0425a'), w: hex('#ffd0d8') },
);
const ARROW = spriteFromArt(
  ['kkkkkkk', 'kyyyyyk', '.kyyyk.', '..kyk..', '...k...'],
  { k: hex('#4a3a00'), y: hex('#ffd83a') },
);

export class Renderer {
  constructor(canvas, world, actors, weather) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.actors = actors;
    this.weather = weather;
    this.terrain = renderTerrain(world);
    this.surf = new Surf(this.terrain.shoreMap);
    this.terrain.shoreMap = null;
    this.seaFrames = makeSeaFrames();
    this.cam = { x: sx(N / 2, N / 2), y: sy(N / 2, N / 2) - 34, zoom: 1 };
    this.camTarget = null;
    this.dpr = 1;
    this.static = Array.from({ length: ROWS }, () => []);
    this.dyn = Array.from({ length: ROWS }, () => []);
    this.structures = [];
    this.hoverStruct = null;
    this.selected = null;       // { x, y, w, h, level } outline + arrow
    this.showLots = false;
    this.ghost = null;          // { x, y, w, h, ok, spec }
    this.freeTiles = [];
    this.occupied = new Set();
    this.tint = {
      lot: diamond(pack(255, 255, 255, 46), pack(255, 255, 255, 120)),
      ok: diamond(pack(90, 255, 120, 120), pack(210, 255, 220, 255)),
      bad: diamond(pack(255, 70, 60, 130), pack(255, 210, 200, 255)),
    };
    this.heart = sprite(HEART, 3, 6);
    this.arrow = sprite(ARROW, 3, 4);
    this.saleSign = makeSaleSign();

    this.decor = world.decor.map((d) => {
      const s = decorSprite(d.kind, d.v);
      const h = world.heightAt(d.x, d.y);
      return { canvas: s.canvas, px: Math.round(sx(d.x, d.y)) - s.ax, py: Math.round(sy(d.x, d.y, h)) - s.ay, w: s.w, h: s.h, row: Math.floor(d.x) + Math.floor(d.y), key: d.x + d.y };
    });
    this.setProperties([]);
    this.resize();
  }

  // ---- scene ------------------------------------------------------------------

  setProperties(props) {
    const world = this.world;
    this.structures = [];
    this.occupied = new Set();
    for (const row of this.static) row.length = 0;
    for (const d of this.decor) this.static[d.row].push(d);

    const add = (kind, ref, spriteObj, x, y, w, h, level) => {
      const px = Math.round(sx(x, y)) - spriteObj.ax;
      const py = Math.round(sy(x, y, level)) - spriteObj.ay;
      const st = { kind, ref, sprite: spriteObj, px, py, x, y, w, h, level, front: x + w - 1 + y + h - 1 };
      this.structures.push(st);
      // Slice the sprite into vertical bands, one per tile along the two
      // front edges, so cars and trees beside a big building sort correctly.
      const centre = spriteObj.ax + (w - h) * 16;
      const piece = (x0, x1, row) => {
        x0 = Math.max(0, x0);
        x1 = Math.min(spriteObj.w, x1);
        if (x1 <= x0) return;
        this.static[row].push({ canvas: spriteObj.canvas, sx: x0, sw: x1 - x0, px: px + x0, py, w: x1 - x0, h: spriteObj.h, row, key: row + 1, st });
      };
      piece(centre - 16, centre + 16, st.front);
      for (let j = 1; j < w; j++) piece(j === w - 1 ? 0 : centre - (j + 1) * 16, centre - j * 16, st.front - j);
      for (let j = 1; j < h; j++) piece(centre + j * 16, j === h - 1 ? spriteObj.w : centre + (j + 1) * 16, st.front - j);
      if (w === 1) piece(0, centre - 16, st.front);
      if (h === 1) piece(centre + 16, spriteObj.w, st.front);
    };

    for (const c of world.civics) add('civic', c, civicSprite(c), c.x, c.y, c.w, c.h, c.level);
    for (const p of props) {
      const level = world.level[world.ti(p.x, p.y)];
      add('property', p, buildingSprite(p), p.x, p.y, p.w, p.h, level);
      for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) this.occupied.add(world.ti(xx, yy));
    }
    this.structures.sort((a, b) => b.front - a.front);

    // free lots (for the build overlay) and a few "for sale" signs
    this.freeTiles = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = world.ti(x, y);
        if (!world.buildable[i] || this.occupied.has(i)) continue;
        const level = world.level[i];
        this.freeTiles.push({ x, y, level, px: sx(x, y) - 16, py: sy(x, y, level), row: x + y });
        const roadside = world.isRoad(x + 1, y) || world.isRoad(x, y + 1) || world.isRoad(x - 1, y) || world.isRoad(x, y - 1);
        if (roadside && hash2(x * 7 + 3, y * 13 + 1) < 0.045) {
          const s = this.saleSign;
          this.static[x + y].push({ canvas: s.canvas, px: Math.round(sx(x + 0.5, y + 0.5)) - s.ax, py: Math.round(sy(x + 0.5, y + 0.5, level)) - s.ay, w: s.w, h: s.h, row: x + y, key: x + y + 1 });
        }
      }
    }
    for (const row of this.static) row.sort((a, b) => a.key - b.key);
  }

  // ---- camera ------------------------------------------------------------------

  resize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    this.dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(cssW * this.dpr);
    this.canvas.height = Math.floor(cssH * this.dpr);
    this.cssW = cssW;
    this.cssH = cssH;
  }

  get scale() {
    return this.cam.zoom * this.dpr;
  }

  fitZoom() {
    // biggest whole zoom that still shows most of the island
    const z = Math.min(this.cssW / 1250, this.cssH / 720);
    return z >= 2 ? 2 : z >= 0.9 ? 1 : 0.5;
  }

  zoomBy(step, clientX, clientY) {
    const i = ZOOMS.indexOf(this.cam.zoom);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 1 : i) + step))];
    if (next === this.cam.zoom) return;
    const cx = clientX ?? this.cssW / 2;
    const cy = clientY ?? this.cssH / 2;
    const before = this.toWorld(cx, cy);
    this.cam.zoom = next;
    const after = this.toWorld(cx, cy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.camTarget = null;
    this.clampCam();
  }

  panBy(dxCss, dyCss) {
    this.cam.x -= dxCss / this.cam.zoom;
    this.cam.y -= dyCss / this.cam.zoom;
    this.camTarget = null;
    this.clampCam();
  }

  clampCam() {
    this.cam.x = Math.max(-100, Math.min(MAP_W + 100, this.cam.x));
    this.cam.y = Math.max(-60, Math.min(MAP_H + 60, this.cam.y));
  }

  // glide to a tile (used by leaderboards and "my properties")
  focusTile(x, y, zoom) {
    const h = this.world.heightAt(x, y);
    this.camTarget = { x: sx(x, y), y: sy(x, y, h) - 20 };
    if (zoom && this.cam.zoom < zoom) this.cam.zoom = zoom;
  }

  toWorld(clientX, clientY) {
    return { x: (clientX - this.cssW / 2) / this.cam.zoom + this.cam.x, y: (clientY - this.cssH / 2) / this.cam.zoom + this.cam.y };
  }

  toClient(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.zoom + this.cssW / 2, y: (wy - this.cam.y) * this.cam.zoom + this.cssH / 2 };
  }

  // ---- picking -----------------------------------------------------------------

  pickTile(wx, wy) {
    const world = this.world;
    let best = null;
    const seen = new Set();
    for (let lv = MAX_H; lv >= 0; lv--) {
      const p = unproject(wx, wy, lv);
      const bx = Math.floor(p.x);
      const by = Math.floor(p.y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx;
          const y = by + dy;
          if (!world.inTiles(x, y)) continue;
          const id = y * N + x;
          if (seen.has(id)) continue;
          seen.add(id);
          const c = world.corners(x, y);
          const pts = [[sx(x, y), sy(x, y, c[0])], [sx(x + 1, y), sy(x + 1, y, c[1])], [sx(x + 1, y + 1), sy(x + 1, y + 1, c[2])], [sx(x, y + 1), sy(x, y + 1, c[3])]];
          let inside = false;
          for (let i = 0, j = 3; i < 4; j = i++) {
            if (pts[i][1] > wy !== pts[j][1] > wy && wx < ((pts[j][0] - pts[i][0]) * (wy - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) inside = !inside;
          }
          if (inside && (!best || x + y > best.x + best.y)) best = { x, y };
        }
      }
    }
    return best;
  }

  pick(clientX, clientY) {
    const { x: wx, y: wy } = this.toWorld(clientX, clientY);
    for (const st of this.structures) {
      const lx = Math.floor(wx - st.px);
      const ly = Math.floor(wy - st.py);
      if (lx < 0 || ly < 0 || lx >= st.sprite.w || ly >= st.sprite.h) continue;
      if (st.sprite.buf.get(lx, ly) >>> 24 > 60) return { structure: st, tile: this.pickTile(wx, wy) };
    }
    return { structure: null, tile: this.pickTile(wx, wy) };
  }

  // ---- drawing -----------------------------------------------------------------

  draw(time, dt) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (this.camTarget) {
      const k = Math.min(1, dt * 5);
      this.cam.x += (this.camTarget.x - this.cam.x) * k;
      this.cam.y += (this.camTarget.y - this.cam.y) * k;
      if (Math.abs(this.camTarget.x - this.cam.x) + Math.abs(this.camTarget.y - this.cam.y) < 1) this.camTarget = null;
    }
    const S = this.scale;
    const ox = Math.round(W / 2 - this.cam.x * S);
    const oy = Math.round(H / 2 - this.cam.y * S);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1c63ad';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(S, 0, 0, S, ox, oy);
    ctx.imageSmoothingEnabled = S < 1;
    const vx0 = -ox / S;
    const vy0 = -oy / S;
    const vx1 = vx0 + W / S;
    const vy1 = vy0 + H / S;
    const visible = (it) => it.px < vx1 && it.px + it.w > vx0 && it.py < vy1 && it.py + it.h > vy0;

    // open sea
    const frame = this.seaFrames[Math.floor(time * 2.2) % this.seaFrames.length];
    for (let ty = Math.floor(vy0 / 128) * 128; ty < vy1; ty += 128) {
      for (let tx = Math.floor(vx0 / 256) * 256; tx < vx1; tx += 256) ctx.drawImage(frame, tx, ty);
    }

    // land, then the water's edge on top of the beach
    ctx.drawImage(this.terrain.baseCanvas, 0, 0);
    this.surf.update(time, Math.max(0, this.weather.rain - 0.5) * 2);
    ctx.drawImage(this.surf.still, this.surf.x, this.surf.y);
    ctx.drawImage(this.surf.canvas, this.surf.x, this.surf.y);
    this.actors.drawBoats(ctx);

    // depth-sorted pass
    for (const row of this.dyn) row.length = 0;
    const moving = [];
    this.actors.collect(moving);
    for (const m of moving) {
      if (m.row < 0 || m.row >= ROWS) continue;
      m.canvas = m.sprite.canvas;
      m.w = m.sprite.w;
      m.h = m.sprite.h;
      this.dyn[m.row].push(m);
    }
    if (this.showLots) {
      for (const t of this.freeTiles) this.dyn[t.row].push({ canvas: this.tint.lot, px: t.px, py: t.py, w: 32, h: 16, key: t.row - 1 });
    }
    const g = this.ghost;
    if (g) {
      const tint = g.ok ? this.tint.ok : this.tint.bad;
      for (let yy = g.y; yy < g.y + g.h; yy++) {
        for (let xx = g.x; xx < g.x + g.w; xx++) {
          if (!this.world.inTiles(xx, yy)) continue;
          const c = this.world.corners(xx, yy);
          const lv = Math.max(...c);
          this.dyn[xx + yy].push({ canvas: tint, px: sx(xx, yy) - 16, py: sy(xx, yy, lv), w: 32, h: 16, key: xx + yy - 0.5 });
        }
      }
      if (g.ok && g.spec) {
        const s = buildingSprite(g.spec);
        const row = g.x + g.w - 1 + g.y + g.h - 1;
        this.dyn[row].push({ canvas: s.canvas, px: Math.round(sx(g.x, g.y)) - s.ax, py: Math.round(sy(g.x, g.y, g.level)) - s.ay, w: s.w, h: s.h, key: row + 1.5, alpha: 0.82 });
      }
    }

    const strips = this.terrain.strips;
    let si = 0;
    const put = (it) => {
      if (!visible(it)) return;
      if (it.alpha) ctx.globalAlpha = it.alpha;
      if (it.sw) ctx.drawImage(it.canvas, it.sx, 0, it.sw, it.h, it.px, it.py, it.sw, it.h);
      else ctx.drawImage(it.canvas, it.px, it.py);
      if (it.alpha) ctx.globalAlpha = 1;
      if (it.st && it.st === this.hoverStruct) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2;
        ctx.drawImage(it.canvas, it.sx, 0, it.sw, it.h, it.px, it.py, it.sw, it.h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    for (let d = 0; d < ROWS; d++) {
      while (si < strips.length && strips[si].row <= d) {
        const s = strips[si++];
        if (s.x < vx1 && s.x + s.canvas.width > vx0 && s.y < vy1 && s.y + s.canvas.height > vy0) ctx.drawImage(s.canvas, s.x, s.y);
      }
      const a = this.static[d];
      const b = this.dyn[d];
      if (!b.length) {
        for (let i = 0; i < a.length; i++) put(a[i]);
        continue;
      }
      b.sort((p, q) => p.key - q.key);
      let i = 0;
      let j = 0;
      while (i < a.length || j < b.length) {
        if (j >= b.length || (i < a.length && a[i].key <= b[j].key)) put(a[i++]);
        else put(b[j++]);
      }
    }

    this.weather.drawWorld(ctx);
    this.actors.drawGulls(ctx);

    // markers: hearts over donation buildings, arrow over the selection
    const bob = Math.round(Math.sin(time * 3) * 1.5);
    for (const st of this.structures) {
      if (st.kind !== 'civic') continue;
      const b = st.bounds || (st.bounds = st.sprite.buf.bounds());
      const cx = Math.round(sx(st.x + st.w / 2, st.y + st.h / 2));
      ctx.drawImage(this.heart.canvas, cx - 3, st.py + b.y0 - 10 + bob);
    }
    if (this.selected) {
      const s = this.selected;
      const lv = s.level;
      const pts = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map(([tx, ty]) => [sx(tx, ty), sy(tx, ty, lv)]);
      ctx.strokeStyle = Math.floor(time * 3) % 2 ? '#ffe45a' : '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + 0.5) : ctx.moveTo(p[0], p[1] + 0.5)));
      ctx.closePath();
      ctx.stroke();
      if (s.top != null) ctx.drawImage(this.arrow.canvas, Math.round(sx(s.x + s.w / 2, s.y + s.h / 2)) - 3, s.top - 8 + bob);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.weather.drawScreen(ctx, W, H, S);
  }
}
