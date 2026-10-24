/**
 * schematic.js — small architecture drawings, one shape per archetype. <div data-module="schematic" data-schematic="health">
 *
 * Each archetype is drawn with its own topology, true to its domain, so the silhouettes alone tell the cards apart:
 *   commerce (composable tiles) · health (a zero-trust boundary) · logistics (a field of devices into a live map)
 *   finance (fan-in to a ledger) · operations (an offline gap, bridged by sync) · intelligence (a loop with a human in it)
 *   platforms (a layered gateway) · internal (a decision, then branches) · realtime (producers and consumers on one bus)
 * Drawing space is 400 × 240. Connectors carry a slow dashed flow in ink; the path marked `hot` carries a packet,
 * shown in lime only on the card in focus (.sol.is-focus, set by rail-scroll.js). Purely illustrative (aria-hidden).
 */
import { whenVisible, reducedMotion } from '../core/utils.js?v=mvm2gv08';

const H = 28;
let uid = 0;
const esc = s => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const bw = label => Math.max(64, Math.round(label.length * 6.5 + 22));            // box width that fits its label

/* drawing kit: every helper returns SVG markup and, for boxes, the anchor points connectors attach to */
const kit = {
  box(cx, cy, label, w = bw(label), h = H, cls = '') {
    const x = cx - w / 2, y = cy - h / 2;
    const svg = `<g class="sc-node ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle">${esc(label)}</text></g>`;
    return { svg, l: [x, cy], r: [x + w, cy], t: [cx, y], b: [cx, y + h], cx, cy, w, h };
  },
  tile(x, y, w, h, label, cls = '', idx = '') {   // a slot: label top-left, slot number top-right
    return { svg: `<g class="sc-tile ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/><text x="${x + 10}" y="${y + 17}">${esc(label)}</text>${idx ? `<text class="sc-idx" x="${x + w - 10}" y="${y + 17}" text-anchor="end">${idx}</text>` : ''}</g>`,
      t: [x + w / 2, y], b: [x + w / 2, y + h] };
  },
  zone(x, y, w, h, label) {
    return `<g class="sc-zone"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text x="${x + 12}" y="${y + 16}">${esc(label)}</text></g>`;
  },
  tall(cx, y, w, h, label) {              // a tall bar with a rotated label (the ledger)
    return { svg: `<g class="sc-node sc-node--tall"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="3"/><text transform="translate(${cx + 3.5} ${y + h / 2}) rotate(-90)" text-anchor="middle">${esc(label)}</text></g>`,
      l: y2 => [cx - w / 2, y2], r: y2 => [cx + w / 2, y2] };
  },
  diamond(cx, cy, w, h, label) {
    return { svg: `<g class="sc-node sc-node--diamond"><path d="M${cx} ${cy - h / 2}L${cx + w / 2} ${cy}L${cx} ${cy + h / 2}L${cx - w / 2} ${cy}Z"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle">${esc(label)}</text></g>`,
      l: [cx - w / 2, cy], r: [cx + w / 2, cy], t: [cx, cy - h / 2], b: [cx, cy + h / 2] };
  },
  dot(x, y) { return `<circle class="sc-dot" cx="${x}" cy="${y}" r="3"/>`; },
  label(x, y, s, anchor = 'start') { return `<text class="sc-note" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`; },
};
/** a connector through points; `elbow` turns a pair of points into horizontal-vertical-horizontal */
function path(pts) { return 'M' + pts.map(p => p.join(' ')).join('L'); }
function elbow(a, b) { const mx = (a[0] + b[0]) / 2; return [a, [mx, a[1]], [mx, b[1]], b]; }
function vbow(a, b) { const my = (a[1] + b[1]) / 2; return [a, [a[0], my], [b[0], my], b]; }
const edge = (pts, cls = '') => `<path class="sc-edge ${cls}" d="${path(pts)}" marker-end="url(#sc-arrow)"/>`;
const line = (pts, cls = '') => `<path class="sc-line ${cls}" d="${path(pts)}"/>`;

