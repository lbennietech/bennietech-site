import { drawMembrane, displaceStrip } from './negative.js';

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
  return path;
}
const plates = [cut(.9125, -1), cut(1.0475, 1)];

// An eccentric rose engine scored into each face. The two tool centres register
// differently across the cut, like sections taken from a larger engraved plate.
function engraving(cx, cy, phase) {
  const lines = new Path2D();
  for (let ring = 1; ring < 191; ring++) {
    const radius = ring * .012;
    for (let i = 0; i <= 166; i++) {
      const a = TAU * i / 166;
      const r = radius * (1 + .09 * Math.sin(3 * a + radius * 3 + phase)
        + .021 * Math.sin(9 * a - radius * 5));
      const x = cx + Math.cos(a) * r * 1.32;
      const y = cy + Math.sin(a) * r * .68;
      if (i === 0) lines.moveTo(x, y);
      else lines.lineTo(x, y);
    }
    lines.closePath();
  }
  return lines;
}

// Rasterise the fixed engraving once. Its metallic reflection is drawn live.
const faces = plates.map((plate, i) => {
  const tile = document.createElement('canvas');
  const density = 780;
  tile.width = Math.ceil(1.21 * density);
  tile.height = Math.ceil(1.7 * density);
  const ctx = tile.getContext('2d');
  ctx.scale(density, density);
  ctx.clip(plate);
  const lines = engraving(i ? .99 : .19, i ? 1.48 : .22, i * 1.7);
  ctx.strokeStyle = 'rgba(0, 8, 10, .48)';
  ctx.lineWidth = .003;
  ctx.stroke(lines);
  ctx.translate(0, -.0024);
  ctx.strokeStyle = 'rgba(255, 250, 220, .43)';
  ctx.lineWidth = .0015;
  ctx.stroke(lines);
  return tile;
});

const canvas = document.querySelector('.exhibit canvas');
const ctx = canvas.getContext('2d');
const stage = canvas.closest('main');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let w, h, pixelRatio, time = 0, last = 0, frame = 0;

let nextExposure = 9 + Math.random() * 7;

function exposureAge() {
  if (reduced.matches) return -1;
  const age = time - nextExposure;
  if (age >= 2.8) {
    nextExposure = time + 26 + Math.random() * 20;
    return -1;
  }
  // One short negative, a gap, then a sustained second exposure.
  if (age < 0 || (age >= .13 && age < .39)) return -1;
  return age;
}

function metal(x, y, dx, dy, stops) {
  const gradient = ctx.createLinearGradient(x, y, x + dx, y + dy);
  stops.forEach(([at, tint]) => gradient.addColorStop(at, tint));
  return gradient;
}

function draw() {
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const age = exposureAge();
  stage.classList.toggle('negative', age >= 0);
  if (age >= 0) drawMembrane(ctx, w, h, age);
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

  ctx.save();
  ctx.translate(w * .5 + size * .06, centre + size * 1.02);
  ctx.scale(size * .88, size * .102);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  shadow.addColorStop(0, 'rgba(38,32,23,.21)');
  shadow.addColorStop(.47, 'rgba(48,42,32,.095)');
  shadow.addColorStop(1, 'rgba(52,44,34,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  const glint = .10 * Math.sin(time * .35) + pointer.x * .14;
  function plane(z, part) {
    const shift = (part ? 1 : -1) * (.008 + .012 * Math.sin(time * .38));
    const x = -.56 * ax + (-.845 + lift + shift) * bx + z * zx;
    const y = -.56 * ay + (-.845 + lift + shift) * by + z * zy;
    ctx.setTransform(ax * size * pixelRatio, ay * size * pixelRatio,
      bx * size * pixelRatio, by * size * pixelRatio,
      (w / 2 + x * size) * pixelRatio, (centre + y * size) * pixelRatio);
  }
  for (let layer = 0; layer < 33; layer++) {
    const z = (layer - 16) * .017;
    plates.forEach((plate, part) => {
      plane(z, part);
      const side = metal(-.12 + glint, .05, 1.52, .48, [
        [0, '#262a2b'], [.16, '#bbbcb4'], [.29, '#353837'], [.49, '#656761'],
        [.65, '#e7dbca'], [.73, '#937862'], [.83, '#363a39'], [1, '#b0b3aa']
      ]);
      ctx.fillStyle = side;
      ctx.fill(plate);
      ctx.strokeStyle = '#272a28';
      ctx.lineWidth = .0034;
      ctx.stroke(plate);
      plane(z + .0075, part);
      ctx.fillStyle = layer === 16 ? '#bb7549' : '#696b64';
      ctx.fill(plate);
      ctx.lineWidth = .0024;
      ctx.strokeStyle = layer === 16 ? '#e8ad78' : '#d5d3c5';
      ctx.stroke(plate);
      if (layer !== 32) return;

      const offset = glint + part * .09;
      ctx.fillStyle = metal(-.19 + offset, .19, 1.32, .65, [
        [0, '#363c3c'], [.19, '#555e5c'], [.34, '#9ba39b'], [.43, '#cdd0c4'],
        [.56, '#838b85'], [.72, '#424b4b'], [.83, '#505957'], [1, '#abb0a4']
      ]);
      ctx.fill(plate);
      ctx.drawImage(faces[part], 0, 0, faces[part].width / 780, faces[part].height / 780);
      ctx.strokeStyle = metal(0, 0, 1, 1, [[0, '#f5f0da'], [.46, '#dcded0'], [.66, '#5d655f'], [1, '#f3e9d6']]);
      ctx.lineWidth = .005;
      ctx.stroke(plate);
    });
  }
  if (age >= 0 && (age < .52 || (age > 2.5 && age < 2.62))) {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    displaceStrip(ctx, canvas, w, h, age);
  }
}

function tick(now) {
  frame = 0;
  const dt = last ? Math.min((now - last) / 1000, .06) : 0;
  last = now;
  if (!reduced.matches) {
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
function resize() {
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  pixelRatio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * pixelRatio);
  canvas.height = Math.round(h * pixelRatio);
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
