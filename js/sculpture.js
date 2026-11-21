import { createField } from './field.js';
import { createGlass } from './glass.js';
import { makeReededGround, makeFurGround, makeHalo, HALO_PAD } from './glass-ground.js';
import { FLIGHT } from './glass-scifi.js';
import { prepareOil } from './oil-volume.js';
import { exposureTear } from './negative.js';
import { createSpectrum, aimBeams, makeBeams } from './spectrum.js';
import { createSpace } from './space.js';

// The two radii, baseline and diagonal kerf come from the production B mark.
// Both glass halves and their projected light share this exact silhouette.
const upper = { x: .57, y: .43, r: .43 };
const lower = { x: .71, y: 1.20, r: .49 };
const edge = (circle, y) => circle.x + Math.sqrt(Math.max(0, circle.r ** 2 - (y - circle.y) ** 2));
let join = .71;
while (edge(upper, join) > edge(lower, join)) join += .0001;

function arc(circle, from, to) {
  return Array.from({ length: 97 }, (_, i) => {
    const angle = from + (to - from) * i / 96;
    return [circle.x + circle.r * Math.cos(angle), circle.y + circle.r * Math.sin(angle)];
  });
}
const outline = [[0, 0], ...arc(upper, -Math.PI / 2, Math.asin((join - upper.y) / upper.r)),
  ...arc(lower, Math.asin((join - lower.y) / lower.r), Math.PI / 2), [0, 1.69]];

function cut(intercept, sign) {
  const points = [];
  const distance = ([x, y]) => sign * (y + .27875 * x - intercept);
  outline.forEach((point, i) => {
    const next = outline[(i + 1) % outline.length];
    const a = distance(point), b = distance(next);
    if (a >= 0) points.push(point);
    if ((a < 0) !== (b < 0)) {
      const t = a / (a - b);
      points.push(point.map((v, axis) => v + (next[axis] - v) * t));
    }
  });
  const path = new Path2D();
  points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
  path.closePath();
  return { path, points };
}
const halves = [cut(.9125, -1), cut(1.0475, 1)];
const plates = halves.map(half => half.path);

// The calm state is a block of reeded soda-lime glass. A lime filament in the
// kerf lights both halves through their cut edges, and vertical flutes slice
// that light, and everything behind the face, into stepped slivers.
const FLUTE = .046;
const DENSITY = 360;
const PAD = .5, PAD_Y = .06;
const KERF = .98;
const normal = [.27875, 1].map(v => v / Math.hypot(.27875, 1));
const lime = alpha => `rgba(176,221,52,${alpha})`;

// The filament runs along the kerf centre, inset from the B's contour.
const rightEdge = y => Math.max(edge(upper, y), edge(lower, y));
let filamentEnd = .05;
while (filamentEnd < 1.3 && filamentEnd < rightEdge(KERF - .27875 * filamentEnd) - .1) filamentEnd += .001;
const filament = new Path2D();
filament.moveTo(.09, KERF - .27875 * .09);
filament.lineTo(filamentEnd, KERF - .27875 * filamentEnd);

// What the 2D fallback's reeds see: pale glass over paper, a green rim of
// trapped light, the ghost of the back contour, and the glow from the kerf.
function paintBehind(plate, part) {
  const tile = document.createElement('canvas');
  tile.width = Math.ceil((1.21 + PAD * 2) * DENSITY);
  tile.height = Math.ceil((1.7 + PAD_Y * 2) * DENSITY);
  const g = tile.getContext('2d');
  g.scale(DENSITY, DENSITY);
  g.translate(PAD, PAD_Y);
  const wide = [-PAD, -PAD_Y, 1.21 + PAD * 2, 1.7 + PAD_Y * 2];

  const base = g.createLinearGradient(-.2, -.1, 1.3, 1.8);
  base.addColorStop(0, '#edf2e8');
  base.addColorStop(.48, '#dbe5d9');
  base.addColorStop(1, '#c4d2c4');
  g.fillStyle = base;
  g.fillRect(...wide);

  // Soft diagonal reflections. The flutes break them into steps.
  const streaks = g.createLinearGradient(-.3, 1.9, 1.5, -.2);
  [[0, 0], [.16, .56], [.24, 0], [.33, -.22], [.38, -.25], [.40, .36],
    [.48, .10], [.55, 0], [.67, .52], [.70, .56], [.72, -.11], [.84, 0], [1, .16]]
    .forEach(([at, a]) => streaks.addColorStop(at, a >= 0 ? `rgba(255,254,242,${a})` : `rgba(49,77,70,${-a})`));
  g.fillStyle = streaks;
  g.fillRect(...wide);

  // Light carried along inside the glass from the kerf.
  const towards = part ? 1 : -1;
  const cutIntercept = part ? 1.0475 : .9125;
  const x0 = .5, y0 = cutIntercept - .27875 * x0;
  const glow = g.createLinearGradient(x0, y0, x0 + towards * normal[0] * .5, y0 + towards * normal[1] * .5);
  glow.addColorStop(0, lime(.85));
  glow.addColorStop(.06, lime(.49));
  glow.addColorStop(.22, lime(.16));
  glow.addColorStop(.55, lime(.03));
  glow.addColorStop(1, lime(0));
  g.fillStyle = glow;
  g.fillRect(...wide);

  // Reflections of the filament repeat deeper inside the block.
  g.save();
  g.clip(plate);
  [[.041, .60], [.15, .33], [.34, .13]].forEach(([depth, alpha]) => {
    const reach = towards * (.065 + depth);
    g.save();
    g.translate(normal[0] * reach, normal[1] * reach);
    g.lineWidth = .007 + depth * .014;
    g.strokeStyle = lime(alpha);
    g.stroke(filament);
    g.lineWidth = .026;
    g.strokeStyle = lime(alpha * .25);
    g.stroke(filament);
    g.restore();
  });
  g.restore();

  // Trapped light darkens and greens the glass toward its edges.
  g.save();
  g.clip(plate);
  for (let k = 0; k < 8; k++) {
    g.lineWidth = .03 + k * .03;
    g.strokeStyle = 'rgba(58,84,60,.065)';
    g.stroke(plate);
  }
  g.restore();

  // The far wall is displaced through the thickness of the glass. Each
  // flute picks up a different part of its dark fold and its bright lip.
  g.save();
  g.translate(.085, -.054);
  g.lineWidth = .084;
  g.strokeStyle = 'rgba(49,87,73,.12)';
  g.stroke(plate);
  g.lineWidth = .019;
  g.strokeStyle = 'rgba(49,81,68,.43)';
  g.stroke(plate);
  g.translate(-.012, .007);
  g.lineWidth = .005;
  g.strokeStyle = 'rgba(255,255,231,.86)';
  g.stroke(plate);
  g.restore();

  // The filament itself, reachable only through the flutes beside the kerf.
  for (const [width, alpha] of [[.07, .14], [.034, .3], [.014, 1]]) {
    g.lineWidth = width;
    g.strokeStyle = width < .02 ? '#c9ef5c' : lime(alpha);
    g.stroke(filament);
  }
  return tile;
}
// The GPU traces its own light, so only the 2D fallback needs these.
let behind = null;
const behindTiles = () => behind ??= plates.map(paintBehind);

