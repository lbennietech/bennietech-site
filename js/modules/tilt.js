/**
 * tilt.js — subtle 3D hover tilt for tiles and cards. data-module="tilt"
 * Sets CSS variables --rx / --ry (degrees) that components.css applies as a perspective transform.
 * Disabled on touch devices and for reduced-motion users.
 */
import { reducedMotion } from '../core/utils.js?v=mv55min1';

export default {
  name: 'tilt',
  init(el) {
    if (reducedMotion() || window.matchMedia('(hover: none)').matches) return;
    const max = 9;   // degrees
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      el.style.setProperty('--ry', (px * max * 2).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-py * max * 2).toFixed(2) + 'deg');
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    });
  },
};
