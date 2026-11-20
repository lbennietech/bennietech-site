// The calm glass B, drawn on the GPU as an optically ray-traced crystal block.
//
// Performance & Optical Architecture:
//   1. A one-time startup pass bakes the HDR architectural studio lighting rig
//      (gradated window softbox with architectural transom mullions, cool rim
//      strips, negative-fill black flags, bounce cards, and diamond catchlight
//      strobes) into a mipmapped square-root Reinhard-HDR cubemap.
//   2. Both halves of the B are convex combinations of planes and a single
//      semicircular barrel, so internal ray exits and light-piping paths are
//      solved analytically in closed form (zero bisection loops).
//   3. The crystal shader uses a flat, single-instance ray pipeline (one shade()
//      and one evalExit() call site — zero recursive/multi-branch shader inlining),
//      keeping register pressure and JIT compile times minimal on low-spec GPUs
//      and software rasterisers.
//   4. Separate lightweight programs draw the extruded crystal halves vs. the
//      ground caustics, halo, and filament.
//   5. Optical features: true Fe2+ architectural float-glass emerald-teal edge
//      absorption, diamond-ground & satin-buffed perimeter edges with twin 45-deg
//      polished arris bevels, longitudinal wheel-grinding striations, internal
//      optical crease, translucent sea-glass subsurface scatter & micro-crystal
//      flecks, 5-wavelength CIE-normalized Cauchy spectral dispersion, smooth
//      internal Fresnel critical-angle transitions, internal reed-underside
//      reflections gleaming through the walls, cylindrical-lens reed caustics
//      and fiber-optic kerf light-piping, interactive cursor kicker light,
//      Michels-Levy photoelastic shockwaves, and live additive floor caustics.
import { program } from './gl/gl.js';

const vertex = `
attribute vec3 position;
attribute float across;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift, shift, ground;
uniform vec4 shadow;
varying vec3 plate;
varying float side;
void main() {
  plate = position;
  side = across;
  if (ground > .5) {
    vec2 clip = (shadow.xy + position.xy * shadow.zw - box.xy) / box.zw * 2. - 1.;
    gl_Position = vec4(clip.x, -clip.y, .99, 1.);
    return;
  }
  vec3 q = vec3(position.x - .56, position.y - .845 + lift + shift, position.z);
  vec2 screen = centre + size * vec2(dot(row1, q), dot(row2, q));
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, dot(row3, q) * .25, 1.);
}`;

const cubeVert = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = p;
  gl_Position = vec4(p, 0., 1.);
}`;

const STUDIO_LIGHTS = [
  // [centre, half-extent, softness, colour*intensity, gradientDir, mullionFlag]
  // 1. Hero tall architectural window softbox on the left (warm ivory core + transom mullions)
  [[-3.65, .30, -1.35], [.82, 1.60], .18, [7.6, 7.35, 6.80], [-.38, -.45], 1],
  // 2. Crisp cool-silver front-right vertical strip for opposing reed shoulders
  [[2.30, .70, -3.08], [.12, 1.80], .040, [3.35, 3.56, 3.82], [.4, -.2], 0],
  // 3. Bright cool-daylight rim strip behind-right sweeping the curved barrels
  [[3.10, -.36, 2.30], [.19, 2.50], .055, [4.05, 4.38, 4.72], [.5, -.3], 0],
  // 4. Overhead clerestory bar catching the flat top ledge & upper bevels
  [[-1.48, -3.28, -1.10], [1.62, .175], .048, [3.35, 3.42, 3.32], [0, -.6], 0],
  // 5. Rear-left precision backlight kicker (ignites left-reed spectral fire)
  [[-1.20, -.26, 2.70], [.065, 2.45], .030, [4.10, 4.08, 3.92], [-.3, 0], 0],
  // 6. Rear-right precision backlight kicker (ignites right-bowl prism edge)
  [[1.40, -.26, 2.70], [.055, 2.45], .028, [2.85, 2.98, 3.16], [.3, 0], 0],
  // 7. Rear-overhead crown bar illuminating back chamfers & top edges
  [[-.10, -1.80, 2.90], [1.70, .095], .040, [3.45, 3.48, 3.38], [0, -.5], 0],
  // 8. Pinpoint HDR diamond catchlight strobe (front-upper-left, sparks chamfer glints)
  [[-2.12, -1.52, -2.82], [.105, .155], .030, [19.5, 19.2, 18.0], [-.2, -.4], 0],
  // 9. Secondary pinpoint cool-crystal catchlight (upper-right barrel & bevel glint)
  [[2.42, -1.25, -2.38], [.090, .135], .028, [16.0, 17.4, 19.2], [.3, -.3], 0],
  // 10. Lower-right prism accent strobe (feeds fiery spectral dispersion off lower curved bowl)
  [[2.08, 1.42, 2.22], [.12, .38], .038, [10.4, 10.9, 11.7], [.4, .3], 0],
].map(([at, extent, soft, colour, grad, mullion]) => {
  const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = unit(at.map(x => -x)), u = unit(cross([0, 1, 0], n)), v = cross(n, u);
  const f = x => (+x.toFixed(5)).toString().replace(/^(-?)0\./, '$1.').replace(/^(-?\d+)$/, '$1.');
  const vec = (k, a) => `vec${k}(${a.map(f).join(', ')})`;
  return `  c += ${vec(3, colour)} * panel(d, ${vec(3, at)}, ${vec(3, n)}, ${vec(3, u)}, ${vec(3, v)}, ${vec(2, extent)}, ${f(soft)}, ${vec(2, grad)}, ${f(mullion)});`;
}).join('\n');

const cubeFrag = `precision highp float;
varying vec2 uv;
uniform int face;

float panel(vec3 d, vec3 at, vec3 n, vec3 u, vec3 v, vec2 extent, float soft, vec2 gradDir, float mullion) {
  float facing = dot(d, n);
  if (facing > -.001) return 0.;
  float t = dot(at, n) / facing;
  if (t < 0.) return 0.;
  vec3 h = d * t - at;
  vec2 loc = vec2(dot(h, u), dot(h, v));
  vec2 q = abs(loc) - extent;
  float mask = 1. - smoothstep(-soft, soft, length(max(q, 0.)) + min(max(q.x, q.y), 0.));
  if (mask <= 0.) return 0.;
  vec2 rel = clamp(loc / max(extent, vec2(.02)), -1., 1.);
  float silk = clamp(.82 + .34 * dot(rel, gradDir) - .14 * dot(rel, rel), .32, 1.28);
  if (mullion > .5) {
    float bar1 = smoothstep(.025, .056, abs(rel.y + .28));
    float bar2 = smoothstep(.022, .052, abs(rel.y - .38));
    float vBar = smoothstep(.028, .064, abs(rel.x - .18));
    silk *= (.12 + .88 * min(min(bar1, bar2), .38 + .62 * vBar));
  }
  return mask * silk;
}

vec3 sampleStudio(vec3 d) {
  vec3 c = mix(vec3(.130, .142, .135), vec3(.048, .058, .056), smoothstep(0., -.72, d.y));
  c = mix(c, vec3(.009, .016, .016), smoothstep(.36, .78, d.x) * smoothstep(.50, -.26, d.z));
  c = mix(c, vec3(.014, .022, .021), smoothstep(.18, .035, abs(d.y + .34)) * smoothstep(-.12, .56, d.x));
  c = mix(c, vec3(.015, .023, .022), smoothstep(.14, .03, abs(d.x + .34)) * smoothstep(.1, .7, d.z));
  c = mix(c, vec3(.50, .49, .44), smoothstep(-.38, -.84, d.x) * smoothstep(-.75, -.15, d.y));
  c = mix(c, vec3(.55, .54, .49), smoothstep(.08, .62, d.y));
  c += vec3(.07, .112, .125) * smoothstep(.2, .85, -d.y) * smoothstep(-.1, -.75, d.x);
${STUDIO_LIGHTS}
  return c;
}

vec3 faceDir(vec2 st) {
  if (face == 0) return normalize(vec3( 1., -st.y, -st.x));
  if (face == 1) return normalize(vec3(-1., -st.y,  st.x));
  if (face == 2) return normalize(vec3( st.x,  1.,  st.y));
  if (face == 3) return normalize(vec3( st.x, -1., -st.y));
  if (face == 4) return normalize(vec3( st.x, -st.y,  1.));
  return normalize(vec3(-st.x, -st.y, -1.));
}