// The 2D fallback's sides follow the diamond-ground float-glass sea-teal finish.
const SIDE_STOPS = [
  [0, '#0e322e'], [.115, '#2b6d65'], [.17, '#d8f4ee'], [.207, '#5da69b'],
  [.38, '#13443e'], [.51, '#3d877c'], [.606, '#96d0c4'], [.64, '#e6f8f4'],
  [.69, '#4f9a8e'], [.84, '#185048'], [1, '#79beb2'],
];
const ARRIS_STOPS = [[0, '#fcfff2'], [.38, '#f1f6df'], [.63, '#9fae94'], [.78, '#e1e9d9'], [1, '#fefff0']];
const BACK = -.272, FRONT = .2805;
const reededGroundMap = makeReededGround(plates, FLUTE);
const furGroundMap = makeFurGround(plates);
const filamentLine = [[.09, KERF - .27875 * .09], [filamentEnd, KERF - .27875 * filamentEnd]];
const haloMap = makeHalo(plates, filamentLine);

// Without WebGL the glass is drawn on the stage canvas instead. Its faces are
// composed off screen from bitmaps that stay resident between frames.
const faceCanvases = plates.map(() => document.createElement('canvas'));
let faceSway = NaN, faceDensity = 0;

// The B sways slowly, so both faces are reused until the refraction has
// moved by about a quarter of a screen pixel.
function refreshFaces(sway, density) {
  if (density === faceDensity && Math.abs(sway - faceSway) < .0015) return;
  faceSway = sway;
  faceDensity = density;
  const fw = Math.ceil(1.21 * density), fh = Math.ceil(1.7 * density);
  faceCanvases.forEach((face, part) => {
    if (face.width !== fw || face.height !== fh) { face.width = fw; face.height = fh; }
    paintFace(face.getContext('2d'), plates[part], part, sway, density);
  });
}

// The 2D fallback: the reeds are composed flat, off screen, and the plate's
// own silhouette trims the composition.
function paintFace(g, plate, part, sway, density) {
  g.setTransform(density, 0, 0, density, 0, 0);
  g.globalCompositeOperation = 'source-over';
  const tile = behindTiles()[part];
  const flutes = Math.ceil(1.21 / FLUTE);
  const refract = sway * .62;
  const crest = sway * 2.1;
  for (let k = 0; k < flutes; k++) {
    const x = k * FLUTE;
    // Each reed compresses a wider strip of the scene behind it.
    const seen = FLUTE * 3.3;
    const centreX = x + FLUTE / 2 + refract + .011 * Math.sin(k * 2.31 + part);
    g.drawImage(tile, (centreX - seen / 2 + PAD) * DENSITY, PAD_Y * DENSITY, seen * DENSITY, 1.7 * DENSITY,
      x, 0, FLUTE + .0008, 1.7);
    const p = Math.min(.84, Math.max(.16, .5 + crest + (k - flutes / 2) * .009));
    const shade = g.createLinearGradient(x, 0, x + FLUTE, 0);
    shade.addColorStop(0, 'rgba(22,46,36,.6)');
    shade.addColorStop(.15, 'rgba(35,66,54,.1)');
    shade.addColorStop(p - .13, 'rgba(255,255,242,0)');
    shade.addColorStop(p, 'rgba(255,255,244,.75)');
    shade.addColorStop(p + .07, 'rgba(255,255,242,.04)');
    shade.addColorStop(.86, 'rgba(235,246,226,.14)');
    shade.addColorStop(1, 'rgba(22,46,36,.5)');
    g.fillStyle = shade;
    g.fillRect(x, 0, FLUTE, 1.7);
  }
  // A broad window reflection and transom bar ride over the reeds.
  const sheen = g.createLinearGradient(-.3 + sway, .1, 1.3 + sway, .9);
  sheen.addColorStop(.19, 'rgba(255,255,252,0)');
  sheen.addColorStop(.35, 'rgba(255,255,252,.25)');
  sheen.addColorStop(.44, 'rgba(255,255,252,.05)');
  sheen.addColorStop(.52, 'rgba(255,255,252,0)');
  sheen.addColorStop(.68, 'rgba(255,255,252,0)');
  sheen.addColorStop(.74, 'rgba(255,255,250,.11)');
  sheen.addColorStop(.81, 'rgba(255,255,252,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, 1.21, 1.7);
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = '#000';
  g.fill(plate);
}

const canvas = document.querySelector('.exhibit canvas');
const ctx = canvas.getContext('2d');
const stage = canvas.closest('main');
const wash = stage.querySelector('.studio-wash');
const chrome = document.querySelector('meta[name="theme-color"]');
const PAPER_TONE = '#e5e1d8', SPACE_TONE = '#03060b', LOUVER_TONE = '#c8c7f3', QUANTUM_TONE = '#0d1026';
const STAGE_TONES = [PAPER_TONE, SPACE_TONE, LOUVER_TONE, QUANTUM_TONE];
let chromeDark = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const pointer = {
  x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
  press: 0, tPress: 0, vPress: 0, pulse: 0,
  trailX: 0, trailY: 0, wake: 0,
};
// Tactile drag-to-inspect orbit with spring return on release.
const drag = {
  down: false, moved: false, startX: 0, startY: 0,
  x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
};
// Direct studio light angle (scroll wheel) and passive mobile tilt parallax.
const rig = { lightDeg: 0, lightRad: 0, lightTarget: 0, gyroX: 0, gyroY: 0 };
// Secondary spring follow-through for independent half-B magnetic coupling & levitating rift shards.
const kinetic = {
  lagX: 0, lagY: 0, vLagX: 0, vLagY: 0,
  twist: 0, vTwist: 0,
  shardX: 0, shardY: 0, vShardX: 0, vShardY: 0,
  shardSpin: 0,
};
// Travelling capillary ripple memory for the obsidian liquid shader.
const ripples = [[.56, .845, 10, 0], [.56, .845, 10, 0]];
let rippleSlot = 0;

function pushRipple(fx, fy, strength = 1) {
  ripples[rippleSlot] = [fx, fy, 0, strength];
  rippleSlot = (rippleSlot + 1) % ripples.length;
}

let w = canvas.clientWidth || innerWidth || 1, h = canvas.clientHeight || innerHeight || 1;
let size = Math.min(h * .31, w * .49), centre = h * .48, pixelRatio = Math.min(devicePixelRatio || 1, 2);
let time = 0, last = 0, frame = 0, lastTap = -1;

const field = createField(canvas);
const glass = createGlass(canvas, {
  outlines: halves.map(half => half.points), flute: FLUTE, back: BACK, front: FRONT,
  reededGroundMap, furGroundMap, halo: haloMap, haloPad: HALO_PAD, filament: filamentLine,
});
// Deep space behind the starship B; the paper returns for the other works.
const space = glass ? createSpace(canvas.closest('.exhibit').firstElementChild, { software: glass.software }) : null;
// Sunlight split by the glass, thrown across the paper behind it.
const spectrum = glass ? createSpectrum(glass.canvas, { software: glass.software }) : null;
const beams = makeBeams();
if (!glass) behindTiles().forEach((tile, part) => window.createImageBitmap?.(tile).then(bitmap => {
  behind[part] = bitmap;
  faceSway = NaN;
}, () => {}));

// Pre-allocated camera & uniform buffers to eliminate per-frame GC allocations.
const camRows = [new Float32Array(3), new Float32Array(3), new Float32Array(3)];
const rightVec = new Float32Array(3), downVec = new Float32Array(3);
const centreArr = [0, 0], viewArr = [0, 0], shiftArr = [0, 0], groundArr = [0, 0, 0, 0];
const focusArr = [0, 0], tearArr = [0, 0, 0, 0], pointerPxArr = [0, 0], trailPxArr = [0, 0], velArr = [0, 0];
const originArr = [0, 0], dirArr = [0, 0], pointerNormArr = [0, 0];
const halfMotionArr = [0, 0, 0, 0], shardMotionArr = [0, 0, 0, 0];

// The turn as three rows over the B's own axes: screen x, screen y, and
// depth, signed so the front face (larger z) is nearer.
function cameraRows(yaw, pitch, tilt) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ax = c * cy - s * sy * sp, ay = s * cy + c * sy * sp;
  const bx = -s * cp, by = c * cp;
  const zx = c * sy + s * cy * sp, zy = s * sy - c * cy * sp;
  const dx = bx * zy - zx * by, dy = zx * ay - ax * zy, dz = ax * by - bx * ay;
  const sign = dz > 0 ? -1 : 1;
  camRows[0][0] = ax; camRows[0][1] = bx; camRows[0][2] = zx;
  camRows[1][0] = ay; camRows[1][1] = by; camRows[1][2] = zy;
  camRows[2][0] = dx * sign; camRows[2][1] = dy * sign; camRows[2][2] = dz * sign;
  return camRows;
}

