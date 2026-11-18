# BennieTech

A single-screen interactive identity for [bennienet.cloud](https://bennienet.cloud). The B is constructed from the original mark’s two arcs and diagonal cut. Layers of metal, offset reflections and two engraved patterns give it depth as the pointer moves.

## Run locally

Run `node server.js` and open http://localhost:8080. The site uses static HTML, CSS and Canvas 2D and requires no build or external assets.

## Artwork

The geometry, projection, lighting and pointer response live in `js/sculpture.js`. The smoked-plum backdrop uses two overlapping thread patterns in `js/silk.js`. The threads are drawn on resize, then shifted against one another to produce a slow moiré. The stage and signature are styled in `css/sculpture.css`. The original vector artwork is in `assets/logo/`. Reduced-motion visitors see a still composition. A static B is visible before rendering and when JavaScript is unavailable.

## Publish

GitHub Pages serves the repository root on the custom domain specified in `CNAME`.