void main() {
  float e = 1. / 256.;
  vec3 c = (
    sampleStudio(faceDir(uv + vec2(-e * .6, -e * .2))) +
    sampleStudio(faceDir(uv + vec2( e * .6,  e * .2))) +
    sampleStudio(faceDir(uv + vec2(-e * .2,  e * .6))) +
    sampleStudio(faceDir(uv + vec2( e * .2, -e * .6)))
  ) * .25;
  vec3 enc = sqrt(clamp(c / (c + 2.2), 0., .996));
  gl_FragColor = vec4(enc, 1.);
}`;

// Flattened single-instance optical crystal fragment shader (ONLY glass walls & faces).
const glassFrag = `precision highp float;
uniform float kind, part, flute, front, back, pixel, recovery, pulse, lightAngle, intro, glow;
uniform float size, lift, shift, time, quality;
uniform vec2 lightRot, filamentRange, centre, view, pointer;
uniform vec3 row1, row2, row3;
uniform vec4 shadow, shockA, shockB;
uniform sampler2D groundMap;
uniform samplerCube envCube;
varying vec3 plate;
varying float side;

const float ETA = 1.52;
const float INV_ETA = 1. / 1.52;
const float CHAMFER = .016;
const float WALL_BEVEL = .028;
const float BACK_CHAMFER = .022;
const float SLOPE = .27875, NORM = .96327;
// Authentic thick architectural float-glass (Fe2+) absorption: strong red
// attenuation with nearly equal emerald + cyan-blue transmission so thick
// perimeter edges read as deep luminous sea-glass viridian-teal (never olive).
const vec3 ABSORB = vec3(.90, .175, .208);
const vec3 SEA_TEAL = vec3(.048, .38, .38);
const vec3 SEA_AQUA = vec3(.44, .88, .86);
const vec3 LIME = vec3(.42, .76, .048);

vec3 absorb(float L) { return exp(-ABSORB * L * (.54 + .46 * L)); }

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1., 0.)), f.x),
    mix(hash21(i + vec2(0., 1.)), hash21(i + vec2(1., 1.)), f.x),
    f.y
  );
}

float halfRound(vec2 p, float cx, float cy, float r) {
  return length(vec2(max(p.x - cx, 0.), p.y - cy)) - r;
}
float contour(vec2 p) {
  return max(-p.x, min(halfRound(p, .57, .43, .43), halfRound(p, .71, 1.2, .49)));
}
float cutSide(vec2 p) {
  float line = (p.y + SLOPE * p.x) * NORM;
  return part < .5 ? line - .9125 * NORM : 1.0475 * NORM - line;
}
float solid(vec2 p) { return max(contour(p), cutSide(p)); }

vec2 wallNormal(vec2 p, out float cut) {
  float c = cutSide(p);
  float up = halfRound(p, .57, .43, .43), low = halfRound(p, .71, 1.2, .49);
  float rim = min(up, low);
  cut = step(max(-p.x, rim), c);
  if (cut > .5) return vec2(SLOPE, 1.) * NORM * (part < .5 ? 1. : -1.);
  if (-p.x > rim) return vec2(-1., 0.);
  vec2 r = up < low ? vec2(max(p.x - .57, 0.), p.y - .43) : vec2(max(p.x - .71, 0.), p.y - 1.2);
  return r / max(length(r), 1e-5);
}

// Exact closed-form 2D ray exit from an interior point of this convex half-B (zero loops).
float analyticExit(vec2 o, vec2 d, out vec2 nw, out float isCut) {
  float tMin = 1e6;
  nw = vec2(-1., 0.);
  isCut = 0.;
  if (d.x < -1e-6) {
    float t = -o.x / d.x;
    if (t >= 0. && t < tMin) { tMin = t; nw = vec2(-1., 0.); isCut = 0.; }
  }
  if (part < .5) {
    if (d.y < -1e-6) {
      float t = -o.y / d.y;
      if (t >= 0. && t < tMin) { tMin = t; nw = vec2(0., -1.); isCut = 0.; }
    }
  } else {
    if (d.y > 1e-6) {
      float t = (1.69 - o.y) / d.y;
      if (t >= 0. && t < tMin) { tMin = t; nw = vec2(0., 1.); isCut = 0.; }
    }
  }
  float s = part < .5 ? 1. : -1.;
  float intercept = part < .5 ? .9125 : 1.0475;
  float denom = (d.y + SLOPE * d.x) * s;
  if (denom > 1e-6) {
    float t = (intercept - (o.y + SLOPE * o.x)) * s / denom;
    if (t >= 0. && t < tMin) { tMin = t; nw = vec2(SLOPE, 1.) * (NORM * s); isCut = 1.; }
  }
  vec2 cc = part < .5 ? vec2(.57, .43) : vec2(.71, 1.20);
  float r = part < .5 ? .43 : .49;
  vec2 m = o - cc;
  float a = dot(d, d);
  if (a > 1e-10) {
    float b = dot(m, d);
    float c = dot(m, m) - r * r;
    float disc = b * b - a * c;
    if (disc >= 0.) {
      float t = (-b + sqrt(disc)) / a;
      if (t >= 0. && t < tMin) {
        vec2 h = o + d * t;
        if (h.x >= cc.x - 1e-4) {
          tMin = t;
          nw = (h - cc) / r;
          isCut = 0.;
        }
      }
    }
  }
  return tMin;
}

vec3 reedNormal(float x, float soften) {
  float u = fract(x / flute);
  float s = (u * 2. - 1.) * .80;
  if (soften > .001) {
    float g = min(u, 1. - u);
    s *= smoothstep(0., soften, g);
  }
  return vec3(s, 0., sqrt(max(1. - s * s, .05)));
}

vec3 cam(vec3 v) { return vec3(dot(row1, v), dot(row2, v), dot(row3, v)); }
vec3 camAt(vec3 x) { return cam(vec3(x.x - .56, x.y - .845 + lift + shift, x.z)); }

vec3 envLookup(vec3 d, float bias) {
  vec3 rd = vec3(lightRot.x * d.x + lightRot.y * d.z, d.y, -lightRot.y * d.x + lightRot.x * d.z);
  vec3 e = textureCube(envCube, rd, bias).rgb;
  vec3 e2 = e * e;
  return 2.2 * e2 / max(1. - e2, .02);
}

vec3 dynamicLights(vec3 d) {
  vec3 rd = vec3(lightRot.x * d.x + lightRot.y * d.z, d.y, -lightRot.y * d.x + lightRot.x * d.z);
  vec3 add = vec3(0.);
  float pMag = dot(pointer, pointer);
  if (pMag > .002) {
    vec3 kDir = normalize(vec3(pointer.x * 1.38, pointer.y * .95 - .26, -1.12));
    float al = max(dot(d, kDir), 0.);
    float pFade = smoothstep(.002, .10, pMag);
    add += vec3(3.8, 4.0, 3.85) * pow(al, 26.) * pFade * (.80 + .55 * pulse);
    add += vec3(.58, .72, .68) * pow(al, 5.) * pFade * .48;
  }
  float sweep = sin(intro * 3.14159265);
  if (sweep > .002) {
    vec3 at = vec3(-5.5 + 10. * intro, -.6, -2.6);
    vec3 n = normalize(-at);
    float facing = dot(rd, n);
    if (facing < -.001) {
      float t = dot(at, n) / facing;
      if (t > 0.) {
        vec3 u = normalize(cross(vec3(0., 1., 0.), n));
        vec3 v = cross(n, u);
        vec3 h = rd * t - at;
        vec2 q = abs(vec2(dot(h, u), dot(h, v))) - vec2(.3, 3.2);
        float p = 1. - smoothstep(-.14, .14, length(max(q, 0.)) + min(max(q.x, q.y), 0.));
        add += vec3(1., 1., .95) * 12. * sweep * p;
      }
    }
  }
  return add;
}

vec3 paperAt(vec2 s) {
  vec2 uv = s / view;
  float t = length((uv - vec2(.36, .26)) / vec2(.64, .74)) * .7071;
  vec3 c = mix(vec3(.984, .976, .945), vec3(.937, .925, .886), clamp(t * 2.3256, 0., 1.));
  c = mix(c, vec3(.867, .867, .824), clamp((t - .43) * 2.8571, 0., 1.));
  c = mix(c, vec3(.784, .788, .737), clamp((t - .78) * 2.9412, 0., 1.));
  float diag = uv.x * .899 + uv.y * .438 - lightAngle * .18;
  c = mix(c, vec3(1., .996, .953), smoothstep(.16, .26, diag) * (1. - smoothstep(.26, .45, diag)) * .24);
  vec2 g = (s - shadow.xy) / shadow.zw;
  if (max(abs(g.x), abs(g.y)) < 1.) {
    vec4 ink = texture2D(groundMap, vec2(g.x, -g.y) * .5 + .5);
    c = c * (1. - ink.a) + ink.rgb;
  }
  return c * c * (c * .16 + .84);
}

