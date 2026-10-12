/**
 * tile-shaders.js — the artwork library. Every tile, card and panel on the site is painted by one of these
 * fragment shaders (rendered by js/gl/tiles.js). Use with  <canvas data-module="art" data-art="NAME">.
 *
 *   chrome   liquid chrome surface, studio-lit
 *   silk     iridescent folded silk (thin-film colour)
 *   dither   a slowly turning 3D form rendered as 1-bit ordered dither
 *   glass    light caustics through rippled glass, chromatic edges
 *   type     kinetic type: rows of text, warped and chromatically split   (data-text="WORD")
 *   scan     vertical light-streak "slit-scan" field
 *   contour  topographic contour lines of a drifting field
 *   gyro     machined chrome gyroscope rings (ray-marched)
 *   aurora   soft domain-warped gradient with film grain
 *
 * SPECIMENS — the small artwork panels: precise 2D studies in hairline and dot matrix, one ink + one accent (uC):
 *   isolines  terrain contours + the route to a target      lattice   drifting plan cells, hatched, one lit
 *   moire     two interfering ring fields                    halftone  weather as a rotated dot screen
 *   globe     turning dot-matrix sphere with orbits          flow      two streams pinched into one channel
 *   rings     segmented dials at their own speeds            spectrum  live column analyser
 *   ridges    stacked waveforms occluding each other         streaks   lines leaving from one point
 *
 * Shared uniforms: uRes (px), uTime, uSeed, uBg/uA/uB/uC (palette, 0..1 rgb), uDensity, uHue (radians), uTex.
 * Each shader defines  vec3 art(vec2 uv, vec2 fc)  where uv is centred, aspect-correct (-.5..+.5 on the short side).
 */
import { GLSL } from './gl.js?v=mv58cl40';

const PRELUDE = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uSeed; uniform float uDensity; uniform float uHue;
uniform vec3 uBg; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform sampler2D uTex;
#define TAU 6.2831853
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
${GLSL.noise}${GLSL.tone}${GLSL.studio}
vec3 hueShift(vec3 c, float a){            // rotate hue in YIQ space
  const mat3 toY = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312);
  const mat3 toR = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703);
  vec3 y = toY * c; float h = atan(y.z, y.y) + a, ch = length(y.yz);
  return toR * vec3(y.x, ch * cos(h), ch * sin(h));
}
vec3 film(float c, float shift){ return .5 + .5 * cos(TAU * (c * 1.6 + shift) + vec3(0., 2.1, 4.2)); }
float PX(){ return 1. / min(uRes.x, uRes.y); }                     // one pixel, in uv units
// anti-aliased hairline at every integer of k (w = width in px)
float iso(float k, float w){ float d = abs(fract(k + .5) - .5) / max(fwidth(k), 1e-5); return 1. - smoothstep(w * .5 - .5, w * .5 + .5, d); }
float discAA(float d, float r){ return 1. - smoothstep(r - PX() * .7, r + PX() * .7, d); }
float ringAA(vec2 uv, vec2 c, float r, float w){ return 1. - smoothstep(w * .5 - .5, w * .5 + .5, abs(length(uv - c) - r) / PX()); }
`;

const MAIN = `
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / min(uRes.x, uRes.y);
  vec3 c = art(uv, fc);
  if (uHue != 0.) c = hueShift(c, uHue);
  c += (hash(fc + fract(uTime) * 91.7) - .5) * .028;            // fine film grain
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`;

const ART = {
  /* ---------------------------------------------------------------- liquid chrome */
  chrome: `
