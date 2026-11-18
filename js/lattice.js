// Etch the reference's three directions into one triangular lattice.
// Edges belong to the graph, so neighbouring cells share one stroke and
// travelling highlights always turn onto a connected segment.
export function createLattice() {
  const plate = document.createElement('canvas');
  let trails = [];
  function resize(w, h, ratio) {
    const density = Math.min(ratio, 1.5, 2400 / Math.max(w, h));
    plate.width = Math.max(1, Math.round(w * density));
    plate.height = Math.max(1, Math.round(h * density));
    const ink = plate.getContext('2d');
    ink.scale(density, density);
    const step = Math.max(13, Math.min(27, Math.min(w, h) / 27));
    const vertices = new Map();
    const edges = new Set();
    const lines = new Path2D();
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
      if (edges.has(key)) return;
      edges.add(key);
      a.links.push(b); b.links.push(a);
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
    tint.addColorStop(0, '#20231e');
    tint.addColorStop(.38, '#303328');
    tint.addColorStop(.72, '#23251f');
    tint.addColorStop(1, '#191c18');
    ink.strokeStyle = tint;
    ink.lineWidth = .85;
    ink.stroke(lines);

    // Leave the two small marks a little breathing room in the lattice.
    ink.globalCompositeOperation = 'destination-out';
    const quietRadius = Math.min(w * .23, h * .22);
    for (const cy of [h * .08, h * .92]) {
      const fade = ink.createRadialGradient(w / 2, cy, 0, w / 2, cy, quietRadius);
      fade.addColorStop(0, 'rgba(0,0,0,.90)');
      fade.addColorStop(1, 'transparent');
      ink.fillStyle = fade;
      ink.fillRect(w / 2 - quietRadius, cy - quietRadius, quietRadius * 2, quietRadius * 2);
    }

    const nodes = [...vertices.values()].filter(v => v.links.length >= 2);
    trails = [];
    for (let i = 0; i < Math.max(8, Math.ceil(w / step / 4)); i++) {
      let current = nodes[Math.floor(random() * nodes.length)];
      if (!current) break;
      const trail = [current];
      for (let j = 0; j < 17; j++) {
        const exits = current.links.filter(v => v !== trail[trail.length - 2]);
        if (!exits.length) break;
        current = exits[Math.floor(random() * exits.length)];
        trail.push(current);
      }
      if (trail.length >= 4) trails.push(trail);
    }
  }
  return {
    resize,
    draw(ctx, w, h, time) {
      ctx.drawImage(plate, 0, 0, w, h);
      ctx.save();
      ctx.lineWidth = 1;
      trails.forEach((trail, i) => {
        const position = (time * 1.7 + i * 2.37) % (trail.length + 4);
        for (let k = Math.max(0, Math.floor(position - 3)); k < Math.min(position, trail.length - 1); k++) {
          const a = trail[k], b = trail[k + 1], f = Math.min(1, position - k);
          ctx.strokeStyle = 'rgba(119,132,81,' + (.42 * Math.max(0, 1 - (position-k)/3)) + ')';
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f); ctx.stroke();
        }
      });
      ctx.restore();
    },
  };
}
