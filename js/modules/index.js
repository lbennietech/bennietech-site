/**
 * modules/index.js — THE MODULE LIST. To add a new module:
 *   1. create js/modules/my-thing.js exporting  { name: 'my-thing', init(el) { ... } }
 *   2. import it here and add it to the array
 *   3. put data-module="my-thing" on any element in index.html
 * ORDER MATTERS (see core/registry.js): list modules that create DOM before modules that use it.
 */
import intro from './intro.js?v=mv4mw8mz';                          // splash; defines window.__btIntro that `reveal` waits for
import { chromeNav, chromeFooter } from './chrome.js?v=mv4mw8mz';   // renders nav + footer + [data-logo] logos
import marquee from './marquee.js?v=mv4mw8mz';                      // clones items -> must precede art
import art from './art.js?v=mv4mw8mz';                              // shader artwork in every tile / card
import dials from './dials.js?v=mv4mw8mz';                          // needs art canvases to exist
import reveal from './reveal.js?v=mv4mw8mz';
import tilt from './tilt.js?v=mv4mw8mz';
import chips from './chips.js?v=mv4mw8mz';
import heroSculpt from './hero-sculpt.js?v=mv4mw8mz';               // the 3D block-B in the hero

export const modules = [
  intro,
  chromeNav, chromeFooter,
  marquee,
  art, dials,
  reveal, tilt, chips,
  heroSculpt,
];
