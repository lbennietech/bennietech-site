/**
 * tools/stamp.mjs — cache-busting for deploys. Run before every commit that changes CSS/JS:
 *
 *     node tools/stamp.mjs
 *
 * GitHub Pages lets browsers cache files for 10 minutes, so after a deploy a returning visitor could get the new
 * index.html with OLD JavaScript (a broken mix). This script appends ?v=<stamp> to every relative import in js/**
 * and to the CSS/JS links in index.html, so each deploy is fetched as a complete, consistent set.
 * No build step: the files stay hand-editable; the stamps are just query strings.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = Date.now().toString(36);
const VERSIONED = /((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"?]+\.js)(?:\?v=[\w]+)?(['"])/g;

function walk(dir) {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

let files = 0;
for (const file of walk(join(root, 'js')).filter(f => f.endsWith('.js'))) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(VERSIONED, `$1$2?v=${stamp}$3`);
  if (out !== src) { writeFileSync(file, out); files++; }
}

const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8')
  .replace(/((?:href|src)="(?:css|js)\/[^"?]+\.(?:css|js))(?:\?v=\w+)?"/g, `$1?v=${stamp}"`);
writeFileSync(htmlPath, html);

console.log(`stamped v=${stamp} (${files} js files + index.html)`);
