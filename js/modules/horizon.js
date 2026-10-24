/**
 * horizon.js — the horizon chart beside its list. <figure data-module="horizon">
 *
 * The axis sweeps in and the readings appear left to right when the chart scrolls into view (.is-in). Pointing at
 * (or focusing) a trend in the list lights its reading on the axis in lime, and pointing at a reading lights its
 * trend: the two are the same six items, numbered alike. The chart is decorative; the list says it all in words.
 */
import { reducedMotion } from '../core/utils.js?v=mvm2gv08';

export default {
  name: 'horizon',
  init(fig) {
    const marks = [...fig.querySelectorAll('.hz__marks li')];
    const items = [...(fig.parentElement?.querySelectorAll('.hz__list li') || [])];
    const light = i => { marks.forEach((m, k) => m.classList.toggle('is-on', k === i)); items.forEach((m, k) => m.classList.toggle('is-on', k === i)); };
    items.forEach((el, i) => {
      el.addEventListener('pointerenter', () => light(i));
      el.addEventListener('focusin', () => light(i));
    });
    fig.parentElement?.querySelector('.hz__list')?.addEventListener('pointerleave', () => light(-1));

    if (reducedMotion() || !('IntersectionObserver' in window)) { fig.classList.add('is-in'); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { fig.classList.add('is-in'); io.disconnect(); } }, { threshold: .4 });
    io.observe(fig);
  },
};
