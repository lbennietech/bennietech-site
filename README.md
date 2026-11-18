# BennieTech

A single-screen interactive identity for [bennienet.cloud](https://bennienet.cloud). The B is constructed from the original mark’s two arcs and diagonal cut. Layers of metal, offset reflections and two engraved patterns give it depth as the pointer moves.

## Run locally

Run `node server.js` and open http://localhost:8080. The site uses static HTML, CSS and Canvas 2D and requires no build or external assets.

## Artwork

The geometry, projection, lighting and pointer response live in `js/sculpture.js`. The warm-white backdrop pairs drypoint-like geological sections with moving seismic pen traces in `js/strata.js`. During a negative exposure the traces spike and `js/negative.js` displaces horizontal strips of the mark. The stage and signature are styled in `css/sculpture.css`. The original vector artwork is in `assets/logo/`. Reduced-motion visitors see a still composition. A static B is visible before rendering and when JavaScript is unavailable.

## Publish

GitHub Pages serves the repository root on the custom domain specified in `CNAME`.
