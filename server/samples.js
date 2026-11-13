// Made-up sample properties and donations, so a fresh island can be shown
// looking busy. Every sample belongs to an account whose email ends in
// @demo.invalid, which is how they are found again and removed.

import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { createWorld, mulberry32 } from '../shared/world.js';
import { BUILDINGS, TIERS, COLOURS, quote, validateSpec } from '../shared/catalog.js';
import { transaction } from './db.js';
import { encodePng } from './png.js';

const sampleUsers = (db) => db.prepare("SELECT id FROM users WHERE email LIKE '%@demo.invalid'").all().map((r) => r.id);

export function hasSamples(db) {
  return sampleUsers(db).length > 0;
}

// Remove every sample account and everything it owns. Returns how many
// accounts were removed.
export function clearSamples(db) {
  const ids = sampleUsers(db);
  for (const id of ids) {
    db.prepare('DELETE FROM properties WHERE owner_id = ?').run(id);
    db.prepare('DELETE FROM donations WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
  return ids.length;
}

const BRANDS = [
  ['Coral Coffee Roasters', 'shop', 'Small-batch beans roasted by the sea. Free delivery on the island.'],
  ['Tidewater Surf Co.', 'shop', 'Boards, wax and lessons. First lesson is on us.'],
  ['Summit Analytics', 'skyscraper', 'Dashboards your whole team will actually read.'],
  ['Blue Heron Bank', 'skyscraper', 'Banking that keeps its promises. Open an account in five minutes.'],
  ['Palm & Pine Realty', 'mansion', 'Find your place in the sun. Listings updated daily.'],
  ['Lighthouse Legal', 'skyscraper', 'Clear advice for small businesses.'],
  ['Mango Street Bakery', 'shop', 'Sourdough, pastries and the best mango tart you will ever eat.'],
  ['Driftwood Design Studio', 'home', 'Brand identities with a little salt in them.'],
  ['Harbor Hardware', 'shop', 'If we do not have it, you do not need it.'],
  ['Seabreeze Yoga', 'home', 'Sunrise classes on the beach, every day.'],
  ['Northwind Software', 'skyscraper', 'We build the boring software that runs your business.'],
  ['Sunny Acres Farm', 'farm', 'Veg boxes delivered weekly. Grown right here.'],
  ['Hilltop Vineyards', 'farm', 'Small-lot wines from the terraces. Tastings by appointment.'],
  ['Golden Hour Photography', 'home', 'Weddings, portraits and brand shoots.'],
  ['Reef Robotics', 'skyscraper', 'Underwater drones for science and industry.'],
  ['Papaya Pet Supplies', 'shop', 'Treats, toys and everything in between.'],
  ['The Gull & Anchor', 'shop', 'Fish tacos, cold drinks, ocean view.'],
  ['Castaway Books', 'shop', 'New, used and rare. Get lost in a good one.'],
  ['Villa Marisol', 'mansion', 'A private retreat for unforgettable events.'],
  ['Trade Winds Travel', 'shop', 'Island hopping made easy.'],
  ['Green Turtle Solar', 'home', 'Cut your power bill with rooftop solar.'],
  ['Cloud Nine Hosting', 'skyscraper', 'Fast, friendly web hosting with real humans on support.'],
  ['Old Mill Orchard', 'farm', 'Pick-your-own citrus, cider and farm shop.'],
  ['Saltwater Dental', 'home', 'Gentle care for the whole family.'],
  ['Kite & Key Electric', 'shop', 'Licensed electricians. Same-day call-outs.'],
  ['Windward Ranch', 'farm', 'Grass-fed and pasture-raised since day one.'],
  ['Atlas Fitness', 'shop', 'Open 24 hours. No contracts.'],
  ['Hibiscus House B&B', 'mansion', 'Four rooms, one pool, zero alarm clocks.'],
  ['Pixel Tide Games', 'home', 'Indie games made with love (and too much coffee).'],
  ['Meridian Insurance', 'skyscraper', 'Cover that makes sense. Quotes in minutes.'],
  ['Juniper Florist', 'shop', 'Bouquets for every reason, or no reason at all.'],
  ['Beacon Accounting', 'home', 'Tax season, minus the stress.'],
  ['Skyline Estate', 'mansion', 'The best view on the island. Tours on request.'],
  ['Tamarind Thai Kitchen', 'shop', 'Family recipes, island ingredients.'],
  ['Lagoon Bikes', 'shop', 'Rentals, repairs and guided rides.'],
  ['Cedar & Stone Builders', 'home', 'Custom homes built to last.'],
  ['First Light Coffee Cart', 'home', 'The earliest espresso on Ocean Drive.'],
  ['Marlin Marine', 'shop', 'Boat sales, servicing and moorings.'],
  ['Terrace Tea Gardens', 'farm', 'Hand-picked tea from the hillside.'],
  ['Compass Coworking', 'skyscraper', 'Desks, meeting rooms and very good wifi.'],
  ['Shoreline Vet Clinic', 'home', 'Caring for pets big and small.'],
  ['Bluewater Brewing', 'shop', 'Craft beer brewed a block from the beach.'],
  ['Oleander Spa', 'mansion', 'Unwind. You have earned it.'],
  ['Parrot Print Shop', 'shop', 'Signs, shirts and stickers while you wait.'],
  ['Ridge Road Honey', 'farm', 'Raw honey from hillside hives.'],
  ['Starfish Daycare', 'home', 'A happy place to learn and play.'],
];

const DONORS = ['Blue Heron Bank', 'Coral Coffee Roasters', 'Summit Analytics', 'A Friend of the Island', 'Mango Street Bakery', 'Northwind Software', 'The Okafor Family', 'Tidewater Surf Co.', 'Meridian Insurance', 'Anonymous', 'Priya S.', 'Sunny Acres Farm'];

// ---- extra made-up businesses, so a big island does not look empty -----------

const PREFIXES = ['Pelican', 'Monsoon', 'Sandbar', 'Coconut', 'Banyan', 'Orchid', 'Sunset', 'Moonrise', 'Anchor', 'Seagrass', 'Volcano', 'Tropic', 'Breeze', 'Horizon', 'Koa', 'Plumeria', 'Tidepool', 'Starboard', 'Mariner', 'Lanai', 'Wavecrest', 'Sugarcane', 'Kingfisher', 'Sea Glass', 'Trailhead', 'Conch', 'Frangipani', 'Outrigger', 'Kelp', 'Summit View', 'Bayside', 'Copper Sun', 'Little Wave', 'Big Kahuna', 'Nautilus', 'Stingray', 'Jasmine', 'Limestone', 'Evergreen', 'Zephyr'];
const KINDS = {
  shop: [['Coffee', 'Fresh roasts and a seat by the window.'], ['Surf Shop', 'Boards, wax and good advice.'], ['Bakery', 'Warm bread from 6am.'], ['Books', 'New, used and hard to put down.'], ['Bikes', 'Sales, rentals and repairs.'], ['Brewing', 'Small-batch beer brewed on the island.'], ['Florist', 'Flowers for every reason.'], ['Outfitters', 'Everything for a day outdoors.'], ['Deli', 'Sandwiches worth the walk.'], ['Ice Cream', 'Two scoops are better than one.'], ['Records', 'Vinyl, turntables and listening booths.'], ['Kitchen', 'Family recipes, island ingredients.']],
  home: [['Design Studio', 'Brand identities and websites.'], ['Yoga', 'Classes at sunrise and sunset.'], ['Photography', 'Portraits, weddings and brand shoots.'], ['Solar', 'Rooftop solar, fitted in a day.'], ['Dental', 'Gentle care for the whole family.'], ['Accounting', 'Books and taxes, minus the stress.'], ['Tutoring', 'One-to-one help in every subject.'], ['Consulting', 'Straight answers for small businesses.'], ['Vet Clinic', 'Caring for pets big and small.'], ['Builders', 'Homes built to last.']],
  skyscraper: [['Analytics', 'Dashboards your team will actually read.'], ['Bank', 'Banking that keeps its promises.'], ['Software', 'Software that just works.'], ['Legal', 'Clear advice, fixed fees.'], ['Robotics', 'Robots for the jobs nobody wants.'], ['Insurance', 'Cover that makes sense.'], ['Capital', 'Backing founders from day one.'], ['Media', 'Stories from the islands and beyond.'], ['Labs', 'Research turned into products.'], ['Logistics', 'From dock to doorstep.'], ['Coworking', 'Desks, meeting rooms and very good wifi.'], ['Hotels', 'Rooms with a view of everything.']],
  mansion: [['Realty', 'Find your place in the sun.'], ['Retreat', 'Unplug for a week. Or two.'], ['Villas', 'Private stays with a pool.'], ['Spa', 'You have earned this.'], ['Estate', 'Weddings and events with a view.']],
  farm: [['Farm', 'Veg boxes delivered weekly.'], ['Vineyards', 'Small-lot wines from the terraces.'], ['Orchard', 'Pick-your-own citrus.'], ['Ranch', 'Grass-fed and pasture-raised.'], ['Honey', 'Raw honey from island hives.'], ['Tea Gardens', 'Hand-picked tea from the hills.']],
};
const TYPE_MIX = ['shop', 'shop', 'shop', 'home', 'home', 'home', 'skyscraper', 'skyscraper', 'mansion', 'farm', 'farm'];
const SAMPLE_COUNT = 170;

function allBrands(rand) {
  const out = BRANDS.slice();
  const used = new Set(out.map((b) => b[0]));
  for (let guard = 0; out.length < SAMPLE_COUNT && guard < 5000; guard++) {
    const type = TYPE_MIX[Math.floor(rand() * TYPE_MIX.length)];
    const [kind, message] = KINDS[type][Math.floor(rand() * KINDS[type].length)];
    const name = `${PREFIXES[Math.floor(rand() * PREFIXES.length)]} ${kind}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push([name, type, message]);
  }
  return out;
}

// ---- generated logos ---------------------------------------------------------

const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
};
const LOGO_COLOURS = [
  ['#d8402f', '#fff4e0'], ['#2f6fd0', '#e8f2ff'], ['#2f9a55', '#f2ffe8'], ['#f2a230', '#3a2a12'], ['#7d5bc4', '#f4ecff'],
  ['#1f7a8a', '#e6fbff'], ['#c8366a', '#fff0f5'], ['#33373d', '#f2c230'], ['#e9622c', '#fff6ea'], ['#3f8f8a', '#fffbe8'],
  ['#1d3f8f', '#ffd24a'], ['#8a5a34', '#fff1d8'],
];
const rgb = (hexStr) => [parseInt(hexStr.slice(1, 3), 16), parseInt(hexStr.slice(3, 5), 16), parseInt(hexStr.slice(5, 7), 16)];

// A 64x64 emblem: a coloured badge with the brand's initials.
export function makeSampleLogo(name, n) {
  const S = 64;
  const px = new Uint8Array(S * S * 4);
  const [bgHex, fgHex] = LOGO_COLOURS[n % LOGO_COLOURS.length];
  const bg = rgb(bgHex);
  const fg = rgb(fgHex);
  const shape = n % 4;
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2;
      const dy = y + 0.5 - S / 2;
      let inside;
      if (shape === 0) inside = Math.hypot(dx, dy) < 31;                              // circle
      else if (shape === 1) inside = Math.abs(dx) + Math.abs(dy) < 40 && Math.abs(dx) < 31 && Math.abs(dy) < 31; // cut-corner square
      else if (shape === 2) inside = Math.abs(dx) < 31 && Math.abs(dy) < 31;          // square
      else inside = Math.abs(dx) < 31 && dy > -31 && dy < 31 - Math.max(0, Math.abs(dx) - 6) * 0.5; // shield
      if (!inside) continue;
      // a band of the second colour along the bottom adds a little character
      const band = dy > 20 && shape !== 3;
      put(x, y, band ? fg.map((v, k) => Math.round(v * 0.55 + bg[k] * 0.45)) : bg);
    }
  }
  const letters = name.toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]);
  const scale = letters.length > 1 ? 4 : 5;
  const total = letters.length * 5 * scale + (letters.length - 1) * scale;
  let ox = Math.round((S - total) / 2);
  const oy = Math.round((S - 7 * scale) / 2) - 2;
  for (const ch of letters) {
    const bits = FONT[ch] || FONT.O;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (bits[r * 5 + c] !== '1') continue;
        for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) put(ox + c * scale + xx, oy + r * scale + yy, fg);
      }
    }
    ox += 6 * scale;
  }
  return encodePng(S, S, px);
}

// Add the samples (does nothing if they are already there). Lots that real
// owners have built on are left alone. Returns { properties, donations }.
export async function addSamples(db) {
  if (hasSamples(db)) return { properties: 0, donations: 0, already: true };
  const world = createWorld();
  const rand = mulberry32(4242);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const occupied = new Set();
  for (const p of db.prepare('SELECT x, y, w, h FROM properties').all()) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) occupied.add(world.ti(x, y));
  }
  const { hash, salt } = await hashPassword(crypto.randomBytes(24).toString('hex'));
  const now = Date.now();
  let built = 0;
  let gifts = 0;
  const owners = new Map();
  const addUser = (email, name) => Number(db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)').run(email, name, hash, salt, now).lastInsertRowid);
  const insert = db.prepare(
    'INSERT INTO properties (owner_id, type, style, tier, colour, floors, x, y, w, h, name, url, message, zone, address, land_cents, build_cents, value_cents, views, clicks, created_at, logo, logo_v) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
  );
  transaction(db, () => {
    allBrands(rand).forEach(([name, type, message], n) => {
      const t = BUILDINGS[type];
      for (let attempt = 0; attempt < 600; attempt++) {
        const w = t.minLot[0] + Math.floor(rand() * (t.maxLot[0] - t.minLot[0] + 1));
        const h = t.minLot[1] + Math.floor(rand() * (t.maxLot[1] - t.minLot[1] + 1));
        const checked = validateSpec({
          type,
          style: pick(Object.keys(t.styles)),
          tier: pick(Object.keys(TIERS)),
          colour: pick(Object.keys(COLOURS)),
          floors: t.floors[0] + Math.floor(rand() * rand() * (t.floors[1] - t.floors[0] + 1)),
          w,
          h,
        });
        if (!checked.ok) continue;
        const x = Math.floor(rand() * world.N);
        const y = Math.floor(rand() * world.N);
        const lot = world.checkLot(x, y, w, h, occupied);
        if (!lot.ok) continue;
        const spec = checked.spec;
        const price = quote(spec, lot.zones);
        const uid = addUser(`sample${n}@demo.invalid`, name);
        owners.set(name, uid);
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        insert.run(uid, spec.type, spec.style, spec.tier, spec.colour, spec.floors, x, y, w, h, name, `https://example.com/${slug}`, message, lot.zone, lot.address, price.land, price.build, price.total, Math.floor(rand() * rand() * 900), Math.floor(rand() * rand() * 120), now - Math.floor(rand() * 20 * 86400000), makeSampleLogo(name, n));
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) occupied.add(world.ti(xx, yy));
        built++;
        break;
      }
    });
    // donors who do not own a building still need a sample account so that
    // clearing the samples can find their gifts again
    DONORS.forEach((donor, n) => {
      if (owners.has(donor) || donor === 'Anonymous') return;
      owners.set(donor, addUser(`donor${n}@demo.invalid`, donor));
    });
    const anon = addUser('anonymous@demo.invalid', 'Anonymous');
    for (let i = 0; i < 140; i++) {
      const civic = pick(world.civics);
      const donor = pick(DONORS);
      const amount = pick([500, 1000, 1000, 2500, 2500, 5000, 10000, 25000]);
      db.prepare('INSERT INTO donations (charity, civic_id, user_id, donor_name, message, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        civic.charity, civic.id, owners.get(donor) ?? anon, donor, '', amount, now - Math.floor(rand() * 20 * 86400000),
      );
      gifts++;
    }
  });
  return { properties: built, donations: gifts, already: false };
}