/* the nine drawings: each returns { svg, hot } where hot is the packet's path */
const DRAW = {
  commerce() {   // composable: a storefront on a grid of interchangeable blocks
    const top = kit.tile(24, 22, 352, 46, 'Storefront', 'sc-tile--lead', '00');
    const names = ['Catalog', 'Cart', 'Search', 'Payments', 'Content', 'Promotions'];
    const tiles = names.map((n, i) => kit.tile(24 + (i % 3) * 120, 96 + Math.floor(i / 3) * 62, 112, 54, n, '', String(i + 1).padStart(2, '0')));
    const joins = [0, 1, 2].map(i => line([[80 + i * 120, 68], [80 + i * 120, 96]]));
    const hot = [[200, 68], [200, 96]];
    return { svg: joins.join('') + top.svg + tiles.map(t => t.svg).join(''), hot };
  },
  health() {      // concentric trust: everything behind one identity boundary
    const portal = kit.box(70, 120, 'Patient portal');
    const z = kit.zone(150, 18, 232, 204, 'Zero-trust boundary');
    const id = kit.box(266, 58, 'Identity');
    const api = kit.box(266, 120, 'Records API');
    const rec = kit.box(212, 186, 'Records'), book = kit.box(320, 186, 'Bookings');
    const hot = elbow(portal.r, api.l);
    return { svg: z + edge(elbow(portal.r, id.l)) + edge(hot, 'sc-edge--hot') + edge([id.b, api.t]) + edge(vbow(api.b, rec.t)) + edge(vbow(api.b, book.t)) +
      portal.svg + id.svg + api.svg + rec.svg + book.svg, hot };
  },
  logistics() {   // a field of devices streaming into one live picture
    const dev = [[34, 44], [62, 82], [30, 120], [74, 140], [40, 186], [88, 204], [96, 34]];
    const ing = kit.box(172, 120, 'Ingest');
    const map = { x: 244, y: 26, w: 136, h: 124 };
    const alerts = kit.box(312, 194, 'Alerts', 136);
    const feeds = dev.map(([x, y]) => line([[x, y], [ing.l[0], ing.l[1]]], 'sc-line--faint')).join('') + dev.map(([x, y]) => kit.dot(x, y)).join('');
    const mapSvg = `<g class="sc-node sc-node--map"><rect x="${map.x}" y="${map.y}" width="${map.w}" height="${map.h}" rx="3"/>` +
      `<path class="sc-route" d="M262 128 C282 112 284 84 306 82 S344 60 362 46"/>${kit.dot(262, 128)}${kit.dot(306, 82)}${kit.dot(362, 46)}` +
      `<text x="${map.x + 10}" y="${map.y + 17}">Live map</text></g>`;
    const hot = elbow(ing.r, [map.x, 88]);
    return { svg: feeds + edge(hot, 'sc-edge--hot') + edge(elbow(ing.r, alerts.l)) + ing.svg + mapSvg + alerts.svg, hot };
  },
  finance() {     // everything posts to one ledger, everything reads from it
    const src = ['Bank feeds', 'Payments', 'Market data'].map((n, i) => kit.box(70, 50 + i * 70, n, 108));
    const out = ['Dashboards', 'Reports', 'Alerts'].map((n, i) => kit.box(330, 50 + i * 70, n, 108));
    const led = kit.tall(200, 22, 54, 196, 'Ledger');
    const ins = src.map(s => edge([s.r, led.l(s.cy)], s.cy === 120 ? 'sc-edge--hot' : '')).join('');
    const outs = out.map(o => edge([led.r(o.cy), o.l])).join('');
    return { svg: ins + outs + led.svg + src.map(s => s.svg).join('') + out.map(o => o.svg).join(''), hot: [src[1].r, led.l(120)] };
  },
  operations() {  // two sides of a signal gap, bridged by sync
    const zl = kit.zone(14, 30, 150, 180, 'Offline'), zr = kit.zone(236, 30, 150, 180, 'Cloud');
    const app = kit.box(89, 86, 'Crew app', 112), store = kit.box(89, 160, 'Local store', 112);
    const api = kit.box(311, 76, 'Sync API', 112), jobs = kit.box(311, 128, 'Jobs', 112), inv = kit.box(311, 180, 'Inventory', 112);
    const hot = [store.r, [200, 160], [200, 76], api.l];
    return { svg: zl + zr + edge([app.b, store.t]) + edge(hot, 'sc-edge--hot sc-edge--bridge') + kit.label(206, 122, 'sync') +
      edge([api.b, jobs.t]) + edge([jobs.b, inv.t]) + app.svg + store.svg + api.svg + jobs.svg + inv.svg, hot };
  },
  intelligence() { // a loop with a person in it: nothing ships without review
    const req = kit.box(84, 50, 'Request', 112), ret = kit.box(316, 50, 'Retrieve', 112);
    const dr = kit.box(316, 190, 'Draft', 112), rev = kit.box(84, 190, 'Human review', 112);
    const docs = kit.box(200, 96, 'Documents', 104), model = kit.box(200, 146, 'Model', 104);
    const hot = [dr.l, rev.r];
    return { svg: edge([req.r, ret.l]) + edge([ret.b, dr.t]) + edge(hot, 'sc-edge--hot') + edge([rev.t, req.b]) +
      line([[ret.l[0], 50], [ret.l[0] - 14, 50], [ret.l[0] - 14, 96], [docs.r[0], 96]], 'sc-line--faint') +
      line([[dr.l[0], 190], [dr.l[0] - 14, 190], [dr.l[0] - 14, 146], [model.r[0], 146]], 'sc-line--faint') +
      req.svg + ret.svg + dr.svg + rev.svg + docs.svg + model.svg, hot };
  },
  platforms() {   // a layered stack: one contract between many consumers and many systems
    const top = ['Partners', 'Apps', 'Internal'].map((n, i) => kit.box(80 + i * 120, 40, n, 100));
    const gw = { x: 20, y: 104, w: 360, h: 32 };
    const bot = ['CRM', 'ERP', 'Billing', 'Legacy'].map((n, i) => kit.box(65 + i * 90, 200, n, 76));
    const downs = top.map((t, i) => edge([t.b, [t.cx, gw.y]], i === 1 ? 'sc-edge--hot' : '')).join('');
    const ups = bot.map(b => edge([[b.cx, gw.y + gw.h], b.t])).join('');
    const bar = `<g class="sc-node sc-node--bar"><rect x="${gw.x}" y="${gw.y}" width="${gw.w}" height="${gw.h}" rx="3"/><text x="200" y="${gw.y + 19.5}" text-anchor="middle">API gateway</text></g>`;
    return { svg: downs + ups + bar + top.map(t => t.svg).join('') + bot.map(b => b.svg).join(''), hot: [top[1].b, [200, gw.y]] };
  },
  internal() {    // a request meets a rule, then branches
    const req = kit.box(52, 120, 'Request', 80);
    const rule = kit.diamond(140, 120, 72, 56, 'Rules');
    const ok = kit.box(262, 64, 'Approve', 88), esc2 = kit.box(262, 176, 'Escalate', 88);
    const mail = kit.box(346, 40, 'Email', 72), sheet = kit.box(346, 92, 'Sheet', 72), chat = kit.box(346, 176, 'Chat', 72);
    const hot = elbow(rule.r, ok.l);
    return { svg: edge([req.r, rule.l]) + edge(hot, 'sc-edge--hot') + edge(elbow(rule.r, esc2.l)) +
      edge(elbow(ok.r, mail.l)) + edge(elbow(ok.r, sheet.l)) + edge([esc2.r, chat.l]) +
      kit.label(204, 96, 'yes') + kit.label(204, 152, 'no') +
      req.svg + rule.svg + ok.svg + esc2.svg + mail.svg + sheet.svg + chat.svg, hot };
  },
  realtime() {    // one spine: producers publish once, every consumer subscribes
    const P = ['Checkout', 'Devices', 'Apps'].map((n, i) => kit.box(80 + i * 120, 40, n, 100));
    const C = ['Billing', 'Analytics', 'Search'].map((n, i) => kit.box(80 + i * 120, 200, n, 100));
    const bus = `<path class="sc-bus" d="M16 120H384"/>` + kit.label(16, 110, 'Event bus');
    const pub = P.map(p => edge([p.b, [p.cx, 117]])).join(''), sub = C.map(c => edge([[c.cx, 123], c.t])).join('');
    return { svg: bus + pub + sub + P.map(p => p.svg).join('') + C.map(c => c.svg).join(''), hot: [[16, 120], [384, 120]] };
  },
};

export default {
  name: 'schematic',
  init(el) {
    const draw = DRAW[el.dataset.schematic];
    if (!draw) return;
    const id = `sc-arrow-${++uid}`;
    const { svg: raw, hot } = draw();
    const svg = raw.replaceAll('url(#sc-arrow)', `url(#${id})`);
    el.innerHTML = `<svg class="sc" viewBox="0 0 400 240" aria-hidden="true" focusable="false">
      <defs><marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L7 4L1 7" class="sc-arrow"/></marker></defs>
      <g class="sc-grid">${[40, 120, 200, 280, 360].map(x => `<line x1="${x}" x2="${x}" y1="10" y2="230"/>`).join('')}</g>
      ${svg}
      ${hot ? `<circle class="sc-packet" r="3.4"><animateMotion dur="2.4s" repeatCount="indefinite" path="${path(hot)}"/></circle>` : ''}
    </svg>`;
    const s = el.firstElementChild;
    if (reducedMotion()) { s.pauseAnimations?.(); el.classList.add('is-still'); return; }
    whenVisible(el, v => { v ? s.unpauseAnimations?.() : s.pauseAnimations?.(); el.classList.toggle('is-still', !v); }, '0px');
  },
};
