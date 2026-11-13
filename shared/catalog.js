// Everything a site owner is likely to tune lives here: the name of the site,
// land prices per zone, the building catalogue, finish tiers, colour schemes
// and the charities each civic building raises money for.
//
// The file is shared by server and browser so a quote shown in the builder is
// always the price the server charges. All money is in whole cents.

export const SITE = {
  name: 'Brand Island',
  tagline: 'Build your brand a home on the island.',
  currency: 'USD',
};

export const LAND = {
  basePerTile: 2000, // cents for one tile of ordinary town land
  zones: {
    town: { name: 'Town', mult: 1.0, blurb: 'Level streets across the plain.' },
    downtown: { name: 'Downtown', mult: 1.3, blurb: 'The busy south-east corner, where the avenues cross.' },
    oceanview: { name: 'Ocean View', mult: 1.5, blurb: 'One block back from the water.' },
    hillside: { name: 'Hillside', mult: 1.8, blurb: 'The lower mountain terrace, looking over town.' },
    ridge: { name: 'Ridge', mult: 2.4, blurb: 'The middle terrace on Ridge Road.' },
    waterfront: { name: 'Waterfront', mult: 2.5, blurb: 'Right on the beach along Ocean Drive.' },
    summit: { name: 'Summit', mult: 3.2, blurb: 'The top terrace on Skyline Drive.' },
  },
};

export const TIERS = {
  standard: { name: 'Standard', mult: 1.0, blurb: 'Clean and simple.' },
  premium: { name: 'Premium', mult: 1.6, blurb: 'Better materials, landscaping and trim.' },
  luxury: { name: 'Luxury', mult: 2.5, blurb: 'Showpiece finishes and extras like pools, fountains and crowns.' },
};

// basePerTile: build cost in cents per tile of lot at the smallest size.
// floors: [min, max]; floorRate: extra cost per floor above the minimum.
export const BUILDINGS = {
  home: {
    name: 'Home',
    blurb: 'A friendly house on a small lot.',
    basePerTile: 3000,
    minLot: [1, 1],
    maxLot: [2, 2],
    floors: [1, 3],
    floorLabel: 'Floors',
    floorRate: 0.4,
    styles: {
      cottage: { name: 'Cottage', mult: 1.0 },
      bungalow: { name: 'Bungalow', mult: 1.1 },
      townhouse: { name: 'Townhouse', mult: 1.25 },
      modern: { name: 'Modern', mult: 1.4 },
    },
  },
  shop: {
    name: 'Shop',
    blurb: 'A storefront with an awning and a sign.',
    basePerTile: 4500,
    minLot: [1, 1],
    maxLot: [3, 3],
    floors: [1, 3],
    floorLabel: 'Floors',
    floorRate: 0.45,
    styles: {
      corner: { name: 'Corner Store', mult: 1.0 },
      boutique: { name: 'Boutique', mult: 1.2 },
      market: { name: 'Market Hall', mult: 1.35 },
    },
  },
  mansion: {
    name: 'Mansion',
    blurb: 'A grand residence with grounds.',
    basePerTile: 9000,
    minLot: [2, 2],
    maxLot: [4, 4],
    floors: [2, 4],
    floorLabel: 'Floors',
    floorRate: 0.35,
    styles: {
      estate: { name: 'Classic Estate', mult: 1.0 },
      villa: { name: 'Mediterranean Villa', mult: 1.2 },
      modern: { name: 'Modern Estate', mult: 1.4 },
    },
  },
  skyscraper: {
    name: 'Skyscraper',
    blurb: 'A tower that can be seen from anywhere on the island.',
    basePerTile: 15000,
    minLot: [2, 2],
    maxLot: [5, 5],
    floors: [6, 60],
    floorLabel: 'Floors',
    floorRate: 0.08,
    styles: {
      slab: { name: 'Office Slab', mult: 1.0 },
      setback: { name: 'Setback Tower', mult: 1.25 },
      twin: { name: 'Twin Towers', mult: 1.4 },
      glass: { name: 'Glass Spire', mult: 1.6 },
      rotunda: { name: 'Rotunda Tower', mult: 2.0 },
      deco: { name: 'Art Deco Landmark', mult: 2.3 },
      crystal: { name: 'Crystal Tower', mult: 2.6 },
      citadel: { name: 'Sky Citadel', mult: 3.2, minLot: [3, 3] },
    },
  },
  farm: {
    name: 'Farm',
    blurb: 'Fields, a barn and room to grow.',
    basePerTile: 1000,
    minLot: [2, 2],
    maxLot: [5, 5],
    floors: [1, 3],
    floorLabel: 'Barn size',
    floorRate: 0.3,
    styles: {
      crops: { name: 'Crop Fields', mult: 1.0 },
      orchard: { name: 'Orchard', mult: 1.15 },
      ranch: { name: 'Ranch', mult: 1.3 },
      vineyard: { name: 'Vineyard', mult: 1.5 },
    },
  },
};

export const COLOURS = {
  coral: { name: 'Coral', wall: '#f3e4cf', roof: '#c8553d', accent: '#2f6fd0' },
  ocean: { name: 'Ocean', wall: '#e6edf2', roof: '#3a6ea5', accent: '#f2c230' },
  palm: { name: 'Palm', wall: '#f4f1e4', roof: '#3f8f5a', accent: '#e9822c' },
  sunset: { name: 'Sunset', wall: '#f6d9a8', roof: '#d9742c', accent: '#7d5bc4' },
  slate: { name: 'Slate', wall: '#cfd4da', roof: '#4b5563', accent: '#d8402f' },
  rose: { name: 'Rose', wall: '#f6dfe2', roof: '#b8475f', accent: '#2fa77a' },
  sand: { name: 'Sand', wall: '#e9d9b8', roof: '#8a623a', accent: '#2f6fd0' },
  midnight: { name: 'Midnight', wall: '#4a5263', roof: '#262d3a', accent: '#f2c230' },
};

