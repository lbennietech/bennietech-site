import { createField } from './field.js';
import { createGlass } from './glass.js';
import { makeGround } from './glass-ground.js';
import { prepareOil } from './oil-volume.js';
import { exposureStrip } from './negative.js';
import { insideCut } from './inside-cut.js';

// The two radii, baseline and diagonal kerf come from the production B mark.
// Both glass halves and their projected light share this exact silhouette.
const TAU = Math.PI * 2;
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

// What the reeds see: pale glass over paper, a green rim of trapped light,
// the ghost of the back contour, and the glow entering from the kerf.
const behind = plates.map((plate, part) => {
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
  const cut = part ? 1.0475 : .9125;
  const x0 = .5, y0 = cut - .27875 * x0;
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
  g.strokeStyle = 'rgba(49,87,73,.22)';
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
});
// The polished sides look along the glass, so they carry its green.
const SIDE_STOPS = [
  [0, '#243e33'], [.115, '#6d9280'], [.17, '#dfeddb'], [.207, '#91ae97'],
  [.38, '#294d40'], [.51, '#739883'], [.606, '#bbd0b9'], [.64, '#e8eee0'],
  [.69, '#839e89'], [.84, '#345749'], [1, '#a2b59f'],
];
const ARRIS_STOPS = [[0, '#fcfff2'], [.38, '#f1f6df'], [.63, '#9fae94'], [.78, '#e1e9d9'], [1, '#fefff0']];
const BACK = -.272, FRONT = .2805;
const groundMap = makeGround(plates, FLUTE);

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
  const tile = behind[part];
  const flutes = Math.ceil(1.21 / FLUTE);
  const refract = sway * .62;
  const crest = sway * 2.1;
  for (let k = 0; k < flutes; k++) {
    const x = k * FLUTE;
    // Each reed compresses a wider strip of the scene behind it.
    const seen = FLUTE * 3.3;
    const centre = x + FLUTE / 2 + refract + .011 * Math.sin(k * 2.31 + part);
    g.drawImage(tile, (centre - seen / 2 + PAD) * DENSITY, PAD_Y * DENSITY, seen * DENSITY, 1.7 * DENSITY,
      x, 0, FLUTE + .0008, 1.7);
    const p = Math.min(.84, Math.max(.16, .5 + crest + (k - flutes / 2) * .009));
    const shade = g.createLinearGradient(x, 0, x + FLUTE, 0);
    shade.addColorStop(0, 'rgba(30,60,48,.39)');
    shade.addColorStop(.15, 'rgba(35,66,54,.07)');
    shade.addColorStop(p - .13, 'rgba(255,255,242,0)');
    shade.addColorStop(p, 'rgba(255,255,244,.75)');
    shade.addColorStop(p + .07, 'rgba(255,255,242,.04)');
    shade.addColorStop(.86, 'rgba(235,246,226,.14)');
    shade.addColorStop(1, 'rgba(30,60,48,.30)');
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
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pointer = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, press: 0, tPress: 0, vPress: 0, pulse: 0 };
let w, h, size, centre, pixelRatio, time = 0, last = 0, frame = 0, lastTap = -1;