// Every place the B can reach as it sways, lifts, drags and follows the pointer.
function groundCard(sway, lift, lightAngle = 0, out = [0, 0, 0, 0]) {
  const eff = sway + lightAngle * .26;
  const stretch = Math.min(1, w / (size * 3.4)) * (1 + Math.max(-.42, Math.min(.42, eff)) * .34);
  out[0] = w / 2 + size * (.32 * stretch - eff * .19);
  out[1] = centre + size * (1.016 + lift * .23);
  out[2] = size * 1.28 * stretch;
  out[3] = size * .25;
  return out;
}

// The block's corners front and back, and the corners of its halo.
const reachPoints = [
  ...halves.flatMap(half => half.points.flatMap(([u, v]) => [[u, v, BACK], [u, v, FRONT]])),
  [-HALO_PAD, -HALO_PAD, 0], [1.21 + HALO_PAD, -HALO_PAD, 0],
  [1.21 + HALO_PAD, 1.69 + HALO_PAD, 0], [-HALO_PAD, 1.69 + HALO_PAD, 0],
];
// The starship's fleet flies inside an ellipsoid around the B.
const flightPoints = [];
for (let i = 0; i < 14; i++) for (let j = 0; j < 7; j++) {
  const a = i / 14 * Math.PI * 2, b = (j + .5) / 7 * Math.PI - Math.PI / 2;
  flightPoints.push([.56 + Math.cos(a) * Math.cos(b) * (FLIGHT[0] + .07), .845 + Math.sin(b) * (FLIGHT[1] + .07),
    Math.sin(a) * Math.cos(b) * (FLIGHT[2] + .07)]);
}
function reachOf(variant = glassVariant) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const points = variant === STARSHIP && glass ? [...reachPoints, ...flightPoints] : reachPoints;
  const steps = n => Array.from({ length: n }, (_, i) => i / (n - 1) * 2 - 1);
  for (const y of steps(5)) for (const p of steps(5)) for (const t of [-1, 1]) for (const offset of [-.06, .06]) {
    const yaw = -.46 + y * .95, pitch = -.16 + (p > 0 ? p * .58 : p * .48), tilt = -.115 + t * .045;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const ax = c * Math.cos(yaw) - s * Math.sin(yaw) * Math.sin(pitch);
    const ay = s * Math.cos(yaw) + c * Math.sin(yaw) * Math.sin(pitch);
    const bx = -s * Math.cos(pitch), by = c * Math.cos(pitch);
    const zx = c * Math.sin(yaw) + s * Math.cos(yaw) * Math.sin(pitch);
    const zy = s * Math.sin(yaw) - c * Math.cos(yaw) * Math.sin(pitch);
    for (const [u, v, z] of points) {
      const dv = v - .845 + offset;
      const x = w / 2 + size * (ax * (u - .56) + bx * dv + zx * z);
      const yy = centre + size * (ay * (u - .56) + by * dv + zy * z);
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], yy);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], yy);
    }
  }
  // The shadow and caustic lie on the ground beneath it.
  for (const sway of [-.58, .58]) {
    const [x, y, rx, ry] = groundCard(sway, .016, sway * .5);
    box[0] = Math.min(box[0], x - rx);
    box[2] = Math.max(box[2], x + rx);
    box[3] = Math.max(box[3], y + ry);
  }
  return box;
}

