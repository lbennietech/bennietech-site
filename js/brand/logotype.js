/**
 * logotype.js — the BennieTech identity, constructed as geometry (no font involved).
 *
 * THE MARK   the "block B": a solid B silhouette made of two D-shaped blocks (the lower one wider), split by
 *            one rising cut that runs from the left edge into the waist of the B. Two pieces, one idea:
 *            software "built block by block". In 3D (js/modules/hero-sculpt.js) the pieces are machined
 *            chrome and titanium with lime light leaking out of the cut.
 * THE WORD   "bennietech" drawn on a grid with one stroke weight: monoline, straight runs and true circles,
 *            butt-cut terminals. Signature detail: every ascender (b, h, t) is cut on the same rising angle as
 *            the mark. The i's dot is the one accent-colour "spark".
 *
 * Units: x-height = 1 (x-height line y=0, baseline y=1). Strokes are centrelines of width W; ascender stems are
 * filled polygons so they can carry the angled cut.
 * Output: logoSVG() (inline SVG for the site), markPiecesSVG() (the two halves, for the splash).
 * Static files: assets/logo/*.svg, regenerated with assets/logo/logo-generator.html.
 */

export const W = 0.22;                  // stroke weight (fraction of x-height)
const h = W / 2;
export const ASC = -0.6;                // ascender height (top of the cut, right-hand side)
export const CUT = 0.09;                // angled cut: the RIGHT edge of a stem rises this much above the left (a rising line)
const R = 0.5 - h;                      // centreline radius of a full-height bowl
const f = v => +v.toFixed(4);

/** A vertical stem with its top cut on the house angle. x = left outer edge, from the cut down to y1. */
const stem = (x, top, y1 = 1) => `M${f(x)} ${f(y1)}V${f(top)}L${f(x + W)} ${f(top - CUT)}V${f(y1)}Z`;

/* ---------------------------------------------------------------- the block-B mark
   A solid "B" silhouette — two D-shaped blocks, the lower one wider — split by one slanted slot.
   Coordinates: x from 0 (left edge), y from 0 (top) to BLOCK.H (baseline). */
export const BLOCK = {
  H: 1.69,                 // total height (= ascender height of the word, so it sits like a capital)
  wT: 1.0, hT: 0.86,       // upper block: width, height (its right side is a full semicircle)
  wB: 1.2, hB: 0.98,       // lower block: width, height (sits on the baseline)
  yL: 0.98,                // slot: centre height where it leaves the left edge (rises to the waist on the right)
  t: 0.13,                 // slot thickness
};
/** Derived geometry: circle centres, the waist point where the two bowls meet, the slot line. */
export function blockGeom(m = BLOCK) {
  const rT = m.hT / 2, rB = m.hB / 2;
  const T = { x: m.wT - rT, y: rT, r: rT }, B = { x: m.wB - rB, y: m.H - rB, r: rB };
  // right-hand intersection of the two bowl circles = the waist
  const dx = B.x - T.x, dy = B.y - T.y, d = Math.hypot(dx, dy);
  const a = (T.r * T.r - B.r * B.r + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, T.r * T.r - a * a));
  const mx = T.x + (a * dx) / d, my = T.y + (a * dy) / d;
  const p1 = { x: mx + (hh * dy) / d, y: my - (hh * dx) / d }, p2 = { x: mx - (hh * dy) / d, y: my + (hh * dx) / d };
  const waist = p1.x > p2.x ? p1 : p2;
  return { T, B, waist, slot: { x0: 0, y0: m.yL, x1: waist.x, y1: waist.y, t: m.t } };
}
export function blockParts(m = BLOCK) {
  const g = blockGeom(m);
  const dShape = (y0, y1, w) => { const r = (y1 - y0) / 2, cx = w - r; return `M0 ${f(y0)}H${f(cx)}A${f(r)} ${f(r)} 0 0 1 ${f(cx)} ${f(y1)}H0Z`; };
  // slot: a band along the line from the left edge to the waist, extended past both ends
  const { x0, y0, x1, y1, t } = g.slot, k = (y1 - y0) / (x1 - x0), e = 0.4;
  const yAt = x => y0 + k * (x - x0), n = (t / 2) * Math.hypot(1, k);   // vertical half-thickness
  const L = -e, Rx = x1 + e;
  const slot = `M${L} ${f(yAt(L) - n)}L${f(Rx)} ${f(yAt(Rx) - n)}L${f(Rx)} ${f(yAt(Rx) + n)}L${L} ${f(yAt(L) + n)}Z`;
  const above = `M${L} -1H${f(Rx)}V${f(yAt(Rx) - n)}L${L} ${f(yAt(L) - n)}Z`;                  // region of the upper piece
  const below = `M${L} ${f(yAt(L) + n)}L${f(Rx)} ${f(yAt(Rx) + n)}V3H${L}Z`;                    // region of the lower piece
  const cut = `M0 ${f(y0)}L${f(x1)} ${f(y1)}`;                                                  // centre line of the cut
  return { shapes: [dShape(0, m.hT, m.wT), dShape(m.H - m.hB, m.H, m.wB)], slot, above, below, cut, width: m.wB, height: m.H };
}

