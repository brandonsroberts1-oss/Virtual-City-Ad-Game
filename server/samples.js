// Made-up sample properties and donations, so a fresh island can be shown
// looking busy. Every sample belongs to an account whose email ends in
// @demo.invalid, which is how they are found again and removed.

import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { createWorld, mulberry32 } from '../shared/world.js';
import { BUILDINGS, TIERS, COLOURS, quote } from '../shared/catalog.js';

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
  const owners = new Map();
  BRANDS.forEach(([name, type, message], n) => {
    const t = BUILDINGS[type];
    for (let attempt = 0; attempt < 400; attempt++) {
      const w = t.minLot[0] + Math.floor(rand() * (t.maxLot[0] - t.minLot[0] + 1));
      const h = t.minLot[1] + Math.floor(rand() * (t.maxLot[1] - t.minLot[1] + 1));
      const x = Math.floor(rand() * world.N);
      const y = Math.floor(rand() * world.N);
      const lot = world.checkLot(x, y, w, h, occupied);
      if (!lot.ok) continue;
      const spec = {
        type,
        style: pick(Object.keys(t.styles)),
        tier: pick(Object.keys(TIERS)),
        colour: pick(Object.keys(COLOURS)),
        floors: t.floors[0] + Math.floor(rand() * rand() * (t.floors[1] - t.floors[0] + 1)),
        w,
        h,
      };
      const price = quote(spec, lot.zones);
      const email = `sample${n}@demo.invalid`;
      const uid = Number(db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)').run(email, name, hash, salt, now).lastInsertRowid);
      owners.set(name, uid);
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      db.prepare(
        'INSERT INTO properties (owner_id, type, style, tier, colour, floors, x, y, w, h, name, url, message, zone, address, land_cents, build_cents, value_cents, views, clicks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(uid, spec.type, spec.style, spec.tier, spec.colour, spec.floors, x, y, w, h, name, `https://example.com/${slug}`, message, lot.zone, lot.address, price.land, price.build, price.total, Math.floor(rand() * rand() * 900), Math.floor(rand() * rand() * 120), now - Math.floor(rand() * 20 * 86400000));
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) occupied.add(world.ti(xx, yy));
      built++;
      break;
    }
  });
  // donors who do not own a building still need a sample account so that
  // --clear can find their gifts again
  DONORS.forEach((donor, n) => {
    if (owners.has(donor) || donor === 'Anonymous') return;
    const uid = Number(db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)').run(`donor${n}@demo.invalid`, donor, hash, salt, now).lastInsertRowid);
    owners.set(donor, uid);
  });
  const anon = Number(db.prepare('INSERT INTO users (email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)').run('anonymous@demo.invalid', 'Anonymous', hash, salt, now).lastInsertRowid);
  let gifts = 0;
  for (let i = 0; i < 60; i++) {
    const civic = pick(world.civics);
    const donor = pick(DONORS);
    const amount = pick([500, 1000, 1000, 2500, 2500, 5000, 10000, 25000]);
    db.prepare('INSERT INTO donations (charity, civic_id, user_id, donor_name, message, amount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      civic.charity, civic.id, owners.get(donor) ?? anon, donor, '', amount, now - Math.floor(rand() * 20 * 86400000),
    );
    gifts++;
  }
  return { properties: built, donations: gifts, already: false };
}
