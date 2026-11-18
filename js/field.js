// The glitch stage is a 1-bit dot-matrix display streaming the B.
//
// Every cell is a lit square or a dark one, and ordered dithering makes the
// greys. The display spends its bits on the B: around it and along the light
// thrown from its cut the dither is fine, while further out the picture
// breaks into flat macroblocks that refresh out of step. At each exposure the
// calm scene is held as a dithered ghost that dissolves block by block, and
// it re-forms the same way just before the calm scene returns.
import { createRenderer } from './gl/gl.js';

const fragment = `precision highp float;
uniform vec2 res, origin, dir, pointer;
uniform float cell, time, age, hold, end, size, ghostReady;
uniform vec3 rings;
uniform sampler2D ghost;

float hash(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float noise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = .5, s = 0.;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; }
  return s;
}
// 4x4 Bayer matrix built from the 2x2 one: 0 2 / 3 1.
float bayer2(vec2 a) { return 2. * a.x + 3. * a.y - 4. * a.x * a.y; }
float bayer(vec2 c) {
  vec2 m = mod(c, 4.);
  return 4. * bayer2(mod(m, 2.)) + bayer2(floor(m / 2.));
}

// Quiet around the envelope and the wordmark, so both stay legible.
float quiet(vec2 q) {
  vec2 top = (q - vec2(.5, .08) * res) / res.y, base = (q - vec2(.5, .92) * res) / res.y;
  return (1. - .92 * exp(-dot(top, top) / .012)) * (1. - .92 * exp(-dot(base, base) / .016));
}

// Light in the scene: the sheet thrown along the cut, its glow, the rings,
// drifting smoke and the display's refresh line.
float scene(vec2 q, out float tint) {
  vec2 rel = q - origin;
  float along = dot(rel, dir);
  float across = abs(dot(rel, vec2(-dir.y, dir.x)));
  float reach = exp(-abs(along) / (size * 2.6));
  float sheet = (.85 * exp(-across / (size * .045)) + .22 * exp(-across / (size * .32))) * (.3 + .7 * reach);
  // Packets of light run outward along the sheet.
  float k = fract(abs(along) / (size * .5) - time * .85);
  sheet += .6 * exp(-across / (size * .035)) * smoothstep(0., .04, k) * smoothstep(.22, .04, k) * (.25 + .75 * reach);
  float glow = .32 * exp(-length(rel) / (size * .85));

  float ring = 0., d = length(rel), from = size * .8, out_ = length(res) * .62;
  for (int i = 0; i < 3; i++) {
    float start = i == 0 ? rings.x : (i == 1 ? rings.y : rings.z);
    float strength = i == 0 ? 1. : (i == 1 ? .8 : .5);
    float t = age - start;
    if (t < 0.) continue;
    float r = from + t * out_ * .75;
    float fade = strength * pow(max(0., 1. - (r - from) / (out_ - from)), 1.3);
    float band = size * .07 + (r - from) * .05;
    ring += fade * exp(-pow((d - r) / band, 2.));
  }

  vec2 u = q / res.y;
  float warp = fbm(u * 1.6 + vec2(time * .02, -time * .015));
  float smoke = smoothstep(.46, .82, fbm(u * 3.3 + warp * 1.7 + vec2(-time * .035, time * .02))) * .36;
  float scan = .14 * exp(-abs(q.y - fract(time * .32) * res.y * 1.25) / (cell * 2.5));

  // Falling away to the edges.
  vec2 v = (q / res - .5) * vec2(1.25, 1.1);
  float vignette = smoothstep(.95, .25, length(v));

  tint = clamp(sheet * 1.3 + ring * 1.4 + glow * .7, 0., 1.);
  return clamp(sheet + glow + ring * .85 + smoke + scan, 0., 1.) * quiet(q) * vignette;
}

// The calm scene as it was when the exposure began: the glass over warm paper.
float paper(vec2 uv, out vec3 colour) {
  float d = length((uv - vec2(.35, .27)) * vec2(1., res.y / res.x));
  colour = mix(vec3(.98, .97, .945), vec3(.82, .81, .78), smoothstep(0., 1.1, d));
  vec4 glass = texture2D(ghost, vec2(uv.x, 1. - uv.y));
  colour = mix(colour, glass.rgb, glass.a);
  return dot(colour, vec3(.299, .587, .114));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 ci = floor(p / cell);
  vec2 local = floor(p - ci * cell);
  float lit = floor(cell * .72 + .5);
  float inset = floor((cell - lit) * .5);
  bool inDot = all(greaterThanEqual(local, vec2(inset))) && all(lessThan(local, vec2(inset + lit)));
  if (!inDot) { gl_FragColor = vec4(0., 0., 0., 1.); return; }

  // Rows occasionally tear sideways.
  vec2 cc = ci;
  float row = floor(ci.y / 3.), beat = floor(time * 7.);
  if (hash(vec2(row, beat)) > .985) cc.x += floor((hash(vec2(beat, row)) - .5) * 14.);

  // Bits go where the B is: fine dither near it, coarse blocks far away.
  vec2 centre = (cc + .5) * cell;
  float focus = max(exp(-length(centre - origin) / (size * 1.9)),
    exp(-abs(dot(centre - origin, vec2(-dir.y, dir.x))) / (size * .22)) * .8);
  vec2 sb = floor(cc / 16.);
  float key = floor(time * 2.4 + hash(sb) * 3.);
  float pickSize = hash(sb + key * .137);
  float block = focus > .5 ? 1. : (pickSize < .4 ? 2. : (pickSize < .78 ? 4. : 8.));
  if (focus > .28) block = min(block, 2.);
  vec2 sample_ = block > 1. ? (floor(cc / block) + .5) * block * cell : centre;

  // Datamosh: a few blocks show the picture from somewhere else.
  vec2 mb = floor(cc / 8.);
  float mosh = hash(mb + floor(time * 5.) * 1.31);
  if (mosh > .972) sample_ += (vec2(hash(mb * 1.7), hash(mb * 2.3)) - .5) * cell * 40.;

  // The pointer is a loupe over the picture; the grid itself stays put.
  vec2 lens = sample_ - pointer;
  sample_ = pointer + lens * (1. - .3 * exp(-dot(lens, lens) / (size * size * .7)));

  float tint;
  float level = scene(sample_, tint);
  if (mosh > .992) level = .55 - level * .5;
  // Borrowed or inverted blocks still keep clear of the marks.
  level *= quiet(centre);

  // The ghost of the calm scene dissolves, and later returns, block by block.
  vec2 gb = floor(ci / 8.);
  float delay = hash(gb * 1.7 + 3.1);
  float held = max(age < hold ? 1. : 0., age >= hold ? 1. - smoothstep(delay * .6, delay * .6 + .1, age - hold) : 0.);
  held = max(held, smoothstep(end - .32 + delay * .22, end - .26 + delay * .22, age)) * ghostReady;
  float threshold = (bayer(ci) + .5) / 16.;
  bool fromGhost = held > threshold;

  vec3 colour;
  if (fromGhost) {
    // The held frame rises as it breaks up, and settles back as it re-forms,
    // so the glass B drifts out from behind the liquid and returns.
    float rise = age < hold ? 0. : (age < end - .32 ? (age - hold) * .42 : (end - age) * .95);
    vec2 uv = sample_ / res + vec2(age < hold ? .006 : 0., rise);
    vec3 calm;
    level = clamp((paper(uv, calm) - .3) / .62, 0., 1.) * .88 * quiet(sample_);
    colour = calm * (.8 + .2 * level);
  } else {
    float grey = smoothstep(.05, .9, level);
    colour = mix(vec3(.29, .31, .27), vec3(.84, .87, .8), grey);
    colour = mix(colour, vec3(.66, .86, .2) * (.65 + .55 * grey), tint * .85);
  }
  if (block > 1.) level = floor(level * 4. + .5) / 4.;

  // Unlit cells still show faintly, like the panel of a switched-off display.
  gl_FragColor = vec4(level > threshold ? colour : vec3(.045, .048, .042), 1.);
}
`;

