// Pull a horizontal strip of the sculpture out of register for a few frames.
// The strip goes through a small scratch canvas: drawing the canvas onto
// itself would make the browser copy the whole frame first.
const strip = document.createElement('canvas');

// Each exposure's seed moves the strip and flips its direction.
export function displaceStrip(ctx, canvas, w, h, entry, seed = .5) {
  const y = Math.round(canvas.height * (entry ? .3 + seed * .18 : .5 + seed * .14));
  const height = Math.max(1, Math.round(canvas.height * (entry ? .022 : .012)));
  const shift = Math.round(w * (entry ? -.014 : .009) * (seed > .5 ? -1 : 1));
  if (strip.width !== canvas.width || strip.height < height) {
    strip.width = canvas.width;
    strip.height = Math.max(height, Math.round(canvas.height * .022));
  }
  const copy = strip.getContext('2d');
  copy.clearRect(0, 0, strip.width, height);
  copy.drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
  ctx.drawImage(strip, 0, 0, canvas.width, height, shift, y * h / canvas.height,
    w, height * h / canvas.height);
}
