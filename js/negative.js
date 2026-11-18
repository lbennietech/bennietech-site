// Pull a horizontal strip of the sculpture out of register for a few frames.
export function displaceStrip(ctx, canvas, w, h, age) {
  const entry = age < .52;
  const y = Math.round(canvas.height * (entry ? .382 : .556));
  const height = Math.max(1, Math.round(canvas.height * (entry ? .022 : .012)));
  const shift = Math.round(w * (entry ? -.014 : .009));
  ctx.drawImage(canvas, 0, y, canvas.width, height, shift, y * h / canvas.height,
    w, height * h / canvas.height);
}
