/**
 * rail.js — a progress rail across a row of steps. <section data-module="rail">
 *
 * Fills `.approach__fill` (CSS var --rail on the section, 0..1) as the steps scroll through the viewport, and marks
 * each `.step` as reached (.is-reached) once the fill passes its node. Purely decorative: every step is plain text.
 */
import { clamp, reducedMotion } from '../core/utils.js?v=mvm2gv08';

export default {
  name: 'rail',
  init(root) {
    const rail = root.querySelector('.approach__rail');
    const steps = [...root.querySelectorAll('.step')];
    if (!rail || !steps.length) return;

    let marks = [];
    const measure = () => {
      const r = rail.getBoundingClientRect();
      marks = steps.map(s => (s.querySelector('.step__node').getBoundingClientRect().left - r.left) / Math.max(1, r.width));
    };
    const update = () => {
      const list = root.querySelector('.approach__steps').getBoundingClientRect();
      // 0 when the steps' top reaches 80% of the viewport, 1 when their middle reaches 45%
      const p = reducedMotion() ? 1 : clamp((innerHeight * .8 - list.top) / (list.height * .5 + innerHeight * .35), 0, 1);
      root.style.setProperty('--rail', p.toFixed(4));
      if (rail.offsetWidth) steps.forEach((s, i) => s.classList.toggle('is-reached', p > 0 && p + .001 >= marks[i]));
      // stacked layouts hide the rail: a phase is reached once it has scrolled 30% into the viewport
      else steps.forEach(s => s.classList.toggle('is-reached', reducedMotion() || s.getBoundingClientRect().top < innerHeight * .7));
    };
    measure(); update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', () => { measure(); update(); });
    document.fonts?.ready.then(() => { measure(); update(); });
  },
};
