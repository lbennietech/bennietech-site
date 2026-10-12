/**
 * hero-funk.js — the hero "sticker" scene (Canvas 2D). Replaces the old WebGL balloons.
 *
 * A cast of chunky die-cut shapes — flower, burst, smiley, cog, bolt, squiggle, sparkle, ring, asterisk —
 * floats around the giant BennieTech wordmark. Each is drawn in the LOGO'S STYLE: a bold colour body with
 * four stacked layers behind it (cyan, green, yellow, pink) plus a cyan glow. The layers fan out with the
 * pointer (shared with the wordmark, see core/pointer.js) so the whole hero reads as one 3D-ish extrusion.
 *
 * Tweak the cast in WIDE (landscape) / TALL (portrait) below:
 *   { shape, x, y (0..1 of the canvas), s (size), body, spin (rad/s), sp (bob speed), d (parallax depth) }
 * Add a shape: add a case in `paint()` (draw in a 0..1 box) and use its name in the lists.
 */
import { addTask } from '../core/ticker.js';
import { whenVisible, reducedMotion, onResize, TAU, lerp } from '../core/utils.js';
import { fan, pointer, listenPointer } from '../core/pointer.js';
import { SHAPES } from '../art/shapes.js';

const LAYERS = ['#4fe0e6', '#7fc86a', '#ffd04d', '#f2c4dc'];      // nearest -> farthest (matches the logo)
const BODY = { ink: '#0b0b0b', volt: '#d4ff3a', pink: '#ff3ea5', blue: '#3a3cff', white: '#fafafa' };

/* x/y are fractions of the hero; s is a fraction of the layout unit (see `unit` below). */
const WIDE = [
  { shape: 'flower',   x: .075, y: .17, s: .21, body: 'volt', spin: .25,  sp: 1.1, d: .9 },
  { shape: 'burst',    x: .28, y: .13, s: .16, body: 'ink',  spin: -.4,  sp: 1.4, d: .6 },
  { shape: 'sparkle',  x: .47, y: .10, s: .13, body: 'blue', spin: .3,   sp: 1.7, d: 1.0 },
  { shape: 'smiley',   x: .66, y: .17, s: .18, body: 'pink', spin: .0,   sp: 1.0, d: .8 },
  { shape: 'cog',      x: .925, y: .17, s: .18, body: 'ink',  spin: .35,  sp: 1.2, d: .7 },
  { shape: 'bolt',     x: .87, y: .56, s: .12, body: 'blue', spin: .0,   sp: 1.6, d: 1.1 },
  { shape: 'squiggle', x: .08, y: .62, s: .20, body: 'pink', spin: .0,   sp: 1.3, d: .5 },
  { shape: 'ring',     x: .19, y: .80, s: .12, body: 'volt', spin: -.3,  sp: 1.5, d: .8 },
  { shape: 'asterisk', x: .95, y: .80, s: .10, body: 'ink',  spin: .5,   sp: 1.2, d: 1.0 },
];
const TALL = [
  { shape: 'flower',   x: .17, y: .20, s: .33, body: 'volt', spin: .25,  sp: 1.1, d: .9 },
  { shape: 'burst',    x: .50, y: .11, s: .22, body: 'ink',  spin: -.4,  sp: 1.4, d: .6 },
  { shape: 'smiley',   x: .84, y: .18, s: .27, body: 'pink', spin: .0,   sp: 1.0, d: .8 },
  { shape: 'sparkle',  x: .10, y: .43, s: .19, body: 'blue', spin: .3,   sp: 1.7, d: 1.0 },
  { shape: 'cog',      x: .88, y: .43, s: .24, body: 'ink',  spin: .35,  sp: 1.2, d: .7 },
  { shape: 'bolt',     x: .66, y: .30, s: .14, body: 'blue', spin: .0,   sp: 1.6, d: 1.1 },
  { shape: 'squiggle', x: .38, y: .36, s: .30, body: 'pink', spin: .0,   sp: 1.3, d: .5 },
];

/* ---- shape paths (built once). The polygons come from art/shapes.js (0..1 box). ---- */
const circleD = r => `M${.5 + r} .5A${r} ${r} 0 1 0 ${.5 - r} .5A${r} ${r} 0 1 0 ${.5 + r} .5Z`;
const PATH = {
  flower:  new Path2D(SHAPES.flower()),
  burst:   new Path2D(SHAPES.burst()),
  sparkle: new Path2D(SHAPES.sparkle()),
  cog:     new Path2D(SHAPES.cog()),
  ring:    new Path2D(SHAPES.flower6() + circleD(.17)),
  blob:    new Path2D(SHAPES.squircle()),
  bolt:    new Path2D('M.58 .02 L.2 .54 L.45 .54 L.36 .98 L.8 .4 L.54 .4 Z'),
};

