// Full-viewport procedural stage backdrops for themed B sculptures.
//
// Drawn once per resize (or stage change) on a single oversized WebGL canvas
// (`canvas.space`) that drifts subtly with pointer & light sweep:
//   mode 1 = Deep space (Starship B): starfield, galactic band, nebula, planet sunrise
//   mode 2 = Architectural studio (Terrazzo & Emerald Louver B): luminous
//            lavender-tiled gallery wall, receding ultraviolet-magenta drafting
//            grid floor, soft flanking periwinkle studio bounce
//   mode 3 = Cybernetic PCB studio (Quantum Glass Voxel B): deep indigo
//            anisotropic etched circuit-board plane, subtle fiber-optic traces
//            and peripheral cobalt/neon-pink ambient glow
//
// The same GLSL (`SPACE` + `stageColor`) rebuilds the active backdrop inside
// the glitch's torn print rows (`field.js`), so the handover matches pixel for pixel.
import { program } from './gl/gl.js';

// Everything is in viewport CSS pixels, so the layer and the glitch field
// agree regardless of device pixel ratio.
export const SPACE = `
uniform vec2 spaceView;

float sHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 sHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float sNoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(sHash(i), sHash(i + vec2(1., 0.)), f.x), mix(sHash(i + vec2(0., 1.)), sHash(i + vec2(1., 1.)), f.x), f.y);
}
float sFbm(vec2 p) {
  float a = .5, s = 0.;
  for (int i = 0; i < 5; i++) {
    s += a * sNoise(p);
    p = mat2(.8, .6, -.6, .8) * p * 2.03 + vec2(3.1, 1.7);
    a *= .5;
  }
  return s;
}

vec3 starTint(float t) {
  return t < .5 ? mix(vec3(.58, .72, 1.), vec3(.95, .96, 1.), t * 2.) : mix(vec3(.95, .96, 1.), vec3(1., .80, .58), t * 2. - 1.);
}

// One layer of point stars on a jittered grid, at most one star per cell.
vec3 starLayer(vec2 p, float cell, float density, float radius, float gain, float seed) {
  vec2 c = floor(p / cell);
  if (sHash(c + seed) > density) return vec3(0.);
  vec2 at = (c + .18 + .64 * sHash2(c + seed * 1.71)) * cell;
  vec2 d = p - at;
  float m = sHash(c + seed * 3.13);
  float mag = .12 + .88 * m * m * m;
  return starTint(sHash(c + seed * 5.37)) * exp(-dot(d, d) / (radius * radius)) * mag * gain;
}

// Rare bright stars with a soft bloom and faint diffraction spikes.
vec3 heroStars(vec2 p, float cell, float seed) {
  vec2 c = floor(p / cell);
  if (sHash(c + seed) > .24) return vec3(0.);
  vec2 at = (c + .2 + .6 * sHash2(c + seed * 1.37)) * cell;
  vec2 d = p - at;
  float m = sHash(c + seed * 2.9);
  float mag = .25 + .75 * m * m;
  float r2 = dot(d, d);
  vec2 a = abs(d);
  float spikes = (exp(-a.y / .5) * exp(-a.x / (5. + 10. * mag)) + exp(-a.x / .5) * exp(-a.y / (5. + 10. * mag))) * .32;
  float body = exp(-r2 / 1.1) * 2.2 + exp(-sqrt(r2) / 3.) * .18 + spikes * step(.82, m);
  return starTint(sHash(c + seed * 4.1)) * body * mag;
}

// Geometry of the planet and the sun for a given viewport.
void spacePlanet(vec2 v, out vec2 centre, out float radius, out vec2 sun) {
  float tall = clamp((1.05 - v.x / v.y) / .55, 0., 1.);
  radius = max(v.x, v.y) * 2.3;
  float limb = v.y * mix(.875, .905, tall);
  centre = vec2(v.x * .56, limb + radius);
  vec2 toward = normalize(vec2(v.x * mix(.80, .78, tall), limb) - centre);
  // The sun sits just below the limb, so only its glare and a sliver rise.
  sun = centre + toward * (radius - v.y * .004);
}

vec3 spaceAt(vec2 p) {
  vec2 v = spaceView;
  float H = v.y;
  vec2 uv = p / H;
  float aspect = v.x / v.y;
  vec3 col = vec3(.0012, .0019, .0036);

  // A faint galactic band rises to the upper right behind the B.
  vec2 axis = normalize(vec2(1., -.62));
  vec2 q = uv - vec2(aspect * .52, .40);
  float across = dot(q, vec2(-axis.y, axis.x));
  float band = exp(-across * across / .045);
  float dust = sFbm(uv * 3.4 + vec2(4.1, 2.3));
  float cloud = sFbm(uv * 1.7 + vec2(dust * .9, 1.3));
  float lanes = 1. - .78 * smoothstep(.42, .68, dust) * band;
  col += vec3(.018, .02, .026) * band * smoothstep(.32, .82, cloud) * lanes;

  // Cold teal nebula to the right, a breath of violet to the left.
  float neb = sFbm(uv * 1.15 + vec2(7.2, 3.1) + .55 * sFbm(uv * 2.4 + 1.7));
  float right = smoothstep(.15, 1., uv.x / aspect);
  float nebFine = sFbm(uv * 4.3 + vec2(neb * 1.6, 2.2));
  float tealGas = smoothstep(.46, .9, neb) * (.6 + .7 * nebFine);
  col += vec3(.014, .06, .08) * tealGas * right;
  col += vec3(.05, .018, .03) * smoothstep(.6, .95, neb) * smoothstep(.5, .8, nebFine) * right;
  float vio = sFbm(uv * 1.35 + vec2(11.4, 5.2));
  col += vec3(.04, .014, .06) * smoothstep(.52, .9, vio) * (.6 + .6 * nebFine) * (1. - right);
  // Dark dust filaments silhouetted against the gas.
  col *= 1. - .55 * smoothstep(.58, .8, sFbm(uv * 6.5 + vec2(3.7, 9.1))) * smoothstep(.4, .8, neb);

  // A distant barred spiral galaxy high on the right.
  vec2 gq = (p - v * vec2(.83, .2)) / H;
  gq = mat2(.86, -.5, .5, .86) * gq;
  gq.y *= 2.6;
  float gr = length(gq);
  float garm = .5 + .5 * sin(atan(gq.y, gq.x) * 2. - log(gr + 1e-3) * 5.2);
  float galaxy = exp(-gr / .012) * 1.4 + exp(-gr / .032) * (.25 + .75 * garm * garm) * smoothstep(.09, .02, gr);
  col += vec3(.75, .78, 1.) * galaxy * .055 + vec3(1., .82, .6) * exp(-gr / .004) * .12;

  // Stars, denser in the band and dimmed by its dust.
  float dens = (.75 + 1.7 * band) * lanes;
  vec3 starlight = starLayer(p, 4.5, .085 * dens, .40, .040, 1.);
  starlight += starLayer(p, 9., .20 * dens, .52, .13, 7.);
  starlight += starLayer(p, 23., .34, .64, .50, 13.);
  starlight += starLayer(p, 61., .42, .80, 1.05, 19.);
  starlight += heroStars(p, 170., 29.);
  // The top-left wordmark keeps a darker sky.
  vec2 lock = (p - vec2(110., 34.)) / vec2(230., 90.);
  float quietSky = 1. - .7 * exp(-dot(lock, lock));
  col = (col + starlight) * quietSky;

  vec2 pc, sun; float R;
  spacePlanet(v, pc, R, sun);
  vec2 rel = p - pc;
  float alt = length(rel) - R;
  float ang = atan(rel.x, -rel.y);
  float sunAng = atan(sun.x - pc.x, -(sun.y - pc.y));
  float along = (ang - sunAng) * R / H;
  float near = exp(-along * along / .085);
  float nearWide = exp(-along * along / .9);
  vec3 atmCol = mix(vec3(.16, .40, 1.), vec3(1., .52, .19), near);

  if (alt < 0.) {
    // The night side: dark ocean and cloud, a thin sunrise crescent at the
    // limb and the glow of the atmosphere seen edge-on.
    float depth = -alt / H;
    vec2 surf = vec2(ang * R / H * 1.6, sqrt(depth) * 5.5);
    float clouds = sFbm(surf * vec2(2.2, 3.4) + vec2(1.3, 7.7));
    float swirl = sFbm(surf * vec2(5.1, 7.2) + clouds * 1.8);
    float body = .55 + .9 * smoothstep(.35, .85, clouds) + .35 * swirl;
    col = vec3(.0016, .0026, .0046) * body;
    float crescent = exp(-depth / .010) * (.06 + 1.35 * near + .25 * nearWide);
    col += mix(vec3(.22, .38, .66), vec3(1., .62, .30), near) * crescent * (.45 + .9 * smoothstep(.3, .8, clouds));
    col += atmCol * exp(-depth / .0032) * (.22 + 1.6 * near + .3 * nearWide);
    // A scatter of city lights deep on the night side.
    vec2 cc = floor(surf * vec2(46., 30.));
    float city = step(.965, sHash(cc + 3.1)) * smoothstep(.15, .5, swirl) * smoothstep(.012, .05, depth);
    col += vec3(1., .62, .28) * city * .05 * exp(-length(fract(surf * vec2(46., 30.)) - .5) * 6.);
  } else {
    float a = alt / H;
    col += atmCol * (exp(-a / .0075) * (.32 + 2.2 * near + .35 * nearWide) + exp(-a / .055) * (.035 + .42 * near + .08 * nearWide));
  }

  // A small moon on the left, lit from the sunrise side.
  vec2 mc = v * vec2(.14, mix(.6, .56, clamp((1.05 - v.x / v.y) / .55, 0., 1.)));
  float mr = H * .022;
  vec2 md = (p - mc) / mr;
  float ml = length(md);
  if (ml < 1.) {
    vec3 mn = vec3(md, sqrt(1. - ml * ml));
    vec3 toSun = normalize(vec3(.92, .3, .25));
    float lam = max(dot(mn, toSun), 0.);
    float maria = sFbm(md * 2.4 + 5.) * .6 + sFbm(md * 7. + 1.) * .4;
    vec3 rock = mix(vec3(.5, .47, .44), vec3(.82, .78, .72), smoothstep(.35, .7, maria));
    col = vec3(.0015, .002, .004) + rock * lam * vec3(1., .86, .7) * .42 + vec3(.01, .02, .04) * mn.z * .3;
  }
  col += vec3(.25, .3, .45) * exp(-max(ml - 1., 0.) * 9.) * step(1., ml) * .02;

  // Faint auroral curtains hanging over the planet's night side.
  if (alt > 0.) {
    float a = alt / H;
    float curtain = .5 + .5 * sin(along * 38. + sFbm(vec2(along * 4., 1.)) * 6.);
    float rays = smoothstep(.3, 1., sNoise(vec2(along * 160., a * 4.)));
    float band = exp(-pow((a - .022) / .016, 2.)) * smoothstep(-.25, -1.2, along) * smoothstep(-3.2, -1.6, along);
    col += mix(vec3(.08, .9, .35), vec3(.2, .45, .9), smoothstep(.01, .05, a)) * band * curtain * (.4 + .6 * rays) * .05;
  }

  // Sun glare and a thin anamorphic streak along the horizon.
  vec2 ds = (p - sun) / H;
  float r = length(ds);
  col += vec3(1., .80, .56) * (2.6 * exp(-r / .010) + .50 * exp(-r / .055)) + vec3(.9, .72, .6) * .07 * exp(-r / .26);
  col += vec3(.28, .52, 1.) * (.42 * exp(-abs(ds.y) / .0014) * exp(-abs(ds.x) / .62) + .06 * exp(-abs(ds.y) / .010) * exp(-abs(ds.x) / .34));

  // A gentle lens falloff toward the corners.
  vec2 vig = (p / v - .5) * vec2(1.05, 1.15);
  col *= 1. - .35 * smoothstep(.35, .95, length(vig));
  return col;
}

vec3 spaceTone(vec3 c) {
  c *= 1.05;
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2));
}

vec3 spaceColor(vec2 p) {
  return spaceTone(spaceAt(p));
}

// ---------------------------------------------------------------------------
// Stage 2: Architectural Terrazzo & Emerald Louver Studio (Image 1 mood)
// Luminous cool-lavender tiled gallery wall above a vibrant perspective
// ultraviolet-to-magenta coordinate grid floor.
// ---------------------------------------------------------------------------
float gridLine(float coord, float w) {
  float d = abs(fract(coord + .5) - .5);
  return 1. - smoothstep(0., max(w, .001), d);
}

// Soft window light thrown across the gallery wall: three tall panes leaning
// with the sun, their edges softened by distance.
float windowGobo(vec2 q) {
  float x = q.x - q.y * .42;
  float panes = 0.;
  for (int i = 0; i < 3; i++) {
    float c = .34 + float(i) * .2;
    panes += smoothstep(.05, .0, abs(x - c) - .055);
  }
  float mull = smoothstep(.0, .012, abs(fract(q.y * 2.6 + .3) - .5) - .02);
  return panes * mull * smoothstep(.95, .1, q.y);
}

vec3 louverWall(vec2 uv, float aspect, vec2 p) {
  vec2 w = vec2((uv.x - .5) * aspect, uv.y);
  vec3 col = mix(vec3(.86, .86, .975), vec3(.75, .74, .955), smoothstep(.0, .64, uv.y));
  float mottle = sNoise(w * 3.1 + 2.) * .6 + sNoise(w * 9. + 7.) * .4;
  col *= .985 + .03 * mottle;
  // Overhead daylight falling behind the B, and the window light.
  vec2 k = (uv - vec2(.56, .22)) * vec2(1.1, 1.5);
  col += vec3(.07, .068, .05) * exp(-dot(k, k) * 1.8);
  col += vec3(.07, .062, .036) * windowGobo(vec2((uv.x - .5) * aspect, uv.y));
  // Large-format plaster panels with a bevelled hairline joint.
  vec2 g = (w + vec2(.16, .04)) * 3.2;
  vec2 fg = fract(g);
  float px = 3.2 / spaceView.y;
  float jx = abs(fg.x - .5) * 2.;
  float edgeX = 1. - smoothstep(1. - px * 2.6, 1. - px * .6, jx);
  float shadeY = smoothstep(px * 3., 0., fg.y) * .5 + smoothstep(1. - px * 1.4, 1., fg.y);
  float lightY = smoothstep(px * 3., px * 1., fg.y) * smoothstep(0., px * 1.2, fg.y);
  col *= 1. - .05 * shadeY - .035 * (1. - edgeX);
  col += vec3(.02) * lightY;
  float sideWash = smoothstep(.26, .95, abs(uv.x - .5)) * smoothstep(.04, .60, uv.y);
  col = mix(col, vec3(.66, .66, .95), sideWash * .2);
  return col;
}

vec3 louverStageColor(vec2 p) {
  vec2 v = max(spaceView, vec2(1.));
  vec2 uv = p / v;
  float aspect = v.x / v.y;
  float tall = clamp((1.05 - aspect) / .55, 0., 1.);
  float horiz = mix(.61, .64, tall);

  vec3 col;
  if (uv.y < horiz) {
    col = louverWall(uv, aspect, p);
    // The cove curves softly into the floor: bounce from the violet floor below.
    float cove = smoothstep(horiz - .1, horiz, uv.y);
    col = mix(col, col * vec3(.86, .8, 1.02) + vec3(.03, .0, .06), cove * cove * .7);
  } else {
    float dy = uv.y - horiz;
    float zf = .35 / (dy + .06);
    float xf = (uv.x - .5) * aspect * zf * 1.15;
    mat2 rotG = mat2(.8829, -.4695, .4695, .8829);
    vec2 gp = rotG * vec2(xf, zf) * 4.45;
    float dzdy = .35 / ((dy + .06) * (dy + .06)) / v.y;
    float fw = clamp(dzdy * 4.6 + zf * 4.4 / v.y, .008, .3);
    float gMajor = max(gridLine(gp.x, fw * .6), gridLine(gp.y, fw * .6));
    float gSub = max(gridLine(gp.x * 4., fw * 2.4), gridLine(gp.y * 4., fw * 2.4)) * smoothstep(1.6, .7, zf);
    // Lacquer gradient: cobalt-violet on the left to magenta on the right.
    float diag = clamp(uv.x * .74 + dy / (1. - horiz) * .62, 0., 1.);
    vec3 fl = mix(vec3(.22, .15, .80), vec3(.45, .12, .88), smoothstep(.04, .56, diag));
    fl = mix(fl, vec3(.70, .11, .88), smoothstep(.38, 1., diag));
    // Mirror of the wall in the lacquer, softer with distance from the horizon.
    vec3 refl = louverWall(vec2(uv.x, horiz - dy * .7), aspect, p);
    float fres = .42 * exp(-dy / .2) + .08;
    fl = mix(fl, refl * vec3(.82, .72, 1.04), fres);
    // Light pooled on the floor in front of the sculpture.
    vec2 hot = (uv - vec2(.53, horiz + .2)) * vec2(1.45, 2.5);
    fl += vec3(.1, .06, .13) * exp(-dot(hot, hot) * 2.4);
    // Fine luminous grid, fading into the haze toward the horizon.
    float haze = smoothstep(.0, .09, dy);
    vec3 lineCol = mix(vec3(.80, .76, 1.), vec3(1., .86, 1.), diag);
    fl = mix(fl, lineCol, gMajor * .32 * haze);
    fl = mix(fl, lineCol, gSub * .08 * haze);
    col = fl;
  }
  // A crisp, faintly lit seam where the cove meets the floor.
  col = mix(col, vec3(.95, .9, 1.), exp(-abs(uv.y - horiz) * v.y / 1.2) * .35);
  vec2 lock = (p - vec2(115., 36.)) / vec2(240., 96.);
  col = mix(col, vec3(.882, .884, .974), exp(-dot(lock, lock)) * .5 * step(uv.y, horiz));
  vec2 vig = (uv - .5) * vec2(1.06, 1.12);
  col *= 1. - .15 * smoothstep(.45, 1.05, length(vig));
  return clamp(col, 0., 1.);
}

// ---------------------------------------------------------------------------
// Stage 3: Quantum Glass Voxel PCB Studio (Image 2 mood)
// Deep, dark, silky midnight slate-indigo etched silicon/PCB substrate with
// isotropic razor-sharp 90/45-deg micro-traces, tiny round vias & crisp cables.
// ---------------------------------------------------------------------------
float pcbEtch(vec2 q, float px) {
  // 1:1 isotropic cell grid so every trace has exact crisp constant thickness
  // and every micro-via pad is a true geometric circle (zero stretching!).
  vec2 cell = floor(q);
  vec2 f = fract(q) - .5;
  float h = sHash(cell + 4.13);
  float h2 = sHash(cell * 1.91 + 7.77);
  // Continuous 45-degree mitered PCB traces (horizontal, vertical, or crisp elbow bend!)
  float d = 1.;
  if (h < .34) {
    d = abs(f.x);
  } else if (h < .68) {
    d = abs(f.y);
  } else if (h < .84) {
    // 45-deg diagonal routing segment passing cleanly through cell corners
    float s = h2 > .5 ? 1. : -1.;
    d = abs((f.x + s * f.y) * .7071);
  } else {
    // Crisp 90-deg trace elbow with micro-via pad
    float sx = h2 > .5 ? 1. : -1.;
    float sy = fract(h2 * 7.3) > .5 ? 1. : -1.;
    float d1 = f.x * sx > 0. ? abs(f.y) : length(f);
    float d2 = f.y * sy > 0. ? abs(f.x) : length(f);
    d = min(d1, d2);
  }
  float w = .052;
  float line = 1. - smoothstep(w, w + px, d);
  // Tiny perfectly round micro-via ring at select trace junctions
  float r = length(f);
  float via = (1. - smoothstep(.13, .13 + px, r)) * smoothstep(.055, .055 + px, r) * step(.82, h2);
  return max(line * .75, via * .95);
}

// Soft out-of-focus discs on a jittered grid (camera bokeh).
vec3 bokehLayer(vec2 p, float cell, float density, float radius, float seed, vec3 colA, vec3 colB) {
  vec2 c = floor(p / cell);
  float h = sHash(c + seed);
  if (h > density) return vec3(0.);
  vec2 at = (c + .2 + .6 * sHash2(c + seed * 1.9)) * cell;
  float r = radius * (.55 + .9 * sHash(c + seed * 3.3));
  float d = length(p - at) / r;
  float disc = smoothstep(1., .9, d) * (.55 + .45 * smoothstep(.55, .97, d));
  return mix(colA, colB, sHash(c + seed * 7.7)) * disc * (.35 + .65 * sHash(c + seed * 5.1));
}

vec3 voxelWall(vec2 uv, float aspect) {
  vec2 c = (uv - vec2(.5, .44)) * vec2(aspect, 1.);
  vec3 col = mix(vec3(.0015, .0012, .0055), vec3(.008, .0055, .024), exp(-dot(c, c) * 2.8));
  col += vec3(.026, .004, .036) * exp(-dot(c - vec2(.20, .06), c - vec2(.20, .06)) * 6.5);
  col += vec3(.003, .011, .042) * exp(-dot(c + vec2(.22, .02), c + vec2(.22, .02)) * 5.5);
  return col;
}

vec3 voxelStageColor(vec2 p) {
  vec2 v = max(spaceView, vec2(1.));
  vec2 uv = p / v;
  float aspect = v.x / v.y;
  float tall = clamp((1.05 - aspect) / .55, 0., 1.);
  float horiz = mix(.62, .66, tall);

  vec3 col;
  if (uv.y < horiz) {
    // The void behind the core: deep indigo with a magenta and cobalt
    // breath of light, and out-of-focus city lights low on the horizon.
    col = voxelWall(uv, aspect);
    float low = smoothstep(horiz - .42, horiz - .02, uv.y);
    float lowB = smoothstep(horiz - .3, horiz - .01, uv.y);
    vec3 bk = bokehLayer(p, 26., .18, 5.5, 3.1, vec3(.10, .32, 1.), vec3(1., .16, .70)) * .05;
    bk += bokehLayer(p + 17., 58., .2, 11., 8.7, vec3(.16, .22, .95), vec3(.70, .10, .80)) * .022;
    col += bk * lowB * lowB;
    // A faint field of tiny distant motes higher up.
    col += starLayer(p, 11., .07, .55, .05, 41.) * vec3(.55, .65, 1.2) * (1. - low * .6);
  } else {
    // A polished black circuit floor in perspective that reflects the void
    // and carries etched traces lit by the pool of light under the core.
    float dy = uv.y - horiz;
    float zf = .32 / (dy + .018);
    float xf = (uv.x - .5) * aspect * zf;
    vec2 fq = vec2(xf, zf) * 15.;
    float px = (.32 / ((dy + .018) * (dy + .018)) / v.y) * 15. * 1.4 + 15. / v.y * zf;
    float fade = smoothstep(2.4, 1.0, zf);
    float etch = pcbEtch(fq, clamp(px, .02, .6)) * fade;
    float etch2 = pcbEtch(fq * 2. + vec2(3.3, 1.1), clamp(px * 2., .02, .6)) * fade * smoothstep(1.5, .85, zf);
    // Mirror of the wall, blurred with distance from the horizon.
    vec2 m = vec2(uv.x, horiz - dy * .85);
    col = voxelWall(m, aspect) * .6 * (1. - smoothstep(.0, .35, dy) * .6);
    // The pool of light under the B.
    vec2 pool = (uv - vec2(.52, horiz + .17)) * vec2(aspect * 1.3, 3.4);
    float lp = exp(-dot(pool, pool) * 2.2);
    float lpWide = exp(-dot(pool, pool) * .55);
    col += vec3(.02, .004, .03) * lp + vec3(.003, .005, .016) * lpWide;
    vec3 tc = mix(vec3(.12, .35, 1.1), vec3(1.0, .18, .75), smoothstep(.35, .7, uv.x + (uv.y - horiz) * .4));
    col += tc * (etch * .085 + etch2 * .03) * (lp * 1.6 + lpWide * .1);
    // Light catching the floor's sheen near the horizon.
    col += vec3(.008, .007, .024) * exp(-dy / .03);
  }
  // The horizon: a fine line of light, hot under the B and fading out.
  float hl = exp(-abs(uv.y - horiz) * v.y / 1.4);
  float hx = exp(-pow((uv.x - .52) * aspect / .62, 2.));
  col += mix(vec3(.10, .28, .9), vec3(.9, .2, .75), smoothstep(.3, .75, uv.x)) * hl * (.06 + .3 * hx);
  col += vec3(.008, .006, .028) * exp(-abs(uv.y - horiz) / .03) * hx;

  vec2 lock = (p - vec2(115., 36.)) / vec2(240., 95.);
  col *= 1. - .6 * exp(-dot(lock, lock));
  vec2 vig = (uv - .5) * vec2(1.06, 1.12);
  col *= 1. - .5 * smoothstep(.32, 1., length(vig));
  return spaceTone(col * 1.25);
}

// ---------------------------------------------------------------------------
// Stage 4: Daylight paper gallery (Reeded glass B). The same warm paper as the
// page, now lit like a photograph: a tall window throws soft panes of sun
// across the wall from the left, foliage outside dapples the upper right, and
// the paper sweeps into a seamless floor.
// ---------------------------------------------------------------------------
vec3 paperStageColor(vec2 p) {
  vec2 v = max(spaceView, vec2(1.));
  vec2 uv = p / v;
  float aspect = v.x / v.y;
  float t = length((uv - vec2(.36, .26)) / vec2(.64, .74)) * .7071;
  vec3 c = mix(vec3(.984, .976, .945), vec3(.937, .925, .886), clamp(t / .43, 0., 1.));
  c = mix(c, vec3(.867, .867, .824), clamp((t - .43) / .35, 0., 1.));
  c = mix(c, vec3(.784, .788, .737), clamp((t - .78) / .34, 0., 1.));
  float diag = uv.x * .899 + uv.y * .438;
  c = mix(c, vec3(1., .996, .953), smoothstep(.16, .26, diag) * (1. - smoothstep(.26, .45, diag)) * .24);

  vec2 q = vec2((uv.x - .5) * aspect, uv.y);
  // Window light: three tall panes leaning with the low sun, crossed by a
  // transom, softened with distance from the window.
  float x = q.x + q.y * .5 + .02;
  float panes = 0.;
  for (int i = 0; i < 3; i++) {
    float cx = (-.46 + float(i) * .11) * max(aspect, .7);
    float pen = .012 + .03 * uv.y;
    panes += smoothstep(pen, -pen, abs(x - cx) - .0425 * max(aspect, .7));
  }
  float transom = smoothstep(.0, .012, abs(fract(q.y * 2.4 + .62) - .5) - .016);
  float sill = smoothstep(.82, .42, uv.y) * smoothstep(.1, .3, uv.y);
  c += vec3(.06, .05, .022) * panes * transom * sill;
  c *= 1. - .035 * (1. - panes) * sill * smoothstep(.2, -.3, q.x);

  // Dappled foliage shadow drifting in from the upper right.
  vec2 lq = q * vec2(12., 14.) + vec2(1.7, .3);
  float leaves = sFbm(lq + .8 * vec2(sNoise(lq * 2.3), sNoise(lq * 2.3 + 5.2)));
  float dapple = smoothstep(.5, .6, leaves) * smoothstep(.1, .5, uv.x - .45) * smoothstep(.5, .05, uv.y);
  c *= 1. - .04 * dapple;

  // The seamless sweep: the wall bends into the floor with a soft cove.
  float horiz = mix(.77, .8, clamp((1.05 - aspect) / .55, 0., 1.));
  float cove = smoothstep(horiz - .14, horiz + .03, uv.y);
  c *= 1. - .045 * cove * (1. - cove) * 4.;
  c = mix(c, c * vec3(1.02, 1.015, 1.0), smoothstep(horiz, 1., uv.y) * .8);

  // Paper fibre.
  float fibre = sNoise(p * vec2(.9, .22)) * .6 + sNoise(p * .55) * .4;
  c *= .992 + .016 * fibre;
  return clamp(c, 0., 1.);
}

// ---------------------------------------------------------------------------
// Stage 5: Painted canvas atelier (Plush Fur B). A hand-mottled portrait
// backdrop in slate teal, the complement of the copper coat, lit by a soft
// spotlight behind the sculpture and falling away to umber at the edges.
// ---------------------------------------------------------------------------
vec3 atelierStageColor(vec2 p) {
  vec2 v = max(spaceView, vec2(1.));
  vec2 uv = p / v;
  float aspect = v.x / v.y;
  vec2 q = vec2((uv.x - .5) * aspect, uv.y - .46);
  // Broad mottling with brushy, slightly diagonal strokes.
  vec2 bq = mat2(.94, -.34, .34, .94) * q;
  float m1 = sFbm(bq * vec2(2.2, 3.1) + 3.7);
  float m2 = sFbm(bq * vec2(5.5, 8.) + m1 * 1.4 + 9.1);
  float strokes = sNoise(bq * vec2(26., 3.2) + m2 * 3.);
  vec3 deep = vec3(.055, .085, .09), mid = vec3(.15, .22, .215), light = vec3(.32, .40, .37);
  vec3 c = mix(deep, mid, smoothstep(.28, .7, m1));
  c = mix(c, light, smoothstep(.52, .86, m2) * .42 * smoothstep(.3, .75, m1));
  c *= .94 + .1 * strokes;
  // A warm umber bloom in the low corners, like old varnish.
  c = mix(c, vec3(.11, .075, .05), smoothstep(.55, 1.2, length(q * vec2(.8, 1.3))) * .55);
  // Spotlight behind the sculpture.
  vec2 sq = (q - vec2(.02, -.02)) * vec2(1., 1.15);
  float spot = exp(-dot(sq, sq) * 3.2);
  c *= .42 + 1.05 * spot;
  c += vec3(.03, .04, .035) * spot * spot;
  // Seamless floor: the canvas drapes forward and darkens under the sculpture.
  float floorT = smoothstep(.72, .98, uv.y);
  c *= 1. - .25 * floorT;
  // Canvas weave.
  vec2 wv = p * .9;
  float weave = (sin(wv.x * 3.1) * sin(wv.y * 3.1)) * .5 + .5;
  c *= .985 + .03 * weave * (.6 + .4 * sNoise(p * .08));
  // Keep the wordmark corner calm.
  vec2 lock = (p - vec2(115., 36.)) / vec2(240., 95.);
  c *= 1. - .35 * exp(-dot(lock, lock));
  vec2 vig = (uv - .5) * vec2(1.05, 1.1);
  c *= 1. - .45 * smoothstep(.35, 1., length(vig));
  return clamp(c, 0., 1.);
}

vec3 stageColor(vec2 p, float mode) {
  if (mode > 4.5) return atelierStageColor(p);
  if (mode > 3.5) return paperStageColor(p);
  if (mode > 2.5) return voxelStageColor(p);
  if (mode > 1.5) return louverStageColor(p);
  return spaceColor(p);
}
`;

