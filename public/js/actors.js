// Things that move: cars and pedestrians on the road network, sailboats
// circling the island, gulls overhead.

import { DIRS, N, mulberry32 } from '/shared/world.js';
import { vehicleSprite, personSprite, makeSailboat, makeGull, CAR_COLOURS } from './sprites.js';
import { sx, sy } from './iso.js';

const CAR_LANE = 0.17;
const WALK_LANE = 0.4;

// right-hand side of a heading
function lane(dir, amount) {
  const d = DIRS[dir];
  return { x: -d.dy * amount, y: d.dx * amount };
}

// Position inside a tile for something travelling in `dir` and leaving in
// `next`, t = 0..1. Follows the lane and rounds corners.
function tilePath(tx, ty, dir, next, t, offset) {
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  const d = DIRS[dir];
  const n = DIRS[next];
  const l0 = lane(dir, offset);
  const l1 = lane(next, offset);
  const ex = cx - d.dx * 0.5 + l0.x;
  const ey = cy - d.dy * 0.5 + l0.y;
  const xx = cx + n.dx * 0.5 + l1.x;
  const xy = cy + n.dy * 0.5 + l1.y;
  if (dir === next) return { x: ex + (xx - ex) * t, y: ey + (xy - ey) * t };
  let kx = cx + l0.x + l1.x;
  let ky = cy + l0.y + l1.y;
  if ((dir + 2) % 4 === next) {
    // U-turn at a dead end
    kx = cx + d.dx * 0.42;
    ky = cy + d.dy * 0.42;
  }
  const u = 1 - t;
  return { x: u * u * ex + 2 * u * t * kx + t * t * xx, y: u * u * ey + 2 * u * t * ky + t * t * xy };
}

export class Actors {
  constructor(world, { cars = 30, people = 64 } = {}) {
    this.world = world;
    this.rand = mulberry32(977);
    this.roadTiles = [];
    for (const r of world.roads) for (const t of r.tiles) this.roadTiles.push(t);
    this.cars = [];
    this.people = [];
    for (let i = 0; i < cars; i++) this.cars.push(this.spawn('car', i));
    for (let i = 0; i < people; i++) this.people.push(this.spawn('person', i));
    this.boats = [0, 1, 2, 3].map((i) => ({ a: i * 1.7 + 0.4, r: 27.5 + i * 1.2, speed: (i % 2 ? -1 : 1) * (0.012 + i * 0.003), v: i }));
    this.gulls = [0, 1, 2, 3, 4, 5].map((i) => ({ a: i * 1.1, r: 14 + i * 3.2, speed: 0.12 + i * 0.02, cx: 20 + i * 4, cy: 36 - i * 2, alt: 60 + i * 9 }));
    this.rainy = false;
    this.clock = 0;
  }