vec3 studioWithPaper(vec3 o, vec3 d, float paperGain, float bias, out float poolOut, out vec3 envOut) {
  vec3 dirP = normalize(d + o * .14);
  envOut = envLookup(dirP, bias);
  vec3 c = envOut + dynamicLights(d);
  poolOut = 0.;
  if (d.z > .02) {
    vec2 wide = d.xy / d.z;
    float wLen = length(wide * vec2(1., .8));
    if (wLen < 1.15) {
      vec2 s = centre + size * (o.xy + wide * (2.4 - o.z));
      float pool = 1. - smoothstep(.16, .74, wLen);
      poolOut = pool;
      vec3 flag = mix(vec3(.042, .052, .050), vec3(.009, .014, .014), smoothstep(.5, 1., length(wide)));
      flag = mix(vec3(.38, .378, .35), flag, smoothstep(-.35, .15, wide.x));
      vec3 baseRoom = mix(c, flag, smoothstep(.32, .62, d.z) * .66);
      c = mix(baseRoom, paperAt(clamp(s, vec2(0.), view)) * paperGain, pool);
    }
  }
  return c;
}

float flow(float x) {
  return 1. + .18 * sin(x * 8.5 - time * 1.10) + .10 * sin(x * 3.7 + time * .62);
}

vec3 satin(vec3 x) {
  float depth = exp(-pow((x.z - .0085) / .19, 2.));
  float along = smoothstep(filamentRange.x - .14, filamentRange.x + .10, x.x)
    * (1. - smoothstep(filamentRange.y - .10, filamentRange.y + .18, x.x));
  return LIME * (1.02 + 1.40 * pulse) * glow * flow(x.x) * (.32 + .68 * depth) * (.28 + .72 * along) + vec3(.012, .022, .009);
}

vec3 echo(vec3 x, vec3 T, float boost) {
  vec3 R = vec3(T.xy, -T.z);
  float line = (x.y + SLOPE * x.x) * NORM;
  float rate = (R.y + SLOPE * R.x) * NORM;
  float t = ((part < .5 ? .9125 : 1.0475) * NORM - line) / (abs(rate) < 1e-4 ? 1e-4 : rate);
  if (t <= 0. || t > (front - x.z) / max(R.z, .02)) return vec3(0.);
  vec3 y = x + R * t;
  if (contour(y.xy) > 0.) return vec3(0.);
  return satin(y) * absorb(t) * (.15 * boost);
}

// Single-site 5-band CIE-normalized Cauchy spectral dispersion on glass exit.
vec3 evalExit(vec3 oCam, vec3 T, vec3 n, float bias, float prismBoost) {
  vec3 g = refract(T, -n, ETA);
  vec3 dg = cam(g);
  float pool = 0.;
  vec3 cG = vec3(0.);
  vec3 base = studioWithPaper(oCam, dg, 1., bias, pool, cG);

  if (quality < .5) return base;

  float cosI = max(dot(T, n), 0.);
  float cosT = max(dot(g, n), .05);
  float sin2I = max(0., 1. - cosI * cosI);
  float splitGate = smoothstep(.03, .28, cosT) * (1. + prismBoost * 1.25);
  vec3 de = cam((T - n * cosI) - n * (ETA * sin2I / max(cosT, .20)));
  float dispMag = length(de) * splitGate;
  if (dispMag < .020) return base;

  vec3 dir0 = normalize(dg + oCam * .14);
  vec3 stepDir = de * (.058 * splitGate);

  vec3 dispAcc = vec3(0.);
  if (quality > 1.5) {
    for (int k = 0; k < 5; k++) {
      float off = k == 0 ? -1.28 : (k == 1 ? -.58 : (k == 2 ? 0. : (k == 3 ? .64 : 1.38)));
      vec3 w = k == 0 ? vec3(.64, .03, .00)
             : (k == 1 ? vec3(.36, .34, .00)
             : (k == 2 ? vec3(.00, .45, .09)
             : (k == 3 ? vec3(.00, .18, .42)
             :           vec3(.00, .00, .49))));
      vec3 sCol = k == 2 ? cG : envLookup(normalize(dir0 + stepDir * off), bias);
      dispAcc += sCol * w;
    }
  } else {
    for (int k = 0; k < 3; k++) {
      float off = k == 0 ? -1.14 : (k == 1 ? 0. : 1.24);
      vec3 w = k == 0 ? vec3(1., 0., 0.) : (k == 1 ? vec3(0., 1., 0.) : vec3(0., 0., 1.));
      vec3 sCol = k == 1 ? cG : envLookup(normalize(dir0 + stepDir * off), bias);
      dispAcc += sCol * w;
    }
  }

  float chromaVis = (1. - pool * .60) + prismBoost * .60;
  float maxSwing = .48 + .58 * prismBoost;
  vec3 chromaDelta = clamp((dispAcc - cG) * chromaVis, -maxSwing, maxSwing);
  return max(vec3(0.), base + chromaDelta);
}

float scatter(vec3 o, vec3 T, float L, float k) {
  float line = (o.y + SLOPE * o.x) * NORM;
  float d0 = abs(line - .98 * NORM);
  float rate = (T.y + SLOPE * T.x) * NORM * (part < .5 ? -1. : 1.);
  float e = k * rate * L;
  float along = abs(e) < .001 ? L : (1. - exp(-e)) / (k * rate);
  float mid = o.x + T.x * L * .5;
  float span = smoothstep(filamentRange.x - .16, filamentRange.x + .12, mid)
    * (1. - smoothstep(filamentRange.y - .12, filamentRange.y + .22, mid));
  return exp(-k * d0) * along * (.3 + .7 * span) * flow(mid);
}

vec3 thinFilmSheen(float ndv, float phaseShift) {
  float opd = 385. * (1.16 - .46 * ndv) + phaseShift;
  vec3 ph = 6.2831853 * opd / vec3(635., 535., 455.);
  return (.5 + .5 * cos(ph)) * vec3(.72, 1.0, .98);
}

vec2 shockwave(vec2 p, vec4 s) {
  if (s.w <= 0. || s.z > 2.2) return vec2(0.);
  vec2 d = p - s.xy;
  float r = length(d);
  float x = (r - s.z * .95) / (.035 + s.z * .05);
  return d / max(r, 1e-4) * x * exp(-x * x) * s.w * exp(-s.z * 1.7) * .74;
}
float stress(vec2 p, vec4 s, out float radialPhase) {
  radialPhase = 0.;
  if (s.w <= 0. || s.z > 2.2) return 0.;
  float r = length(p - s.xy);
  float x = (r - s.z * .95) / (.038 + s.z * .055);
  radialPhase = (r - s.z * .95) * 44.;
  return exp(-x * x) * s.w * exp(-s.z * 1.65);
}

vec3 display(vec3 c) {
  c = max(c, 0.);
  c = mix(c, 1. - .23 * exp(-(c - .77) / .23), step(.77, c));
  vec3 s = sqrt(clamp(c, 0., 1.));
  return s * (1.06 - .06 * s);
}

vec3 faceNormal(vec2 p, vec2 nw, float inside, float grooveSoft) {
  float edge = 1. - smoothstep(CHAMFER * .26, CHAMFER, inside);
  vec3 n = normalize(mix(reedNormal(p.x, grooveSoft), normalize(vec3(nw, 1.)), edge));
  n.xy += shockwave(p, shockA) + shockwave(p, shockB);
  return normalize(n);
}

