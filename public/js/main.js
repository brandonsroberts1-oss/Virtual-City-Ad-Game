// App controller: boots the island, wires up mouse/touch/keyboard, keeps the
// map in sync with the server and hands clicks to the UI.

import { createWorld, TILE } from '/shared/world.js';
import { LAND, formatMoney } from '/shared/catalog.js';
import { Renderer } from './render.js';
import { Actors } from './actors.js';
import { Weather, WEATHER } from './weather.js';
import { api } from './api.js';
import { $, closeSide, closeModal, modalOpen, toast, hooks } from './dom.js';
import { createUI } from './ui.js';
import { decorSprite } from './sprites.js';

const world = createWorld();
const canvas = $('#view');
const actors = new Actors(world);
const weather = new Weather();
const renderer = new Renderer(canvas, world, actors, weather);
renderer.cam.zoom = renderer.fitZoom();

const app = {
  world,
  renderer,
  actors,
  weather,
  config: { site: { name: 'Brand Island' }, payments: 'demo' },
  user: null,
  props: [],
  byId: new Map(),
  mode: 'explore',
  version: 0,
  hoverLot: null,
  build: null,
};
const ui = createUI(app);

const statusHover = $('#status-hover');
const statusStats = $('#status-stats');
const tooltip = $('#tooltip');
let statsText = '';

// ---- modes -----------------------------------------------------------------------

// Keep the island centred in the part of the screen that panels do not cover:
// beside the build panel on wide screens, above the bottom sheet on phones.
app.syncLayout = () => {
  const build = app.mode === 'build';
  const side = !!$('#side').firstChild;
  if (window.innerWidth <= 640) renderer.setViewOffset(0, build || side ? -Math.round(window.innerHeight * 0.24) : 0);
  else renderer.setViewOffset(build ? 178 : 0, 0);
};
hooks.side = () => app.syncLayout();

app.setMode = (mode) => {
  app.mode = mode;
  for (const b of document.querySelectorAll('[data-act="explore"], [data-act="build"]')) b.classList.toggle('active', b.dataset.act === mode);
  renderer.showLots = mode === 'build';
  renderer.hoverStruct = null;
  renderer.selected = null;
  app.hoverLot = null;
  canvas.classList.toggle('placing', mode === 'build');
  canvas.classList.remove('pointing');
  tooltip.hidden = true;
  if (mode === 'build') closeSide();
  ui.showBuild(mode === 'build');
  app.syncLayout();
  app.syncGhost();
  statusHover.textContent = mode === 'build' ? 'Click a lighter square on the map to place your lot.' : 'Drag to look around. Click a building to read its ad.';
};

// The translucent building that follows the mouse (or sits on the chosen lot).
app.syncGhost = () => {
  const b = app.build;
  if (app.mode !== 'build' || !b) {
    renderer.ghost = null;
    return;
  }
  const spec = { type: b.type, style: b.style, tier: b.tier, colour: b.colour, floors: b.floors, w: b.w, h: b.h };
  const placed = b.x != null && b.lot ? { x: b.x, y: b.y, ok: true, level: b.lot.level } : null;
  const g = app.hoverLot || placed;
  renderer.ghost = g ? { ...g, w: b.w, h: b.h, spec } : null;
  renderer.selected = placed ? { x: b.x, y: b.y, w: b.w, h: b.h, level: placed.level, top: null } : null;
};

// ---- data --------------------------------------------------------------------------

app.refresh = async () => {
  const s = await api.get('/api/state');
  app.version = s.version;
  app.props = s.properties;
  app.byId = new Map(s.properties.map((p) => [p.id, p]));
  renderer.hoverStruct = null;
  tooltip.hidden = true;
  renderer.setProperties(app.props);
  statsText = `${s.properties.length} propert${s.properties.length === 1 ? 'y' : 'ies'} - ${formatMoney(s.donatedCents)} donated`;
  ui.revalidateBuild();
};

setInterval(async () => {
  if (document.hidden) return;
  try {
    const v = await api.get('/api/version');
    if (v.version !== app.version) await app.refresh();
  } catch {
    // offline for a moment; try again next tick
  }
}, 15000);

// ---- hovering and clicking the map ----------------------------------------------------