/* ---------------------------------------------------------------- the word (bennietech) */
// Each glyph returns { s: centreline strokes, p: filled polygons, a: accent strokes, adv: advance width }.
// Coordinates are local (left outer edge at x=0); layout shifts them.
const C = 0.5;
const pt = (a, r = R) => [f(C + r * Math.cos(a)), f(C + r * Math.sin(a))];
const deg = d => (d * Math.PI) / 180;

const GLYPH = {
  b: () => ({ p: [stem(0, ASC, 1)], s: [`M${h} ${h}H${C}A${R} ${R} 0 0 1 ${C} ${f(1 - h)}H${h}`], adv: 1.0 }),
  e: () => { const e = pt(deg(36)); return { s: [`M${h} ${C}H${f(1 - h)}A${R} ${R} 0 1 0 ${e[0]} ${e[1]}`], adv: 1.0 }; },
  n: () => ({ s: [`M${h} 0V1`, `M${h} ${C}A${R} ${R} 0 0 1 ${f(1 - h)} ${C}V1`], adv: 1.0 }),
  h: () => ({ p: [stem(0, ASC, 1)], s: [`M${h} ${C}A${R} ${R} 0 0 1 ${f(1 - h)} ${C}V1`], adv: 1.0 }),
  i: () => ({ s: [`M${h} 0V1`], a: [`M${h} -0.38V${f(-0.38 + W)}`], adv: W }),
  c: () => { const a = pt(deg(-38)), b = pt(deg(38)); return { s: [`M${a[0]} ${a[1]}A${R} ${R} 0 1 0 ${b[0]} ${b[1]}`], adv: 0.9 }; },
  t: () => ({
    p: [stem(0.16, -0.36, 1 - h - 0.3 + 0.02)],
    s: [`M${f(0.16 + h)} ${f(1 - h - 0.3 - 0.001)}A0.3 0.3 0 0 0 ${f(0.16 + h + 0.3)} ${f(1 - h)}H${f(0.16 + h + 0.4)}`, `M-0.06 ${h}H${f(0.16 + W + 0.32)}`],
    adv: 0.74,
  }),
};

const GAP = 0.14;                                           // default space between glyphs (optical, by pair below)
const PAIRS = { be: 0.12, en: 0.13, nn: 0.16, ni: 0.16, ie: 0.15, et: 0.06, te: 0.02, ec: 0.12, ch: 0.14 };

/** Lay out a word: returns { strokes, fills, accents, width } in x-height units. */
export function wordParts(text = 'bennietech') {
  const out = { strokes: [], fills: [], accents: [], width: 0 };
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const g = GLYPH[text[i]]?.();
    if (!g) { x += 0.45; continue; }
    const t = d => shiftPath(d, x);
    (g.s || []).forEach(d => out.strokes.push(t(d)));
    (g.p || []).forEach(d => out.fills.push(t(d)));
    (g.a || []).forEach(d => out.accents.push(t(d)));
    x += g.adv + (i < text.length - 1 ? (PAIRS[text.slice(i, i + 2)] ?? GAP) : 0);
  }
  out.width = x;
  return out;
}

