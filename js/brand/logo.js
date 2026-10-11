/**
 * logo.js — the BennieTech logo.
 *
 * THE LOGO IS THE NAME: "BennieTech" in Shrikhand (a chunky italic display face), tilted, near-black,
 * with stacked cyan / green / yellow / pink layers and a soft cyan glow behind it.
 *
 * Two forms of it exist, both made from the same face + colours:
 *  1. THE LOGO FILES  assets/logo/bennietech-logo.svg (light backgrounds) and
 *     bennietech-logo-dark.svg (dark backgrounds) + PNGs. Letters are converted to outlines, so they
 *     render identically everywhere. Regenerate them by opening assets/logo/logo-generator.html.
 *     -> used for the nav bar and mobile menu (logoHTML below).
 *  2. THE LIVE WORDMARK  `.bt-word` (css/components.css): the same style built from real text +
 *     CSS text-shadow layers, so it can be ANIMATED (layers swing with the pointer, letters bounce,
 *     tilt, size to anything). Used for the hero, intro splash, ribbons, and footer.
 *     Variables: --ox/--oy (layer direction/spread), --step, --rot, --ink. See wordmark.js.
 * Canvas versions for tiles live in the `brand` and `wordfill` generators (js/art/generators.js).
 */

/** The logo file as an <img>. `height` is a CSS length; `dark` picks the dark-background variant. */
export function logoHTML({ height = '3.1rem', dark = false } = {}) {
  const src = `assets/logo/bennietech-logo${dark ? '-dark' : ''}.svg`;
  return `<img class="bt-logo-img" src="${src}" alt="BennieTech" style="height:${height}" decoding="async">`;
}

/** Paint the "B" with its colour layers onto a canvas and install it as the favicon (no image file). */
export async function installFavicon() {
  try { await document.fonts.load('400 40px Shrikhand'); } catch { /* use fallback face */ }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e9e9';
  g.beginPath(); g.roundRect(0, 0, 64, 64, 16); g.fill();
  g.font = '400 50px Shrikhand, "Cooper Black", Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(32, 28); g.rotate(-.1); g.transform(1, 0, -.16, 1, 0, 0);
  ['#f2c4dc', '#ffd04d', '#7fc86a', '#4fe0e6'].forEach((col, i) => {
    g.fillStyle = col; g.fillText('B', 0, (4 - i) * 3);
  });
  g.fillStyle = '#0b0b0b'; g.fillText('B', 0, 0);
  g.restore();
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.type = 'image/png';
  link.href = c.toDataURL('image/png');
}
