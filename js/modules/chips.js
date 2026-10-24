/**
 * chips.js — cycles a highlight through the chips in the console bar (decorative).
 * Only runs while the console is on screen: an interval that fires forever, off-screen, shows up in
 * battery profiles without anyone ever seeing it.
 */
import { whenVisible, reducedMotion } from '../core/utils.js?v=mvlra7gn';

export default {
  name: 'chips',
  init(el) {
    const chips = [...el.children];
    if (!chips.length || reducedMotion()) return;
    let i = 0, timer = null;
    const step = () => { chips.forEach((c, k) => c.classList.toggle('is-active', k === i)); i = (i + 1) % chips.length; };
    whenVisible(el, visible => {
      if (visible && !timer) { step(); timer = setInterval(step, 2200); }
      else if (!visible && timer) { clearInterval(timer); timer = null; }
    });
  },
};