let glitchShowing = false, stageDrawn = true, glassDrawn = false;
let lastExposureEnd = -Infinity, tearBeat = 0, nextTear = 0, lastWashKey = '';
// Rotates through all 5 sculpture variants once per black-liquid exposure:
//   0 = Starship B, a kitbashed megastructure patrolled by a small fleet, in deep space
//   1 = Classic Reeded Architectural Float-Glass B
//   2 = Plush Fur B (Copper-Orange Fur + Violet Streaks, PBD Physics & Light Breeze)
//   3 = Architectural Terrazzo & Emerald Louver B (Kinetic Concentric Fins + Violet Grid Studio)
//   4 = Quantum Glass Voxel Core B (Micro-Grid Containment + 3D Neural Voxels + PCB Studio)
const GLASS_VARIANTS = 5, STARSHIP = 0, LOUVER = 3, VOXEL = 4;
// Featured themed worlds hold the stage long enough to explore unless a
// double-tap calls the glitch sooner.
const STARSHIP_STAY = 10.5, FEATURE_STAY = 10.0;
let glassVariant = 0, swappedExposure = null;
let stageMode = 0, spaceShiftX = 0, spaceShiftY = 0;

function stageModeFor(variant) {
  if (!space) return 0;
  if (variant === STARSHIP) return 1;
  if (variant === LOUVER) return 2;
  if (variant === VOXEL) return 3;
  return 0;
}

function setStage(mode) {
  mode = space ? mode : 0;
  stage.classList.toggle('space', mode === 1);
  stage.classList.toggle('louver', mode === 2);
  stage.classList.toggle('quantum', mode === 3);
  if (mode === stageMode) return;
  stageMode = mode;
  space?.activate(mode);
  if (chrome && !chromeDark) chrome.content = STAGE_TONES[mode] || PAPER_TONE;
}

// Each glitch hands the stage to the next work, unseen behind the black.
function advanceVariant() {
  glassVariant = (glassVariant + 1) % GLASS_VARIANTS;
  setStage(stageModeFor(glassVariant));
  if (glass) glass.resize(pixelRatio, reachOf(glassVariant));
  if (glassVariant === STARSHIP) glass?.arrive();
}
let oilVolume;
// Each exposure is planned afresh so no two play alike, tuned for a snappy,
// high-voltage changeover: 0-2 crisp opening stutters, a brisk black-liquid
// hold (~0.7-1.2s) with clean unseen mid-hold swap, fast sync-loss tear in/out,
// and an occasional brief relapse flash.
function planExposure(start, aftershock = false) {
  const flashes = [];
  let t = 0;
  const roll = Math.random();
  const count = aftershock ? (Math.random() < .45 ? 1 : 0) : roll < .42 ? 0 : roll < .85 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const length = .032 + Math.random() * .05;
    flashes.push([t, t + length, Math.max(.34, .82 - i * .2 - Math.random() * .12), .72 + Math.random() * .28]);
    t += length + .035 + Math.random() * .08;
  }
  const hold = aftershock ? .24 + Math.random() * .20
    : Math.random() < .10 ? 1.22 + Math.random() * .33 : .70 + Math.random() * .48;
  const end = t + hold;
  const tail = [];
  if (Math.random() < (aftershock ? .12 : .28)) {
    const after = end + .04 + Math.random() * .09;
    const length = .025 + Math.random() * .03;
    tail.push([after, after + length, .62 + Math.random() * .28, .58 + Math.random() * .42]);
  }
  const second = t > 0 ? t : .14 + Math.random() * .14;
  return {
    start, flashes, tail, aftershock, holdStart: t, end, finish: tail.length ? tail.at(-1)[1] : end,
    tearIn: Math.min(hold * .38, (aftershock ? .13 : .16) + Math.random() * .13),
    tearOut: Math.min(hold * .35, .14 + Math.random() * .13),
    entryCalm: count ? .36 : .58,
    rings: [0, second, second + .34 + Math.random() * .26],
    phase: Math.random() * 4, seed: Math.random(),
  };
}
if (!glass) glassVariant = 1;
setStage(stageModeFor(glassVariant));
let exposure = planExposure(stageMode === 1 ? STARSHIP_STAY + Math.random() * 3 : 3 + Math.random() * 3);

function exposureAge() {
  if (reduced.matches) return -1;
  const age = time - exposure.start;
  // The glass starts to recover when the hold ends, even if the signal
  // still relapses afterwards.
  if (age >= exposure.end && lastExposureEnd < exposure.start) {
    lastExposureEnd = exposure.start + exposure.end;
    if (swappedExposure !== exposure) {
      swappedExposure = exposure;
      advanceVariant();
    }
  }
  if (age >= exposure.finish) {
    // Waits average about thirteen seconds but range from six to twenty-six.
    // The starship and new themed works get a full stay with no premature aftershock.
    const featured = stageMode > 0;
    const minStay = glassVariant === STARSHIP ? STARSHIP_STAY : FEATURE_STAY;
    const shock = !featured && !exposure.aftershock && Math.random() < .14;
    let wait = shock ? 1.2 + Math.random() * 2.2 : 6 + Math.min(20, -Math.log(1 - Math.random()) * 7);
    if (featured) wait = Math.max(wait, minStay + Math.random() * 3.5);
    exposure = planExposure(time + wait, shock);
    return -1;
  }
  if (age < 0) return -1;
  const within = flashes => flashes.some(([a, b]) => age >= a && age < b);
  if (age < exposure.holdStart) return within(exposure.flashes) ? age : -1;
  if (age >= exposure.end) return within(exposure.tail) ? age : -1;
  return age;
}

// What the glitch's torn print rows need to rebuild the active themed backdrop behind the B.
function spaceStill() {
  return stageMode > 0 ? { mode: stageMode, view: [w, h], shift: [spaceShiftX, spaceShiftY] } : null;
}

function glassRamp(x, y, dx, dy, stops) {
  const gradient = ctx.createLinearGradient(x, y, x + dx, y + dy);
  stops.forEach(([at, tint]) => gradient.addColorStop(at, tint));
  return gradient;
}