// Flattened single-call crystal shader supporting both razor-glossy reeded crystal
// faces & twin arris bevels AND diamond-ground satin float-glass perimeter walls.
vec3 shade(vec3 o, vec3 n, float isFace, float edgeFactor, float bias, float wallRough) {
  vec3 V = normalize(row3);
  float ndv = max(-dot(V, n), 0.);
  float om = 1. - ndv;
  float om2 = om * om;
  float fresnel = .042 + .958 * (om2 * om2 * om);

  // 1. Primary mirror/satin reflection (mip-convolved on diamond-ground outer edges!).
  vec3 R = reflect(V, n);
  float refPool;
  vec3 refEnv;
  float refBias = bias * .8 + wallRough * 1.45;
  vec3 reflected = studioWithPaper(camAt(o), cam(R), .62, refBias, refPool, refEnv);
  // Satin-ground glass edges slightly soften extreme mirror reflectance into translucent sheen.
  float effFresnel = fresnel * (1. - wallRough * .38);

  // Precision optical thin-film sheen strictly at grazing Fresnel edges & arris bevels.
  float grazing = om2 * om2 * (.14 + .42 * edgeFactor) * (1. - wallRough * .55);
  vec3 coat = thinFilmSheen(ndv, o.x * 190. + o.y * 95. + lightAngle * 145.);
  reflected += coat * grazing * (.12 + .20 * min(dot(reflected, vec3(.3, .6, .1)), 3.0));

  // Pinpoint diamond-crisp specular glint on polished 45-deg arris bevels & high-HDR reed crests!
  float rLum = dot(reflected, vec3(.28, .60, .12));
  if (edgeFactor > .08) {
    float spark = smoothstep(1.75, 5.6, rLum) * edgeFactor;
    vec3 prismSpark = mix(vec3(1.18, 1.32, 1.28), coat * 1.55, .30);
    reflected += prismSpark * spark * 1.25;
  } else if (isFace > .5 && rLum > 2.6) {
    float crestSpark = smoothstep(2.6, 8.2, rLum);
    reflected += mix(vec3(.82, .90, .86), coat, .25) * crestSpark * .38;
  }

  // 2. Refracted internal ray path (exact analytic exits — zero loops!).
  vec3 T = refract(V, n, INV_ETA);
  vec2 nw;
  float cut;
  float tWall = analyticExit(o.xy, T.xy, nw, cut);
  float tBack = (back - o.z) / min(T.z, -.02);

  float L = 0., extra = 0.;
  bool hasExit = false;
  float exitWeight = 1.;
  vec3 exitPos = o, exitDir = T, exitNorm = vec3(0., 0., -1.);
  float prismBoost = edgeFactor * 1.05 + om * .70 * (1. - wallRough * .65);
  vec3 internalEmit = vec3(0.);

  if (tWall < tBack) {
    L = tWall;
    vec3 x = o + T * L;
    vec3 wn = vec3(nw, 0.);
    if (cut > .5) {
      internalEmit += satin(x) * (isFace > .5 ? 1.18 : 1.42);
    } else {
      vec3 eCheck = refract(T, -wn, ETA);
      if (dot(eCheck, eCheck) > .5) {
        hasExit = true;
        exitPos = x; exitDir = T; exitNorm = wn;
        prismBoost += .92;
      } else {
        vec3 T2 = reflect(T, wn);
        float tB2 = (back - x.z) / min(T2.z, -.02);
        vec2 nw2; float cut2;
        float tW2 = analyticExit(x.xy + T2.xy * .001, T2.xy, nw2, cut2);
        if (tW2 < tB2) {
          extra = tW2;
          vec3 y = x + T2 * tW2;
          if (cut2 > .5) internalEmit += satin(y) * .60;
          else {
            vec3 wn2 = vec3(nw2, 0.);
            vec3 e2 = refract(T2, -wn2, ETA);
            if (dot(e2, e2) > .5) { hasExit = true; exitPos = y; exitDir = T2; exitNorm = wn2; prismBoost += .75; }
            else internalEmit += vec3(.006, .036, .030) + LIME * .045 * glow;
          }
        } else {
          extra = tB2;
          vec3 xb = x + T2 * tB2;
          float bCut; vec2 bNw = wallNormal(xb.xy, bCut);
          float bIn = max(-solid(xb.xy), 0.);
          float bEdge = 1. - smoothstep(BACK_CHAMFER * .22, BACK_CHAMFER, bIn);
          vec3 bn = normalize(vec3(bNw * bEdge * .62, -1.));
          vec3 e2 = refract(T2, -bn, ETA);
          if (dot(e2, e2) > .5) {
            float ct = max(dot(e2, bn), 0.);
            float fInt = .04 + .96 * pow(1. - ct, 5.);
            exitWeight = 1. - smoothstep(.55, .96, fInt);
            hasExit = true; exitPos = xb; exitDir = T2; exitNorm = bn;
            prismBoost += bEdge * 1.15;
            internalEmit += echo(xb, T2, isFace < .5 ? 2.4 : 1.20)
                          + (vec3(.008, .044, .038) + envLookup(cam(reflect(T2, bn)), .9) * .32) * (1. - exitWeight);
          } else {
            vec3 Tp = reflect(T2, bn);
            vec2 nwp; float cutp;
            float lp = analyticExit(xb.xy, Tp.xy, nwp, cutp);
            extra += lp;
            vec3 yp = vec3(xb.xy + Tp.xy * lp, (front + back) * .5);
            if (cutp > .5) internalEmit += satin(yp) * .38;
            else {
              vec3 outP = normalize(vec3(Tp.xy, -abs(Tp.z)));
              vec3 ep = refract(outP, -vec3(nwp, 0.), ETA);
              if (dot(ep, ep) > .5) { hasExit = true; exitPos = yp; exitDir = outP; exitNorm = vec3(nwp, 0.); prismBoost += .60; }
              else internalEmit += vec3(.006, .034, .028) + LIME * .042 * glow;
            }
          }
        }
      }
    }
  } else {
    L = tBack;
    vec3 xb = o + T * L;
    float bCut; vec2 bNw = wallNormal(xb.xy, bCut);
    float bIn = max(-solid(xb.xy), 0.);
    float bEdge = 1. - smoothstep(BACK_CHAMFER * .20, BACK_CHAMFER, bIn);
    vec3 bn = normalize(vec3(bNw * bEdge * .62, -1.));
    vec3 eb = refract(T, -bn, ETA);
    if (dot(eb, eb) > .5) {
      float ct = max(dot(eb, bn), 0.);
      float fInt = .04 + .96 * pow(1. - ct, 5.);
      exitWeight = 1. - smoothstep(.52, .96, fInt);
      hasExit = true;
      exitPos = xb; exitDir = T; exitNorm = bn;
      prismBoost += bEdge * 1.25;
      internalEmit += echo(xb, T, isFace < .5 ? 2.5 : 1.24);

      if (bEdge > .04 || exitWeight < .98) {
        vec3 rb = reflect(T, -bn);
        vec3 bGlint = envLookup(cam(rb), .55);
        internalEmit += bGlint * (bEdge * (.26 + .20 * isFace) + (1. - exitWeight) * .42) * absorb(.26);
      }

      // Multi-bounce internal reed-underside shimmer seen softly inside the outer edges.
      if (isFace < .5 && quality > .5) {
        vec3 Rback = vec3(T.xy, -T.z);
        float tF = (front - back) / max(Rback.z, .08);
        vec3 xf = xb + Rback * tF;
        if (solid(xf.xy) < 0.) {
          float uR = fract(xf.x / flute);
          float ribSlope = abs(uR * 2. - 1.);
          float ribCrest = pow(ribSlope, 2.0);
          vec3 nUnder = reedNormal(xf.x, .05);
          vec3 rUnder = reflect(Rback, -nUnder);
          vec3 ribEnv = envLookup(cam(rUnder), .8 + wallRough * .9);
          float cutD = abs((xf.y + SLOPE * xf.x) * NORM - .98 * NORM);
          vec3 ribKerf = LIME * glow * flow(xf.x) * exp(-cutD * 3.8) * 1.05;
          float bWeight = (.20 + .46 * pow(1. - max(-T.z, 0.), 2.2)) * (1. - wallRough * .35);
          internalEmit += (ribEnv * (.26 + .58 * ribCrest) + ribKerf) * bWeight * absorb(tF * .72);
        }
      }
    } else {
      vec3 Tp = reflect(T, bn);
      vec2 nwp; float cutp;
      float lp = analyticExit(xb.xy, Tp.xy, nwp, cutp);
      extra = lp;
      vec3 yp = vec3(xb.xy + Tp.xy * lp, (front + back) * .5);
      if (cutp > .5) {
        internalEmit += satin(yp) * .42;
      } else {
        vec3 outP = normalize(vec3(Tp.xy, -abs(Tp.z)));
        vec3 ep = refract(outP, -vec3(nwp, 0.), ETA);
        if (dot(ep, ep) > .5) {
          hasExit = true; exitPos = yp; exitDir = outP; exitNorm = vec3(nwp, 0.);
          prismBoost += .72;
        } else {
          internalEmit += vec3(.006, .036, .030) + LIME * .045 * glow;
        }
      }
    }
  }

  vec3 radiance = internalEmit;
  if (hasExit && exitWeight > .01) {
    // Ground outer walls gently soften transmitted light via subtle mip bias while keeping glassy clarity.
    radiance += evalExit(camAt(exitPos), exitDir, exitNorm, bias + wallRough * 1.15, prismBoost) * exitWeight;
  }
  vec3 through = radiance * absorb(L + extra);
  if (isFace < .5) {
    // Deep architectural float-glass viridian-teal thickness absorption along perimeter walls.
    through *= exp(-ABSORB * (.58 + .32 * wallRough));
  }

  vec3 colour = mix(through, reflected, effFresnel);
  // Near the diagonal cut the body glows electric lime; farther out along the thick
  // outer float-glass edges, long-range internal scatter cools naturally into deep sea-teal.
  float cutProx = exp(-abs((o.y + SLOPE * o.x) * NORM - .98 * NORM) * 3.2);
  vec3 deepScatterTint = isFace < .5 ? mix(vec3(.07, .52, .50), LIME, cutProx) : LIME;
  colour += LIME * glow * .94 * scatter(o, T, L, 7.)
          + deepScatterTint * glow * .20 * scatter(o, T, L, 1.8);
  return colour;
}

