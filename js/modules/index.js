/**
 * modules/index.js — THE MODULE LIST. To add a new module:
 *   1. create js/modules/my-thing.js exporting  { name: 'my-thing', init(el) { ... } }
 *   2. import it here and add it to the array
 *   3. put data-module="my-thing" on any element in index.html
 * ORDER MATTERS (see core/registry.js): list modules that create DOM before modules that use it.
 */
import intro from './intro.js?v=mvm2gv08';                          // splash; defines window.__btIntro that `reveal` waits for
import { chromeNav, chromeFooter } from './chrome.js?v=mvm2gv08';   // renders nav + footer + [data-logo] logos
import art from './art.js?v=mvm2gv08';                              // shader artwork in every plate
import embed from './embed.js?v=mvm2gv08';                          // live pages framed in a screen (the lab)
import caps from './caps.js?v=mvm2gv08';                            // capabilities index (drives an art canvas -> after art)
import rail from './rail.js?v=mvm2gv08';                            // approach progress rail
import lab from './lab.js?v=mvm2gv08';                              // scene switcher for the framed simulation
import blueprint from './blueprint.js?v=mvm2gv08';                  // the mark as a construction drawing
import schematic from './schematic.js?v=mvm2gv08';                  // solution archetype diagrams
import railScroll from './rail-scroll.js?v=mvm2gv08';               // sideways gallery controls
import horizon from './horizon.js?v=mvm2gv08';                      // horizon chart <-> trend list
import copyEmail from './copy-email.js?v=mvm2gv08';                 // contact: copy the address
import reveal from './reveal.js?v=mvm2gv08';                        // scroll reveals, split headings, the pinned manifesto
import heroSculpt from './hero-sculpt.js?v=mvm2gv08';               // the 3D block-B in the hero
import ctaMark from './cta-mark.js?v=mvm2gv08';                     // the stacked block-B in the contact panel

export const modules = [
  intro,
  chromeNav, chromeFooter,
  art, embed,
  caps, rail, lab, blueprint, schematic, railScroll, horizon, copyEmail,
  reveal,
  heroSculpt, ctaMark,
];
