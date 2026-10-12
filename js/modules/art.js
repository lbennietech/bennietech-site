/**
 * art.js — turns  <canvas data-module="art" data-art="chrome" data-palette="ink" data-seed="3">  into live
 * shader artwork (painted by the shared WebGL renderer in js/gl/tiles.js).
 *
 * Attributes:  data-art      shader name (see js/gl/tile-shaders.js)
 *              data-palette  palette name (see js/art/palettes.js)
 *              data-seed     number, changes the variation
 *              data-text     words for the "type" shader
 *              data-density  scale of the pattern (default 1)
 *              data-static   present => render once, don't animate
 *
 * Control from code:  canvas.__art.set({ density: 1.5, hue: 90, speed: 2, palette: 'flare' })
 * Without WebGL the canvas is hidden and its parent shows a CSS gradient in the palette colours.
 */
import { addTile, renderNow } from '../gl/tiles.js?v=mv55min1';
import { PALETTES, rgb } from '../art/palettes.js?v=mv55min1';
import { NEEDS_TEXTURE } from '../gl/tile-shaders.js?v=mv55min1';
import { whenVisible, onResize, reducedMotion } from '../core/utils.js?v=mv55min1';

export default {
  name: 'art',
  init(canvas) {
    const kind = canvas.dataset.art;
    const state = {
      seed: Number(canvas.dataset.seed) || 1,
      palette: canvas.dataset.palette || 'ink',
      density: Number(canvas.dataset.density) || 1, hue: 0, speed: 1,
    };
    let col = null, time = state.seed * 3.7, last = null;
    const resolve = () => {
      const p = PALETTES[state.palette] || PALETTES.ink;
      col = { uBg: rgb(p.bg), uA: rgb(p.a), uB: rgb(p.b), uC: rgb(p.c) };
    };
    resolve();

    const texture = NEEDS_TEXTURE.has(kind) ? typeTexture(canvas.dataset.text || 'BENNIETECH') : null;
    const tile = addTile({
      canvas, kind, texture,
      animate: !canvas.hasAttribute('data-static') && !reducedMotion(),
      uniforms(t) {
        if (last != null) time += (t - last) * state.speed;
        last = t;
        return { uTime: time, uSeed: state.seed * .37, uDensity: state.density, uHue: (state.hue * Math.PI) / 180, ...col };
      },
    });
    if (!tile) { cssFallback(canvas, state.palette); return; }

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);       // full device resolution (capped at 2x)
      canvas.width = Math.max(2, Math.round(r.width * dpr)); canvas.height = Math.max(2, Math.round(r.height * dpr));
      tile.dirty = true;
    }
    size(); onResize(canvas, size);
    whenVisible(canvas, v => (tile.visible = v), '80px');
    if (texture) document.fonts?.ready.then(() => { drawType(texture, canvas.dataset.text || 'BENNIETECH'); tile.texDirty = true; tile.dirty = true; });

    canvas.__art = {
      state, tile,
      set(params) { Object.assign(state, params); resolve(); tile.dirty = true; },
      render: () => renderNow(tile, time),
    };
  },
};

/* Text for the "type" shader: rows of a word in heavy caps, white on black (the shader colours it). */
function typeTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  drawType(c, text);
  return c;
}
function drawType(c, text) {
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = '800 200px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = 'middle';
  const word = text.toUpperCase() + '. ';
  const w = g.measureText(word).width;
  // squeeze so a whole number of repeats fills the width exactly (seamless wrap)
  const reps = Math.max(1, Math.round(c.width / w));
  g.save(); g.scale(c.width / (w * reps), 1);
  for (let i = 0; i < reps; i++) g.fillText(word, i * w, c.height * .54);
  g.restore();
}

function cssFallback(canvas, palette) {
  const p = PALETTES[palette] || PALETTES.ink;
  canvas.style.display = 'none';
  if (canvas.parentElement) canvas.parentElement.style.background = `radial-gradient(120% 90% at 30% 20%, ${p.a}, ${p.bg} 70%)`;
}