// Exact C1-continuous perimeter arc length in B-units around this half's outer walls.
float wallArc(vec2 p, vec2 nw) {
  if (nw.x < -.95) return part < .5 ? -p.y : -(1.69 - p.y);
  if (abs(nw.y) > .95) return p.x;
  float ang = atan(nw.y, nw.x);
  return part < .5 ? .57 + (ang + 1.5707963) * .43 : .71 + (1.5707963 - ang) * .49;
}

void main() {
  vec2 p = plate.xy;
  float cut;
  vec2 nw = wallNormal(p, cut);
  float cutDist = abs((p.y + SLOPE * p.x) * NORM - .98 * NORM);
  float mipBias = clamp(pixel * 44., 0., 1.0);
  vec3 colour = vec3(0.);
  float edgeLit = 0.;

  if (kind < .5) {
    float dFront = max(front - plate.z, 0.);
    float dBack = max(plate.z - back, 0.);
    float thickness = front - back;
    float tz = clamp(dBack / thickness, 0., 1.);

    // Twin razor-crisp 45-degree polished arris bevels along BOTH front and back edges.
    float ef = 1. - smoothstep(WALL_BEVEL * .16, WALL_BEVEL, dFront);
    float eb = 1. - smoothstep(WALL_BEVEL * .16, WALL_BEVEL, dBack);
    edgeLit = max(ef, eb);

    if (cut > .5 && edgeLit < .45) {
      // Frosted diagonal kerf: glowing lime satin + micro-crystalline ground-glass sparkle.
      vec3 V = normalize(row3);
      vec3 n = normalize(vec3(nw, ef - eb));
      float ndv = max(-dot(V, n), 0.);
      float fresnel = .042 + .958 * pow(1. - ndv, 5.);
      vec2 cell = floor(plate.xz * 1500.);
      float grain = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      float sparkle = pow(fract(grain + dot(V.xy, vec2(1.9, 2.5)) + lightAngle * .52), 13.);
      vec3 softSheen = envLookup(cam(reflect(V, n)), 2.1);
      colour = satin(plate) * (.92 + .14 * grain)
             + vec3(.90, 1.0, .64) * sparkle * .72 * glow
             + softSheen * fresnel * .28;
    } else if (cut < .5) {
      // PRECISION MACHINE-GROUND & POLISHED ARCHITECTURAL FLOAT-GLASS OUTER EDGE:
      // Optically flat macro normal keeps studio reflections razor-smooth and straight,
      // while straight longitudinal diamond-wheel striations, twin 45-deg arris bevels,
      // dark internal optical creases, and translucent icy-aqua subsurface scatter match
      // real thick flat-polished sea-green float glass.
      float perim = wallArc(p, nw);
      float groundMask = 1. - smoothstep(.04, .60, edgeLit);

      // Band-limiting gates guarantee zero moire or stippling at every resolution & angle.
      float fineGate = smoothstep(.0090, .0026, pixel);
      float microGate = smoothstep(.0052, .0016, pixel);

      // Optically flat macro normal (zero wavy normal distortion!).
      vec3 n = normalize(vec3(nw, (ef - eb) * .96));

      // Dead-straight longitudinal diamond-wheel polishing striations running parallel
      // to the front & back arris bevels (high aspect ratio along perim vs thickness tz).
      float streakBroad = vnoise(vec2(perim * .45, tz * 16.));
      float streakFine = vnoise(vec2(perim * .85 + 4.1, tz * 52.));
      float streakHair = .5 + .5 * sin(tz * 150. + streakBroad * 1.4);
      float striation = streakBroad * .46 + mix(.5, streakFine, fineGate) * .36 + mix(.5, streakHair, microGate) * .18;

      // Soft translucent internal sea-glass scatter cloud (broad & smooth along edge).
      float cloud = vnoise(vec2(perim * 1.35 + 2.7, tz * 4.2));
      float centerBand = smoothstep(0., .18, tz) * smoothstep(1., .82, tz);

      // Satin-buffed translucent edge roughness (~0.24..0.44): stays deeply glassy & reflective!
      float wallRough = groundMask * (.24 + .22 * centerBand * (.45 + .55 * cloud));
      colour = shade(vec3(p - nw * .0004, plate.z), n, 0., edgeLit, mipBias * .50, wallRough);

      // 1. Crisp dark viridian-teal internal refraction crease hugging right behind BOTH 45-deg bevels!
      float creaseF = exp(-pow((dFront - WALL_BEVEL * 1.12) / .0065, 2.));
      float creaseB = exp(-pow((dBack  - WALL_BEVEL * 1.12) / .0065, 2.));
      float crease = max(creaseF, creaseB * .82);
      colour = mix(colour, colour * vec3(.10, .34, .36), crease * .84);

      // 2. Smooth translucent sea-glass viridian-aqua subsurface luminance & straight wheel polish!
      vec3 envSoft = envLookup(cam(normalize(vec3(nw, .18))), 1.7);
      float envEnergy = clamp(dot(envSoft, vec3(.26, .54, .20)), .05, 3.2);
      float litFactor = smoothstep(.18, 1.35, envEnergy * (.58 + .65 * cloud));

      // Luminous translucent frosted-aqua center glow (catches light softly inside the ground glass!).
      vec3 seaBody = mix(SEA_TEAL * .62, SEA_AQUA * .94, litFactor);
      float satinVeil = groundMask * centerBand * (.14 + .24 * cloud) * smoothstep(.10, 1.10, envEnergy);
      colour = mix(colour, seaBody * (.44 + .42 * envEnergy), satinVeil * .52);

      // Silky straight parallel longitudinal grinding sheen across the flat & curved edges!
      float fineSheen = groundMask * (striation - .32) * (.13 + .18 * envEnergy);
      colour += mix(SEA_TEAL * 1.25, SEA_AQUA, litFactor) * max(fineSheen, 0.);

      // Crisp translucent icy-aqua internal light-guide band tucked just inside the front crease!
      float innerRibbon = exp(-pow((dFront - WALL_BEVEL * 1.90) / .015, 2.));
      float backRibbon = exp(-pow((dBack - WALL_BEVEL * 1.85) / .015, 2.));
      colour += SEA_AQUA * (innerRibbon * .16 + backRibbon * .09) * (.35 + .65 * envEnergy);

      // 3. Razor-clean glossy icy-aqua translucent highlight on the twin 45-degree polished arris bevels!
      vec3 bevelLight = mix(vec3(.14, .58, .58), vec3(.84, .99, .97), smoothstep(.26, 1.60, envEnergy));
      colour += bevelLight * edgeLit * (.18 + .26 * envEnergy);
      // Thin crisp bright outer specular arris line right at the 45-deg shoulder corner.
      float arrisCorner = exp(-pow((dFront - WALL_BEVEL * .45) / .0045, 2.));
      colour += vec3(.72, .96, .95) * arrisCorner * (.14 + .28 * envEnergy);

      // 4. Delicate pinpoint micro-crystalline wheel-grind dust flecks ONLY where light illuminates the edge!
      if (microGate > .15) {
        float fleck = smoothstep(.976, .998, hash21(floor(vec2(perim * 280., tz * 130.))));
        float seamFleck = smoothstep(.966, .997, hash21(floor(vec2(perim * 380., dFront * 190.))));
        float fVis = smoothstep(.38, 1.5, envEnergy) * microGate;
        colour += vec3(.84, .99, .97) * (fleck * groundMask * .34 + seamFleck * (creaseF + ef * .65) * .45) * fVis;
      }

      // 5. Electric lime kerf glow bleeding organically into the deep sea-glass teal walls near the cut!
      float hot = exp(-cutDist * 14.) * .24 + exp(-cutDist * 5.0) * .18 + exp(-cutDist * 1.5) * .026;
      colour += LIME * glow * flow(p.x) * hot;
    } else {
      vec3 n = normalize(vec3(nw, ef - eb));
      colour = shade(vec3(p - nw * .0004, plate.z), n, 0., edgeLit, mipBias * .55, 0.);
    }
  } else {
    float inside = max(-solid(p), 0.);
    edgeLit = 1. - smoothstep(CHAMFER * .24, CHAMFER, inside);
    float uReed = fract(p.x / flute);
    float grooveDist = min(uReed, 1. - uReed);
    float dx = pixel * .35;
    float grooveSoft = quality > 1.5 ? 0. : clamp(pixel / flute * 1.35, .02, .16);
    bool needAA = quality > 1.5 && (grooveDist < (dx / flute) * 1.25 || inside < CHAMFER * 1.45);

    int taps = needAA ? 2 : 1;
    for (int s = 0; s < 2; s++) {
      if (s >= taps) break;
      float off = needAA ? (s == 0 ? -dx * .5 : dx * .5) : 0.;
      vec2 ps = vec2(p.x + off, p.y);
      float inS = needAA ? max(-solid(ps), 0.) : inside;
      colour += shade(vec3(ps, front), faceNormal(ps, nw, inS, grooveSoft), 1., edgeLit, mipBias, 0.);
    }
    colour *= needAA ? .5 : 1.;

    // 1. Cylindrical-lens internal studio caustic ribbon + living gallery daylight wave.
    float keyPhase = clamp(.5 + .25 * sin(lightAngle * 1.25 - row3.x * 1.5 + pointer.x * .70 + sin(time * .42) * .12), .17, .83);
    float reedFocus = exp(-pow((uReed - keyPhase) / .115, 2.)) * (1. - edgeLit);
    float alongBlock = smoothstep(.02, .18, inside);
    float diagBand = .55 + .45 * cos((p.x * 2.2 - p.y * 1.1) - time * .46 - lightAngle * 1.6 - pointer.x * .9);
    colour += vec3(.16, .24, .22) * reedFocus * alongBlock * (.32 + .34 * diagBand + .32 * pulse);

    // 2. Fiber-optic kerf light-piping: cylindrical reeds lens the glowing lime filament into
    //    stepped chartreuse-emerald vertical crystal columns rippling with flow(x).
    float pipeLens = .26 + .74 * pow(1. - abs(uReed * 2. - 1.), 1.9);
    float kerfPipe = (exp(-cutDist * 4.0) * .30 + exp(-cutDist * 11.5) * .40) * pipeLens * (1. - edgeLit);
    float alongFil = smoothstep(filamentRange.x - .12, filamentRange.x + .08, p.x)
                   * (1. - smoothstep(filamentRange.y - .08, filamentRange.y + .14, p.x));
    colour += LIME * glow * flow(p.x) * kerfPipe * (1. + .55 * pulse) * (.35 + .65 * alongFil);

    // 3. Outer perimeter float-glass sea-teal arris crease & glowing translucent bevel framing the face!
    float faceCrease = exp(-pow((inside - CHAMFER * 1.18) / .0058, 2.)) * (1. - cut);
    colour = mix(colour, colour * vec3(.22, .52, .52), faceCrease * .56);
    float rim = exp(-max(inside - CHAMFER, 0.) * 34.) * (1. - edgeLit);
    vec3 rimTint = mix(SEA_TEAL * .85, LIME, exp(-cutDist * 2.2));
    colour += rimTint * glow * flow(p.x) * rim * (.10 + .36 * exp(-cutDist * 2.4));

    // 4. Michels-Levy photoelastic stress birefringence along touch/click shockwaves.
    float phA, phB;
    float sA = stress(p, shockA, phA), sB = stress(p, shockB, phB);
    float ring = sA + sB;
    if (ring > .004) {
      float ph = (sA * phA + sB * phB) / max(ring, 1e-4) + cutDist * 22.;
      vec3 biref = .5 + .5 * cos(ph + vec3(0., 2.094, 4.188));
      colour += biref * vec3(.30, .38, .24) * ring;
    }
  }

  // Polished 45-degree arris bevels gleam icy sea-aqua around the exterior and chartreuse-lime along the cut.
  vec3 edgeCol = mix(vec3(.20, .64, .61), LIME, exp(-cutDist * 2.5));
  colour += edgeCol * edgeLit * glow * flow(p.x) * (.14 + .52 * exp(-cutDist * 2.6));

  if (recovery < .999) {
    float travel = cutDist - (.05 + .46 * recovery);
    colour += LIME * 1.65 * (1. - recovery) * exp(-travel * travel * 420.);
  }

  gl_FragColor = vec4(display(colour), 1.);
}`;

// Ultra-lightweight fragment shader for the large ground caustic card, lime halo,
// and filament bar/bloom — skips fully transparent margin pixels early via discard!
const fxFrag = `precision highp float;
uniform float kind, sway, recovery, pulse, lightAngle, intro, glow, haloPad, time, flute;
uniform vec2 filamentRange, pointer;
uniform vec4 shockA, shockB;
uniform sampler2D groundMap, halo;
varying vec3 plate;
varying float side;