const field = createField(canvas);
const glass = createGlass(canvas, {
  outlines: halves.map(half => half.points), tiles: behind, scale: DENSITY, pad: [PAD, PAD_Y], flute: FLUTE,
  sideStops: SIDE_STOPS, arrisStops: ARRIS_STOPS, back: BACK, front: FRONT, groundMap,
  filament: [[.09, KERF - .27875 * .09], [filamentEnd, KERF - .27875 * filamentEnd]],
});
if (!glass) behind.forEach((tile, part) => window.createImageBitmap?.(tile).then(bitmap => {
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

// Every place the B can reach as it sways, lifts and follows the pointer.
function groundCard(sway, lift) {
  const stretch = Math.min(1, w / (size * 3.4)) * (1 + sway * .37);
  return [w / 2 + size * (.32 * stretch - sway * .21), centre + size * (1.016 + lift * .23),
    size * 1.28 * stretch, size * .25];
}

function reachOf() {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const steps = n => Array.from({ length: n }, (_, i) => i / (n - 1) * 2 - 1);
  for (const y of steps(5)) for (const p of steps(5)) for (const t of [-1, 1]) for (const offset of [-.038, .038]) {
    const yaw = -.46 + y * .235, pitch = -.16 + p * .123, tilt = -.115 + t * .018;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const ax = c * Math.cos(yaw) - s * Math.sin(yaw) * Math.sin(pitch);
    const ay = s * Math.cos(yaw) + c * Math.sin(yaw) * Math.sin(pitch);
    const bx = -s * Math.cos(pitch), by = c * Math.cos(pitch);
    const zx = c * Math.sin(yaw) + s * Math.cos(yaw) * Math.sin(pitch);
    const zy = s * Math.sin(yaw) - c * Math.cos(yaw) * Math.sin(pitch);
    for (const half of halves) for (const [u, v] of half.points) for (const z of [BACK, FRONT]) {
      const dv = v - .845 + offset;
      const x = w / 2 + size * (ax * (u - .56) + bx * dv + zx * z);
      const yy = centre + size * (ay * (u - .56) + by * dv + zy * z);
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], yy);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], yy);
    }
  }
  // The shadow and caustic lie on the ground beneath it.
  for (const sway of [-.235, .235]) {
    const [x, y, rx, ry] = groundCard(sway, .012);
    box[0] = Math.min(box[0], x - rx);
    box[2] = Math.max(box[2], x + rx);
    box[3] = Math.max(box[3], y + ry);
  }
  return box;
}
let glitchShowing = false, stageDrawn = true, glassDrawn = false;
let lastExposureEnd = -Infinity;
let oilVolume;
// Each exposure is planned afresh so no two play alike: a stutter of up to
// three brief flashes, a hold of uneven length, rings and drips in their own
// phase, and an irregular wait before the next. Now and then a short
// aftershock follows closely behind.
function planExposure(start, aftershock = false) {
  const flashes = [];
  let t = 0;
  const roll = Math.random();
  const count = aftershock ? 1 + (Math.random() < .5) : roll < .2 ? 0 : roll < .62 ? 1 : roll < .88 ? 2 : 3;
  for (let i = 0; i < count; i++) {
    const length = .045 + Math.random() * .13;
    flashes.push([t, t + length]);
    t += length + .07 + Math.random() * .3;
  }
  const hold = aftershock ? .35 + Math.random() * .5
    : Math.random() < .12 ? 3.4 + Math.random() * 1.2 : 1.5 + Math.random() * 1.9;
  const second = t > 0 ? t : .25 + Math.random() * .3;
  return {
    start, flashes, aftershock, holdStart: t, end: t + hold,
    rings: [0, second, second + .9 + Math.random() * .8],
    phase: Math.random() * 4, seed: Math.random(),
  };
}
let exposure = planExposure(3 + Math.random() * 3);

