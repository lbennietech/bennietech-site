/**
 * reveal.js — scroll-triggered text and block animation. Attach once:  <main data-module="reveal">
 *
 *   data-reveal        fade/slide the element up when it enters the viewport.
 *                      Optional per-element delay:  style="--d:.2s"
 *   data-line          draw an element's ::before hairline in (used by .chapter heads).
 *   data-split         split a heading into words that slide up one by one (masked line reveal).
 *   data-scrub         a paragraph whose words light up as you scroll past it. Inline elements inside it
 *                      (e.g. <span class="ipill">) are kept and light up in turn.
 *                      Optional highlighted words:  data-hl="evolve,tomorrow"
 *
 * Accessibility: split text keeps its full sentence in aria-label; the per-word spans are aria-hidden.
 */
import { reducedMotion, clamp } from '../core/utils.js?v=mvm2gv08';

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

    /* ---- scrubbed paragraphs: text is split into words; inline elements (e.g. artwork pills) are kept and
            light up in sequence like a word ---- */
    const scrubs = [...root.querySelectorAll('[data-scrub]')].map(el => {
      const hl = new Set((el.dataset.hl || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean));
      el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
      const words = [];
      [...el.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          node.textContent.split(/[ \t\n\r]+/).filter(Boolean).forEach(word => {   // not \s: &nbsp; keeps words together
            const s = document.createElement('span');
            s.className = 'scrub-word'; s.setAttribute('aria-hidden', 'true');
            s.textContent = word;
            if (hl.has(word.replace(/[^a-z]/gi, '').toLowerCase())) {
              // underline the letters only: trailing punctuation stays outside the highlighted span
              const [, letters, tail] = word.match(/^(.*[a-z])([^a-z]*)$/i);
              s.classList.add('hl');
              s.textContent = '';
              const w = document.createElement('span'); w.className = 'hl-w'; w.textContent = letters;
              s.append(w, tail);
            }
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
      const pin = el.closest('[data-scrub-pin]');
      const q = sel => pin?.querySelector(sel);
      const out = { count: q('[data-scrub-count]'), read: q('[data-scrub-read]'), total: q('[data-scrub-total]') };
      if (out.total) out.total.textContent = String(words.length).padStart(2, '0');
      return { el, words, pin, pinBox: pin?.firstElementChild, out };
    });

    function updateScrub() {
      const vh = window.innerHeight;
      for (const { el, words, pin, pinBox, out } of scrubs) {
        let p;
        if (pin && pinBox && getComputedStyle(pinBox).position === 'sticky') {
          // pinned: 0 when the section's top reaches mid-screen, 1 at 80% of its pinned run, so the finished
          // paragraph rests for the last stretch before it scrolls away
          const r = pin.getBoundingClientRect();
          p = clamp((vh * .5 - r.top) / Math.max(1, r.height - vh * .5) / .8, 0, 1);
        } else {
          // progress 0 when the paragraph's top is at 85% of the viewport, 1 when its bottom reaches 40%
          const r = el.getBoundingClientRect();
          p = clamp((vh * .85 - r.top) / (r.height + vh * .45), 0, 1);
        }
        const lit = p * words.length * 1.15;
        if (pin) {
          const n = clamp(Math.floor(lit), 0, words.length), f = n / words.length;
          pin.style.setProperty('--read', f.toFixed(3));
          if (out.count) out.count.textContent = String(n).padStart(2, '0');
          if (out.read) out.read.textContent = String(Math.round(f * 100)).padStart(3, '0') + '%';
        }
        words.forEach((w, i) => {
          const o = clamp(.2 + (lit - i) * .5, .2, 1);
          w.style.opacity = o.toFixed(2);
          if (w.classList.contains('hl')) w.style.setProperty('--lit', o > .95 ? 1 : 0);   // draws the word's underline
        });
      }
    }

    /* ---- in-view toggle for data-reveal / data-split ---- */
    const targets = root.querySelectorAll('[data-reveal],[data-split],[data-line]');
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
      }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
      targets.forEach(el => io.observe(el));
    }

    if (scrubs.length) {
      if (reduce) scrubs.forEach(s => {
        s.words.forEach(w => { w.style.opacity = 1; w.style.setProperty('--lit', 1); });
        s.pin?.style.setProperty('--read', 1);
        if (s.out.count) s.out.count.textContent = String(s.words.length).padStart(2, '0');
        if (s.out.read) s.out.read.textContent = '100%';
      });
      else {
        window.addEventListener('scroll', updateScrub, { passive: true });
        window.addEventListener('resize', updateScrub);
        updateScrub();
      }
    }
  },
};
