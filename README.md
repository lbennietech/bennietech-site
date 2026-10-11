# BennieTech — brochure site

A single-page brochure site for **BennieTech** (software solution design).
Plain HTML + CSS + native ES modules. **No build step, no npm, no dependencies.**
All imagery is generated in JavaScript (Canvas 2D, CSS, SVG clip-paths). The only image files are the logo in `assets/logo/`.

---

## 1. Run it

Double-click **`start-site.bat`** (needs Node.js), or:

```bash
node server.js
```

Open <http://localhost:8080>. `PORT=3000 node server.js` for another port.

> ES modules don't load from `file://`, so always view the site through a web server.
> `server.js` is only a convenience: the folder is 100% static and can be dropped on **any** host
> (IIS, nginx, Apache, Netlify, Cloudflare Pages, S3, GitHub Pages…) unchanged.

### Moving to another host / stack
1. Copy the folder (you can leave out `server.js`, `start-site.bat`, `README.md`).
2. Serve it as static files, with `.js` served as `text/javascript`. Done.
3. Fonts load from Google Fonts — to self-host see *Fonts* below.

---

## 2. Debugging

Add **`?debug`** to the URL. Add **`?nointro`** to skip the splash while working.
Example: <http://localhost:8080/?debug&nointro>

* Every module logs when it boots (`[BT:registry] booted art → <canvas>`).
* `window.BT` exposes `BT.booted`, `BT.modules` and `BT.art` (the artwork generators).
* A module that throws is logged with its name and element; **the rest of the page keeps working**.
* Persist debug mode: `localStorage.setItem('bt-debug','1')`.

| Symptom | Likely cause |
|---|---|
| Blank/unstyled page | Opened `index.html` via `file://` — use `node server.js`. |
| `No module registered for data-module="x"` | Typo, or module not listed in `js/modules/index.js`. |
| Name looks like a plain serif | The Shrikhand font didn't load (offline?). It falls back to Cooper Black / Georgia. |
| Shapes show as rectangles | Element is missing `data-module="shape"` (the `data-shape` attribute alone does nothing). |
| Slow on a weak machine | Hero canvas is capped at 1.5× resolution; art only animates while on screen (see `core/ticker.js`). |

---

## 3. Brand: the logo and the "funk"

The logo is **the name in Shrikhand**, tilted, near-black, with four stacked colour layers behind it
(cyan → green → yellow → pink) and a soft cyan glow. That one treatment is reused everywhere:

| Where | How |
|---|---|
| Nav bar + mobile menu | The logo files: `assets/logo/bennietech-logo.svg` / `-dark.svg` (letters converted to outlines). |
| Hero name, splash, ribbons, footer, bento card | The **live wordmark** `.bt-word` (real text + CSS `text-shadow` layers) — animatable. |
| Hero stickers | `js/modules/hero-funk.js`: flower, burst, smiley, cog, bolt, squiggle, sparkle… each drawn with the same layers; they fan out with the pointer exactly like the wordmark. |
| Tiles / cards | Canvas generators `brand` ("BT" letters bobbing) and `wordfill` (colour bands inside letters). |
| Favicon | Painted on a canvas at start-up (`js/brand/logo.js`). |

To regenerate the logo files (e.g. change colours), open `assets/logo/logo-generator.html` through the local server and export `window.svgLight` / `window.svgDark`.
Wordmark knobs (CSS variables on `.bt-word`): `--ox/--oy` layer direction, `--step` layer distance, `--rot` tilt, `--ink` letter colour (`.bt-word--light` for dark backgrounds).

---

## 4. Project layout