const float SLOPE = .27875, NORM = .96327;

float ramp(float x, float a, float b) { return clamp((x - a) / (b - a), 0., 1.); }
float flow(float x) {
  return 1. + .18 * sin(x * 8.5 - time * 1.10) + .10 * sin(x * 3.7 + time * .62);
}

void main() {
  vec2 p = plate.xy;
  if (kind > 4.5) {
    vec2 huv = (p + haloPad) / (vec2(1.21, 1.69) + 2. * haloPad);
    vec4 light = texture2D(halo, vec2(huv.x, 1. - huv.y));
    vec2 rim = min(huv, 1. - huv);
    float fade = smoothstep(0., .06, min(rim.x, rim.y));
    float a = light.a * fade * (.62 * glow + .24 * pulse);
    if (a < .002) discard;
    gl_FragColor = vec4(light.rgb * a, a * .80);
  } else if (kind > 3.5) {
    vec2 guv = vec2(p.x, -p.y) * .5 + .5;
    vec4 base = texture2D(groundMap, guv);
    float alpha = base.a;
    if (alpha < .003) discard;

    float shift = (sway * .0058 + lightAngle * .0105 + pointer.x * .0038) * (1. + .55 * pulse);
    vec4 rTap = texture2D(groundMap, guv + vec2(shift, 0.));
    vec4 bTap = texture2D(groundMap, guv - vec2(shift, 0.));
    vec3 inkRgb = vec3(mix(base.r, rTap.r, .58), base.g, mix(base.b, bTap.b, .58));

    float gx = guv.x * 2.56 - .96;
    float gy = (1. - guv.y) * .50 - .25;
    vec2 gRel = vec2(gx - .45, gy + .159);
    vec2 bp = vec2(.99694 * gRel.x + 3.92956 * gRel.y, -.11643 * gRel.x + 6.84034 * gRel.y);
    float inBox = smoothstep(-.16, .08, bp.x) * (1. - smoothstep(1.18, 1.44, bp.x))
                * smoothstep(-.15, .10, bp.y) * (1. - smoothstep(1.62, 1.92, bp.y));
    float footMask = smoothstep(.04, .32, alpha) * inBox;
    vec3 causticAdd = vec3(0.);

    if (footMask > .005) {
      // 1. Crisp shimmering vertical reed focal caustic lines gliding across the translucent shadow.
      float reedShift = sway * .22 + lightAngle * .30 + pointer.x * .09 + sin(time * .42) * .018;
      float reedWave = pow(.5 + .5 * cos((bp.x + reedShift) / flute * 6.2831853), 6.5);
      vec2 fp = (bp - vec2(.60 - lightAngle * .18 - pointer.x * .09, .88 - pointer.y * .10)) * vec2(1.02, .82);
      float focusPatch = exp(-dot(fp, fp) * 1.18);
      causticAdd += vec3(.30, .35, .30) * reedWave * focusPatch * footMask * (.42 + .28 * pulse);

      // 2. Jewel-crisp curved-barrel prismatic rainbow caustic crescents (warm gold -> white core -> aqua/violet).
      vec2 loV = bp - vec2(.71, 1.20);
      float loR = length(loV);
      float loAng = atan(loV.y, loV.x) - lightAngle * .24 - pointer.x * .14;
      float loArc = smoothstep(-.50, .14, loAng) * (1. - smoothstep(.66, 1.22, loAng));
      float dispShift = .021 + .028 * (lightAngle * .55 + sway * .45 + pointer.x * .26);
      float cR = exp(-pow((loR - (.540 + dispShift)) / .027, 2.));
      float cG = exp(-pow((loR - .502) / .025, 2.));
      float cB = exp(-pow((loR - (.466 - dispShift)) / .027, 2.));
      vec3 lowerPrism = vec3(cR * .38 + cG * .20, cG * .33 + cR * .14 + cB * .14, cB * .38 + cG * .11);

      vec2 upV = bp - vec2(.57, .43);
      float upR = length(upV);
      float upAng = atan(upV.y, upV.x) - lightAngle * .20 - pointer.x * .10;
      float upArc = smoothstep(-.92, -.18, upAng) * (1. - smoothstep(.38, .86, upAng));
      float uR = exp(-pow((upR - (.446 + dispShift * .72)) / .029, 2.));
      float uG = exp(-pow((upR - .422) / .027, 2.));
      float uB = exp(-pow((upR - (.398 - dispShift * .72)) / .029, 2.));
      vec3 upperPrism = vec3(uR * .28 + uG * .15, uG * .27 + uR * .09 + uB * .10, uB * .28 + uG * .09);

      float prismGain = (.74 + .44 * pulse + .34 * abs(lightAngle) + .26 * abs(sway));
      causticAdd += (lowerPrism * loArc + upperPrism * upArc) * footMask * prismGain;

      // 3. Flute-modulated travelling lime filament caustic seam on the warm paper.
      float kerfD = abs((bp.y + SLOPE * bp.x) * NORM - .98 * NORM);
      float alongKerf = smoothstep(.04, .20, bp.x) * (1. - smoothstep(.86, 1.08, bp.x));
      float reedMod = .72 + .28 * pow(.5 + .5 * cos((bp.x + reedShift * .5) / flute * 6.2831853), 2.5);
      float seamCore = exp(-kerfD * kerfD * 640.) * alongKerf * reedMod;
      float seamHalo = exp(-kerfD * kerfD * 52.) * alongKerf;
      float fPulse = flow(bp.x) * glow * (.44 + .52 * pulse + .48 * (1. - recovery) + .26 * (1. - intro));
      causticAdd += (vec3(.25, .35, .07) * seamCore + vec3(.065, .11, .014) * seamHalo) * fPulse * footMask;

      // 4. Touch shockwave refracted caustic ring projected onto the paper.
      if (shockA.w > .01 && shockA.z < 2.2) {
        float x = (length(bp - shockA.xy) - shockA.z * .95) / (.055 + shockA.z * .06);
        float w = exp(-x * x) * shockA.w * exp(-shockA.z * 1.7);
        causticAdd += vec3(.24, .36, .22) * w * footMask;
      }
      if (shockB.w > .01 && shockB.z < 2.2) {
        float x = (length(bp - shockB.xy) - shockB.z * .95) / (.055 + shockB.z * .06);
        float w = exp(-x * x) * shockB.w * exp(-shockB.z * 1.7);
        causticAdd += vec3(.24, .36, .22) * w * footMask;
      }
    }

    gl_FragColor = vec4(inkRgb * alpha + causticAdd, alpha);
  } else if (kind < 2.5) {
    float z = ramp(plate.z, -.1445, .1615);
    float wakePulse = (1. - intro) * .45;
    vec3 bar = mix(vec3(.62, .82, .16), vec3(.98, 1., .80), clamp(z * z + .38 * pulse + wakePulse + (flow(p.x) - 1.) * .9, 0., 1.));
    gl_FragColor = vec4(bar, 1.);
  } else {
    float d = abs(side);
    float cap = smoothstep(filamentRange.x - .028, filamentRange.x + .008, p.x)
      * (1. - smoothstep(filamentRange.y - .008, filamentRange.y + .028, p.x));
    float wakeBoost = (1. - intro) * .28;
    float bloom = (.31 + .19 * pulse + wakeBoost) * glow * flow(p.x) * exp(-d * d * (4.4 - 1.2 * pulse)) * cap;
    float spread = (.13 + .10 * pulse + wakeBoost * .5) * glow * exp(-d * d * 18.) * cap;
    float core = (1. - smoothstep(.055, .175 + .045 * pulse, d)) * cap * cap;
    float alpha = min(1., max(bloom + spread, core));
    vec3 colour = mix(vec3(178., 226., 50.) / 255., vec3(250., 255., 228.) / 255., core);
    gl_FragColor = vec4(colour * alpha, alpha);
  }
}`;

function texture(gl, source) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function bakeStudioCube(gl, cubeSize) {
  const bakeProg = program(gl, cubeVert, cubeFrag);
  if (!bakeProg) return null;
  const cube = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  for (let i = 0; i < 6; i++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, cubeSize, cubeSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.useProgram(bakeProg);
  const loc = gl.getAttribLocation(bakeProg, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const faceLoc = gl.getUniformLocation(bakeProg, 'face');

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, cubeSize, cubeSize);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  for (let i = 0; i < 6; i++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cube, 0);
    gl.uniform1i(faceLoc, i);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

  gl.disableVertexAttribArray(loc);
  gl.deleteBuffer(quadBuf);
  gl.deleteFramebuffer(fbo);
  gl.deleteProgram(bakeProg);
  return cube;
}

function prism(points, back, front) {
  const data = [];
  const put = (x, y, z, across = 0) => data.push(x, y, z, across);
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const face = [], sides = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    face.push([cx, cy, front], [a[0], a[1], front], [b[0], b[1], front]);
    sides.push([a[0], a[1], back], [b[0], b[1], back], [b[0], b[1], front],
      [a[0], a[1], back], [b[0], b[1], front], [a[0], a[1], front]);
  });
  sides.forEach(v => put(...v));
  const sideCount = sides.length;
  face.forEach(v => put(...v));
  return { data, sideCount, faceCount: face.length };
}

function filamentBars([[x0, y0], [x1, y1]], near, far) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / length, ny = (x1 - x0) / length;
  const corner = (x, y, s, z) => [x + nx * s, y + ny * s, z];
  const box = [];
  const quad = (a, b, c, d) => box.push(a, b, c, a, c, d);
  for (const s of [-.006, .006]) quad(corner(x0, y0, s, far), corner(x1, y1, s, far), corner(x1, y1, s, near), corner(x0, y0, s, near));
  for (const z of [far, near]) quad(corner(x0, y0, -.006, z), corner(x1, y1, -.006, z), corner(x1, y1, .006, z), corner(x0, y0, .006, z));
  for (const [x, y] of [[x0, y0], [x1, y1]]) quad(corner(x, y, -.006, far), corner(x, y, .006, far), corner(x, y, .006, near), corner(x, y, -.006, near));
  const data = [];
  box.forEach(v => data.push(...v, 0));
  const ux = (x1 - x0) / length * .03, uy = (y1 - y0) / length * .03;
  const card = [];
  const at = (x, y, s) => [x + nx * .03 * s, y + ny * .03 * s, near + .001, s];
  const a = at(x0 - ux, y0 - uy, -1), b = at(x1 + ux, y1 + uy, -1), c = at(x1 + ux, y1 + uy, 1), d = at(x0 - ux, y0 - uy, 1);
  [a, b, c, a, c, d].forEach(v => card.push(...v));
  return { data: data.concat(card), barCount: box.length, glowCount: 6 };
}

export function createGlass(stage, { outlines, flute, filament, back, front, groundMap, halo, haloPad = 0 }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'glass';
  canvas.setAttribute('aria-hidden', 'true');
  // Kept so the dot-matrix field can hold the calm frame when a glitch begins.
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true, preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  const software = /swiftshader|llvmpipe|software/i.test(rendererName);

  const envCube = bakeStudioCube(gl, software ? 96 : 256);
  const glassProg = program(gl, vertex, glassFrag);
  const fxProg = program(gl, vertex, fxFrag);
  if (!envCube || !glassProg || !fxProg) return null;
  stage.after(canvas);

  const halves = outlines.map(points => prism(points, back, front));
  const bars = filamentBars(filament, .1615, -.1445);
  const card = [-1, -1, 0, 0, 1, -1, 0, 0, 1, 1, 0, 0, -1, -1, 0, 0, 1, 1, 0, 0, -1, 1, 0, 0];
  const [l, t, r, b] = [-haloPad, -haloPad, 1.21 + haloPad, 1.69 + haloPad];
  const glowCard = [l, t, 0, 0, r, t, 0, 0, r, b, 0, 0, l, t, 0, 0, r, b, 0, 0, l, b, 0, 0];
  const all = [...halves.flatMap(h => h.data), ...bars.data, ...card, ...glowCard];
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all), gl.STATIC_DRAW);

  const groundFirst = halves.reduce((n, half) => n + half.sideCount + half.faceCount, 0) + bars.barCount + bars.glowCount;
  const bindAttribs = prog => ({
    pos: gl.getAttribLocation(prog, 'position'),
    acr: gl.getAttribLocation(prog, 'across'),
  });
  const gAttr = bindAttribs(glassProg);
  const fAttr = bindAttribs(fxProg);
  const setAttribs = ({ pos, acr }) => {
    if (pos >= 0) { gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 16, 0); }
    if (acr >= 0) { gl.enableVertexAttribArray(acr); gl.vertexAttribPointer(acr, 1, gl.FLOAT, false, 16, 12); }
  };

  const makeUniforms = prog => {
    const map = {};
    return name => (name in map ? map[name] : (map[name] = gl.getUniformLocation(prog, name)));
  };
  const ug = makeUniforms(glassProg);
  const uf = makeUniforms(fxProg);

  const groundTexture = texture(gl, groundMap);
  const haloTexture = halo ? texture(gl, halo) : null;

  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_CUBE_MAP, envCube);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, groundTexture);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, haloTexture);

  gl.useProgram(glassProg);
  gl.uniform1f(ug('flute'), flute);
  gl.uniform1f(ug('front'), front);
  gl.uniform1f(ug('back'), back);
  gl.uniform1f(ug('ground'), 0);
  gl.uniform2f(ug('filamentRange'), filament[0][0], filament[1][0]);
  gl.uniform1i(ug('envCube'), 2);
  gl.uniform1i(ug('groundMap'), 3);

  gl.useProgram(fxProg);
  gl.uniform1f(uf('flute'), flute);
  gl.uniform1f(uf('haloPad'), haloPad);
  gl.uniform2f(uf('filamentRange'), filament[0][0], filament[1][0]);
  gl.uniform1i(uf('groundMap'), 3);
  gl.uniform1i(uf('halo'), 4);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let box = [0, 0, 1, 1], baseRatio = 1, ratio = 1, activeScale = 1;
  function applyBufferSize() {
    ratio = Math.max(.5, baseRatio * activeScale);
    const cw = Math.max(1, Math.round(box[2] * ratio));
    const ch = Math.max(1, Math.round(box[3] * ratio));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  }

  return {
    canvas,
    software,
    get box() { return box; },
    resize(pixelRatio, reach) {
      baseRatio = software ? Math.min(1, pixelRatio) : pixelRatio;
      const [left, top, right, bottom] = reach;
      box = [Math.floor(left) - 4, Math.floor(top) - 4, Math.ceil(right - left) + 8, Math.ceil(bottom - top) + 8];
      Object.assign(canvas.style, {
        inset: 'auto', left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
      });
      applyBufferSize();
    },
    render({ rows, centre, size, view, lift, shift, glint, sway, ground, recovery, pulse = 0,
      lightAngle = 0, intro = 1, glow = 1, time = 0, quality = 2, detail = 1,
      pointer = [0, 0], shocks = [[0, 0, 9, 0], [0, 0, 9, 0]] }) {
      if (gl.isContextLost()) return false;
      if (Math.abs(detail - activeScale) > .01) {
        activeScale = detail;
        applyBufferSize();
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const sA = shocks[0], sB = shocks[1];
      const bx = box[0], by = box[1], bw = box[2], bh = box[3];
      const cx = centre[0], cy = centre[1];
      const gx = ground[0], gy = ground[1], gw = ground[2], gh = ground[3];
      const px = pointer[0], py = pointer[1];
      const effQuality = software ? Math.min(quality, 1) : quality;

      // Pass 1: Ground caustics + halo using lightweight fxProg.
      gl.useProgram(fxProg);
      setAttribs(fAttr);
      gl.uniform3fv(uf('row1'), rows[0]);
      gl.uniform3fv(uf('row2'), rows[1]);
      gl.uniform3fv(uf('row3'), rows[2]);
      gl.uniform4f(uf('box'), bx, by, bw, bh);
      gl.uniform2f(uf('centre'), cx, cy);
      gl.uniform2f(uf('pointer'), px, py);
      gl.uniform1f(uf('size'), size);
      gl.uniform1f(uf('lift'), lift);
      gl.uniform1f(uf('shift'), 0);
      gl.uniform1f(uf('sway'), sway);
      gl.uniform1f(uf('recovery'), recovery);
      gl.uniform1f(uf('pulse'), pulse);
      gl.uniform1f(uf('lightAngle'), lightAngle);
      gl.uniform1f(uf('intro'), intro);
      gl.uniform1f(uf('glow'), glow);
      gl.uniform1f(uf('time'), time);
      gl.uniform4f(uf('shadow'), gx, gy, gw, gh);
      gl.uniform4f(uf('shockA'), sA[0], sA[1], sA[2], sA[3]);
      gl.uniform4f(uf('shockB'), sB[0], sB[1], sB[2], sB[3]);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.uniform1f(uf('ground'), 1);
      gl.uniform1f(uf('kind'), 4);
      gl.drawArrays(gl.TRIANGLES, groundFirst, 6);
      gl.uniform1f(uf('ground'), 0);
      if (haloTexture) {
        gl.uniform1f(uf('kind'), 5);
        gl.drawArrays(gl.TRIANGLES, groundFirst + 6, 6);
      }

      // Pass 2: Extruded crystal B halves using flattened glassProg.
      gl.useProgram(glassProg);
      setAttribs(gAttr);
      const rot = lightAngle + glint * .35;
      gl.uniform3fv(ug('row1'), rows[0]);
      gl.uniform3fv(ug('row2'), rows[1]);
      gl.uniform3fv(ug('row3'), rows[2]);
      gl.uniform4f(ug('box'), bx, by, bw, bh);
      gl.uniform2f(ug('centre'), cx, cy);
      gl.uniform2f(ug('view'), view[0], view[1]);
      gl.uniform2f(ug('pointer'), px, py);
      gl.uniform2f(ug('lightRot'), Math.cos(rot), Math.sin(rot));
      gl.uniform1f(ug('size'), size);
      gl.uniform1f(ug('lift'), lift);
      gl.uniform1f(ug('recovery'), recovery);
      gl.uniform1f(ug('pulse'), pulse);
      gl.uniform1f(ug('lightAngle'), lightAngle);
      gl.uniform1f(ug('intro'), intro);
      gl.uniform1f(ug('glow'), glow);
      gl.uniform1f(ug('time'), time);
      gl.uniform1f(ug('quality'), effQuality);
      gl.uniform4f(ug('shockA'), sA[0], sA[1], sA[2], sA[3]);
      gl.uniform4f(ug('shockB'), sB[0], sB[1], sB[2], sB[3]);
      gl.uniform1f(ug('pixel'), 1 / (size * ratio));
      gl.uniform4f(ug('shadow'), gx, gy, gw, gh);

      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      let first = 0;
      for (let part = 0; part < halves.length; part++) {
        const half = halves[part];
        gl.uniform1f(ug('part'), part);
        gl.uniform1f(ug('shift'), shift[part]);
        gl.uniform1f(ug('kind'), 0);
        gl.drawArrays(gl.TRIANGLES, first, half.sideCount);
        gl.uniform1f(ug('kind'), 1);
        gl.drawArrays(gl.TRIANGLES, first + half.sideCount, half.faceCount);
        first += half.sideCount + half.faceCount;
      }

      // Pass 3: Filament bar + incandescent bloom card using fxProg (keeps active 'sway' uniform).
      gl.useProgram(fxProg);
      setAttribs(fAttr);
      gl.uniform1f(uf('shift'), 0);
      gl.uniform1f(uf('kind'), 2);
      gl.drawArrays(gl.TRIANGLES, first, bars.barCount);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.uniform1f(uf('kind'), 3);
      gl.drawArrays(gl.TRIANGLES, first + bars.barCount, bars.glowCount);
      return true;
    },
  };
}
