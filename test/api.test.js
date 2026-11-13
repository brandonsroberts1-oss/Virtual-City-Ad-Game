import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, Client, SHOP } from './helpers.js';
import { cleanUrl } from '../server/app.js';

let app;
before(async () => {
  app = await startApp({ ADMIN_TOKEN: 'let-me-in' });
});
after(() => app.close());

const LOT = { x: 20, y: 99 }; // a waterfront lot on Ocean Drive

test('the site and its config are served with safe headers', async () => {
  const c = new Client(app.base);
  const page = await c.get('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<canvas id="view"/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const cfg = await c.get('/api/config');
  assert.equal(cfg.json.payments, 'demo');
  assert.equal((await c.get('/shared/world.js')).status, 200);
  assert.equal((await c.get('/api/nope')).status, 404);
});

test('accounts: register, sign out, sign in, and the usual mistakes', async () => {
  const c = new Client(app.base);
  assert.equal((await c.get('/api/me')).json.user, null);
  assert.equal((await c.post('/api/register', { name: 'A', email: 'a@example.com', password: 'long-enough' })).status, 400);
  assert.equal((await c.post('/api/register', { name: 'Acme', email: 'not-an-email', password: 'long-enough' })).status, 400);
  assert.equal((await c.post('/api/register', { name: 'Acme', email: 'acme@example.com', password: 'short' })).status, 400);
  const user = await c.register('Acme', 'acme@example.com');
  assert.equal(user.name, 'Acme');
  assert.equal((await c.get('/api/me')).json.user.email, 'acme@example.com');
  assert.equal((await c.post('/api/register', { name: 'Acme 2', email: 'ACME@example.com', password: 'long-enough' })).status, 409);

  await c.post('/api/logout');
  assert.equal((await c.get('/api/me')).json.user, null);
  assert.equal((await c.post('/api/login', { email: 'acme@example.com', password: 'wrong-password' })).status, 401);
  assert.equal((await c.post('/api/login', { email: 'nobody@example.com', password: 'whatever-it-is' })).status, 401);
  assert.equal((await c.post('/api/login', { email: 'acme@example.com', password: 'a-good-password' })).status, 200);
  assert.equal((await c.get('/api/me')).json.user.name, 'Acme');

  // passwords are never stored in the clear
  const row = app.db.prepare('SELECT * FROM users WHERE email = ?').get('acme@example.com');
  assert.ok(!JSON.stringify(row).includes('a-good-password'));
});

test('buying a lot: priced by the server, shown to everyone, and never sold twice', async () => {
  const owner = new Client(app.base);
  const visitor = new Client(app.base);

  // must be signed in
  assert.equal((await visitor.post('/api/properties', { ...SHOP, ...LOT, name: 'Nope' })).status, 401);
  await owner.register('Coral Coffee');

  const q = await owner.post('/api/quote', { ...SHOP, ...LOT });
  assert.equal(q.status, 200);
  assert.equal(q.json.lot.zone, 'waterfront');
  assert.equal(q.json.quote.land, 5000);
  assert.equal(q.json.quote.build, 4500);

  // the client cannot choose its own price or sneak in fields
  const buy = await owner.post('/api/properties', {
    ...SHOP, ...LOT,
    name: '  Coral   Coffee <b>Roasters</b> ',
    url: 'coralcoffee.example.com/menu',
    message: 'Fresh beans.\n<script>alert(1)</script>',
    valueCents: 1, value_cents: 1, views: 9999, owner_id: 999,
  });
  assert.equal(buy.status, 201);
  const p = buy.json.property;
  assert.equal(p.name, 'Coral Coffee <b>Roasters</b>'); // kept as plain text, whitespace tidied
  assert.equal(p.url, 'https://coralcoffee.example.com/menu');
  assert.equal(p.message, 'Fresh beans. <script>alert(1)</script>');
  assert.equal(p.valueCents, 9500);
  assert.equal(p.views, 0);
  assert.equal(p.owner, 'Coral Coffee');
  assert.equal(p.zone, 'waterfront');
  assert.match(p.address, /Ocean Drive/);

  const state = await visitor.get('/api/state');
  assert.equal(state.json.properties.length, 1);
  assert.equal(state.json.properties[0].id, p.id);

  // same lot, overlapping lot: refused
  const rival = new Client(app.base);
  await rival.register('Rival Inc');
  assert.equal((await rival.post('/api/properties', { ...SHOP, ...LOT, name: 'Rival' })).status, 409);
  assert.equal((await rival.post('/api/properties', { ...SHOP, w: 2, h: 2, x: 19, y: 99, name: 'Rival' })).status, 409);
  assert.equal((await rival.post('/api/quote', { ...SHOP, ...LOT })).status, 409);
  // unbuildable ground, bad design, bad link, no name
  assert.equal((await rival.post('/api/properties', { ...SHOP, x: 2, y: 2, name: 'At sea' })).status, 409);
  assert.equal((await rival.post('/api/properties', { ...SHOP, floors: 99, x: 24, y: 99, name: 'Too tall' })).status, 400);
  assert.equal((await rival.post('/api/properties', { ...SHOP, x: 24, y: 99, name: 'Bad link', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await rival.post('/api/properties', { ...SHOP, x: 24, y: 99, name: '' })).status, 400);
  assert.equal((await visitor.get('/api/state')).json.properties.length, 1);
});

test('only the owner can edit or demolish; an admin can remove anything', async () => {
  const owner = new Client(app.base);
  const other = new Client(app.base);
  await owner.register('Tide Surf');
  await other.register('Someone Else');
  const p = (await owner.post('/api/properties', { ...SHOP, x: 30, y: 99, name: 'Tide Surf', url: 'https://tide.example.com' })).json.property;

  assert.equal((await other.request('PATCH', `/api/properties/${p.id}`, { name: 'Hacked' })).status, 403);
  assert.equal((await other.request('DELETE', `/api/properties/${p.id}`, {})).status, 403);
  assert.equal((await new Client(app.base).request('PATCH', `/api/properties/${p.id}`, { name: 'Hacked' })).status, 401);

  const edit = await owner.request('PATCH', `/api/properties/${p.id}`, { name: 'Tide Surf Co.', url: '', message: 'Lessons daily.' });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.property.name, 'Tide Surf Co.');
  assert.equal(edit.json.property.url, '');
  assert.equal(edit.json.property.message, 'Lessons daily.');
  assert.equal(edit.json.property.valueCents, p.valueCents, 'editing the ad does not change the value');

  assert.equal((await owner.request('DELETE', `/api/properties/${p.id}`, {})).status, 200);
  assert.equal((await owner.get(`/api/properties/${p.id}`)).status, 404);
  // the lot is for sale again
  const again = await other.post('/api/properties', { ...SHOP, x: 30, y: 99, name: 'Second Owner' });
  assert.equal(again.status, 201);

  assert.equal((await other.request('DELETE', `/api/admin/properties/${again.json.property.id}`, {})).status, 403);
  assert.equal((await other.request('DELETE', `/api/admin/properties/${again.json.property.id}`, {}, { 'x-admin-token': 'wrong' })).status, 403);
  const removed = await other.request('DELETE', `/api/admin/properties/${again.json.property.id}`, {}, { 'x-admin-token': 'let-me-in' });
  assert.equal(removed.json.removed, 1);
});

test('traffic counts each visitor once per property, and feeds the leaderboard', async () => {
  const owner = new Client(app.base);
  await owner.register('Busy Shop');
  const quiet = (await owner.post('/api/properties', { ...SHOP, x: 34, y: 99, name: 'Quiet Shop' })).json.property;
  const busy = (await owner.post('/api/properties', { ...SHOP, x: 36, y: 99, name: 'Busy Shop' })).json.property;

  const noCookie = new Client(app.base);
  assert.equal((await noCookie.post(`/api/properties/${busy.id}/view`)).json.counted, false, 'no visitor cookie, no count');

  for (let i = 0; i < 3; i++) {
    const v = new Client(app.base);
    await v.get('/api/state'); // hands out the visitor cookie
    assert.equal((await v.post(`/api/properties/${busy.id}/view`)).json.counted, true);
    assert.equal((await v.post(`/api/properties/${busy.id}/view`)).json.counted, false, 'repeat views are ignored');
    if (i === 0) {
      assert.equal((await v.post(`/api/properties/${busy.id}/click`)).json.counted, true);
      assert.equal((await v.post(`/api/properties/${quiet.id}/view`)).json.counted, true);
    }
  }
  assert.equal((await owner.get(`/api/properties/${busy.id}`)).json.property.views, 3);
  assert.equal((await owner.get(`/api/properties/${busy.id}`)).json.property.clicks, 1);

  const boards = (await owner.get('/api/leaderboards')).json;
  assert.equal(boards.busiest[0].id, busy.id);
  assert.equal(boards.busiest[0].views, 3);
  assert.equal(boards.busiest[1].id, quiet.id);
  assert.ok(boards.valuable.length >= 2);
  for (let i = 1; i < boards.valuable.length; i++) assert.ok(boards.valuable[i - 1].valueCents >= boards.valuable[i].valueCents);
});

test('donations go to the charity behind the building and rank donors', async () => {
  const brand = new Client(app.base);
  await brand.register('Blue Heron Bank');
  const anon = new Client(app.base);

  assert.equal((await anon.post('/api/donations', { civicId: 'casino', amountCents: 1000 })).status, 404);
  assert.equal((await anon.post('/api/donations', { civicId: 'hospital', amountCents: 50 })).status, 400);
  assert.equal((await anon.post('/api/donations', { civicId: 'hospital', amountCents: 10.5 })).status, 400);
  assert.equal((await anon.post('/api/donations', { civicId: 'hospital', amountCents: -500 })).status, 400);

  assert.equal((await brand.post('/api/donations', { civicId: 'hospital', amountCents: 5000, donorName: 'Blue Heron Bank' })).status, 201);
  assert.equal((await brand.post('/api/donations', { civicId: 'central-park', amountCents: 2500, donorName: 'Blue Heron Bank' })).status, 201);
  assert.equal((await anon.post('/api/donations', { civicId: 'hospital', amountCents: 1000 })).status, 201); // no name -> Anonymous
  assert.equal((await anon.post('/api/donations', { civicId: 'beach-park', amountCents: 1500, donorName: 'Priya', message: '<i>For the turtles</i>' })).status, 201);

  const hospital = (await anon.get('/api/civics/hospital')).json;
  assert.equal(hospital.charity.id, 'health');
  assert.equal(hospital.totalCents, 6000);
  assert.equal(hospital.count, 2);
  assert.deepEqual(hospital.top.map((t) => [t.name, t.cents]), [['Blue Heron Bank', 5000], ['Anonymous', 1000]]);

  // both parks raise money for the same parks charity
  const park = (await anon.get('/api/civics/central-park')).json;
  assert.equal(park.totalCents, 4000);

  const boards = (await anon.get('/api/leaderboards')).json;
  assert.deepEqual(boards.donors.map((d) => [d.name, d.cents, d.gifts]), [['Blue Heron Bank', 7500, 2], ['Priya', 1500, 1], ['Anonymous', 1000, 1]]);
  const health = boards.charities.find((c) => c.id === 'health');
  assert.equal(health.cents, 6000);
  assert.equal(health.topDonor.name, 'Blue Heron Bank');

  const state = (await anon.get('/api/state')).json;
  assert.equal(state.donatedCents, 10000);
  assert.equal(state.byCharity.parks, 4000);

  const admin = await anon.request('GET', '/api/admin/donations', undefined, { 'x-admin-token': 'let-me-in' });
  assert.equal(admin.json.donations.length, 4);
  assert.equal((await anon.get('/api/admin/donations')).status, 403);
});

test('state-changing requests must be JSON (blocks cross-site form posts)', async () => {
  const c = new Client(app.base);
  const form = await c.request('POST', '/api/donations', 'civicId=hospital&amountCents=1000', { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const text = await c.request('POST', '/api/logout', '{}', { 'content-type': 'text/plain' });
  assert.equal(text.status, 415);
  const broken = await c.request('POST', '/api/login', '{not json', { 'content-type': 'application/json' });
  assert.equal(broken.status, 400);
});

test('website links are limited to ordinary http(s) addresses', () => {
  assert.deepEqual(cleanUrl(''), { ok: true, url: '' });
  assert.deepEqual(cleanUrl('example.com'), { ok: true, url: 'https://example.com/' });
  assert.deepEqual(cleanUrl('example.com:8080/shop'), { ok: true, url: 'https://example.com:8080/shop' });
  assert.deepEqual(cleanUrl('http://example.com/a?b=1'), { ok: true, url: 'http://example.com/a?b=1' });
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'mailto:a@example.com', 'https://user:pass@example.com', 'https://localhost', 'http://', 'x'.repeat(400), 42]) {
    assert.equal(cleanUrl(bad).ok, false, String(bad).slice(0, 40));
  }
});

test('sign-in attempts are rate limited', async () => {
  const limited = await startApp({ RATE_LIMITS: 'on' });
  try {
    const c = new Client(limited.base);
    const codes = [];
    for (let i = 0; i < 14; i++) codes.push((await c.post('/api/login', { email: 'nobody@example.com', password: `guess-number-${i}` })).status);
    assert.deepEqual(codes.slice(0, 12), Array(12).fill(401));
    assert.deepEqual(codes.slice(12), [429, 429]);
  } finally {
    await limited.close();
  }
});

test('logos: a small PNG is stored with the property, served as an image and can be replaced or removed', async () => {
  const { encodePng } = await import('../server/png.js');
  const png = (side, fill = 200) => `data:image/png;base64,${encodePng(side, side, new Uint8Array(side * side * 4).fill(fill)).toString('base64')}`;
  const owner = new Client(app.base);
  await owner.register('Logo Owner');

  // things that are not acceptable logos
  const bad = [
    'data:image/svg+xml;base64,PHN2Zy8+',          // not a PNG
    'data:image/png;base64,aGVsbG8gd29ybGQ=',     // says PNG, is not
    'https://example.com/logo.png',               // a link, not a picture
    png(4),                                       // too small
    png(300),                                     // too large on a side
    12345,
  ];
  for (const logo of bad) {
    const r = await owner.post('/api/properties', { ...SHOP, x: 50, y: 99, name: 'Bad Logo', logo });
    assert.equal(r.status, 400, String(logo).slice(0, 40));
  }
  assert.equal((await owner.get('/api/state')).json.properties.some((p) => p.name === 'Bad Logo'), false);

  const logo = png(64);
  const p = (await owner.post('/api/properties', { ...SHOP, x: 50, y: 99, name: 'With Logo', logo })).json.property;
  assert.equal(p.logo, `/api/properties/${p.id}/logo?v=1`);
  const got = await fetch(app.base + p.logo);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.match(got.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(Buffer.from(await got.arrayBuffer()).toString('base64'), logo.split(',')[1]);

  // the island listing carries the link, never the picture itself
  const listed = (await owner.get('/api/state')).json.properties.find((q) => q.id === p.id);
  assert.equal(listed.logo, p.logo);
  assert.ok(JSON.stringify(listed).length < 1000);

  // editing the text keeps the logo; sending a new one replaces it; null removes it
  const kept = (await owner.request('PATCH', `/api/properties/${p.id}`, { name: 'With Logo', message: 'Hello' })).json.property;
  assert.equal(kept.logo, p.logo);
  const swapped = (await owner.request('PATCH', `/api/properties/${p.id}`, { name: 'With Logo', logo: png(32, 90) })).json.property;
  assert.equal(swapped.logo, `/api/properties/${p.id}/logo?v=2`);
  const rejected = await owner.request('PATCH', `/api/properties/${p.id}`, { name: 'Renamed Anyway', logo: 'nonsense' });
  assert.equal(rejected.status, 400);
  assert.equal((await owner.get(`/api/properties/${p.id}`)).json.property.name, 'With Logo', 'a bad logo changes nothing');
  const removed = (await owner.request('PATCH', `/api/properties/${p.id}`, { name: 'With Logo', logo: null })).json.property;
  assert.equal(removed.logo, null);
  assert.equal((await fetch(`${app.base}/api/properties/${p.id}/logo`)).status, 404);

  // someone else cannot change it
  const other = new Client(app.base);
  await other.register('Not The Owner');
  assert.equal((await other.request('PATCH', `/api/properties/${p.id}`, { name: 'With Logo', logo })).status, 403);
});

test('the charities list shows who the money is for, where to give and every gift so far', async () => {
  const c = new Client(app.base);
  const before = (await c.get('/api/charities')).json;
  await c.post('/api/donations', { civicId: 'east-school', amountCents: 1700, donorName: 'Ledger Check' });
  const d = (await c.get('/api/charities')).json;
  assert.deepEqual(d.charities.map((x) => x.id), ['health', 'education', 'scholarship', 'hunger', 'parks']);
  assert.equal(d.totalCents, before.totalCents + 1700);
  assert.equal(d.gifts, before.gifts + 1);
  assert.deepEqual([d.recent[0].name, d.recent[0].cents, d.recent[0].charity], ['Ledger Check', 1700, 'education']);
  assert.equal(d.payments, 'demo');

  const edu = d.charities.find((x) => x.id === 'education');
  assert.deepEqual(edu.places.map((p) => p.id), ['school', 'east-school', 'hill-school']);
  assert.equal(edu.totalCents, before.charities.find((x) => x.id === 'education').totalCents + 1700);
  // the stand-in names that ship with the site are flagged as such
  assert.ok(d.charities.every((x) => x.placeholder === true && x.registration === '' && x.url === ''));
  // every civic building belongs to a listed charity
  const places = d.charities.flatMap((x) => x.places);
  assert.equal(places.length, 18);
});
