/**
 * generators.js — the generative artwork library.
 *
 * Every generator has the same signature:
 *     draw(ctx, w, h, t, s)
 *   ctx : CanvasRenderingContext2D (already scaled to CSS pixels)
 *   w,h : canvas size in CSS pixels
 *   t   : time in seconds (already multiplied by the "speed" dial)
 *   s   : state { colors:{bg,a,b,c}, density, rand(), seed, text }
 *
 * Generators must be PURE drawing code: no DOM access, no timers. That keeps them easy to test:
 * open the console and call  BT.art.halftone(ctx, 400, 400, 1.2, state)  with ?debug on.
 * To add a new artwork: write a function below, add it to the GENERATORS map at the bottom,
 * then use data-art="yourname" on any <canvas data-module="art">.
 */
import { TAU, rng } from '../core/utils.js';

/* A cached film-grain tile, generated once, used by several generators for tactile richness. */
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (grainTile = c);
}
function applyGrain(ctx, w, h, amount = .18) {
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ---------- 1. HALFTONE — a field of dots whose size ripples like a wave ---------- */
function halftone(ctx, w, h, t, s) {
  const { bg, a, b } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const cols = Math.round(22 * s.density);
  const cell = w / cols;
  const rows = Math.ceil(h / cell) + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = i * cell, y = j * cell;
      const dx = x / w - .5, dy = y / h - .5;
      const d = Math.hypot(dx, dy);
      const v = .5 + .5 * Math.sin(d * 11 - t * 1.6 + s.seed) * Math.cos(dx * 5 + t * .6);
      // soft secondary layer, offset half a cell, in the contrast colour
      ctx.fillStyle = b; ctx.globalAlpha = .35;
      ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * .16 * (1 - v), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y, cell * .52 * v, 0, TAU); ctx.fill();
    }
  }
  applyGrain(ctx, w, h, .12);
}

