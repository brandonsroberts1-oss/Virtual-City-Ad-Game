import { createWorld } from '/shared/world.js';
import { Renderer } from './render.js';
import { Actors } from './actors.js';
import { Weather } from './weather.js';

const world = createWorld();
const canvas = document.getElementById('view');
const actors = new Actors(world);
const weather = new Weather();
const renderer = new Renderer(canvas, world, actors, weather);
window.__app = { world, renderer, actors, weather };
const q = new URLSearchParams(location.search);
if (q.get('w')) weather.setMode(q.get('w'));
if (q.get('z')) renderer.cam.zoom = Number(q.get('z'));
if (q.get('cx')) { renderer.cam.x = Number(q.get('cx')); renderer.cam.y = Number(q.get('cy')); }
if (q.get('demo')) {
  const { buildingSprite } = await import('./buildings.js');
  const { BUILDINGS, TIERS, COLOURS } = await import('/shared/catalog.js');
  const props = [];
  const occ = new Set();
  let seed = 5;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const types = Object.keys(BUILDINGS);
  for (let tries = 0; tries < 4000 && props.length < Number(q.get('demo')); tries++) {
    const type = types[Math.floor(rnd() * types.length)];
    const t = BUILDINGS[type];
    const w = t.minLot[0] + Math.floor(rnd() * (t.maxLot[0] - t.minLot[0] + 1));
    const h = t.minLot[1] + Math.floor(rnd() * (t.maxLot[1] - t.minLot[1] + 1));
    const x = Math.floor(rnd() * 56), y = Math.floor(rnd() * 56);
    const lot = world.checkLot(x, y, w, h, occ);
    if (!lot.ok) continue;
    const styles = Object.keys(t.styles);
    const p = { id: props.length + 1, type, style: styles[Math.floor(rnd() * styles.length)], tier: Object.keys(TIERS)[Math.floor(rnd() * 3)], colour: Object.keys(COLOURS)[Math.floor(rnd() * 8)], floors: t.floors[0] + Math.floor(rnd() * rnd() * (t.floors[1] - t.floors[0] + 1)), x, y, w, h };
    props.push(p);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) occ.add(world.ti(xx, yy));
  }
  renderer.setProperties(props);
}
let last = performance.now();
let frames = 0, acc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  weather.update(dt);
  actors.update(dt, weather.raining);
  const t0 = performance.now();
  renderer.draw(now / 1000, dt);
  acc += performance.now() - t0; frames++;
  if (frames === 60) { window.__drawMs = acc / 60; frames = 0; acc = 0; }
  requestAnimationFrame(loop);
}
addEventListener('resize', () => renderer.resize());
requestAnimationFrame(loop);
