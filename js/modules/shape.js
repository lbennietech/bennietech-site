/**
 * shape.js — clips any element to a non-rectangular shape.   <div data-module="shape" data-shape="flower">
 *
 * Shapes: flower, flower6, burst, cog, sparkle, squircle, blob (animated, morphs slowly).
 * (Circles, arches and pills don't need this — use the border-radius utility classes in components.css.)
 * A hidden <svg> holding all <clipPath>s is injected once at start-up. Because the clip-paths use
 * objectBoundingBox units, shapes scale with the element.
 *
 * Remember: clip-path also clips box-shadow. Put `filter: drop-shadow()` on a PARENT (class `.fx`) instead.
 */
import { SHAPES, blobPath } from '../art/shapes.js';
import { addTask } from '../core/ticker.js';
import { reducedMotion } from '../core/utils.js';

const NS = 'http://www.w3.org/2000/svg';
let defs = null, blobEl = null;

function ensureDefs() {
  if (defs) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', 0); svg.setAttribute('height', 0);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  defs = document.createElementNS(NS, 'defs');
  svg.appendChild(defs);
  const make = (name, d) => {
    const cp = document.createElementNS(NS, 'clipPath');
    cp.id = `bt-shape-${name}`; cp.setAttribute('clipPathUnits', 'objectBoundingBox');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('clip-rule', 'evenodd');
    cp.appendChild(p); defs.appendChild(cp);
    return p;
  };
  Object.entries(SHAPES).forEach(([name, fn]) => make(name, fn()));
  blobEl = make('blob', blobPath(0));
  document.body.appendChild(svg);

  // Morph the blob slowly (one shared path, updated ~20fps)
  if (!reducedMotion()) {
    let acc = 0;
    addTask((t, dt) => { acc += dt; if (acc < .05) return; acc = 0; blobEl.setAttribute('d', blobPath(t)); });
  }
}

export default {
  name: 'shape',
  init(el) {
    const name = el.dataset.shape;
    if (name !== 'blob' && !SHAPES[name]) return;   // circle/arch/pill are handled by CSS
    ensureDefs();
    const url = `url(#bt-shape-${name})`;
    el.style.clipPath = url; el.style.webkitClipPath = url;
  },
};
