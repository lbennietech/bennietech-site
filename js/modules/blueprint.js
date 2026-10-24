/**
 * blueprint.js — the block-B mark as a construction drawing that builds itself as you scroll.
 * <figure data-module="blueprint"> (an <svg> is generated inside it, rebuilt on resize)
 *
 * The drawing spans the full container: the mark sits at the right, its guide lines run edge to edge, and the
 * chapter's headline sits in the drawing's left margin with its last baseline locked to the mark's base guide
 * (CSS var --base-from-bottom). Everything is derived from the logo geometry (js/brand/logotype.js), so every
 * dimension printed is real:
 *   1. construction: the two bowl circles, guide lines through every height and centre       (draw in)
 *   2. dimensions: overall height, both block widths, both radii, the angle of the cut        (fade in)
 *   3. the pieces: upper block, then lower block, filled                                      (fade in)
 *   4. the cut: lime, the one signal                                                          (lights last)
 * Progress (0..1) is the figure's travel from entering the viewport to sitting just above its centre; each stage
 * is a class on the figure. Reduced motion: the finished drawing.
 */
import { BLOCK, blockGeom, blockParts } from '../brand/logotype.js?v=mvm2gv08';
import { clamp, reducedMotion, onResize } from '../core/utils.js?v=mvm2gv08';

const f = v => +v.toFixed(4);
const num = v => v.toFixed(3);
const Y0 = -0.4, YH = 2.46;          // vertical frame (logo units): room for the top and bottom dimensions
const XR = 1.78;                     // right edge of the frame: just past the R 0.490 callout

