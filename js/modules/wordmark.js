/**
 * wordmark.js — brings the BennieTech name to life.   <div data-module="wordmark"><span class="bt-word">BennieTech</span></div>
 *
 *  • Splits the word into letters (so each can wobble / jump on hover — CSS in components.css).
 *  • Drives the colour-layer fan (--ox/--oy) so the layers swing like a 3D extrusion
 *    (follows the pointer; sways on its own on touch/idle — see core/pointer.js).
 *  • Add data-wave to the .bt-word for a constant per-letter bobbing animation.
 * Only animates while on screen.
 */
import { addTask } from '../core/ticker.js';
import { whenVisible, reducedMotion, lerp } from '../core/utils.js';
import { fan, listenPointer } from '../core/pointer.js';

export function splitLetters(word) {
  if (word.dataset.split) return;
  const text = word.textContent.trim();
  word.dataset.split = '1';
  word.setAttribute('aria-label', text);
  word.textContent = '';
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'bt-letter'; s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--i', i);
    s.textContent = ch;
    word.appendChild(s);
  });
}

export default {
  name: 'wordmark',
  init(root) {
    const word = root.classList.contains('bt-word') ? root : root.querySelector('.bt-word');
    if (!word) return;
    splitLetters(word);
    if (reducedMotion()) return;
    listenPointer();
    let ox = -.15, oy = 1, stop = null;
    const tick = (t) => {
      const f = fan(t);
      ox = lerp(ox, f.ox, .08); oy = lerp(oy, f.oy, .08);
      word.style.setProperty('--ox', ox.toFixed(3));
      word.style.setProperty('--oy', oy.toFixed(3));
    };
    whenVisible(root, v => {
      if (v && !stop) stop = addTask(tick);
      else if (!v && stop) { stop(); stop = null; }
    });
  },
};