function exposureAge() {
  if (reduced.matches) return -1;
  const age = time - exposure.start;
  if (age >= exposure.end) {
    // Waits average about thirteen seconds but range from six to twenty-six.
    const shock = !exposure.aftershock && Math.random() < .14;
    const wait = shock ? 1.2 + Math.random() * 2.2 : 6 + Math.min(20, -Math.log(1 - Math.random()) * 7);
    exposure = planExposure(time + wait, shock);
    lastExposureEnd = time;
    return -1;
  }
  if (age < 0) return -1;
  if (age < exposure.holdStart) return exposure.flashes.some(([a, b]) => age >= a && age < b) ? age : -1;
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

let exteriorPose;
function draw() {
  const age = exposureAge();
  // The held print can come straight from the last presented glass frame.
  if (age >= 0 && !glitchShowing && field) {
    if (glassDrawn) field.capture(glass.canvas, glass.box, w, h);
    else field.capture(canvas, [0, 0, w, h], w, h);
  }
  glassDrawn = false;
  glitchShowing = age >= 0;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // While the GPU layer carries the calm scene, the stage canvas stays empty
  // and untouched, so the browser has nothing to re-upload each frame.
  if (stageDrawn) {
    ctx.clearRect(0, 0, w, h);
    stageDrawn = false;
  }
  stage.classList.toggle('negative', age >= 0);
  const yaw = -.46 + Math.sin(time * .30) * .055 + pointer.x * .18;
  const pitch = -.16 + Math.cos(time * .23) * .033 - pointer.y * .09;
  const tilt = -.115 + Math.sin(time * .22) * .018;
  const rows = cameraRows(yaw, pitch, tilt);
  const [[ax, bx, zx], [ay, by, zy]] = rows;
  const lift = Math.sin(time * .56) * .012;
  const speed = Math.min(1, Math.hypot(pointer.vx, pointer.vy) * .18);
  const pulse = Math.min(1, Math.max(pointer.press * .65, pointer.pulse) + speed * .28);
  const focus = [.56 + pointer.x * .48, .845 + pointer.y * .62];

  glitchShown = false;
  if (age >= 0 && field) {
    // The cut's light runs along the kerf as the B is turned on screen.
    const along = [ax - .27875 * bx, ay - .27875 * by];
    const length = Math.hypot(...along);
    field.render({
      time, age, size, hold: exposure.holdStart, end: exposure.end, rings: exposure.rings,
      origin: [w / 2 + size * bx * (lift - .0211), centre + size * by * (lift - .0211)],
      dir: [along[0] / length, along[1] / length],
      pointer: [(pointer.x + 1) * w / 2, (pointer.y + 1) * h / 2],
      pulse,
    });
  }
  const spread = .008 + .012 * Math.sin(time * .38) + pointer.press * .0055;
  if (age >= 0) {
    const drawn = oilVolume?.(ctx, {
      w, h, size, centre, pixelRatio, detail: oilDetail, right: [ax, bx, zx], down: [ay, by, zy],
      age: age + exposure.phase, lift, separation: spread, strip: exposureStrip(age, exposure, w, h),
      pulse, focus,
    });
    if (drawn) {
      glitchShown = drawn === 'layer';
      stageDrawn = drawn === 'stage';
      return;
    }
  }
  const sway = yaw + .46;
  const glint = .10 * Math.sin(time * .35) + pointer.x * .14 - pointer.y * .035;
  const ground = groundCard(sway, lift);
  // The GPU layer hides during a glitch, so a glitch without its liquid B
  // falls back to drawing the glass here.
  if (age < 0) {
    const recovery = reduced.matches ? 1 : Math.min(1, (time - lastExposureEnd) / .74);
    exteriorPose = { yaw, pitch, tilt, lift, spread, glint, sway, pulse, focus, recovery };
    const u = filamentEnd - .56, v = KERF - .27875 * filamentEnd - .845 + lift;
    insideCut.placeTip(w / 2 + size * (ax * u + bx * v - zx * .1445),
      centre + size * (ay * u + by * v - zy * .1445), Math.atan2(ay - .27875 * by, ax - .27875 * bx));
    if (glass?.render({ rows, centre: [w / 2, centre], size, lift,
      shift: [-spread, spread], glint, sway, pulse, focus, ground, recovery })) {
      glassDrawn = true;
      return;
    }
  }

  stageDrawn = true;
  if (age < 0) {
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
  const sides = reflectedWalls(glint);
  refreshFaces(sway, Math.min(size * pixelRatio, 760));
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
}
function tick(now) {
  frame = 0;
  const elapsed = last ? (now - last) / 1000 : 0;
  const dt = Math.min(elapsed, .06);
  last = now;
  // Each interval reflects the cost of the frame drawn before it.
  if (elapsed && glitchShown) paceOil(elapsed);
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
  if (!document.hidden && !insideCut.active) frame = requestAnimationFrame(tick);
}
function fitCanvas() {
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  pixelRatio = Math.min(devicePixelRatio || 1, 2);
  field?.resize(w, h, pixelRatio);
  size = Math.min(h * .31, w * .49);
  centre = h * .46;
  glass?.resize(pixelRatio, insideCut.active ? [0, 0, w, h] : reachOf());
  canvas.width = Math.round(w * pixelRatio);
  canvas.height = Math.round(h * pixelRatio);
}
function resize() {
  fitCanvas();
  // Motion can be enabled for the first time from within a photographic
  // detail. Establish the exterior pose before handing the mesh to its camera.
  if (!insideCut.active || !exteriorPose) draw();
  if (insideCut.active) insideCut.redraw();
  document.querySelector('.silhouette').hidden = true;
  refresh();
}
function pointAt(event) {
  if (!event.isPrimary) return;
  pointer.tx = Math.max(-1, Math.min(1, event.clientX / w * 2 - 1));
  pointer.ty = Math.max(-1, Math.min(1, event.clientY / h * 2 - 1));
}
canvas.addEventListener('pointermove', pointAt);
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary) return;
  pointAt(event);
  pointer.tPress = 1;
  pointer.pulse = 1;
  if (!reduced.matches && time - lastTap < .35 && exposureAge() < 0) {
    if (oilVolume === undefined) oilVolume = prepareOil(canvas);
    exposure = planExposure(time);
  }
  lastTap = time;
});
function release() { pointer.tx = pointer.ty = pointer.tPress = 0; }
canvas.addEventListener('pointerleave', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerup', event => {
  pointer.tPress = 0;
  if (event.pointerType !== 'mouse') release();
});
document.addEventListener('visibilitychange', refresh);
reduced.addEventListener('change', refresh);
new ResizeObserver(resize).observe(canvas);

