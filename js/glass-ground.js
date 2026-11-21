// The paper beneath the suspended B: a soft ambient shadow under the block,
// and the light it transmits, cast back across the paper. The cast is a faint
// green shadow of the glass, in which the curved walls focus light into
// bright crescents, the reeds into fine lines and the kerf into a lime seam.
// A sliver of spectrum splits off the lower bowl. Both renderers use the same
// plate, painted once in glass units; the WebGL ground pass augments this base
// with live additive optical caustics and shifting prismatic arcs.
const BOWLS = [{ x: .57, y: .43, r: .43, from: -1.5708, to: .70 }, { x: .71, y: 1.2, r: .49, from: -.62, to: 1.5708 }];
const KERF = .98, SLOPE = .27875;

// Blur by halving and doubling. Unlike a canvas filter it works everywhere,
// and the repeated bilinear passes come out close to a gaussian.
function soften(source, levels) {
  const sizes = [[source.width, source.height]];
  const resample = (from, [width, height]) => {
    const to = document.createElement('canvas');
    to.width = width;
    to.height = height;
    const g = to.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(from, 0, 0, width, height);
    return to;
  };
  let level = source;
  for (let i = 0; i < levels; i++) {
    sizes.push(sizes[i].map(n => Math.max(1, n >> 1)));
    level = resample(level, sizes[i + 1]);
  }
  for (let i = levels - 1; i >= 0; i--) level = resample(level, sizes[i]);
  return level === source ? resample(source, sizes[0]) : level;
}

// The light the filament pours into the block leaks back out of it as a soft
// lime halo, brightest along the kerf. It is painted in glass units, in the
// B's own plane, so it turns with the block. The margin lets it fade to
// nothing before the edge of the map.
export const HALO_PAD = .42;
export function makeHalo(plates, [[x0, y0], [x1, y1]]) {
  const density = 120;
  const halo = document.createElement('canvas');
  halo.width = Math.ceil((1.21 + HALO_PAD * 2) * density);
  halo.height = Math.ceil((1.69 + HALO_PAD * 2) * density);
  const shape = document.createElement('canvas');
  shape.width = halo.width;
  shape.height = halo.height;
  const g = shape.getContext('2d');
  g.setTransform(density, 0, 0, density, HALO_PAD * density, HALO_PAD * density);
  g.fillStyle = 'rgba(168,214,64,.62)';
  plates.forEach(plate => g.fill(plate));
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.strokeStyle = 'rgba(206,248,92,.58)';
  g.lineWidth = .16;
  g.stroke();
  const out = halo.getContext('2d');
  out.globalAlpha = .7;
  out.drawImage(soften(shape, 4), 0, 0);
  out.globalAlpha = .45;
  out.drawImage(soften(shape, 2), 0, 0);
  return halo;
}

