import { createField } from './field.js';
import { createGlass } from './glass.js';
import { makeGround, makeHalo, HALO_PAD } from './glass-ground.js';
import { prepareOil } from './oil-volume.js';
import { exposureTear } from './negative.js';

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

// The 2D fallback's polished sides follow what the traced walls show: a
// dark mirror of the studio, a crisp light strip, and bottle-green glass.
const SIDE_STOPS = [
  [0, '#12261c'], [.115, '#3f7a5f'], [.17, '#f2fbef'], [.207, '#7fb393'],
  [.38, '#173a2b'], [.51, '#5c9a7c'], [.606, '#bfe2c8'], [.64, '#f6fbf1'],
  [.69, '#6fa888'], [.84, '#1f4636'], [1, '#9cc8ac'],
];
const ARRIS_STOPS = [[0, '#fcfff2'], [.38, '#f1f6df'], [.63, '#9fae94'], [.78, '#e1e9d9'], [1, '#fefff0']];
const BACK = -.272, FRONT = .2805;
const groundMap = makeGround(plates, FLUTE);
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
const paperTone = chrome?.content;
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
// Travelling capillary ripple memory for the obsidian liquid shader.
const ripples = [[.56, .845, 10, 0], [.56, .845, 10, 0]];
let rippleSlot = 0;

function pushRipple(fx, fy, strength = 1) {
  ripples[rippleSlot] = [fx, fy, 0, strength];
  rippleSlot = (rippleSlot + 1) % ripples.length;
}

let w, h, size, centre, pixelRatio, time = 0, last = 0, frame = 0, lastTap = -1;

const field = createField(canvas);
const glass = createGlass(canvas, {
  outlines: halves.map(half => half.points), flute: FLUTE, back: BACK, front: FRONT, groundMap,
  halo: haloMap, haloPad: HALO_PAD, filament: filamentLine,
});
if (!glass) behindTiles().forEach((tile, part) => window.createImageBitmap?.(tile).then(bitmap => {
  behind[part] = bitmap;
  faceSway = NaN;
}, () => {}));

// The turn as three rows over the B's own axes: screen x, screen y, and
// depth, signed so the front face (larger z) is nearer.
function turn(ax, ay, bx, by, zx, zy) {
  const depth = [bx * zy - zx * by, zx * ay - ax * zy, ax * by - bx * ay];
  const sign = depth[2] > 0 ? -1 : 1;
  return [[ax, bx, zx], [ay, by, zy], depth.map(v => v * sign)];
}

function cameraRows(yaw, pitch, tilt) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return turn(c * cy - s * sy * sp, s * cy + c * sy * sp, -s * cp, c * cp,
    c * sy + s * cy * sp, s * sy - c * cy * sp);
}

// Every place the B can reach as it sways, lifts, drags and follows the pointer.
function groundCard(sway, lift, lightAngle = 0) {
  const eff = sway + lightAngle * .26;
  const stretch = Math.min(1, w / (size * 3.4)) * (1 + Math.max(-.42, Math.min(.42, eff)) * .34);
  return [w / 2 + size * (.32 * stretch - eff * .19), centre + size * (1.016 + lift * .23),
    size * 1.28 * stretch, size * .25];
}

