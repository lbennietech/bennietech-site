import { createField } from './field.js';
import { createGlass } from './glass.js';
import { prepareOil } from './oil-volume.js';
import { displaceStrip } from './negative.js';

// The two radii, baseline and diagonal kerf come from the production B mark.
// Cut the original silhouette first so every metal lamination shares its profile.
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
  base.addColorStop(0, '#f3f4ec');
  base.addColorStop(.55, '#e2e6da');
  base.addColorStop(1, '#d3d9cc');
  g.fillStyle = base;
  g.fillRect(...wide);

  // Soft diagonal reflections. The flutes break them into steps.
  const streaks = g.createLinearGradient(-.3, 1.9, 1.5, -.2);
  [[0, 0], [.16, .42], [.25, 0], [.43, -.12], [.55, 0], [.7, .34], [.78, 0], [.9, -.08], [1, 0]]
    .forEach(([at, a]) => streaks.addColorStop(at, a >= 0 ? `rgba(255,255,250,${a})` : `rgba(58,72,54,${-a})`));
  g.fillStyle = streaks;
  g.fillRect(...wide);

  // Light carried along inside the glass from the kerf.
  const towards = part ? 1 : -1;
  const cut = part ? 1.0475 : .9125;
  const x0 = .5, y0 = cut - .27875 * x0;
  const glow = g.createLinearGradient(x0, y0, x0 + towards * normal[0] * .5, y0 + towards * normal[1] * .5);
  glow.addColorStop(0, lime(.72));
  glow.addColorStop(.05, lime(.4));
  glow.addColorStop(.2, lime(.14));
  glow.addColorStop(.55, lime(.03));
  glow.addColorStop(1, lime(0));
  g.fillStyle = glow;
  g.fillRect(...wide);

  // Reflections of the filament repeat deeper inside the block.
  g.save();
  g.clip(plate);
  [[.075, .62], [.19, .4], [.33, .24], [.5, .12]].forEach(([depth, alpha]) => {
    const reach = towards * (.065 + depth);
    g.save();
    g.translate(normal[0] * reach, normal[1] * reach);
    g.lineWidth = .008;
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

  // The back contour, seen through the block.
  g.save();
  g.translate(-.06, .032);
  g.lineWidth = .009;
  g.strokeStyle = 'rgba(50,68,50,.34)';
  g.stroke(plate);
  g.translate(.008, -.005);
  g.lineWidth = .005;
  g.strokeStyle = 'rgba(255,255,246,.6)';
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
  [0, '#2b4233'], [.11, '#6c8b70'], [.18, '#e4f1df'], [.22, '#7c9a7f'],
  [.4, '#38533f'], [.58, '#9cb998'], [.645, '#f3f9ec'], [.69, '#86a585'],
  [.84, '#30493a'], [1, '#7f9c80'],
];
const ARRIS_STOPS = [[0, '#fbfdf4'], [.46, '#e4ecda'], [.66, '#7f9a80'], [1, '#f6faee']];
const BACK = -.272, FRONT = .2805;

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
    const seen = FLUTE * 2.4;
    const centre = x + FLUTE / 2 + refract + .011 * Math.sin(k * 2.31 + part);
    g.drawImage(tile, (centre - seen / 2 + PAD) * DENSITY, PAD_Y * DENSITY, seen * DENSITY, 1.7 * DENSITY,
      x, 0, FLUTE + .0008, 1.7);
    const p = Math.min(.84, Math.max(.16, .5 + crest + (k - flutes / 2) * .009));
    const shade = g.createLinearGradient(x, 0, x + FLUTE, 0);
    shade.addColorStop(0, 'rgba(34,46,34,.24)');
    shade.addColorStop(.1, 'rgba(34,46,34,0)');
    shade.addColorStop(p - .1, 'rgba(255,255,248,0)');
    shade.addColorStop(p, 'rgba(255,255,248,.66)');
    shade.addColorStop(p + .06, 'rgba(255,255,248,0)');
    shade.addColorStop(.9, 'rgba(34,46,34,0)');
    shade.addColorStop(1, 'rgba(34,46,34,.17)');
    g.fillStyle = shade;
    g.fillRect(x, 0, FLUTE, 1.7);
  }
  // A broad window reflection rides over the reeds.
  const sheen = g.createLinearGradient(-.3 + sway, .1, 1.3 + sway, .9);
  sheen.addColorStop(.2, 'rgba(255,255,252,0)');
  sheen.addColorStop(.36, 'rgba(255,255,252,.24)');
  sheen.addColorStop(.44, 'rgba(255,255,252,.05)');
  sheen.addColorStop(.52, 'rgba(255,255,252,0)');
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
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let w, h, pixelRatio, time = 0, last = 0, frame = 0;

