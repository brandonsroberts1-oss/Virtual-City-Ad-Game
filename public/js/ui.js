// Everything in the DOM around the map: the build panel, ad cards, donation
// cards, leaderboards, accounts and the "how it works" window.

import { BUILDINGS, TIERS, COLOURS, CHARITIES, LAND, DONATION, LIMITS, formatMoney, quote, validateSpec } from '/shared/catalog.js';
import { api } from './api.js';
import { h, $, fill, openSide, closeSide, openModal, closeModal, toast, drawSprite, trimmed } from './dom.js';
import { buildingSprite } from './buildings.js';
import { civicSprite } from './civic.js';
import { logoImage, spriteWithLogo, fileToLogo } from './logos.js';

const ICON_SPECS = {
  home: { type: 'home', style: 'cottage', tier: 'premium', colour: 'coral', floors: 2, w: 1, h: 1 },
  shop: { type: 'shop', style: 'corner', tier: 'standard', colour: 'ocean', floors: 2, w: 1, h: 1 },
  mansion: { type: 'mansion', style: 'estate', tier: 'premium', colour: 'sand', floors: 2, w: 2, h: 2 },
  skyscraper: { type: 'skyscraper', style: 'setback', tier: 'standard', colour: 'slate', floors: 9, w: 2, h: 2 },
  farm: { type: 'farm', style: 'crops', tier: 'standard', colour: 'coral', floors: 2, w: 2, h: 2 },
};

const zoneTag = (zone) => h('span', { class: `tag zone-${zone}`, text: LAND.zones[zone]?.name || zone });

