/**
 * marquee.js — makes a seamless infinite scroller.
 * Markup:  <div class="marquee" data-module="marquee" style="--speed:60s"><ul class="marquee__track"> <li>… </ul></div>
 * We clone the list items once so the track is two identical halves; CSS then slides it by -50%.
 * Cloned items are aria-hidden and their (generated) canvases get their own art instance.
 * Note: modules boot in DOM order, so clones are made BEFORE the clone's own data-module canvases
 * are visited only if this module runs first — see index.js (marquee is listed before art).
 *
 * Motion control (WCAG 2.2.2 — auto-moving content needs a pause mechanism):
 *   data-motion-toggle="#selector"  reuse an existing button (e.g. the console play/pause square);
 *   data-motion-toggle              generate a small "Pause" button inside the marquee.
 * Hover and keyboard focus also pause the track (CSS), so this is a third, explicit way.
 */
export default {
  name: 'marquee',
  init(el) {
    const track = el.querySelector('.marquee__track');
    if (!track) return;

    const originals = [...track.children];
    // fill until the original set is at least as wide as the viewport, then duplicate for the loop
    originals.forEach(node => {
      const clone = node.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });

    if (!el.hasAttribute('data-motion-toggle')) return;

    const selector = el.getAttribute('data-motion-toggle').trim();
    let btn = selector ? document.querySelector(selector) : null;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'marquee__toggle';
      btn.textContent = 'Pause';
      // outside the masked .marquee so the edge fade never dims the control
      (el.closest('.marquee-wrap') || el).appendChild(btn);
    }

    const generated = btn.classList.contains('marquee__toggle');
    const setPaused = paused => {
      el.classList.toggle('is-paused', paused);
      btn.setAttribute('aria-pressed', String(paused));
      if (generated) btn.textContent = paused ? 'Play' : 'Pause';
    };

    btn.setAttribute('aria-pressed', 'false');
    if (!btn.hasAttribute('aria-label') && generated) btn.setAttribute('aria-label', 'Pause artwork motion');
    btn.addEventListener('click', () => setPaused(btn.getAttribute('aria-pressed') !== 'true'));
  },
};
