// Read strips from inside the mark, shear them sideways and stretch a
// single column into a tracking scar. Hold each registration for several
// frames so the damage reads as a mechanical slip.
export function displaceStrips(ctx, canvas, w, h, age) {
  const beat = Math.floor(age * 8);
  const impulse = age < .78 || (age > 1.27 && age < 1.66) || age > 2.38;
  const size = Math.min(h * .31, w * .445);
  const px = canvas.width / w;
  const py = canvas.height / h;
  for (let strip = 0; strip < (impulse ? 7 : 2); strip++) {
    const phase = beat * 1.71 + strip * 2.36;
    const y = h * .45 + size * Math.sin(phase) * .79;
    const height = Math.max(1, size * (strip % 3 === 0 ? .059 : .012));
    const shift = size * (impulse ? .22 : .055) * Math.cos(phase * 2.3);
    const left = w / 2 - size * .83;
    const width = size * 1.7;
    ctx.drawImage(canvas, left * px, y * py, width * px, height * py,
      left + shift, y, width, height);
    if (impulse && strip % 2 === 0) {
      const seam = w / 2 + size * Math.sin(phase * .62) * .3;
      ctx.drawImage(canvas, seam * px, y * py, 1, height * py,
        seam, y, size * (.23 + .2 * Math.abs(Math.sin(phase))), height * .45);
    }
  }
}
