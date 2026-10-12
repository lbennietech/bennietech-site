/**
 * tiles.js — ONE shared WebGL context paints every artwork canvas on the page.
 *
 * Browsers cap WebGL contexts (~16), and the page has dozens of tiles, so each tile is a plain 2D canvas:
 * the shared GL canvas renders the tile's shader into its corner, then the pixels are copied across with
 * drawImage. Only tiles on screen are rendered, at ~30fps, within a per-frame time budget (round-robin), so
 * scrolling stays smooth even on modest GPUs.
 *
 *   const tile = addTile({ canvas, kind: 'chrome', uniforms: () => ({...}), texture: canvas2d? });
 *   tile.visible = true/false;  tile.dirty = true (forces a redraw);  removeTile(tile)
 */
import { program } from './gl.js?v=mv58cl40';
import { SHADERS } from './tile-shaders.js?v=mv58cl40';
import { addTask } from '../core/ticker.js?v=mv58cl40';
import { logger } from '../core/debug.js?v=mv58cl40';

const log = logger('tiles');
const MAX = 1024;                // largest render size (px); bigger tiles are upscaled
const FPS = 30, BUDGET = 9;      // ms of rendering per animation frame
// ray-marched 3D artworks are rendered at 2x and scaled down (supersampling) so their edges stay smooth
const SUPERSAMPLE = { gyro: 2, dither: 1 };

let gl = null, glCanvas = null, failed = false, stop = null, cursor = 0, acc = 0;
const tiles = [];
const progs = {};

function init() {
  if (gl || failed) return !!gl;
  glCanvas = document.createElement('canvas');
  glCanvas.width = glCanvas.height = MAX;
  gl = glCanvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) { failed = true; log.warn('WebGL unavailable: tiles fall back to CSS'); return false; }
  gl.getExtension('OES_standard_derivatives');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return true;
}

function prog(kind) {
  if (kind in progs) return progs[kind];
  const src = SHADERS[kind];
  const p = src ? program(gl, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }', src) : null;
  if (!src) log.warn(`unknown artwork "${kind}"`);
  progs[kind] = p && { p, loc: {}, attr: gl.getAttribLocation(p, 'p') };
  return progs[kind];
}

function uniform(pr, name) { return name in pr.loc ? pr.loc[name] : (pr.loc[name] = gl.getUniformLocation(pr.p, name)); }

function render(tile, t) {
  const pr = prog(tile.kind);
  const c = tile.canvas;
  if (!pr || !c.width) return;
  const ss = SUPERSAMPLE[tile.kind] || 1;
  const w = Math.min(Math.round(c.width * ss), MAX), h = Math.min(Math.round(c.height * ss), MAX);
  gl.useProgram(pr.p);
  gl.enableVertexAttribArray(pr.attr);
  gl.vertexAttribPointer(pr.attr, 2, gl.FLOAT, false, 0, 0);
  const u = tile.uniforms(t);
  u.uRes = [w, h];
  for (const [k, v] of Object.entries(u)) {
    const l = uniform(pr, k);
    if (l == null) continue;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else gl.uniform3fv(l, v);
  }
  if (tile.texture) {
    if (!tile.tex || tile.texDirty) {
      tile.tex = tile.tex || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tile.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tile.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      tile.texDirty = false;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tile.tex);
    const l = uniform(pr, 'uTex'); if (l) gl.uniform1i(l, 0);
  }
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // the viewport sits at the bottom-left of the GL canvas
  tile.ctx.imageSmoothingQuality = 'high';
  tile.ctx.drawImage(glCanvas, 0, MAX - h, w, h, 0, 0, c.width, c.height);
  tile.dirty = false;
}

function tick(t, dt) {
  acc += dt;
  const due = acc >= 1 / FPS;
  if (due) acc = 0;
  const start = performance.now();
  const n = tiles.length;
  for (let k = 0; k < n; k++) {
    const tile = tiles[(cursor + k) % n];
    if (!tile.visible && !tile.dirty) continue;
    if (!tile.dirty && (!due || !tile.animate)) continue;
    render(tile, t);
    if (performance.now() - start > BUDGET) { cursor = (cursor + k + 1) % n; return; }
  }
}

export function addTile(opts) {
  if (!init()) return null;
  const tile = { visible: false, dirty: true, animate: true, ctx: opts.canvas.getContext('2d'), ...opts };
  tiles.push(tile);
  if (!stop) stop = addTask(tick);
  return tile;
}

export function removeTile(tile) {
  const i = tiles.indexOf(tile);
  if (i >= 0) tiles.splice(i, 1);
}

/** Draw a tile immediately (used for static / reduced-motion tiles and debugging). */
export function renderNow(tile, t = 2) { if (gl && tile) render(tile, t); }
