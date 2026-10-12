# BennieTech — brochure site

A single-page brochure site for **BennieTech** (software solution design).
Plain HTML + CSS + native ES modules. **No build step, no npm, no dependencies.**
All imagery is generated in code: a real-time 3D hero sculpture (WebGL), shader artwork in every tile and card (WebGL),
and a logo constructed as vector geometry. There are no image files apart from exported copies of the logo.

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

### Deploying (GitHub Pages)
Run **`node tools/stamp.mjs`** before committing CSS/JS changes, then commit and push. It appends `?v=<stamp>` to every
CSS/JS URL and module import, so browsers never mix a new page with cached old scripts (Pages caches files for 10 min).

### Moving to another host / stack
1. Copy the folder (you can leave out `server.js`, `start-site.bat`, `README.md`).
2. Serve it as static files, with `.js` served as `text/javascript`. Done.
3. Fonts load from Google Fonts — to self-host see *Fonts* below.

---

## 2. Debugging

Add **`?debug`** to the URL. Add **`?nointro`** to skip the splash while working.
Example: <http://localhost:8080/?debug&nointro>

* Every module logs when it boots (`[BT:registry] booted art → <canvas>`).
* A module that throws is logged with its name and element; **the rest of the page keeps working**.
* A shader that fails to compile is logged with numbered source lines (`[BT:gl]`).
* `window.BT` exposes `BT.booted` and `BT.modules`. Every art canvas has `canvas.__art` (`.state`, `.set({...})`).
* Persist debug mode: `localStorage.setItem('bt-debug','1')`.

| Symptom | Likely cause |
|---|---|
| Blank/unstyled page | Opened `index.html` via `file://` — use `node server.js`. |
| `No module registered for data-module="x"` | Typo, or module not listed in `js/modules/index.js`. |
| Tiles show a flat gradient, hero shows a flat logo | WebGL is unavailable (very old device / disabled GPU). That is the designed fallback. |
| Slow on a weak machine | Both renderers adapt: the hero lowers its resolution, then its frame rate; tiles only render on screen, within a per-frame time budget. |

---

## 3. Brand

**The mark — "block B".** A solid B silhouette made of two D-shaped blocks (the lower one wider), split by one rising cut
that runs from the left edge into the waist of the B. Software, built block by block.
**The wordmark — "bennietech".** Drawn on a grid with a single stroke weight (monoline, true circles, butt-cut
terminals). Every ascender (b, h, t) is cut on the same rising angle as the mark. The dot of the i is the one lime "spark".

Both are pure geometry in `js/brand/logotype.js` — not a font. `logoSVG({ layout: 'lockup' | 'mark' | 'word', ink, accent })`
returns inline SVG; the nav, menu, footer and any `<div data-logo="lockup|mark|word">` use it.
Static exports live in `assets/logo/` (`bennietech-logo(-dark).svg`, `bennietech-mark(-dark).svg`, `bennietech-wordmark.svg`);
regenerate them with `assets/logo/logo-generator.html` (open it through the local server, click *Download SVGs*).
The previous Shrikhand logo is kept in `assets/logo/archive/`.

**The hero sculpture** (`js/modules/hero-sculpt.js`) is the same mark in 3D: the geometry comes straight from `logotype.js`,
ray-marched in a fragment shader — upper block in polished chrome, lower block in smoked titanium, lime light leaking from
the cut, lit by a procedural photo studio (`GLSL.studio` in `js/gl/gl.js`). The pieces slide together on load, part as you
scroll, and turn towards the pointer.

**Colour.** Studio greys + ink, with acid lime `#c6f432` as the single accent; the artwork carries all other colour.

---

## 4. Project layout