  spawn(kind, i) {
    const r = this.rand;
    const tile = this.roadTiles[Math.floor(r() * this.roadTiles.length)];
    const mask = this.world.roadMask[this.world.ti(tile.x, tile.y)];
    const options = [0, 1, 2, 3].filter((d) => mask & (1 << d));
    const dir = options[Math.floor(r() * options.length)] ?? 0;
    const a = { kind, x: tile.x, y: tile.y, dir, next: dir, t: r(), id: i, pause: 0 };
    if (kind === 'car') {
      const roll = r();
      a.type = roll < 0.1 ? 'bus' : roll < 0.24 ? 'van' : 'car';
      a.colour = a.type === 'bus' ? '#e9822c' : CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)];
      a.speed = a.type === 'bus' ? 1.3 : 1.6 + r() * 0.9;
    } else {
      a.speed = 0.28 + r() * 0.16;
      a.side = r() < 0.5 ? 1 : -1;
      a.look = Math.floor(r() * 997);
    }
    a.next = this.choose(a);
    return a;
  }

  // pick the heading to leave the current tile with
  choose(a) {
    const mask = this.world.roadMask[this.world.ti(a.x, a.y)];
    const back = (a.dir + 2) % 4;
    const options = [];
    for (let d = 0; d < 4; d++) {
      if (!(mask & (1 << d)) || d === back) continue;
      options.push(d);
      if (d === a.dir) options.push(d, d); // prefer carrying straight on
    }
    if (!options.length) return back;
    if (a.kind === 'person' && this.rand() < 0.04) return back;
    return options[Math.floor(this.rand() * options.length)];
  }

  position(a) {
    const off = a.kind === 'car' ? CAR_LANE : WALK_LANE * a.side;
    return tilePath(a.x, a.y, a.dir, a.next, a.t, off);
  }

  update(dt, rainy) {
    this.rainy = rainy;
    this.clock += dt;
    const step = Math.min(dt, 0.1);
    // cache positions for simple "don't rear-end the car in front" logic
    for (const c of this.cars) {
      c.pos = this.position(c);
      c.heading = c.t < 0.5 ? c.dir : c.next;
    }
    for (const c of this.cars) {
      const h = DIRS[c.heading];
      let blocked = false;
      for (const o of this.cars) {
        if (o === c || o.heading !== c.heading) continue;
        const dx = o.pos.x - c.pos.x;
        const dy = o.pos.y - c.pos.y;
        const ahead = dx * h.dx + dy * h.dy;
        const side = Math.abs(dx * h.dy - dy * h.dx);
        if (ahead > 0 && ahead < (o.type === 'bus' ? 0.75 : 0.55) && side < 0.2) {
          blocked = true;
          break;
        }
      }
      if (!blocked) this.advance(c, step * c.speed * (rainy ? 0.8 : 1));
    }
    for (const p of this.people) {
      if (p.pause > 0) {
        p.pause -= step;
        continue;
      }
      if (this.rand() < step * 0.03) p.pause = 1 + this.rand() * 3;
      this.advance(p, step * p.speed);
    }
    for (const b of this.boats) b.a += b.speed * step;
    for (const g of this.gulls) g.a += g.speed * step;
  }

  advance(a, amount) {
    a.t += amount;
    while (a.t >= 1) {
      a.t -= 1;
      const d = DIRS[a.next];
      const nx = a.x + d.dx;
      const ny = a.y + d.dy;
      if (this.world.isRoad(nx, ny)) {
        a.x = nx;
        a.y = ny;
        a.dir = a.next;
      } else {
        // should not happen, but turn around rather than leave the road
        a.dir = (a.next + 2) % 4;
      }
      a.next = this.choose(a);
    }
  }

  // Appends draw items { sprite, px, py, row, key } for the depth-sorted pass.
  collect(out) {
    const w = this.world;
    for (const c of this.cars) {
      const p = this.position(c);
      const heading = c.t < 0.5 ? c.dir : c.next;
      const s = vehicleSprite(c.colour, heading, c.type);
      const h = w.heightAt(p.x, p.y);
      out.push({ sprite: s, px: Math.round(sx(p.x, p.y)) - s.ax, py: Math.round(sy(p.x, p.y, h)) - s.ay, row: Math.floor(p.x) + Math.floor(p.y), key: p.x + p.y });
    }
    const frame = Math.floor(this.clock * 4) % 2;
    for (const a of this.people) {
      if (this.rainy && a.id % 3 === 0) continue; // some people stay in when it rains
      const p = this.position(a);
      const s = personSprite(a.look, a.pause > 0 ? 0 : (frame + a.id) % 2, this.rainy);
      const h = w.heightAt(p.x, p.y);
      out.push({ sprite: s, px: Math.round(sx(p.x, p.y)) - s.ax, py: Math.round(sy(p.x, p.y, h)) - s.ay, row: Math.floor(p.x) + Math.floor(p.y), key: p.x + p.y });
    }
  }

  // Boats sit on the open sea and never overlap land, so they are drawn in a
  // simple pass before the terrain.
  drawBoats(ctx) {
    // boats follow a rounded square a few tiles off the coast
    const at = (a, r) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = Math.pow(Math.pow(Math.abs(c), 3.5) + Math.pow(Math.abs(s), 3.5), -1 / 3.5);
      return { x: N / 2 + c * r * k, y: N / 2 + s * r * k };
    };
    for (const b of this.boats) {
      const p = at(b.a, b.r);
      const q = at(b.a + Math.sign(b.speed) * 0.02, b.r);
      const s = this.boatSprite(b.v, sx(q.x, q.y) < sx(p.x, p.y));
      const bob = Math.round(Math.sin(this.clock * 1.4 + b.v * 2));
      ctx.drawImage(s.canvas, Math.round(sx(p.x, p.y)) - s.ax, Math.round(sy(p.x, p.y, 0)) - s.ay + bob);
    }
  }

  boatSprite(v, flip) {
    this.boatCache = this.boatCache || new Map();
    const key = `${v}:${flip}`;
    if (!this.boatCache.has(key)) this.boatCache.set(key, makeSailboat(v, flip));
    return this.boatCache.get(key);
  }

  drawGulls(ctx) {
    this.gullSprites = this.gullSprites || [makeGull(0), makeGull(1)];
    for (const g of this.gulls) {
      const x = g.cx + Math.cos(g.a) * g.r;
      const y = g.cy + Math.sin(g.a) * g.r * 0.8;
      const s = this.gullSprites[Math.floor(this.clock * 3 + g.r) % 2];
      const px = Math.round(sx(x, y));
      const py = Math.round(sy(x, y, 0));
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#0a2030';
      ctx.fillRect(px - 1, py, 3, 1);
      ctx.globalAlpha = 1;
      ctx.drawImage(s.canvas, px - s.ax, py - g.alt);
    }
  }
}
