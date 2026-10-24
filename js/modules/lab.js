/**
 * lab.js — scene switcher for the framed Pocket Universe simulation. <figure data-module="lab">
 *
 * Buttons carry data-scene (a Pocket Universe scene key). Pressing one points the embed at that scene: the
 * iframe's data-src changes (embed.js reads it on every visibility change) and, if the frame is live, it reloads.
 */
const BASE = 'https://lbennietech.github.io/pocket-universe/?embed&scene=';

/* A still "poster" drawn in ink behind the frame: a young disc of orbiting bodies, so the screen is never an empty
   void while the simulation loads (or if it is blocked). Deterministic, so it is the same picture every visit. */
function poster() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dots = [], rings = [];
  for (let i = 0; i < 520; i++) {
    const r = 18 + Math.pow(rnd(), .7) * 180, a = rnd() * Math.PI * 2;
    const x = 500 + Math.cos(a) * r * 1.0, y = 250 + Math.sin(a) * r * .92;
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.6 + rnd() * 1.3).toFixed(2)}" opacity="${(.25 + rnd() * .6).toFixed(2)}"/>`);
  }
  for (let i = 1; i <= 7; i++) rings.push(`<ellipse cx="500" cy="250" rx="${i * 27}" ry="${(i * 27 * .92).toFixed(1)}"/>`);
  for (let i = 0; i < 260; i++) dots.push(`<circle cx="${(rnd() * 1000).toFixed(1)}" cy="${(rnd() * 500).toFixed(1)}" r=".7" opacity="${(.12 + rnd() * .3).toFixed(2)}"/>`);
  return `<svg class="lab__poster" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g class="lab__poster-rings">${rings.join('')}</g><g class="lab__poster-dots">${dots.join('')}</g><circle cx="500" cy="250" r="5" class="lab__poster-sun"/></svg>`;
}

export default {
  name: 'lab',
  init(root) {
    const frame = root.querySelector('iframe');
    const label = root.querySelector('[data-lab-scene]');
    const buttons = [...root.querySelectorAll('[data-scene]')];
    const state = root.querySelector('[data-lab-state]');
    if (!frame) return;
    frame.insertAdjacentHTML('beforebegin', poster());
    // "Live" only once the simulation is actually running
    const setLive = live => { root.classList.toggle('is-live', live); if (state) state.textContent = live ? 'Live' : 'Loading'; };
    frame.addEventListener('load', () => setLive(frame.src === frame.dataset.src));
    new MutationObserver(() => { if (!frame.classList.contains('is-live')) setLive(false); }).observe(frame, { attributes: true, attributeFilter: ['class'] });
    buttons.forEach(btn => btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-pressed') === 'true') return;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      const name = btn.textContent.trim();
      frame.dataset.src = BASE + btn.dataset.scene;
      frame.title = 'Pocket Universe, simulated live: ' + name;
      if (label) label.textContent = name;
      // the instrument re-acquires: a scan line sweeps the screen while the scene reloads
      root.classList.remove('is-scan'); void root.offsetWidth; root.classList.add('is-scan');
      if (frame.src !== 'about:blank' && frame.src) {      // live: swap now (dip out, load, fade back in)
        frame.classList.remove('is-live');
        setTimeout(() => { frame.src = frame.dataset.src; }, 200);
      }
    }));
  },
};
