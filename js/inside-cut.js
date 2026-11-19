// The live mesh and the photographic fallback share this camera. Coordinates
// are in the master plate, where one unit of the B occupies 375 pixels.
const stage = document.querySelector('main');
const exhibit = stage.querySelector('.exhibit');
const guide = stage.querySelector('.cut-guide');
const grip = guide.querySelector('button');
const view = stage.querySelector('.cut-view');
const light = stage.querySelector('.cut-light');
const world = view.querySelector('.cut-world');
const ink = world.querySelector('canvas');
const controls = stage.querySelector('.cut-tools');
const back = controls.querySelector('.cut-return');
const stops = [...controls.querySelectorAll('.cut-stops button')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const depths = [0, .40, .70, 1];
const slope = -.45739;
const clamp = t => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a + (b - a) * t;
function ease(t) { t = clamp(t); return t * t * (3 - 2 * t); }

let renderer, active = false, position = 0, target = 0, animation, drag;
let frame = 0, last = 0, direction = 1, gaze = 0, gazeTarget = 0;
let width = stage.clientWidth, height = stage.clientHeight;
let atlas, basePrint, macroPrint, brush, settling, selected = -1;

function camera() {
  const fit = Math.min(height / 612, width / 550);
  const finalScale = 4.75 * fit;
  const endX = 391 - .115 * width / finalScale;
  const path = [
    [367.5, 375, Math.min(height * .31, width * .49) / 375],
    [261, 331, 2.35 * fit],
    [313, 534.4 + slope * 313, 3.48 * fit],
    [endX, 534.4 + slope * endX, finalScale],
  ];
  const i = position < depths[1] ? 0 : position < depths[2] ? 1 : 2;
  const t = ease((position - depths[i]) / (depths[i + 1] - depths[i]));
  const a = path[i], b = path[i + 1];
  const scale = a[2] * (b[2] / a[2]) ** t;
  const x = width * .5 - scale * mix(a[0], b[0], t);
  const y = height * .46 - scale * mix(a[1], b[1], t);
  return { x, y, scale, align: ease(position / depths[1]), gaze };
}

function loadAtlas() {
  if (atlas) return;
  atlas = new Image();
  atlas.onload = requestFrame;
  atlas.onerror = () => { atlas = undefined; };
  atlas.src = '/assets/cut/meniscus.webp';
}

function loadPrint() {
  if (macroPrint) return;
  basePrint = new Image();
  basePrint.alt = '';
  basePrint.src = exhibit.querySelector('img').currentSrc || '/assets/glass/rest.webp';
  macroPrint = new Image();
  macroPrint.alt = '';
  macroPrint.onload = requestFrame;
  macroPrint.src = '/assets/cut/reeds.webp';
  world.prepend(basePrint, macroPrint);
}

function warm() {
  loadAtlas();
  if (reduced.matches || !renderer?.available()) {
    if (macroPrint?.complete && !macroPrint.naturalWidth) macroPrint.src = '/assets/cut/reeds.webp';
    else loadPrint();
  }
}
grip.addEventListener('pointerenter', warm);
grip.addEventListener('focus', warm);

// Two neighbouring lighting samples are blended in premultiplied alpha.
// Their curved lime reflection follows the viewer across the oil's surface.
function oilSurface(angle) {
  if (!brush) {
    brush = document.createElement('canvas');
    brush.width = 384; brush.height = 484;
  }
  const g = brush.getContext('2d');
  g.clearRect(0, 0, 384, 484);
  if (atlas?.naturalWidth) {
    const sample = clamp(angle) * 11, first = Math.floor(sample);
    g.globalCompositeOperation = 'lighter';
    const paint = (i, weight) => {
      if (!weight) return;
      g.globalAlpha = weight;
      g.drawImage(atlas, i % 4 * 384, Math.floor(i / 4) * 484, 384, 484, 0, 0, 384, 484);
    };
    paint(first, 1 - (sample - first));
    paint(Math.min(11, first + 1), sample - first);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  } else {
    const shade = g.createLinearGradient(65, 0, 320, 0);
    [[0,'#0b110d'],[.29,'#586257'],[.37,'#1e251e'],[.67,'#080c09'],[1,'#485447']]
      .forEach(([at, colour]) => shade.addColorStop(at, colour));
    g.fillStyle = shade;
    g.beginPath(); g.moveTo(111, 0);
    g.bezierCurveTo(225, 82, 61, 226, 57, 331);
    g.bezierCurveTo(45, 527, 331, 533, 330, 338);
    g.bezierCurveTo(328, 228, 167, 81, 271, 0);
    g.closePath(); g.fill();
  }
  return brush;
}

function drawMeniscus() {
  const growth = ease((position - .49) / .44);
  ink.hidden = growth === 0;
  if (!growth) return;
  const image = oilSurface(.14 + .58 * growth + .26 * gaze);
  const g = ink.getContext('2d');
  // The 64 × 96 plate starts at (359, 296) in the master shot. Clip the
  // attachment and its internal reflection to the oblique polished wall.
  g.setTransform(7, 0, 0, 7, 0, 0);
  g.clearRect(0, 0, 64, 96);
  const roof = x => 496.46 + slope * (359 + x) - 296;
  const h = 76 * mix(.16, 1, growth), w = 60.3 * mix(.43, 1, growth);
  const left = 32 - w * .496, top = roof(32) - h * .1;
  g.save();
  g.beginPath(); g.moveTo(0, roof(0)); g.lineTo(64, roof(64));
  g.lineTo(64, 96); g.lineTo(0, 96); g.closePath(); g.clip();
  g.drawImage(image, left, top, w, h);
  g.restore();
  g.save();
  g.beginPath(); g.moveTo(0, roof(0)); g.lineTo(64, roof(64));
  g.lineTo(64, roof(64) - 17); g.lineTo(0, roof(0) - 17); g.closePath(); g.clip();
  g.translate(32, roof(32)); g.transform(1, slope * .7, 0, -.21, 0, 0);
  g.globalAlpha = .16;
  g.drawImage(image, -w * .496, -h * .1, w, h);
  g.restore();
}

function paint() {
  if (!active || !width || !height) return;
  const cam = camera();
  const live = !reduced.matches && !!renderer?.paint(cam);
  stage.classList.toggle('cut-print', !live);
  if (!live) loadPrint();
  if (macroPrint) {
    basePrint.hidden = macroPrint.hidden = live;
    if (!live) {
      const amount = macroPrint.naturalWidth ? cam.align : 0;
      basePrint.style.opacity = 1 - amount;
      macroPrint.style.opacity = amount;
    }
  }
  world.style.transform = 'translate3d(' + cam.x + 'px,' + cam.y + 'px,0) scale(' + cam.scale + ')';
  light.style.opacity = ease((position - .14) / .49);
  view.style.setProperty('--cut-veil', cam.align);
  drawMeniscus();
  const nearest = position < .12 ? -1 : position < .55 ? 0 : position < .85 ? 1 : 2;
  if (nearest !== selected) {
    selected = nearest;
    stops.forEach((button, i) => button.setAttribute('aria-pressed', String(i === selected)));
  }
}

function requestFrame() {
  if (!frame && active && !document.hidden) frame = requestAnimationFrame(tick);
}
function settleOil() {
  if (reduced.matches || position < .65) return;
  settling?.cancel();
  settling = ink.animate([
    {transform:'none'}, {transform:'scale(.984, 1.033)', offset:.18},
    {transform:'scale(1.007, .986)', offset:.44}, {transform:'scale(.998, 1.004)', offset:.71},
    {transform:'none'},
  ], {duration:740, easing:'ease-in-out'});
}
function tick(now) {
  frame = 0;
  const dt = last ? Math.min(.05, Math.max(0, (now - last) / 1000)) : 1 / 60;
  last = now;
  if (animation) {
    animation.elapsed += dt;
    const t = animation.elapsed / animation.duration;
    position = mix(animation.from, target, ease(t));
    if (t >= 1) { animation = undefined; settleOil(); }
  } else position = target;
  gaze += (gazeTarget - gaze) * (1 - Math.exp(-12 * dt));
  if (!position && !target && !drag) { leave(); return; }
  paint();
  if (animation || Math.abs(gaze - gazeTarget) > .002) requestFrame();
  else last = 0;
}

function enter() {
  if (active) return;
  active = true;
  warm();
  stage.classList.add('in-cut');
  view.hidden = light.hidden = controls.hidden = false;
  grip.setAttribute('aria-expanded', 'true');
  exhibit.setAttribute('aria-hidden', 'true');
  if (document.activeElement === grip) back.focus({preventScroll:true});
  renderer?.setActive(true);
  paint();
}
function leave() {
  if (!active) return;
  const restoreFocus = controls.contains(document.activeElement);
  settling?.cancel();
  active = false;
  position = target = gaze = gazeTarget = last = 0;
  animation = undefined;
  stage.classList.remove('in-cut', 'cut-print');
  controls.hidden = view.hidden = light.hidden = true;
  grip.setAttribute('aria-expanded', 'false');
  exhibit.removeAttribute('aria-hidden');
  renderer?.setActive(false);
  if (restoreFocus) grip.focus({preventScroll:true});
}

function travel(value, animate = true) {
  value = clamp(value);
  if (!active && !value) return;
  enter();
  if (reduced.matches && !animate) {
    value = depths.reduce((best, stop) => Math.abs(stop - value) < Math.abs(best - value) ? stop : best);
  }
  target = value;
  animation = animate && !reduced.matches && target !== position
    ? { from:position, elapsed:0, duration:.28 + 1.65 * Math.abs(target - position) }
    : undefined;
  requestFrame();
}
function step(sign) {
  const next = sign > 0 ? depths.find(d => d > target + .01) : depths.findLast(d => d < target - .01);
  travel(next ?? (sign > 0 ? 1 : 0));
}
grip.addEventListener('click', () => { if (!active) travel(1); });
back.addEventListener('click', () => travel(0));
stops.forEach((button, i) => button.addEventListener('click', () => travel(depths[i + 1])));
document.addEventListener('keydown', e => {
  if (!active || e.altKey || e.metaKey || e.ctrlKey) return;
  switch (e.key) {
    case 'Home': case 'Escape': travel(0); break;
    case 'End': travel(1); break;
    case 'ArrowLeft': case 'ArrowDown': step(-1); break;
    case 'ArrowRight': case 'ArrowUp': step(1); break;
    default: return;
  }
  e.preventDefault();
});

function startDrag(e) {
  if (!e.isPrimary || e.button !== 0) return;
  drag = { id:e.pointerId, x:e.clientX, y:e.clientY, start:position, inside:active, moved:false };
  stage.setPointerCapture(e.pointerId);
}
grip.addEventListener('pointerdown', startDrag);
view.addEventListener('pointerdown', startDrag);
function scrub(e) {
  const distance = (e.clientX - drag.x) * .91 - (e.clientY - drag.y) * .42;
  if (!drag.moved) {
    if (Math.abs(distance) < 4) return;
    drag.moved = true;
    if (!drag.inside || drag.start < .02) direction = Math.sign(distance);
    else if (drag.start > .98) direction = -Math.sign(distance);
  }
  travel(drag.start + direction * distance / Math.max(90, Math.min(420, width * .52, height * .64)), false);
}
stage.addEventListener('pointermove', e => {
  if (!e.isPrimary) return;
  if (drag?.id === e.pointerId) scrub(e);
  else if (active && !reduced.matches && e.pointerType === 'mouse') {
    gazeTarget = clamp(e.clientX / width) * 2 - 1;
    requestFrame();
  }
});
window.addEventListener('pointerup', e => {
  if (drag?.id !== e.pointerId) return;
  // A touch's final coalesced move may arrive in the same frame as pointerup.
  scrub(e);
  const gesture = drag;
  drag = undefined;
  if (!gesture.moved) {
    if (!gesture.inside) travel(1);
    else if (target > .98) travel(0);
    else step(1);
  } else if (target < .025) travel(0, false);
  else settleOil();
});
function cancelDrag() {
  if (!drag) return;
  drag = undefined;
  if (active && target < .025) travel(0);
}
window.addEventListener('pointercancel', e => { if (drag?.id === e.pointerId) cancelDrag(); });
window.addEventListener('blur', cancelDrag);
view.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (reduced.matches) { if (delta) step(Math.sign(delta)); return; }
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
  travel(target + delta * unit / Math.max(440, height), false);
}, {passive:false});

function placeTip(x, y, angle) {
  guide.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + angle.toFixed(3) + 'rad)';
}
function fit() {
  width = stage.clientWidth; height = stage.clientHeight;
  if (active) requestFrame();
  else {
    const unit = Math.min(height * .31, width * .49);
    placeTip(width * .5 + .28 * unit, height * .46 - .13 * unit, -.35);
  }
}
new ResizeObserver(fit).observe(stage);
fit();
guide.hidden = false;
reduced.addEventListener('change', () => {
  if (!active) return;
  if (reduced.matches) { animation = undefined; settling?.cancel(); gazeTarget = gaze = 0; }
  requestFrame();
});
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame); frame = last = 0;
  if (!document.hidden) requestFrame();
});

export const insideCut = {
  get active() { return active; },
  placeTip, redraw:requestFrame,
  connect(driver) {
    renderer = driver;
    if (active) { renderer.setActive(true); requestFrame(); }
  },
};
