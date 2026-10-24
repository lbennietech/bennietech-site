/**
 * rail-scroll.js — a horizontal, scroll-snapped gallery with previous/next buttons and a position readout.
 * <div data-module="rail-scroll"> containing .srail__track (the scroller), [data-rail-prev], [data-rail-next],
 * [data-rail-count] and .srail__progress.
 *
 * Nothing moves on its own (no autoplay, so nothing to pause). The track is a focusable region: arrow keys,
 * trackpads and touch scroll it natively; the buttons step one card at a time. The readout shows the range in
 * view; the card in focus (pointed at, else the first in view) gets .is-focus.
 */
export default {
  name: 'rail-scroll',
  init(root) {
    const track = root.querySelector('.srail__track');
    const prev = root.querySelector('[data-rail-prev]'), next = root.querySelector('[data-rail-next]');
    const count = root.querySelector('[data-rail-count]');
    if (!track) return;
    const cards = [...track.children];
    const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth);
    // one card is "in focus" (its schematic runs the lime packet): the one pointed at, else the first in view
    let pointing = false;
    const focus = i => cards.forEach((c, k) => c.classList.toggle('is-focus', k === i));
    cards.forEach((c, i) => c.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { pointing = true; focus(i); } }));
    track.addEventListener('pointerleave', () => { pointing = false; update(); });

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const p = max > 0 ? track.scrollLeft / max : 0;
      root.style.setProperty('--rail-p', p.toFixed(4));
      root.style.setProperty('--rail-w', (track.clientWidth / track.scrollWidth).toFixed(4));
      const first = Math.min(cards.length - 1, Math.round(track.scrollLeft / step()));
      const shown = Math.max(1, Math.floor((track.clientWidth - parseFloat(getComputedStyle(track).paddingLeft)) / step() + .15));
      const last = Math.min(cards.length, first + shown);
      const pad = n => String(n).padStart(2, '0');
      if (count) count.textContent = shown > 1 ? `${pad(first + 1)}–${pad(last)}` : pad(first + 1);
      if (!pointing) focus(first);
      track.classList.toggle('is-scrolled', track.scrollLeft > 2);
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max - 2;
    };
    prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    window.addEventListener('resize', update);
    update();
  },
};
