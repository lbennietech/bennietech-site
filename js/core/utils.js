/** utils.js — small pure helpers shared by modules. No DOM side-effects here. */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** True if the visitor asked their OS to reduce motion. */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Deterministic random number generator (same seed -> same artwork every load). */
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '#rrggbb' -> [h(0-360), s(0-1), l(0-1)] */
export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

/** Rotate a hex colour's hue by `deg` and return a CSS hsl() string. */
export function shiftHue(hex, deg = 0, alpha = 1) {
  const [h, s, l] = hexToHsl(hex);
  return `hsl(${((h + deg) % 360 + 360) % 360} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}% / ${alpha})`;
}

/** Run `onChange(isVisible)` when an element enters/leaves the viewport. Returns a disconnect function. */
export function whenVisible(el, onChange, margin = '120px') {
  const io = new IntersectionObserver(([e]) => onChange(e.isIntersecting), { rootMargin: margin });
  io.observe(el);
  return () => io.disconnect();
}

/** Call `fn` after the element resizes (debounced a touch via rAF). */
export function onResize(el, fn) {
  let pending = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(fn);
  });
  ro.observe(el);
  return () => ro.disconnect();
}