float hgt(vec2 p, float t){
  return sin(p.x * 1.2 + sin(p.y * 1.05 + t) * 1.3) * cos(p.y * 1.1 + sin(p.x * .85 - t * .8) * 1.5) + .3 * sin((p.x + p.y) * 1.9 + t * 1.3);
}
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .22 + uSeed;
  vec2 p = uv * 2.6 * uDensity + uSeed * 3.1;
  float e = .01, h0 = hgt(p, t);
  vec3 n = normalize(vec3(h0 - hgt(p + vec2(e, 0.), t), h0 - hgt(p + vec2(0., e), t), e * 1.1));
  vec3 r = reflect(vec3(0., 0., -1.), n);
  vec3 env = studio(normalize(vec3(r.x, r.y * .9 + .25, -r.z)));
  vec3 col = pow(env * .8, vec3(1.25)) * mix(vec3(1.), uA, .35);
  col += uC * pow(1. - n.z, 4.) * 1.2;                          // accent caught in the steep folds
  col = mix(uBg, col, .92);
  return toSRGB(aces(col * .9));
}`,

  /* ---------------------------------------------------------------- iridescent silk */
  silk: `
float folds(vec2 p, float t){ return sin(p.x * 2.2 + sin(p.y * 1.6 + t) * 1.8 + sin(p.y * .7 - p.x * .5 + t * .6) * 2.4); }
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .35 + uSeed;
  vec2 p = (uv * rot(.5 + uSeed)) * 2.4 * uDensity;
  float e = .01, f = folds(p, t);
  vec3 n = normalize(vec3((f - folds(p + vec2(e, 0.), t)) / e, (f - folds(p + vec2(0., e), t)) / e, 3.));
  vec3 L = normalize(vec3(-.4, .6, .7));
  float dif = clamp(dot(n, L), 0., 1.), spec = pow(clamp(dot(reflect(-L, n), vec3(0., 0., 1.)), 0., 1.), 24.);
  vec3 irid = film(n.z * .8 + f * .15, uSeed * .1);
  vec3 col = mix(uBg, uA, .25 + .6 * dif);
  col = mix(col, irid * mix(uA, vec3(1.), .55), clamp(.3 * (1. - n.z) * 4., 0., .45));
  col += spec * mix(uB, vec3(1.), .6) * .9;
  return clamp(col, 0., 1.);
}`,

  /* ---------------------------------------------------------------- 1-bit dithered 3D form */
  dither: `
float bay2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bay4(vec2 a){ return bay2(.5 * a) * .25 + bay2(a); }
float bay8(vec2 a){ return bay4(.5 * a) * .25 + bay2(a); }
float sdf(vec3 p, float t){
  p.yz *= rot(1.05); p.xz *= rot(t * .45); p.xy *= rot(sin(t * .3) * .5);
  vec2 q = vec2(length(p.xz) - .62, p.y);                        // torus...
  float tor = length(q) - .24;
  float wob = .05 * sin(p.x * 7. + t * 2.) * sin(p.y * 6.) * sin(p.z * 5. - t);
  return tor + wob;
}
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .6 + uSeed;
  vec3 ro = vec3(0., 0., 2.2), rd = normalize(vec3(uv * 1.15, -1.4));
  float d = 0., hit = 0.;
  for (int i = 0; i < 56; i++){ float s = sdf(ro + rd * d, t); if (s < .002){ hit = 1.; break; } d += s * .9; if (d > 5.) break; }
  float lum = 0.;
  if (hit > .5){
    vec3 p = ro + rd * d; vec2 e = vec2(.002, 0.);
    vec3 n = normalize(vec3(sdf(p + e.xyy, t) - sdf(p - e.xyy, t), sdf(p + e.yxy, t) - sdf(p - e.yxy, t), sdf(p + e.yyx, t) - sdf(p - e.yyx, t)));
    lum = clamp(dot(n, normalize(vec3(-.5, .7, .6))), 0., 1.) * .85 + .1 + pow(1. - abs(n.z), 3.) * .3;
  } else lum = .06 + .1 * (1. - length(uv));
  float cell = max(2., floor(min(uRes.x, uRes.y) / 150.)) / uDensity;
  float on = step(bay8(fc / cell), lum);
  return mix(uBg, uA, on);
}`,

  /* ---------------------------------------------------------------- glass caustics */
  glass: `