// In the 2D renderer each depth slice catches a slightly different part
// of the same studio card. Reuse the ramps between changes in the light.
let wallGlint = -Infinity, wallRamps;
function reflectedWalls(glint) {
  if (Math.abs(glint - wallGlint) >= .012) {
    wallGlint = glint;
    wallRamps = Array.from({ length: 33 }, (_, i) => {
      const depth = i / 32;
      const fold = .22 * Math.exp(-((depth - .68) ** 2) / .026) - .095 * depth;
      return glassRamp(-.12 + glint + fold, .05, 1.52, .48, SIDE_STOPS);
    });
  }
  return wallRamps;
}

let stageBufW = 0, stageBufH = 0;
function ensureStageBuffer() {
  const cw = Math.max(1, Math.round(w * pixelRatio));
  const ch = Math.max(1, Math.round(h * pixelRatio));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  stageBufW = cw;
  stageBufH = ch;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function draw() {
  const age = exposureAge();
  const isNeg = age >= 0;
  // The held print can come straight from the last presented sculpture frame.
  if (isNeg && !glitchShowing && field) {
    if (glassDrawn) field.capture(glass.canvas, glass.box, w, h, spectrum && glassVariant === 1 ? beams : null, spaceStill());
    else field.capture(canvas, [0, 0, w, h], w, h);
  }
  glassDrawn = false;
  glitchShowing = isNeg;
  // While the GPU layer carries the calm scene, the stage canvas stays tiny
  // and untouched, avoiding redundant full-viewport 2D canvas compositing.
  if (stageDrawn) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stageDrawn = false;
  }
  stage.classList.toggle('negative', isNeg);
  // Through the hold, the browser's own chrome goes dark with the stage.
  const held = isNeg && age >= exposure.holdStart && age < exposure.end;
  if (chrome && held !== chromeDark) {
    chromeDark = held;
    chrome.content = held ? '#000000' : (STAGE_TONES[stageMode] || PAPER_TONE);
  }

  const yaw = -.46 + Math.sin(time * .30) * .055 + pointer.x * .18 + drag.x + rig.gyroX;
  const pitch = -.16 + Math.cos(time * .23) * .033 - pointer.y * .09 + drag.y + rig.gyroY;
  const tilt = -.115 + Math.sin(time * .22) * .018 + drag.x * .035;
  const rows = cameraRows(yaw, pitch, tilt);
  const r0 = rows[0], r1 = rows[1];
  const ax = r0[0], bx = r0[1], zx = r0[2];
  const ay = r1[0], by = r1[1], zy = r1[2];
  const lift = Math.sin(time * .56) * .012;
  const speed = Math.min(1, Math.hypot(pointer.vx, pointer.vy) * .18);
  const pulse = Math.min(1, Math.max(pointer.press * .65, pointer.pulse) + speed * .28);
  focusArr[0] = .56 + pointer.x * .48;
  focusArr[1] = .845 + pointer.y * .62;
  // Frame 0 renders at resting equilibrium (intro=1) to match rest.webp cleanly;
  // subsequent frames glide a subtle first-light wake over the first 1.15 seconds.
  const intro = time <= .001 || reduced.matches ? 1 : Math.min(1, time / 1.15);

  // Torn rows are re-cut on an irregular beat, faster than the frame rate
  // can make regular.
  const torn = isNeg ? exposureTear(age, exposure) : null;
  if (torn && time >= nextTear) {
    tearBeat = (tearBeat + 1) % 509;
    nextTear = time + .02 + Math.random() * .065;
  }
  if (torn) {
    tearArr[0] = torn[0]; tearArr[1] = torn[1]; tearArr[2] = tearBeat; tearArr[3] = exposure.seed;
  } else {
    tearArr[0] = 0; tearArr[1] = 0; tearArr[2] = 0; tearArr[3] = 0;
  }
  const spread = .008 + .012 * Math.sin(time * .38) + pointer.press * .0055;
  pointerPxArr[0] = (pointer.x + 1) * w * .5;
  pointerPxArr[1] = (pointer.y + 1) * h * .5;
  trailPxArr[0] = (pointer.trailX + 1) * w * .5;
  trailPxArr[1] = (pointer.trailY + 1) * h * .5;

  // Update ambient studio paper skylight wash smoothly without layout work.
  // On themed WebGL stages (space, louver studio, quantum PCB) the backdrop drifts subtly instead.
  if (stageMode > 0 && !isNeg) {
    const sx = Math.round((-rig.lightRad * 10 - pointer.x * 14) * 2) / 2;
    const sy = Math.round(-pointer.y * 10 * 2) / 2;
    if (sx !== spaceShiftX || sy !== spaceShiftY) {
      spaceShiftX = sx;
      spaceShiftY = sy;
      space.canvas.style.transform = `translate3d(${sx}px,${sy}px,0)`;
    }
  } else if (wash && !isNeg) {
    const wx = (-rig.lightRad * 48 - pointer.x * 16).toFixed(1);
    const wy = (-pointer.y * 12).toFixed(1);
    const key = wx + ',' + wy;
    if (key !== lastWashKey) {
      lastWashKey = key;
      wash.style.transform = `translate3d(${wx}px,${wy}px,0)`;
    }
  }

  const sway = yaw + .46;
  const glint = .10 * Math.sin(time * .35) + pointer.x * .14 - pointer.y * .035;
  const ground = groundCard(sway, lift, rig.lightRad, groundArr);
  const recovery = reduced.matches ? 1 : Math.min(1, (time - lastExposureEnd) / .74);
  const afterglow = reduced.matches ? 0 : Math.exp(-Math.max(0, time - lastExposureEnd) * 1.6);
  const glow = 1 + .1 * Math.sin(time * .9) * intro + .3 * pulse + .45 * afterglow;
  centreArr[0] = w * .5; centreArr[1] = centre;
  viewArr[0] = w; viewArr[1] = h;
  shiftArr[0] = -spread; shiftArr[1] = spread;
  pointerNormArr[0] = pointer.x; pointerNormArr[1] = pointer.y;
  const idleWave = time <= .001 || reduced.matches ? 0 : Math.min(1, time / 1.4);
  halfMotionArr[0] = kinetic.lagX * .032 + Math.sin(time * .46) * .0065 * idleWave;
  halfMotionArr[1] = -kinetic.lagX * .038 - Math.sin(time * .46 + .55) * .0075 * idleWave;
  halfMotionArr[2] = kinetic.twist * .032 + Math.sin(time * .37) * .014 * idleWave;
  halfMotionArr[3] = -kinetic.twist * .036 - Math.sin(time * .37 + .72) * .016 * idleWave;
  shardMotionArr[0] = kinetic.shardX * .085;
  shardMotionArr[1] = kinetic.shardY * .085;
  shardMotionArr[2] = pointer.press * .72 + pulse * .42;
  shardMotionArr[3] = kinetic.shardSpin;

  // Mid-hold swap: once the black liquid has fully taken over (after tear-in,
  // before tear-out), flip to the alternate glass work, render one hidden frame
  // onto .glass (opacity 0), and re-capture the field's print so tear-out and
  // the reforming dithered ghost materialize seamlessly as the new glass B.
  if (held && swappedExposure !== exposure) {
    const swapAt = Math.min(exposure.holdStart + exposure.tearIn, (exposure.holdStart + exposure.end) * .5);
    if (age >= swapAt) {
      swappedExposure = exposure;
      advanceVariant();
      if (field && glass?.render({
        rows, centre: centreArr, size, view: viewArr, lift, shift: shiftArr, glint, sway, pulse, ground,
        recovery: 0, lightAngle: rig.lightRad, intro: 1, glow: glow + .45, time, quality: glassQuality, detail: glassDetail,
        pointer: pointerNormArr, shocks: ripples, sun: null,
        halfMotion: halfMotionArr, shardMotion: shardMotionArr, variant: glassVariant,
      })) {
        field.capture(glass.canvas, glass.box, w, h, null, spaceStill());
      }
    }
  }

  glitchShown = glassShown = false;
  if (isNeg && field) {
    // The cut's light runs along the kerf as the B is turned on screen.
    const alongX = ax - .27875 * bx, alongY = ay - .27875 * by;
    const invLen = 1 / Math.hypot(alongX, alongY);
    originArr[0] = w * .5 + size * bx * (lift - .0211);
    originArr[1] = centre + size * by * (lift - .0211);
    dirArr[0] = alongX * invLen;
    dirArr[1] = alongY * invLen;
    field.render({
      time, age, size, hold: exposure.holdStart, end: exposure.end, rings: exposure.rings,
      origin: originArr, dir: dirArr,
      pointer: pointerPxArr, trail: trailPxArr, wake: pointer.wake,
      pulse, tear: tearArr, lightAngle: rig.lightRad,
    });
  }
  if (isNeg && oilVolume) {
    rightVec[0] = ax; rightVec[1] = bx; rightVec[2] = zx;
    downVec[0] = ay; downVec[1] = by; downVec[2] = zy;
    velArr[0] = pointer.vx + drag.vx * 1.4;
    velArr[1] = pointer.vy + drag.vy * 1.4;
    const drawn = oilVolume(ctx, {
      w, h, size, centre, pixelRatio, detail: oilDetail, right: rightVec, down: downVec,
      age: age + exposure.phase, lift, separation: spread,
      tear: tearArr, pulse, focus: focusArr, lightAngle: rig.lightRad,
      vel: velArr, rippleA: ripples[0], rippleB: ripples[1],
    });
    if (drawn) {
      glitchShown = drawn === 'layer';
      stageDrawn = drawn === 'stage';
      return;
    }
  }
  // Sunlight reaches the glass just after the arrival sweep, and again,
  // a little quicker, as the glass returns from each glitch.
  const dawn = reduced.matches ? 9 : Math.min(time - .85, (time - lastExposureEnd - .12) * 1.5);
  aimBeams(beams, {
    rows, centre: centreArr, size, lift, yaw, pitch, lightAngle: rig.lightRad, time, dawn, pulse,
    tall: Math.min(1, Math.max(0, (1.05 - w / h) / .55)),
  });
  // The GPU layer hides during a glitch, so a glitch without its liquid B
  // falls back to drawing the glass here.
  const useSpectrum = Boolean(spectrum && glassVariant === 1);
  if (!isNeg && glass?.render({
    rows, centre: centreArr, size, view: viewArr, lift, shift: shiftArr, glint, sway, pulse, ground,
    recovery, lightAngle: rig.lightRad, intro, glow, time, quality: glassQuality, detail: glassDetail,
    pointer: pointerNormArr, shocks: ripples, sun: useSpectrum ? beams.sun : null,
    halfMotion: halfMotionArr, shardMotion: shardMotionArr, variant: glassVariant,
  })) {
    glassDrawn = glassShown = true;
    if (spectrum) {
      if (useSpectrum && beams.lit) spectrum.render(beams, rig.lightRad);
      else spectrum.clear();
    }
    return;
  }
  spectrum?.clear();

  ensureStageBuffer();
  stageDrawn = true;
  if (!isNeg) {
    const [x, y, rx, ry] = ground;
    ctx.drawImage(reededGroundMap, x - rx, y - ry, rx * 2, ry * 2);
  }

  function plane(z, part) {
    const shift = (part * 2 - 1) * spread;
    const x = -.56 * ax + (-.845 + lift + shift) * bx + z * zx;
    const y = -.56 * ay + (-.845 + lift + shift) * by + z * zy;
    ctx.setTransform(ax * size * pixelRatio, ay * size * pixelRatio,
      bx * size * pixelRatio, by * size * pixelRatio,
      (w / 2 + x * size) * pixelRatio, (centre + y * size) * pixelRatio);
  }
  if (!isNeg) {
    plane(0, .5);
    ctx.globalAlpha = Math.min(1, .62 * glow + .24 * pulse);
    ctx.drawImage(haloMap, -HALO_PAD, -HALO_PAD, 1.21 + HALO_PAD * 2, 1.69 + HALO_PAD * 2);
    ctx.globalAlpha = 1;
  }
  const sides = reflectedWalls(glint + rig.lightRad * .22);
  refreshFaces(sway + rig.lightRad * .22, Math.min(size * pixelRatio, 760));
  // Only the rim of each layer can show past the face in front of it, so the
  // block's sides are built from overlapping outline strokes, not fills.
  ctx.lineJoin = 'round';
  const arris = glassRamp(0, 0, 1, 1, ARRIS_STOPS);
  for (let layer = 0; layer < 33; layer++) {
    const z = (layer - 16) * .017;
    plates.forEach((plate, part) => {
      plane(z + .004, part);
      ctx.strokeStyle = sides[layer];
      ctx.lineWidth = .024;
      ctx.stroke(plate);
      if (layer === 0) {
        ctx.lineWidth = .004;
        ctx.strokeStyle = 'rgba(232,240,220,.7)';
        ctx.stroke(plate);
      }
      if (layer !== 32) return;
      plane(z + .0085, part);
      ctx.drawImage(faceCanvases[part], 0, 0, faceCanvases[part].width / faceDensity, faceCanvases[part].height / faceDensity);
      ctx.lineWidth = .006;
      ctx.strokeStyle = arris;
      ctx.stroke(plate);
    });
    // The filament is a thin lit bar through the middle of the block.
    if (layer >= 7 && layer <= 25) {
      plane(z + .0085, .5);
      ctx.lineCap = 'round';
      ctx.lineWidth = .012;
      ctx.strokeStyle = '#b4dc3c';
      ctx.stroke(filament);
      if (layer === 25) {
        for (const [width, tint] of [[.06, lime(.07)], [.03, lime(.16)], [.006, '#f6ffd6']]) {
          ctx.lineWidth = width;
          ctx.strokeStyle = tint;
          ctx.stroke(filament);
        }
      }
    }
  }
}