function lotAnchor(tile) {
  const b = app.build;
  return { x: tile.x - Math.floor((b.w - 1) / 2), y: tile.y - Math.floor((b.h - 1) / 2) };
}

function describeTile(t) {
  const i = world.ti(t.x, t.y);
  switch (world.type[i]) {
    case TILE.WATER: return 'Open water';
    case TILE.BEACH: return 'Beach';
    case TILE.ROAD: return world.roads[world.roadId[i]].name;
    case TILE.ROCK: return 'Mountain';
    default: {
      if (world.buildable[i] && !renderer.occupied.has(i)) {
        const z = LAND.zones[world.zone[i]];
        return `Lot for sale - ${z.name} - ${formatMoney(LAND.basePerTile * z.mult)} per tile`;
      }
      return world.level[i] === 1 ? 'Parkland' : 'Mountain forest';
    }
  }
}

function onHover(cx, cy) {
  const hit = renderer.pick(cx, cy);
  if (app.mode === 'build') {
    if (hit.tile) {
      const b = app.build;
      const a = lotAnchor(hit.tile);
      const lot = world.checkLot(a.x, a.y, b.w, b.h, renderer.occupied);
      app.hoverLot = { x: a.x, y: a.y, ok: lot.ok, level: lot.ok ? lot.level : 0 };
      if (lot.ok) {
        const land = Object.entries(lot.zones).reduce((s, [z, n]) => s + n * LAND.basePerTile * LAND.zones[z].mult, 0);
        statusHover.textContent = `${LAND.zones[lot.zone].name} - ${lot.address} - land ${formatMoney(land)} - click to choose`;
      } else statusHover.textContent = lot.reason;
    } else {
      app.hoverLot = null;
    }
    app.syncGhost();
    return;
  }
  const st = hit.structure;
  renderer.hoverStruct = st;
  canvas.classList.toggle('pointing', !!st);
  if (st) {
    const label = st.kind === 'civic' ? `${st.ref.name} - click to donate` : st.ref.name;
    tooltip.textContent = label;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(window.innerWidth - 290, cx + 16)}px`;
    tooltip.style.top = `${cy + 18}px`;
    statusHover.textContent = st.kind === 'civic' ? label : `${st.ref.name} - ${st.ref.address} - worth ${formatMoney(st.ref.valueCents)}`;
  } else {
    tooltip.hidden = true;
    statusHover.textContent = hit.tile ? describeTile(hit.tile) : 'Open water';
  }
}

function onClick(cx, cy) {
  const hit = renderer.pick(cx, cy);
  if (app.mode === 'build') {
    if (!hit.tile) return;
    const a = lotAnchor(hit.tile);
    app.hoverLot = null;
    ui.placeLot(a.x, a.y);
    app.syncGhost();
    return;
  }
  const st = hit.structure;
  if (!st) {
    closeSide();
    return;
  }
  if (st.kind === 'civic') ui.openCivic(st.ref);
  else ui.openProperty(st.ref.id);
}

// ---- pointer, wheel and keyboard input -------------------------------------------------

const pointers = new Map();
let drag = null;
let pinch = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    if (drag) drag.moved = 99; // a pinch is never a tap
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') onHover(e.clientX, e.clientY);
    return;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (d > pinch.d * 1.35) {
      renderer.zoomBy(1, mx, my);
      pinch.d = d;
    } else if (d < pinch.d * 0.74) {
      renderer.zoomBy(-1, mx, my);
      pinch.d = d;
    }
    return;
  }
  if (drag && drag.id === e.pointerId) {
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 6) {
      renderer.panBy(dx, dy);
      canvas.classList.add('dragging');
      tooltip.hidden = true;
    }
  }
});

function endPointer(e) {
  const wasDrag = drag && drag.id === e.pointerId ? drag : null;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (wasDrag) {
    drag = null;
    canvas.classList.remove('dragging');
    if (wasDrag.moved <= 6 && e.type === 'pointerup') onClick(e.clientX, e.clientY);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
  renderer.hoverStruct = null;
  if (app.hoverLot) {
    app.hoverLot = null;
    app.syncGhost();
  }
});

let wheelAcc = 0;
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) >= 50) {
      renderer.zoomBy(wheelAcc < 0 ? 1 : -1, e.clientX, e.clientY);
      wheelAcc = 0;
    }
  },
  { passive: false },
);

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalOpen()) closeModal();
    else if ($('#side').firstChild) closeSide();
    else if (app.mode === 'build') app.setMode('explore');
    return;
  }
  if (e.target.matches?.('input, textarea, select') || modalOpen()) return;
  const step = 80;
  switch (e.key) {
    case 'ArrowLeft': renderer.panBy(step, 0); break;
    case 'ArrowRight': renderer.panBy(-step, 0); break;
    case 'ArrowUp': renderer.panBy(0, step); break;
    case 'ArrowDown': renderer.panBy(0, -step); break;
    case '+': case '=': renderer.zoomBy(1); break;
    case '-': case '_': renderer.zoomBy(-1); break;
    default: return;
  }
  e.preventDefault();
});

addEventListener('resize', () => {
  renderer.resize();
  app.syncLayout();
});

// ---- toolbar ----------------------------------------------------------------------------

$('#topbar').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  switch (act) {
    case 'explore': app.setMode('explore'); break;
    case 'build': app.setMode(app.mode === 'build' ? 'explore' : 'build'); break;
    case 'leaders': ui.openLeaders(); break;
    case 'about': ui.openAbout(); break;
    case 'account': ui.openAccount(); break;
    case 'zoom-in': renderer.zoomBy(1); break;
    case 'zoom-out': renderer.zoomBy(-1); break;
    default:
  }
});

$('#weather').addEventListener('change', (e) => weather.setMode(e.target.value));

{
  // little palm tree for the logo
  const logo = $('#logo');
  const palm = decorSprite('palm', 3);
  const ctx = logo.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(palm.canvas, Math.round((logo.width - palm.w) / 2), logo.height - palm.h);
}

// ---- render loop --------------------------------------------------------------------------

let last = performance.now();
let statusTick = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  weather.update(dt);
  actors.update(dt, weather.raining);
  renderer.draw(now / 1000, dt);
  statusTick += dt;
  if (statusTick > 0.5) {
    statusTick = 0;
    statusStats.textContent = `${statsText}${statsText ? ' - ' : ''}Weather: ${WEATHER[weather.kind].name}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- boot -----------------------------------------------------------------------------------

async function handleReturnFromCheckout(params) {
  const orderId = params.get('order');
  const cancelled = params.get('cancelled');
  if (cancelled) {
    await api.post(`/api/orders/${encodeURIComponent(cancelled)}/cancel`).catch(() => {});
    toast('Checkout cancelled. Nothing was charged.');
  }
  if (!orderId) return;
  // The payment provider tells the server separately, so give it a moment.
  for (let i = 0; i < 15; i++) {
    let o;
    try {
      o = await api.get(`/api/orders/${encodeURIComponent(orderId)}`);
    } catch {
      break;
    }
    if (o.status === 'paid') {
      await app.refresh().catch(() => {});
      if (o.property) {
        toast(`${o.property.name} is now on the island!`, 'good');
        ui.openProperty(o.property.id, true);
      } else {
        toast('Thank you! Your donation was received.', 'good');
      }
      return;
    }
    if (o.status !== 'pending') {
      toast(o.status === 'conflict' ? 'That lot was taken before your payment finished. We will refund you.' : 'That checkout did not complete.', 'bad');
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  toast('Still waiting for payment confirmation. Refresh in a minute.', 'bad');
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('w') && WEATHER[params.get('w')]) {
    weather.setMode(params.get('w'));
    $('#weather').value = params.get('w');
  }
  try {
    const [cfg, me] = await Promise.all([api.get('/api/config'), api.get('/api/me')]);
    app.config = cfg;
    app.user = me.user;
    document.title = cfg.site.name;
    $('#site-name').textContent = cfg.site.name;
  } catch {
    // keep the defaults; the map still works
  }
  ui.syncAccount();
  app.setMode('explore');
  try {
    await app.refresh();
  } catch (e) {
    toast(e.message, 'bad');
  }
  if (app.config.preview) toast('Preview site: the buildings are samples, and anything added here is cleared regularly.', '', 9000);
  const pid = Number(params.get('p'));
  if (pid && app.byId.has(pid)) ui.openProperty(pid, true);
  await handleReturnFromCheckout(params);
  if (params.has('order') || params.has('cancelled')) history.replaceState(null, '', location.pathname);
}

window.__app = app; // handy in the browser console
boot();
