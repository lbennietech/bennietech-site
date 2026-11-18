# BennieTech

A single-screen interactive identity for [bennienet.cloud](https://bennienet.cloud). The B is constructed from the original mark’s two arcs and diagonal cut. At rest it is a thick block of reeded soda-lime glass, lit from inside by a lime filament in the cut. The reeds slice that light into steps that slide as the pointer moves.

## Run locally

Run `node server.js` and open http://localhost:8080. The site uses static HTML, CSS, Canvas 2D and WebGL and requires no build or external assets.

## Artwork

The geometry, projection, lighting and pointer response live in `js/sculpture.js`. The normal scene sets the glass on warm-white paper with a soft shadow and a lime caustic. The glitch appears for about 2.8 seconds, first 3–6 seconds after load and then every 7–12 seconds. During the glitch, `js/oil-volume.js` ray-casts the wet B, hanging drops and illuminated lime cut. The fallback sheets in `assets/liquid/` capture the same four-second motion for software-rendered or unavailable WebGL. `js/lattice.js` draws the dim triangular network with its wandering signals, flickering edges, slipping strips and passing wave. The torn envelope opens an email to Luke. The stage and signature are styled in `css/sculpture.css`. The original vector artwork is in `assets/logo/`. Reduced-motion visitors see a still composition. A static B is visible before rendering and when JavaScript is unavailable.

## Publish

GitHub Pages serves the repository root on the custom domain specified in `CNAME`.