// The liquid is the costliest layer, so only its internal resolution adapts.
// Slow glitch frames step it down, a long run of quick ones steps it back up,
// and the rest of the page always renders at full sharpness. Steps are coarse
// so the liquid's buffer is rarely reallocated.
let oilDetail = (devicePixelRatio || 1) > 1.5 ? .8 : 1;
let oilPace = 1 / 60, quickRun = 0, glitchShown = false;
function paceOil(elapsed) {
  oilPace += (Math.min(elapsed, .1) - oilPace) * .1;
  if (oilPace > 1 / 42 && oilDetail > .4) {
    oilDetail = Math.round(oilDetail * 10 - 1) / 10;
    oilPace = 1 / 60;
    quickRun = 0;
  } else if (elapsed < 1 / 52 && ++quickRun > 75 && oilDetail < 1) {
    oilDetail = Math.round(oilDetail * 10 + 1) / 10;
    quickRun = 0;
  }
}

// Multi-tier adaptive quality governor for the ray-traced glass B.
// Keeps full native sharpness across Tier 2 (Ultra) and Tier 1 (Balanced),
// ignoring stray GC hitches while reacting smoothly on sustained low-spec load.
const maxGlassQuality = glass?.software ? 1 : 2;
let glassQuality = maxGlassQuality, glassDetail = 1;
let glassPace = 1 / 60, slowGlassRun = 0, quickGlassRun = 0, glassShown = false;
function paceGlass(elapsed) {
  glassPace += (Math.min(elapsed, .055) - glassPace) * .08;
  const downThreshold = glassQuality === 2 ? 1 / 44 : glassQuality === 1 ? 1 / 38 : 1 / 34;
  if (glassPace > downThreshold) {
    quickGlassRun = 0;
    if (++slowGlassRun >= 10) {
      if (glassQuality > 0) glassQuality--;
      else if (glassDetail > .66) glassDetail = Math.max(.65, Math.round((glassDetail - .14) * 100) / 100);
      glassPace = 1 / 60;
      slowGlassRun = 0;
    }
  } else {
    slowGlassRun = Math.max(0, slowGlassRun - 1);
    if (elapsed < 1 / 55 && (glassQuality < maxGlassQuality || glassDetail < 1)) {
      if (++quickGlassRun >= 100) {
        if (glassDetail < 1) glassDetail = Math.min(1, Math.round((glassDetail + .15) * 100) / 100);
        else if (glassQuality < maxGlassQuality) glassQuality++;
        quickGlassRun = 0;
      }
    } else if (elapsed > 1 / 48) {
      quickGlassRun = 0;
    }
  }
}

