/**
 * pointer.js — shared pointer tracking + the "layer fan" used by everything that wears the logo style.
 *
 * fan(t) returns { ox, oy }: the direction/spread of the stacked colour layers behind logo-style things.
 *  - While the pointer is moving, the layers swing away from it (like a 3D extrusion seen from the cursor).
 *  - Otherwise (touch screens, idle) they sway gently on their own.
 * Used by modules/wordmark.js (text) and modules/hero-funk.js (stickers) so they always move in sync.
 */
import { clamp } from './utils.js';

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

export function fan(t) {
  return {
    ox: pointer.active ? pointer.x * 1.5 : Math.sin(t * .7) * 1.1,
    oy: clamp(pointer.active ? 1 + pointer.y * .55 : 1 + Math.cos(t * .55) * .3, .3, 1.8),
  };
}