```
index.html                 The page. Sections are numbered in comments.
server.js / start-site.bat Local static server (optional).
assets/logo/               Exported logo SVGs, the generator page, and archive/ (old logo).
css/
  tokens.css               ★ Design tokens: colours, fonts, radii, spacing, motion. Start here to restyle.
  base.css                 Reset, typography, layout primitives, reveal animation states.
  components.css           Buttons, nav, menu, tiles, marquee, sliders, splash.
  sections.css             Layout for each section, in page order.
js/
  main.js                  Entry point.
  config/site.config.js    ★ Company name, contact details, nav links.
  core/                    registry (boots modules), ticker (shared rAF), utils, debug, pointer.
  brand/logotype.js        ★ The logo, as geometry -> SVG.
  gl/
    gl.js                  Minimal WebGL helper + shared GLSL (noise, tone mapping, studio environment).
    tiles.js               ONE shared WebGL context that paints every artwork canvas.
    tile-shaders.js        ★ The artwork library (see below).
  art/palettes.js          Colour sets for the artwork.
  modules/
    index.js               ★ The module list (order matters).
    chrome.js              Nav, mobile menu, footer, [data-logo] (from site.config.js).
    intro.js               Splash: the two halves of the mark lock together, the curtain lifts (once per session).
    hero-sculpt.js         The 3D block-B (WebGL ray marcher).
    art.js                 <canvas data-art="…"> -> live shader artwork.
    reveal.js              Scroll reveals, split-word headings, scrubbed paragraph (keeps inline tiles).
    marquee.js, tilt.js, chips.js, embed.js
```

---

## 5. How the module system works

Behaviour is attached with a `data-module` attribute:

```html
<div class="tile" data-module="tilt">
  <canvas data-module="art" data-art="chrome" data-palette="chrome" data-seed="3"></canvas>
</div>
```

`core/registry.js` goes through `js/modules/index.js` **in order**; each module re-queries the DOM for its elements and
calls `init(el)` inside try/catch. Order matters: `marquee` (clones items) runs before `art`.

### Adding a module
1. `js/modules/my-thing.js`: `export default { name: 'my-thing', init(el) { … } }`
2. Import it in `js/modules/index.js` and add it to the array.
3. Put `data-module="my-thing"` on an element.

### Adding a section
Copy a `<section>` in `index.html`, give it an `id`, add `data-reveal` / `data-split` to animate text, add a nav link in
`site.config.js`, put layout CSS at the end of `css/sections.css`.

### Artwork
`<canvas data-module="art" data-art="NAME" data-palette="PALETTE" data-seed="N">` inside any sized box
(`.tile`, `.itile`, a card…). Optional `data-text="Word"` (for `type`), `data-density="1.2"`, `data-static`.

| `data-art` | Look |
|---|---|
| `chrome` | liquid chrome surface, studio-lit |
| `silk` | iridescent folded silk |
| `dither` | a turning 3D torus in 1-bit ordered dither |
| `glass` | light caustics through rippled glass |
| `type` | kinetic type rows, warped + chromatic split |
| `scan` | vertical light-streak slit-scan |
| `contour` | topographic contour lines |
| `gyro` | machined chrome gyroscope rings |
| `aurora` | soft domain-warped gradient |

Palettes (`js/art/palettes.js`): `chrome ink volt blue ice mono flare ember lime`.
To add an artwork: add a GLSL `vec3 art(vec2 uv, vec2 fc)` to `ART` in `js/gl/tile-shaders.js` (uniforms: `uTime uSeed
uDensity uBg uA uB uC uTex uRes`). Tiles render only while on screen, at ~30fps, through one shared WebGL context.

**Keep the visual language consistent:** one tile shape (`.tile`, a rounded square), rendered materials, restrained type.
No clipart shapes, stickers or emoji-like icons.

---

## 6. Content & contact details

Edit **`js/config/site.config.js`**. Only the email (`bennie.luke@outlook.com`) is set; fill in `phone`, `location`,
`linkedin` and they appear in the footer automatically (blank values are hidden). Marketing copy lives in `index.html`.

> The "Solutions" cards are *illustrative archetypes*, not client case studies — replace them with real work when you have it.

### Fonts (self-hosting)
Download *Inter Tight* and *JetBrains Mono* (woff2) into `/fonts`, add `@font-face` rules at the top of `css/base.css`
(family names exactly `"Inter Tight"`, `"JetBrains Mono"`), then delete the Google Fonts `<link>` tags in `index.html`.
(The logo does not depend on any font.)

### Browser support
Current Chrome, Edge, Firefox, Safari. Honours `prefers-reduced-motion` (static frames, no splash/reveals).
Without WebGL: the hero shows the flat logo mark and tiles show palette gradients.
