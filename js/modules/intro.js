/**
 * intro.js — a short splash where the BennieTech name pops in letter by letter, its colour layers
 * fan out like an extrusion, then the curtain lifts to reveal the page.
 *
 * - Shown once per browser session (sessionStorage), skipped for reduced-motion and with ?nointro.
 * - Other modules can wait for it:  await window.__btIntro   (a Promise that resolves when it's done).
 * Remove the module from js/modules/index.js to disable the splash entirely.
 */
import { reducedMotion, clamp } from '../core/utils.js';
import { splitLetters } from './wordmark.js';

export default {
  name: 'intro',
  init(host) {
    window.__btIntro = Promise.resolve();
    let seen = false;
    try { seen = sessionStorage.getItem('bt-intro') === '1'; sessionStorage.setItem('bt-intro', '1'); } catch { /* ignore */ }
    if (seen || reducedMotion() || location.search.includes('nointro')) return;

    window.__btIntro = new Promise(resolve => {
      host.innerHTML = '<div class="intro__stage"><span class="bt-word" style="font-size:clamp(3.4rem,15vw,13rem)">BennieTech</span></div>';
      host.classList.add('is-on');
      document.documentElement.classList.add('is-intro');
      const word = host.querySelector('.bt-word');
      splitLetters(word);
      word.classList.add('intro__word');

      // fan the layers out with an overshoot, then lift the curtain
      const start = performance.now(), D = 1300;
      (function frame(now) {
        const p = clamp((now - start) / D, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        word.style.setProperty('--oy', (e * 1.15 + Math.sin(p * Math.PI) * .35).toFixed(3));
        word.style.setProperty('--ox', (Math.sin(p * 3.1) * .8).toFixed(3));
        if (p < 1) requestAnimationFrame(frame);
      })(start);

      setTimeout(() => host.classList.add('is-leaving'), D + 250);
      setTimeout(() => {
        host.classList.remove('is-on', 'is-leaving');
        host.innerHTML = '';
        document.documentElement.classList.remove('is-intro');
        resolve();
      }, D + 250 + 900);
    });
  },
};
