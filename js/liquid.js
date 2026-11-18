// Positions refer to the same front-face coordinates as the engraved B.
const drops = [
  [[.12, .022, .094], [.32, .033, .18], [.61, .019, .068], [.78, .027, .12]],
  [[.095, .030, .17], [.28, .017, .085], [.48, .039, .29], [.70, .023, .13], [.91, .026, .21], [1.07, .014, .078]],
];

const cut = x => 1.0475 - .27875 * x;
function underside(x, part) {
  if (part === 0) return cut(x) - .135;
  return x <= .71 ? 1.69 : 1.20 + Math.sqrt(.49 ** 2 - (x - .71) ** 2);
}

export function wetFace(ctx, plate, glint, part) {
  ctx.save();
  ctx.clip(plate);
  const sheen = ctx.createLinearGradient(-.23 + glint, .6, 1.18 + glint, .02);
  for (const [stop, color] of [
    [0, '#08090a'], [.19, '#17191c'], [.30, '#44474b'], [.35, '#6c6d6b'],
    [.405, '#232529'], [.48, '#0b0c0f'], [.66, '#18191b'], [.82, '#09090a'], [1, '#34363a'],
  ]) sheen.addColorStop(stop, color);
  ctx.fillStyle = sheen;
  ctx.fill(plate);
  // Bent soft-box reflections on the curved skin of the liquid.
  const start = part ? 1.38 : .38;
  const streak = ctx.createLinearGradient(0, 0, .91, 0);
  streak.addColorStop(0, 'rgba(178,181,184,0)');
  streak.addColorStop(.27, 'rgba(178,181,184,.10)');
  streak.addColorStop(.66, 'rgba(178,181,184,.025)');
  streak.addColorStop(1, 'rgba(178,181,184,0)');
  ctx.fillStyle = streak;
  ctx.beginPath();
  ctx.moveTo(-.08, start + glint);
  ctx.bezierCurveTo(.21, start - .04, .28, start - .28, .92, start - .31);
  ctx.bezierCurveTo(.34, start - .29, .30, start - .055, -.08, start + .043 + glint);
  ctx.fill();
  ctx.restore();
}

// A recessed emitter follows the lower lip. Its reflection dies away on
// the wet face underneath, leaving the centre of the gap open.
export function lightCut(ctx, lowerPlate, age, pixelScale) {
  ctx.save();
  ctx.transform(1, -.27875, 0, 1, 0, cut(0));
  const intensity = .85 + .09 * Math.sin(age * 2.1);
  ctx.globalAlpha = intensity;
  const core = ctx.createLinearGradient(.01, 0, .96, 0);
  for (const [at, color] of [[0, '#35420b'], [.13, '#9fd520'], [.43, '#efffa7'], [.69, '#e2ff70'], [.86, '#a9e322'], [1, '#23320c']]) core.addColorStop(at, color);
  ctx.fillStyle = core;
  ctx.shadowColor = '#aeef25';
  ctx.shadowBlur = .052 * pixelScale;
  ctx.beginPath();
  ctx.moveTo(.006, .001);
  ctx.quadraticCurveTo(.09, -.039, .20, -.041);
  ctx.lineTo(.855, -.037);
  ctx.quadraticCurveTo(.92, -.031, .966, -.004);
  ctx.lineTo(.95, .006);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.clip(lowerPlate);
  ctx.transform(1, -.27875, 0, 1, 0, cut(0));
  const bounce = ctx.createLinearGradient(0, 0, 0, .15);
  bounce.addColorStop(0, 'rgba(201,255,78,.7)');
  bounce.addColorStop(.22, 'rgba(142,192,46,.22)');
  bounce.addColorStop(1, 'rgba(90,128,34,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(0, 0, .96, .15);
  ctx.restore();
}

export function drip(ctx, part, age) {
  const matrix = ctx.getTransform();
  // Cancel the face tilt along the vertical axis. Gravity points down even
  // while the face rotates under the pointer.
  const lean = -matrix.c / matrix.a;
  for (const [i, [x, r, rest]] of drops[part].entries()) {
    const y = underside(x, part);
    const slope = (underside(x + .002, part) - y) / .002;
    const length = rest * (.71 + .38 * (1 - Math.exp(-age * (.8 + .13 * i))) + .095 * Math.sin(i * 2.7 + age * 1.8));
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, slope, lean, 1, 0, 0);
    ctx.scale(r, 1);
    const oil = ctx.createLinearGradient(-1.2, 0, 1.18, 0);
    for (const [stop, color] of [[0,'#151619'],[.16,'#42464b'],[.29,'#888987'],[.36,'#45494d'],[.49,'#16171a'],[.77,'#030405'],[.91,'#26272a'],[1,'#63655e']]) oil.addColorStop(stop,color);
    ctx.fillStyle = oil;
    ctx.beginPath();
    ctx.moveTo(-2.45, -.013);
    ctx.bezierCurveTo(-.83, -.012, -.43, length * .12, -.43, length * .42);
    ctx.bezierCurveTo(-.43, length * .66, -1.07, length * .77, -.91, length * .89);
    ctx.bezierCurveTo(-.76, length * 1.04, .72, length * 1.05, .90, length * .89);
    ctx.bezierCurveTo(1.05, length * .78, .35, length * .63, .38, length * .39);
    ctx.bezierCurveTo(.4, length * .13, .79, -.008, 2.1, -.011);
    ctx.quadraticCurveTo(.03, -.038, -2.45, -.013);
    ctx.fill();
    // A separate pin reflection on the weighted bulb makes its round end
    // legible on black even where the neck has narrowed to a few pixels.
    ctx.fillStyle = part ? '#b0b1a8' : '#c2d587';
    ctx.beginPath();
    ctx.ellipse(-.64, length * .81, .104, length * .037, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Pool a continuous lip over the roots of the drops. Its upper edge
  // rises above each heavier rivulet, like fluid collecting on a ledge.
  const edgeWidth = part ? 1.13 : .926;
  const bead = new Path2D();
  bead.moveTo(0, underside(0, part));
  for (let j = 1; j <= 96; j++) {
    const x = edgeWidth * j / 96;
    bead.lineTo(x, underside(x, part) + .003);
  }
  for (let j = 96; j >= 0; j--) {
    const x = edgeWidth * j / 96;
    let depth = .009;
    for (const [root, r] of drops[part]) {
      depth += r * .95 * Math.exp(-(((x - root) / (r * 1.65)) ** 2));
    }
    bead.lineTo(x, underside(x, part) - depth);
  }
  bead.closePath();
  const rim = ctx.createLinearGradient(0, 0, edgeWidth, 0);
  for (const [stop, tint] of [[0, '#18191b'], [.2, '#313336'], [.35, '#0b0c0d'], [.67, '#222326'], [1, '#101113']]) rim.addColorStop(stop, tint);
  ctx.fillStyle = rim;
  ctx.fill(bead);
}