/** Draw one shape in a 0..1 box using `color`. `body` = the top layer (gets details like a face). */
function paint(ctx, shape, color, body) {
  ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (shape) {
    case 'smiley': {
      ctx.fill(PATH.blob); ctx.lineWidth = .04; ctx.stroke(PATH.blob);
      if (body) {
        ctx.fillStyle = BODY.ink; ctx.strokeStyle = BODY.ink;
        ctx.beginPath(); ctx.ellipse(.36, .42, .05, .08, 0, 0, TAU); ctx.ellipse(.64, .42, .05, .08, 0, 0, TAU); ctx.fill();
        ctx.lineWidth = .05; ctx.beginPath(); ctx.arc(.5, .5, .2, .16 * Math.PI, .84 * Math.PI); ctx.stroke();
      }
      break;
    }
    case 'squiggle': {
      ctx.lineWidth = .15; ctx.beginPath();
      for (let i = 0; i <= 48; i++) { const x = .06 + (i / 48) * .88, y = .5 + Math.sin((i / 48) * TAU * 2.1) * .2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      break;
    }
    case 'asterisk': {
      ctx.lineWidth = .2; ctx.beginPath();
      for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; ctx.moveTo(.5 - Math.cos(a) * .38, .5 - Math.sin(a) * .38); ctx.lineTo(.5 + Math.cos(a) * .38, .5 + Math.sin(a) * .38); }
      ctx.stroke();
      break;
    }
    case 'bolt': ctx.fill(PATH.bolt); ctx.lineWidth = .07; ctx.stroke(PATH.bolt); break;
    case 'ring': case 'cog': ctx.fill(PATH[shape], 'evenodd'); ctx.lineWidth = .035; ctx.stroke(PATH[shape]); break;
    default:     ctx.fill(PATH[shape]); ctx.lineWidth = .04; ctx.stroke(PATH[shape]);
  }
}

export default {
  name: 'hero-funk',
  init(canvas) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = 1, items = [], stop = null;
    const smooth = { x: 0, y: 0 };

    function size() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // glow blur is the costly part: cap resolution
      w = Math.max(2, r.width); h = Math.max(2, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const tall = w / h < .9;
      items = (tall ? TALL : WIDE).map((it, i) => ({ ...it, ph: i * 1.7, tall }));
      if (tall) fitAboveCopy();
      draw(2.5);
    }

    /* Portrait: on short/narrow phones the copy fills most of the hero, so squeeze the cast (positions and
       sizes, towards the top) until it clears the eyebrow + headline. Overlapping the big name is intended. */
    function fitAboveCopy() {
      const copy = canvas.parentElement?.querySelector('.eyebrow, .hero__title');
      if (!copy) return;
      const limit = copy.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
      const reach = Math.max(...items.map(it => it.y * h + it.s * w * .62));   // .62: half-size + layers + bob
      const k = Math.min(1, Math.max(.4, limit / reach));
      for (const it of items) { it.y *= k; it.s *= k; }
    }

    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const f = fan(t);
      const tall = items[0]?.tall;
      const unit = tall ? w : Math.min(w * .85, h * 1.15);
      for (const it of items) {
        const size = it.s * unit;
        const bob = Math.sin(t * it.sp + it.ph) * size * .07;
        const px = smooth.x * it.d * size * .35, py = smooth.y * it.d * size * .25;
        const x = it.x * w + px, y = it.y * h + bob + py;
        const rot = Math.sin(t * it.sp * .6 + it.ph) * .22 + t * it.spin;
        const step = size * .06;

        // layers: far -> near, then the body. Offsets are in SCREEN space (don't rotate with the shape).
        for (let k = 4; k >= 0; k--) {
          ctx.save();
          ctx.translate(x + f.ox * step * k, y + f.oy * step * k);
          ctx.rotate(rot); ctx.scale(size, size); ctx.translate(-.5, -.5);
          if (k === 4) { ctx.shadowColor = 'rgba(79,224,230,.75)'; ctx.shadowBlur = size * .22 * dpr; ctx.shadowOffsetY = size * .12 * dpr; }
          paint(ctx, it.shape, k === 0 ? BODY[it.body] : LAYERS[k - 1], k === 0);
          ctx.restore();
        }
      }
    }

    size(); onResize(canvas, size);
    document.fonts?.ready.then(size);   // the copy moves once the web fonts land
    if (reducedMotion()) return;
    listenPointer();
    const tick = (t) => {
      smooth.x = lerp(smooth.x, pointer.active ? pointer.x : 0, .06);
      smooth.y = lerp(smooth.y, pointer.active ? pointer.y : 0, .06);
      draw(t);
    };
    whenVisible(canvas, v => {
      if (v && !stop) stop = addTask(tick);
      else if (!v && stop) { stop(); stop = null; }
    }, '0px');
  },
};
