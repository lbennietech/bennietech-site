/**
 * caps.js — the capabilities index. <div data-module="caps">
 *
 * A list of disciplines beside ONE live specimen plate. The plate shows the discipline you are pointing at;
 * without a pointer it follows your reading position (the row nearest the middle of the screen).
 * The plate is a single art canvas whose shader is swapped in place (tile.kind) — one renderer, not ten.
 *
 *   <li class="caps__row" data-art="isolines" data-seed="3" data-note="Isolines — …">
 *
 * Must boot after `art` (it drives the canvas's __art handle). Rows are plain text: everything the plate
 * shows is also said in words, so the plate is aria-hidden.
 */
import { reducedMotion } from '../core/utils.js?v=mvm2gv08';

export default {
  name: 'caps',
  init(root) {
    const rows = [...root.querySelectorAll('.caps__row')];
    const canvas = root.querySelector('.caps__view canvas');
    const view = root.querySelector('.caps__view');
    const fig = root.querySelector('[data-caps-fig]');
    const note = root.querySelector('[data-caps-note]');
    const name = root.querySelector('[data-caps-name]');
    const count = root.querySelector('[data-caps-count]');
    const study = root.querySelector('[data-caps-study]');
    if (!rows.length || !canvas) return;

    let current = -1, pointing = false;
    function activate(i) {
      if (i === current || i < 0) return;
      current = i;
      const row = rows[i];
      rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
      const art = canvas.__art;
      if (art) {
        art.tile.kind = row.dataset.art;
        art.set({ seed: Number(row.dataset.seed) || 1 });
      }
      if (fig) fig.textContent = 'Fig. 01.' + String(i + 1).padStart(2, '0');   // chapter.plate, like the rest of the site
      if (note) note.textContent = row.dataset.note || '';
      if (name) name.textContent = row.querySelector('.caps__name')?.textContent || '';
      if (count) count.textContent = String(i + 1).padStart(2, '0');
      if (study) study.textContent = row.dataset.study || '';
      view?.style.setProperty('--study', ((i + 1) / rows.length).toFixed(3));
      if (view && !reducedMotion()) {          // a scan line sweeps the plate as the study changes
        view.classList.remove('is-scan');
        void view.offsetWidth;
        view.classList.add('is-scan');
      }
    }

    rows.forEach((row, i) => row.addEventListener('pointerenter', e => {
      if (e.pointerType === 'touch') return;
      pointing = true; activate(i);
    }));
    root.querySelector('.caps__list')?.addEventListener('pointerleave', () => { pointing = false; follow(); });

    // follow the reading position when nobody is pointing
    function follow() {
      if (pointing) return;
      const mid = innerHeight * .5;
      let best = 0, bestD = Infinity;
      rows.forEach((r, i) => {
        const b = r.getBoundingClientRect();
        const d = Math.abs(b.top + b.height / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      activate(best);
    }
    let raf = 0;
    window.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(follow); }, { passive: true });
    activate(0);
  },
};