export function makeGround(plates, flute) {
  const ground = document.createElement('canvas');
  const density = 420;
  ground.width = Math.round(2.56 * density);
  ground.height = Math.round(.5 * density);
  const g = ground.getContext('2d');
  g.scale(density, density);
  g.translate(.96, .25);

  function pool(x, y, rx, ry, angle, stops) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.scale(rx, ry);
    const wash = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    stops.forEach(([at, tint]) => wash.addColorStop(at, tint));
    g.fillStyle = wash;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  }
  // The block hangs above the paper, so its shadow is all penumbra: a broad
  // occlusion that deepens slightly beneath the footprint.
  pool(.1, .006, .98, .15, -.03, [
    [0, 'rgba(56,66,54,.14)'], [.5, 'rgba(68,76,62,.065)'], [1, 'rgba(84,86,70,0)'],
  ]);
  pool(.02, .012, .7, .062, -.02, [
    [0, 'rgba(34,48,38,.20)'], [.45, 'rgba(46,58,46,.11)'], [1, 'rgba(60,68,54,0)'],
  ]);

  // The cast, drawn flat in glass units, then laid along the paper.
  const print = document.createElement('canvas');
  const scale = 408;
  print.width = 512;
  print.height = 708;
  const ink = print.getContext('2d');
  ink.scale(scale, scale);
  ink.translate(.02, .02);
  ink.lineCap = 'round';

  for (const [part, plate] of plates.entries()) {
    ink.save();
    ink.clip(plate);
    // Thick float glass passes cool emerald-teal shadow tint onto warm paper.
    const body = ink.createLinearGradient(0, 0, .5, 1.7);
    body.addColorStop(0, 'rgba(38,88,80,.15)');
    body.addColorStop(.55, 'rgba(44,102,92,.22)');
    body.addColorStop(1, 'rgba(34,80,74,.17)');
    ink.fillStyle = body;
    ink.fillRect(0, 0, 1.21, 1.7);

    // Each reed focuses its strip into a fine line, strongest midway.
    const line = ink.createLinearGradient(0, 0, 0, 1.69);
    line.addColorStop(0, 'rgba(255,254,236,0)');
    line.addColorStop(.3, 'rgba(255,254,236,.64)');
    line.addColorStop(.62, 'rgba(250,253,226,.76)');
    line.addColorStop(1, 'rgba(250,253,226,.06)');
    ink.fillStyle = line;
    for (let x = 0; x < 1.21; x += flute) {
      ink.beginPath();
      ink.moveTo(x * 1.12 - .03, 0);
      ink.quadraticCurveTo(x + .03, .85, x + .006, 1.69);
      ink.quadraticCurveTo(x + .046, .85, x * 1.12 - .018, 0);
      ink.fill();
    }

    // The round wall bends light inward into a bright crescent just inside
    // the shadow's edge, fringed with the glass's own green.
    const bowl = BOWLS[part];
    for (const [inset, width, tint] of [
      [.075, .14, 'rgba(255,255,240,.28)'], [.058, .06, 'rgba(255,255,244,.66)'],
      [.052, .024, 'rgba(255,255,252,1)'], [.11, .035, 'rgba(176,214,120,.24)'],
    ]) {
      ink.beginPath();
      ink.arc(bowl.x, bowl.y, bowl.r - inset, bowl.from, bowl.to);
      ink.lineWidth = width;
      ink.strokeStyle = tint;
      ink.stroke();
    }
    ink.restore();
  }

  // The lime filament projects a soft seam where the halves part.
  ink.save();
  ink.beginPath();
  ink.moveTo(.09, KERF - SLOPE * .09);
  ink.lineTo(1.06, KERF - SLOPE * 1.06);
  for (const [width, tint] of [[.3, 'rgba(182,224,58,.08)'], [.11, 'rgba(182,224,58,.18)'], [.04, 'rgba(206,238,104,.38)'], [.013, 'rgba(244,255,200,.78)']]) {
    ink.lineWidth = width;
    ink.strokeStyle = tint;
    ink.stroke();
  }
  ink.restore();

  // Dispersion at the lower bowl's polished edge spreads a sliver of
  // spectrum just outside its crescent, red outermost.
  const lower = BOWLS[1];
  ink.save();
  ink.lineWidth = .02;
  ['rgba(255,96,72,.56)', 'rgba(255,190,70,.58)', 'rgba(230,255,96,.56)', 'rgba(96,232,190,.52)',
    'rgba(88,150,255,.48)', 'rgba(150,104,255,.38)'].forEach((tint, i) => {
    ink.beginPath();
    ink.arc(lower.x, lower.y, lower.r + .08 - i * .016, -.12, .82);
    ink.strokeStyle = tint;
    ink.stroke();
  });
  // Fade the ends of the arc.
  ink.globalCompositeOperation = 'destination-out';
  const ends = ink.createRadialGradient(lower.x + .49 * Math.cos(.34), lower.y + .49 * Math.sin(.34), .06,
    lower.x + .49 * Math.cos(.34), lower.y + .49 * Math.sin(.34), .32);
  ends.addColorStop(0, 'rgba(0,0,0,0)');
  ends.addColorStop(1, 'rgba(0,0,0,1)');
  ink.fillStyle = ends;
  ink.beginPath();
  ink.arc(lower.x, lower.y, lower.r + .13, -.3, 1);
  ink.arc(lower.x, lower.y, lower.r - .03, 1, -.3, true);
  ink.fill();
  ink.restore();

  // Lay the cast along the paper, then blur it there, so the penumbra is
  // as wide across the paper as it is deep into it.
  const cast = document.createElement('canvas');
  cast.width = ground.width;
  cast.height = ground.height;
  const lay = cast.getContext('2d');
  lay.setTransform(density, 0, 0, density, .96 * density, .25 * density);
  lay.transform(.94, .016, -.54, .137, .45, -.159);
  lay.imageSmoothingQuality = 'high';
  lay.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);

  // Most of the cast lies out of focus. Only a patch of paper at the reeds'
  // focal distance resolves it sharply.
  const soft = soften(cast, 3);
  const sharp = soften(cast, 1);
  const focusInk = sharp.getContext('2d');
  focusInk.setTransform(density * .62, 0, 0, density * .13, (.56 + .96) * density, (-.03 + .25) * density);
  const focus = focusInk.createRadialGradient(0, 0, .15, 0, 0, 1);
  focus.addColorStop(0, '#fff');
  focus.addColorStop(.55, 'rgba(255,255,255,.55)');
  focus.addColorStop(1, 'rgba(255,255,255,0)');
  focusInk.globalCompositeOperation = 'destination-in';
  focusInk.fillStyle = focus;
  focusInk.fillRect(-4, -4, 8, 8);

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = .85;
  g.drawImage(soft, 0, 0);
  g.globalAlpha = .95;
  g.drawImage(sharp, 0, 0);
  g.restore();
  return ground;
}

