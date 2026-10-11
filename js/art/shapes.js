/**
 * shapes.js — outline shapes used to break up the rectangles (flower, burst, cog, sparkle, blob, squircle).
 *
 * Each shape is a function that returns an SVG path in *bounding-box units* (0..1), so it scales to
 * any element size when used as a <clipPath clipPathUnits="objectBoundingBox">.
 * Apply with  data-shape="flower"  on an element that also has data-module="shape" (or use it inside
 * a module that boots `shape`). Add a new shape by adding an entry to SHAPES.
 */
const TAU = Math.PI * 2;

/** Build a closed path from a polar radius function r(theta) -> 0..0.5 around the centre (.5,.5). */
function polar(rFn, n = 260) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, r = rFn(a);
    d += (i ? 'L' : 'M') + (.5 + Math.cos(a) * r).toFixed(4) + ' ' + (.5 + Math.sin(a) * r).toFixed(4);
  }
  return d + 'Z';
}
const circlePath = (r) => `M${.5 + r} .5A${r} ${r} 0 1 0 ${.5 - r} .5A${r} ${r} 0 1 0 ${.5 + r} .5Z`;

export const SHAPES = {
  flower:  () => polar(a => .355 + .145 * Math.cos(8 * a)),
  flower6: () => polar(a => .34 + .16 * Math.cos(6 * a)),
  burst:   () => polar(a => { const u = (((a * 14) / TAU) % 1 + 1) % 1; return .33 + .17 * Math.abs(u * 2 - 1); }),
  /** Gear with a round hole (evenodd rule). */
  cog:     () => polar(a => .36 + .13 * (.5 + .5 * Math.tanh(5 * Math.sin(12 * a)))) + circlePath(.16),
  /** Four-point star */
  sparkle: () => {
    let d = '';
    const n = 200;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU, c = Math.cos(t), s = Math.sin(t);
      const x = .5 + .5 * c * c * c, y = .5 + .5 * s * s * s;   // astroid (cos^3, sin^3): a true 4-point star
      d += (i ? 'L' : 'M') + x.toFixed(4) + ' ' + y.toFixed(4);
    }
    return d + 'Z';
  },
  /** Super-ellipse ("squircle"), n ≈ 4.6 */
  squircle: () => polar(a => { const n = 4.6, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return .5 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n); }),
};

/** Organic blob; `t` morphs it over time (used by the animated "blob" shape). */
export function blobPath(t = 0) {
  return polar(a => .37 + .06 * Math.sin(3 * a + t * .9) + .045 * Math.sin(5 * a - t * 1.3 + 1.7) + .03 * Math.sin(2 * a + t * .6 + 4), 120);
}
