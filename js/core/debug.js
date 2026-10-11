/**
 * debug.js — tiny namespaced logger.
 * Turn it on by adding  ?debug  to the URL (e.g. http://localhost:8080/?debug)
 * or by running  localStorage.setItem('bt-debug','1')  in the browser console.
 * With debug on you also get  window.BT  to poke at the running site.
 */
const enabled = (() => {
  try {
    return new URLSearchParams(location.search).has('debug') || localStorage.getItem('bt-debug') === '1';
  } catch { return false; }
})();

export const DEBUG = enabled;

/** Create a logger prefixed with a scope name, e.g. const log = logger('hero-scene'); log('ready'); */
export function logger(scope) {
  const tag = `%c[BT:${scope}]`;
  const style = 'color:#3a3cff;font-weight:600';
  return {
    log:  (...a) => { if (enabled) console.log(tag, style, ...a); },
    warn: (...a) => console.warn(tag, style, ...a),     // warnings/errors always show
    error:(...a) => console.error(tag, style, ...a),
  };
}