const field = createField(canvas);
const glass = createGlass(canvas, {
  outlines: halves.map(half => half.points), tiles: behind, scale: DENSITY, pad: [PAD, PAD_Y], flute: FLUTE,
  sideStops: SIDE_STOPS, arrisStops: ARRIS_STOPS, back: BACK, front: FRONT,
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

// Every place the B can reach as it sways, lifts and follows the pointer.
function reachOf(size, centre) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const steps = n => Array.from({ length: n }, (_, i) => i / (n - 1) * 2 - 1);
  for (const y of steps(5)) for (const p of steps(5)) for (const t of [-1, 1]) for (const l of [-1, 1]) {
    const yaw = -.46 + y * .235, pitch = -.16 + p * .123, tilt = -.115 + t * .018;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const ax = c * Math.cos(yaw) - s * Math.sin(yaw) * Math.sin(pitch);
    const ay = s * Math.cos(yaw) + c * Math.sin(yaw) * Math.sin(pitch);
    const bx = -s * Math.cos(pitch), by = c * Math.cos(pitch);
    const zx = c * Math.sin(yaw) + s * Math.cos(yaw) * Math.sin(pitch);
    const zy = s * Math.sin(yaw) - c * Math.cos(yaw) * Math.sin(pitch);
    for (const half of halves) for (const [u, v] of half.points) for (const z of [BACK, FRONT]) {
      const dv = v - .845 + l * .012 + (v > .9 ? .02 : -.02);
      const x = centre[0] + size * (ax * (u - .56) + bx * dv + zx * z);
      const yy = centre[1] + size * (ay * (u - .56) + by * dv + zy * z);
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], yy);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], yy);
    }
  }
  // The shadow and caustic lie on the ground beneath it.
  box[0] = Math.min(box[0], centre[0] + size * (.06 - .88));
  box[2] = Math.max(box[2], centre[0] + size * (.06 + .88));
  box[3] = Math.max(box[3], centre[1] + size * (1.02 + .102));
  return box;
}
let glitchShowing = false, stageDrawn = true;
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
    return -1;
  }
  if (age < 0) return -1;
  if (age < exposure.holdStart) return exposure.flashes.some(([a, b]) => age >= a && age < b) ? age : -1;
  return age;
}

function metal(x, y, dx, dy, stops) {
  const gradient = ctx.createLinearGradient(x, y, x + dx, y + dy);
  stops.forEach(([at, tint]) => gradient.addColorStop(at, tint));
  return gradient;
}

