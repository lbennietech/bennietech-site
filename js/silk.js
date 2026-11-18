// A ribbon is specified by its centreline and the direction of the loom
// across it. Where those directions almost coincide the projected threads
// bunch into a bright selvage, then open out on the other side of the fold.
const ribbons = [
  {
    spine: [[-.16, -.17], [.32, -.065], [.15, .20], [.046, .32],
      [-.046, .43], [.046, .54], [.165, .69], [.34, .91], [.25, 1.13], [.06, 1.23]],
    weave(t) { return [Math.cos(t * 6.3 - .48) * .8, Math.sin(t * 7.5 + .8) * .69]; },
    light: [0, .16, .35, .56, .81, 1],
  },
  {
    spine: [[1.1, -.17], [.68, .07], [.77, .23], [.947, .37],
      [1.13, .53], [.99, .63], [.84, .71], [.64, .81], [.67, 1.06], [.9, 1.23]],
    weave(t) { return [Math.cos(t * 8.4 - .3) * .92, Math.sin(t * 7.2 + 1.2) * .64]; },
    light: [0, .18, .38, .61, .80, 1],
  },
];

function pointOnSpine(points, t) {
  const segments = (points.length - 1) / 3;
  const segment = Math.min(Math.floor(t * segments), segments - 1);
  const start = segment * 3;
  const u = t * segments - segment, v = 1 - u;
  const weights = [v ** 3, 3 * v * v * u, 3 * v * u * u, u ** 3];
  let x = 0, y = 0;
  weights.forEach((weight, i) => {
    x += weight * points[start + i][0];
    y += weight * points[start + i][1];
  });
  return [x, y];
}

function engrave(canvas, w, h, second) {
  // Cap the backing stores independently of the sculpture's pixel density.
  const ratio = Math.min(devicePixelRatio || 1, 2, 2560 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const breadth = Math.min(w * .235, h * .32);
  const strands = Math.max(40, Math.round(breadth / 2.65)) + (second ? 3 : 0);

  const highlights = [];
  for (const { spine, weave, light } of ribbons) {
    const samples = Array.from({ length: 257 }, (_, j) => {
      const t = j / 256;
      const [x, y] = pointOnSpine(spine, t);
      const [dx, dy] = weave(t);
      return {
        x: x * w, y: y * h, dx: dx * breadth, dy: dy * breadth,
        bow: Math.sin(t * 11.5) * breadth * .17,
        twist: Math.cos(t * 8.5) * breadth * .12,
      };
    });
    const lightSweep = ctx.createLinearGradient(0, 0, w * .055, h);
    const colors = second
      ? ['#826b594f', '#83644d37', '#99877918', '#8b675148', '#836d5f30', '#89684f48']
      : ['#52534f36', '#58575256', '#6969621c', '#5b575148', '#68645b39', '#625c5347'];
    light.forEach((stop, i) => lightSweep.addColorStop(stop, colors[i]));
    ctx.strokeStyle = lightSweep;
    for (let strand = 0; strand <= strands; strand++) {
      const u = 2 * strand / strands - 1;
      const arch = 1 - u * u;
      const catchLight = !second && strand === Math.round(strands * .29);
      const thread = [];
      ctx.beginPath();
      samples.forEach(({ x, y, dx, dy, bow, twist }, j) => {
        const px = x + u * dx + arch * bow;
        const py = y + u * dy + arch * twist + (second ? arch * breadth * .032 : 0);
        if (catchLight) thread.push([px, py]);
        if (j) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.lineWidth = strand % 9 === 0 ? .86 : .52;
      ctx.stroke();
      if (catchLight) highlights.push(thread);
    }
  }
  return highlights;
}

export function createSilk(container) {
  const [ground, veil] = container.querySelectorAll('canvas');
  let highlights = [];
  return {
    resize(w, h) {
      highlights = engrave(ground, w, h, false);
      engrave(veil, w, h, true);
    },
    draw(ctx, time, pointer) {
      // A few pixels of slip between the two weaves moves the interference
      // bands much further than either sheet actually travels.
      const x = Math.sin(time * .093) * 6 + pointer.x * 3.5;
      const y = Math.sin(time * .121 + 1.8) * 5 + pointer.y * 3;
      const roll = Math.sin(time * .073 + .8) * .55;
      veil.style.transform = `translate(${x}px, ${y}px) rotate(${roll}deg) scale(1.035)`;
      // Let a short reflection travel down one actual thread of each ribbon.
      // The tapered ends keep it continuous with the unlit wire.
      ctx.save();
      highlights.forEach((thread, i) => {
        const phase = (time * .022 + .28 + i * .51) % 1;
        const centre = phase * (thread.length - 1);
        const start = Math.max(0, Math.floor(centre - 13));
        const end = Math.min(thread.length - 1, Math.ceil(centre + 13));
        const light = ctx.createLinearGradient(...thread[start], ...thread[end]);
        light.addColorStop(0, 'rgba(255,254,244,0)');
        light.addColorStop(.58, 'rgba(255,254,244,.84)');
        light.addColorStop(1, 'rgba(255,254,244,0)');
        ctx.strokeStyle = light;
        ctx.globalAlpha = Math.min(1, phase * 18, (1 - phase) * 18);
        ctx.lineWidth = .8;
        ctx.beginPath();
        ctx.moveTo(...thread[start]);
        for (let j = start + 1; j <= end; j++) ctx.lineTo(...thread[j]);
        ctx.stroke();
      });
      ctx.restore();
    },
  };
}
