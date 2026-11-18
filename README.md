# BennieTech

A single-screen interactive identity for [bennienet.cloud](https://bennienet.cloud). The B is constructed from the original mark’s two arcs and diagonal cut. At rest it is a thick block of reeded soda-lime glass, lit from inside by a lime filament in the cut. The reeds slice that light into steps that slide as the pointer moves.

## Run locally

Run `node server.js` and open http://localhost:8080. The site uses static HTML, CSS, Canvas 2D and WebGL and requires no build or external assets.

## Artwork

The geometry, projection, lighting and pointer response live in `js/sculpture.js`. The normal scene sets the glass on warm-white paper with a soft shadow and a lime caustic. `js/glass.js` draws it with WebGL as an extruded block on its own layer, so pointer movement stays smooth even where browsers draw 2D canvases on the CPU; `js/sculpture.js` keeps a 2D canvas version for browsers without WebGL. The first glitch arrives 3–6 seconds after load. After that, waits range from 6 to 26 seconds (about 13 on average), with an occasional short aftershock. Each glitch is planned afresh: up to three brief flashes, a hold of 1.5–4.6 seconds, and its own ring timing, drip phase and strip position. During the glitch, `js/oil-volume.js` ray-casts the wet B, hanging drops and illuminated lime cut. The fallback sheets in `assets/liquid/` capture the same four-second motion for software-rendered or unavailable WebGL. `js/field.js` draws the glitch backdrop as a 1-bit dot-matrix display with ordered dithering. The light from the cut runs across it as a sheet of lime dots, and the picture is sharp near the B and breaks into macroblocks further out. At each exposure the calm scene is held as a dithered ghost that rises and dissolves block by block, then settles back and re-forms before the calm scene returns. Without WebGL the glitch plays on plain black. During the glitch, `js/sculpture.js` adapts only the liquid B's internal resolution to how quickly frames arrive, so the rest of the page always stays sharp. The torn envelope opens an email to Luke. The stage and signature are styled in `css/sculpture.css`. The original vector artwork is in `assets/logo/`. Reduced-motion visitors see a still composition. A static B is visible before rendering and when JavaScript is unavailable.

## Publish

GitHub Pages serves the repository root on the custom domain specified in `CNAME`.