export default {
  name: 'blueprint',
  init(fig) {
    const m = BLOCK, g = blockGeom(m), parts = blockParts(m);
    const { T, B, slot } = g;
    const a = Math.atan2(slot.y0 - slot.y1, slot.x1 - slot.x0);           // the cut rises left to right
    const angle = a * 180 / Math.PI;
    const holder = document.createElement('div');
    holder.className = 'bp-wrap';
    fig.prepend(holder);

    function build() {
      const W = holder.clientWidth, H = holder.clientHeight;
      if (!W || !H) return;
      const w = YH * W / H, x0 = XR - w;                                   // the frame fills the container width
      const L = (ax, ay, bx, by, cls = '') => `<path class="${cls}" pathLength="1" d="M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}"/>`;
      const C = (c, cls = '') => `<circle class="${cls}" pathLength="1" cx="${f(c.x)}" cy="${f(c.y)}" r="${f(c.r)}"/>`;
      const Tx = (x, y, s, anchor = 'start', cls = '') => `<text class="${cls}" x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">${s}</text>`;
      const tick = (x, y, horiz) => horiz ? L(x, y - .035, x, y + .035, 'bp-dim') : L(x - .035, y, x + .035, y, 'bp-dim');

      // 1. construction — horizontal guides run the full width of the container
      const guidesH = [0, m.hT, T.y, m.H - m.hB, B.y, m.H].map(y => L(x0, y, XR, y, 'bp-guide'));
      const guidesV = [0, T.x, B.x, m.wT, m.wB].map(x => L(x, Y0 + .06, x, Y0 + YH - .06, 'bp-guide'));
      const circles = [C(T, 'bp-con'), C(B, 'bp-con')];
      const centres = [T, B].map(c => `<circle cx="${f(c.x)}" cy="${f(c.y)}" r=".013"/>`);
      // 2. dimensions
      const dx = -.58, dyB = m.H + .22, dyT = -.2;
      const dims = [
        L(dx, 0, dx, m.H, 'bp-dim'), tick(dx, 0, false), tick(dx, m.H, false),
        Tx(dx - .06, m.H / 2, `H ${num(m.H)}`, 'middle', 'bp-label bp-label--v'),
        L(0, dyB, m.wB, dyB, 'bp-dim'), tick(0, dyB, true), tick(m.wB, dyB, true),
        Tx(m.wB / 2, dyB + .11, `W ${num(m.wB)}`, 'middle', 'bp-label'),
        L(0, dyT, m.wT, dyT, 'bp-dim'), tick(0, dyT, true), tick(m.wT, dyT, true),
        Tx(m.wT / 2, dyT - .07, `W ${num(m.wT)}`, 'middle', 'bp-label'),
        L(T.x, T.y, T.x + T.r * .7071, T.y - T.r * .7071, 'bp-dim'),
        L(B.x, B.y, B.x + B.r * .7071, B.y + B.r * .7071, 'bp-dim'),
      ];
      // radius callouts: a leader from the arc out to the label, drawn above the fills so it survives the build
      const lead = (c, dir) => {
        const p = { x: c.x + c.r * .7071, y: c.y + dir * c.r * .7071 }, q = { x: p.x + .13, y: p.y + dir * .13 };
        return L(p.x, p.y, q.x, q.y, 'bp-lead') + L(q.x, q.y, q.x + .1, q.y, 'bp-lead') +
          Tx(q.x + .13, q.y + .02, `R ${num(c.r)}`, 'start', 'bp-label bp-label--r');
      };
      // the angle of the cut, measured outside the shape (drafting convention) at the waist, in the clear right
      // margin: the cut's extension and a horizontal reference leave the mark; arc and value in lime
      const vx = slot.x1, vy = slot.y1, ra = .34, ex = .52, gap = .16;
      const angleMark = [
        L(vx, vy, vx + ex, vy - ex * Math.tan(a), 'bp-hot bp-hot--ext'),
        L(vx + gap, vy, vx + ex + .05, vy, 'bp-dim'),
        `<path class="bp-hot" pathLength="1" d="M${f(vx + ra)} ${f(vy)}A${ra} ${ra} 0 0 0 ${f(vx + ra * Math.cos(a))} ${f(vy - ra * Math.sin(a))}"/>`,
        Tx(vx + ex + .1, vy - .5 * Math.sin(a / 2) * ra + .015, `${angle.toFixed(1)}°`, 'start', 'bp-label bp-label--hot'),
      ];

      holder.innerHTML = `
        <svg class="bp" viewBox="${f(x0)} ${Y0} ${f(w)} ${YH}" preserveAspectRatio="xMaxYMid meet" role="presentation">
          <defs>
            <clipPath id="bp-above"><path d="${parts.above}"/></clipPath>
            <clipPath id="bp-below"><path d="${parts.below}"/></clipPath>
          </defs>
          <g class="bp-l1">${guidesH.join('')}${guidesV.join('')}${circles.join('')}</g>
          <g class="bp-pts">${centres.join('')}</g>
          <g class="bp-l2">${dims.join('')}</g>
          <g class="bp-l3">
            <path class="bp-piece bp-piece--up" clip-path="url(#bp-above)" d="${parts.shapes.join(' ')}"/>
            <path class="bp-piece bp-piece--lo" clip-path="url(#bp-below)" d="${parts.shapes.join(' ')}"/>
          </g>
          <g class="bp-l4">${lead(T, -1)}${lead(B, 1)}${angleMark.join('')}</g>
          <path class="bp-cut" pathLength="1" d="${parts.cut}"/>
        </svg>`;
      // lock the headline: distance from the bottom of the drawing to the mark's base guide, in px
      (fig.parentElement || fig).style.setProperty('--base-from-bottom', ((Y0 + YH - m.H) / YH * H).toFixed(1) + 'px');
    }

    const stages = [['is-con', .05], ['is-dim', .36], ['is-up', .52], ['is-lo', .64], ['is-cut', .78]];
    const update = () => {
      const r = fig.getBoundingClientRect(), vh = innerHeight;
      // 0 as the figure's top enters the bottom of the viewport, 1 as its centre reaches 55% of the viewport
      const p = reducedMotion() ? 1 : clamp((vh - r.top) / (vh * .45 + r.height * .5), 0, 1);
      stages.forEach(([c, at]) => fig.classList.toggle(c, p >= at));
    };
    build(); update();
    onResize(holder, build);
    document.fonts?.ready.then(build);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  },
};
