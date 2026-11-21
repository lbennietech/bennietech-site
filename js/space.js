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

// ---------------------------------------------------------------------------
// Stage 2: Architectural Terrazzo & Emerald Louver Studio (Image 1 mood)
// Luminous cool-lavender tiled gallery wall above a vibrant perspective
// ultraviolet-to-magenta coordinate grid floor.
// ---------------------------------------------------------------------------
float gridLine(float coord, float w) {
  float d = abs(fract(coord + .5) - .5);
  return 1. - smoothstep(0., max(w, .001), d);
}

vec3 louverStageColor(vec2 p) {
  vec2 v = max(spaceView, vec2(1.));
  vec2 uv = p / v;
  float aspect = v.x / v.y;
  float tall = clamp((1.05 - aspect) / .55, 0., 1.);
  // Horizon sits behind the lower waist of the B so the luminous floor wraps
  // cleanly beneath the floating sculpture while keeping the top-left bright.
  float horiz = mix(.61, .64, tall);

  // Architectural studio wall: luminous cool pale-periwinkle architectural tiles (Image 1 back wall!).
  vec2 wallUv = vec2((uv.x - .5) * aspect, uv.y);
  vec3 wallTop = vec3(.845, .845, .968);
  vec3 wallBot = vec3(.735, .725, .958);
  vec3 wall = mix(wallTop, wallBot, smoothstep(0., horiz, uv.y));
  // Soft overhead daylight gradient falling behind the hero B
  float keyGlow = exp(-dot((uv - vec2(.56, .24)) * vec2(1.1, 1.55), (uv - vec2(.56, .24)) * vec2(1.1, 1.55)) * 1.8);
  wall += vec3(.09, .088, .062) * keyGlow;

  // Crisp large-format architectural concrete/tile panel seams
  vec2 tileG = (wallUv + vec2(.16, .04)) * vec2(4.4, 4.4);
  float seamPx = 4.4 / v.y * 1.1;
  float tileSeam = max(gridLine(tileG.x, seamPx), gridLine(tileG.y, seamPx));
  vec2 tid = floor(tileG + .5);
  float tTone = sHash(tid + 17.3);
  wall *= .972 + .038 * tTone;

  // Clean luminous architectural gallery wall (zero blurry stickers; crisp panel seams & subtle cobalt studio air)
  float sideWash = smoothstep(.26, .95, abs(uv.x - .5)) * smoothstep(.04, .60, uv.y);
  wall = mix(wall, vec3(.66, .66, .96), sideWash * .22);

  // Keep top-left brand lockup spotless, bright, and 100% legible.
  vec2 lock = (p - vec2(115., 36.)) / vec2(240., 96.);
  float quietLock = exp(-dot(lock, lock));
  wall = mix(wall, vec3(.882, .884, .974), quietLock * .78);
  wall -= vec3(.085, .085, .135) * tileSeam * (1. - quietLock * .88) * .58;

  // Perspective isometric-feel ultraviolet -> electric magenta drafting grid floor (Image 1 exact palette!).
  float dy = max(uv.y - horiz, .0008);
  float zf = .35 / (dy + .078);
  float xf = (uv.x - .5) * aspect * zf * 1.15;
  // ~28 deg isometric diagonal orientation matching Image 1's iconic grid!
  mat2 rotG = mat2(.8829, -.4695, .4695, .8829);
  vec2 gp = rotG * vec2(xf, zf) * 4.45;
  float dzdy = .35 / ((dy + .078) * (dy + .078)) / v.y;
  float fw = clamp(dzdy * 4.6 + zf * 4.4 / v.y, .014, .24);
  float gMajor = max(gridLine(gp.x, fw), gridLine(gp.y, fw));
  float gSub = max(gridLine(gp.x * 2., fw * 1.8), gridLine(gp.y * 2., fw * 1.8)) * smoothstep(2.4, .85, zf);

  // Saturated cobalt-violet (left) -> electric ultraviolet -> radiant magenta (right) floor!
  float diagFloor = clamp(uv.x * .74 + (uv.y - horiz) / (1. - horiz) * .62, 0., 1.);
  vec3 floorCol = mix(vec3(.24, .17, .88), vec3(.47, .14, .93), smoothstep(.04, .56, diagFloor));
  floorCol = mix(floorCol, vec3(.76, .13, .95), smoothstep(.38, 1.0, diagFloor));
  // Subtle light bounce directly in front of the floating sculpture
  vec2 hotD = (uv - vec2(.53, horiz + .21)) * vec2(1.45, 2.5);
  floorCol += vec3(.13, .08, .16) * exp(-dot(hotD, hotD) * 2.4);
  // Razor-crisp luminous lavender-white coordinate grid lines
  float horizonFade = smoothstep(.0, .048, uv.y - horiz) * (1. - smoothstep(2.5, 4.8, zf));
  vec3 lineCol = mix(vec3(.76, .72, 1.), vec3(1., .84, 1.), diagFloor);
  floorCol = mix(floorCol, lineCol, gMajor * .62 * horizonFade);
  floorCol = mix(floorCol, lineCol, gSub * .16 * horizonFade);
  // Crisp architectural cove seam where studio wall meets drafting floor
  float cove = exp(-abs(uv.y - horiz) / .014);
  vec3 col = mix(wall, floorCol, smoothstep(horiz - .002, horiz + .002, uv.y));
  col = mix(col, vec3(.28, .22, .82), cove * .28);
  // Gentle photographic corner vignette
  vec2 vig = (uv - .5) * vec2(1.06, 1.12);
  col *= 1. - .13 * smoothstep(.45, 1.05, length(vig));
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

vec3 voxelStageColor(vec2 p) {
  vec2 v = max(spaceView, vec2(1.));
  vec2 uv = p / v;
  float aspect = v.x / v.y;
  vec2 c = (uv - vec2(.50, .48)) * vec2(aspect, 1.);
  // Subtle clean studio perspective plane (mild slope keeps traces razor-crisp and isotropic!)
  float persp = 1. / (1. + (.48 - uv.y) * .36);
  mat2 iso = mat2(.819, -.573, .573, .819);
  vec2 pcb = iso * vec2(c.x * persp * 1.15, c.y * persp * 1.24);

  float px = (1. / max(v.y, 1.)) * 24. * persp;
  float etch1 = pcbEtch(pcb * 19., px);
  float etch2 = pcbEtch(pcb * 38. + vec2(4.7, 2.1), px * 1.5);
  // Subtle directional embossed metallic bevel shading (dark engraved groove + crisp specular lip!)
  float etchEmb = pcbEtch((pcb + vec2(.0035, .0035)) * 19., px);
  float highlight = max(0., etch1 - etchEmb * .65) * .72 + etch2 * .26;
  float groove = max(0., etchEmb - etch1 * .65);

  // Deep silky midnight slate-indigo PCB substrate (Image 2 luxury dark tone!)
  vec3 col = mix(vec3(.007, .009, .026), vec3(.024, .028, .072), smoothstep(.98, .05, length(c * vec2(.85, 1.05))));

  // Focused neon-magenta & sapphire-cobalt indirect bounce light radiating directly from the B!
  float rB = length(c * vec2(1.06, .92));
  float pinkBounce = exp(-rB * rB * 5.0);
  float blueBounce = exp(-length((c - vec2(-.10, .14)) * vec2(1.15, 1.25)) * 3.8);
  col += vec3(.078, .010, .108) * pinkBounce;
  col += vec3(.012, .038, .135) * blueBounce;

  // Etched dark-metallic PCB traces catch ONLY a subtle, razor-crisp metallic sheen!
  vec3 traceLit = vec3(.024, .034, .085) + vec3(.22, .04, .22) * pinkBounce + vec3(.04, .14, .34) * blueBounce;
  col += traceLit * highlight * (.48 + .72 * pinkBounce + .48 * blueBounce);
  col *= 1. - groove * .34;

  // Two razor-thin glossy electric-cobalt fiber-optic cables sweeping cleanly across the lower floor
  float cY1 = .76 + .065 * sin((uv.x - .5) * 4.5 + .4) + (uv.x - .5) * .14;
  float cY2 = .83 - .055 * sin((uv.x - .5) * 3.8 - .5) - (uv.x - .5) * .11;
  float dCab1 = abs(uv.y - cY1) * v.y;
  float dCab2 = abs(uv.y - cY2) * v.y;
  float cabMask1 = smoothstep(.07, .24, abs(uv.x - .5));
  float cabMask2 = smoothstep(.09, .26, abs(uv.x - .5));
  col *= 1. - exp(-abs(uv.y - (cY1 + .0045)) * v.y / 3.2) * cabMask1 * .45;
  col *= 1. - exp(-abs(uv.y - (cY2 + .0045)) * v.y / 3.2) * cabMask2 * .40;
  col += vec3(.08, .36, 1.15) * (exp(-dCab1 * dCab1 / 1.8) * cabMask1 * .72 + exp(-dCab2 * dCab2 / 1.6) * cabMask2 * .52);
  col += vec3(.45, .82, 1.3) * exp(-dCab1 * dCab1 / .45) * cabMask1 * .35;

  // Keep top-left corner behind the night wordmark calm, dark, and razor-sharp.
  vec2 lock = (p - vec2(115., 36.)) / vec2(240., 95.);
  float quietLock = 1. - .68 * exp(-dot(lock, lock));
  col *= quietLock;

  // Cinematic studio vignette drawing 100% focus to the glowing quantum B!
  vec2 vig = (uv - .5) * vec2(1.08, 1.15);
  col *= 1. - .46 * smoothstep(.30, .96, length(vig));
  return spaceTone(col * 1.18);
}

vec3 stageColor(vec2 p, float mode) {
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
    // Mode: 0 = off (paper), 1 = deep space, 2 = louver studio, 3 = quantum PCB studio.
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
