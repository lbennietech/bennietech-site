// The glitch stage is a 1-bit dot-matrix display streaming the B.
//
// Every cell is a lit square or a dark one, and ordered dithering makes the
// greys. The display spends its bits on the B: around it and along the light
// thrown from its cut the dither is fine, while further out the picture
// breaks into flat macroblocks that refresh out of step. At each exposure the
// calm scene is held as a dithered ghost that dissolves block by block, and
// it re-forms the same way just before the calm scene returns. At the
// handover the display loses sync, and torn rows of the full-colour calm
// print interleave with the negative.
import { createRenderer } from './gl/gl.js';
import { TEAR } from './negative.js';

const fragment = `precision highp float;
${TEAR}
uniform vec2 res, origin, dir, pointer, trail;
uniform vec4 ghostBox, tear;
uniform float cell, time, age, hold, end, size, ghostReady, pulse, dpr, wake, lightAngle;
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
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= .5; }
  return s;
}
// 4x4 Bayer matrix built from the 2x2 one: 0 2 / 3 1.
float bayer2(vec2 a) { return 2. * a.x + 3. * a.y - 4. * a.x * a.y; }
float bayer(vec2 c) {
  vec2 m = mod(c, 4.);
  return 4. * bayer2(mod(m, 2.)) + bayer2(floor(m / 2.));
}

// Quiet around the re-aligned torn envelope so it stays legible.
float quiet(vec2 q) {
  float mailY = max(.25 * res.y - .44 * size, 28. * dpr);
  vec2 top = (q - vec2(.5 * res.x, mailY)) / res.y;
  return 1. - .92 * exp(-dot(top, top) / .013);
}

// Light in the scene: the sheet thrown along the cut, its glow, the rings,
// drifting smoke and the display's refresh line.
float scene(vec2 q, bool needSmoke, out float tint) {
  vec2 rel = q - origin;
  float along = dot(rel, dir);
  float across = abs(dot(rel, vec2(-dir.y, dir.x)));
  float reach = exp(-abs(along) / (size * 2.6));
  float sheet = (.85 * exp(-across / (size * .045)) + .22 * exp(-across / (size * .32))) * (.3 + .7 * reach);
  // Packets of light run outward along the sheet.
  float k = fract(abs(along) / (size * .5) - time * .85);
  sheet += .6 * exp(-across / (size * .035)) * smoothstep(0., .04, k) * (1. - smoothstep(.04, .22, k)) * (.25 + .75 * reach);
  // Fine harmonic interference fringes bordering the cut sheet.
  float fringe = .14 * cos(across / (size * .018) - time * 3.4) * exp(-across / (size * .14)) * reach;
  sheet = max(0., sheet + fringe);
  float glow = .32 * exp(-length(rel) / (size * .85));

  float ring = 0., d = length(rel), from = size * .8, out_ = length(res) * .62;
  for (int i = 0; i < 3; i++) {
    float start = i == 0 ? rings.x : (i == 1 ? rings.y : rings.z);
    float strength = i == 0 ? 1. : (i == 1 ? .8 : .5);
    float t = age - start;
    if (t < 0.) continue;
    float r = from + t * out_ * .75;
    float fade = strength * pow(max(0., 1. - (r - from) / (out_ - from)), 1.3);
    float band = size * .045 + (r - from) * .032;
    float front = (d - r) / band;
    ring += fade * (.79 * exp(-front * front) + .21 * exp(-.65 * (front + 3.6) * (front + 3.6)));
  }

  // Interactive shockwave ring radiating from the pointer on direct touch/click.
  if (pulse > .01) {
    float pd = length(q - pointer);
    float pr = (1. - pulse) * size * 2.2;
    float pFront = (pd - pr) / (size * .07);
    ring += pulse * .85 * exp(-pFront * pFront);
  }

  // Long-persistence phosphor comet wake trailing swift pointer sweeps.
  float comet = 0.;
  if (wake > .01) {
    vec2 pa = q - trail, ba = pointer - trail;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.), 0., 1.);
    float sd = length(pa - ba * h);
    comet = wake * .52 * exp(-sd / (size * .095)) * (.35 + .65 * h);
  }

  float smoke = 0.;
  if (needSmoke) {
    vec2 u = q / res.y;
    float warp = fbm(u * 1.6 + vec2(time * .02, -time * .015));
    smoke = smoothstep(.46, .82, fbm(u * 3.3 + warp * 1.7 + vec2(-time * .035, time * .02))) * .36;
  }
  float scan = .14 * exp(-abs(q.y - fract(time * .32) * res.y * 1.25) / (cell * 2.5));

  // Falling away to the edges.
  vec2 v = (q / res - .5) * vec2(1.25, 1.1);
  float vignette = 1. - smoothstep(.25, .95, length(v));

  tint = clamp(sheet * 1.4 + ring * (.48 + .25 * pulse) + glow * .7 + comet * .9, 0., 1.);
  return clamp(sheet + glow + ring * .85 + comet + smoke + scan, 0., 1.) * quiet(q) * vignette;
}

vec4 heldGlass(vec2 screen) {
  vec2 uv = (screen / res - ghostBox.xy) / ghostBox.zw;
  if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return vec4(0.);
  return texture2D(ghost, vec2(uv.x, 1. - uv.y));
}

// The calm print as it stood before the exposure: the captured glass over
// paper that follows the page's own gradient, studio wash, and grain.
vec3 paperAt(vec2 s) {
  vec2 uv = s / res;
  float t = length((uv - vec2(.36, .26)) / vec2(.64, .74)) * .7071;
  vec3 c = mix(vec3(.984, .976, .945), vec3(.937, .925, .886), clamp(t / .43, 0., 1.));
  c = mix(c, vec3(.867, .867, .824), clamp((t - .43) / .35, 0., 1.));
  c = mix(c, vec3(.784, .788, .737), clamp((t - .78) / .34, 0., 1.));
  float diag = uv.x * .899 + uv.y * .438 - lightAngle * .18;
  float lightWash = smoothstep(.16, .26, diag) * (1. - smoothstep(.26, .45, diag));
  c = mix(c, vec3(1., .996, .953), lightWash * .24);
  return c * (1. - .05 * hash(floor(s)));
}
vec3 printAt(vec2 s, float split) {
  vec3 paper = paperAt(s);
  if (ghostReady < .5) return paper;
  // The channels lose registration with each other.
  vec4 r = heldGlass(s + vec2(split, 0.)), g = heldGlass(s), b = heldGlass(s - vec2(split, 0.));
  return vec3(mix(paper.r, r.r, r.a), mix(paper.g, g.g, g.a), mix(paper.b, b.b, b.a));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 from = p;
  if (tear.x > 0.) {
    float kind, split, seam;
    from = tearAt(p / dpr, res / dpr, tear, kind, split, seam) * dpr;
    if (seam > .5) { gl_FragColor = vec4(.80, .96, .32, 1.); return; }
    if (kind > .5) {
      vec3 print = printAt(from, split * dpr);
      // An inverted row reads as the photographic negative of the print.
      if (kind > 1.5) print = (1. - dot(print, vec3(.3, .59, .11))) * vec3(.80, .86, .76);
      gl_FragColor = vec4(print, 1.);
      return;
    }
  }
  vec2 ci = floor(p / cell);
  vec2 local = floor(p - ci * cell);
  float lit = floor(cell * .72 + .5);
  float inset = floor((cell - lit) * .5);
  bool inDot = all(greaterThanEqual(local, vec2(inset))) && all(lessThan(local, vec2(inset + lit)));
  if (!inDot) { gl_FragColor = vec4(0., 0., 0., 1.); return; }

  // Rows occasionally tear sideways. At the handover the negative follows
  // the torn rows a whole cell at a time, so its dots stay on the grid.
  vec2 cc = ci + floor((from - p) / cell + .5);
  float row = floor(ci.y / 3.), beat = floor(time * 7.);
  if (hash(vec2(row, beat)) > .985 - .05 * tear.x) cc.x += floor((hash(vec2(beat, row)) - .5) * 14.);

  // Bits go where the B is: fine dither near it, coarse blocks far away.
  vec2 centre = (cc + .5) * cell;
  float focus = max(exp(-length(centre - origin) / (size * 1.9)),
    exp(-abs(dot(centre - origin, vec2(-dir.y, dir.x))) / (size * .22)) * .8);
  focus = max(focus, exp(-length(centre - pointer) / (size * .65)) * (.55 + .45 * pulse));
  vec2 sb = floor(cc / 16.);
  float key = floor(time * 2.4 + hash(sb) * 3.);
  float pickSize = hash(sb + key * .137);
  float block = focus > .5 ? 1. : (pickSize < .4 ? 2. : (pickSize < .78 ? 4. : 8.));
  if (focus > .28) block = min(block, 2.);
  vec2 sample_ = block > 1. ? (floor(cc / block) + .5) * block * cell : centre;

  // Datamosh: a few blocks show the picture from somewhere else.
  vec2 mb = floor(cc / 8.);
  float mosh = hash(mb + floor(time * 5.) * 1.31);
  if (mosh > .972 - .06 * tear.x) sample_ += (vec2(hash(mb * 1.7), hash(mb * 2.3)) - .5) * cell * 40.;

  // The pointer is a loupe over the picture; the grid itself stays put.
  vec2 lens = sample_ - pointer;
  sample_ = pointer + lens * (1. - (.3 + .22 * pulse) * exp(-dot(lens, lens) / (size * size * .7)));

  // The ghost of the calm scene dissolves, and later returns, block by block.
  vec2 gb = floor(ci / 8.);
  float delay = hash(gb * 1.7 + 3.1);
  float held = max(age < hold ? 1. : 0., age >= hold ? 1. - smoothstep(delay * .6, delay * .6 + .1, age - hold) : 0.);
  held = max(held, smoothstep(end - .32 + delay * .22, end - .26 + delay * .22, age)) * ghostReady;
  float threshold = (bayer(ci) + .5) / 16.;
  bool fromGhost = held > threshold;

  float tint;
  float level = scene(sample_, !fromGhost, tint);
  if (mosh > .992) level = .33 - level * .30;
  // Borrowed or inverted blocks still keep clear of the marks.
  level *= quiet(centre);

  vec3 colour;
  if (fromGhost) {
    // The held frame rises as it breaks up, and settles back as it re-forms,
    // so the glass B drifts out from behind the liquid and returns.
    float rise = min(smoothstep(hold - .08, hold + .56, age), 1. - smoothstep(end - .35, end, age));
    vec4 glass = heldGlass(sample_ + size * vec2(-.13, .46) * rise);
    // Print the optically dense edges in silver and preserve the lime kerf core.
    float ink = 1. - dot(glass.rgb, vec3(.27, .64, .09));
    float limeSignal = clamp((glass.g - max(glass.r * .82, glass.b * 1.45)) * 2.8, 0., 1.);
    float carrier = .035 + .12 * level;
    level = mix(carrier, .34 + .64 * max(ink, limeSignal * .85), glass.a) * quiet(centre);
    vec3 silver = mix(vec3(.26, .30, .26), vec3(.74, .81, .72), glass.a);
    colour = mix(silver, vec3(.72, .92, .25), limeSignal * .75);
  } else {
    float grey = smoothstep(.05, .9, level);
    colour = mix(vec3(.25, .28, .25), vec3(.78, .84, .76), grey);
    colour = mix(colour, vec3(.66, .86, .22) * (.65 + .50 * grey), tint * .88);
  }
  if (block > 1.) level = floor(level * 4. + .5) / 4.;

  // Subtle phosphor curvature across each lit square cell, and a dark unlit matrix.
  vec2 dotUV = (local - inset + .5) / max(lit, 1.) * 2. - 1.;
  float phosphor = 1.07 - .14 * dot(dotUV, dotUV);
  gl_FragColor = vec4(level > threshold ? colour * phosphor : vec3(.042, .045, .039), 1.);
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
  let ghostBox = [0, 0, 1, 1];

  return {
    canvas,
    resize(w, h, ratio) {
      // Software rasterisers draw the panel at CSS resolution.
      scale = software ? 1 : ratio;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
    },
    // Upload just the glass layer when available, before it is hidden.
    capture(source, [x, y, width, height], w, h) {
      ghostBox = [x / w, y / h, width / w, height / h];
      try { ghost = renderer.texture(source, ghost ?? undefined); } catch { ghost = null; }
    },
    render({ time, age, hold, end, rings, origin, dir, size, pointer, trail = pointer, wake = 0, pulse = 0, tear = [0, 0, 0, 0], lightAngle = 0 }) {
      if (gl.isContextLost()) return;
      const uniforms = {
        res: [canvas.width, canvas.height],
        cell: Math.max(3, Math.round(Math.min(5.5, Math.max(3, size * .018)) * scale)),
        time, age, hold, end, rings, size: size * scale, dir,
        origin: [origin[0] * scale, origin[1] * scale],
        pointer: [pointer[0] * scale, pointer[1] * scale],
        trail: [trail[0] * scale, trail[1] * scale],
        wake, lightAngle,
        ghostReady: ghost ? 1 : 0, ghostBox, pulse, tear, dpr: scale,
      };
      if (ghost) uniforms.ghost = ghost;
      renderer.draw(uniforms);
    },
  };
}