function draw() {
  const age = exposureAge();
  // On the first glitch frame the canvas still holds the calm scene. The
  // dot-matrix field keeps it, to dissolve from and re-form into.
  if (age >= 0 && !glitchShowing && field) {
    if (glass) {
      const [x, y, bw, bh] = glass.box;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(glass.canvas, x * pixelRatio, y * pixelRatio, bw * pixelRatio, bh * pixelRatio);
      stageDrawn = true;
    }
    field.capture(canvas);
  }
  glitchShowing = age >= 0;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  // While the GPU layer carries the calm scene, the stage canvas stays empty
  // and untouched, so the browser has nothing to re-upload each frame.
  if (stageDrawn) {
    ctx.clearRect(0, 0, w, h);
    stageDrawn = false;
  }
  stage.classList.toggle('negative', age >= 0);
  const size = Math.min(h * .31, w * .445);
  const yaw = -.46 + Math.sin(time * .30) * .055 + pointer.x * .18;
  const pitch = -.16 + Math.cos(time * .23) * .033 - pointer.y * .09;
  const tilt = -.115 + Math.sin(time * .22) * .018;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const ax = c * Math.cos(yaw) - s * Math.sin(yaw) * Math.sin(pitch);
  const ay = s * Math.cos(yaw) + c * Math.sin(yaw) * Math.sin(pitch);
  const bx = -s * Math.cos(pitch), by = c * Math.cos(pitch);
  const zx = c * Math.sin(yaw) + s * Math.cos(yaw) * Math.sin(pitch);
  const zy = s * Math.sin(yaw) - c * Math.cos(yaw) * Math.sin(pitch);
  const lift = Math.sin(time * .56) * .012;
  const centre = h * .45;

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
    });
  }
  if (age >= 0 && oilVolume?.(ctx, {
    w, h, size, pixelRatio, detail: oilDetail, right: [ax, bx, zx], down: [ay, by, zy],
    age: age + exposure.phase, lift, separation: .008 + .012 * Math.sin(time * .38),
  })) {
    glitchShown = stageDrawn = true;
    const settling = age - exposure.holdStart;
    if (age < .09 || (settling >= 0 && settling < .13)) displaceStrip(ctx, canvas, w, h, true, exposure.seed);
    else if (age > exposure.end - .3 && age < exposure.end - .18) displaceStrip(ctx, canvas, w, h, false, exposure.seed);
    return;
  }
  const sway = yaw + .46;
  const glint = .10 * Math.sin(time * .35) + pointer.x * .14;
  const spread = .008 + .012 * Math.sin(time * .38);
  // The GPU layer hides during a glitch, so a glitch without its liquid B
  // falls back to drawing the glass here.
  if (age < 0 && glass?.render({
    rows: turn(ax, ay, bx, by, zx, zy), centre: [w / 2, centre], size, lift,
    shift: [-spread, spread], glint, sway,
    ground: [w * .5 + size * .06, centre + size * 1.02, size * .88, size * .102], focus: .08 - sway * 1.3,
  })) return;

  stageDrawn = true;
  if (age < 0) {
    ctx.save();
    ctx.translate(w * .5 + size * .06, centre + size * 1.02);
    ctx.scale(size * .88, size * .102);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, 'rgba(44,52,40,.15)');
    shadow.addColorStop(.5, 'rgba(48,56,44,.07)');
    shadow.addColorStop(1, 'rgba(52,58,46,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2, 2);
    // Light focused through the block, tinted by the filament.
    const focus = .08 - sway * 1.3;
    const caustic = ctx.createRadialGradient(focus, -.12, 0, focus, -.12, .42);
    caustic.addColorStop(0, 'rgba(236,250,176,.7)');
    caustic.addColorStop(.35, 'rgba(214,238,140,.28)');
    caustic.addColorStop(1, 'rgba(214,238,140,0)');
    ctx.fillStyle = caustic;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function plane(z, part) {
    const shift = (part * 2 - 1) * (.008 + .012 * Math.sin(time * .38));
    const x = -.56 * ax + (-.845 + lift + shift) * bx + z * zx;
    const y = -.56 * ay + (-.845 + lift + shift) * by + z * zy;
    ctx.setTransform(ax * size * pixelRatio, ay * size * pixelRatio,
      bx * size * pixelRatio, by * size * pixelRatio,
      (w / 2 + x * size) * pixelRatio, (centre + y * size) * pixelRatio);
  }
  const side = metal(-.12 + glint, .05, 1.52, .48, SIDE_STOPS);
  refreshFaces(sway, Math.min(size * pixelRatio, 760));
  // Only the rim of each layer can show past the face in front of it, so the
  // block's sides are built from overlapping outline strokes, not fills.
  ctx.lineJoin = 'round';
  const arris = metal(0, 0, 1, 1, ARRIS_STOPS);
  for (let layer = 0; layer < 33; layer++) {
    const z = (layer - 16) * .017;
    plates.forEach((plate, part) => {
      plane(z + .004, part);
      ctx.strokeStyle = side;
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

function tick(now) {
  frame = 0;
  const elapsed = last ? (now - last) / 1000 : 0;
  const dt = Math.min(elapsed, .06);
  last = now;
  // Each interval reflects the cost of the frame drawn before it.
  if (elapsed && glitchShown) paceOil(elapsed);
  if (!reduced.matches) {
    if (oilVolume === undefined && time > .5) oilVolume = prepareOil();
    time += dt;
    const ease = 1 - Math.exp(-dt * 4);
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
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
  const size = Math.min(h * .31, w * .445);
  glass?.resize(w, h, pixelRatio, size, reachOf(size, [w / 2, h * .45]));
  canvas.width = Math.round(w * pixelRatio);
  canvas.height = Math.round(h * pixelRatio);
}
function resize() {
  fitCanvas();
  draw();
  document.querySelector('.silhouette').hidden = true;
  refresh();
}
canvas.addEventListener('pointermove', event => {
  pointer.tx = event.clientX / w * 2 - 1;
  pointer.ty = event.clientY / h * 2 - 1;
});
function release() { pointer.tx = pointer.ty = 0; }
canvas.addEventListener('pointerleave', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') release(); });
document.addEventListener('visibilitychange', refresh);
reduced.addEventListener('change', refresh);
new ResizeObserver(resize).observe(canvas);
