// A soft contact shadow under the block and a transmission print further
// along the paper. The two cut profiles and their reeds form the print.
// Both renderers use the same plate, painted once in glass units.
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
  pool(.10, .012, .99, .14, -.045, [
    [0, 'rgba(54,63,48,.23)'], [.46, 'rgba(75,77,57,.12)'], [1, 'rgba(92,89,70,0)'],
  ]);
  pool(-.07, .018, .58, .058, -.024, [
    [0, 'rgba(40,56,43,.22)'], [.43, 'rgba(53,69,54,.13)'], [1, 'rgba(65,74,57,0)'],
  ]);
  pool(.45, -.036, .92, .084, -.072, [
    [0, 'rgba(74,87,69,.18)'], [.5, 'rgba(86,95,73,.09)'], [1, 'rgba(102,105,82,0)'],
  ]);

  const print = document.createElement('canvas');
  print.width = 512;
  print.height = 708;
  const ink = print.getContext('2d');
  const scale = 408;
  ink.scale(scale, scale);
  ink.translate(.02, .02);
  const transmission = ink.createLinearGradient(0, 0, .65, 1.7);
  transmission.addColorStop(0, 'rgba(108,136,110,.10)');
  transmission.addColorStop(.48, 'rgba(159,184,131,.16)');
  transmission.addColorStop(.54, 'rgba(199,218,137,.22)');
  transmission.addColorStop(1, 'rgba(73,102,83,.20)');

  for (const plate of plates) {
    ink.save();
    ink.clip(plate);
    ink.fillStyle = transmission;
    ink.fillRect(0, 0, 1.21, 1.7);
    ink.strokeStyle = 'rgba(84,115,86,.28)';
    ink.lineWidth = .048;
    ink.stroke(plate);
    ink.strokeStyle = 'rgba(255,253,217,.90)';
    ink.lineWidth = .024;
    ink.stroke(plate);
    // Secondary internal reflection rim offset through the slab thickness.
    ink.save();
    ink.translate(.042, -.026);
    ink.strokeStyle = 'rgba(186,225,68,.26)';
    ink.lineWidth = .016;
    ink.stroke(plate);
    ink.restore();
    // Each channel focuses to a tapered line. The far ends fan out as the
    // transmitted light travels away from the glass, with warm/cool dispersion.
    const light = ink.createLinearGradient(0, 0, 0, 1.69);
    light.addColorStop(0, 'rgba(255,253,218,.22)');
    light.addColorStop(.37, 'rgba(255,255,228,.95)');
    light.addColorStop(.68, 'rgba(230,245,168,.65)');
    light.addColorStop(1, 'rgba(249,251,210,0)');
    const fringe = ink.createLinearGradient(0, 0, 0, 1.69);
    fringe.addColorStop(0, 'rgba(168,218,74,0)');
    fringe.addColorStop(.38, 'rgba(176,226,64,.36)');
    fringe.addColorStop(.72, 'rgba(124,184,96,.24)');
    fringe.addColorStop(1, 'rgba(124,184,96,0)');
    for (let x = 0; x < 1.21; x += flute) {
      ink.fillStyle = fringe;
      ink.beginPath();
      ink.moveTo(x * 1.19 - .058, 0);
      ink.quadraticCurveTo(x + .088, .86, x + .012, 1.69);
      ink.quadraticCurveTo(x + .112, .85, x * 1.19 - .032, 0);
      ink.fill();
      ink.fillStyle = light;
      ink.beginPath();
      ink.moveTo(x * 1.19 - .07, 0);
      ink.quadraticCurveTo(x + .074, .86, x, 1.69);
      ink.quadraticCurveTo(x + .097, .85, x * 1.19 - .045, 0);
      ink.fill();
    }
    ink.restore();
  }
  // The lime filament inside the diagonal cut projects a warm lime caustic bar
  // and a fine focal core between the two cast halves.
  ink.save();
  ink.beginPath();
  ink.moveTo(.09, .98 - .27875 * .09);
  ink.lineTo(1.07, .98 - .27875 * 1.07);
  ink.lineCap = 'round';
  ink.strokeStyle = 'rgba(182,224,58,.38)';
  ink.lineWidth = .105;
  ink.stroke();
  ink.strokeStyle = 'rgba(234,250,164,.68)';
  ink.lineWidth = .036;
  ink.stroke();
  ink.strokeStyle = 'rgba(252,255,228,.85)';
  ink.lineWidth = .012;
  ink.stroke();
  ink.restore();

  g.save();
  g.transform(.94, .016, -.54, .137, .45, -.159);
  g.globalAlpha = .75;
  g.filter = 'blur(5.5px)';
  g.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);
  // Only a patch of the paper lies at the focal distance of the reeds.
  // Let the ends of the cast fall back into the wider penumbra.
  const focus = ink.createRadialGradient(.57, .81, .14, .57, .81, 1.04);
  focus.addColorStop(0, '#fff');
  focus.addColorStop(.52, 'rgba(255,255,255,.80)');
  focus.addColorStop(1, 'rgba(255,255,255,0)');
  ink.globalCompositeOperation = 'destination-in';
  ink.fillStyle = focus;
  ink.fillRect(-.02, -.02, print.width / scale, print.height / scale);
  g.globalAlpha = .80;
  g.filter = 'blur(1px)';
  g.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);
  g.restore();
  pool(.39, .013, .48, .038, -.085, [
    [0, 'rgba(251,253,206,.68)'], [.48, 'rgba(225,241,158,.34)'], [1, 'rgba(220,232,157,0)'],
  ]);
  return ground;
}