// The block's corners front and back, and the corners of its halo.
const reachPoints = [
  ...halves.flatMap(half => half.points.flatMap(([u, v]) => [[u, v, BACK], [u, v, FRONT]])),
  [-HALO_PAD, -HALO_PAD, 0], [1.21 + HALO_PAD, -HALO_PAD, 0],
  [1.21 + HALO_PAD, 1.69 + HALO_PAD, 0], [-HALO_PAD, 1.69 + HALO_PAD, 0],
];
function reachOf() {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const steps = n => Array.from({ length: n }, (_, i) => i / (n - 1) * 2 - 1);
  for (const y of steps(5)) for (const p of steps(5)) for (const t of [-1, 1]) for (const offset of [-.048, .048]) {
    const yaw = -.46 + y * .56, pitch = -.16 + p * .28, tilt = -.115 + t * .022;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const ax = c * Math.cos(yaw) - s * Math.sin(yaw) * Math.sin(pitch);
    const ay = s * Math.cos(yaw) + c * Math.sin(yaw) * Math.sin(pitch);
    const bx = -s * Math.cos(pitch), by = c * Math.cos(pitch);
    const zx = c * Math.sin(yaw) + s * Math.cos(yaw) * Math.sin(pitch);
    const zy = s * Math.sin(yaw) - c * Math.cos(yaw) * Math.sin(pitch);
    for (const [u, v, z] of reachPoints) {
      const dv = v - .845 + offset;
      const x = w / 2 + size * (ax * (u - .56) + bx * dv + zx * z);
      const yy = centre + size * (ay * (u - .56) + by * dv + zy * z);
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], yy);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], yy);
    }
  }
  // The shadow and caustic lie on the ground beneath it.
  for (const sway of [-.52, .52]) {
    const [x, y, rx, ry] = groundCard(sway, .012, sway * .5);
    box[0] = Math.min(box[0], x - rx);
    box[2] = Math.max(box[2], x + rx);
    box[3] = Math.max(box[3], y + ry);
  }
  return box;
}

let glitchShowing = false, stageDrawn = true, glassDrawn = false;
let lastExposureEnd = -Infinity, tearBeat = 0, nextTear = 0, lastWashKey = '';
let oilVolume;
// Each exposure is planned afresh so no two play alike: a stutter of up to
// three brief flashes, a hold of uneven length, rings and drips in their own
// phase, and an irregular wait before the next. Now and then a short
// aftershock follows closely behind.
//
// Every flash is [start, end, share of the calm print it keeps, how hard it
// tears]. Each opening flash bites further into the print. The hold tears in
// and out over its own uneven lengths, and about half the time the signal
// relapses for a frame or two after it has locked back onto the glass.
function planExposure(start, aftershock = false) {
  const flashes = [];
  let t = 0;
  const roll = Math.random();
  const count = aftershock ? 1 + (Math.random() < .5) : roll < .2 ? 0 : roll < .62 ? 1 : roll < .88 ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const length = .045 + Math.random() * .13;
    flashes.push([t, t + length, Math.max(.3, .84 - i * .18 - Math.random() * .14), .7 + Math.random() * .3]);
    t += length + .07 + Math.random() * .3;
  }
  const hold = aftershock ? .35 + Math.random() * .5
    : Math.random() < .12 ? 3.4 + Math.random() * 1.2 : 1.5 + Math.random() * 1.9;
  const end = t + hold;
  const tail = [];
  if (Math.random() < (aftershock ? .25 : .5)) {
    let after = end + .06 + Math.random() * .34;
    for (let i = 0, n = 1 + (Math.random() < .35); i < n; i++) {
      const length = .03 + Math.random() * .08;
      tail.push([after, after + length, .6 + Math.random() * .3, .55 + Math.random() * .45]);
      after += length + .05 + Math.random() * .2;
    }
  }
  const second = t > 0 ? t : .25 + Math.random() * .3;
  return {
    start, flashes, tail, aftershock, holdStart: t, end, finish: tail.length ? tail.at(-1)[1] : end,
    tearIn: Math.min(hold * .45, (aftershock ? .22 : .34) + Math.random() * .36),
    tearOut: Math.min(hold * .4, .26 + Math.random() * .3),
    entryCalm: count ? .38 : .62,
    rings: [0, second, second + .9 + Math.random() * .8],
    phase: Math.random() * 4, seed: Math.random(),
  };
}
let exposure = planExposure(3 + Math.random() * 3);