// A critically damped turn gives the block weight when the finger changes
// direction. Its settling time is independent of the display's refresh rate.
function followPointer(dt) {
  const rate = 9.5, decay = Math.exp(-rate * dt);
  const dx = pointer.x - pointer.tx, dy = pointer.y - pointer.ty;
  const mx = pointer.vx + rate * dx, my = pointer.vy + rate * dy;
  pointer.x = pointer.tx + (dx + mx * dt) * decay;
  pointer.y = pointer.ty + (dy + my * dt) * decay;
  pointer.vx = (pointer.vx - rate * mx * dt) * decay;
  pointer.vy = (pointer.vy - rate * my * dt) * decay;

  const dp = pointer.press - pointer.tPress;
  const mp = pointer.vPress + 12 * dp, pDecay = Math.exp(-12 * dt);
  pointer.press = pointer.tPress + (dp + mp * dt) * pDecay;
  pointer.vPress = (pointer.vPress - 12 * mp * dt) * pDecay;
  pointer.pulse *= Math.exp(-3.2 * dt);

  // Drag orbit spring physics (weightier return than hover tilt).
  const dRate = drag.down ? 14 : 7.8, dDecay = Math.exp(-dRate * dt);
  const ddx = drag.x - drag.tx, ddy = drag.y - drag.ty;
  const dmx = drag.vx + dRate * ddx, dmy = drag.vy + dRate * ddy;
  drag.x = drag.tx + (ddx + dmx * dt) * dDecay;
  drag.y = drag.ty + (ddy + dmy * dt) * dDecay;
  drag.vx = (drag.vx - dRate * dmx * dt) * dDecay;
  drag.vy = (drag.vy - dRate * dmy * dt) * dDecay;

  // Smooth studio light sweep, phosphor comet trail, and capillary ripple waves.
  rig.lightRad += (rig.lightTarget - rig.lightRad) * (1 - Math.exp(-10 * dt));
  const tLerp = 1 - Math.exp(-7.5 * dt);
  pointer.trailX += (pointer.x - pointer.trailX) * tLerp;
  pointer.trailY += (pointer.y - pointer.trailY) * tLerp;
  const spd = Math.min(1, Math.hypot(pointer.vx, pointer.vy) * .22);
  pointer.wake = Math.max(pointer.wake * Math.exp(-4.2 * dt), spd);
  for (const rip of ripples) if (rip[3] > 0 && rip[2] < 3.5) rip[2] += dt;

  // Secondary spring follow-through for half-B magnetic shear/torsion & levitating shards.
  const kRate = 6.2, kDec = Math.exp(-kRate * dt);
  const tLagX = Math.max(-1, Math.min(1, drag.vx * .34 + pointer.vx * .14));
  const tLagY = Math.max(-1, Math.min(1, drag.vy * .34 + pointer.vy * .14));
  const kdx = kinetic.lagX - tLagX, kmx = kinetic.vLagX + kRate * kdx;
  kinetic.lagX = tLagX + (kdx + kmx * dt) * kDec;
  kinetic.vLagX = (kinetic.vLagX - kRate * kmx * dt) * kDec;
  const tTwist = Math.max(-1, Math.min(1, drag.x * .95 + drag.vx * .22));
  const kdt = kinetic.twist - tTwist, kmt = kinetic.vTwist + kRate * kdt;
  kinetic.twist = tTwist + (kdt + kmt * dt) * kDec;
  kinetic.vTwist = (kinetic.vTwist - kRate * kmt * dt) * kDec;

  const sRate = 4.6, sDec = Math.exp(-sRate * dt);
  const sdx = kinetic.shardX - (-tLagX), smx = kinetic.vShardX + sRate * sdx;
  kinetic.shardX = -tLagX + (sdx + smx * dt) * sDec;
  kinetic.vShardX = (kinetic.vShardX - sRate * smx * dt) * sDec;
  const sdy = kinetic.shardY - (-tLagY), smy = kinetic.vShardY + sRate * sdy;
  kinetic.shardY = -tLagY + (sdy + smy * dt) * sDec;
  kinetic.vShardY = (kinetic.vShardY - sRate * smy * dt) * sDec;
  kinetic.shardSpin += (drag.vx * .65 + pointer.vx * .22) * dt;
}

