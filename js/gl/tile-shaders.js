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
 * Shared uniforms: uRes (px), uTime, uSeed, uBg/uA/uB/uC (palette, 0..1 rgb), uDensity, uHue (radians), uTex.
 * Each shader defines  vec3 art(vec2 uv, vec2 fc)  where uv is centred, aspect-correct (-.5..+.5 on the short side).
 */
import { GLSL } from './gl.js?v=mv54zinu';

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
};

export const SHADERS = Object.fromEntries(Object.entries(ART).map(([k, src]) => [k, PRELUDE + src + MAIN]));
export const NEEDS_TEXTURE = new Set(['type']);