export function createField(stage) {
  const canvas = document.createElement('canvas');
  canvas.className = 'field';
  canvas.setAttribute('aria-hidden', 'true');
  stage.before(canvas);
  const renderer = createRenderer(canvas, fragment, { alpha: false });
  if (!renderer) { canvas.remove(); return null; }
  const { gl } = renderer;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = !!info && /swiftshader|llvmpipe|software/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  let ghost = null, scale = 1;

  return {
    resize(w, h, ratio) {
      // Software rasterisers draw the panel at CSS resolution.
      scale = software ? 1 : ratio;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
    },
    // Hold the calm frame. The stage canvas still shows it when this runs.
    capture(source) {
      try { ghost = renderer.texture(source, ghost ?? undefined); } catch { ghost = null; }
    },
    render({ time, age, hold, end, rings, origin, dir, size, pointer }) {
      if (gl.isContextLost()) return;
      const uniforms = {
        res: [canvas.width, canvas.height],
        cell: Math.max(4, Math.round(5.5 * scale)),
        time, age, hold, end, rings, size: size * scale, dir,
        origin: [origin[0] * scale, origin[1] * scale],
        pointer: [pointer[0] * scale, pointer[1] * scale],
        ghostReady: ghost ? 1 : 0,
      };
      if (ghost) uniforms.ghost = ghost;
      renderer.draw(uniforms);
    },
  };
}
