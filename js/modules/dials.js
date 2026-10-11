/**
 * dials.js — wires the demo sliders/swatches to a live art canvas. data-module="dials"
 * Looks inside its element for:
 *   canvas[data-role="dial-target"]   the artwork to control (an art.js canvas)
 *   input[data-param="density|hue|speed"]
 *   button[data-palette="name"]
 */
export default {
  name: 'dials',
  init(el) {
    const canvas = el.querySelector('[data-role="dial-target"]');
    if (!canvas) return;
    // art.js has already run on this canvas if it is listed earlier in index.js; handle both orders:
    const api = () => canvas.__art;

    el.querySelectorAll('input[data-param]').forEach(input => {
      input.addEventListener('input', () => api()?.set({ [input.dataset.param]: Number(input.value) }));
    });
    const swatches = [...el.querySelectorAll('button[data-palette]')];
    swatches.forEach(btn => btn.addEventListener('click', () => {
      api()?.set({ palette: btn.dataset.palette });
      swatches.forEach(b => b.classList.toggle('is-active', b === btn));
    }));
    swatches[0]?.classList.add('is-active');
  },
};
