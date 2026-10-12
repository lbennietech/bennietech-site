/**
 * modules/index.js — THE MODULE LIST. To add a new module:
 *   1. create js/modules/my-thing.js exporting  { name: 'my-thing', init(el) { ... } }
 *   2. import it here and add it to the array
 *   3. put data-module="my-thing" on any element in index.html
 * ORDER MATTERS (see core/registry.js): list modules that create DOM before modules that use it.
 */
import intro from './intro.js?v=mv58cl40';                          // splash; defines window.__btIntro that `reveal` waits for
import { chromeNav, chromeFooter } from './chrome.js?v=mv58cl40';   // renders nav + footer + [data-logo] logos
import marquee from './marquee.js?v=mv58cl40';                      // clones items -> must precede art
import art from './art.js?v=mv58cl40';                              // shader artwork in every tile / card
import embed from './embed.js?v=mv58cl40';                          // live pages framed in tiles
import reveal from './reveal.js?v=mv58cl40';
import tilt from './tilt.js?v=mv58cl40';
import chips from './chips.js?v=mv58cl40';
import heroSculpt from './hero-sculpt.js?v=mv58cl40';               // the 3D block-B in the hero
import ctaMark from './cta-mark.js?v=mv58cl40';                     // the stacked block-B in the contact panel

export const modules = [
  intro,
  chromeNav, chromeFooter,
  marquee,
  art, embed,
  reveal, tilt, chips,
  heroSculpt, ctaMark,
];
