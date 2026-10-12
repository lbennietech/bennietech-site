/**
 * reveal.js — scroll-triggered text and block animation. Attach once:  <main data-module="reveal">
 *
 *   data-reveal        fade/slide the element up when it enters the viewport.
 *                      Optional per-element delay:  style="--d:.2s"
 *   data-split         split a heading into words that slide up one by one (masked line reveal).
 *   data-scrub         a paragraph whose words light up as you scroll past it. Inline elements inside it
 *                      (e.g. <span class="itile">) are kept and light up in turn.
 *                      Optional highlighted words:  data-hl="evolve,tomorrow"
 *
 * Accessibility: split text keeps its full sentence in aria-label; the per-word spans are aria-hidden.
 */
import { reducedMotion, clamp } from '../core/utils.js?v=mv4muao0';

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

    /* ---- scrubbed paragraphs: text is split into words; inline elements (e.g. art tiles) are kept and
            light up in sequence like a word ---- */
    const scrubs = [...root.querySelectorAll('[data-scrub]')].map(el => {
      const hl = new Set((el.dataset.hl || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean));
      el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
      const words = [];
      [...el.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          node.textContent.split(/\s+/).filter(Boolean).forEach(word => {
            const s = document.createElement('span');
            s.className = 'scrub-word'; s.setAttribute('aria-hidden', 'true');
            s.textContent = word;
            if (hl.has(word.replace(/[^a-z]/gi, '').toLowerCase())) s.classList.add('hl');
            frag.append(s, ' ');
            words.push(s);
          });
          node.replaceWith(frag);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          node.setAttribute('aria-hidden', 'true');
          node.classList.add('scrub-word');
          words.push(node);
          node.after(' ');
        }
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
