// Cut a geological section out of short, interrupted strokes. The same
// plate is exposed in both states so the faults retain their registration.
function drawPlate(canvas, w, h) {
  const ratio = Math.min(devicePixelRatio || 1, 2, 2560 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  let seed = 3421;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const span = Math.min(w * .43, h * .79);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side < 0 ? 0 : w, 0);
    ctx.scale(-side, 1);
    const rows = Math.ceil(Math.min(h, 1000) / 3);
    // An oblique shear displaces each bed by the same amount at the fault.
    function bed(x, v) {
      const fault = .34 + v * .43;
      const dip = side * (.28 * x - .09 * Math.abs(x - .32));
      const throwY = x > fault ? .047 : 0;
      return h * ((side < 0 ? .28 : .73) + dip + throwY
        + (v - .5) * (.31 - .11 * x)
        + .025 * Math.sin(x * 8 + v * 4 + side)
        + .007 * Math.sin(x * 28 + v * 7));
    }
    for (let row = 0; row < rows; row++) {
      const v = row / rows;
      const reach = .25 + .53 * Math.sin(Math.PI * v) ** 2
        + .10 * Math.sin(v * 29) + .05 * random();
      const weight = .22 + .78 * Math.sin(v * 21 + side) ** 4;
      ctx.strokeStyle = row % 13 === 0 ? '#936c4f' : '#4a463f';
      ctx.globalAlpha = .09 + weight * .24;
      ctx.lineWidth = .56;
      ctx.beginPath();
      for (let x = -.02; x < reach;) {
        const length = .002 + random() ** 2 * .033;
        const next = Math.min(x + length, reach);
        const burr = (random() - .5) * 1.65;
        ctx.moveTo(x * span, bed(x, v) + burr);
        ctx.lineTo(next * span, bed(next, v) + burr * .4);
        x = next + .001 + random() ** 2 * (.012 + x * .036);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function createStrata(canvas) {
  return {
    resize(w, h) { drawPlate(canvas, w, h); },
    draw(ctx, w, h, time, pointer, age) {
      // Three pen traces cross each plate. A travelling packet of vibration
      // breaks the quiet line, then dies out into the paper.
      const damaged = age >= 0;
      const reach = Math.min(w * .30, h * .51);
      ctx.save();
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side < 0 ? 0 : w, h * (side < 0 ? .54 : .45));
        ctx.scale(-side, 1);
        const packet = .47 + .32 * Math.sin(time * .21 + side) + pointer.x * .06;
        const envelope = ctx.createLinearGradient(0, 0, reach, 0);
        envelope.addColorStop(0, 'rgba(51,48,44,.09)');
        envelope.addColorStop(.52, damaged ? '#454545' : 'rgba(75,64,48,.47)');
        envelope.addColorStop(1, 'rgba(70,70,70,0)');
        ctx.strokeStyle = envelope;
        ctx.lineWidth = damaged ? .94 : .67;
        for (let pen = 0; pen < 3; pen++) {
          ctx.beginPath();
          for (let x = 0; x <= reach; x += 1.5) {
            const u = x / reach;
            const distance = (u - packet - pen * .048) * (damaged ? 6 : 13);
            const amplitude = Math.exp(-distance * distance) * (damaged ? 46 : 9) / (1 + pen * .45);
            const signal = Math.sin(x * .83 + time * 2.1) * Math.cos(x * .22 - time)
              + .4 * Math.sin(x * 1.27 - time * 3);
            const y = pen * 4.8 + signal * amplitude;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    },
  };
}