float caustic(vec2 uv, float t){
  vec2 p = mod(uv * TAU, TAU) - 250.;
  vec2 i = p; float c = 1., inten = .005;
  for (int n = 0; n < 5; n++){
    float tt = t * (1. - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.);
}
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .35 + uSeed * 7.;
  vec2 p = uv * .9 * uDensity + uSeed;
  vec2 w = vec2(fbm(vec3(p * 2., t * .2)), fbm(vec3(p * 2. + 4., t * .2))) * .12;  // glass ripple
  float r = caustic(p + w + vec2(.004, 0.), t), g = caustic(p + w, t), b = caustic(p + w - vec2(.004, 0.), t);
  vec3 col = mix(uBg, uA, .35 + .4 * smoothstep(-.7, .7, uv.y));
  col += vec3(r, g, b) * mix(uB, vec3(1.), .4) * 1.1;
  col += uC * smoothstep(.75, .0, length(uv - vec2(.25, .3))) * .15;
  return clamp(col, 0., 1.);
}`,

  /* ---------------------------------------------------------------- kinetic type */
  type: `
float tx(vec2 q){ return texture2D(uTex, fract(q)).r; }
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .25 + uSeed;
  vec2 q = fc / uRes;
  float rows = 4.0 * uDensity;
  float row = floor(q.y * rows);
  float dir = mod(row, 2.) * 2. - 1.;
  vec2 s = vec2(q.x * .9 + t * .35 * dir + row * .37, q.y * rows);
  s.x += sin(q.y * 9. + t * 3.) * .025 + sin(q.x * 6. - t * 2.) * .01;   // warp
  float split = .006 + .004 * sin(t * 2.);
  float r = tx(vec2(s.x + split, s.y) / vec2(1., 1.)), g = tx(s), b = tx(vec2(s.x - split, s.y));
  vec3 ink = vec3(r, g, b);
  vec3 col = mix(uBg, uA, ink);
  col = mix(col, uC, smoothstep(.0, 1., ink.r - ink.b) * .8);
  return col;
}`,

  /* ---------------------------------------------------------------- slit-scan light streaks */
  scan: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .4 + uSeed;
  vec2 q = fc / uRes;
  float cols = 34. * uDensity;
  float id = floor(q.x * cols), f = fract(q.x * cols);
  float ph = vnoise(vec3(id * .23, t * .6, uSeed)) * 6.2831;
  float centre = .5 + .32 * sin(ph + t);
  float band = exp(-pow((q.y - centre) * (5. + 3. * sin(id * .7)), 2.));
  vec3 grad = mix(uA, uC, smoothstep(.0, 1., q.y + .2 * sin(t + id * .2)));
  float edge = smoothstep(.0, .12, f) * smoothstep(1., .88, f);
  vec3 col = uBg + grad * band * (.55 + .45 * edge) * 1.4;
  col += vec3(1.) * pow(band, 18.) * .6 * edge;
  float r = exp(-pow((q.y - centre - .01) * 7., 2.)), b = exp(-pow((q.y - centre + .01) * 7., 2.));
  col += vec3(r, 0., b) * .08;
  return clamp(col, 0., 1.);
}`,

  /* ---------------------------------------------------------------- topographic contours */
  contour: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .06 + uSeed;
  vec2 p = uv * 1.8 * uDensity + uSeed * 2.;
  float f = fbm(vec3(p * .8, t));
  float k = f * 15.;
  float line = abs(fract(k) - .5) / fwidth(k);
  float l = 1. - smoothstep(.0, 1.2, line);
  float major = 1. - smoothstep(.0, 1.4, abs(fract(f * 2.75) - .5) / fwidth(f * 2.75));
  vec3 col = uBg;
  col = mix(col, uA * .55 + uBg * .45, l * .55);
  col = mix(col, uA, major * .9);
  float sweep = smoothstep(.12, .0, abs(fract(f * 2. - uTime * .05) - .5));
  col = mix(col, uC, sweep * l * .9);
  return col;
}`,

  /* ---------------------------------------------------------------- machined chrome gyroscope */
  gyro: `
