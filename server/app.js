// HTTP API + static site.

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorld } from '../shared/world.js';
import { SITE, BUILDINGS, CHARITIES, DONATION, LIMITS, validateSpec, quote } from '../shared/catalog.js';
import { transaction } from './db.js';
import { SESSION_COOKIE, hashPassword, verifyPassword, createSession, destroySession, userForToken, parseCookies } from './auth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VISITOR_COOKIE = 'bi_vid';
const HOLD_MS = 30 * 60 * 1000;          // how long an unpaid checkout reserves its lot
const TRAFFIC_WINDOW_MS = 30 * 60 * 1000; // one counted view per visitor per property per window

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Accept only http(s) links; "example.com" becomes "https://example.com/".
export function cleanUrl(v) {
  if (v == null || v === '') return { ok: true, url: '' };
  if (typeof v !== 'string') return { ok: false };
  let s = v.trim();
  if (!s) return { ok: true, url: '' };
  if (s.length > LIMITS.url) return { ok: false };
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return { ok: false }; // some other scheme
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false };
    if (!u.hostname.includes('.') || u.username || u.password) return { ok: false };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false };
  }
}

function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 20000) for (const [k, e] of hits) if (e.reset < now) hits.delete(k);
    const key = req.ip || 'unknown';
    let e = hits.get(key);
    if (!e || e.reset < now) {
      e = { n: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.n += 1;
    if (e.n > max) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}

export function createApp({ db, payments, env = {} }) {
  const world = createWorld();
  const app = express();
  const secure = env.NODE_ENV === 'production';
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
  let version = Date.now();
  const bump = () => {
    version += 1;
  };
  const traffic = new Map();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });

  // ---- helpers ---------------------------------------------------------------

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const cookieOpts = (maxAge) => ({ httpOnly: true, sameSite: 'lax', secure, maxAge, path: '/' });

  const publicProperty = (r) => ({
    id: r.id,
    type: r.type,
    style: r.style,
    tier: r.tier,
    colour: r.colour,
    floors: r.floors,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    name: r.name,
    url: r.url,
    message: r.message,
    zone: r.zone,
    address: r.address,
    landCents: r.land_cents,
    buildCents: r.build_cents,
    valueCents: r.value_cents,
    views: r.views,
    clicks: r.clicks,
    owner: r.owner_name,
    ownerId: r.owner_id,
    createdAt: r.created_at,
  });

  const PROPERTY_SELECT = 'SELECT p.*, u.name AS owner_name FROM properties p JOIN users u ON u.id = p.owner_id';

  const addRect = (set, r) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(world.ti(x, y));
  };

  // Tiles that are taken: built properties plus lots reserved by a checkout
  // that is still waiting for payment.
  function occupiedTiles(ignoreOrderId) {
    const set = new Set();
    for (const p of db.prepare('SELECT x, y, w, h FROM properties').all()) addRect(set, p);
    const held = db.prepare("SELECT id, payload FROM orders WHERE kind = 'property' AND status = 'pending' AND created_at > ?").all(Date.now() - HOLD_MS);
    for (const o of held) {
      if (o.id !== ignoreOrderId) addRect(set, JSON.parse(o.payload));
    }
    return set;
  }

  function createOrder(kind, userId, payload, amountCents) {
    const id = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    db.prepare('INSERT INTO orders (id, kind, user_id, payload, amount_cents, status, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, kind, userId, JSON.stringify(payload), amountCents, 'pending', payments.mode, now, now,
    );
    return { id, kind, user_id: userId, payload, amount_cents: amountCents };
  }

  const setOrder = (id, status, extra = {}) => {
    db.prepare('UPDATE orders SET status = ?, provider_ref = COALESCE(?, provider_ref), result = COALESCE(?, result), updated_at = ? WHERE id = ?').run(
      status, extra.ref ?? null, extra.result ? JSON.stringify(extra.result) : null, Date.now(), id,
    );
  };

  // Turn a paid order into a property or a donation. Safe to call twice.
  function finalizeOrder(orderId, ref) {
    return transaction(db, () => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order) throw new HttpError(404, 'Order not found.');
      if (order.status === 'paid') return JSON.parse(order.result);
      if (order.status !== 'pending') throw new HttpError(409, `This order is ${order.status}.`);
      const p = JSON.parse(order.payload);
      const now = Date.now();
      let result;
      if (order.kind === 'property') {
        const lot = world.checkLot(p.x, p.y, p.w, p.h, occupiedTiles(order.id));
        if (!lot.ok) {
          setOrder(order.id, 'conflict', { ref });
          throw new HttpError(409, 'Sorry, that lot was taken while you were checking out.');
        }
        const price = quote(p, lot.zones);
        const info = db
          .prepare(
            'INSERT INTO properties (owner_id, type, style, tier, colour, floors, x, y, w, h, name, url, message, zone, address, land_cents, build_cents, value_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(order.user_id, p.type, p.style, p.tier, p.colour, p.floors, p.x, p.y, p.w, p.h, p.name, p.url, p.message, lot.zone, lot.address, price.land, price.build, price.total, now);
        result = { propertyId: Number(info.lastInsertRowid) };
      } else {
        const info = db
          .prepare('INSERT INTO donations (charity, civic_id, user_id, donor_name, message, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(p.charity, p.civicId, order.user_id, p.donorName, p.message, order.amount_cents, now);
        result = { donationId: Number(info.lastInsertRowid), amountCents: order.amount_cents, charity: p.charity };
      }
      setOrder(order.id, 'paid', { ref, result });
      bump();
      return result;
    });
  }

  const getProperty = (id) => {
    const row = db.prepare(`${PROPERTY_SELECT} WHERE p.id = ?`).get(id);
    return row ? publicProperty(row) : null;
  };

  // ---- Stripe webhook (needs the raw body, so it sits before the JSON parser) --

  app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    if (payments.mode !== 'stripe') {
      res.status(404).json({ error: 'Not enabled.' });
      return;
    }
    let event;
    try {
      event = payments.parseWebhook(req.body.toString('utf8'), req.headers['stripe-signature']);
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const session = event?.data?.object || {};
    const orderId = session.client_reference_id || session.metadata?.order_id;
    try {
      if (event.type === 'checkout.session.completed' && session.payment_status === 'paid' && orderId) {
        finalizeOrder(orderId, session.id);
      } else if (event.type === 'checkout.session.expired' && orderId) {
        const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
        if (order?.status === 'pending') setOrder(orderId, 'expired');
      }
    } catch (err) {
      // A conflict here means money was taken for a lot that is gone; it is
      // recorded on the order (status "conflict") for a manual refund.
      console.error(`webhook: could not complete order ${orderId}: ${err.message}`);
    }
    res.json({ received: true });
  });

  // ---- API middleware --------------------------------------------------------

  const api = express.Router();
  app.use('/api', api);
  api.use(express.json({ limit: '20kb' }));
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // State-changing calls must be JSON: browsers cannot send that cross-site
    // without a CORS preflight, which we never approve.
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      next(new HttpError(415, 'Send JSON.'));
      return;
    }
    req.cookies = parseCookies(req.headers.cookie);
    req.user = userForToken(db, req.cookies[SESSION_COOKIE]);
    next();
  });

  const requireUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in first.')));
  const writeLimit = limiter(40, 60 * 1000);
  const authLimit = limiter(12, 60 * 1000);
  const trafficLimit = limiter(240, 60 * 1000);

  // ---- config + accounts -------------------------------------------------------

  api.get('/config', (req, res) => {
    res.json({ site: SITE, payments: payments.mode });
  });

  api.get('/me', (req, res) => {
    res.json({ user: req.user });
  });

  api.post('/register', authLimit, wrap(async (req, res) => {
    const name = cleanText(req.body.name, LIMITS.displayName);
    const email = cleanText(req.body.email, 120).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2) throw new HttpError(400, 'Enter the brand or name you want shown on the island.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Use a password of at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'There is already an account with that email. Try signing in.');
    const { hash, salt } = await hashPassword(password);
    const info = db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)').run(email, name, hash, salt, Date.now());
    const id = Number(info.lastInsertRowid);
    const session = createSession(db, id);
    res.cookie(SESSION_COOKIE, session.token, cookieOpts(session.expires - Date.now()));
    res.status(201).json({ user: { id, email, name } });
  }));

  api.post('/login', authLimit, wrap(async (req, res) => {
    const email = cleanText(req.body.email, 120).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Always spend the time of a hash check so timing does not reveal accounts.
    const ok = row ? await verifyPassword(password, row.pass_hash, row.pass_salt) : (await hashPassword(password, '00'), false);
    if (!ok) throw new HttpError(401, 'That email and password do not match.');
    const session = createSession(db, row.id);
    res.cookie(SESSION_COOKIE, session.token, cookieOpts(session.expires - Date.now()));
    res.json({ user: { id: row.id, email: row.email, name: row.name } });
  }));

  api.post('/logout', (req, res) => {
    destroySession(db, req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ---- the island ---------------------------------------------------------------

  api.get('/version', (req, res) => {
    res.json({ version });
  });

  api.get('/state', (req, res) => {
    if (!req.cookies[VISITOR_COOKIE]) res.cookie(VISITOR_COOKIE, crypto.randomBytes(12).toString('hex'), cookieOpts(365 * 86400000));
    const properties = db.prepare(`${PROPERTY_SELECT} ORDER BY p.id`).all().map(publicProperty);
    const totals = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS n FROM donations').get();
    const byCharity = {};
    for (const r of db.prepare('SELECT charity, SUM(amount_cents) AS cents FROM donations GROUP BY charity').all()) byCharity[r.charity] = r.cents;
    res.json({ version, properties, donatedCents: totals.cents, donationCount: totals.n, byCharity });
  });

  api.post('/quote', (req, res) => {
    const v = validateSpec(req.body);
    if (!v.ok) throw new HttpError(400, v.reason);
    const lot = world.checkLot(req.body.x, req.body.y, v.spec.w, v.spec.h, occupiedTiles());
    if (!lot.ok) throw new HttpError(409, lot.reason);
    res.json({ lot: { zone: lot.zone, zones: lot.zones, address: lot.address }, quote: quote(v.spec, lot.zones) });
  });

  api.post('/properties', writeLimit, requireUser, wrap(async (req, res) => {
    const v = validateSpec(req.body);
    if (!v.ok) throw new HttpError(400, v.reason);
    const { x, y } = req.body;
    const name = cleanText(req.body.name, LIMITS.name);
    const message = cleanText(req.body.message, LIMITS.message);
    const link = cleanUrl(req.body.url);
    if (name.length < 2) throw new HttpError(400, 'Give your property a name (your brand, for example).');
    if (!link.ok) throw new HttpError(400, 'That website address does not look right. Use a normal http(s) link.');
    const lot = world.checkLot(x, y, v.spec.w, v.spec.h, occupiedTiles());
    if (!lot.ok) throw new HttpError(409, lot.reason);
    const price = quote(v.spec, lot.zones);
    const order = createOrder('property', req.user.id, { ...v.spec, x, y, name, url: link.url, message }, price.total);
    let pay;
    try {
      pay = await payments.start(order, {
        description: `${BUILDINGS[v.spec.type].name} at ${lot.address || 'Brand Island'}`,
        successUrl: `${publicUrl}/?order=${order.id}`,
        cancelUrl: `${publicUrl}/?cancelled=${order.id}`,
        email: req.user.email,
      });
    } catch (err) {
      setOrder(order.id, 'failed');
      throw new HttpError(502, err.message);
    }
    if (pay.status === 'paid') {
      const result = finalizeOrder(order.id, pay.ref);
      res.status(201).json({ status: 'paid', property: getProperty(result.propertyId) });
    } else {
      setOrder(order.id, 'pending', { ref: pay.ref });
      res.json({ status: 'redirect', url: pay.url, orderId: order.id });
    }
  }));

  api.get('/properties/:id', (req, res) => {
    const p = getProperty(Number(req.params.id));
    if (!p) throw new HttpError(404, 'That property no longer exists.');
    res.json({ property: p });
  });

  api.patch('/properties/:id', writeLimit, requireUser, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT owner_id FROM properties WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'That property no longer exists.');
    if (row.owner_id !== req.user.id) throw new HttpError(403, 'Only the owner can edit this property.');
    const name = cleanText(req.body.name, LIMITS.name);
    const message = cleanText(req.body.message, LIMITS.message);
    const link = cleanUrl(req.body.url);
    if (name.length < 2) throw new HttpError(400, 'Give your property a name.');
    if (!link.ok) throw new HttpError(400, 'That website address does not look right. Use a normal http(s) link.');
    db.prepare('UPDATE properties SET name = ?, url = ?, message = ? WHERE id = ?').run(name, link.url, message, id);
    bump();
    res.json({ property: getProperty(id) });
  });

  api.delete('/properties/:id', writeLimit, requireUser, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT owner_id FROM properties WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'That property no longer exists.');
    if (row.owner_id !== req.user.id) throw new HttpError(403, 'Only the owner can demolish this property.');
    db.prepare('DELETE FROM properties WHERE id = ?').run(id);
    bump();
    res.json({ ok: true });
  });

  // Traffic: a "view" is someone opening the ad, a "click" is following its link.
  function countTraffic(kind) {
    return (req, res) => {
      const id = Number(req.params.id);
      const vid = req.cookies[VISITOR_COOKIE];
      let counted = false;
      if (vid && Number.isInteger(id)) {
        const key = `${vid}:${id}:${kind}`;
        const now = Date.now();
        if (traffic.size > 50000) for (const [k, t] of traffic) if (now - t > TRAFFIC_WINDOW_MS) traffic.delete(k);
        if (!traffic.has(key) || now - traffic.get(key) > TRAFFIC_WINDOW_MS) {
          const info = db.prepare(`UPDATE properties SET ${kind} = ${kind} + 1 WHERE id = ?`).run(id);
          if (info.changes) {
            traffic.set(key, now);
            counted = true;
          }
        }
      }
      res.json({ counted });
    };
  }
  api.post('/properties/:id/view', trafficLimit, countTraffic('views'));
  api.post('/properties/:id/click', trafficLimit, countTraffic('clicks'));

  // ---- donations -----------------------------------------------------------------

  const donorKey = "COALESCE('u' || user_id, 'n' || lower(donor_name))";

  api.get('/civics/:id', (req, res) => {
    const civic = world.civics.find((c) => c.id === req.params.id);
    if (!civic) throw new HttpError(404, 'No such place.');
    const charity = CHARITIES[civic.charity];
    const total = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS n FROM donations WHERE charity = ?').get(civic.charity);
    const top = db
      .prepare(`SELECT MAX(donor_name) AS name, SUM(amount_cents) AS cents FROM donations WHERE charity = ? GROUP BY ${donorKey} ORDER BY cents DESC LIMIT 5`)
      .all(civic.charity);
    const recent = db.prepare('SELECT donor_name AS name, amount_cents AS cents, message, created_at AS at FROM donations WHERE charity = ? ORDER BY id DESC LIMIT 5').all(civic.charity);
    res.json({ civic: { id: civic.id, name: civic.name, kind: civic.kind }, charity: { id: civic.charity, ...charity }, totalCents: total.cents, count: total.n, top, recent });
  });

  api.post('/donations', writeLimit, wrap(async (req, res) => {
    const civic = world.civics.find((c) => c.id === req.body.civicId);
    if (!civic) throw new HttpError(404, 'No such place.');
    const amount = req.body.amountCents;
    if (!Number.isInteger(amount) || amount < DONATION.minCents || amount > DONATION.maxCents) {
      throw new HttpError(400, `Donations can be between $${DONATION.minCents / 100} and $${(DONATION.maxCents / 100).toLocaleString('en-US')}.`);
    }
    const donorName = cleanText(req.body.donorName, LIMITS.displayName) || 'Anonymous';
    const message = cleanText(req.body.message, 140);
    const order = createOrder('donation', req.user?.id ?? null, { civicId: civic.id, charity: civic.charity, donorName, message }, amount);
    let pay;
    try {
      pay = await payments.start(order, {
        description: `Donation to ${CHARITIES[civic.charity].name}`,
        successUrl: `${publicUrl}/?order=${order.id}`,
        cancelUrl: `${publicUrl}/?cancelled=${order.id}`,
        email: req.user?.email,
      });
    } catch (err) {
      setOrder(order.id, 'failed');
      throw new HttpError(502, err.message);
    }
    if (pay.status === 'paid') {
      const result = finalizeOrder(order.id, pay.ref);
      res.status(201).json({ status: 'paid', donation: result });
    } else {
      setOrder(order.id, 'pending', { ref: pay.ref });
      res.json({ status: 'redirect', url: pay.url, orderId: order.id });
    }
  }));

  api.get('/leaderboards', (req, res) => {
    const donors = db
      .prepare(`SELECT MAX(donor_name) AS name, SUM(amount_cents) AS cents, COUNT(*) AS gifts FROM donations GROUP BY ${donorKey} ORDER BY cents DESC LIMIT 20`)
      .all();
    const charities = Object.entries(CHARITIES).map(([id, c]) => {
      const t = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS n FROM donations WHERE charity = ?').get(id);
      const best = db.prepare(`SELECT MAX(donor_name) AS name, SUM(amount_cents) AS cents FROM donations WHERE charity = ? GROUP BY ${donorKey} ORDER BY cents DESC LIMIT 1`).get(id);
      return { id, name: c.name, cents: t.cents, gifts: t.n, topDonor: best || null };
    });
    const brief = (r) => ({ id: r.id, name: r.name, owner: r.owner_name, type: r.type, zone: r.zone, address: r.address, x: r.x, y: r.y, w: r.w, h: r.h, valueCents: r.value_cents, views: r.views, clicks: r.clicks });
    const valuable = db.prepare(`${PROPERTY_SELECT} ORDER BY p.value_cents DESC, p.id LIMIT 20`).all().map(brief);
    const busiest = db.prepare(`${PROPERTY_SELECT} ORDER BY p.views DESC, p.clicks DESC, p.id LIMIT 20`).all().map(brief);
    res.json({ donors, charities, valuable, busiest });
  });

  // ---- orders (used when returning from a hosted checkout page) -------------------

  api.get('/orders/:id', (req, res) => {
    const o = db.prepare('SELECT id, kind, status, result FROM orders WHERE id = ?').get(String(req.params.id));
    if (!o) throw new HttpError(404, 'Order not found.');
    const result = o.result ? JSON.parse(o.result) : null;
    res.json({ id: o.id, kind: o.kind, status: o.status, result, property: result?.propertyId ? getProperty(result.propertyId) : null });
  });

  api.post('/orders/:id/cancel', (req, res) => {
    const o = db.prepare('SELECT status FROM orders WHERE id = ?').get(String(req.params.id));
    if (o?.status === 'pending') setOrder(String(req.params.id), 'cancelled');
    res.json({ ok: true });
  });

  // ---- admin (set ADMIN_TOKEN to enable) -----------------------------------------

  const requireAdmin = (req, res, next) => {
    const want = env.ADMIN_TOKEN || '';
    const got = String(req.headers['x-admin-token'] || '');
    const a = crypto.createHash('sha256').update(want).digest();
    const b = crypto.createHash('sha256').update(got).digest();
    if (!want || !crypto.timingSafeEqual(a, b)) {
      next(new HttpError(403, 'Admin access is not enabled or the token is wrong.'));
      return;
    }
    next();
  };

  api.delete('/admin/properties/:id', requireAdmin, (req, res) => {
    const info = db.prepare('DELETE FROM properties WHERE id = ?').run(Number(req.params.id));
    if (info.changes) bump();
    res.json({ removed: info.changes });
  });

  api.get('/admin/donations', requireAdmin, (req, res) => {
    const byCharity = db.prepare('SELECT charity, SUM(amount_cents) AS cents, COUNT(*) AS gifts FROM donations GROUP BY charity').all();
    const donations = db.prepare('SELECT * FROM donations ORDER BY id DESC LIMIT 1000').all();
    const conflicts = db.prepare("SELECT id, kind, amount_cents, provider_ref, updated_at FROM orders WHERE status = 'conflict'").all();
    res.json({ byCharity, donations, conflicts });
  });

  api.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // ---- static site ---------------------------------------------------------------

  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use(express.static(path.join(ROOT, 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message });
  });

  return app;
}
