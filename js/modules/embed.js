/**
 * embed.js — a live page (e.g. the Pocket Universe simulation) framed in a tile. data-module="embed"
 * <iframe data-module="embed" data-src="https://…" title="…">
 *
 * The page only runs while the tile is on screen: it loads as it scrolls into view and is unloaded once it is
 * well out of view, so a running simulation never drains a phone's battery off-screen. Each visit starts fresh.
 */
import { whenVisible } from '../core/utils.js?v=mv5728rt';

export default {
  name: 'embed',
  init(frame) {
    const src = frame.dataset.src;
    if (!src) return;
    frame.addEventListener('load', () => frame.classList.toggle('is-live', frame.src === src));
    whenVisible(frame, v => {
      if (v && frame.src !== src) frame.src = src;
      else if (!v && frame.src === src) { frame.classList.remove('is-live'); frame.src = 'about:blank'; }
    }, '200px');
  },
};