// Freeze the exposure clock while the visitor is examining the material.
// Only the viewport is allocated, even when the full mesh spans many screens.
insideCut.connect({
  available: () => !!glass && !glass.canvas.getContext('webgl').isContextLost(),
  setActive(active) {
    cancelAnimationFrame(frame);
    frame = last = 0;
    release();
    lastTap = -Infinity;
    if (!w || !h) return;
    glass?.resize(pixelRatio, active ? [0, 0, w, h] : reachOf());
    if (active) stage.classList.remove('negative');
    else { draw(); refresh(); }
  },
  paint(cam) {
    if (!glass || !exteriorPose || !w || !h) return false;
    const pose = exteriorPose;
    const blend = (a, b) => a + (b - a) * cam.align;
    const rows = cameraRows(blend(pose.yaw, -.55), blend(pose.pitch, -.065), blend(pose.tilt, -.15));
    const sizeInside = cam.scale * 375;
    const cx = cam.x + 367.5 * cam.scale, cy = cam.y + 375 * cam.scale;
    const magnification = sizeInside / size;
    const [gx, gy, rx, ry] = groundCard(pose.sway, pose.lift);
    const spread = blend(pose.spread, .055);
    return glass.render({
      rows, centre:[cx, cy], size:sizeInside, lift:blend(pose.lift, 0), shift:[-spread, spread],
      glint:blend(pose.glint, .024 + .048 * cam.gaze), sway:blend(pose.sway, -.072 + .017 * cam.gaze),
      pulse:blend(pose.pulse, .15), focus:pose.focus, recovery:blend(pose.recovery, 1),
      ground:[cx + (gx - w / 2) * magnification, cy + (gy - centre) * magnification, rx * magnification, ry * magnification],
    });
  },
});
glass?.canvas.addEventListener('webglcontextlost', insideCut.redraw);
