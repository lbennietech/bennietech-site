/**
 * main.js — site entry point. Intentionally tiny: boot the modules.
 * If something looks wrong, open the page with ?debug and watch the console (see core/debug.js).
 */
import { bootModules } from './core/registry.js?v=mv5728rt';
import { modules } from './modules/index.js?v=mv5728rt';
import { DEBUG, logger } from './core/debug.js?v=mv5728rt';

const log = logger('main');

function start() {
  const booted = bootModules(modules);
  log.log(`${booted.length} module instances running`);
  if (DEBUG) window.BT = { booted, modules };   // handy console access:  BT.booted, BT.modules
}

// Module scripts are deferred, but wait for DOM just in case this file is moved.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
