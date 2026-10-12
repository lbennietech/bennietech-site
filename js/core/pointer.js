/**
 * pointer.js — shared pointer tracking: pointer.x / pointer.y in -1..1 across the viewport.
 * `active` turns false 2.5 s after the last move (touch screens, idle), so animations can drift back to rest.
 * Used by modules/hero-sculpt.js to turn the 3D mark towards the cursor.
 */
export const pointer = { x: 0, y: 0, active: false };
let timer = 0, listening = false;

export function listenPointer() {
  if (listening) return;
  listening = true;
  window.addEventListener('pointermove', e => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;     // -1 .. 1
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    pointer.active = true;
    clearTimeout(timer);
    timer = setTimeout(() => (pointer.active = false), 2500);
  }, { passive: true });
}
