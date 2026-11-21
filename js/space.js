// Deep-space stage for the starship B.
//
// A static backdrop drawn once per resize on its own full-viewport WebGL
// layer: a cold starfield with a faint galactic band and dust, a teal and
// violet nebula, and the night side of a giant planet whose limb catches a
// sunrise in the lower right. The sun throws a warm glare and a thin
// anamorphic streak across the horizon. The same GLSL (`SPACE`) rebuilds the
// backdrop inside the glitch's torn print rows, so the tear matches.
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
  col += vec3(.011, .013, .017) * band * smoothstep(.32, .82, cloud) * lanes;

  // Cold teal nebula to the right, a breath of violet to the left.
  float neb = sFbm(uv * 1.15 + vec2(7.2, 3.1) + .55 * sFbm(uv * 2.4 + 1.7));
  float right = smoothstep(.15, 1., uv.x / aspect);
  col += vec3(.006, .026, .036) * smoothstep(.48, .86, neb) * right;
  col += vec3(.016, .006, .024) * smoothstep(.56, .9, sFbm(uv * 1.35 + vec2(11.4, 5.2))) * (1. - right) * .8;

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
`;

const vert = `attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`;
const frag = `precision highp float;
${SPACE}
uniform vec2 res;
uniform float scale, pad;
void main() {
  vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 css = px / scale - pad;
  vec3 c = spaceColor(css);
  // Dither the deep gradients so they never band.
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

  let view = [1, 1], ratio = 1, dirty = true, active = false;
  function paint() {
    if (!active || !dirty || view[0] < 2 || gl.isContextLost()) return;
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
    // The backdrop is painted lazily, the first time the starship needs it.
    activate(on) {
      active = on;
      paint();
    },
  };
}