function tick(now) {
  frame = 0;
  const elapsed = last ? Math.max(0, (now - last) / 1000) : 0;
  const dt = Math.min(elapsed, .06);
  last = now;
  // Each interval reflects the cost of the frame drawn before it.
  if (elapsed && glitchShown) paceOil(elapsed);
  if (elapsed && glassShown && time > .6) paceGlass(elapsed);
  if (!reduced.matches) {
    if (oilVolume === undefined && time > .5) oilVolume = prepareOil(canvas);
    time += dt;
    followPointer(dt);
  }
  draw();
  if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
}

function refresh() {
  cancelAnimationFrame(frame);
  last = 0;
  if (!document.hidden) frame = requestAnimationFrame(tick);
}

function fitCanvas() {
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (!cw || !ch) return false;
  w = cw;
  h = ch;
  pixelRatio = Math.min(devicePixelRatio || 1, 2);
  field?.resize(w, h, pixelRatio);
  size = Math.min(h * .31, w * .49);
  centre = h * .48;
  glass?.resize(pixelRatio, reachOf());
  spectrum?.resize(w, h, pixelRatio);
  space?.resize(w, h, pixelRatio);
  // Keep the underlying 2D stage canvas at 1x1 while WebGL draws calm frames
  // so the browser avoids compositing an empty full-viewport 2D bitmap.
  if (!glass) ensureStageBuffer();
  else if (canvas.width !== 1 || canvas.height !== 1) {
    canvas.width = 1;
    canvas.height = 1;
    stageBufW = stageBufH = 1;
  }
  return true;
}

function resize() {
  if (!fitCanvas()) return;
  draw();
  document.querySelector('.silhouette').hidden = true;
  stage.classList.add('ready');
  refresh();
}

function pointAt(event) {
  if (!event.isPrimary || !w || !h) return;
  const nx = event.clientX / w * 2 - 1;
  const ny = event.clientY / h * 2 - 1;
  if (Number.isFinite(nx)) pointer.tx = Math.max(-1, Math.min(1, nx));
  if (Number.isFinite(ny)) pointer.ty = Math.max(-1, Math.min(1, ny));
}

canvas.addEventListener('pointermove', event => {
  pointAt(event);
  if (drag.down && event.isPrimary) {
    const dx = (event.clientX - drag.startX) / Math.max(240, w * .45);
    const dy = (event.clientY - drag.startY) / Math.max(240, h * .45);
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) {
      drag.moved = true;
      stage.classList.add('dragging');
    }
    if (drag.moved) {
      drag.tx = Math.max(-.82, Math.min(.82, dx * .95));
      drag.ty = Math.max(-.42, Math.min(.50, -dy * .68));
    }
  }
});

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary) return;
  pointAt(event);
  pointer.tPress = 1;
  pointer.pulse = 1;
  drag.down = true;
  drag.moved = false;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  pushRipple(.56 + pointer.tx * .48, .845 + pointer.ty * .62, 1);
  if (!reduced.matches && time - lastTap < .35 && exposureAge() < 0) {
    if (oilVolume === undefined) oilVolume = prepareOil(canvas);
    exposure = planExposure(time);
  }
  lastTap = time;
});

function releaseDrag() {
  drag.down = false;
  drag.moved = false;
  drag.tx = 0;
  drag.ty = 0;
  stage.classList.remove('dragging');
}
function release() {
  pointer.tx = pointer.ty = pointer.tPress = 0;
  releaseDrag();
}
canvas.addEventListener('pointerleave', release);
canvas.addEventListener('pointercancel', release);
window.addEventListener('pointerup', event => {
  if (!event.isPrimary) return;
  pointer.tPress = 0;
  releaseDrag();
  if (event.pointerType !== 'mouse') pointer.tx = pointer.ty = 0;
});

// Wheel smoothly rotates the 360-deg studio light rig & prism angle without scrolling.
stage.addEventListener('wheel', event => {
  if (reduced.matches) return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  rig.lightDeg = Math.max(-180, Math.min(180, rig.lightDeg + Math.sign(delta) * Math.min(9, Math.abs(delta) * .08)));
  rig.lightTarget = rig.lightDeg * Math.PI / 180;
}, { passive: false });

// Subtle passive mobile tilt parallax when available.
window.addEventListener('deviceorientation', event => {
  if (event.gamma == null || event.beta == null) return;
  rig.gyroX = Math.max(-.12, Math.min(.12, event.gamma / 45 * .12));
  rig.gyroY = Math.max(-.08, Math.min(.08, (event.beta - 45) / 45 * .08));
}, { passive: true });

document.addEventListener('visibilitychange', refresh);
reduced.addEventListener('change', refresh);
new ResizeObserver(resize).observe(canvas);
