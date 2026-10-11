/**
 * modules/index.js — THE MODULE LIST. To add a new module:
 *   1. create js/modules/my-thing.js exporting  { name: 'my-thing', init(el) { ... } }
 *   2. import it here and add it to the array
 *   3. put data-module="my-thing" on any element in index.html
 * ORDER MATTERS (see core/registry.js): list modules that create DOM before modules that use it.
 */
import intro from './intro.js';                          // splash; defines window.__btIntro that `reveal` waits for
import { chromeNav, chromeFooter } from './chrome.js';   // renders nav + footer (the footer contains a wordmark host)
import marquee from './marquee.js';                      // clones items -> must precede art / shape / wordmark
import art from './art.js';
import dials from './dials.js';                          // needs art canvases to exist
import shape from './shape.js';                          // clip-path shapes (after everything that creates [data-shape] nodes)
import wordmark from './wordmark.js';
import reveal from './reveal.js';
import tilt from './tilt.js';
import chips from './chips.js';
import network from './network.js';
import heroFunk from './hero-funk.js';

export const modules = [
  intro,
  chromeNav, chromeFooter,
  marquee,
  art, dials,
  shape, wordmark,
  reveal, tilt, chips, network,
  heroFunk,
];