// The causes the island raises money for. These five are PLACEHOLDERS: the
// names are made up. For each real organisation you partner with, fill in:
//   name          its real name
//   blurb         one line shown on the donation card
//   about         a few sentences for the Charities window
//   url           its own website
//   registration  its registration, e.g. 'EIN 12-3456789' or 'Registered charity 1234567'
//   verifyUrl     a page on an official register where visitors can check it
//   placeholder   set to false once the details above are real
// The ids (health, education ...) are what donations are filed under and what
// the civic buildings in shared/world.js point at; leave those alone.
export const CHARITIES = {
  health: {
    name: 'Island Cancer Research Fund',
    blurb: 'Funds cancer research and patient support.',
    about: 'Gifts made at the hospitals go to cancer research and to practical support for patients and their families.',
    url: '',
    registration: '',
    verifyUrl: '',
    placeholder: true,
  },
  education: {
    name: 'Classroom Supplies Fund',
    blurb: 'Books and supplies for local classrooms.',
    about: 'Gifts made at the schools buy books, art materials and equipment that teachers would otherwise pay for themselves.',
    url: '',
    registration: '',
    verifyUrl: '',
    placeholder: true,
  },
  scholarship: {
    name: 'First-Generation Scholarship Fund',
    blurb: 'Scholarships for first-generation students.',
    about: 'Gifts made at the university fund scholarships for students who are the first in their family to go to college.',
    url: '',
    registration: '',
    verifyUrl: '',
    placeholder: true,
  },
  hunger: {
    name: 'Hunger Relief Network',
    blurb: 'Meals and groceries for families who need them.',
    about: 'Gifts made at the food banks pay for groceries and hot meals for families who are going without.',
    url: '',
    registration: '',
    verifyUrl: '',
    placeholder: true,
  },
  parks: {
    name: 'Island Parks Foundation',
    blurb: 'Keeps parks, beaches and trails green and open.',
    about: 'Gifts made at the parks, beach parks and lookouts go to planting, clean-ups and keeping public green space open to everyone.',
    url: '',
    registration: '',
    verifyUrl: '',
    placeholder: true,
  },
};

// What the Charities window tells visitors about how gifts are handled. Leave
// `statement` empty until you have decided, then write what you actually do
// (for example how much of each gift is passed on, and how often).
export const GIVING = {
  statement: '',
};

export const DONATION = { minCents: 100, maxCents: 1000000, presets: [500, 1000, 2500, 10000] };

export const LIMITS = { name: 40, message: 280, url: 200, displayName: 40 };

export function formatMoney(cents) {
  const dollars = cents / 100;
  const opts = Number.isInteger(dollars) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$${dollars.toLocaleString('en-US', opts)}`;
}

// Check and normalise the design part of a purchase. Returns { ok, spec } or
// { ok: false, reason }.
export function validateSpec(input) {
  const s = input || {};
  const type = BUILDINGS[s.type];
  if (!type) return { ok: false, reason: 'Pick a building type.' };
  if (!type.styles[s.style]) return { ok: false, reason: 'Pick a style for this building.' };
  if (!TIERS[s.tier]) return { ok: false, reason: 'Pick a finish.' };
  if (!COLOURS[s.colour]) return { ok: false, reason: 'Pick a colour scheme.' };
  const { w, h, floors } = s;
  if (![w, h, floors].every(Number.isInteger)) return { ok: false, reason: 'Lot size and floors must be whole numbers.' };
  if (w < type.minLot[0] || h < type.minLot[1] || w > type.maxLot[0] || h > type.maxLot[1]) {
    return { ok: false, reason: `A ${type.name.toLowerCase()} needs a lot between ${type.minLot.join('x')} and ${type.maxLot.join('x')} tiles.` };
  }
  if (floors < type.floors[0] || floors > type.floors[1]) {
    return { ok: false, reason: `${type.floorLabel} must be between ${type.floors[0]} and ${type.floors[1]}.` };
  }
  // a few showpiece styles need room
  const need = type.styles[s.style].minLot;
  if (need && (w < need[0] || h < need[1])) {
    return { ok: false, reason: `The ${type.styles[s.style].name} needs a lot of at least ${need.join('x')} tiles.` };
  }
  return { ok: true, spec: { type: s.type, style: s.style, tier: s.tier, colour: s.colour, w, h, floors } };
}

// Price a design on a lot. `zones` maps zone id -> number of tiles of the lot
// in that zone (see world.checkLot).
export function quote(spec, zones) {
  const type = BUILDINGS[spec.type];
  let land = 0;
  for (const [zoneId, count] of Object.entries(zones)) {
    land += count * LAND.basePerTile * LAND.zones[zoneId].mult;
  }
  const tiles = spec.w * spec.h;
  const height = 1 + type.floorRate * (spec.floors - type.floors[0]);
  const build = type.basePerTile * tiles * height * type.styles[spec.style].mult * TIERS[spec.tier].mult;
  const landCents = Math.round(land / 100) * 100;
  const buildCents = Math.round(build / 100) * 100;
  return { land: landCents, build: buildCents, total: landCents + buildCents };
}