function describe(p) {
  const t = BUILDINGS[p.type];
  const size = p.type === 'farm' ? ['small', 'medium', 'large'][p.floors - 1] + ' barn' : `${p.floors} floor${p.floors === 1 ? '' : 's'}`;
  return `${TIERS[p.tier].name} ${t.styles[p.style].name}, ${size}, ${p.w}x${p.h} lot`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function field(label, input, max) {
  const count = max ? h('span', { class: 'count', text: `${input.value.length}/${max}` }) : null;
  if (count) input.addEventListener('input', () => (count.textContent = `${input.value.length}/${max}`));
  return h('label', {}, h('span', { class: 'label' }, label, count), input);
}

// A building's picture, with its logo mounted once the logo has loaded.
function lookOf(spec, logoUrl, onReady) {
  const base = buildingSprite(spec);
  if (!logoUrl) return base;
  const logo = logoImage(logoUrl, onReady);
  return logo.ready ? spriteWithLogo(base, logo.el) : base;
}

// "Add a logo" control. onChange gets a PNG data URL, or null when removed.
function logoPicker(current, onChange) {
  const img = h('img', { class: 'logo', alt: 'Logo preview', hidden: !current });
  if (current) img.src = current;
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const err = h('p', { class: 'error small' });
  const pick = h('button', { class: 'btn small', type: 'button', text: current ? 'Change logo' : 'Add a logo', onclick: () => file.click() });
  const remove = h('button', { class: 'btn small', type: 'button', text: 'Remove', hidden: !current });
  remove.onclick = () => {
    img.hidden = true;
    remove.hidden = true;
    pick.textContent = 'Add a logo';
    file.value = '';
    onChange(null);
  };
  file.addEventListener('change', async () => {
    err.textContent = '';
    if (!file.files[0]) return;
    try {
      const url = await fileToLogo(file.files[0]);
      img.src = url;
      img.hidden = false;
      remove.hidden = false;
      pick.textContent = 'Change logo';
      onChange(url);
    } catch (e) {
      err.textContent = e.message;
    }
  });
  return h('div', {}, h('span', { class: 'label', text: 'Logo (optional)' }), h('div', { class: 'row' }, img, pick, remove, file), err, h('p', { class: 'muted small', text: 'Shown in your ad and flown on a flag or billboard on the building.' }));
}

export function createUI(app) {
  const ui = {};

  // shown on throwaway preview sites so nobody is surprised when things vanish
  const previewNote = () => (app.config.preview ? h('p', { class: 'note', text: 'This is a preview site. Everything added here, accounts included, is cleared regularly.' }) : null);

  // ===========================================================================
  // Build panel
  // ===========================================================================

  const build = {
    type: 'shop', style: 'corner', tier: 'standard', colour: 'coral', floors: 1, w: 1, h: 1,
    x: null, y: null, lot: null,
    name: '', url: '', message: '', logo: null,
  };
  app.build = build;
  const panel = $('#build');
  const refs = {};

  const spec = () => ({ type: build.type, style: build.style, tier: build.tier, colour: build.colour, floors: build.floors, w: build.w, h: build.h });

  // smallest lot the chosen type and style allow
  const minLot = () => BUILDINGS[build.type].styles[build.style]?.minLot || BUILDINGS[build.type].minLot;
  function fitLot() {
    const t = BUILDINGS[build.type];
    const lo = minLot();
    build.w = Math.min(t.maxLot[0], Math.max(lo[0], build.w));
    build.h = Math.min(t.maxLot[1], Math.max(lo[1], build.h));
  }

  function setType(type) {
    const t = BUILDINGS[type];
    build.type = type;
    if (!t.styles[build.style]) build.style = Object.keys(t.styles)[0];
    fitLot();
    build.floors = Math.min(t.floors[1], Math.max(t.floors[0], build.floors));
    rebuildStyles();
    revalidate();
  }

  // Re-check the chosen lot after the footprint changed.
  function revalidate() {
    if (build.x != null) {
      const lot = app.world.checkLot(build.x, build.y, build.w, build.h, app.renderer.occupied);
      build.lot = lot.ok ? lot : null;
      if (!lot.ok) {
        build.x = null;
        build.y = null;
      }
    }
    sync();
  }

  function rebuildStyles() {
    const t = BUILDINGS[build.type];
    fill(refs.styles, 
      ...Object.entries(t.styles).map(([id, s]) =>
        h('button', { class: 'btn', type: 'button', data: { id }, text: s.name, title: s.minLot ? `Needs a lot of at least ${s.minLot.join('x')}` : '', onclick: () => { build.style = id; fitLot(); revalidate(); } }),
      ),
    );
  }

  function buildPanel() {
    refs.types = h(
      'div',
      { class: 'type-grid' },
      Object.entries(BUILDINGS).map(([id, t]) => {
        const icon = h('canvas', { width: 48, height: 44 });
        const btn = h('button', { class: 'btn', type: 'button', data: { id }, title: t.blurb, onclick: () => setType(id) }, icon, t.name);
        btn.icon = icon;
        return btn;
      }),
    );
    const stepper = (key, label) => {
      const out = h('output', { text: '1' });
      refs[`out_${key}`] = out;
      const step = (d) => () => {
        build[key] += d;
        fitLot();
        revalidate();
      };
      return h('span', { class: 'stepper' }, h('span', { class: 'label', text: label }), h('button', { class: 'btn sq', type: 'button', onclick: step(-1), 'aria-label': `${label} smaller` }, '-'), out, h('button', { class: 'btn sq', type: 'button', onclick: step(1), 'aria-label': `${label} bigger` }, '+'));
    };
    refs.lotInfo = h('div', { class: 'inset lot-info' });
    refs.styles = h('div', { class: 'chips' });
    refs.floors = h('input', { type: 'range', min: 1, max: 3, step: 1, oninput: (e) => { build.floors = Number(e.target.value); sync(); } });
    refs.floorsLabel = h('span', { class: 'label' });
    refs.tiers = h(
      'div',
      { class: 'chips' },
      Object.entries(TIERS).map(([id, t]) => h('button', { class: 'btn', type: 'button', data: { id }, title: t.blurb, text: t.name, onclick: () => { build.tier = id; sync(); } })),
    );
    refs.colours = h(
      'div',
      { class: 'swatches' },
      Object.entries(COLOURS).map(([id, c]) => {
        const sw = h('button', { class: 'btn swatch', type: 'button', data: { id }, title: c.name, 'aria-label': c.name, onclick: () => { build.colour = id; sync(); } }, h('i'), h('i'), h('i'));
        sw.children[0].style.background = c.roof;
        sw.children[1].style.background = c.wall;
        sw.children[2].style.background = c.accent;
        return sw;
      }),
    );
    refs.preview = h('canvas', { class: 'preview inset' });
    refs.name = h('input', { type: 'text', maxLength: LIMITS.name, placeholder: 'Your brand or business', oninput: (e) => { build.name = e.target.value; syncPrice(); } });
    refs.url = h('input', { type: 'url', maxLength: LIMITS.url, placeholder: 'https://your-site.com', oninput: (e) => { build.url = e.target.value; } });
    refs.message = h('textarea', { maxLength: LIMITS.message, rows: 3, placeholder: 'What should visitors know?', oninput: (e) => { build.message = e.target.value; } });
    refs.logo = h('div', {}, logoPicker(null, (url) => { build.logo = url; sync(); }));
    refs.price = h('div', { class: 'inset price' });
    refs.buy = h('button', { class: 'btn gold big', type: 'button', onclick: () => startCheckout() });
    refs.hint = h('p', { class: 'muted small center' });

    const body = h(
      'div',
      { class: 'window-body' },
      h('h3', { text: '1. Choose a building' }),
      refs.types,
      h('h3', { text: '2. Pick your lot' }),
      h('div', { class: 'row spread' }, stepper('w', 'Width'), stepper('h', 'Depth')),
      h('p', { class: 'muted small', text: 'Lighter squares on the map are for sale. Click the map to place your lot.' }),
      refs.lotInfo,
      h('h3', { text: '3. Design it' }),
      h('div', { class: 'stack' }, refs.preview, h('div', {}, h('span', { class: 'label', text: 'Style' }), refs.styles), h('div', {}, refs.floorsLabel, refs.floors), h('div', {}, h('span', { class: 'label', text: 'Finish' }), refs.tiers), h('div', {}, h('span', { class: 'label', text: 'Colours' }), refs.colours)),
      h('h3', { text: '4. Write your ad' }),
      h('div', { class: 'stack' }, field('Name on the building', refs.name, LIMITS.name), field('Website', refs.url), field('Message visitors see', refs.message, LIMITS.message), refs.logo),
      h('h3', { text: 'Price' }),
      h('div', { class: 'stack' }, refs.price, refs.buy, refs.hint),
    );
    const close = h('button', { class: 'btn', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: () => app.setMode('explore') }, 'X');
    fill(panel, h('div', { class: 'titlebar' }, h('span', { text: 'Build on the island' }), close), body);
    rebuildStyles();
  }

  function syncPrice() {
    const t = BUILDINGS[build.type];
    const zones = build.lot ? build.lot.zones : { town: build.w * build.h };
    const q = quote(spec(), zones);
    const line = (label, value, cls) => h('div', { class: cls }, h('span', { text: label }), h('span', { text: value }));
    fill(refs.price, 
      line(build.lot ? `Land (${LAND.zones[build.lot.zone].name})` : 'Land', build.lot ? formatMoney(q.land) : 'pick a lot'),
      line(`${t.name} (${TIERS[build.tier].name})`, formatMoney(q.build)),
      line('Total', build.lot ? formatMoney(q.total) : `from ${formatMoney(q.total)}`, 'total'),
    );
    const ready = !!build.lot && build.name.trim().length >= 2;
    refs.buy.textContent = build.lot ? `Buy and build - ${formatMoney(q.total)}` : 'Pick a lot on the map';
    refs.buy.disabled = !ready;
    refs.hint.textContent = !build.lot ? '' : build.name.trim().length < 2 ? 'Add a name for your building to continue.' : app.config.payments === 'demo' ? 'Demo mode: no real payment is taken.' : `You will pay securely with ${app.config.paymentLabel || 'our payment partner'}.`;
  }

  function sync() {
    const t = BUILDINGS[build.type];
    for (const b of refs.types.children) {
      b.classList.toggle('active', b.dataset.id === build.type);
      if (!b.drawn) {
        drawSprite(b.icon, trimmed(buildingSprite(ICON_SPECS[b.dataset.id])), 1);
        b.drawn = true;
      }
    }
    for (const b of refs.styles.children) b.classList.toggle('active', b.dataset.id === build.style);
    for (const b of refs.tiers.children) b.classList.toggle('active', b.dataset.id === build.tier);
    for (const b of refs.colours.children) b.classList.toggle('active', b.dataset.id === build.colour);
    refs.out_w.textContent = build.w;
    refs.out_h.textContent = build.h;
    refs.floors.min = t.floors[0];
    refs.floors.max = t.floors[1];
    refs.floors.value = build.floors;
    refs.floorsLabel.textContent = build.type === 'farm' ? `Barn size: ${['Small', 'Medium', 'Large'][build.floors - 1]}` : `${t.floorLabel}: ${build.floors}`;
    drawSprite(refs.preview, trimmed(ui.buildLook()), 3);
    if (build.lot) {
      fill(refs.lotInfo, zoneTag(build.lot.zone), ` ${build.lot.address} `, h('span', { class: 'muted', text: `(${build.w}x${build.h})` }));
    } else {
      fill(refs.lotInfo, h('span', { class: 'muted', text: `No lot chosen yet. This ${t.name.toLowerCase()} fits ${t.minLot.join('x')} to ${t.maxLot.join('x')} tiles.` }));
    }
    syncPrice();
    app.syncGhost();
  }

  // the design as it will look, logo included (also used for the map ghost)
  ui.buildLook = () => lookOf(spec(), build.logo, () => { if (!panel.hidden) sync(); });

  ui.showBuild = (on) => {
    if (on && !panel.firstChild) buildPanel();
    panel.hidden = !on;
    if (on) sync();
  };

  // Called by the map when the visitor clicks a spot in build mode.
  ui.placeLot = (x, y) => {
    const lot = app.world.checkLot(x, y, build.w, build.h, app.renderer.occupied);
    if (!lot.ok) {
      toast(lot.reason, 'bad');
      return;
    }
    build.x = x;
    build.y = y;
    build.lot = lot;
    sync();
  };

  ui.revalidateBuild = () => {
    if (!panel.hidden) revalidate();
  };

  function startCheckout() {
    const v = validateSpec(spec());
    if (!v.ok) return toast(v.reason, 'bad');
    if (!build.lot) return toast('Pick a lot on the map first.', 'bad');
    if (!app.user) {
      ui.openAccount('Sign in or create an account to buy your lot.', () => startCheckout());
      return;
    }
    const q = quote(spec(), build.lot.zones);
    const preview = h('canvas', {});
    const err = h('p', { class: 'error' });
    const confirm = h('button', { class: 'btn gold big', type: 'button', text: `Confirm - ${formatMoney(q.total)}` });
    confirm.onclick = async () => {
      confirm.disabled = true;
      err.textContent = '';
      try {
        const out = await api.post('/api/properties', { ...spec(), x: build.x, y: build.y, name: build.name, url: build.url, message: build.message, logo: build.logo });
        if (out.status === 'redirect') {
          location.href = out.url;
          return;
        }
        closeModal();
        Object.assign(build, { x: null, y: null, lot: null, name: '', url: '', message: '', logo: null });
        refs.name.value = '';
        refs.url.value = '';
        refs.message.value = '';
        fill(refs.logo, logoPicker(null, (url) => { build.logo = url; sync(); }));
        app.setMode('explore');
        await app.refresh();
        toast(`${out.property.name} is now on the island!`, 'good');
        ui.openProperty(out.property.id, true);
      } catch (e) {
        err.textContent = e.message;
        confirm.disabled = false;
        if (e.status === 409) app.refresh();
      }
    };
    openModal(
      'Confirm your purchase',
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'card-head' }, preview, h('div', {}, h('h2', { text: build.name.trim() }), h('p', { class: 'muted', text: describe(spec()) }), h('p', {}, zoneTag(build.lot.zone), ` ${build.lot.address}`))),
        h('div', { class: 'inset price' }, h('div', {}, h('span', { text: 'Land' }), h('span', { text: formatMoney(q.land) })), h('div', {}, h('span', { text: 'Building' }), h('span', { text: formatMoney(q.build) })), h('div', { class: 'total' }, h('span', { text: 'Total' }), h('span', { text: formatMoney(q.total) }))),
        app.config.payments === 'demo'
          ? h('p', { class: 'note', text: 'Demo mode: this site is not taking real payments yet, so confirming builds straight away at no charge.' })
          : h('p', { class: 'small muted', text: `You will be taken to ${app.config.paymentLabel || 'our payment partner'} to pay. Your lot is held for 30 minutes while you check out.` }),
        previewNote(),
        err,
        confirm,
      ),
      { narrow: true },
    );
    drawSprite(preview, trimmed(ui.buildLook()), 2);
  }

  // ===========================================================================
  // Property card (the ad)
  // ===========================================================================

  ui.openProperty = (id, focus = false) => {
    const p = app.byId.get(id);
    if (!p) {
      toast('That property is no longer on the island.', 'bad');
      return;
    }
    const st = app.renderer.structures.find((s) => s.kind === 'property' && s.ref.id === id);
    const top = st ? st.py + (st.sprite.buf.bounds()?.y0 ?? 0) : null;
    app.renderer.selected = { x: p.x, y: p.y, w: p.w, h: p.h, level: app.world.level[app.world.ti(p.x, p.y)], top };
    if (focus) app.renderer.focusTile(p.x + p.w / 2, p.y + p.h / 2, 2);

    const pic = h('canvas', {});
    const views = h('span', { text: p.views.toLocaleString('en-US') });
    const clicks = h('span', { text: p.clicks.toLocaleString('en-US') });
    const mine = app.user && app.user.id === p.ownerId;
    const body = h('div', { class: 'stack' });

    const view = () => {
      // the server only stores http(s) links; check again before making one clickable
      const link = /^https?:\/\//i.test(p.url)
        ? h('a', { class: 'btn gold big center', href: p.url, target: '_blank', rel: 'noopener noreferrer nofollow sponsored', onclick: () => { api.ping(`/api/properties/${id}/click`); clicks.textContent = (p.clicks + 1).toLocaleString('en-US'); } }, `Visit ${hostOf(p.url)}`)
        : null;
      fill(body, 
        h('div', { class: 'card-head' }, pic, h('div', {}, p.logo ? h('img', { class: 'logo', src: p.logo, alt: `${p.name} logo` }) : null, h('h2', { text: p.name }), h('p', { class: 'muted', text: `by ${p.owner}` }), h('p', {}, zoneTag(p.zone)))),
        p.message ? h('div', { class: 'inset blurb', text: p.message }) : null,
        link,
        h(
          'div',
          { class: 'stats' },
          h('div', {}, h('span', { text: 'Value' }), h('span', { text: formatMoney(p.valueCents) })),
          h('div', {}, h('span', { text: 'Visitors' }), views),
          h('div', {}, h('span', { text: 'Land' }), h('span', { text: formatMoney(p.landCents) })),
          h('div', {}, h('span', { text: 'Link clicks' }), clicks),
          h('div', { class: 'wide' }, h('span', { text: 'Address' }), h('span', { text: p.address })),
          h('div', { class: 'wide' }, h('span', { text: 'Building' }), h('span', { text: describe(p) })),
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn small', type: 'button', text: 'Copy link', onclick: () => copyLink(id) }),
          mine ? h('button', { class: 'btn small', type: 'button', text: 'Edit my ad', onclick: edit }) : null,
          mine ? h('button', { class: 'btn small danger', type: 'button', text: 'Demolish', onclick: demolish }) : null,
        ),
      );
      const paint = () => pic.isConnected && drawSprite(pic, trimmed(lookOf(p, p.logo, paint)), 2);
      paint();
    };

    const edit = () => {
      const name = h('input', { type: 'text', maxLength: LIMITS.name, value: p.name });
      const url = h('input', { type: 'url', maxLength: LIMITS.url, value: p.url });
      const message = h('textarea', { maxLength: LIMITS.message, rows: 4, value: p.message });
      const err = h('p', { class: 'error' });
      let logo; // stays undefined (keep the current logo) unless the owner changes it
      const picker = logoPicker(p.logo, (v) => { logo = v; });
      const save = h('button', { class: 'btn gold', type: 'button', text: 'Save' });
      save.onclick = async () => {
        save.disabled = true;
        try {
          const out = await api.patch(`/api/properties/${id}`, { name: name.value, url: url.value, message: message.value, logo });
          Object.assign(p, out.property);
          toast('Your ad has been updated.', 'good');
          view();
          app.refresh();
        } catch (e) {
          err.textContent = e.message;
          save.disabled = false;
        }
      };
      fill(body, h('h3', { text: 'Edit my ad' }), field('Name on the building', name, LIMITS.name), field('Website', url), field('Message visitors see', message, LIMITS.message), picker, err, h('div', { class: 'row' }, save, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: view })));
    };

    const demolish = () => {
      const err = h('p', { class: 'error' });
      const yes = h('button', { class: 'btn danger', type: 'button', text: 'Yes, demolish it' });
      yes.onclick = async () => {
        yes.disabled = true;
        try {
          await api.del(`/api/properties/${id}`);
          closeModal();
          closeSide();
          await app.refresh();
          toast('The building was demolished and the lot is for sale again.');
        } catch (e) {
          err.textContent = e.message;
          yes.disabled = false;
        }
      };
      openModal('Demolish this building?', h('div', { class: 'stack' }, h('p', { text: `This removes "${p.name}" and its ad from the island for good and puts the lot back up for sale. Purchases are not refunded.` }), err, h('div', { class: 'row' }, yes, h('button', { class: 'btn', type: 'button', text: 'Keep it', onclick: closeModal }))), { narrow: true });
    };

    openSide(p.name, body, () => {
      app.renderer.selected = null;
    });
    view();
    api.post(`/api/properties/${id}/view`).then((r) => {
      if (r.counted) {
        p.views += 1;
        views.textContent = p.views.toLocaleString('en-US');
      }
    }).catch(() => {});
  };

  async function copyLink(id) {
    const url = `${location.origin}/?p=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch {
      toast(url);
    }
  }

  // ===========================================================================
  // Civic card (donations)
  // ===========================================================================

  ui.openCivic = async (civic, focus = false) => {
    const st = app.renderer.structures.find((s) => s.kind === 'civic' && s.ref.id === civic.id);
    app.renderer.selected = { x: civic.x, y: civic.y, w: civic.w, h: civic.h, level: civic.level, top: null };
    if (focus) app.renderer.focusTile(civic.x + civic.w / 2, civic.y + civic.h / 2, 2);
    const charity = CHARITIES[civic.charity];
    const pic = h('canvas', {});
    const raised = h('div', { class: 'big-number', text: '...' });
    const raisedSub = h('p', { class: 'muted small' });
    const donors = h('ul', { class: 'list' });
    let amount = DONATION.presets[1];
    const custom = h('input', { type: 'number', min: DONATION.minCents / 100, max: DONATION.maxCents / 100, step: 1, placeholder: 'Other amount ($)' });
    const who = h('input', { type: 'text', maxLength: LIMITS.displayName, value: app.user ? app.user.name : '', placeholder: 'Anonymous' });
    const note = h('input', { type: 'text', maxLength: 140, placeholder: 'Optional' });
    const err = h('p', { class: 'error' });
    const give = h('button', { class: 'btn green big', type: 'button' });
    const presets = h('div', { class: 'amounts' });
    const paint = () => {
      for (const b of presets.children) b.classList.toggle('active', Number(b.dataset.cents) === amount && !custom.value);
      const cents = custom.value ? Math.round(Number(custom.value) * 100) : amount;
      give.textContent = `Donate ${formatMoney(cents || 0)}`;
    };
    presets.append(...DONATION.presets.map((c) => h('button', { class: 'btn', type: 'button', data: { cents: c }, text: formatMoney(c), onclick: () => { amount = c; custom.value = ''; paint(); } })));
    custom.addEventListener('input', paint);

    const load = async () => {
      try {
        const d = await api.get(`/api/civics/${civic.id}`);
        raised.textContent = formatMoney(d.totalCents);
        raisedSub.textContent = d.count ? `raised from ${d.count.toLocaleString('en-US')} gift${d.count === 1 ? '' : 's'}` : 'Be the first to give.';
        fill(donors, 
          ...(d.top.length
            ? d.top.map((t, i) => h('li', {}, h('span', { class: 'rank', text: `#${i + 1}` }), h('span', { class: 'who', text: t.name }), h('span', { class: 'amt', text: formatMoney(t.cents) })))
            : [h('li', { class: 'muted', text: 'No donations yet.' })]),
        );
      } catch (e) {
        raised.textContent = '-';
        raisedSub.textContent = e.message;
      }
    };

    give.onclick = async () => {
      const cents = custom.value ? Math.round(Number(custom.value) * 100) : amount;
      if (!Number.isInteger(cents) || cents < DONATION.minCents || cents > DONATION.maxCents) {
        err.textContent = `Choose an amount between ${formatMoney(DONATION.minCents)} and ${formatMoney(DONATION.maxCents)}.`;
        return;
      }
      give.disabled = true;
      err.textContent = '';
      try {
        const out = await api.post('/api/donations', { civicId: civic.id, amountCents: cents, donorName: who.value, message: note.value });
        if (out.status === 'redirect') {
          location.href = out.url;
          return;
        }
        toast(`Thank you! ${formatMoney(cents)} given to ${charity.name}.`, 'good');
        note.value = '';
        await Promise.all([load(), app.refresh()]);
      } catch (e) {
        err.textContent = e.message;
      }
      give.disabled = false;
    };

    openSide(
      civic.name,
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'card-head' }, pic, h('div', {}, h('h2', { text: charity.name }), h('p', { class: 'muted', text: charity.blurb }), h('button', { class: 'btn small', type: 'button', text: 'About this charity', onclick: () => ui.openCharities(civic.charity) }))),
        h('div', { class: 'inset raised' }, raised, raisedSub),
        h('h3', { text: 'Make a donation' }),
        presets,
        custom,
        field('Show my gift as', who),
        field('Message', note),
        app.config.payments === 'demo' ? h('p', { class: 'note', text: 'Demo mode: no money is collected yet. Gifts are recorded so you can try the leaderboards.' }) : null,
        err,
        give,
        h('h3', { text: 'Top donors here' }),
        donors,
      ),
      () => {
        app.renderer.selected = null;
      },
    );
    if (st) drawSprite(pic, trimmed(civicSprite(civic)), 2);
    paint();
    load();
  };

  // ===========================================================================
  // Leaderboards
  // ===========================================================================

  // ===========================================================================
  // Charities
  // ===========================================================================

  ui.openCharities = async (focusId) => {
    const content = h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Loading...' }));
    openModal('Charities', content);
    let d;
    try {
      d = await api.get('/api/charities');
    } catch (e) {
      fill(content, h('p', { class: 'error', text: e.message }));
      return;
    }
    const goto = (placeId) => () => {
      const civic = app.world.civics.find((c) => c.id === placeId);
      closeModal();
      if (app.mode !== 'explore') app.setMode('explore');
      if (civic) ui.openCivic(civic, true);
    };
    const link = (label, url) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label });
    const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const names = Object.fromEntries(d.charities.map((c) => [c.id, c.name]));
    const card = (c) =>
      h(
        'section',
        { class: 'charity stack', id: `charity-${c.id}` },
        h('div', { class: 'row spread' }, h('h2', { text: c.name }), h('span', { class: 'raised-inline', text: `${formatMoney(c.totalCents)} raised` })),
        c.placeholder ? h('p', { class: 'note', text: 'Partner to be announced. This name is a stand-in until the island confirms the organisation it will support.' }) : null,
        h('p', { text: c.about || c.blurb }),
        !c.placeholder && (c.registration || c.url)
          ? h('p', { class: 'small' }, c.registration ? `Registration: ${c.registration}` : null, c.verifyUrl ? [' (', link('check it on the official register', c.verifyUrl), ')'] : null, c.registration && c.url ? ' - ' : null, c.url ? link(hostOf(c.url), c.url) : null)
          : null,
        h('p', { class: 'muted small', text: c.gifts ? `${c.gifts.toLocaleString('en-US')} gift${c.gifts === 1 ? '' : 's'} so far${c.topDonor ? `; the biggest giver is ${c.topDonor.name} (${formatMoney(c.topDonor.cents)})` : ''}.` : 'No gifts yet.' }),
        h('div', { class: 'row' }, h('span', { class: 'label', text: 'Give at' }), c.places.map((pl) => h('button', { class: 'btn small', type: 'button', text: pl.name, title: 'Go there', onclick: goto(pl.id) }))),
      );
    fill(content, 
      h('p', { text: 'Every building with a heart over it raises money for one of these causes. Pick a place to go there and give.' }),
      d.payments === 'demo' ? h('p', { class: 'note', text: 'This site is in demo mode: gifts are recorded so you can try it out, but no money is collected.' }) : null,
      d.statement ? h('div', {}, h('h3', { text: 'How gifts are handled' }), h('p', { text: d.statement })) : null,
      d.charities.map(card),
      h('h3', { text: `Every gift is on the record: ${d.gifts.toLocaleString('en-US')} so far, ${formatMoney(d.totalCents)} in all` }),
      d.recent.length
        ? h('ul', { class: 'list' }, d.recent.map((g) => h('li', {}, h('span', { class: 'who' }, g.name, ' ', h('span', { class: 'sub', text: `to ${names[g.charity] || g.charity} - ${day(g.at)}` })), h('span', { class: 'amt', text: formatMoney(g.cents) }))))
        : h('p', { class: 'muted', text: 'No gifts yet.' }),
    );
    if (focusId) document.getElementById(`charity-${focusId}`)?.scrollIntoView({ block: 'start' });
  };

  ui.openLeaders = async (startTab = 'donors') => {
    const content = h('div', {});
    const tabs = h('div', { class: 'tabs' });
    const body = h('div', {}, tabs, content);
    openModal('Leaderboards', body);
    let data;
    try {
      data = await api.get('/api/leaderboards');
    } catch (e) {
      fill(content, h('p', { class: 'error', text: e.message }));
      return;
    }
    const goto = (r) => () => {
      closeModal();
      if (app.mode !== 'explore') app.setMode('explore');
      ui.openProperty(r.id, true);
    };
    const empty = (text) => h('p', { class: 'muted center', text });
    const propList = (rows, value, sub) =>
      rows.length
        ? h('ul', { class: 'list' }, rows.map((r, i) => h('li', { class: 'link', onclick: goto(r), title: 'Show on the map' }, h('span', { class: 'rank', text: `#${i + 1}` }), h('span', { class: 'who' }, r.name, ' ', h('span', { class: 'sub', text: sub(r) })), h('span', { class: 'amt', text: value(r) }))))
        : empty('Nothing has been built yet. Be the first!');
    const views = {
      donors: ['Top donors', () => (data.donors.length ? h('ul', { class: 'list' }, data.donors.map((d, i) => h('li', {}, h('span', { class: 'rank', text: `#${i + 1}` }), h('span', { class: 'who' }, d.name, ' ', h('span', { class: 'sub', text: `${d.gifts} gift${d.gifts === 1 ? '' : 's'}` })), h('span', { class: 'amt', text: formatMoney(d.cents) })))) : empty('No donations yet. Click a hospital, school, university, food bank or park to give.'))],
      valuable: ['Most valuable', () => propList(data.valuable, (r) => formatMoney(r.valueCents), (r) => `${LAND.zones[r.zone]?.name || r.zone} - ${r.address}`)],
      busiest: ['Most traffic', () => propList(data.busiest, (r) => `${r.views.toLocaleString('en-US')} visits`, (r) => `${r.clicks.toLocaleString('en-US')} link clicks`)],
      charities: ['Charities', () => h('table', {}, h('tr', {}, h('th', { text: 'Charity' }), h('th', { text: 'Top donor' }), h('th', { class: 'num', text: 'Raised' })), data.charities.map((c) => h('tr', {}, h('td', { text: c.name }), h('td', { text: c.topDonor ? c.topDonor.name : '-' }), h('td', { class: 'num', text: formatMoney(c.cents) }))))],
    };
    const show = (id) => {
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.id === id);
      fill(content, views[id][1]());
    };
    tabs.append(...Object.entries(views).map(([id, [label]]) => h('button', { class: 'btn', type: 'button', data: { id }, text: label, onclick: () => show(id) })));
    show(startTab);
  };

  // ===========================================================================
  // Account
  // ===========================================================================

  ui.syncAccount = () => {
    $('#account-btn').textContent = app.user ? app.user.name : 'Sign in';
  };

  ui.openAccount = (reason, then) => {
    if (app.user) {
      const mine = app.props.filter((p) => p.ownerId === app.user.id);
      const total = mine.reduce((s, p) => s + p.valueCents, 0);
      openModal(
        'My account',
        h(
          'div',
          { class: 'stack' },
          h('p', {}, 'Signed in as ', h('strong', { text: app.user.name }), ' ', h('span', { class: 'muted', text: `(${app.user.email})` })),
          h('h3', { text: `My properties (${mine.length})` }),
          mine.length
            ? h('ul', { class: 'list' }, mine.map((p) => h('li', { class: 'link', onclick: () => { closeModal(); app.setMode('explore'); ui.openProperty(p.id, true); } }, h('span', { class: 'who' }, p.name, ' ', h('span', { class: 'sub', text: `${p.address} - ${p.views} visits` })), h('span', { class: 'amt', text: formatMoney(p.valueCents) }))))
            : h('p', { class: 'muted', text: 'You have not built anything yet. Press Build to pick a lot.' }),
          mine.length ? h('p', { class: 'muted small', text: `Portfolio value: ${formatMoney(total)}` }) : null,
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: async () => { await api.post('/api/logout').catch(() => {}); app.user = null; ui.syncAccount(); closeModal(); closeSide(); toast('Signed out.'); } })),
        ),
        { narrow: true },
      );
      return;
    }
    let mode = 'login';
    const name = h('input', { type: 'text', maxLength: LIMITS.displayName, autocomplete: 'organization', placeholder: 'Shown on your buildings and gifts' });
    const email = h('input', { type: 'email', autocomplete: 'email' });
    const password = h('input', { type: 'password', autocomplete: 'current-password' });
    const err = h('p', { class: 'error' });
    const nameRow = field('Brand or display name', name);
    const submit = h('button', { class: 'btn gold big', type: 'submit' });
    const swap = h('button', { class: 'btn small', type: 'button' });
    const paint = () => {
      nameRow.hidden = mode === 'login';
      submit.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      swap.textContent = mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in';
      password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    };
    swap.onclick = () => {
      mode = mode === 'login' ? 'register' : 'login';
      err.textContent = '';
      paint();
    };
    const form = h('form', { class: 'stack', novalidate: true }, reason ? h('p', { class: 'note', text: reason }) : null, previewNote(), nameRow, field('Email', email), field('Password', password), err, submit, h('div', { class: 'center' }, swap));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      err.textContent = '';
      try {
        const out = await api.post(mode === 'login' ? '/api/login' : '/api/register', { name: name.value, email: email.value, password: password.value });
        app.user = out.user;
        ui.syncAccount();
        closeModal();
        toast(`Welcome, ${out.user.name}!`, 'good');
        if (then) then();
      } catch (e2) {
        err.textContent = e2.message;
        submit.disabled = false;
      }
    });
    paint();
    openModal('Sign in', form, { narrow: true });
  };

  // ===========================================================================
  // How it works
  // ===========================================================================

  ui.openAbout = () => {
    const perTile = (z) => formatMoney(LAND.basePerTile * z.mult);
    openModal(
      'How it works',
      h(
        'div',
        { class: 'stack' },
        h('p', { text: `${app.config.site.name} is a small island you can advertise on. Buy a lot, put up a building, and it carries your ad: anyone who clicks it sees your name, your message and a link to your website.` }),
        h('h3', { text: 'Building' }),
        h('p', { text: 'Press Build, choose a home, shop, mansion, skyscraper or farm, pick a lot beside any road and design it. Bigger lots, taller buildings, fancier styles and finer finishes cost more.' }),
        h('table', {}, h('tr', {}, h('th', { text: 'Location' }), h('th', { text: 'What it is' }), h('th', { class: 'num', text: 'Land per tile' })), Object.entries(LAND.zones).map(([id, z]) => h('tr', {}, h('td', {}, zoneTag(id)), h('td', { text: z.blurb }), h('td', { class: 'num', text: perTile(z) })))),
        h('p', { class: 'muted small', text: 'A property\'s value is its land plus its building. The most valuable and the most visited properties are on the leaderboards.' }),
        h('h3', { text: 'Giving' }),
        h('p', { text: 'Buildings with a heart over them belong to the island. Click one to donate to the cause it stands for; the biggest givers top the donor leaderboard.' }),
        h('table', {}, h('tr', {}, h('th', { text: 'Place' }), h('th', { text: 'Supports' })), app.world.civics.map((c) => h('tr', {}, h('td', { text: c.name }), h('td', { text: CHARITIES[c.charity].name })))),
        h('h3', { text: 'Getting around' }),
        h('p', { text: 'Drag to move, scroll or pinch to zoom, click a building to read its ad. Arrow keys and + / - work too.' }),
        app.config.payments === 'demo' ? h('p', { class: 'note', text: 'This site is running in demo mode: purchases and donations are recorded but no money changes hands.' }) : null,
        previewNote(),
      ),
    );
  };

  return ui;
}
