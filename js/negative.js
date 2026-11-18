// The alternate exposure uses the same two margins as the silk. Paired
// filaments stretch between joints like a membrane under uneven tension.
export function drawMembrane(ctx, w, h, age) {
  ctx.save();
  const reach = Math.min(w * .42, h * .72);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side < 0 ? 0 : w, 0);
    ctx.scale(side < 0 ? 1 : -1, 1);
    const glow = ctx.createLinearGradient(0, 0, reach, h * .06);
    glow.addColorStop(0, 'rgba(75,91,89,.24)');
    glow.addColorStop(.6, 'rgba(46,102,109,.50)');
    glow.addColorStop(1, 'rgba(70,99,107,.16)');
    ctx.strokeStyle = glow;
    for (let rib = -1; rib < 8; rib++) {
      const seed = rib * 2.13 + side;
      const breath = Math.sin(age * .93 + seed);
      const y = (rib + .37 + side * .22) * h / 6;
      const tipX = reach * (.46 + .28 * Math.sin(seed) + breath * .035);
      const tipY = y + h * (.07 + .022 * Math.cos(seed + age * .7));
      ctx.beginPath();
      for (let fiber = 0; fiber < 29; fiber++) {
        const u = fiber / 28;
        const root = y + (u - .45) * h * .27;
        const bend = Math.sin(u * Math.PI);
        ctx.moveTo(-reach * .12, root);
        ctx.bezierCurveTo(reach * .26, root - bend * h * .042,
          tipX * .68, tipY + bend * h * .035, tipX, tipY);
        ctx.quadraticCurveTo(tipX * .61, tipY + h * (.019 + bend * .014),
          -reach * .12, y + h * (.18 + u * .09));
      }
      ctx.lineWidth = .6;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// Pull a horizontal strip of the sculpture out of register for a few frames.
export function displaceStrip(ctx, canvas, w, h, age) {
  const entry = age < .52;
  const y = Math.round(canvas.height * (entry ? .382 : .556));
  const height = Math.max(1, Math.round(canvas.height * (entry ? .022 : .012)));
  const shift = Math.round(w * (entry ? -.014 : .009));
  ctx.drawImage(canvas, 0, y, canvas.width, height, shift, y * h / canvas.height,
    w, height * h / canvas.height);
}
