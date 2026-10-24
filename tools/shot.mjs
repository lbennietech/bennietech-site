/**
 * tools/shot.mjs — full-page screenshots for design work (not part of the site).
 *
 *   node tools/shot.mjs .shots/shots.json
 *
 * shots.json: [{ "out": ".shots/a.png", "w": 1200, "h": 800, "offset": 1600, "budget": 2000 }]
 * `offset` shifts the page up by N px (body margin) so a band below the fold can be captured in a
 * 1000px-tall viewport. Writes a temporary _shot.html that forces the reveal/animation states open.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

mkdirSync(join(root, '.shots'), { recursive: true });
const base = readFileSync(join(root, 'index.html'), 'utf8');
const shots = JSON.parse(readFileSync(process.argv[2], 'utf8'));

for (const s of shots) {
  const extra = (s.offset ? `body{margin-top:-${s.offset}px!important}` : '') +
    `.marquee__track{animation-play-state:paused!important}`;
  const css = `<style id="shot">
    html{scroll-behavior:auto!important}
    [data-reveal]{opacity:1!important;transform:none!important;transition:none!important}
    .split-word>span{transform:none!important;transition:none!important}
    ${extra}
  </style>`;
  writeFileSync(join(root, '_shot.html'), base.replace('</head>', css + '</head>'));

  const out = join(root, s.out);
  const profile = mkdtempSync(join(tmpdir(), 'dsh-shot-'));
  const args = [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-breakpad', '--disable-crash-reporter',
    '--disable-component-update', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1',
    '--virtual-time-budget=' + (s.budget || 2000),
    '--user-data-dir=' + profile,
    `--window-size=${s.w},${s.h}`,
    '--screenshot=' + out,
    'http://localhost:8080/' + (s.url || '_shot.html?nointro'),
  ];
  try {
    execFileSync(CHROME, args, { stdio: 'ignore', timeout: s.timeout || 60000 });
    console.log('shot', s.out, (await import('node:fs')).statSync(out).size);
  } catch (e) {
    console.log('FAIL', s.out, e.status);
  }
}
