# Brand Island

A small pixel-art island that works as an ad platform. Visitors buy a lot,
put up a building, and the building carries their ad: click it and a card pops
up with their name, their message and a link to their website. The island's
hospital, school, university, food bank and parks collect donations for
charity, and leaderboards show the top donors, the most valuable properties
and the busiest ones.

"Brand Island" is a working title. Change it in `shared/catalog.js` (`SITE`)
and in the `<title>` of `public/index.html`.

## Run it

You need [Node.js](https://nodejs.org) 22.13 or newer.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000. With no configuration the site runs in
**demo mode**: purchases and donations are recorded but no money is taken.

To see what a busy island looks like, add made-up sample properties and
donations (and remove them again with `--clear`):

```bash
npm run seed
```

```bash
npm run seed -- --clear
```

Run the tests:

```bash
npm test
```

## What is on the island

- **The island** — a mountain with two terraces, a town on the plain, a beach
  all the way round, a cape and a few sandbars. Waves roll in and wash up the
  sand, palms line the beach, cars and buses drive the roads, people walk the
  pavements (with umbrellas when it rains), sailboats circle offshore.
- **Roads** — Ocean Drive along the waterfront, Center Avenue, East Avenue and
  Main Street in town, Ridge Road on the lower mountain terrace and Skyline
  Drive at the top.
- **Buildings people can buy** — homes, shops, mansions, skyscrapers and
  farms, each in several styles, three finishes (Standard, Premium, Luxury),
  eight colour schemes, a choice of lot size and a choice of height. The
  picture is generated from those choices, so the preview in the builder is
  exactly what gets built.
- **Buildings that belong to the island** — hospital, school, university, food
  bank, Central Park, a beach park and a summit lookout. Each has a heart
  floating over it and takes donations for one charity.
- **Weather** — clear, cloudy, rain, thunderstorm and sea fog. In "Auto" the
  weather follows the clock, so every visitor sees the same sky.
- **Leaderboards** — top donors (overall and per charity), most valuable
  properties, most traffic.

## How pricing works

Everything is in `shared/catalog.js`, and the same file is used by the browser
and the server, so the price shown is the price charged.

- **Land** is priced per tile by location: Town $20, Ocean View $30,
  Hillside $40, Waterfront $50, Summit $60.
- **Building** cost = base price for the type × lot tiles × height × style ×
  finish. Bigger, taller, more elaborate and more luxurious all cost more.
- A property's **value** is its land plus its building. That is the number on
  the "most valuable" leaderboard.
- **Traffic** is the number of different visitors who opened the property's ad
  (one count per visitor per property per half hour). Link clicks are counted
  separately.

Buying is a one-off purchase and the owner can edit the ad text for free at
any time. There are no renewals or building upgrades yet.

## Charities

The five charities in `shared/catalog.js` (`CHARITIES`) are **placeholders**.
Replace the names, descriptions and links with the organisations you choose.
Which building supports which charity is set in the `CIVICS` list in
`shared/world.js`.

Donations are paid to *you* (your Stripe account), not directly to the
charities. Passing the money on, and any registration or disclosure rules for
collecting donations where you operate, are yours to sort out before going
live. `GET /api/admin/donations` gives you the totals per charity.

## Taking real payments

Payments go through Stripe Checkout (the buyer pays on Stripe's hosted page).

1. Copy `.env.example` to `.env`.
2. Set `STRIPE_SECRET_KEY`, `PUBLIC_URL` (your site's address) and
   `NODE_ENV=production`.
3. In the Stripe dashboard add a webhook pointing at
   `https://your-site/api/stripe/webhook` for the events
   `checkout.session.completed` and `checkout.session.expired`, and put its
   signing secret in `STRIPE_WEBHOOK_SECRET`.

While a buyer is on the payment page their lot is held for 30 minutes. The
building appears when Stripe confirms the payment.

**This path has only been exercised against a simulated Stripe in the test
suite, never against a real Stripe account.** Run a purchase and a donation
with Stripe test keys before switching to live ones.

If a payment arrives for a lot that is no longer free (rare: it needs an
abandoned checkout that is paid much later), nothing is built and the order is
listed under `conflicts` in `GET /api/admin/donations` so you can refund it.

## Looking after the site

Set `ADMIN_TOKEN` to a long random string to switch on two admin calls:

```bash
curl -X DELETE -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{}' https://your-site/api/admin/properties/123
```

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" https://your-site/api/admin/donations
```

The first removes a property (for example an ad that breaks your rules) and
puts its lot back on sale. There is no automatic moderation of ad text.

## Hosting

One Node process and one SQLite file (`data/island.db`).

- Keep `DATA_DIR` on a disk that survives restarts and back it up.
- Serve it over https and set `NODE_ENV=production` (secure cookies).
- Behind a proxy or load balancer set `TRUST_PROXY=1`.
- Rate limits and traffic de-duplication are kept in memory, so run a single
  instance.

## Not built yet

- Password reset and email verification.
- Renewals, resale between owners, or upgrading an existing building.
- Moderation tools beyond the admin "remove" call.

## Where things are

```
shared/world.js      the island: terrain, roads, lots, civic sites (same on server and browser)
shared/catalog.js    site name, prices, building catalogue, colours, charities
server/app.js        the API: accounts, quotes, purchases, traffic, donations, leaderboards
server/payments.js   demo and Stripe payment providers
server/db.js         SQLite schema
server/seed.js       sample data
public/js/render.js  camera, layered drawing, picking
public/js/terrain.js ground and road rasteriser
public/js/surf.js    waves and shallows
public/js/buildings.js, civic.js, sprites.js   procedural pixel art
public/js/actors.js  cars, pedestrians, boats, gulls
public/js/weather.js weather
public/js/ui.js      build panel, ad cards, donations, leaderboards, accounts
test/                automated tests
```

To change the map itself, edit the `ROADS` and `CIVICS` lists near the top of
`shared/world.js`. `npm test` checks that every road is drivable and every
civic site sits on level ground.

## Credits

All artwork is generated by the code in this repository. The fonts are
Silkscreen and VT323, both under the SIL Open Font License (the licence texts
are in `public/fonts`).
