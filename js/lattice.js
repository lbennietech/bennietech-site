// Etch the reference's three directions into one triangular lattice.
// Edges belong to the graph, so neighbouring cells share one stroke and
// travelling signals always turn onto a connected segment.
//
// The etched plate stays close to black. The motion carries the effect:
// many dim signals wander the graph, edges spark and die, strips of the
// plate slip sideways, and a slow wave of light passes over the etching.
const signal = '126,140,86';

export function createLattice() {
  const plate = document.createElement('canvas');
  let density = 1, step = 20, w = 0, h = 0;
  let nodes = [], edges = [], walkers = [], sparks = [], bands = [];
  let lastTime = null, nextSlip = 0;

  const pick = list => list[Math.floor(Math.random() * list.length)];

  function spawn(walker = {}) {
    const from = pick(nodes);
    walker.trail = [from];
    walker.next = pick(from.links);
    walker.f = Math.random();
    walker.speed = 1.6 + Math.random() * 2.6;
    walker.length = 3 + Math.floor(Math.random() * 6);
    walker.span = walker.life = 2.6 + Math.random() * 3.6;
    return walker;
  }

  function advance(walker, dt) {
    walker.life -= dt;
    walker.f += walker.speed * dt;
    while (walker.f >= 1) {
      walker.f -= 1;
      const at = walker.next, trail = walker.trail;
      trail.push(at);
      if (trail.length > walker.length + 1) trail.shift();
      const exits = at.links.filter(v => v !== trail[trail.length - 2]);
      if (!exits.length) return spawn(walker);
      walker.next = pick(exits);
    }
    if (walker.life <= 0) spawn(walker);
  }

  function resize(width, height, ratio) {
    w = width; h = height;
    density = Math.min(ratio, 1.5, 2400 / Math.max(w, h));
    plate.width = Math.max(1, Math.round(w * density));
    plate.height = Math.max(1, Math.round(h * density));
    const ink = plate.getContext('2d');
    ink.scale(density, density);
    step = Math.max(13, Math.min(27, Math.min(w, h) / 27));
    const vertices = new Map();
    const keys = new Set();
    const lines = new Path2D();
    edges = [];
    let seed = 982173;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    function node(q, r) {
      const id = q + ',' + r;
      if (!vertices.has(id)) vertices.set(id, {
        id, x: (q + r / 2) * step, y: r * step * Math.sqrt(3) / 2, links: [],
      });
      return vertices.get(id);
    }
    function edge(a, b) {
      const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
      if (keys.has(key)) return;
      keys.add(key);
      a.links.push(b); b.links.push(a);
      edges.push([a, b]);
      lines.moveTo(a.x, a.y); lines.lineTo(b.x, b.y);
    }
    // Each parent triangle has a three-step boundary. Interior strokes
    // either meet as a fork, or stop one step short to leave a pocket of black.
    function triangle(q, r, sign) {
      const at = (i, j) => node(q + sign * i, r + sign * j);
      if (random() < .18) return;
      for (let side = 0; side < 3; side++) {
        if (random() < .25) continue;
        for (let k = 0; k < 3; k++) {
          if (side === 0) edge(at(k, 0), at(k + 1, 0));
          if (side === 1) edge(at(0, k), at(0, k + 1));
          if (side === 2) edge(at(k, 3 - k), at(k + 1, 2 - k));
        }
      }
      if (random() < .25) return;
      const arms = random() < .5 ? [[0,1],[2,0],[1,2]] : [[1,0],[2,1],[0,2]];
      for (const [i, j] of arms) {
        if (random() > .18) edge(at(1,1), at(i,j));
      }
      if (random() < .52) edge(at(1,0), at(0,1));
    }
    for (let r = -3; r < h / (step * .866) + 3; r += 3) {
      const left = 3 * Math.floor((-r / 2 - 6) / 3);
      for (let q = left; q < w / step - r / 2 + 4; q += 3) {
        triangle(q,r,1);
        triangle(q+3,r+3,-1);
      }
    }
    const tint = ink.createLinearGradient(0, 0, w, h * .55);
    tint.addColorStop(0, '#121410');
    tint.addColorStop(.38, '#191b15');
    tint.addColorStop(.72, '#141611');
    tint.addColorStop(1, '#0f110e');
    ink.strokeStyle = tint;
    ink.lineWidth = .8;
    ink.stroke(lines);

    nodes = [...vertices.values()].filter(v => v.links.length >= 2);
    walkers = nodes.length
      ? Array.from({ length: Math.round(Math.max(24, w * h / (step * step * 11))) }, () => spawn())
      : [];
    sparks = []; bands = []; lastTime = null; nextSlip = 0;
  }

  function segment(ctx, a, b, from, to) {
    ctx.moveTo(a.x + (b.x - a.x) * from, a.y + (b.y - a.y) * from);
    ctx.lineTo(a.x + (b.x - a.x) * to, a.y + (b.y - a.y) * to);
  }

  function draw(ctx, cw, ch, time) {
    if (!walkers.length) return ctx.drawImage(plate, 0, 0, w, h);
    const dt = lastTime === null ? 0 : Math.min(Math.max(time - lastTime, 0), .1);
    lastTime = time;

    // Strips of the plate slip sideways in short bursts.
    if (time >= nextSlip) {
      nextSlip = time + .28 + Math.random() * .5;
      bands = Array.from({ length: Math.floor(Math.random() * 4) }, () => ({
        y: Math.random() * h,
        height: step * (.3 + Math.random() * 2.2),
        dx: Math.random() < .6
          ? step * (Math.random() < .5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))
          : (Math.random() - .5) * 14,
      }));
    }
    ctx.drawImage(plate, 0, 0, w, h);
    for (const band of bands) {
      ctx.clearRect(0, band.y, w, band.height);
      ctx.drawImage(plate, 0, band.y * density, plate.width, band.height * density,
        band.dx, band.y, w, band.height);
    }

    // A wide, slow wave lifts the etching where it passes.
    const travel = (time * .16) % 1.6 - .3;
    const reach = Math.hypot(w, h);
    const wave = ctx.createLinearGradient(0, 0, w, h);
    const at = Math.min(Math.max(travel, 0), 1);
    wave.addColorStop(Math.max(0, at - .14), 'rgba(' + signal + ',0)');
    wave.addColorStop(at, 'rgba(' + signal + ',' + (.30 * Math.max(0, 1 - Math.abs(travel - at) * 4)).toFixed(3) + ')');
    wave.addColorStop(Math.min(1, at + .14), 'rgba(' + signal + ',0)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = wave;
    ctx.fillRect(0, 0, reach, reach);
    ctx.restore();

    // Signals wander the graph, each a short fading tail.
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgb(' + signal + ')';
    for (const walker of walkers) {
      advance(walker, dt);
      const fade = Math.min(1, walker.life * 1.5, (walker.span - walker.life) * 2);
      const trail = walker.trail;
      const head = trail[trail.length - 1];
      ctx.globalAlpha = .34 * fade;
      ctx.beginPath();
      segment(ctx, head, walker.next, 0, walker.f);
      ctx.stroke();
      for (let k = trail.length - 1; k > 0; k--) {
        const age = trail.length - k;
        ctx.globalAlpha = .34 * fade * (1 - (age - 1 + walker.f) / walker.length);
        if (ctx.globalAlpha <= .01) break;
        ctx.beginPath();
        segment(ctx, trail[k - 1], trail[k], 0, 1);
        ctx.stroke();
      }
    }

    // Edges spark and die, sometimes in small clusters.
    let births = dt * 26;
    while (births > 0 && edges.length) {
      if (Math.random() < births) {
        const [a, b] = pick(edges);
        const span = .2 + Math.random() * .5;
        sparks.push({ a, b, life: span, span });
        if (Math.random() < .08) {
          for (const n of a.links) sparks.push({ a, b: n, life: span * 1.4, span: span * 1.4 });
        }
      }
      births -= 1;
    }
    sparks = sparks.filter(spark => (spark.life -= dt) > 0);
    for (const spark of sparks) {
      ctx.globalAlpha = .26 * (spark.life / spark.span) * (Math.random() < .08 ? .4 : 1);
      ctx.beginPath();
      segment(ctx, spark.a, spark.b, 0, 1);
      ctx.stroke();
    }
    ctx.restore();

    // Leave the two small marks a little breathing room in the lattice.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const quiet = Math.min(cw * .23, ch * .22);
    for (const cy of [ch * .08, ch * .92]) {
      const hush = ctx.createRadialGradient(cw / 2, cy, 0, cw / 2, cy, quiet);
      hush.addColorStop(0, 'rgba(0,0,0,.92)');
      hush.addColorStop(1, 'transparent');
      ctx.fillStyle = hush;
      ctx.fillRect(cw / 2 - quiet, cy - quiet, quiet * 2, quiet * 2);
    }
    ctx.restore();
  }

  return { resize, draw };
}
