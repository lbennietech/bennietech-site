/**
 * ticker.js — ONE shared requestAnimationFrame loop for the whole site.
 * Modules call addTask(fn); fn receives (timeSeconds, deltaSeconds).
 * addTask returns a function that removes the task. When no tasks remain the
 * loop stops, so an idle page costs nothing.
 */
const tasks = new Set();
let raf = 0;
let last = 0;

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(now - last, 100) / 1000;   // clamp so tab-switching doesn't cause a huge jump
  last = now;
  for (const fn of tasks) fn(now / 1000, dt);
}

export function addTask(fn) {
  tasks.add(fn);
  if (tasks.size === 1) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  return () => {
    tasks.delete(fn);
    if (tasks.size === 0) cancelAnimationFrame(raf);
  };
}

export const activeTaskCount = () => tasks.size;   // handy when debugging performance