float ring(vec3 p, float R, float r, float w){ vec2 q = vec2(length(p.xz) - R, p.y); q = abs(q) - vec2(r, w); return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - .012; }
vec2 map(vec3 p, float t){
  vec3 a = p; a.yz *= rot(t * .7); a.xy *= rot(.4);
  vec3 b = p; b.xy *= rot(t * .5 + 1.); b.yz *= rot(1.2);
  vec3 c = p; c.xz *= rot(-t * .4); c.yz *= rot(t * .9 + 2.);
  float d1 = ring(a, .78, .06, .05), d2 = ring(b, .6, .05, .045), d3 = ring(c, .43, .045, .04);
  float core = length(p) - .16;
  vec2 m = vec2(d1, 1.);
  if (d2 < m.x) m = vec2(d2, 2.);
  if (d3 < m.x) m = vec2(d3, 3.);
  if (core < m.x) m = vec2(core, 4.);
  return m;
}
vec3 shadeGyro(vec3 p, float id, vec3 rd, float t){
  vec2 e = vec2(.0015, 0.);
  vec3 n = normalize(vec3(map(p + e.xyy, t).x - map(p - e.xyy, t).x, map(p + e.yxy, t).x - map(p - e.yxy, t).x, map(p + e.yyx, t).x - map(p - e.yyx, t).x));
  float fr = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 env = studio(reflect(rd, n));
  vec3 col = env * (id > 3.5 ? uC * 1.4 : mix(vec3(.93), uA, abs(id - 2.) < .5 ? .55 : .12)) * (.85 + fr);
  if (id > 3.5) col += uC * .6;
  return toSRGB(aces(col));
}
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .5 + uSeed;
  vec3 ro = vec3(0., .15, 2.5), rd = normalize(vec3(uv * 1.05, -1.4)); rd.yz *= rot(-.06);
  vec3 bg = mix(uBg, uBg * 1.35 + .03, smoothstep(.7, -.5, uv.y));
  // anti-aliasing: closest approach of the ray to the rings, in pixels (pixel footprint grows with distance)
  float pix = 1.05 / (min(uRes.x, uRes.y) * 1.4);
  float d = 1.2, bestR = 1e9, bestD = 0.; vec2 h = vec2(1.); bool hit = false;
  for (int i = 0; i < 90; i++){
    h = map(ro + rd * d, t);
    float ratio = h.x / (pix * d);
    if (ratio < bestR){ bestR = ratio; bestD = d; }
    if (h.x < .0006 * d){ hit = true; break; }
    if (d > 4.) break;
    d += h.x * .9;
  }
  float cover = hit ? 1. : 1. - smoothstep(0., 1.5, bestR);
  if (cover <= 0.) return bg;
  float dd = hit ? d : bestD;
  vec3 p = ro + rd * dd;
  return mix(bg, shadeGyro(p, hit ? h.y : map(p, t).y, rd, t), cover);
}`,

  /* ---------------------------------------------------------------- aurora gradient */
  aurora: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .07 + uSeed;
  vec2 p = uv * .9 * uDensity;
  vec2 w = vec2(fbm(vec3(p * 1.2, t)), fbm(vec3(p * 1.2 + 3.1, t)));
  float f = fbm(vec3(p * 1.1 + w * 2.2, t * 1.3));
  vec3 col = mix(uBg, uA, smoothstep(.3, .7, f));
  col = mix(col, uB, smoothstep(.45, .75, w.x) * smoothstep(.35, .6, f) * .85);
  col = mix(col, uC, pow(smoothstep(.5, .8, f * w.y * 1.9), 2.) * .9);
  float light = smoothstep(.9, .0, length(uv - vec2(-.3 + .2 * sin(t * 2.), .35)));
  return col + light * .12;
}`,

  /* =============================================================================================================
     SPECIMENS — precise 2D generative studies: hairlines and dot matrices in one ink, one accent (uC).
     Used for every small artwork panel (capabilities, statement, approach, bento). uB = secondary/grid ink.
     ============================================================================================================ */

  /* ---------------------------------------------------------------- isolines: a terrain with the route to a target */
  isolines: `
float fieldI(vec2 uv, float t){ vec2 d = uv - vec2(.16, .08), p = uv * 1.6 * uDensity; return vnoise(vec3(p, t)) * .75 + vnoise(vec3(p * 2.1 + 3., t)) * .25 - .45 * exp(-dot(d, d) * 12.); }
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .035 + uSeed;
  float f = fieldI(uv, t), ft = fieldI(vec2(.16, .08), t);
  vec3 col = uBg;
  col = mix(col, uB, iso(f * 24., 1.) * .45);
  col = mix(col, uA, iso(f * 6., 1.1) * .75);
  float path = 1. - smoothstep(.7, 1.7, abs(f - ft - .012) / max(fwidth(f), 1e-5));
  col = mix(col, uC, path * .9);
  col = mix(col, uC, ringAA(uv, vec2(.16, .08), .035, 1.4) + discAA(length(uv - vec2(.16, .08)), .009));
  return col;
}`,

  /* ---------------------------------------------------------------- lattice: drifting cells, hatched and lit, like a plan */
  lattice: `
vec2 h2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
vec2 pt(vec2 c, float t){ return .5 + .4 * sin(t + TAU * h2(c)); }
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .18 + uSeed, S = 4.4 * uDensity, px = PX();
  vec2 x = uv * S + uSeed * 7.3, n = floor(x), f = fract(x), mg, mr; float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j)), r = g + pt(n + g, t) - f; float d = dot(r, r);
    if (d < md){ md = d; mr = r; mg = g; }
  }
  md = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){
    vec2 g = mg + vec2(float(i), float(j)), r = g + pt(n + g, t) - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(.5 * (mr + r), normalize(r - mr)));
  }
  float hc = h2(n + mg + 17.31).x;
  vec3 col = uBg;
  if (hc > .96) col = mix(col, uC, .9);
  else if (hc > .66) col = mix(col, uB, iso(dot(fc, vec2(.7071)) / 7., 1.) * .45);    // hatched cells
  col = mix(col, uA, discAA(length(mr) / S, 1.8 * px) * .8);                          // cell centres
  col = mix(col, uA, (1. - smoothstep(.3, 1.1, md / (S * px))) * .7);                 // walls
  return col;
}`,

  /* ---------------------------------------------------------------- moire: two ring fields interfering; their beats lit */
  moire: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .1 + uSeed;
  vec2 c1 = vec2(sin(t) * .12 - .09, cos(t * .8) * .08), c2 = vec2(cos(t * .7) * .12 + .1, sin(t * .9) * .1);
  float N = 34. * uDensity;
  float a = iso(length(uv - c1) * N, 1.), b = iso(length(uv - c2) * N, 1.);
  vec3 col = mix(uBg, uB, max(a, b) * .7);
  col = mix(col, uA, a * b * .9);                                                  // where the fields agree
  col = mix(col, uC, discAA(length(uv - c1), .012) + discAA(length(uv - c2), .012));
  return col;
}`,

  /* ---------------------------------------------------------------- halftone: weather as a rotated dot screen */
  halftone: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .05 + uSeed, G = 30. * uDensity, ang = .26;
  vec2 q = uv * rot(ang) * G, cell = floor(q) + .5, lp = fract(q) - .5;
  vec2 cu = (cell / G) * rot(-ang);
  float v = smoothstep(.42, .8, fbm(vec3(cu * 2.1 + vec2(t * .7, 0.), t)));
  float r = .42 * sqrt(v), fw = G * PX();
  float d = 1. - smoothstep(r - fw * .6, r + fw * .6, length(lp));
  vec3 ink = v > .85 && hash(cell + uSeed) > .9 ? uC : uA * .85;
  return mix(uBg, ink, d * step(.04, v));
}`,

  /* ---------------------------------------------------------------- globe: a turning dot-matrix sphere with orbits */
  globe: `
float orbit(vec2 uv, float tilt, float rx, float ry){
  vec2 e = uv * rot(tilt), ab = vec2(rx, ry);
  float k = length(e / ab), g = length(e / (ab * ab));
  return abs(k * (k - 1.) / g) / PX();
}
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .12 + uSeed, R = .3 / uDensity, px = PX(), r = length(uv);
  vec3 col = uBg;
  float o1 = orbit(uv, .38, .46, .12), o2 = orbit(uv, -.5, .43, .09);
  float lines = max(1. - smoothstep(.3, 1.1, o1), 1. - smoothstep(.3, 1.1, o2));
  col = mix(col, uB, lines * .9);
  float inside = 1. - smoothstep(R - px, R + px, r);
  col = mix(col, uBg, inside);                                                        // the sphere hides the orbits behind it
  vec3 n = vec3(uv, sqrt(max(R * R - r * r, 0.))) / R;
  vec3 m = n; m.yz *= rot(.35); m.xz *= rot(t);
  float rows = 20., lat = asin(clamp(m.y, -1., 1.));
  float li = floor(lat / 3.1416 * rows + .5), latc = li * 3.1416 / rows;
  float cols = max(1., floor(rows * 2. * cos(latc) + .5));
  float lj = floor(atan(m.z, m.x) / TAU * cols + .5), lonc = lj * TAU / cols;
  vec3 cd = vec3(cos(latc) * cos(lonc), sin(latc), cos(latc) * sin(lonc));
  float angd = acos(clamp(dot(m, cd), -1., 1.));
  float nz = fbm(cd * 2.3 + uSeed);
  float light = clamp(dot(n, normalize(vec3(-.5, .55, .7))), 0., 1.);
  float size = (.3 + .7 * smoothstep(.42, .68, nz)) * (.35 + .65 * light) * .5 * 3.1416 / rows;
  float fw = px / (R * max(n.z, .25)) * .8;
  float dm = (1. - smoothstep(size - fw, size + fw, angd)) * inside * smoothstep(0., .25, n.z);
  col = mix(col, nz > .64 && hash(vec2(li, lj) + uSeed) > .6 ? uC : uA, dm);
  float front = step((uv * rot(.38)).y, 0.) * (1. - smoothstep(.3, 1.1, o1));        // front arc of the main orbit
  col = mix(col, uA, front * .9);
  vec2 sat = vec2(cos(t * 2.3) * .46, sin(t * 2.3) * .12) * rot(-.38);
  col = mix(col, uC, discAA(length(uv - sat), .011) * (sin(t * 2.3) < 0. ? 1. : 1. - inside));
  return col;
}`,

  /* ---------------------------------------------------------------- flow: two streams pinched into one channel */
  flow: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .2 + uSeed;
  float pinch = .3 + .7 * (1. - exp(-uv.x * uv.x * 9.));
  float psi = uv.y / pinch + .05 * sin(uv.x * 7. + t) + .03 * sin(uv.x * 13. - uv.y * 6. - t * 1.3);
  float k = psi * 10. * uDensity;
  vec3 col = mix(uBg, uA, iso(k, 1.) * .6);
  float id = floor(k + .5), h = hash(vec2(id, 4.) + uSeed);
  float seg = step(fract(uv.x * 1.1 - t * .3 + h), .09) * step(.75, h);
  col = mix(col, uC, iso(k, 1.4) * seg);
  float axis = (1. - smoothstep(.3, 1.1, abs(uv.x) / PX())) * step(.5, fract(uv.y * 28.));
  col = mix(col, uB, axis * .6);
  return col;
}`,

  /* ---------------------------------------------------------------- rings: segmented dials turning at their own speeds */
  rings: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .2 + uSeed, px = PX(), B = 16. * uDensity;
  float r = length(uv), a = atan(uv.y, uv.x) / TAU + .5;
  float bi = floor(r * B), fr = fract(r * B) - .5;
  float h1 = hash(vec2(bi, 1.) + uSeed), h2 = hash(vec2(bi, 2.) + uSeed), h3 = hash(vec2(bi, 3.) + uSeed);
  float w = mix(.08, .7, h1 * h1);
  float band = 1. - smoothstep(-.5, .5, (abs(fr) - w * .5) / (B * px));
  float n = floor(mix(2., 46., h2)), duty = mix(.3, .9, h3);
  float s = fract((a + t * (h1 - .5) * .5) * n);
  float edge = min(s, duty - s) / n * TAU * r / px;
  float seg = smoothstep(-.5, .5, edge);
  float on = band * seg * step(.2, h2) * step(1.5, bi) * step(bi, B * .47);
  vec3 col = uBg;
  col = mix(col, uB, ((1. - smoothstep(.3, 1., abs(uv.y) / px)) + (1. - smoothstep(.3, 1., abs(uv.x) / px))) * .3);
  col = mix(col, hash(vec2(bi, 9.) + uSeed) > .93 ? uC : uA * .8, on);
  col = mix(col, uC, discAA(r, .016));
  return col;
}`,

  /* ---------------------------------------------------------------- spectrum: a live column analyser with a reflection */
  spectrum: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .5 + uSeed, px = PX();
  float N = 40. * uDensity, x = (uv.x + .42) / .84 * N;
  float id = floor(x), lx = (fract(x) - .5) * .84 / N;
  float h = .05 + .5 * pow(fbm(vec3(id * .13, t * .35, uSeed)), 1.8) * 1.6;
  float y0 = -.24, inx = step(0., x) * step(x, N);
  float stem = 1. - smoothstep(.6, 1.5, abs(lx) / px);
  float bar = stem * step(y0, uv.y) * step(uv.y, y0 + h) * inx;
  float cap = discAA(length(vec2(lx, uv.y - y0 - h - .02)), 1.9 * px) * inx;
  float refl = stem * step(uv.y, y0 - .012) * step(y0 - .012 - h * .35, uv.y) * inx * .28;
  float lead = step(abs(id - floor(mod(t * 3., N))), .5);
  vec3 col = uBg;
  col = mix(col, uB, iso((uv.y - y0) * 8., 1.) * .35 * step(y0, uv.y));
  col = mix(col, uA, max(bar, refl));
  col = mix(col, lead > .5 ? uC : uA, cap);
  col = mix(col, uA, (1. - smoothstep(.4, 1.2, abs(uv.y - y0 + .006) / px)) * step(abs(uv.x), .44));
  return col;
}`,

  /* ---------------------------------------------------------------- ridges: stacked waveforms hiding one another */
  ridges: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .22 + uSeed;
  vec3 col = uBg;
  float clip = 1. - smoothstep(.43, .44, abs(uv.x));
  for (int i = 0; i < 34; i++){
    float fi = float(i);
    float n = vnoise(vec3(uv.x * 7. * uDensity, fi * .8, t)) * .65 + vnoise(vec3(uv.x * 16. * uDensity, fi * 1.7, t * 1.4)) * .35;
    float y = .36 - fi * .021 + exp(-uv.x * uv.x * 12.) * n * n * .17;
    float dy = uv.y - y;
    col = mix(col, uBg, step(dy, 0.) * clip);
    float ln = (1. - smoothstep(.3, 1.1, abs(dy) / max(fwidth(dy), 1e-5))) * clip;
    col = mix(col, i == 19 ? uC : uA * .8, ln);
  }
  return col;
}`,

  /* ---------------------------------------------------------------- streaks: everything leaving from one point */
  streaks: `
vec3 art(vec2 uv, vec2 fc){
  float t = uTime * .5 + uSeed, px = PX();
  vec2 o = vec2(-.3, -.04), d = uv - o;
  float r = length(d), a = atan(d.y, d.x), N = 150.;
  float k = a / TAU * N, id = floor(k), f = fract(k) - .5;
  float h = hash(vec2(id, 7.) + uSeed), h2 = hash(vec2(id, 3.) + uSeed);
  float head = fract(t * (.12 + h * .2) + h2) * 1.2;
  float len = .04 + .3 * h * h;
  float seg = smoothstep(head - len, head, r) * step(r, head) * step(.3, h2);
  float w = abs(f) / N * TAU * r / px;
  float ln = (1. - smoothstep(.35, 1.1, w)) * seg * smoothstep(.02, .1, r);
  vec3 col = mix(uBg, h > .97 ? uC : uA * .85, ln);
  col = mix(col, uC, ringAA(uv, o, .022, 1.2) + discAA(r, .006));
  return col;
}`,
};

export const SHADERS = Object.fromEntries(Object.entries(ART).map(([k, src]) => [k, PRELUDE + src + MAIN]));
export const NEEDS_TEXTURE = new Set(['type']);
