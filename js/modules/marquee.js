/**
 * marquee.js — makes a seamless infinite scroller.
 * Markup:  <div class="marquee" data-module="marquee" style="--speed:60s"><ul class="marquee__track"> <li>… </ul></div>
 * We clone the list items once so the track is two identical halves; CSS then slides it by -50%.
 * Cloned items are aria-hidden and their (generated) canvases get their own art instance.
 * Note: modules boot in DOM order, so clones are made BEFORE the clone's own data-module canvases
 * are visited only if this module runs first — see index.js (marquee is listed before art).
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
  },
};