/* ---------- 2. STRIPES — chromatic ribbons with RGB-style offset ---------- */
function stripes(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const bands = Math.round(9 * s.density);
  const bandH = h / bands;
  const layers = [[c, -4], [b, 0], [a, 4]];
  ctx.lineCap = 'round';
  for (let k = 0; k < bands; k++) {
    for (const [col, off] of layers) {
      ctx.beginPath();
      ctx.strokeStyle = col; ctx.lineWidth = bandH * .5; ctx.globalAlpha = col === b ? .9 : .85;
      for (let x = -10; x <= w + 10; x += 6) {
        const y = bandH * (k + .5) + off
          + Math.sin(x * .018 + t * 1.3 + k * .5 + s.seed) * bandH * .55
          + Math.sin(x * .007 - t * .8) * bandH * .35;
        x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  applyGrain(ctx, w, h, .14);
}

/* ---------- 3. RINGS — a drifting concentric tunnel ---------- */
function rings(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const n = Math.round(14 * s.density);
  const maxR = Math.hypot(w, h) * .62;
  const cols = [a, b, c, bg];
  for (let i = n; i >= 0; i--) {
    const k = i / n;
    const r = maxR * k;
    const cx = w / 2 + Math.sin(t * .9 + k * 3 + s.seed) * w * .12 * k;
    const cy = h / 2 + Math.cos(t * .7 + k * 3) * h * .12 * k;
    ctx.fillStyle = cols[(i + Math.floor(t * .6)) % cols.length];
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  }
  applyGrain(ctx, w, h, .1);
}

/* ---------- 4. MESH — soft, liquid gradient blobs with grain ---------- */
function mesh(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const blobs = [[a, 0], [c, 1.7], [b, 3.1], [a, 4.4], [c, 5.6]];
  const R = Math.max(w, h) * .6;
  blobs.forEach(([col, ph], i) => {
    const x = w * (.5 + .38 * Math.sin(t * .5 + ph + s.seed));
    const y = h * (.5 + .38 * Math.cos(t * .42 + ph * 1.3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * (.55 + .12 * Math.sin(t + i)));
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = .85; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  ctx.globalAlpha = 1;
  applyGrain(ctx, w, h, .35);
}

/* ---------- 5. TYPE — kinetic stacked lettering ---------- */
function type(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const word = (s.text || 'BT').toUpperCase();
  const rows = Math.max(3, Math.round(5 * s.density));
  const rowH = h / rows;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${rowH * 1.25}px "Inter Tight", Impact, sans-serif`;
  const base = ctx.measureText(word).width || 1;
  for (let i = 0; i < rows; i++) {
    const y = rowH * (i + .5);
    const sx = (w * .92) / base * (1 + .14 * Math.sin(t * 1.4 + i * .8 + s.seed));
    const ox = Math.sin(t * .9 + i * 1.1) * w * .05;
    ctx.save();
    ctx.translate(w / 2 + ox, y); ctx.scale(sx, 1);
    if (i % 2) { ctx.lineWidth = 2 / sx; ctx.strokeStyle = a; ctx.strokeText(word, 0, 0); }
    else { ctx.fillStyle = i % 4 === 0 ? a : (i % 3 === 0 ? c : b); ctx.fillText(word, 0, 0); }
    ctx.restore();
  }
  applyGrain(ctx, w, h, .12);
}

/* ---------- 6. GRID — a field of rotating, rounded tiles ---------- */
function grid(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const n = Math.round(6 * s.density);
  const cell = w / n;
  const rows = Math.ceil(h / cell);
  const cols = [a, b, c];
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    const cx = (i + .5) * cell, cy = (j + .5) * cell;
    const d = Math.hypot(i - n / 2, j - rows / 2);
    const ang = Math.sin(t * 1.1 - d * .6 + s.seed) * Math.PI / 2;
    const sc = .5 + .38 * Math.cos(t * 1.1 - d * .6 + s.seed);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    const sz = cell * sc;
    ctx.fillStyle = cols[(i + j) % 3];
    ctx.beginPath(); ctx.roundRect(-sz / 2, -sz / 2, sz, sz, sz * .3); ctx.fill();
    ctx.restore();
  }
  applyGrain(ctx, w, h, .1);
}

/* ---------- 7. WAVES — topographic flow lines ---------- */
function waves(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const n = Math.round(26 * s.density);
  ctx.lineWidth = Math.max(1.2, w / 220);
  for (let k = 0; k < n; k++) {
    const k01 = k / n;
    ctx.strokeStyle = k % 6 === 0 ? c : (k % 2 ? a : b);
    ctx.globalAlpha = k % 2 ? .95 : .55;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 5) {
      const y = h * k01 * 1.1 - h * .05
        + Math.sin(x * .013 + t * 1.1 + k * .22 + s.seed) * h * .07
        + Math.sin(x * .031 - t * .7 + k * .1) * h * .035;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ---------- 8. ORBIT — a glossy planet with rings and satellites ---------- */
function orbit(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * .26;
  // backdrop glow
  const glow = ctx.createRadialGradient(cx, cy, R * .5, cx, cy, R * 2.8);
  glow.addColorStop(0, c); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = .55; ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  // rings (back half)
  const ring = (front) => {
    for (let i = 0; i < 3; i++) {
      const rr = R * (1.5 + i * .42), tilt = .32 + i * .07;
      ctx.strokeStyle = i === 1 ? b : a; ctx.lineWidth = Math.max(1.5, R * .045); ctx.globalAlpha = .9 - i * .2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * tilt, -.35 + Math.sin(t * .3 + s.seed) * .06, front ? 0 : Math.PI, front ? Math.PI : TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  ring(false);
  // planet
  const g = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .08, cx, cy, R);
  g.addColorStop(0, '#fff'); g.addColorStop(.25, a); g.addColorStop(1, c);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  ring(true);
  // satellites
  for (let i = 0; i < 5; i++) {
    const ang = t * (.5 + i * .12) + i * 1.3 + s.seed;
    const rr = R * (1.5 + (i % 3) * .42);
    ctx.fillStyle = i % 2 ? b : '#fff';
    ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * .34, R * .07, 0, TAU); ctx.fill();
  }
  applyGrain(ctx, w, h, .12);
}

/* ======================= BRAND-AWARE GENERATORS =======================
 * These draw the BennieTech name style (black slab italic + stacked cyan/green/yellow/pink layers). */
const BRAND_LAYERS = ['#4fe0e6', '#7fc86a', '#ffd04d', '#f2c4dc'];     // nearest layer first
const BRAND_FONT = (px) => `400 ${px}px Shrikhand, "Cooper Black", "Bowlby One", Georgia, serif`;

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 110;
}

/** Fit `text` to ~`fill` of the canvas width; returns the font size in px. */
function fitText(ctx, text, w, h, fill = .74) {
  ctx.font = BRAND_FONT(100);
  const wide = ctx.measureText(text).width || 1;
  return Math.min(100 * (w * fill) / wide, h * .8);
}

/* ---------- 9. BRAND — each letter bobs while the colour layers swing behind it ---------- */
function brand(ctx, w, h, t, s) {
  const { bg } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const text = s.text || 'BT';
  const ink = isDark(bg) ? '#fafafa' : '#0f0f0f';
  const size = fitText(ctx, text, w, h);
  ctx.font = BRAND_FONT(size);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const widths = [...text].map(ch => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const step = size * .048, sway = Math.sin(t * .9 + s.seed) * 1.3;
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.rotate(-.1); ctx.transform(1, 0, -.16, 1, 0, 0);
  let x = -total / 2;
  [...text].forEach((ch, i) => {
    const wi = widths[i];
    ctx.save();
    ctx.translate(x + wi / 2, Math.sin(t * 2.2 + i * .9) * size * .05);
    ctx.rotate(Math.sin(t * 1.7 + i * 1.3) * .07);
    for (let k = 4; k >= 1; k--) { ctx.fillStyle = BRAND_LAYERS[k - 1]; ctx.fillText(ch, -wi / 2 + sway * step * k, step * k); }
    ctx.fillStyle = ink; ctx.fillText(ch, -wi / 2, 0);
    ctx.restore();
    x += wi;
  });
  ctx.restore();
  applyGrain(ctx, w, h, .08);
}

/* ---------- 10. WORDFILL — big letters filled with moving colour bands ---------- */
const scratchMap = new WeakMap();
function scratch(canvas) {
  let c = scratchMap.get(canvas);
  if (!c || c.width !== canvas.width || c.height !== canvas.height) {
    c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; scratchMap.set(canvas, c);
  }
  return c;
}
function wordfill(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const text = s.text || 'BT';
  const size = fitText(ctx, text, w, h, .8);
  const place = (g) => { g.translate(w / 2, h / 2); g.rotate(-.1); g.transform(1, 0, -.16, 1, 0, 0); };

  // layered "extrusion" behind
  ctx.font = BRAND_FONT(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); place(ctx);
  for (let k = 4; k >= 1; k--) { ctx.fillStyle = BRAND_LAYERS[k - 1]; ctx.fillText(text, 0, size * .048 * k); }
  ctx.restore();

  // bands drawn on a scratch canvas, then masked by the text
  const sc = scratch(ctx.canvas), g = sc.getContext('2d'), k = sc.width / w;
  g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  const cols = [a, b, c, '#0f0f0f'], bandW = (h * .2) / s.density;
  const off = (t * bandW * .9) % (bandW * cols.length);
  g.save(); g.translate(w / 2, h / 2); g.rotate(-.55);
  for (let i = -30; i < 30; i++) { g.fillStyle = cols[((i % 4) + 4) % 4]; g.fillRect(i * bandW + off, -h * 2, bandW + 1, h * 4); }
  g.restore();
  g.globalCompositeOperation = 'destination-in';
  g.font = BRAND_FONT(size); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000';
  g.save(); place(g); g.fillText(text, 0, 0); g.restore();
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(sc, 0, 0, w, h);
}

/* ---------- 11. SPARKLES — twinkling four-point stars ---------- */
function sparkles(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const rand = rng(s.seed * 17), n = Math.round(14 * s.density), cols = [a, b, c];
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, base = (.05 + rand() * .13) * Math.min(w, h), ph = rand() * TAU;
    const r = base * (.55 + .45 * Math.sin(t * 2.2 + ph));
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * .8 + ph) * .4);
    ctx.fillStyle = cols[i % 3];
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0); ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.fill(); ctx.restore();
  }
}

/* ---------- 12. PILLS — an equaliser of rounded bars ---------- */
function pills(ctx, w, h, t, s) {
  const { bg, a, b, c } = s.colors;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const n = Math.round(7 * s.density), cw = w / (n * 1.5 + .5), cols = [a, b, c];
  for (let i = 0; i < n; i++) {
    const bh = h * (.22 + .6 * (.5 + .5 * Math.sin(t * 1.7 + i * .8 + s.seed)));
    const x = cw * .5 + i * cw * 1.5, y = (h - bh) / 2;
    ctx.fillStyle = cols[i % 3];
    ctx.beginPath(); ctx.roundRect(x, y, cw, bh, cw / 2); ctx.fill();
    ctx.fillStyle = bg; ctx.globalAlpha = .5;
    ctx.beginPath(); ctx.arc(x + cw / 2, y + cw * .55, cw * .16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
}

export const GENERATORS = { halftone, stripes, rings, mesh, type, grid, waves, orbit, brand, wordfill, sparkles, pills };
