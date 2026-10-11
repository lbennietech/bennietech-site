/**
 * main.js — site entry point. Intentionally tiny: set up the brand favicon, boot the modules.
 * If something looks wrong, open the page with ?debug and watch the console (see core/debug.js).
 */
import { bootModules } from './core/registry.js';
import { modules } from './modules/index.js';
import { installFavicon } from './brand/logo.js';
import { GENERATORS } from './art/generators.js';
import { DEBUG, logger } from './core/debug.js';

const log = logger('main');

function start() {
  installFavicon();
  const booted = bootModules(modules);
  log.log(`${booted.length} module instances running`);

  if (DEBUG) {
    // Handy console access:  BT.booted, BT.art.halftone(...), BT.modules
    window.BT = { booted, modules, art: GENERATORS };
  }
}

// Module scripts are deferred, but wait for DOM just in case this file is moved.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
