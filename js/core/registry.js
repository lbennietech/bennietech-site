/**
 * registry.js — boots every module onto the elements that ask for it.
 *
 * A module is a plain object:
 *   { name: 'my-module', init(el, ctx) { ...; return optionalCleanupFn } }
 *
 * - `el` is the DOM element carrying data-module="my-module" (one element may list several, space-separated).
 * - Modules are booted IN THE ORDER OF THE ARRAY in js/modules/index.js, and each module re-queries the DOM
 *   when its turn comes. That ordering matters: e.g. "marquee" must run before "art" so that the
 *   cloned marquee items get their artwork too. Put "dependencies" earlier in the list.
 * - Each init() runs inside try/catch: if one module breaks, the rest of the page still works and
 *   the error is printed with the module name so you can find it fast.
 */
import { logger } from './debug.js?v=mv55min1';

const log = logger('registry');

export function bootModules(modules, ctx = {}) {
  const booted = [];

  // Warn about data-module names nobody registered (typos are the #1 cause of "nothing happens")
  const known = new Set(modules.map(m => m.name));
  document.querySelectorAll('[data-module]').forEach(el => {
    el.dataset.module.split(/\s+/).filter(Boolean).forEach(n => {
      if (!known.has(n)) log.warn(`No module registered for data-module="${n}"`, el);
    });
  });

  for (const mod of modules) {
    document.querySelectorAll(`[data-module~="${mod.name}"]`).forEach(el => {
      try {
        const cleanup = mod.init(el, ctx);
        // async init()s (like reveal) return a promise: surface their errors too
        if (cleanup && typeof cleanup.then === 'function') cleanup.catch(err => log.error(`Module "${mod.name}" failed (async)`, err, el));
        booted.push({ name: mod.name, el, cleanup });
        log.log(`booted ${mod.name} → <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}>`);
      } catch (err) {
        log.error(`Module "${mod.name}" failed to start`, err, el);
      }
    });
  }
  return booted;
}
