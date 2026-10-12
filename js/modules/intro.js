/**
 * intro.js — a short splash: the two halves of the block-B mark slide together along the cut, a flash of lime
 * light runs through the seam, then the curtain lifts to reveal the page.
 *
 * - Shown once per browser session (sessionStorage), skipped for reduced-motion and with ?nointro.
 * - Other modules can wait for it:  await window.__btIntro   (a Promise that resolves when it's done).
 * Remove the module from js/modules/index.js to disable the splash entirely.
 */
import { reducedMotion } from '../core/utils.js?v=mv55min1';
import { markPiecesSVG } from '../brand/logotype.js?v=mv55min1';

export default {
  name: 'intro',
  init(host) {
    window.__btIntro = Promise.resolve();
    let seen = false;
    try { seen = sessionStorage.getItem('bt-intro') === '1'; sessionStorage.setItem('bt-intro', '1'); } catch { /* ignore */ }
    if (seen || reducedMotion() || location.search.includes('nointro')) return;

    window.__btIntro = new Promise(resolve => {
      host.innerHTML = `<div class="intro__mark">${markPiecesSVG()}</div>`;
      host.classList.add('is-on');
      document.documentElement.classList.add('is-intro');
      const HOLD = 1500;
      setTimeout(() => host.classList.add('is-leaving'), HOLD);
      setTimeout(() => {
        host.classList.remove('is-on', 'is-leaving');
        host.innerHTML = '';
        document.documentElement.classList.remove('is-intro');
        resolve();
      }, HOLD + 900);
    });
  },
};