/** Shift every x coordinate of an absolute path (M L H V A Z only) by dx. */
function shiftPath(d, dx) {
  return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_, cmd, args) => {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (!n.length || cmd === 'V' || cmd === 'Z') return cmd + args;
    if (cmd === 'H') return cmd + n.map(v => f(v + dx)).join(' ');
    if (cmd === 'A') { n[5] = f(n[5] + dx); return cmd + n.join(' '); }
    for (let k = 0; k < n.length; k += 2) n[k] = f(n[k] + dx);
    return cmd + n.join(' ');
  });
}

/* ---------------------------------------------------------------- SVG output */
const uid = () => 'bt' + Math.random().toString(36).slice(2, 8);
const paths = (list, attrs = '') => list.map(d => `<path${attrs} d="${d}"/>`).join('');

/**
 * The logo as an SVG string.
 *  layout: 'lockup' (mark + word) | 'mark' | 'word'
 *  ink / accent: colours; title: accessible name; cls: class on the <svg>.
 */
export function logoSVG({ layout = 'lockup', ink = '#0d0d0d', accent = '#c6f432', title = 'BennieTech', cls = 'bt-logo' } = {}) {
  const st = `fill="none" stroke-width="${W}" stroke-linecap="butt" stroke-linejoin="miter"`;
  const top = ASC - CUT, groups = [];
  let x = 0, maxX = 0;
  if (layout !== 'word') {
    const m = blockParts(), id = uid();
    groups.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-1" y="-2" width="4" height="4"><g transform="translate(0 ${f(top)})"><g fill="#fff">${paths(m.shapes)}</g><path fill="#000" d="${m.slot}"/></g></mask>`);
    groups.push(`<rect x="0" y="${f(top - 0.5)}" width="3" height="3" fill="${ink}" mask="url(#${id})"/>`);
    maxX = m.width; x = m.width + 0.42;
  }
  if (layout !== 'mark') {
    const w = wordParts(), dx = layout === 'word' ? 0 : x;
    groups.push(`<g transform="translate(${f(dx)} 0)"><g fill="${ink}">${paths(w.fills)}</g>` +
      `<g stroke="${ink}" ${st}>${paths(w.strokes)}</g><g stroke="${accent}" ${st}>${paths(w.accents)}</g></g>`);
    maxX = dx + w.width;
  }
  const minX = layout === 'word' ? -0.06 : 0, pad = 0.03;
  const vb = [minX - pad, top - pad, maxX - minX + pad * 2, 1 - top + pad * 2].map(v => v.toFixed(3)).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${groups.join('')}</svg>`;
}

/** The mark as two separately animatable pieces (.bt-up / .bt-lo) plus the cut line (.bt-cut). Used by the splash. */
export function markPiecesSVG({ ink = '#0d0d0d', accent = '#c6f432' } = {}) {
  const m = blockParts(), a = uid(), b = uid(), pad = 0.6;
  const vb = [-pad, -pad, m.width + pad * 2, m.height + pad * 2].map(v => v.toFixed(3)).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true">` +
    `<clipPath id="${a}"><path d="${m.above}"/></clipPath><clipPath id="${b}"><path d="${m.below}"/></clipPath>` +
    `<g class="bt-up"><g clip-path="url(#${a})" fill="${ink}">${paths(m.shapes)}</g></g>` +
    `<g class="bt-lo"><g clip-path="url(#${b})" fill="${ink}">${paths(m.shapes)}</g></g>` +
    `<path class="bt-cut" d="${m.cut}" stroke="${accent}" stroke-width="${f(BLOCK.t * .7)}" fill="none"/></svg>`;
}
