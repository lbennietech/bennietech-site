/**
 * embed.js — a live page (e.g. the Pocket Universe simulation) framed in a tile. data-module="embed"
 * <iframe data-module="embed" data-src="https://…" title="…">
 *
 * The page only runs while the tile is on screen: it loads as it scrolls into view and is unloaded once it is
 * well out of view, so a running simulation never drains a phone's battery off-screen. Each visit starts fresh.
 */
import { whenVisible } from '../core/utils.js?v=mvm2gv08';

export default {
  name: 'embed',
  init(frame) {
    if (!frame.dataset.src) return;
    // data-src is read every time, so another module (e.g. lab.js's scene switcher) can repoint the frame
    frame.addEventListener('load', () => frame.classList.toggle('is-live', frame.src === frame.dataset.src));
    whenVisible(frame, v => {
      const src = frame.dataset.src;
      if (v && frame.src !== src) frame.src = src;
      else if (!v && frame.src === src) { frame.classList.remove('is-live'); frame.src = 'about:blank'; }
    }, '200px');
  },
};
