/**
 * art.js — turns any  <canvas data-module="art" data-art="halftone" data-palette="blue" data-seed="3">
 * into live generative artwork.
 *
 * Attributes:  data-art      generator name (see js/art/generators.js)
 *              data-palette  palette name   (see js/art/palettes.js)
 *              data-seed     number, changes the variation
 *              data-text     text for the "type" generator
 *              data-static   present => draw once, don't animate
 *
 * Performance: each canvas only animates while on screen, at ~30fps, via the shared ticker.
 * Control from code:  canvas.__art.set({ density: 1.5, hue: 90, speed: 2, palette: 'pink' })
 */
import { GENERATORS } from '../art/generators.js';
import { PALETTES } from '../art/palettes.js';
import { addTask } from '../core/ticker.js';
import { shiftHue, whenVisible, onResize, reducedMotion } from '../core/utils.js';
import { logger } from '../core/debug.js';

const log = logger('art');
const FRAME = 1 / 30;     // seconds between redraws

export default {
  name: 'art',
  init(canvas) {
    const kind = canvas.dataset.art;
    const draw = GENERATORS[kind];
    if (!draw) { log.warn(`Unknown data-art="${kind}"`, canvas); return; }

    const ctx = canvas.getContext('2d');
    const state = {
      seed: Number(canvas.dataset.seed) || 1,
      palette: canvas.dataset.palette || 'volt',
      text: canvas.dataset.text || 'BT',
      density: 1, hue: 0, speed: 1,
      colors: null,
    };
    let w = 0, h = 0, time = 2 + state.seed, lastDraw = -1, stopTask = null;
    const animate = !canvas.hasAttribute('data-static') && !reducedMotion();

    function resolveColors() {
      const p = PALETTES[state.palette] || PALETTES.volt;
      state.colors = state.hue
        ? { bg: p.bg, a: shiftHue(p.a, state.hue), b: p.b, c: shiftHue(p.c, state.hue) }
        : p;
    }

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(2, Math.round(r.width)); h = Math.max(2, Math.round(r.height));
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    }

    function render() {
      if (!w) return;
      try { draw(ctx, w, h, time, state); }
      catch (e) { log.error(`generator "${kind}" threw`, e); }
    }

    function tick(_now, dt) {
      time += dt * state.speed;
      lastDraw += dt;
      if (lastDraw < FRAME) return;
      lastDraw = 0;
      render();
    }

    resolveColors();
    size();
    onResize(canvas, size);
    // redraw once webfonts are ready (type / brand / wordfill generators use them)
    document.fonts?.ready.then(render);
    document.fonts?.load('400 64px Shrikhand').then(render).catch(() => {});

    if (animate) {
      whenVisible(canvas, visible => {
        if (visible && !stopTask) stopTask = addTask(tick);
        else if (!visible && stopTask) { stopTask(); stopTask = null; }
      });
    }

    // Public handle for other modules (e.g. the "dials" demo) and for debugging.
    canvas.__art = {
      state,
      set(params) {
        Object.assign(state, params);
        resolveColors();
        if (!animate || !stopTask) render();
      },
    };
  },
};
