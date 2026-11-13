# Brand Island

A small pixel-art island that works as an ad platform. Visitors buy a lot,
put up a building, and the building carries their ad: click it and a card pops
up with their name, their message and a link to their website. The island's
hospital, school, university, food bank and parks collect donations for
charity, and leaderboards show the top donors, the most valuable properties
and the busiest ones.

"Brand Island" is a working title. Change it in `shared/catalog.js` (`SITE`)
and in the `<title>` of `public/index.html`.

## Launch it (works from a phone)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/brandonsroberts1-oss/Virtual-City-Ad-Game)

1. Tap the button. It opens [Render](https://render.com), a hosting service;
   sign in with your GitHub account.
2. Render shows what it is about to set up (one web service called
   `brand-island`). Approve it and wait a few minutes while it builds.
3. Open the `onrender.com` address shown at the top of the service page.
   That is your island, live on the internet.

What you get is a **free preview**, set up by `render.yaml`:

- It goes to sleep when nobody has visited for a while; the next visit takes
  about a minute to wake it.
- It forgets everything (accounts, buildings, donations) each time it sleeps
  or is updated, because free instances have no permanent storage. So it
  fills the island with made-up sample buildings each time it starts and
  tells visitors it is a preview.
- Payments are in demo mode: nothing is charged.
- Every change pushed to this repository is put live automatically.

### Keeping what people build

To run the island for real it needs a paid instance with a disk (Render's
smallest paid instance plus 1 GB of disk; see their pricing page). Open
`render.yaml` in GitHub, edit it (the pencil icon), make the four changes
marked `FOR REAL USE`, and commit. Render picks the change up by itself; if it
stops to ask for a payment method, add one in Render and it carries on. From
then on nothing is forgotten and the sample buildings are removed.

Then set up real payments (see "Taking real payments" below) by adding your
Stripe or PayPal keys under **Environment** on the service page in Render.

## Run it on a computer

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

- **The island** — about a hundred tiles across, with roughly 4,400 tiles of
  land to build on. A mountain with three terraces stands at the back, a town
  grid fills the plain, and a beach runs all the way round, with capes and
  sandbars. Waves roll in and wash up the sand, palms line the beach, cars and
  buses drive the roads, people walk the pavements (with umbrellas when it
  rains), sailboats circle offshore.
- **Roads** — Ocean Drive along the waterfront; a grid of streets and avenues
  in town; Hillside Avenue, Ridge Road and Skyline Drive on the three mountain
  terraces; Main Street and Summit Road climbing all the way up.
- **Buildings people can buy** — homes, shops, mansions, skyscrapers and
  farms, each in several styles, three finishes (Standard, Premium, Luxury),
  eight colour schemes, a choice of lot size and a choice of height. The
  picture is generated from those choices, so the preview in the builder is
  exactly what gets built.
- **Skyscrapers** — up to 60 floors on lots up to 5x5, in eight styles. The
  dearer ones are landmarks: a round Rotunda Tower, an Art Deco tower with
  buttresses and a tiered crown, a braced Crystal Tower with a slanted top and
  a sky garden, and the Sky Citadel, a cluster of bridged towers on one podium.
- **Logos** — an owner can add a logo. It appears in the ad card and on the
  building itself: a flag for homes and mansions, a rooftop billboard for
  shops, a roadside billboard for farms, a sign on the wall for towers.
- **Buildings that belong to the island** — two hospitals, three schools, a
  university, two food banks, five parks, three beach parks and two mountain
  lookouts. Each has a heart floating over it and takes donations for one
  charity.
- **Charities window** — lists each cause, how to check it is real, where to
  give, how much has been raised and every recent gift.
- **Weather** — clear, cloudy, rain, thunderstorm and sea fog. In "Auto" the
  weather follows the clock, so every visitor sees the same sky.
- **Leaderboards** — top donors (overall and per charity), most valuable
  properties, most traffic.

## How pricing works

Everything is in `shared/catalog.js`, and the same file is used by the browser
and the server, so the price shown is the price charged.

- **Land** is priced per tile by location: Town $20, Downtown $26,
  Ocean View $30, Hillside $36, Ridge $48, Waterfront $50, Summit $64.
- **Building** cost = base price for the type × lot tiles × height × style ×
  finish. Bigger, taller, more elaborate and more luxurious all cost more.
- A property's **value** is its land plus its building. That is the number on
  the "most valuable" leaderboard.
- **Traffic** is the number of different visitors who opened the property's ad
  (one count per visitor per property per half hour). Link clicks are counted
  separately.

Buying is a one-off purchase and the owner can edit the ad text and logo for
free at any time. There are no renewals or building upgrades yet.

## Logos

Owners pick any picture; the browser shrinks it to a 128x128 PNG before it is
sent. The server only accepts small PNGs (up to 256 pixels a side and 120 KB)
and only ever serves them back as images. There is no automatic check of what
a logo shows, so the admin "remove" call below is how you take one down.

## Charities

The five charities in `shared/catalog.js` (`CHARITIES`) are **placeholders**:
the names are made up, and the Charities window says "Partner to be announced"
beside each one. For every real organisation you partner with, fill in its
name, description, website, registration number and a link to an official
register where visitors can check it, then set `placeholder: false`. The
window then shows those details and links instead of the notice.

`GIVING.statement` in the same file is where you say how gifts are handled
(for example how much of each gift is passed on and how often). It is empty
until you write it, and shown in the Charities window once you do.

Which building supports which charity is set in the `CIVICS` list in
`shared/world.js`.

Donations are paid to *you* (your payment account), not directly to the
charities. Passing the money on, and any registration or disclosure rules for
collecting donations where you operate, are yours to sort out before going
live. `GET /api/admin/donations` gives you the totals per charity.

## Taking real payments

Two payment processors are built in. Set the keys for one of them (in `.env`,
or under **Environment** on your host) and the site switches from demo mode
to real payments. Buyers pay on the processor's own hosted page.

| Processor | What to set |
| --- | --- |
| Stripe | `STRIPE_SECRET_KEY` |
| PayPal | `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (add `PAYPAL_ENV=sandbox` to use PayPal's test system) |

Also set `PUBLIC_URL` to your site's address (Render fills this in for you)
and `NODE_ENV=production`. If keys for both are present, `PAYMENT_PROVIDER`
(`stripe` or `paypal`) picks one.

No webhook is needed. When a buyer comes back from the payment page the site
asks the processor whether they paid, and once a minute it asks again about
anyone who never came back. For Stripe you can optionally add a webhook to
`https://your-site/api/payments/webhook` (events `checkout.session.completed`
and `checkout.session.expired`) and put its signing secret in
`STRIPE_WEBHOOK_SECRET`; it makes confirmation instant but changes nothing
else.