// Packs the exact geometric BennieTech wordmark into a power-of-two RGBA texture
// for laser-etched / sandblasted stamping on both flat ends of the glass B:
//   R = crisp glyph mask, G = smooth carved bevel height field, B = lime 'i' dot.
export function makeEtchMap() {
  const W = 1024, H = 256;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W; maskCanvas.height = H;
  const mg = maskCanvas.getContext('2d');

  // Exact vector geometry from assets/logo/bennietech-wordmark.svg (viewBox -0.09 -0.72 10.04 1.75).
  const padX = .42, padY = .26;
  const vw = 10.04 + padX * 2, vh = 1.75 + padY * 2;
  const sx = W / vw, sy = H / vh;
  const ox = (.09 + padX) * sx, oy = (.72 + padY) * sy;

  const paintGlyphs = (g, colour, strokeBoost = 0, onlyDot = false) => {
    g.save();
    g.setTransform(sx, 0, 0, sy, ox, oy);
    if (!onlyDot) {
      g.fillStyle = colour;
      for (const d of [
        'M0 1V-0.6L0.22 -0.69V1Z',
        'M6.16 0.61V-0.36L6.38 -0.45V0.61Z',
        'M8.92 1V-0.6L9.14 -0.69V1Z',
      ]) g.fill(new Path2D(d));
      g.strokeStyle = colour;
      g.lineWidth = .255 + strokeBoost;
      g.lineCap = 'butt';
      g.lineJoin = 'miter';
      for (const d of [
        'M0.11 0.11H0.5A0.39 0.39 0 0 1 0.5 0.89H0.11',
        'M1.23 0.5H2.01A0.39 0.39 0 1 0 1.9355 0.7292',
        'M2.36 0V1',
        'M2.36 0.5A0.39 0.39 0 0 1 3.14 0.5V1',
        'M3.52 0V1',
        'M3.52 0.5A0.39 0.39 0 0 1 4.3 0.5V1',
        'M4.68 0V1',
        'M5.05 0.5H5.83A0.39 0.39 0 1 0 5.7555 0.7292',
        'M6.27 0.589A0.3 0.3 0 0 0 6.57 0.89H6.67',
        'M5.94 0.11H6.7',
        'M6.87 0.5H7.65A0.39 0.39 0 1 0 7.5755 0.7292',
        'M8.6873 0.2599A0.39 0.39 0 1 0 8.6873 0.7401',
        'M9.03 0.5A0.39 0.39 0 0 1 9.81 0.5V1',
      ]) g.stroke(new Path2D(d));
    }
    g.strokeStyle = colour;
    g.lineWidth = .32 + strokeBoost;
    g.lineCap = 'butt';
    g.stroke(new Path2D('M4.68 -0.46V-0.18'));
    g.restore();
  };

  // Sharp glyph silhouette (white on transparent) -> becomes R channel.
  paintGlyphs(mg, '#fff', 0, false);
  // Smooth beveled height field via repeated down/upsampling -> becomes G channel.
  const bevelCanvas = soften(maskCanvas, 3);
  // Separate 'i' dot mask -> becomes B channel.
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = W; dotCanvas.height = H;
  paintGlyphs(dotCanvas.getContext('2d'), '#fff', 0, true);

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const og = out.getContext('2d');
  const mData = mg.getImageData(0, 0, W, H).data;
  const bData = bevelCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const dData = dotCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const img = og.createImageData(W, H);
  const dst = img.data;
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = mData[i + 3];
    dst[i + 1] = bData[i + 3];
    dst[i + 2] = dData[i + 3];
    dst[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}
