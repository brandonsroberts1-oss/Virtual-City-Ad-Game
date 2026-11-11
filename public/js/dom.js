// Small DOM helpers. All text goes in through textContent, so user-supplied
// names and messages can never be interpreted as HTML.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.assign(el.dataset, v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

function makeWindow(title, body, onClose, extraClass = '') {
  const close = h('button', { class: 'btn', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => onClose() }, 'X');
  return h(
    'section',
    { class: `window ${extraClass}`, role: 'dialog', 'aria-label': title },
    h('div', { class: 'titlebar' }, h('span', { text: title }), close),
    h('div', { class: 'window-body' }, body),
  );
}

let sideClose = null;

// main.js sets hooks.side to hear when the side card opens or closes.
export const hooks = { side: null };

// The card on the right-hand side (a property's ad or a donation form).
export function openSide(title, body, onClose) {
  closeSide();
  const root = $('#side');
  const win = makeWindow(title, body, () => closeSide());
  root.append(win);
  sideClose = onClose || null;
  if (hooks.side) hooks.side(true);
  return win;
}

export function closeSide() {
  const root = $('#side');
  if (!root.firstChild) return;
  root.replaceChildren();
  const cb = sideClose;
  sideClose = null;
  if (cb) cb();
  if (hooks.side) hooks.side(false);
}

// A centred dialog with a dimmed backdrop.
export function openModal(title, body, { narrow = false } = {}) {
  const root = $('#modals');
  const win = makeWindow(title, body, () => closeModal(), narrow ? 'narrow' : '');
  root.replaceChildren(win);
  const first = win.querySelector('input, textarea, select, .window-body button');
  if (first) first.focus();
  return win;
}

export function closeModal() {
  $('#modals').replaceChildren();
}

export function modalOpen() {
  return !!$('#modals').firstChild;
}

export function toast(message, kind = '', ms = kind === 'bad' ? 5200 : 3600) {
  const el = h('div', { class: `toast ${kind}`, text: message });
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

// Draw a pixel sprite centred in a canvas at the largest whole-number scale
// that fits (or shrunk smoothly if it is too big even at 1x).
export function drawSprite(canvas, spriteCanvas, maxScale = 4) {
  const w = canvas.clientWidth || canvas.width;
  const hgt = canvas.clientHeight || canvas.height;
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  const fit = Math.min((w - 8) / spriteCanvas.width, (hgt - 8) / spriteCanvas.height);
  const scale = fit >= 1 ? Math.min(maxScale, Math.floor(fit)) : fit;
  ctx.imageSmoothingEnabled = scale < 1;
  const dw = Math.round(spriteCanvas.width * scale);
  const dh = Math.round(spriteCanvas.height * scale);
  ctx.drawImage(spriteCanvas, Math.round((w - dw) / 2), Math.round((hgt - dh) / 2), dw, dh);
}

// Trim a sprite's transparent border so previews use their space well.
export function trimmed(spriteObj) {
  if (spriteObj.trim) return spriteObj.trim;
  const b = spriteObj.buf.bounds();
  const cv = document.createElement('canvas');
  cv.width = b.x1 - b.x0 + 1;
  cv.height = b.y1 - b.y0 + 1;
  cv.getContext('2d').drawImage(spriteObj.canvas, -b.x0, -b.y0);
  spriteObj.trim = cv;
  return cv;
}
