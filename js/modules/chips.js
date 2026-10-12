/**
 * chips.js — cycles a highlight through the chips in the console bar (decorative). data-module="chips"
 */
import { reducedMotion } from '../core/utils.js?v=mv4mo2pl';

export default {
  name: 'chips',
  init(el) {
    const chips = [...el.children];
    if (!chips.length) return;
    let i = 0;
    const step = () => { chips.forEach((c, k) => c.classList.toggle('is-active', k === i)); i = (i + 1) % chips.length; };
    step();
    if (!reducedMotion()) setInterval(step, 2200);
  },
};