function exposureAge() {
  if (reduced.matches) return -1;
  const age = time - exposure.start;
  // The glass starts to recover when the hold ends, even if the signal
  // still relapses afterwards.
  if (age >= exposure.end && lastExposureEnd < exposure.start) lastExposureEnd = exposure.start + exposure.end;
  if (age >= exposure.finish) {
    // Waits average about thirteen seconds but range from six to twenty-six.
    const shock = !exposure.aftershock && Math.random() < .14;
    const wait = shock ? 1.2 + Math.random() * 2.2 : 6 + Math.min(20, -Math.log(1 - Math.random()) * 7);
    exposure = planExposure(time + wait, shock);
    return -1;
  }
  if (age < 0) return -1;
  const within = flashes => flashes.some(([a, b]) => age >= a && age < b);
  if (age < exposure.holdStart) return within(exposure.flashes) ? age : -1;
  if (age >= exposure.end) return within(exposure.tail) ? age : -1;
  return age;
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

function draw() {
  const age = exposureAge();
  const isNeg = age >= 0;
  // The held print can come straight from the last presented glass frame.
  if (isNeg && !glitchShowing && field) {
    if (glassDrawn) field.capture(glass.canvas, glass.box, w, h);
    else field.capture(canvas, [0, 0, w, h], w, h);
  }
  glassDrawn = false;
  glitchShowing = isNeg;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // While the GPU layer carries the calm scene, the stage canvas stays empty
  // and untouched, so the browser has nothing to re-upload each frame.
  if (stageDrawn) {
    ctx.clearRect(0, 0, w, h);
    stageDrawn = false;
  }
  stage.classList.toggle('negative', isNeg);
  // Through the hold, the browser's own chrome goes dark with the stage.
  const held = isNeg && age >= exposure.holdStart && age < exposure.end;
  if (chrome && held !== chromeDark) {
    chromeDark = held;
    chrome.content = held ? '#000000' : paperTone;
  }

  const yaw = -.46 + Math.sin(time * .30) * .055 + pointer.x * .18 + drag.x + rig.gyroX;
  const pitch = -.16 + Math.cos(time * .23) * .033 - pointer.y * .09 + drag.y + rig.gyroY;
  const tilt = -.115 + Math.sin(time * .22) * .018 + drag.x * .035;
  const rows = cameraRows(yaw, pitch, tilt);
  const [[ax, bx, zx], [ay, by, zy]] = rows;
  const lift = Math.sin(time * .56) * .012;
  const speed = Math.min(1, Math.hypot(pointer.vx, pointer.vy) * .18);
  const pulse = Math.min(1, Math.max(pointer.press * .65, pointer.pulse) + speed * .28);
  const focus = [.56 + pointer.x * .48, .845 + pointer.y * .62];
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
  const tear = torn ? [...torn, tearBeat, exposure.seed] : [0, 0, 0, 0];
  const spread = .008 + .012 * Math.sin(time * .38) + pointer.press * .0055;
  const pointerPx = [(pointer.x + 1) * w / 2, (pointer.y + 1) * h / 2];
  const trailPx = [(pointer.trailX + 1) * w / 2, (pointer.trailY + 1) * h / 2];

  // Update ambient studio paper skylight wash smoothly without layout work.
  if (wash && !isNeg) {
    const wx = (-rig.lightRad * 48 - pointer.x * 16).toFixed(1);
    const wy = (-pointer.y * 12).toFixed(1);
    const key = wx + ',' + wy;
    if (key !== lastWashKey) {
      lastWashKey = key;
      wash.style.transform = `translate3d(${wx}px,${wy}px,0)`;
    }
  }

  glitchShown = glassShown = false;
  if (isNeg && field) {
    // The cut's light runs along the kerf as the B is turned on screen.
    const along = [ax - .27875 * bx, ay - .27875 * by];
    const length = Math.hypot(...along);
    field.render({
      time, age, size, hold: exposure.holdStart, end: exposure.end, rings: exposure.rings,
      origin: [w / 2 + size * bx * (lift - .0211), centre + size * by * (lift - .0211)],
      dir: [along[0] / length, along[1] / length],
      pointer: pointerPx, trail: trailPx, wake: pointer.wake,
      pulse, tear, lightAngle: rig.lightRad,
    });
  }
  if (isNeg) {
    const drawn = oilVolume?.(ctx, {
      w, h, size, centre, pixelRatio, detail: oilDetail, right: [ax, bx, zx], down: [ay, by, zy],
      age: age + exposure.phase, lift, separation: spread,
      tear, pulse, focus, lightAngle: rig.lightRad,
      vel: [pointer.vx + drag.vx * 1.4, pointer.vy + drag.vy * 1.4],
      rippleA: ripples[0], rippleB: ripples[1],
    });
    if (drawn) {
      glitchShown = drawn === 'layer';
      stageDrawn = drawn === 'stage';
      return;
    }
  }
  const sway = yaw + .46;
  const glint = .10 * Math.sin(time * .35) + pointer.x * .14 - pointer.y * .035;
  const ground = groundCard(sway, lift, rig.lightRad);
  const recovery = reduced.matches ? 1 : Math.min(1, (time - lastExposureEnd) / .74);
  // The filament's light breathes slowly, swells under a touch, and runs
  // high for a moment as the glass comes back after a glitch.
  const afterglow = reduced.matches ? 0 : Math.exp(-Math.max(0, time - lastExposureEnd) * 1.6);
  const glow = 1 + .1 * Math.sin(time * .9) * intro + .3 * pulse + .45 * afterglow;
  // The GPU layer hides during a glitch, so a glitch without its liquid B
  // falls back to drawing the glass here.
  if (!isNeg && glass?.render({
    rows, centre: [w / 2, centre], size, view: [w, h], lift, shift: [-spread, spread], glint, sway, pulse, ground,
    recovery, lightAngle: rig.lightRad, intro, glow, time, fine: glassFine, shocks: ripples,
  })) {
    glassDrawn = glassShown = true;
    return;
  }

  stageDrawn = true;
  if (!isNeg) {
    const [x, y, rx, ry] = ground;
    ctx.drawImage(groundMap, x - rx, y - ry, rx * 2, ry * 2);
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

// The glass is traced three times per pixel across its reeds. If calm
// frames keep running long, not just through a stray hitch, it drops to one
// trace for the rest of the visit.
let glassFine = true, glassPace = 1 / 60, glassShown = false;
function paceGlass(elapsed) {
  glassPace += (Math.min(elapsed, .05) - glassPace) * .03;
  if (glassPace > 1 / 40) glassFine = false;
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
}

function tick(now) {
  frame = 0;
  const elapsed = last ? (now - last) / 1000 : 0;
  const dt = Math.min(elapsed, .06);
  last = now;
  // Each interval reflects the cost of the frame drawn before it.
  if (elapsed && glitchShown) paceOil(elapsed);
  if (elapsed && glassShown && glassFine && time > 2) paceGlass(elapsed);
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
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  pixelRatio = Math.min(devicePixelRatio || 1, 2);
  field?.resize(w, h, pixelRatio);
  size = Math.min(h * .31, w * .49);
  centre = h * .46;
  glass?.resize(pixelRatio, reachOf());
  canvas.width = Math.round(w * pixelRatio);
  canvas.height = Math.round(h * pixelRatio);
}

function resize() {
  fitCanvas();
  draw();
  document.querySelector('.silhouette').hidden = true;
  stage.classList.add('ready');
  refresh();
}

function pointAt(event) {
  if (!event.isPrimary) return;
  pointer.tx = Math.max(-1, Math.min(1, event.clientX / w * 2 - 1));
  pointer.ty = Math.max(-1, Math.min(1, event.clientY / h * 2 - 1));
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
      drag.tx = Math.max(-.34, Math.min(.34, dx * .52));
      drag.ty = Math.max(-.16, Math.min(.16, -dy * .32));
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

// Wheel gently sweeps the studio key-light without scrolling the viewport.
stage.addEventListener('wheel', event => {
  if (reduced.matches) return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  rig.lightDeg = Math.max(-55, Math.min(55, rig.lightDeg + Math.sign(delta) * Math.min(7, Math.abs(delta) * .06)));
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