```
index.html                 The page. Sections are numbered in comments.
server.js / start-site.bat Local static server (optional).
assets/logo/               Logo SVG/PNG (light + dark) and logo-generator.html.
css/
  tokens.css               ★ Design tokens: colours, fonts, radii, spacing, motion. Start here to restyle.
  base.css                 Reset, typography, layout primitives, reveal animation states.
  components.css           Buttons, nav, menu, tiles (.fx/.tile), marquee, wordmark (.bt-word), ribbons, intro.
  sections.css             Layout for each section, in page order.
js/
  main.js                  Entry point.
  config/site.config.js    ★ Company name, contact details, nav links.
  core/                    registry (boots modules), ticker (shared rAF), utils, debug, pointer (shared pointer + layer fan).
  brand/logo.js            Logo markup helper + canvas favicon.
  art/
    palettes.js            Colour sets for artwork.
    generators.js          12 artworks: halftone, stripes, rings, mesh, type, grid, waves, orbit, brand, wordfill, sparkles, pills.
    shapes.js              Outline shapes: flower, flower6, burst, cog, sparkle, squircle, animated blob.
  modules/
    index.js               ★ The module list (order matters).
    chrome.js              Nav, mobile menu, footer (from site.config.js).
    intro.js               Splash: the name pops in, curtain lifts (once per session).
    hero-funk.js           Hero stickers (Canvas 2D).
    wordmark.js            Letter split + layer fan for .bt-word.
    shape.js               Clips an element to a shape via data-shape.
    art.js                 <canvas data-art="…"> -> live artwork.
    reveal.js              Scroll reveals, split-word headings, scrubbed paragraph.
    marquee.js, tilt.js, chips.js, dials.js, network.js
```

---

## 5. How the module system works

Behaviour is attached with a `data-module` attribute:

```html
<canvas data-module="art" data-art="brand" data-text="BT" data-palette="volt"></canvas>
<div class="tile" data-module="shape" data-shape="flower"> … </div>
<div class="fx" data-module="tilt"> … </div>            <!-- several: data-module="art tilt" -->
```

`core/registry.js` goes through `js/modules/index.js` **in order**; each module re-queries the DOM for its elements and calls `init(el)` inside try/catch.
Order matters: `marquee` (clones items) runs before `art`/`shape`/`wordmark`.

### Adding a module
1. `js/modules/my-thing.js`: `export default { name: 'my-thing', init(el) { … } }`
2. Import it in `js/modules/index.js` and add it to the array.
3. Put `data-module="my-thing"` on an element.

### Adding a section
Copy a `<section>` in `index.html`, give it an `id`, add `data-reveal` / `data-split` to animate text, add a nav link in `site.config.js`, put layout CSS at the end of `css/sections.css`.

### Adding artwork / a shape / a palette
* Artwork: function `(ctx, w, h, t, s)` in `js/art/generators.js`, add to `GENERATORS`, use `data-art="name"`.
* Shape: add a function returning an SVG path in 0..1 units to `SHAPES` in `js/art/shapes.js`, use `data-module="shape" data-shape="name"`. Circles, arches and pills use the CSS classes `.tile--circle / --arch / --pill`.
* Palette: entry in `js/art/palettes.js`, then `data-palette="name"`.
* **Shadows on clipped shapes:** `clip-path` cuts `box-shadow`, so put the shadow on a parent with class `.fx` (it uses `filter: drop-shadow`).

---

## 6. Content & contact details

Edit **`js/config/site.config.js`**. Only the email (`bennie.luke@outlook.com`) is set; fill in `phone`, `location`, `linkedin` and they appear in the footer automatically (blank values are hidden). Marketing copy lives in `index.html`.

> The "Solutions" cards are *illustrative archetypes*, not client case studies — replace them with real work when you have it.

### Fonts (self-hosting)
Download *Inter Tight*, *JetBrains Mono* and *Shrikhand* (woff2) into `/fonts`, add `@font-face` rules at the top of `css/base.css` (family names exactly `"Inter Tight"`, `"JetBrains Mono"`, `"Shrikhand"`), then delete the three Google Fonts `<link>` tags in `index.html`.

### Browser support
Current Chrome, Edge, Firefox, Safari. Honours `prefers-reduced-motion` (static frames, no splash/reveals).
