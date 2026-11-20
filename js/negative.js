// The handover between the calm print and the negative is a signal losing
// sync. Uneven rows slide sideways, slip vertically, smear one scanline down
// their height, interlace or invert, and the calm print survives in some of
// them while the rest already show the negative. The field and the liquid
// both evaluate this in CSS pixels, so they tear on exactly the same rows.
//
// tear: x how hard the picture tears, y the share of rows still showing the
// calm print, z the beat (rows are re-cut on each beat), w the exposure seed.
export const TEAR = `
float tearHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Returns the point whose picture this pixel shows. kind is 0 for the live
// negative, 1 for the calm print and 2 for the print inverted. seam marks a
// lime sync line along the top of a torn row.
vec2 tearAt(vec2 q, vec2 view, vec4 tear, out float kind, out float split, out float seam) {
  float beat = tear.z + floor(tear.w * 211.);
  float rowH = view.y * mix(.05, .24, tearHash(vec2(beat, 2.7)));
  float row = floor(q.y / rowH);
  float parts = floor(1. + 6. * pow(tearHash(vec2(row, beat + 4.3)), 3.));
  float f = fract(q.y / rowH) * parts;
  vec2 key = vec2(row * 8. + floor(f), beat);
  float top = q.y - fract(f) * rowH / parts;

  // Most rows nudge sideways and a few are thrown a long way.
  float far = step(.8, tearHash(key + 9.1)) * tearHash(key + 5.5);
  vec2 from = q;
  from.x -= floor((tearHash(key + 3.7) - .5) * view.x * tear.x * (.035 + .55 * far));
  // Now and then the whole frame loses vertical hold for a beat.
  if (tearHash(vec2(beat, 8.1)) < .3 * tear.x) from.y -= (tearHash(vec2(beat, 5.3)) - .5) * view.y * .24;
  // Some rows repeat their first scanline all the way down.
  if (tearHash(key + 6.2) < .14 * tear.x) from.y -= q.y - top;

  float odd = tearHash(key + 7.9);
  kind = tearHash(key + .17) < tear.y ? 1. : 0.;
  if (odd < .14 * tear.x) kind = kind > .5 ? 2. : kind;
  else if (odd > 1. - .13 * tear.x && tear.y > .02 && mod(floor(q.y * .5), 2.) < 1.) kind = 1. - kind;
  split = tear.x * (1. + 5. * tearHash(key + 2.2));
  seam = step(q.y - top, 1.) * step(tearHash(key + 1.3), .12 * tear.x);
  return from;
}
`;

// How hard the picture tears at this moment and how much of the calm print
// it still holds. Null while the signal is clean.
export function exposureTear(age, exposure) {
  const flash = [...exposure.flashes, ...exposure.tail].find(([a, b]) => age >= a && age < b);
  if (flash) return [flash[3], flash[2]];
  const entry = (age - exposure.holdStart) / exposure.tearIn;
  if (entry >= 0 && entry < 1) return [(1 - entry) ** 1.4, Math.max(0, exposure.entryCalm - entry * 1.7)];
  const exit = (age - exposure.end + exposure.tearOut) / exposure.tearOut;
  if (exit >= 0 && exit < 1) return [exit ** 1.2, .88 * exit ** 2.2];
  return null;
}

// The same rows for the baked liquid on Canvas 2D, between two stage
// heights. The hash follows the shader's single-precision arithmetic, so the
// slices land on the field's rows. Interlacing and sync lines are left out.
const f32 = Math.fround;
const fract = x => f32(x - Math.floor(x));
const add = (a, b) => f32(f32(a) + f32(b));
function tearHash(x, y) {
  let a = fract(f32(f32(x) * f32(.1031))), b = fract(f32(f32(y) * f32(.1031))), c = a;
  const d = add(add(f32(a * add(b, 33.33)), f32(b * add(c, 33.33))), f32(c * add(a, 33.33)));
  a = add(a, d); b = add(b, d); c = add(c, d);
  return fract(f32(add(a, b) * c));
}
export function tearRows([amount, calm, step, seed], [w, h], from, to) {
  const beat = step + Math.floor(f32(f32(seed) * 211));
  const rowH = h * (.05 + .19 * tearHash(beat, 2.7));
  const slip = tearHash(beat, 8.1) < .3 * amount ? (tearHash(beat, 5.3) - .5) * h * .24 : 0;
  const rows = [];
  for (let row = Math.floor(from / rowH); row * rowH < to; row++) {
    const parts = Math.floor(1 + 6 * tearHash(row, add(beat, 4.3)) ** 3);
    for (let part = 0; part < parts; part++) {
      const key = row * 8 + part, hash = salt => tearHash(add(key, salt), add(beat, salt));
      const far = hash(9.1) >= .8 ? hash(5.5) : 0;
      rows.push({
        top: (row + part / parts) * rowH, height: rowH / parts, slip, print: hash(.17) < calm,
        shift: Math.floor((hash(3.7) - .5) * w * amount * (.035 + .55 * far)), smear: hash(6.2) < .14 * amount,
      });
    }
  }
  return rows;
}
