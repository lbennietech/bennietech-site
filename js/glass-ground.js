// The gallery paper beneath the suspended crystal B: silky ambient occlusion
// penumbra and a translucent sapphire-emerald crystal transmission footprint.
// The WebGL ground pass augments this base with live organic Baccarat crystal
// caustic filaments, 6-wavelength prismatic barrel crescents, a crisp rift slash,
// and expanding click shockwave caustic rings.
const BOWLS = [{ x: .57, y: .43, r: .43, from: -1.5708, to: .72 }, { x: .71, y: 1.2, r: .49, from: -.64, to: 1.5708 }];
const KERF = .98, SLOPE = .27875;

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

export const HALO_PAD = .48;
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

// Original reeded soda-lime float-glass floor shadow & caustic plate (for the alternate form).
export function makeReededGround(plates, flute) {
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
  pool(.1, .006, .98, .15, -.03, [
    [0, 'rgba(56,66,54,.14)'], [.5, 'rgba(68,76,62,.065)'], [1, 'rgba(84,86,70,0)'],
  ]);
  pool(.02, .012, .7, .062, -.02, [
    [0, 'rgba(34,48,38,.20)'], [.45, 'rgba(46,58,46,.11)'], [1, 'rgba(60,68,54,0)'],
  ]);

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
    const body = ink.createLinearGradient(0, 0, .5, 1.7);
    body.addColorStop(0, 'rgba(38,88,80,.15)');
    body.addColorStop(.55, 'rgba(44,102,92,.22)');
    body.addColorStop(1, 'rgba(34,80,74,.17)');
    ink.fillStyle = body;
    ink.fillRect(0, 0, 1.21, 1.7);

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

  const cast = document.createElement('canvas');
  cast.width = ground.width;
  cast.height = ground.height;
  const lay = cast.getContext('2d');
  lay.setTransform(density, 0, 0, density, .96 * density, .25 * density);
  lay.transform(.94, .016, -.54, .137, .45, -.159);
  lay.imageSmoothingQuality = 'high';
  lay.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);

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

// Bespoke plush velvety cast shadow with warm orange & electric violet indirect color bounce for Variant 2 (Fur B).
export function makeFurGround(plates) {
  const ground = document.createElement('canvas');
  const density = 420;
  ground.width = Math.round(2.56 * density);
  ground.height = Math.round(.54 * density);
  const g = ground.getContext('2d');
  g.scale(density, density);
  g.translate(.96, .27);

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

  // Broad airy sunlit gallery penumbra with whisper-warm tangerine/plum bounce
  pool(.14, .014, 1.14, .19, -.03, [
    [0, 'rgba(62,38,32,.15)'], [.48, 'rgba(78,48,38,.07)'], [1, 'rgba(90,62,50,0)'],
  ]);
  // Soft diffused contact shadow directly beneath the levitating furry lower curve
  pool(.04, .020, .72, .076, -.02, [
    [0, 'rgba(42,24,28,.22)'], [.48, 'rgba(62,34,34,.10)'], [1, 'rgba(82,52,48,0)'],
  ]);
  // Delicate indirect bright-orange + bright-purple bounce sheen on the warm paper
  pool(.24, .004, .92, .14, -.04, [
    [0, 'rgba(232,96,24,.10)'], [.52, 'rgba(148,44,210,.06)'], [1, 'rgba(148,44,210,0)'],
  ]);

  const print = document.createElement('canvas');
  const scale = 408;
  print.width = 512;
  print.height = 708;
  const ink = print.getContext('2d');
  ink.scale(scale, scale);
  ink.translate(.02, .02);
  ink.lineCap = 'round';
  ink.lineJoin = 'round';

  for (const plate of plates) {
    ink.save();
    const body = ink.createLinearGradient(0, 0, .9, 1.7);
    body.addColorStop(0, 'rgba(64,34,30,.24)');
    body.addColorStop(.52, 'rgba(54,26,38,.28)');
    body.addColorStop(1, 'rgba(70,36,28,.24)');
    ink.fillStyle = body;
    ink.fill(plate);
    ink.lineWidth = .20;
    ink.strokeStyle = 'rgba(92,42,32,.14)';
    ink.stroke(plate);
    ink.restore();
  }

  // Soft sunlit slit peeking gently between the split-B furry halves
  ink.save();
  ink.globalCompositeOperation = 'destination-out';
  ink.beginPath();
  ink.moveTo(.04, KERF - SLOPE * .04);
  ink.lineTo(1.12, KERF - SLOPE * 1.12);
  ink.lineWidth = .085;
  ink.strokeStyle = 'rgba(0,0,0,.72)';
  ink.stroke();
  ink.restore();

  const cast = document.createElement('canvas');
  cast.width = ground.width;
  cast.height = ground.height;
  const lay = cast.getContext('2d');
  lay.setTransform(density, 0, 0, density, .96 * density, .27 * density);
  lay.transform(.94, .016, -.54, .137, .45, -.159);
  lay.imageSmoothingQuality = 'high';
  lay.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);

  // Plush, sunlit, deeply feathered gallery shadow (zero hard dark slab!)
  const ultraSoft = soften(cast, 5);
  const soft = soften(cast, 3);

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = .72;
  g.drawImage(ultraSoft, 0, 0);
  g.globalAlpha = .42;
  g.drawImage(soft, 0, 0);
  g.restore();
  return ground;
}
