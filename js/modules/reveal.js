/**
 * reveal.js — scroll-triggered text and block animation. Attach once:  <main data-module="reveal">
 *
 *   data-reveal        fade/slide the element up when it enters the viewport.
 *                      Optional per-element delay:  style="--d:.2s"
 *   data-split         split a heading into words that slide up one by one (masked line reveal).
 *   data-scrub         a paragraph whose words light up as you scroll past it.
 *                      Optional highlight colours:  data-hl="evolve:blue,composable:pink"
 *
 * Accessibility: split text keeps its full sentence in aria-label; the per-word spans are aria-hidden.
 */
import { reducedMotion, clamp } from '../core/utils.js';

export default {
  name: 'reveal',
  async init(root) {
    const reduce = reducedMotion();
    await (window.__btIntro || Promise.resolve());   // wait for the splash curtain (see modules/intro.js)

    /* ---- split headings into words ---- */
    root.querySelectorAll('[data-split]').forEach(el => {
      const text = el.textContent.trim();
      el.setAttribute('aria-label', text);
      el.textContent = '';
      text.split(/\s+/).forEach((word, i) => {
        const mask = document.createElement('span');
        mask.className = 'split-word'; mask.setAttribute('aria-hidden', 'true');
        const inner = document.createElement('span');
        inner.style.setProperty('--i', i);
        inner.textContent = word;
        mask.appendChild(inner);
        el.append(mask, document.createTextNode(' '));   // the space must sit OUTSIDE the clipping mask
      });
    });

    /* ---- scrubbed paragraphs ---- */
    const scrubs = [...root.querySelectorAll('[data-scrub]')].map(el => {
      const hl = {};
      (el.dataset.hl || '').split(',').forEach(pair => { const [w, c] = pair.split(':'); if (w) hl[w.trim().toLowerCase()] = c?.trim(); });
      const text = el.textContent.trim();
      el.setAttribute('aria-label', text);
      el.textContent = '';
      const words = text.split(/\s+/).map(word => {
        const s = document.createElement('span');
        s.className = 'scrub-word'; s.setAttribute('aria-hidden', 'true');
        s.textContent = word + ' ';
        const key = word.replace(/[^a-z]/gi, '').toLowerCase();
        if (hl[key]) s.classList.add('hl-' + hl[key]);
        el.appendChild(s);
        return s;
      });
      return { el, words };
    });

    function updateScrub() {
      const vh = window.innerHeight;
      for (const { el, words } of scrubs) {
        const r = el.getBoundingClientRect();
        // progress 0 when the paragraph's top is at 85% of the viewport, 1 when its bottom reaches 40%
        const p = clamp((vh * .85 - r.top) / (r.height + vh * .45), 0, 1);
        const lit = p * words.length * 1.15;
        words.forEach((w, i) => { w.style.opacity = clamp(.14 + (lit - i) * .5, .14, 1).toFixed(2); });
      }
    }

    /* ---- in-view toggle for data-reveal / data-split ---- */
    const targets = root.querySelectorAll('[data-reveal],[data-split]');
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
      }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
      targets.forEach(el => io.observe(el));
    }

    if (scrubs.length) {
      if (reduce) scrubs.forEach(s => s.words.forEach(w => (w.style.opacity = 1)));
      else {
        window.addEventListener('scroll', updateScrub, { passive: true });
        window.addEventListener('resize', updateScrub);
        updateScrub();
      }
    }
  },
};
