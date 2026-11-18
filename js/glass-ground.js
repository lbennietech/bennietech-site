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
    ink.strokeStyle = 'rgba(89,119,90,.26)';
    ink.lineWidth = .048;
    ink.stroke(plate);
    ink.strokeStyle = 'rgba(255,253,217,.86)';
    ink.lineWidth = .023;
    ink.stroke(plate);
    // Each channel focuses to a tapered line. The far ends fan out as the
    // transmitted light travels away from the glass.
    const light = ink.createLinearGradient(0, 0, 0, 1.69);
    light.addColorStop(0, 'rgba(255,253,218,.18)');
    light.addColorStop(.37, 'rgba(255,255,225,.89)');
    light.addColorStop(.68, 'rgba(232,246,172,.58)');
    light.addColorStop(1, 'rgba(249,251,210,0)');
    ink.fillStyle = light;
    for (let x = 0; x < 1.21; x += flute) {
      ink.beginPath();
      ink.moveTo(x * 1.19 - .07, 0);
      ink.quadraticCurveTo(x + .074, .86, x, 1.69);
      ink.quadraticCurveTo(x + .097, .85, x * 1.19 - .045, 0);
      ink.fill();
    }
    ink.restore();
  }
  g.save();
  g.transform(.94, .016, -.54, .137, .45, -.159);
  g.globalAlpha = .72;
  g.filter = 'blur(5.5px)';
  g.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);
  // Only a patch of the paper lies at the focal distance of the reeds.
  // Let the ends of the cast fall back into the wider penumbra.
  const focus = ink.createRadialGradient(.57, .81, .15, .57, .81, 1.02);
  focus.addColorStop(0, '#fff');
  focus.addColorStop(.5, 'rgba(255,255,255,.76)');
  focus.addColorStop(1, 'rgba(255,255,255,0)');
  ink.globalCompositeOperation = 'destination-in';
  ink.fillStyle = focus;
  ink.fillRect(-.02, -.02, print.width / scale, print.height / scale);
  g.globalAlpha = .75;
  g.filter = 'blur(1px)';
  g.drawImage(print, -.02, -.02, print.width / scale, print.height / scale);
  g.restore();
  pool(.39, .013, .47, .037, -.085, [
    [0, 'rgba(251,251,205,.60)'], [.48, 'rgba(229,241,167,.29)'], [1, 'rgba(220,232,157,0)'],
  ]);
  return ground;
}