While a buyer is on the payment page their lot is held for about 30 minutes.
The building appears when the processor confirms the payment.

**Both processors have only been exercised against simulated versions in the
test suite, never against a real Stripe or PayPal account.** Run a purchase
and a donation with test keys (Stripe test mode, PayPal sandbox) before
switching to live ones.

If a payment arrives for a lot that is no longer free (rare: it needs an
abandoned checkout that is paid much later), nothing is built and the order is
listed under `conflicts` in `GET /api/admin/donations` so you can refund it.

### Adding another processor

Each processor is one small file in `server/payments/`. Copy `demo.js`, fill
in `start` (begin a payment and return the address of the payment page) and
`check` (ask whether it was paid), and add it to the list in
`server/payments/index.js`. The comment at the top of that file spells out
what each function must return.

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

## Hosting it somewhere else

One Node process and one SQLite file (`island.db` in `DATA_DIR`). The
`Dockerfile` runs it on any host that takes a container; without Docker,
`npm install` then `npm start` on Node 22.13 or newer does the same.

- Keep `DATA_DIR` on a disk that survives restarts and back it up.
- Serve it over https and set `NODE_ENV=production` (secure cookies).
- Behind a proxy or load balancer set `TRUST_PROXY=1`.
- Set `PUBLIC_URL` to the site's address (on Render it is detected for you).
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
server/app.js        the API: accounts, quotes, purchases, logos, traffic, donations, leaderboards
server/payments/     payment processors: demo, Stripe, PayPal (index.js explains how to add one)
server/png.js        checks uploaded logos, writes the sample logos
server/db.js         SQLite schema
server/samples.js    made-up sample data (npm run seed, or SAMPLE_DATA=on)
render.yaml          one-tap setup for Render
Dockerfile           container recipe for any other host
public/js/render.js  camera, layered drawing, picking
public/js/terrain.js ground and road rasteriser
public/js/surf.js    waves and shallows
public/js/buildings.js, civic.js, sprites.js   procedural pixel art
public/js/logos.js   logo upload and mounting logos on buildings
public/js/actors.js  cars, pedestrians, boats, gulls
public/js/weather.js weather
public/js/ui.js      build panel, ad cards, donations, charities, leaderboards, accounts
test/                automated tests
```

To change the map itself, edit the `ROADS` and `CIVICS` lists near the top of
`shared/world.js`. `npm test` checks that every road is drivable and every
civic site sits on level ground.

## Credits

All artwork is generated by the code in this repository. The fonts are
Silkscreen and VT323, both under the SIL Open Font License (the licence texts
are in `public/fonts`).