const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`;
const frag = `precision highp float;
${SPACE}
uniform vec2 res;
uniform float scale, pad, stageMode;
void main() {
  vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 css = px / scale - pad;
  vec3 c = stageColor(css, stageMode);
  // Dither smooth gradients so they never band.
  c += (sHash(px + 7.31) - .5) / 255.;
  gl_FragColor = vec4(c, 1.);
}`;

// The layer is oversized by PAD on every side so it can drift with the pointer.
export const SPACE_PAD = 28;

export function createSpace(before, { software = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'space';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const prog = program(gl, vert, frag);
  if (!prog) return null;
  before.before(canvas);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  const u = name => gl.getUniformLocation(prog, name);

  let view = [1, 1], ratio = 1, dirty = true, mode = 0;
  function paint() {
    if (!mode || !dirty || view[0] < 2 || gl.isContextLost()) return;
    dirty = false;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(u('res'), canvas.width, canvas.height);
    gl.uniform2f(u('spaceView'), view[0], view[1]);
    gl.uniform1f(u('scale'), ratio);
    gl.uniform1f(u('pad'), SPACE_PAD);
    gl.uniform1f(u('stageMode'), mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  canvas.addEventListener('webglcontextrestored', () => { dirty = true; paint(); });

  return {
    canvas,
    get view() { return view; },
    resize(w, h, pixelRatio) {
      // Software rasterisers paint once at CSS resolution.
      ratio = software ? 1 : Math.min(2, pixelRatio);
      view = [w, h];
      const cw = Math.max(1, Math.round((w + SPACE_PAD * 2) * ratio));
      const ch = Math.max(1, Math.round((h + SPACE_PAD * 2) * ratio));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      dirty = true;
      paint();
    },
    // Mode: 0 = off (CSS paper), 1 = deep space, 2 = louver studio, 3 = quantum PCB studio,
    // 4 = daylight paper gallery, 5 = painted canvas atelier.
    activate(next) {
      const m = typeof next === 'number' ? next : (next ? 1 : 0);
      if (m !== mode) {
        mode = m;
        if (mode) dirty = true;
      }
      paint();
    },
  };
}
