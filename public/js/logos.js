// Business logos: loading them, shrinking an uploaded picture to a small PNG,
// and mounting a logo on a building as a flag, a billboard or a wall sign.

const images = new Map(); // url -> { el, ready, failed, waiters }

// Start loading a logo (once per URL). onReady is called when it arrives.
export function logoImage(url, onReady) {
  let e = images.get(url);
  if (!e) {
    e = { el: new Image(), ready: false, failed: false, waiters: [] };
    e.el.onload = () => {
      e.ready = true;
      for (const f of e.waiters.splice(0)) f();
    };
    e.el.onerror = () => {
      e.failed = true;
      e.waiters.length = 0;
    };
    e.el.src = url;
    images.set(url, e);
  }
  if (!e.ready && !e.failed && onReady) e.waiters.push(onReady);
  return e;
}

// Turn a picture the visitor picked into a 128x128 PNG data URL.
export async function fileToLogo(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose an image file (PNG, JPG, SVG ...).');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is too big. Use one under 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image.'));
      i.src = url;
    });
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext('2d');
    const w = img.naturalWidth || S;
    const h = img.naturalHeight || S;
    const k = Math.min(S / w, S / h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (S - w * k) / 2, (S - h * k) / 2, w * k, h * k);
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FRAME = '#22262c';
const BOARD = '#fbfaf4';
const POST = '#5d646c';

// draw the logo as large as fits inside a box, centred
function contain(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const k = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
}

const composites = new WeakMap(); // base sprite -> Map(logo url -> sprite)

// A copy of a building sprite with the logo mounted where the building's
// design said it goes (base.sign).
export function spriteWithLogo(base, img) {
  const s = base.sign;
  if (!s || !img) return base;
  let byLogo = composites.get(base);
  if (!byLogo) composites.set(base, (byLogo = new Map()));
  const hit = byLogo.get(img.src);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = base.w;
  cv.height = base.h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(base.canvas, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  let box;
  if (s.kind === 'wall') {
    // mounted on a left-facing wall, which drops one pixel for every two across
    const x = s.px + s.inset;
    const top = s.py + s.inset * 0.5 - s.h;
    ctx.setTransform(1, 0.5, 0, 1, x, top);
    ctx.fillStyle = FRAME;
    ctx.fillRect(0, 0, s.w, s.h);
    ctx.fillStyle = BOARD;
    ctx.fillRect(1, 1, s.w - 2, s.h - 2);
    contain(ctx, img, 2, 2, s.w - 4, s.h - 4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    box = { x0: x, y0: Math.floor(top), x1: x + s.w, y1: Math.ceil(top + s.h + s.w * 0.5) };
  } else if (s.kind === 'flag') {
    const top = s.py - s.pole;
    ctx.fillStyle = '#e4e4e0';
    ctx.fillRect(s.px, top, 1, s.pole);
    ctx.fillStyle = '#8a8e96';
    ctx.fillRect(s.px - 1, s.py - 1, 3, 1);
    // draw the flag flat, then copy it across in strips that rise and fall
    const flat = document.createElement('canvas');
    flat.width = s.w;
    flat.height = s.h;
    const f = flat.getContext('2d');
    f.fillStyle = BOARD;
    f.fillRect(0, 0, s.w, s.h);
    f.imageSmoothingQuality = 'high';
    contain(f, img, 1, 1, s.w - 2, s.h - 2);
    f.fillStyle = 'rgba(0,0,0,0.28)';
    f.fillRect(0, s.h - 1, s.w, 1);
    f.fillRect(s.w - 1, 0, 1, s.h);
    const strip = Math.max(2, Math.round(s.w / 4));
    for (let x = 0; x < s.w; x += strip) {
      const lift = Math.floor(x / strip) % 2;
      ctx.drawImage(flat, x, 0, strip, s.h, s.px + 1 + x, top + lift, strip, s.h);
    }
    box = { x0: s.px - 1, y0: top, x1: s.px + 1 + s.w, y1: s.py };
  } else {
    // free-standing billboard on two posts, facing the camera
    const x = s.px - Math.round(s.w / 2);
    const top = s.py - s.post - s.h;
    ctx.fillStyle = POST;
    ctx.fillRect(x + 2, top + s.h, 1, s.post);
    ctx.fillRect(x + s.w - 3, top + s.h, 1, s.post);
    ctx.fillStyle = FRAME;
    ctx.fillRect(x, top, s.w, s.h);
    ctx.fillStyle = BOARD;
    ctx.fillRect(x + 1, top + 1, s.w - 2, s.h - 2);
    contain(ctx, img, x + 2, top + 2, s.w - 4, s.h - 4);
    box = { x0: x, y0: top, x1: x + s.w, y1: s.py };
  }
  const b = base.buf.bounds() || box;
  const out = {
    buf: base.buf,
    ax: base.ax,
    ay: base.ay,
    w: base.w,
    h: base.h,
    canvas: cv,
    sign: s,
    key: `${base.key}|${img.src.length}:${img.src.slice(-24)}`,
    bounds: { x0: Math.max(0, Math.min(b.x0, box.x0)), y0: Math.max(0, Math.min(b.y0, box.y0)), x1: Math.min(base.w - 1, Math.max(b.x1, box.x1)), y1: Math.min(base.h - 1, Math.max(b.y1, box.y1)) },
  };
  byLogo.set(img.src, out);
  return out;
}
