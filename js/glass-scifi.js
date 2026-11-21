// Variant 0: Starship B. The BennieTech B as a kitbashed deep-space
// megastructure, patrolled by a small generative fleet.
//
// Hull. Both halves are real geometry built once at load: a chamfered
// gunmetal extrusion of the production outline, armoured with layered
// bevelled plates, vents, conduits, hatches and machinery towers by a
// recursive rectangle kitbasher. The curved bowls carry banded hull plating,
// rows of lit windows, wraparound pipes and a cyan running light, and gun
// turrets. A command tower with an antenna mast crowns the top. The diagonal
// cut is a reactor trench: a lime energy beam runs through the gap between
// the halves, lights the conduit walls either side and pulses along them.
//
// Fleet. Six to nine procedurally modelled craft (arrowhead fighters and
// darts, twin-pod gunships, a long corvette) fly a steering simulation:
// waypoint patrols, inclined orbits, low strafing runs over the face and
// trench runs threaded through the glowing kerf, wingmen in loose formation,
// banking into turns, avoiding the hull and each other. A click scatters
// nearby craft on afterburners and sends a power surge across the hull.
// After each glitch the station reboots in a cascade from the reactor out
// and the fleet drops out of warp around it.
//
// Light. A cool key from the upper left casts real-time shadows (a packed
// RGBA depth map from the key, so passing ships shadow the hull), a warm
// sunrise rims everything from behind the planet, and a cyan kicker picks
// out edges. Painted panels get procedural seams, bevel lips, rivets,
// grilles, grime and edge wear; metals reflect the planet's limb.
import { program } from './gl/gl.js';

const SLOPE = .27875;
const NORM = 1 / Math.hypot(SLOPE, 1);
const D_CAM = 10.5;
const CX = .56, CY = .845;
const FRONT = .2805, BACK = -.272, CHAMFER = .022;
const CUTS = [.9125, 1.0475];
const KERF_MID = (CUTS[0] + CUTS[1]) / 2;
const KDIR = [NORM, -SLOPE * NORM, 0];
const KNRM = [SLOPE * NORM, NORM, 0];
// The fleet stays inside this ellipsoid around the B's centre (plate units).
export const FLIGHT = [1.13, 1.1, .86];
const SHADOW_EXTENT = 1.3;
const STRIDE = 16;

const K = { PLATE: 0, MECH: 1, ACCENT: 2, CYAN: 3, WINDOW: 4, KERF: 5, CANOPY: 6, HAZARD: 7, BARE: 8, NOZZLE: 9, EDGE: 10, RED: 11 };

// ---------------------------------------------------------------------------
// Small vector helpers and a seeded random source
// ---------------------------------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = a => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const span = (rng, a, b) => a + (b - a) * rng();

// The face tangent the shader derives from a normal; texture coordinates are
// laid out along it so panel seams line up with the geometry.
function tRule(n) {
  if (Math.abs(n[2]) > .7) return norm([1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]);
  return norm([-n[1], n[0], 0]);
}
function uvOf(p, n) {
  const t = tRule(n), b = cross(n, t);
  return [dot(p, t), dot(p, b)];
}

// ---------------------------------------------------------------------------
// Mesh builder: indexed Uint16 chunks, 16 floats per vertex
//   aPos  x y z part      aNrm  nx ny nz ao
//   aUv   u v kind seed   aExt  emit rough metal detail|threshold
// ---------------------------------------------------------------------------
class Mesh {
  constructor() {
    this.chunks = [];
    this.start();
  }
  start() {
    this.cur = { data: [], idx: [], count: 0 };
    this.chunks.push(this.cur);
  }
  reserve(n) {
    if (this.cur.count + n > 65000) this.start();
  }
  vert(p, n, uv, m, ao = 1) {
    const c = this.cur;
    c.data.push(p[0], p[1], p[2], m.part || 0, n[0], n[1], n[2], ao, uv[0], uv[1], m.kind, m.seed,
      m.emit || 0, m.rough ?? .62, m.metal || 0, m.extra ?? 1);
    return c.count++;
  }
  poly(points, n, m, aos = null, uvs = null) {
    this.reserve(points.length);
    const base = this.cur.count;
    points.forEach((p, i) => this.vert(p, n, uvs ? uvs[i] : uvOf(p, n), m, aos ? aos[i] : 1));
    for (let i = 1; i < points.length - 1; i++) this.cur.idx.push(base, base + i, base + i + 1);
  }
  // A quad with its own normal per corner.
  quadN(points, normals, m, aos = null, uvs = null) {
    this.reserve(4);
    const base = this.cur.count;
    points.forEach((p, i) => this.vert(p, normals[i], uvs ? uvs[i] : uvOf(p, normals[i]), m, aos ? aos[i] : 1));
    this.cur.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  get vertexCount() {
    return this.chunks.reduce((n, c) => n + c.count, 0);
  }
  upload(gl) {
    return this.chunks.filter(c => c.count).map(c => {
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(c.data), gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(c.idx), gl.STATIC_DRAW);
      return { vbo, ibo, count: c.idx.length };
    });
  }
}

const mat = (kind, seed, part, extra = {}) => ({ kind, seed, part, rough: .62, metal: 0, extra: 1, ...extra });

// A box on a surface frame {o, t, b, n}: footprint [u0,u1]x[v0,v1] along t
// and b, from h0 to h1 along n, with a 45 degree bevel round its top edge.
function box(mesh, f, u0, v0, u1, v1, h0, h1, m, bevel = 0, closed = false) {
  if (u1 - u0 < 1e-5 || v1 - v0 < 1e-5 || h1 - h0 < 1e-5) return;
  const P = (u, v, h) => [
    f.o[0] + f.t[0] * u + f.b[0] * v + f.n[0] * h,
    f.o[1] + f.t[1] * u + f.b[1] * v + f.n[1] * h,
    f.o[2] + f.t[2] * u + f.b[2] * v + f.n[2] * h,
  ];
  const bv = Math.max(0, Math.min(bevel, (u1 - u0) * .3, (v1 - v0) * .3, (h1 - h0) * .85));
  const ht = h1 - bv;
  const nt = [-f.t[0], -f.t[1], -f.t[2]], nb = [-f.b[0], -f.b[1], -f.b[2]];
  const lo = .42;
  const edge = { ...m, kind: m.kind === K.PLATE || m.kind === K.ACCENT ? K.EDGE : m.kind, extra: m.kind >= K.CYAN && m.kind <= K.WINDOW ? m.extra : 0 };
  mesh.poly([P(u0 + bv, v0 + bv, h1), P(u1 - bv, v0 + bv, h1), P(u1 - bv, v1 - bv, h1), P(u0 + bv, v1 - bv, h1)], f.n, m);
  const sideM = m.kind === K.PLATE || m.kind === K.ACCENT ? { ...m, extra: 0 } : m;
  mesh.poly([P(u0, v0, h0), P(u0, v1, h0), P(u0, v1, ht), P(u0, v0, ht)], nt, sideM, [lo, lo, 1, 1]);
  mesh.poly([P(u1, v1, h0), P(u1, v0, h0), P(u1, v0, ht), P(u1, v1, ht)], f.t, sideM, [lo, lo, 1, 1]);
  mesh.poly([P(u1, v0, h0), P(u0, v0, h0), P(u0, v0, ht), P(u1, v0, ht)], nb, sideM, [lo, lo, 1, 1]);
  mesh.poly([P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, ht), P(u0, v1, ht)], f.b, sideM, [lo, lo, 1, 1]);
  if (bv > 0) {
    const nn = a => norm([a[0] + f.n[0], a[1] + f.n[1], a[2] + f.n[2]]);
    mesh.poly([P(u0, v0, ht), P(u0, v1, ht), P(u0 + bv, v1 - bv, h1), P(u0 + bv, v0 + bv, h1)], nn(nt), edge);
    mesh.poly([P(u1, v1, ht), P(u1, v0, ht), P(u1 - bv, v0 + bv, h1), P(u1 - bv, v1 - bv, h1)], nn(f.t), edge);
    mesh.poly([P(u1, v0, ht), P(u0, v0, ht), P(u0 + bv, v0 + bv, h1), P(u1 - bv, v0 + bv, h1)], nn(nb), edge);
    mesh.poly([P(u0, v1, ht), P(u1, v1, ht), P(u1 - bv, v1 - bv, h1), P(u0 + bv, v1 - bv, h1)], nn(f.b), edge);
  }
  if (closed) {
    const down = [-f.n[0], -f.n[1], -f.n[2]];
    mesh.poly([P(u0, v0, h0), P(u0, v1, h0), P(u1, v1, h0), P(u1, v0, h0)], down, sideM, [lo, lo, lo, lo]);
  }
}

// An upright cylinder (axis along n) at (u, v) with a flat cap.
function cyl(mesh, f, u, v, r, h0, h1, segs, m, capM = m) {
  const P = (a, rr, h) => {
    const cu = u + Math.cos(a) * rr, cv = v + Math.sin(a) * rr;
    return [
      f.o[0] + f.t[0] * cu + f.b[0] * cv + f.n[0] * h,
      f.o[1] + f.t[1] * cu + f.b[1] * cv + f.n[1] * h,
      f.o[2] + f.t[2] * cu + f.b[2] * cv + f.n[2] * h,
    ];
  };
  const radial = a => norm([
    f.t[0] * Math.cos(a) + f.b[0] * Math.sin(a),
    f.t[1] * Math.cos(a) + f.b[1] * Math.sin(a),
    f.t[2] * Math.cos(a) + f.b[2] * Math.sin(a),
  ]);
  for (let k = 0; k < segs; k++) {
    const a0 = k / segs * Math.PI * 2, a1 = (k + 1) / segs * Math.PI * 2;
    const n0 = radial(a0), n1 = radial(a1);
    const pts = [P(a0, r, h0), P(a1, r, h0), P(a1, r, h1), P(a0, r, h1)];
    const s0 = a0 * r, s1 = a1 * r;
    mesh.quadN(pts, [n0, n1, n1, n0], { ...m, extra: 0 }, [.45, .45, 1, 1], [[s0, h0], [s1, h0], [s1, h1], [s0, h1]]);
  }
  mesh.poly(Array.from({ length: segs }, (_, k) => P(k / segs * Math.PI * 2, r, h1)), f.n, capM);
}

// A tube following a 3D polyline; `ups` gives a reference normal per point.
function tube(mesh, pts, ups, r, segs, m) {
  const rings = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tan = norm(sub(b, a));
    const side = norm(cross(tan, ups[i]));
    const up = cross(side, tan);
    return Array.from({ length: segs }, (_, k) => {
      const ang = k / segs * Math.PI * 2;
      const n = norm(mad(mad([0, 0, 0], up, Math.cos(ang)), side, Math.sin(ang)));
      return { p: mad(p, n, r), n };
    });
  });
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(...sub(pts[i + 1], pts[i]));
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % segs;
      const A = rings[i][k], B = rings[i][k2], C = rings[i + 1][k2], D = rings[i + 1][k];
      const v0 = k / segs * r * 6.28, v1 = (k + 1) / segs * r * 6.28;
      mesh.quadN([A.p, B.p, C.p, D.p], [A.n, B.n, C.n, D.n], m, null, [[s, v0], [s, v1], [s + l, v1], [s + l, v0]]);
    }
    s += l;
  }
}

// ---------------------------------------------------------------------------
// The B halves' shape for flight avoidance (approximate signed distance)
// ---------------------------------------------------------------------------
function smaxJ(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * .25;
}
function sdHalf2D(px, py, part) {
  const c = part ? { x: .71, y: 1.2, r: .49 } : { x: .57, y: .43, r: .43 };
  const dx = Math.max(px - c.x, 0), dy = py - c.y;
  const bowl = Math.hypot(dx, dy) - c.r;
  const top = part ? -1 : -py;
  const bottom = part ? py - 1.69 : -1;
  const cutD = part ? (CUTS[1] - (py + SLOPE * px)) * NORM : ((py + SLOPE * px) - CUTS[0]) * NORM;
  return Math.max(-px, bowl, top, bottom, cutD);
}
function sdB(x, y, z) {
  let d = Infinity;
  const dz = Math.max(z - .35, -.29 - z);
  for (let part = 0; part < 2; part++) {
    const d2 = sdHalf2D(x, y, part) - .012;
    const out = Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0);
    d = Math.min(d, out);
  }
  return d;
}
function gradB(p) {
  const e = .004;
  const g = [
    sdB(p[0] + e, p[1], p[2]) - sdB(p[0] - e, p[1], p[2]),
    sdB(p[0], p[1] + e, p[2]) - sdB(p[0], p[1] - e, p[2]),
    sdB(p[0], p[1], p[2] + e) - sdB(p[0], p[1], p[2] - e),
  ];
  return norm(g);
}

// ---------------------------------------------------------------------------
// Hull construction
// ---------------------------------------------------------------------------
function prepOutline(points) {
  let P = [];
  for (const p of points) {
    const q = P[P.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) P.push([p[0], p[1]]);
  }
  if (Math.hypot(P[0][0] - P.at(-1)[0], P[0][1] - P.at(-1)[1]) < 1e-5) P.pop();
  const R = [];
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / .02));
    for (let k = 0; k < n; k++) R.push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]);
  });
  const c = R.reduce((a, p) => [a[0] + p[0] / R.length, a[1] + p[1] / R.length], [0, 0]);
  // Outward normals are (dy, -dx) of each edge; flip the winding if needed.
  let s = 0;
  R.forEach((p, i) => {
    const q = R[(i + 1) % R.length];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    s += dy * ((p[0] + q[0]) / 2 - c[0]) - dx * ((p[1] + q[1]) / 2 - c[1]);
  });
  if (s < 0) R.reverse();
  return { pts: R, centroid: c };
}

function analyse(pts, part) {
  const n = pts.length;
  const cut = CUTS[part];
  const onCut = p => Math.abs(p[1] + SLOPE * p[0] - cut) < 2e-4;
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    return { a: p, b: q, d, n: [d[1], -d[0]], l, cut: onCut(p) && onCut(q) };
  });
  // Per-vertex normals: smooth across gentle bends, split at corners.
  const verts = pts.map((p, i) => {
    const e0 = edges[(i - 1 + n) % n], e1 = edges[i];
    const c = e0.n[0] * e1.n[0] + e0.n[1] * e1.n[1];
    const sharp = c < Math.cos(.5) || e0.cut !== e1.cut;
    const avg = [e0.n[0] + e1.n[0], e0.n[1] + e1.n[1]];
    const al = Math.hypot(avg[0], avg[1]) || 1;
    const m = [avg[0] / al, avg[1] / al];
    return { p, sharp, smooth: m, miter: Math.max(.35, m[0] * e1.n[0] + m[1] * e1.n[1]) };
  });
  return { edges, verts };
}

// Offset a convex outline inward by d. Each point moves along its normal and
// is then clamped against the offset lines of nearby edges, so the densely
// resampled straight edges miter cleanly into their corners.
function insetPoly(pts, verts, d, edges = null) {
  const n = pts.length;
  return pts.map((p, i) => {
    const v = verts[i];
    const q = [p[0] - v.smooth[0] * d / v.miter, p[1] - v.smooth[1] * d / v.miter];
    if (!edges) return q;
    for (let pass = 0; pass < 3; pass++) {
      for (let k = -10; k <= 10; k++) {
        const e = edges[(i + k + n) % n];
        const over = (q[0] - e.a[0]) * e.n[0] + (q[1] - e.a[1]) * e.n[1] + d;
        if (over > 0) {
          q[0] -= e.n[0] * over;
          q[1] -= e.n[1] * over;
        }
      }
    }
    return q;
  });
}

function insideConvex(poly, x, y, margin) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    if (((x - a[0]) * dy - (y - a[1]) * dx) / l > -margin) return false;
  }
  return true;
}

function buildHalf(mesh, lights, outline, part, rng) {
  const { pts } = prepOutline(outline);
  const { edges, verts } = analyse(pts, part);
  const n = pts.length;
  const inner = insetPoly(pts, verts, CHAMFER, edges);
  const hullM = mat(K.PLATE, .5, part, { rough: .58, extra: 1 });
  const edgeM = mat(K.EDGE, .4, part, { rough: .34, metal: .5, extra: 0 });
  const kerfM = mat(K.KERF, .5, part, { rough: .36, metal: .5, extra: 0 });
  const zf = FRONT, zb = BACK, zf0 = FRONT - CHAMFER, zb0 = BACK + CHAMFER;
  const vn = (i, e) => (verts[i].sharp ? e.n : verts[i].smooth);

  // Front and back faces.
  mesh.poly(inner.map(([x, y]) => [x, y, zf]), [0, 0, 1], hullM);
  mesh.poly(inner.map(([x, y]) => [x, y, zb]).reverse(), [0, 0, -1], hullM);

  // Chamfers and walls. Wall texture runs along the outline's arc length.
  let s = 0;
  edges.forEach((e, i) => {
    const j = (i + 1) % n;
    const na = vn(i, e), nb = vn(j, e);
    const cf = e.cut ? { ...kerfM } : edgeM;
    const front = [norm([na[0], na[1], 1]), norm([nb[0], nb[1], 1])];
    const back = [norm([na[0], na[1], -1]), norm([nb[0], nb[1], -1])];
    mesh.quadN([[inner[i][0], inner[i][1], zf], [inner[j][0], inner[j][1], zf], [e.b[0], e.b[1], zf0], [e.a[0], e.a[1], zf0]],
      [front[0], front[1], front[1], front[0]], cf);
    mesh.quadN([[e.a[0], e.a[1], zb0], [e.b[0], e.b[1], zb0], [inner[j][0], inner[j][1], zb], [inner[i][0], inner[i][1], zb]],
      [back[0], back[1], back[1], back[0]], cf);
    const wm = e.cut ? kerfM : hullM;
    const n3a = [na[0], na[1], 0], n3b = [nb[0], nb[1], 0];
    mesh.quadN([[e.a[0], e.a[1], zb0], [e.b[0], e.b[1], zb0], [e.b[0], e.b[1], zf0], [e.a[0], e.a[1], zf0]],
      [n3a, n3b, n3b, n3a], wm, null, [[s, zb0], [s + e.l, zb0], [s + e.l, zf0], [s, zf0]]);
    s += e.l;
  });

  // A raised armour rim follows the B's contour on both faces, with a
  // dashed cyan light line just inside it.
  const rimIn = insetPoly(pts, verts, CHAMFER + .03, edges);
  const lineIn = insetPoly(pts, verts, CHAMFER + .036, edges);
  for (const side of [1, -1]) {
    const z0 = side > 0 ? zf : zb, z1 = z0 + side * .011;
    const rimM = mat(K.ACCENT, .23 + part * .1, part, { rough: .5, extra: 2 });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = inner[i], b = inner[j], c = rimIn[j], d = rimIn[i];
      const top = [[a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1], [d[0], d[1], z1]];
      mesh.poly(side > 0 ? top : top.reverse(), [0, 0, side], rimM);
      const e = edges[i];
      const inward = [-e.n[0], -e.n[1], 0];
      mesh.poly([[d[0], d[1], z0], [c[0], c[1], z0], [c[0], c[1], z1], [d[0], d[1], z1]], inward, { ...rimM, kind: K.EDGE, extra: 0 }, [.4, .4, 1, 1]);
      mesh.poly([[a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0], [a[0], a[1], z0]], [e.n[0], e.n[1], 0], { ...rimM, kind: K.EDGE, extra: 0 });
      if (!e.cut && (i % 5) < 3) {
        const p = lineIn[i], q = lineIn[j];
        const w = .0022;
        const zl = z0 + side * .0016;
        const off = [inward[0] * w, inward[1] * w];
        const th = .05 + .45 * Math.abs(p[1] + SLOPE * p[0] - KERF_MID) * NORM;
        mesh.poly([[p[0], p[1], zl], [q[0], q[1], zl], [q[0] + off[0], q[1] + off[1], zl], [p[0] + off[0], p[1] + off[1], zl]],
          [0, 0, side], mat(K.CYAN, rng(), part, { extra: th }));
      }
    }
  }

  // Kitbashed plating on both faces.
  // The drag orbit never turns the back face toward the viewer, so only the
  // front is kitbashed; the back keeps its plating, rim and chamfers.
  greebleFace(mesh, lights, pts, CHAMFER + .052, part, zf, 1, rng);
  greebleWalls(mesh, lights, edges, verts, part, rng);
  greebleKerf(mesh, lights, edges, part, rng);
  return pts;
}

function faceFrame(z, side) {
  return { o: [0, 0, z], t: [1, 0, 0], b: [0, 1, 0], n: [0, 0, side] };
}

function lightOf(p, part, color, size, intensity, opts = {}) {
  return { p, part, color, size, intensity, rate: 0, phase: 0, duty: 1, threshold: 0, bias: .012, ...opts };
}

function kerfThreshold(x, y, rng) {
  return clamp(.06 + .5 * Math.abs(y + SLOPE * x - KERF_MID) * NORM / .8 + .22 * rng(), 0, .92);
}

function greebleFace(mesh, lights, poly, margin, part, z, side, rng) {
  const f = faceFrame(z, side);
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const inside = (x0, y0, x1, y1) => insideConvex(poly, x0, y0, margin) && insideConvex(poly, x1, y0, margin)
    && insideConvex(poly, x1, y1, margin) && insideConvex(poly, x0, y1, margin);
  const leaves = [];
  (function split(x0, y0, x1, y1, depth) {
    const w = x1 - x0, h = y1 - y0;
    const fits = inside(x0, y0, x1, y1);
    if (fits && (depth >= 2 && rng() < (w > .14 || h > .14 ? .2 : .45) || w < .06 && h < .06)) {
      leaves.push([x0, y0, x1, y1]);
      return;
    }
    if (w < .03 || h < .03 || depth > 9) {
      if (fits) leaves.push([x0, y0, x1, y1]);
      return;
    }
    const gap = depth < 3 ? .011 : .007;
    const alongX = w > h ? rng() > .15 : rng() < .15;
    const s = span(rng, .3, .7);
    if (alongX) {
      const m = x0 + w * s;
      split(x0, y0, m - gap / 2, y1, depth + 1);
      split(m + gap / 2, y0, x1, y1, depth + 1);
    } else {
      const m = y0 + h * s;
      split(x0, y0, x1, m - gap / 2, depth + 1);
      split(x0, m + gap / 2, x1, y1, depth + 1);
    }
  })(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0);

  for (const r of leaves) {
    const [x0, y0, x1, y1] = r;
    const area = (x1 - x0) * (y1 - y0);
    if (area > .007 && rng() < .62) superstructure(mesh, lights, f, part, side, x0, y0, x1, y1, rng);
    else if (area > .006 && rng() < .55) armour(mesh, lights, f, part, side, x0, y0, x1, y1, rng);
    else leaf(mesh, lights, f, part, side, x0, y0, x1, y1, rng);
  }
}

const lifted = (f, h) => ({ ...f, o: [f.o[0] + f.n[0] * h, f.o[1] + f.n[1] * h, f.o[2] + f.n[2] * h] });

// A large raised block, kitbashed again on its own top.
function superstructure(mesh, lights, f, part, side, x0, y0, x1, y1, rng) {
  const H = span(rng, .01, .03);
  box(mesh, f, x0, y0, x1, y1, 0, H, mat(rng() < .2 ? K.ACCENT : K.PLATE, rng(), part, { rough: span(rng, .5, .7), extra: 0 }), .006);
  const top = lifted(f, H);
  const m = .009;
  (function nest(a0, b0, a1, b1, depth) {
    const w = a1 - a0, h = b1 - b0;
    if (depth >= 1 && (w < .055 && h < .055 || rng() < .25) || depth > 5 || w < .024 || h < .024) {
      if (w > .012 && h > .012) leaf(mesh, lights, top, part, side, a0, b0, a1, b1, rng);
      return;
    }
    const gap = .006;
    const alongX = w > h ? rng() > .2 : rng() < .2;
    const s = span(rng, .32, .68);
    if (alongX) {
      const mm = a0 + w * s;
      nest(a0, b0, mm - gap / 2, b1, depth + 1);
      nest(mm + gap / 2, b0, a1, b1, depth + 1);
    } else {
      const mm = b0 + h * s;
      nest(a0, b0, a1, mm - gap / 2, depth + 1);
      nest(a0, mm + gap / 2, a1, b1, depth + 1);
    }
  })(x0 + m, y0 + m, x1 - m, y1 - m, 0);
}

// A calm, heavy armour plate: a rest area with at most one feature.
function armour(mesh, lights, f, part, side, x0, y0, x1, y1, rng) {
  const H = span(rng, .006, .014);
  box(mesh, f, x0, y0, x1, y1, 0, H, mat(rng() < .25 ? K.ACCENT : K.PLATE, rng(), part, { rough: span(rng, .48, .66), extra: 2 }), .005);
  const top = lifted(f, H);
  const w = x1 - x0, h = y1 - y0, z = top.o[2];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const th = kerfThreshold(cx, cy, rng);
  const r = rng();
  if (r < .3) {
    const along = w > h;
    const a = along ? [x0 + .01, y1 - .009, x1 - .01, y1 - .0055] : [x1 - .009, y0 + .01, x1 - .0055, y1 - .01];
    box(mesh, top, a[0], a[1], a[2], a[3], 0, .0016, mat(K.CYAN, rng(), part, { extra: th }));
    lights.push(lightOf([(a[0] + a[2]) / 2, (a[1] + a[3]) / 2, z + side * .004], part, [.2, .75, 1], Math.max(w, h) * .4, .14, { threshold: th }));
  } else if (r < .5) {
    const rr = Math.min(w, h) * .22;
    cyl(mesh, top, cx, cy, rr, 0, .004, 16, mat(K.MECH, rng(), part, { metal: .6, rough: .38 }));
    cyl(mesh, top, cx, cy, rr * .6, .004, .007, 14, mat(K.EDGE, rng(), part, { metal: .7, rough: .3, extra: 0 }));
  }
}

// One kitbashed cell on a flat face.
function leaf(mesh, lights, f, part, side, x0, y0, x1, y1, rng) {
  const r = rng();
  if (r < .1) return;
  const w = x1 - x0, h = y1 - y0;
  const seed = rng();
  const z = f.o[2];
  const pz = p => [p[0], p[1], z];
  if (r < .2) {
    // A machinery tower of stacked blocks.
    let u0 = x0, v0 = y0, u1 = x1, v1 = y1, base = 0;
    for (let k = 0; k < 3; k++) {
      const top = base + span(rng, .006, .016);
      box(mesh, f, u0, v0, u1, v1, base, top, mat(K.MECH, rng(), part, { rough: .45, metal: .55 }), .0025);
      const iw = (u1 - u0) * span(rng, .15, .3), ih = (v1 - v0) * span(rng, .15, .3);
      u0 += iw * rng(); u1 -= iw * rng(); v0 += ih * rng(); v1 -= ih * rng();
      base = top;
      if (u1 - u0 < .012 || v1 - v0 < .012) break;
    }
    if (rng() < .35) {
      const cx = (u0 + u1) / 2, cy = (v0 + v1) / 2;
      lights.push(lightOf(pz([cx, cy]).map((c, i) => (i === 2 ? z + side * (base + .004) : c)), part,
        [1, .22, .12], .012, 1.4, { rate: .6 + rng() * .5, phase: rng(), duty: .18, threshold: kerfThreshold(cx, cy, rng) }));
    }
    return;
  }
  if (r < .3) {
    // An open trench: conduits and clamps running along the cell.
    const along = w > h;
    const len0 = along ? x0 : y0, len1 = along ? x1 : y1;
    const c0 = along ? y0 : x0, c1 = along ? y1 : x1;
    const count = Math.max(1, Math.min(3, Math.floor((c1 - c0) / .016)));
    for (let k = 0; k < count; k++) {
      const c = c0 + (c1 - c0) * (k + .5) / count;
      const rr = Math.min(.0055, (c1 - c0) / count * .32);
      const pts = [], ups = [];
      for (let t = 0; t <= 6; t++) {
        const l = len0 + .004 + (len1 - len0 - .008) * t / 6;
        pts.push(along ? [l, c, z + side * (rr + .0008)] : [c, l, z + side * (rr + .0008)]);
        ups.push([0, 0, side]);
      }
      tube(mesh, pts, ups, rr, 6, mat(k % 2 ? K.BARE : K.MECH, rng(), part, { rough: .3, metal: .85, extra: 0 }));
    }
    for (let l = len0 + .012; l < len1 - .01; l += span(rng, .02, .04)) {
      const a = along ? [l - .002, c0, l + .002, c1] : [c0, l - .002, c1, l + .002];
      box(mesh, f, a[0], a[1], a[2], a[3], 0, .012, mat(K.MECH, rng(), part, { metal: .6, rough: .4 }), .001);
    }
    return;
  }

  // Otherwise a raised, bevelled armour plate with something on it.
  const ph = span(rng, .004, .016);
  const accent = rng() < .2;
  const plateM = mat(accent ? K.ACCENT : K.PLATE, seed, part, { rough: span(rng, .45, .7), extra: rng() < .35 ? 2 : 0 });
  box(mesh, f, x0, y0, x1, y1, 0, ph, plateM, Math.min(.0034, ph * .7));
  let base = ph;
  let u0 = x0 + .005, v0 = y0 + .005, u1 = x1 - .005, v1 = y1 - .005;
  if (rng() < .28 && w > .04 && h > .04) {
    const t = span(rng, .002, .006);
    u0 += w * span(rng, .08, .22); u1 -= w * span(rng, .08, .22);
    v0 += h * span(rng, .08, .22); v1 -= h * span(rng, .08, .22);
    box(mesh, f, u0, v0, u1, v1, base, base + t, mat(K.PLATE, rng(), part, { rough: .55, extra: 0 }), Math.min(.002, t * .7));
    base += t;
    u0 += .004; v0 += .004; u1 -= .004; v1 -= .004;
  }
  if (u1 - u0 < .01 || v1 - v0 < .01) return;
  const d = rng();
  const along = (u1 - u0) > (v1 - v0);
  const cw = u1 - u0, ch = v1 - v0;
  const cx = (u0 + u1) / 2, cy = (v0 + v1) / 2;
  const th = kerfThreshold(cx, cy, rng);
  if (d < .12) {
    // Vent slats across the short side.
    const L0 = along ? u0 : v0, L1 = along ? u1 : v1;
    const pitch = span(rng, .0055, .008);
    for (let l = L0 + .002; l < L1 - .003; l += pitch) {
      const a = along ? [l, v0, l + pitch * .45, v1] : [u0, l, u1, l + pitch * .45];
      box(mesh, f, a[0], a[1], a[2], a[3], base, base + .0032, mat(K.MECH, rng(), part, { metal: .6, rough: .4 }));
    }
  } else if (d < .3) {
    // A row of lit windows.
    const rows = ch > .03 && cw > .03 ? 2 : 1;
    const L0 = along ? u0 : v0, L1 = along ? u1 : v1;
    const C0 = along ? v0 : u0, C1 = along ? v1 : u1;
    let count = 0;
    for (let rI = 0; rI < rows; rI++) {
      const c = C0 + (C1 - C0) * (rI + .5) / rows;
      for (let l = L0 + .003; l < L1 - .008; l += .0105) {
        const a = along ? [l, c - .0022, l + .0068, c + .0022] : [c - .0022, l, c + .0022, l + .0068];
        box(mesh, f, a[0], a[1], a[2], a[3], base, base + .0012, mat(K.WINDOW, rng(), part, { extra: th + rng() * .06 }));
        count++;
      }
    }
    if (count) {
      lights.push(lightOf([cx, cy, z + side * (base + .003)], part, [1, .6, .3], Math.min(.07, Math.max(cw, ch) * .55), .22, { threshold: th, bias: .01 }));
    }
  } else if (d < .4) {
    // A cyan running light along one long edge.
    const a = along ? [u0, v1 - .0045, u1, v1 - .001] : [u1 - .0045, v0, u1 - .001, v1];
    box(mesh, f, a[0], a[1], a[2], a[3], base, base + .0018, mat(K.CYAN, rng(), part, { extra: th }));
    lights.push(lightOf([(a[0] + a[2]) / 2, (a[1] + a[3]) / 2, z + side * (base + .004)], part, [.2, .75, 1], Math.min(.05, Math.max(cw, ch) * .45), .16, { threshold: th }));
  } else if (d < .62) {
    // A cluster of small blocks.
    const count = 2 + Math.floor(rng() * 4);
    for (let k = 0; k < count; k++) {
      const bw = cw * span(rng, .15, .45), bh = ch * span(rng, .15, .45);
      const bx = u0 + (cw - bw) * rng(), by = v0 + (ch - bh) * rng();
      box(mesh, f, bx, by, bx + bw, by + bh, base, base + span(rng, .003, .012),
        mat(rng() < .5 ? K.MECH : K.PLATE, rng(), part, { metal: .4, rough: .5, extra: 0 }), .0015);
    }
  } else if (d < .74) {
    // Parallel pipes along the plate.
    const count = 1 + Math.floor(rng() * 3);
    const L0 = along ? u0 : v0, L1 = along ? u1 : v1;
    const C0 = along ? v0 : u0, C1 = along ? v1 : u1;
    for (let k = 0; k < count; k++) {
      const c = C0 + (C1 - C0) * (k + .5) / count;
      const rr = Math.min(.0045, (C1 - C0) / count * .3);
      const pts = [], ups = [];
      for (let t = 0; t <= 4; t++) {
        const l = L0 + (L1 - L0) * t / 4;
        pts.push(along ? [l, c, z + side * (base + rr)] : [c, l, z + side * (base + rr)]);
        ups.push([0, 0, side]);
      }
      tube(mesh, pts, ups, rr, 6, mat(K.BARE, rng(), part, { rough: .3, metal: .9, extra: 0 }));
    }
  } else if (d < .82) {
    // A round hatch or port.
    const rr = Math.min(cw, ch) * span(rng, .25, .4);
    cyl(mesh, f, cx, cy, rr, base, base + .003, 14, mat(K.MECH, rng(), part, { metal: .6, rough: .38 }));
    cyl(mesh, f, cx, cy, rr * .62, base + .003, base + .0055, 12, mat(K.EDGE, rng(), part, { metal: .7, rough: .3, extra: 0 }));
    if (rng() < .3) lights.push(lightOf([cx, cy, z + side * (base + .008)], part, [.25, .8, 1], rr * 1.4, .32, { threshold: th }));
  } else if (d < .845 && cw > .025 && ch > .025) {
    // A hazard-striped access panel.
    box(mesh, f, u0 + .003, v0 + .003, u1 - .003, v1 - .003, base, base + .0012, mat(K.HAZARD, rng(), part, { rough: .55, extra: 0 }));
  }
}

// Arc-length frames along each smooth run of the outline (cut edges excluded).
function wallRuns(edges, verts) {
  const n = edges.length;
  let start = edges.findIndex((e, i) => !e.cut && (edges[(i - 1 + n) % n].cut || verts[i].sharp));
  if (start < 0) start = 0;
  const runs = [];
  let run = null;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const e = edges[i];
    if (e.cut) { run = null; continue; }
    if (!run || verts[i].sharp) {
      run = { edges: [], verts: [] };
      runs.push(run);
    }
    run.edges.push(e);
  }
  return runs.map(r => {
    const pts = [r.edges[0].a, ...r.edges.map(e => e.b)];
    const nrm = pts.map((p, k) => {
      const e0 = r.edges[Math.max(0, k - 1)], e1 = r.edges[Math.min(r.edges.length - 1, k)];
      const m = [e0.n[0] + e1.n[0], e0.n[1] + e1.n[1]];
      const l = Math.hypot(m[0], m[1]) || 1;
      return [m[0] / l, m[1] / l];
    });
    const s = [0];
    r.edges.forEach(e => s.push(s.at(-1) + e.l));
    const L = s.at(-1);
    const at = sv => {
      sv = clamp(sv, 0, L);
      let k = 0;
      while (k < r.edges.length - 1 && s[k + 1] < sv) k++;
      const t = (sv - s[k]) / Math.max(1e-6, s[k + 1] - s[k]);
      const p = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
      const m = [nrm[k][0] + (nrm[k + 1][0] - nrm[k][0]) * t, nrm[k][1] + (nrm[k + 1][1] - nrm[k][1]) * t];
      const ml = Math.hypot(m[0], m[1]) || 1;
      const nn = [m[0] / ml, m[1] / ml];
      return { p, n: nn, t: [-nn[1], nn[0]] };
    };
    const curvature = (s0, s1) => {
      const a = at(s0).n, b = at(s1).n;
      return Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1)) / Math.max(1e-4, s1 - s0);
    };
    return { L, at, curvature };
  });
}

function wallFrame(fr, sag = 0) {
  return {
    o: [fr.p[0] - fr.n[0] * sag, fr.p[1] - fr.n[1] * sag, 0],
    t: [fr.t[0], fr.t[1], 0], b: [0, 0, 1], n: [fr.n[0], fr.n[1], 0],
  };
}

function greebleWalls(mesh, lights, edges, verts, part, rng) {
  const runs = wallRuns(edges, verts);
  const BANDS = [
    [.178, .25, 'armor'], [.094, .168, 'windows'], [-.052, .058, 'trench'],
    [-.162, -.064, 'vents'], [-.246, -.172, 'armor'],
  ];
  for (const run of runs) {
    if (run.L < .06) continue;
    const top = (() => { const n = run.at(run.L / 2).n; return n[1] < -.9; })();
    const stem = (() => { const n = run.at(run.L / 2).n; return n[0] < -.9; })();
    for (const [z0, z1, kind] of BANDS) {
      if (kind === 'trench') {
        // Two conduits and a cyan light wrap continuously along the run.
        const pts = [[], [], []], ups = [];
        const steps = Math.max(2, Math.ceil(run.L / .018));
        for (let k = 0; k <= steps; k++) {
          const fr = run.at(.012 + (run.L - .024) * k / steps);
          ups.push([fr.n[0], fr.n[1], 0]);
          pts[0].push([fr.p[0] + fr.n[0] * .0085, fr.p[1] + fr.n[1] * .0085, .028]);
          pts[1].push([fr.p[0] + fr.n[0] * .0085, fr.p[1] + fr.n[1] * .0085, -.026]);
          pts[2].push([fr.p[0] + fr.n[0] * .0042, fr.p[1] + fr.n[1] * .0042, .001]);
        }
        tube(mesh, pts[0], ups, .0078, 7, mat(K.BARE, rng(), part, { rough: .32, metal: .9, extra: 0 }));
        tube(mesh, pts[1], ups, .0078, 7, mat(K.MECH, rng(), part, { rough: .38, metal: .8, extra: 0 }));
        if (!stem) {
          tube(mesh, pts[2], ups, .0034, 5, mat(K.CYAN, rng(), part, { extra: .04 + .3 * rng() }));
          for (let sv = .05; sv < run.L - .03; sv += .11) {
            const fr = run.at(sv);
            lights.push(lightOf([fr.p[0] + fr.n[0] * .006, fr.p[1] + fr.n[1] * .006, .001], part, [.2, .75, 1], .05, .14,
              { threshold: kerfThreshold(fr.p[0], fr.p[1], rng) }));
          }
        }
        for (let sv = .02; sv < run.L - .02; sv += span(rng, .045, .08)) {
          const fr = run.at(sv);
          const f = wallFrame(fr, .002);
          box(mesh, f, -.004, -.045, .004, .045, 0, .02, mat(K.MECH, rng(), part, { metal: .6, rough: .4 }), .002);
        }
        continue;
      }
      let sv = .014;
      while (sv < run.L - .02) {
        const len = Math.min(span(rng, .035, .11), run.L - .014 - sv);
        if (len < .018) break;
        const mid = sv + len / 2;
        const curv = run.curvature(Math.max(0, mid - .01), Math.min(run.L, mid + .01));
        const sag = len * len * curv / 8;
        const fr = run.at(mid);
        const f = wallFrame(fr, sag);
        const seed = rng();
        const th = kerfThreshold(fr.p[0], fr.p[1], rng);
        if (rng() > .1) {
          const h = span(rng, .005, .012);
          const plateM = mat(rng() < .14 ? K.ACCENT : K.PLATE, seed, part, { rough: span(rng, .45, .68), extra: 2 });
          box(mesh, f, -len / 2, z0, len / 2, z1, 0, h + sag, plateM, .003);
          const base = h + sag;
          if (kind === 'windows' && !stem) {
            for (const zc of [(z0 * .62 + z1 * .38), (z0 * .38 + z1 * .62)]) {
              for (let u = -len / 2 + .006; u < len / 2 - .009; u += .0112) {
                box(mesh, f, u, zc - .0035, u + .0068, zc + .0035, base, base + .0012, mat(K.WINDOW, rng(), part, { extra: th + rng() * .08 }));
              }
            }
            const c = run.at(mid);
            lights.push(lightOf([c.p[0] + c.n[0] * (base + .004), c.p[1] + c.n[1] * (base + .004), (z0 + z1) / 2], part, [1, .62, .32], len * .5, .2, { threshold: th }));
          } else if (kind === 'vents' && rng() < .7) {
            for (let u = -len / 2 + .004; u < len / 2 - .005; u += .0068) {
              box(mesh, f, u, z0 + .008, u + .0032, z1 - .008, base, base + .0035, mat(K.MECH, rng(), part, { metal: .6, rough: .4 }));
            }
          } else if (rng() < .25) {
            box(mesh, f, -len / 2 + .006, z0 + .006, len / 2 - .006, z1 - .006, base, base + .004, mat(K.MECH, rng(), part, { metal: .5, rough: .4 }), .0015);
          }
        }
        sv += len + .0065;
      }
    }
    // Turrets stand off the curved bowls.
    if (!top && !stem && run.L > .4) {
      const count = Math.max(1, Math.round(run.L / .42));
      for (let k = 0; k < count; k++) {
        const sv = run.L * (k + .5) / count + span(rng, -.04, .04);
        const fr = run.at(sv);
        if (fr.n[0] < .15) continue;
        const zc = (k + part) % 2 ? .13 : -.115;
        turret(mesh, lights, wallFrame(fr, .003), zc, part, rng);
      }
    }
    if (top) commandTower(mesh, lights, run, part, rng);
  }
}

function turret(mesh, lights, f, zc, part, rng) {
  const gun = mat(K.PLATE, rng(), part, { rough: .5, extra: 2 });
  cyl(mesh, f, 0, zc, .021, 0, .016, 14, mat(K.MECH, rng(), part, { metal: .6, rough: .38 }));
  box(mesh, f, -.024, zc - .019, .02, zc + .019, .016, .036, gun, .005);
  box(mesh, f, -.016, zc - .012, .012, zc + .012, .036, .043, mat(K.MECH, rng(), part, { metal: .6, rough: .4 }), .002);
  // Twin barrels angled along the hull and out into space.
  const aim = .55 + rng() * .3;
  const dir = norm([f.n[0] * aim + f.t[0], f.n[1] * aim + f.t[1], 0]);
  const side = norm(cross([0, 0, 1], dir));
  for (const off of [-.0075, .0075]) {
    const o = [f.o[0] + f.n[0] * .027 + f.t[0] * .004, f.o[1] + f.n[1] * .027 + f.t[1] * .004, zc + off];
    const bf = { o, t: side, b: [0, 0, 1], n: dir };
    box(mesh, bf, -.0032, -.0032, .0032, .0032, 0, .062, mat(K.BARE, rng(), part, { metal: .9, rough: .3, extra: 0 }), 0, true);
    box(mesh, bf, -.0045, -.0045, .0045, .0045, .052, .058, mat(K.MECH, rng(), part, { metal: .7, rough: .35 }), 0, true);
    lights.push(lightOf(mad(o, dir, .066), part, [.3, .85, 1], .013, .55, { rate: .35, phase: rng(), duty: .7, threshold: .3 }));
  }
}

function commandTower(mesh, lights, run, part, rng) {
  // The bridge rises from the flat top, offset toward the stem.
  const sv = run.L * .42;
  const fr = run.at(sv);
  const f = wallFrame(fr, 0);
  const tiers = [[.13, .17, .028], [.095, .12, .05], [.062, .074, .069], [.036, .042, .079]];
  let base = 0;
  tiers.forEach(([hu, hv, top], k) => {
    const m = mat(k === 2 ? K.ACCENT : K.PLATE, rng(), part, { rough: .5, extra: 2 });
    box(mesh, f, -hu, -hv, hu, hv, base, top, m, .005);
    if (k >= 1) {
      // Window bands on the faces toward the viewer and away.
      for (const side of [1, -1]) {
        const wf = { o: [f.o[0] + f.n[0] * ((base + top) / 2), f.o[1] + f.n[1] * ((base + top) / 2), side * hv], t: f.t, b: [-f.n[0], -f.n[1], 0], n: [0, 0, side] };
        for (let u = -hu + .008; u < hu - .01; u += .011) {
          box(mesh, wf, u, -.003, u + .0072, .003, 0, .0012, mat(k === 2 ? K.CYAN : K.WINDOW, rng(), part, { extra: .1 + k * .12 }));
        }
      }
      lights.push(lightOf([f.o[0] + f.n[0] * (base + top) / 2, f.o[1] + f.n[1] * (base + top) / 2, hv + .004], part,
        k === 2 ? [.25, .8, 1] : [1, .62, .32], hu * 1.1, .28, { threshold: .1 + k * .12 }));
    }
    base = top;
  });
  // Antenna mast, crossbars and a dish.
  const mast = (u, v, h, r) => {
    box(mesh, f, u - r, v - r, u + r, v + r, base, base + h, mat(K.BARE, rng(), part, { metal: .9, rough: .32, extra: 0 }));
    lights.push(lightOf([f.o[0] + f.t[0] * u + f.n[0] * (base + h + .003), f.o[1] + f.t[1] * u + f.n[1] * (base + h + .003), v], part,
      [1, .12, .06], .022, 2.2, { rate: .9, phase: rng(), duty: .16, threshold: .15 }));
  };
  mast(-.012, .004, .14, .0024);
  mast(.022, -.01, .085, .002);
  for (const hb of [.04, .07, .1]) box(mesh, f, -.032, .0, .008, .008, base + hb, base + hb + .0035, mat(K.BARE, rng(), part, { metal: .9, rough: .3, extra: 0 }), 0, true);
  cyl(mesh, f, -.05, -.018, .02, base, base + .006, 14, mat(K.EDGE, rng(), part, { metal: .7, rough: .3, extra: 0 }));
  // Smaller masts along the rest of the top.
  for (const t of [.12, .78, .9]) {
    const fr2 = run.at(run.L * t);
    const f2 = wallFrame(fr2, 0);
    const h = span(rng, .04, .08);
    const v = span(rng, -.15, .15);
    box(mesh, f2, -.002, v - .002, .002, v + .002, 0, h, mat(K.BARE, rng(), part, { metal: .9, rough: .3, extra: 0 }));
    lights.push(lightOf([f2.o[0] + f2.n[0] * (h + .003), f2.o[1] + f2.n[1] * (h + .003), v], part, [1, .14, .07], .018, 1.8,
      { rate: .75 + rng() * .4, phase: rng(), duty: .15, threshold: .2 }));
  }
}

function greebleKerf(mesh, lights, edges, part, rng) {
  const cut = edges.filter(e => e.cut);
  if (!cut.length) return;
  const a = cut[0].a, b = cut.at(-1).b;
  const d = norm([b[0] - a[0], b[1] - a[1], 0]);
  const n = norm([cut[0].n[0], cut[0].n[1], 0]);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const f = { o: [a[0], a[1], 0], t: d, b: [0, 0, 1], n };
  // Conduit rails either side of the beam, and emitter blocks between them.
  for (const z of [-.2, -.12, .12, .2]) box(mesh, f, .015, z - .005, L - .015, z + .005, 0, .005, mat(K.MECH, rng(), part, { metal: .7, rough: .35 }), .0015);
  for (let u = .04; u < L - .03; u += .062) {
    for (const z of [-.16, .16]) box(mesh, f, u - .008, z - .018, u + .008, z + .018, 0, .009, mat(K.EDGE, rng(), part, { metal: .7, rough: .3, extra: 0 }), .002);
  }
}

// ---------------------------------------------------------------------------
// Fleet: procedurally modelled craft (local x forward, y up, z right; unit length)
// ---------------------------------------------------------------------------
const OCT = [[1, .45], [.45, 1], [-.45, 1], [-1, .5], [-1, -.5], [-.45, -1], [.45, -1], [1, -.45]];

function loft(mesh, sections, m, shape = OCT, caps = true) {
  const ring = s => shape.map(([py, pz]) => [s[0], s[3] + py * s[2], pz * s[1]]);
  const rings = sections.map(ring);
  for (let i = 0; i < sections.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const axis = [(sections[i][0] + sections[i + 1][0]) / 2, (sections[i][3] + sections[i + 1][3]) / 2, 0];
    for (let k = 0; k < shape.length; k++) {
      const k2 = (k + 1) % shape.length;
      const quad = [A[k], A[k2], B[k2], B[k]];
      const uniq = quad.filter((p, j) => quad.findIndex(q => Math.hypot(...sub(p, q)) < 1e-7) === j);
      if (uniq.length < 3) continue;
      let nrm = norm(cross(sub(uniq[1], uniq[0]), sub(uniq[2], uniq[0])));
      const cen = uniq.reduce((s, p) => mad(s, p, 1 / uniq.length), [0, 0, 0]);
      if (dot(nrm, sub(cen, axis)) < 0) nrm = nrm.map(v => -v);
      mesh.poly(uniq, nrm, m);
    }
  }
  if (caps) {
    for (const [i, dir] of [[0, 1], [sections.length - 1, -1]]) {
      const s = sections[i];
      if (s[1] < 1e-4 || s[2] < 1e-4) continue;
      const pts = rings[i];
      mesh.poly(dir > 0 ? pts : [...pts].reverse(), [dir, 0, 0], m);
    }
  }
}

// A planar slab: polygon pts extruded by thick along dir.
function slab(mesh, pts, dir, thick, m) {
  const top = pts.map(p => mad(p, dir, thick));
  mesh.poly(top, dir, m);
  mesh.poly([...pts].reverse(), dir.map(v => -v), m);
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const e = norm(sub(q, p));
    let n = norm(cross(e, dir));
    const cen = pts.reduce((s, r) => mad(s, r, 1 / pts.length), [0, 0, 0]);
    if (dot(n, sub(p, cen)) < 0) n = n.map(v => -v);
    mesh.poly([p, q, top[(i + 1) % pts.length], top[i]], n, { ...m, kind: m.kind === K.PLATE ? K.EDGE : m.kind, extra: 0 });
  });
}

function sbox(mesh, x0, x1, y0, y1, z0, z1, m, bevel = 0) {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  const [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
  box(mesh, { o: [0, 0, 0], t: [1, 0, 0], b: [0, 0, 1], n: [0, 1, 0] }, ax, az, bx, bz, ay, by, m, bevel, true);
}

function nozzle(mesh, x, y, z, r, segs, m) {
  const f = { o: [x, y, z], t: [0, 1, 0], b: [0, 0, 1], n: [-1, 0, 0] };
  cyl(mesh, f, 0, 0, r, 0, .012, segs, mat(K.MECH, .3, 0, { metal: .8, rough: .3 }), m);
}

// Nacelles must sit off-axis, so the lancer is assembled from offset lofts.
function offsetLoft(mesh, sections, m, dy, dz, shape = OCT) {
  const tmp = new Mesh();
  loft(tmp, sections, m, shape);
  for (const c of tmp.chunks) {
    for (let i = 0; i < c.data.length; i += STRIDE) {
      c.data[i + 1] += dy;
      c.data[i + 2] += dz;
    }
    mesh.reserve(c.count);
    const base = mesh.cur.count;
    mesh.cur.data.push(...c.data);
    mesh.cur.count += c.count;
    mesh.cur.idx.push(...c.idx.map(k => k + base));
  }
}

function lancerMesh(rng) {
  const mesh = new Mesh();
  const hull = mat(K.PLATE, .42, 0, { rough: .5, extra: 2 });
  const dark = mat(K.ACCENT, .2, 0, { rough: .45, extra: 2 });
  const mech = mat(K.MECH, .5, 0, { metal: .6, rough: .38 });
  loft(mesh, [[.56, 0, 0, 0], [.3, .05, .028, .004], [.04, .088, .05, .012], [-.22, .11, .064, .014], [-.38, .1, .058, .01]], hull);
  loft(mesh, [[.18, 0, 0, .04], [.1, .026, .02, .05], [-.04, .032, .024, .056], [-.11, .018, .01, .05]], mat(K.CANOPY, .5, 0, { rough: .08 }));
  const engines = [];
  for (const s of [1, -1]) {
    slab(mesh, [[-.02, -.006, s * .07], [-.3, -.006, s * .43], [-.43, -.006, s * .43], [-.36, -.006, s * .07]], [0, 1, 0], .014, dark);
    slab(mesh, [[-.29, .008, s * .41], [-.43, .008, s * .41], [-.45, .1, s * .41], [-.38, .1, s * .41]], [0, 0, s], .012, hull);
    offsetLoft(mesh, [[-.12, .03, .03, 0], [-.18, .05, .05, 0], [-.52, .05, .05, 0]], mech, -.004, s * .118);
    nozzle(mesh, -.52, -.004, s * .118, .036, 10, mat(K.NOZZLE, .5, 0, { extra: 0 }));
    engines.push({ p: [-.535, -.004, s * .118], r: .04 });
    sbox(mesh, -.14, .28, -.03, -.014, s * .225 - .008, s * .225 + .008, mat(K.BARE, .3, 0, { metal: .9, rough: .3, extra: 0 }));
    for (const x of [.1, .15, .2]) sbox(mesh, x, x + .016, -.034, -.01, s * .225 - .012, s * .225 + .012, mat(K.CYAN, rng(), 0, { extra: 0 }));
  }
  sbox(mesh, -.3, -.12, .055, .08, -.03, .03, mech, .006);
  sbox(mesh, -.08, .02, .05, .066, -.02, .02, hull, .004);
  return {
    mesh, engines,
    nav: [{ p: [-.4, .0, .43], c: [.2, 1, .35] }, { p: [-.4, .0, -.43], c: [1, .15, .08] }, { p: [-.44, .1, .41], c: [1, 1, 1], strobe: true }],
  };
}

function bulwarkMesh(rng) {
  const mesh = new Mesh();
  const hull = mat(K.PLATE, .58, 0, { rough: .52, extra: 2 });
  const dark = mat(K.ACCENT, .3, 0, { rough: .48, extra: 2 });
  const mech = mat(K.MECH, .5, 0, { metal: .6, rough: .38 });
  loft(mesh, [[.5, .1, .03, -.01], [.38, .2, .075, 0], [.1, .24, .1, .01], [-.32, .25, .105, .01], [-.44, .2, .085, .0]], hull);
  // Raised spine and turret.
  sbox(mesh, -.3, .2, .09, .125, -.09, .09, dark, .01);
  cyl(mesh, { o: [0, 0, 0], t: [1, 0, 0], b: [0, 0, 1], n: [0, 1, 0] }, .05, 0, .06, .125, .15, 12, mech);
  sbox(mesh, .0, .12, .15, .19, -.045, .045, hull, .008);
  for (const z of [-.02, .02]) sbox(mesh, .1, .32, .16, .175, z - .007, z + .007, mat(K.BARE, .3, 0, { metal: .9, rough: .3, extra: 0 }));
  // Missile pods.
  for (const s of [1, -1]) {
    sbox(mesh, .12, .3, .08, .13, s * .12 - .05, s * .12 + .05, mech, .006);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      sbox(mesh, .3, .304, .088 + r * .02, .1 + r * .02, s * .12 - .036 + c * .025, s * .12 - .024 + c * .025, mat(K.CYAN, rng(), 0, { extra: 0 }));
    }
  }
  const engines = [];
  for (const s of [1, -1]) {
    offsetLoft(mesh, [[.06, .05, .05, 0], [-.04, .09, .09, 0], [-.46, .09, .09, 0], [-.5, .075, .075, 0]], dark, -.01, s * .34);
    sbox(mesh, -.3, -.05, -.02, .02, s * .2, s * .3, mech);
    sbox(mesh, -.4, -.06, .07, .08, s * .34 - .06, s * .34 + .06, mat(K.CYAN, rng(), 0, { extra: 0 }));
    nozzle(mesh, -.5, -.01, s * .34, .066, 12, mat(K.NOZZLE, .5, 0, { extra: 0 }));
    engines.push({ p: [-.515, -.01, s * .34], r: .07 });
  }
  // Cockpit windows across the nose and cyan strips down the flanks.
  sbox(mesh, .37, .42, .04, .06, -.09, .09, mat(K.WINDOW, .9, 0, { extra: 0 }));
  for (const s of [1, -1]) sbox(mesh, -.3, .3, .02, .03, s * .245, s * .252, mat(K.CYAN, rng(), 0, { extra: 0 }));
  return {
    mesh, engines,
    nav: [{ p: [-.2, .0, .44], c: [.2, 1, .35] }, { p: [-.2, .0, -.44], c: [1, .15, .08] }, { p: [-.3, .13, 0], c: [1, 1, 1], strobe: true }],
  };
}

function wardenMesh(rng) {
  const mesh = new Mesh();
  const hull = mat(K.PLATE, .5, 0, { rough: .55, extra: 2 });
  const dark = mat(K.ACCENT, .35, 0, { rough: .5, extra: 2 });
  const mech = mat(K.MECH, .5, 0, { metal: .6, rough: .38 });
  loft(mesh, [[.62, .015, .02, -.01], [.46, .07, .05, 0], [.3, .1, .07, .0], [-.44, .11, .08, .0], [-.5, .095, .07, .0]], hull);
  // Prow intakes.
  for (const s of [1, -1]) sbox(mesh, .3, .5, -.05, -.01, s * .045 - .014, s * .045 + .014, mech, .004);
  // Superstructure and bridge.
  sbox(mesh, -.34, .1, .07, .1, -.07, .07, dark, .01);
  sbox(mesh, -.26, -.02, .1, .15, -.05, .05, hull, .01);
  sbox(mesh, -.2, -.06, .15, .19, -.035, .035, dark, .008);
  for (const s of [1, -1]) {
    for (let x = -.19; x < -.07; x += .022) sbox(mesh, x, x + .013, .163, .176, s * .035, s * .037, mat(K.WINDOW, rng(), 0, { extra: 0 }));
  }
  box(mesh, { o: [-.14, .19, 0], t: [1, 0, 0], b: [0, 0, 1], n: [0, 1, 0] }, -.003, -.003, .003, .003, 0, .09, mat(K.BARE, .3, 0, { metal: .9, rough: .3, extra: 0 }));
  // Turrets.
  for (const x of [.2, .07, -.4]) {
    cyl(mesh, { o: [0, 0, 0], t: [1, 0, 0], b: [0, 0, 1], n: [0, 1, 0] }, x, 0, .035, .07, .095, 10, mech);
    sbox(mesh, x - .03, x + .03, .095, .12, -.028, .028, hull, .006);
    const aim = x < 0 ? -1 : 1;
    for (const z of [-.012, .012]) sbox(mesh, x + .02 * aim, x + .13 * aim, .1, .11, z - .005, z + .005, mat(K.BARE, .3, 0, { metal: .9, rough: .3, extra: 0 }));
  }
  // Rows of windows and cyan running lights along the flanks.
  for (const s of [1, -1]) {
    for (let x = -.4; x < .36; x += .028) sbox(mesh, x, x + .016, .02, .032, s * .1, s * .103, mat(K.WINDOW, rng(), 0, { extra: 0 }));
    sbox(mesh, -.42, .4, -.03, -.022, s * .104 - .003, s * .104 + .003, mat(K.CYAN, rng(), 0, { extra: 0 }));
  }
  // Engine block with three nozzles.
  sbox(mesh, -.58, -.46, -.07, .07, -.1, .1, mech, .008);
  const engines = [];
  for (const [y, z] of [[.025, -.055], [.025, .055], [-.035, 0]]) {
    nozzle(mesh, -.58, y, z, .036, 10, mat(K.NOZZLE, .5, 0, { extra: 0 }));
    engines.push({ p: [-.595, y, z], r: .04 });
  }
  return {
    mesh, engines,
    nav: [{ p: [0, .0, .12], c: [.2, 1, .35] }, { p: [0, .0, -.12], c: [1, .15, .08] }, { p: [-.14, .285, 0], c: [1, .12, .06], strobe: true }],
  };
}

const CLASSES = {
  lancer: { length: .13, speed: .6, turn: 2.2, accel: 1.1, kerf: true, col: [1, .5, .18], hull: 0 },
  dart: { length: .1, speed: .72, turn: 2.7, accel: 1.4, kerf: true, col: [1, .62, .26], hull: 0 },
  bulwark: { length: .18, speed: .38, turn: 1.2, accel: .7, kerf: false, col: [.5, .76, 1], hull: 1 },
  warden: { length: .27, speed: .2, turn: .5, accel: .32, kerf: false, col: [.48, .78, 1], hull: 2 },
};

// ---------------------------------------------------------------------------
// Flight: a small steering simulation in plate space (y down, z toward viewer)
// ---------------------------------------------------------------------------
const TRAIL_N = 34, TRAIL_DT = 1 / 40;

function createFleet(models) {
  let rng = rngOf(1);
  let ships = [];
  let kerfBusy = -1;

  function randomPoint(minR, maxR) {
    for (let k = 0; k < 40; k++) {
      const dir = norm([rng() * 2 - 1, rng() * 2 - 1, rng() * 1.55 - .5]);
      const r = span(rng, minR, Math.min(maxR, .84));
      const p = [CX + dir[0] * FLIGHT[0] * r, CY + dir[1] * FLIGHT[1] * r, dir[2] * FLIGHT[2] * r];
      if (sdB(...p) > .3) return p;
    }
    return [CX + FLIGHT[0] * .8, CY, .5];
  }
  function clearPath(a, b, margin, from = 1) {
    for (let k = from; k < 12; k++) {
      const t = k / 12;
      if (sdB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) < margin) return false;
    }
    return true;
  }

  // A tiny visibility search: the shortest two-leg route via a point on one
  // of three rings around the B (behind, level, in front) with both legs clear.
  const RING = [];
  for (const z of [-.62, 0, .62]) {
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      const r = z ? .55 : .82;
      RING.push([CX + Math.cos(a) * FLIGHT[0] * r, CY + Math.sin(a) * FLIGHT[1] * r, z]);
    }
  }
  function detourFor(from, to) {
    let best = null, cost = Infinity;
    for (const p of RING) {
      if (sdB(...p) < .2) continue;
      const c = Math.hypot(...sub(p, from)) + Math.hypot(...sub(to, p));
      if (c < cost && clearPath(from, p, .025, 2) && clearPath(p, to, .1)) { cost = c; best = p; }
    }
    // Nothing clear: back straight off the hull first.
    if (!best && sdB(...from) < .25) best = mad(from, gradB(from), .4);
    return best;
  }

  function plan(s) {
    const from = s.plan.length ? s.plan.at(-1).p : s.pos;
    const r = rng();
    if (s.cls.kerf && kerfBusy < 0 && r < .34 && s.lead < 0) {
      // Thread the reactor trench between the two halves.
      const dir = rng() < .5 ? 1 : -1;
      const lane = (rng() < .5 ? 1 : -1) * span(rng, .1, .16);
      const mid = [.48, KERF_MID - SLOPE * .48, lane];
      const at = t => [mid[0] + KDIR[0] * t * dir, mid[1] + KDIR[1] * t * dir, lane];
      const out = at(.88);
      out[2] += lane * 1.4;
      s.plan.push({ p: at(-.9) }, { p: at(-.6), kerf: true }, { p: at(.62), kerf: true, boost: true }, { p: out });
      s.kerfRun = true;
      s.kerfDir = dir;
      kerfBusy = ships.indexOf(s);
      return;
    }
    if (r < .42 && s.cls.kerf) {
      // A low strafing pass over the front or back face.
      const side = rng() < .78 ? 1 : -1;
      const h = side > 0 ? FRONT + span(rng, .13, .17) : BACK - span(rng, .1, .14);
      const across = rng() * Math.PI * 2;
      const d = [Math.cos(across), Math.sin(across) * .8, 0];
      const c = [span(rng, .25, .75), span(rng, .4, 1.3), h];
      const a = mad(c, d, -.85), b = mad(c, d, .85);
      const pre = mad(a, d, -.2);
      pre[2] += side * .28;
      b[2] += side * .05;
      const pts = [pre, a, b].map(p => [clamp(p[0], CX - FLIGHT[0] * .82, CX + FLIGHT[0] * .82), clamp(p[1], CY - FLIGHT[1] * .82, CY + FLIGHT[1] * .82), p[2]]);
      if (clearPath(from, pts[0], .13)) {
        s.plan.push({ p: pts[0] }, { p: pts[1], low: true }, { p: pts[2], low: true });
        return;
      }
    }
    if (r < .7) {
      // Part of an inclined orbit around the B.
      const axis = norm([span(rng, -.4, .4), rng() < .5 ? 1 : span(rng, -.3, .3), span(rng, -.5, .5)]);
      const u = norm(cross(axis, Math.abs(axis[2]) < .9 ? [0, 0, 1] : [1, 0, 0]));
      const v = cross(axis, u);
      const rad = span(rng, .66, .84);
      const dir = rng() < .5 ? 1 : -1;
      let a0 = rng() * Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        a0 += dir * span(rng, .7, 1.1);
        const off = mad(mad([0, 0, 0], u, Math.cos(a0)), v, Math.sin(a0));
        const p = [CX + off[0] * FLIGHT[0] * rad, CY + off[1] * FLIGHT[1] * rad, off[2] * FLIGHT[2] * rad];
        for (let k = 0; k < 6 && sdB(...p) < .3; k++) p[2] += p[2] >= 0 ? .12 : -.12;
        const prev = s.plan.length ? s.plan.at(-1).p : from;
        if (!clearPath(prev, p, s.cls.kerf ? .1 : .2)) {
          const via = detourFor(prev, p);
          if (via) s.plan.push({ p: via });
        }
        s.plan.push({ p });
      }
      return;
    }
    // Patrol to somewhere well across the scene.
    let best = null;
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(.55, .92);
      const turn = dot(norm(sub(p, [CX, CY, 0])), norm(sub(from, [CX, CY, 0])));
      if (turn < .3 && clearPath(from, p, s.cls.kerf ? .13 : .22)) { best = p; break; }
      best = best || p;
    }
    if (!clearPath(from, best, .13)) {
      const mid = mad(from, sub(best, from), .5);
      const out = norm(sub(mid, [CX, CY, 0]));
      s.plan.push({ p: [mid[0] + out[0] * .3, mid[1] + out[1] * .3, mid[2] + (mid[2] >= 0 ? .4 : -.4)] });
    }
    s.plan.push({ p: best });
  }

  function spawn(seed) {
    rng = rngOf(seed);
    kerfBusy = -1;
    const count = 6 + Math.floor(rng() * 4);
    const roster = ['warden', 'bulwark', 'lancer', 'lancer', 'dart', 'lancer', 'bulwark', 'dart', 'lancer'].slice(0, count);
    ships = roster.map((name, i) => {
      const cls = CLASSES[name];
      const pos = randomPoint(.6, .9);
      const toC = norm(sub([CX, CY, 0], pos));
      const fwd = norm(cross(toC, [rng() - .5, rng() - .5, 1]));
      const s = {
        name, cls, model: models[cls.hull], pos, fwd, up: [0, -1, 0], right: [0, 0, -1], speed: cls.speed,
        roll: 0, plan: [], lead: -1, offset: null, boost: 0, kerfRun: false,
        trail: models[cls.hull].engines.map(() => ({ pts: new Float32Array(TRAIL_N * 3), count: 0, head: 0 })),
        trailClock: 0, arrive: -1, seen: 1, flash: 0, tint: span(rng, -.08, .08), check: rng() * .2, detour: null, kerfDir: 1,
      };
      return s;
    });
    // Fighters pair up: the second of each pair flies on the first's wing.
    ships.forEach((s, i) => {
      if (s.cls.kerf && i > 0 && ships[i - 1].cls.kerf && ships[i - 1].lead < 0 && rng() < .75) {
        s.lead = i - 1;
        const side = rng() < .5 ? 1 : -1;
        s.offset = [-.09 - rng() * .05, span(rng, -.02, .03), side * span(rng, .07, .1)];
        s.pos = mad(ships[i - 1].pos, [0, 0, 1], side * .08);
        s.fwd = ships[i - 1].fwd.slice();
      }
      frame(s, 1 / 60);
    });
  }

  function frame(s, dt, fOld = s.fwd) {
    const turn = dot(cross(fOld, s.fwd), s.up) / Math.max(dt, 1e-4);
    const target = clamp(-turn * .5, -1.2, 1.2);
    s.roll += (target - s.roll) * (1 - Math.exp(-5 * dt));
    let ref = [0, -1, 0];
    if (Math.abs(dot(s.fwd, ref)) > .96) ref = s.up;
    const r0 = norm(cross(s.fwd, ref));
    const u0 = cross(r0, s.fwd);
    const c = Math.cos(s.roll), sn = Math.sin(s.roll);
    s.up = norm([u0[0] * c + r0[0] * sn, u0[1] * c + r0[1] * sn, u0[2] * c + r0[2] * sn]);
    s.right = cross(s.fwd, s.up);
  }

  function turnToward(f, w, maxA) {
    const c = clamp(dot(f, w), -1, 1);
    const a = Math.acos(c);
    if (a <= maxA || a < 1e-6) return w;
    if (a > 3.1) w = norm(mad(w, cross(f, [0, 0, 1]), .3));
    const ca = clamp(dot(f, w), -1, 1), aa = Math.acos(ca), sa = Math.sin(aa) || 1e-6;
    const t = maxA / aa;
    return norm(mad(mad([0, 0, 0], f, Math.sin((1 - t) * aa) / sa), w, Math.sin(t * aa) / sa));
  }

  function step(dt, events) {
    for (const [i, s] of ships.entries()) {
      const c = s.cls;
      if (!s.plan.length && s.lead < 0) plan(s);
      let target, want, desired = c.speed;
      const leader = s.lead >= 0 ? ships[s.lead] : null;
      let inKerf = false;
      if (leader && !leader.kerfRun) {
        target = mad(mad(mad(leader.pos, leader.fwd, s.offset[0]), leader.up, s.offset[1]), leader.right, s.offset[2]);
        target = mad(target, leader.fwd, leader.speed * .3);
        const gap = sub(target, s.pos);
        desired = leader.speed * (1 + clamp(dot(gap, leader.fwd) * 4, -.35, .6));
      } else {
        if (!s.plan.length) plan(s);
        const wp = s.plan[0];
        const to = sub(wp.p, s.pos);
        const dist = Math.hypot(...to);
        const radius = s.speed / c.turn;
        if (dist < Math.max(.07, radius * .75) || (dist < radius * 2.2 && dot(to, s.fwd) < 0 && !wp.kerf)) {
          s.plan.shift();
          if (s.kerfRun && !s.plan.some(p => p.kerf)) {
            s.kerfRun = false;
            if (kerfBusy === i) kerfBusy = -1;
          }
          if (!s.plan.length) plan(s);
        }
        target = s.plan[0].p;
        if (s.plan[0].kerf) {
          desired = c.speed * 1.15;
          inKerf = true;
        }
        if (s.plan[0].boost) s.boost = Math.max(s.boost, .6);
      }
      // If the B stands between the craft and where it is going, route over
      // its front or back instead of pressing against the hull.
      if (!s.kerfRun) {
        s.check -= dt;
        if (s.check <= 0) {
          s.check = .2;
          if (s.detour && !clearPath(s.pos, s.detour, .04, 2)) s.detour = null;
          if (!s.detour && !clearPath(s.pos, target, .06, 2)) s.detour = detourFor(s.pos, target);
        }
        if (s.detour) {
          if (Math.hypot(...sub(s.detour, s.pos)) < .16) s.detour = null;
          else target = s.detour;
        }
      }
      want = norm(sub(target, s.pos));
      let evade = 1;
      // Inside the trench the craft rides the beam's lane, but only once it
      // has lined up on the gap.
      const rel = sub(s.pos, [.48, KERF_MID - SLOPE * .48, 0]);
      const alongK = dot(rel, KDIR);
      const lane0 = s.plan[0]?.p[2] ?? 0;
      const inGap = s.kerfRun && Boolean(s.plan[0]?.kerf) && Math.abs(alongK) < .92
        && Math.abs(dot(rel, KNRM)) < .2 && Math.abs(s.pos[2] - lane0) < .3
        && dot(s.fwd, KDIR) * s.kerfDir > .35;
      if (!inGap) {
        // Look as far ahead as the craft needs to turn away, and brake when close.
        const radius = Math.max(s.speed, .05) / c.turn;
        const low = s.plan[0]?.low && s.lead < 0;
        const lining = s.kerfRun && s.plan[0]?.kerf;
        const margin = low ? .05 + c.length * .3 : Math.max(.08 + c.length * .5, radius * .7);
        let near = sdB(...s.pos), at = s.pos;
        for (const k of [.5, 1.1]) {
          const look = mad(s.pos, s.fwd, radius * k + .04);
          // Lining up on the trench, the gap ahead is a corridor, not a wall.
          if (lining) {
            const lr = sub(look, [.48, KERF_MID - SLOPE * .48, 0]);
            if (Math.abs(dot(lr, KNRM)) < .06 && Math.abs(lr[2]) < .3 && Math.abs(dot(lr, KDIR)) < .62) continue;
          }
          const d = sdB(...look) - k * .01;
          if (d < near) { near = d; at = look; }
        }
        if (near < margin) {
          // Manoeuvring thrusters: the closer the hull, the harder it turns.
          const push = (margin - near) / margin;
          want = norm(mad(want, gradB(at), push * 6));
          desired *= Math.max(.6, 1 - .45 * push);
          evade = 1 + 2 * push;
        }
      }
      // Keep clear of other craft by looking ahead to the closest approach.
      for (const o of ships) {
        if (o === s || o.arrive > 0) continue;
        const wing = o.lead === i || s.lead === ships.indexOf(o);
        const keep = (c.length + o.cls.length) * (wing ? .45 : .75) + .02;
        const dp = sub(o.pos, s.pos);
        const dv = sub(mad([0, 0, 0], o.fwd, o.speed), mad([0, 0, 0], s.fwd, s.speed));
        const vv = dot(dv, dv);
        const t = vv > 1e-8 ? clamp(-dot(dp, dv) / vv, 0, .7) : 0;
        const miss = mad(dp, dv, t);
        let md = Math.hypot(...miss);
        if (md >= keep) continue;
        // Head-on: pick a side so the two craft do not mirror each other.
        let away = md > 1e-4 ? miss.map(v => -v / md) : norm(cross(s.fwd, [0, 0, 1]));
        if (md < keep * .3) away = norm(mad(away, s.up, i < ships.indexOf(o) ? .8 : -.8));
        const k = (keep - md) / keep * (1 - t / .9);
        want = norm(mad(want, away, k * 5));
        evade = Math.max(evade, 1 + 1.5 * k);
      }
      const e = [(s.pos[0] - CX) / FLIGHT[0], (s.pos[1] - CY) / FLIGHT[1], s.pos[2] / FLIGHT[2]];
      const er = Math.hypot(...e);
      if (er > .74) want = norm(mad(want, [e[0] / FLIGHT[0], e[1] / FLIGHT[1], e[2] / FLIGHT[2]], -(er - .74) * 30 / er));
      for (const ev of events) {
        const d = sub(s.pos, ev.at);
        const l = Math.hypot(d[0], d[1]);
        if (l < ev.reach) {
          s.boost = 1;
          const away = norm([d[0] || .01, d[1], d[2] + (s.pos[2] >= 0 ? .4 : -.4)]);
          s.plan = [{ p: mad(s.pos, away, .55) }];
          if (s.kerfRun) {
            s.kerfRun = false;
            if (kerfBusy === i) kerfBusy = -1;
          }
          if (s.lead >= 0) s.lead = -1;
        }
      }
      const fOld = s.fwd;
      const boost = 1 + s.boost * .85;
      s.fwd = turnToward(s.fwd, want, c.turn * dt * (inGap ? 2.2 : 1) * (1 + s.boost * .4) * (er > .9 ? 2 : 1) * evade);
      s.speed += clamp(desired * boost - s.speed, -c.accel * dt, c.accel * dt * boost);
      s.pos = mad(s.pos, s.fwd, s.speed * dt);
      if (inGap) {
        const cs = dot(sub(s.pos, [.48, KERF_MID - SLOPE * .48, 0]), KNRM);
        const k = 1 - Math.exp(-14 * dt);
        s.pos = mad(s.pos, KNRM, -cs * k);
        const lane = s.plan[0]?.p[2] ?? s.pos[2];
        s.pos[2] += (lane - s.pos[2]) * k;
      }
      // Never leave the volume the sculpture layer is sized for.
      const ex = (s.pos[0] - CX) / FLIGHT[0], ey = (s.pos[1] - CY) / FLIGHT[1], ez = s.pos[2] / FLIGHT[2];
      const eo = Math.hypot(ex, ey, ez);
      if (eo > 1) {
        s.pos = [CX + ex / eo * FLIGHT[0], CY + ey / eo * FLIGHT[1], ez / eo * FLIGHT[2]];
      }
      // Nor pass through the hull outside the trench.
      if (!inGap) {
        const d = sdB(...s.pos) + .012;
        if (d < .03) {
          s.pos = mad(s.pos, gradB(s.pos), .03 - d);
          s.check = 0;
          s.detour = null;
        }
      }
      s.boost = Math.max(0, s.boost - dt * .7);
      frame(s, dt, fOld);
      if (s.arrive > 0) continue;
      s.trailClock += dt;
      if (s.trailClock >= TRAIL_DT) {
        s.trailClock -= TRAIL_DT;
        s.model.engines.forEach((en, k) => {
          const t = s.trail[k];
          const p = enginePoint(s, en.p);
          t.head = (t.head + 1) % TRAIL_N;
          t.pts.set(p, t.head * 3);
          t.count = Math.min(TRAIL_N, t.count + 1);
        });
      }
    }
  }

  function enginePoint(s, l) {
    const k = s.cls.length;
    return [
      s.pos[0] + k * (l[0] * s.fwd[0] + l[1] * s.up[0] + l[2] * s.right[0]),
      s.pos[1] + k * (l[0] * s.fwd[1] + l[1] * s.up[1] + l[2] * s.right[1]),
      s.pos[2] + k * (l[0] * s.fwd[2] + l[1] * s.up[2] + l[2] * s.right[2]),
    ];
  }

  return {
    get ships() { return ships; },
    enginePoint,
    reset(seed, warmup) {
      spawn(seed);
      for (let t = 0; t < warmup; t += 1 / 60) step(1 / 60, []);
    },
    step,
  };
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const PLACE = `
uniform vec4 halfMotion;
uniform float spread, mode, shipScale;
uniform vec3 shipPos, shipFwd, shipUp, shipRight;
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void place(vec3 p, vec3 n, vec3 t, float part, out vec3 wp, out vec3 wn, out vec3 wt) {
  if (mode > .5) {
    wp = shipPos + shipScale * (p.x * shipFwd + p.y * shipUp + p.z * shipRight);
    wn = n.x * shipFwd + n.y * shipUp + n.z * shipRight;
    wt = t.x * shipFwd + t.y * shipUp + t.z * shipRight;
    return;
  }
  bool upper = part < .5;
  mat2 R = rot2(upper ? -halfMotion.z : -halfMotion.w);
  vec2 piv = upper ? vec2(.50, .46) : vec2(.58, 1.22);
  vec2 off = upper ? vec2(halfMotion.x, -spread) : vec2(halfMotion.y, spread);
  wp = vec3(R * (p.xy - piv) + piv + off, p.z);
  wn = vec3(R * n.xy, n.z);
  wt = vec3(R * t.xy, t.z);
}
vec3 tRule(vec3 n) {
  return abs(n.z) > .7 ? normalize(vec3(1., 0., 0.) - n * n.x) : normalize(vec3(-n.y, n.x, 0.));
}
`;

const litVert = `precision highp float;
attribute vec4 aPos, aNrm, aUv, aExt;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift;
uniform vec3 lightU, lightV, lightW;
${PLACE}
varying vec3 vObj, vView, vN, vT, vShadow;
varying vec4 vUv, vExt;
varying float vAo;
void main() {
  vec3 wp, wn, wt;
  place(aPos.xyz, aNrm.xyz, tRule(aNrm.xyz), aPos.w, wp, wn, wt);
  vec3 q = vec3(wp.x - ${CX}, wp.y - ${CY} + lift, wp.z);
  vec3 vp = vec3(dot(row1, q), dot(row2, q), dot(row3, q));
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + vp.z);
  vec2 screen = centre + size * vp.xy * persp;
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, vp.z * .25, 1.);
  vObj = wp;
  vView = vp;
  vN = vec3(dot(row1, wn), dot(row2, wn), dot(row3, wn));
  vT = vec3(dot(row1, wt), dot(row2, wt), dot(row3, wt));
  vec3 rel = wp - vec3(${CX}, ${CY}, 0.) + wn * .0035;
  vShadow = vec3(dot(rel, lightU), dot(rel, lightV), dot(rel, lightW)) / ${SHADOW_EXTENT.toFixed(2)} * .5 + .5;
  vUv = aUv;
  vExt = aExt;
  vAo = aNrm.w;
}`;

const litFrag = `precision highp float;
uniform vec3 row1, row2, row3;
uniform vec3 keyV, sunV, kickV, keyCol, sunCol, kickCol;
uniform vec3 kerfA, kerfB, engineCol;
uniform float time, pixel, power, pulse, quality, boost, glow, shadowOn, shadowTexel;
uniform vec4 shockA, shockB;
uniform sampler2D shadowMap;
varying vec3 vObj, vView, vN, vT, vShadow;
varying vec4 vUv, vExt;
varying float vAo;

const vec3 LIME = vec3(.42, .86, .07);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) {
  return .5 * vnoise(p) + .3 * vnoise(p * 2.13 + 4.1) + .2 * vnoise(p * 4.37 + 9.3);
}

// Hierarchical rectangular panelling: distance to the nearest seam (plate
// units), the panel id, the direction to that seam, and the position inside.
float panel(vec2 uv, float scale, out float id, out vec2 toEdge, out vec2 local, out vec2 dims) {
  vec2 p = uv * scale;
  vec2 cell = floor(p);
  vec2 f = p - cell;
  vec2 lo = vec2(0.), hi = vec2(1.);
  id = hash12(cell + 11.3);
  for (int i = 0; i < 3; i++) {
    float h1 = hash12(cell * 1.37 + vec2(id * 17.1, float(i) * 5.3));
    float h2 = hash12(cell * .71 + vec2(float(i) * 9.7, id * 23.9));
    vec2 sz = hi - lo;
    float s = .28 + .44 * h1;
    if (sz.x > sz.y * (.55 + .9 * h2)) {
      float m = lo.x + sz.x * s;
      if (f.x < m) hi.x = m; else lo.x = m;
    } else {
      float m = lo.y + sz.y * s;
      if (f.y < m) hi.y = m; else lo.y = m;
    }
    id = hash12(vec2(id * 7.13 + lo.x * 3.1 + hi.y, lo.y * 5.3 + hi.x * 1.7));
  }
  vec4 d = vec4(f.x - lo.x, hi.x - f.x, f.y - lo.y, hi.y - f.y) / scale;
  float m = min(min(d.x, d.y), min(d.z, d.w));
  toEdge = m == d.x ? vec2(-1., 0.) : (m == d.y ? vec2(1., 0.) : (m == d.z ? vec2(0., -1.) : vec2(0., 1.)));
  local = (f - lo) / scale;
  dims = (hi - lo) / scale;
  return m;
}

float unpackDepth(vec4 c) { return dot(c, vec4(1., 1. / 255., 1. / 65025., 1. / 16581375.)); }
float shadowTap(vec2 uv, float z) { return step(z, unpackDepth(texture2D(shadowMap, uv))); }
float shadowAt(vec3 s, float bias) {
  if (shadowOn < .5 || any(lessThan(s, vec3(0.))) || any(greaterThan(s, vec3(1.)))) return 1.;
  float z = s.z - bias;
  if (quality < 1.5) return shadowTap(s.xy, z);
  float sum = 0.;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) sum += shadowTap(s.xy + vec2(float(i), float(j)) * shadowTexel, z);
  return sum / 9.;
}

// The surroundings seen in reflections: cold space above, the planet's dark
// disc below its glowing limb, and the sunrise to the lower right.
vec3 envView(vec3 r, float rough) {
  float horizon = r.y - (.2 + .12 * r.x * r.x);
  float soft = .04 + rough * .45;
  float below = smoothstep(-soft, soft, horizon);
  vec3 sky = vec3(.004, .006, .010) + vec3(.006, .018, .028) * pow(max(0., -.6 * r.x - .5 * r.y), 2.);
  vec3 ground = vec3(.008, .012, .02);
  vec3 c = mix(sky, ground, below);
  float limb = exp(-abs(horizon) / (.018 + rough * .2));
  float warm = smoothstep(-.1, .8, r.x) * smoothstep(-.4, .6, r.z);
  c += mix(vec3(.12, .3, .8), vec3(1.2, .6, .22), warm) * limb * (.35 + 1.3 * warm);
  float sd = max(dot(r, sunV), 0.);
  c += vec3(1., .72, .45) * pow(sd, mix(220., 6., rough)) * mix(9., .5, rough);
  return c;
}

vec3 shade(vec3 N, vec3 V, vec3 L, vec3 col, vec3 diff, vec3 F0, float a) {
  float NdL = dot(N, L);
  if (NdL <= 0.) return vec3(0.);
  vec3 H = normalize(L + V);
  float NdH = max(dot(N, H), 0.), NdV = max(dot(N, V), 1e-3), VdH = max(dot(V, H), 0.);
  vec3 F = F0 + (1. - F0) * pow(1. - VdH, 5.);
  float a2 = a * a;
  float dd = NdH * NdH * (a2 - 1.) + 1.;
  float Dg = a2 / (3.14159 * dd * dd);
  float k = a * .5;
  float Vis = .25 / ((NdV * (1. - k) + k) * (NdL * (1. - k) + k));
  return (diff * (1. - F) + Dg * Vis * F * 3.14159) * col * NdL;
}

vec3 toView(vec3 v) { return vec3(dot(row1, v), dot(row2, v), dot(row3, v)); }

vec3 tone(vec3 c) {
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2));
}

float surge(vec4 s) {
  if (s.w <= 0. || s.z > 3.) return 0.;
  float d = length(vObj.xy - s.xy);
  float r = s.z * .95;
  float x = (d - r) / (.03 + s.z * .03);
  return s.w * exp(-x * x) * exp(-s.z * 1.3);
}

void main() {
  float kind = floor(vUv.z + .5);
  float seed = vUv.w;
  vec2 uv = vUv.xy;
  vec3 N = normalize(vN);
  vec3 T = normalize(vT - N * dot(vT, N));
  vec3 Bt = cross(N, T);
  vec3 V = normalize(vec3(0., 0., -10.5) - vView);
  float px = pixel;
  float h = fract(seed * 13.17 + .31);

  vec3 albedo = vec3(.118, .124, .134) * (.8 + .4 * h);
  if (fract(seed * 5.71) > .62) albedo *= vec3(.93, .98, 1.07);
  float rough = vExt.y, metal = vExt.z, cavity = vAo;
  vec2 dn = vec2(0.);
  vec3 emit = vec3(0.);
  float th = vExt.w;
  float on = smoothstep(th, th + .05, power);
  on *= 1. - .75 * step(power, th + .14) * step(.45, hash12(vec2(seed * 91.7, floor(time * 22.))));
  float wave = surge(shockA) + surge(shockB);

  if (kind < .5 || abs(kind - 2.) < .5) {
    if (kind > 1.5) albedo = vec3(.046, .056, .074) * (.82 + .36 * h);
    float detail = vExt.w;
    if (detail > .5) {
      float id; vec2 toEdge, local, dims;
      float e = panel(uv + seed * 3.7, detail > 1.5 ? 12. : 8.5, id, toEdge, local, dims);
      float w = max(.0009, px * .55);
      float groove = 1. - smoothstep(w, w + px * 1.25, e);
      cavity *= 1. - (detail > 1.5 ? .35 : .6) * groove;
      float lip = (1. - smoothstep(w, w + .0032, e)) * (1. - groove);
      dn += toEdge * lip * .5;
      albedo *= .62 + .7 * hash12(vec2(id, 3.7));
      if (hash12(vec2(id, 9.1)) > .84) albedo *= vec3(.84, .9, 1.04);
      if (quality > .5) {
        // Rivets along some seams.
        if (hash12(vec2(id, 1.3)) > .55 && min(dims.x, dims.y) > .012) {
          bool vertical = toEdge.x != 0.;
          float along = vertical ? local.y : local.x;
          float acrossEdge = vertical ? (toEdge.x < 0. ? local.x : dims.x - local.x) : (toEdge.y < 0. ? local.y : dims.y - local.y);
          vec2 rq = vec2(acrossEdge - .0036, (fract(along / .0095) - .5) * .0095);
          float rl = length(rq);
          float rivet = smoothstep(.0013 + px * .4, .0005, rl);
          vec2 rdir = vertical ? vec2(rq.x * -toEdge.x, rq.y) : vec2(rq.y, rq.x * -toEdge.y);
          dn += normalize(rdir + 1e-6) * rivet * .55;
          cavity *= 1. - .25 * smoothstep(.0018, .0012, rl) * (1. - rivet);
        }
        float pick = hash12(vec2(id, 5.5));
        if (pick < .16 && min(dims.x, dims.y) > .014) {
          // Grille slots.
          bool horiz = dims.x > dims.y;
          float c = horiz ? local.x : local.y;
          float slot = fract(c / .0052);
          float inset = min(min(local.x, dims.x - local.x), min(local.y, dims.y - local.y));
          float mask = smoothstep(.0022, .0032, inset);
          float s = smoothstep(.18, .3, slot) - smoothstep(.62, .74, slot);
          cavity *= 1. - .5 * s * mask;
          dn += (horiz ? vec2(1., 0.) : vec2(0., 1.)) * (smoothstep(.62, .74, slot) - smoothstep(.18, .3, slot)) * .7 * mask;
        } else if (pick < .27 && min(dims.x, dims.y) > .012) {
          // A grid of tiny raised tiles.
          vec2 g = fract(local / .0042) - .5;
          float tile = max(abs(g.x), abs(g.y));
          float edgeT = smoothstep(.34, .46, tile);
          dn += sign(g) * step(abs(g.yx), abs(g)) * edgeT * .45;
          cavity *= 1. - .25 * edgeT;
        } else if (pick < .4 && min(dims.x, dims.y) > .01) {
          // Rows of tiny lit portholes: the station is inhabited.
          vec2 wg = local / vec2(.0085, .011);
          vec2 wc = floor(wg);
          vec2 wf = fract(wg) - .5;
          float inset = min(min(local.x, dims.x - local.x), min(local.y, dims.y - local.y));
          float lit = step(.4, hash12(wc + id * 41.)) * smoothstep(.003, .005, inset);
          float port = smoothstep(.3, .2, max(abs(wf.x), abs(wf.y) * 1.5));
          cavity *= 1. - .3 * port;
          vec3 wcol = hash12(wc + 7.7) < .82 ? vec3(1., .62, .3) : vec3(.62, .85, 1.);
          emit += wcol * port * lit * on * 1.6 * (.85 + .15 * sin(time * 1.7 + hash12(wc) * 30.));
        } else if (pick > .965) {
          // Faded stencil stripe.
          float st = step(.5, fract((local.x + local.y) / .009));
          albedo = mix(albedo, vec3(.36, .3, .12), st * .45);
        }
      }
    }
    // Grime, streaks and worn edges.
    float g = fbm(uv * 15. + seed * 7.);
    float streak = vnoise(vec2(uv.x * 150., uv.y * 7.));
    albedo *= (.72 + .38 * g) * (.9 + .14 * streak);
    rough = clamp(rough + .2 * (1. - g) - .08 * streak, .22, .95);
  } else if (kind == 1.) {
    albedo = vec3(.05, .053, .058) * (.78 + .44 * h);
    float r = fract(dot(uv, vec2(1.)) / .0055);
    dn += vec2(.5, .5) * (smoothstep(.0, .2, r) - smoothstep(.5, .7, r)) * .35;
  } else if (kind == 3.) {
    albedo = vec3(.02);
    emit = vec3(.16, .72, 1.) * (2.6 + 3.5 * wave) * on * (.9 + .1 * sin(time * 2.1 + seed * 30.));
  } else if (kind == 4.) {
    albedo = vec3(.015);
    float lit = step(.17, fract(seed * 7.7));
    vec3 wc = fract(seed * 3.3) < .8 ? vec3(1., .6, .27) : vec3(.68, .84, 1.);
    float flick = .82 + .18 * sin(time * (2. + 7. * fract(seed * 17.)) + seed * 40.);
    emit = wc * 2.1 * lit * on * flick * (1. + 1.5 * wave);
  } else if (kind == 5.) {
    albedo = vec3(.03, .034, .03);
    metal = .5;
    rough = .34;
    float z = uv.y;
    float lane = fract(z * 9.5);
    float lines = exp(-pow((lane - .5) / .06, 2.));
    float flow = .5 + .5 * sin(uv.x * 24. - time * 3.4 + floor(z * 9.5) * 1.9);
    float core = exp(-z * z / .004);
    emit = LIME * (lines * (.25 + 1.1 * flow * flow) + core * 1.4) * power * glow * (1. + 2. * wave);
  } else if (kind == 6.) {
    albedo = vec3(.008, .011, .014);
    rough = .08;
    emit = vec3(.5, .22, .08) * .09;
  } else if (kind == 7.) {
    float st = step(.5, fract((uv.x + uv.y) / .012));
    albedo = mix(vec3(.02), vec3(.42, .3, .05), st);
    rough = .6;
  } else if (kind == 8.) {
    albedo = vec3(.34, .35, .37) * (.8 + .3 * h);
    metal = .92;
    rough = .26;
  } else if (kind == 9.) {
    albedo = vec3(.02);
    float rr = length(fract(uv * 40.) - .5);
    emit = engineCol * (1.6 + 3.2 * boost) * (.75 + .25 * smoothstep(.5, .1, rr));
  } else if (kind == 10.) {
    albedo = vec3(.16, .168, .18) * (.8 + .4 * h);
    float scratch = vnoise(vec2(dot(uv, vec2(.7, .7)) * 900., dot(uv, vec2(-.7, .7)) * 30.));
    albedo *= .85 + .35 * scratch;
    metal = max(metal, .45);
    rough = .32 + .2 * (1. - scratch);
  }

  vec3 Nd = normalize(N + T * dn.x + Bt * dn.y);
  float a = max(.04, rough * rough);
  vec3 diff = albedo * (1. - metal);
  vec3 F0 = mix(vec3(.045), albedo * 2.4 + .03, metal);
  float sh = shadowAt(vShadow, .0016 + .0035 * (1. - clamp(dot(N, keyV), 0., 1.)));
  float direct = mix(1., cavity, .72);

  // Cinematic falloff: the key pools on the upper left of the station and
  // the lower right sinks toward the warm bounce of the sunrise below.
  float across = (vObj.x - .3) * .75 + (vObj.y - .55) * .62;
  float pool = mix(1.3, .5, smoothstep(-.55, .85, across));
  vec3 col = shade(Nd, V, keyV, keyCol * sh * pool, diff, F0, a) * direct;
  col += diff * vec3(.42, .2, .07) * smoothstep(.1, 1.1, across) * max(Nd.y * .6 + .5, 0.) * cavity * .9;
  col += shade(Nd, V, sunV, sunCol, diff, F0, a) * direct;
  col += shade(Nd, V, kickV, kickCol, diff, F0, a) * direct;
  // A soft fill from beside the camera keeps the plating legible face-on.
  col += shade(Nd, V, normalize(vec3(-.22, -.3, -1.)), vec3(.11, .13, .17), diff, F0, max(a, .35)) * cavity;
  // Hemispheric fill: cold space above, the planet's glow below.
  col += diff * mix(vec3(.006, .008, .013), vec3(.016, .026, .042), Nd.y * .5 + .5) * cavity;
  vec3 R = reflect(-V, Nd);
  float NdV = max(dot(Nd, V), 0.);
  vec3 Fe = F0 + (max(vec3(1. - a), F0) - F0) * pow(1. - NdV, 5.);
  col += envView(R, rough) * Fe * cavity;
  // The reactor beam in the cut is a line light.
  vec3 ab = kerfB - kerfA;
  float t = clamp(dot(vObj - kerfA, ab) / dot(ab, ab), 0., 1.);
  vec3 toBeam = kerfA + ab * t - vObj;
  float bd = length(toBeam);
  vec3 Lb = toView(toBeam / max(bd, 1e-4));
  float fall = (1. / (1. + bd * bd / .0045)) * smoothstep(.0, .05, t) * smoothstep(1., .95, t);
  col += shade(Nd, V, Lb, LIME * 2.4 * fall * power * glow, diff, F0, a);
  // The sunrise behind the planet catches every edge that turns toward it.
  float facing = max(dot(normalize(Nd.xy + vec2(1e-4)), normalize(sunV.xy)), 0.);
  float rim = pow(1. - NdV, 3.5) * facing * smoothstep(-.35, .25, Nd.z);
  col += sunCol * .42 * rim * (1. - .3 * metal) * mix(.5, 1., cavity);
  // Grade the reflected light too, so the falloff reads on polished metal.
  col *= mix(1.22, .58, smoothstep(-.55, .85, across));
  // Cool the shadows, warm the highlights.
  float lum = dot(col, vec3(.3, .55, .15));
  col = mix(col, col * vec3(.82, .95, 1.25), smoothstep(.12, .0, lum) * .6);
  col = mix(col, col * vec3(1.12, 1., .86), smoothstep(.25, .9, lum) * .5);
  // A click sends a power surge across the hull.
  col += vec3(.1, .45, .7) * wave * .35 * (1. - metal * .5);
  col += emit;
  gl_FragColor = vec4(tone(col), 1.);
}`;

const shadowVert = `precision highp float;
attribute vec4 aPos, aNrm;
uniform vec3 lightU, lightV, lightW;
${PLACE}
varying float vDepth;
void main() {
  vec3 wp, wn, wt;
  place(aPos.xyz, aNrm.xyz, vec3(1., 0., 0.), aPos.w, wp, wn, wt);
  vec3 rel = wp - vec3(${CX}, ${CY}, 0.);
  vec3 s = vec3(dot(rel, lightU), dot(rel, lightV), dot(rel, lightW)) / ${SHADOW_EXTENT.toFixed(2)};
  vDepth = s.z * .5 + .5;
  gl_Position = vec4(s.xy, s.z, 1.);
}`;

const shadowFrag = `precision highp float;
varying float vDepth;
void main() {
  vec4 e = fract(vDepth * vec4(1., 255., 65025., 16581375.));
  e -= e.yzww * vec4(1. / 255., 1. / 255., 1. / 255., 0.);
  gl_FragColor = e;
}`;

// Soft light sprites: hull lights, engines, nav lights, warp flashes.
const spriteVert = `precision highp float;
attribute vec4 aCenter, aCorner, aColor, aParam;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift, time, power, sway;
${PLACE}
varying vec2 vCorner;
varying vec3 vColor;
void main() {
  vec3 wp = aCenter.xyz, wn, wt;
  if (aCenter.w < 1.5) place(aCenter.xyz, vec3(0., 0., 1.), vec3(1., 0., 0.), aCenter.w, wp, wn, wt);
  vec3 q = vec3(wp.x - ${CX}, wp.y - ${CY} + lift, wp.z);
  vec3 vp = vec3(dot(row1, q), dot(row2, q), dot(row3, q));
  vp.z -= aCorner.w;
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + vp.z);
  vec2 screen = centre + size * persp * (vp.xy + aCorner.xy * aCorner.z);
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  float blink = aParam.x > 0. ? step(fract(time * aParam.x + aParam.y + sway * .0001), aParam.z) : 1.;
  float on = smoothstep(aParam.w, aParam.w + .05, power);
  vColor = aColor.rgb * aColor.a * blink * on;
  vCorner = aCorner.xy;
  gl_Position = vec4(clip.x, -clip.y, vp.z * .25, 1.);
}`;

const spriteFrag = `precision highp float;
varying vec2 vCorner;
varying vec3 vColor;
void main() {
  float r2 = dot(vCorner, vCorner);
  if (r2 > 1.) discard;
  float core = exp(-r2 * 30.);
  float halo = exp(-sqrt(r2) * 4.5) * (1. - r2);
  vec3 c = vColor * (core * 1.2 + halo * .5);
  c = c / (1. + max(c.r, max(c.g, c.b)) * .35);
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)) * .65, 0., .85));
}`;

// Engine trails as screen-space ribbons.
const trailVert = `precision highp float;
attribute vec4 aClip, aColor;
varying float vAcross;
varying vec4 vColor;
void main() {
  vAcross = aClip.w;
  vColor = aColor;
  gl_Position = vec4(aClip.xyz, 1.);
}`;
const trailFrag = `precision highp float;
varying float vAcross;
varying vec4 vColor;
void main() {
  float x = vAcross;
  float body = exp(-x * x * 3.2);
  float core = exp(-x * x * 26.);
  vec3 c = vColor.rgb * (body * .55 + core * .9) * vColor.a;
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)) * .6, 0., .8));
}`;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const SPRITE_FLOATS = 16;

function spriteData(list) {
  const data = new Float32Array(list.length * 4 * SPRITE_FLOATS);
  list.forEach((l, i) => writeSprite(data, i, l.p, l.part, l.size, l.bias, l.color, l.intensity, l.rate, l.phase, l.duty, l.threshold));
  return data;
}
function writeSprite(data, i, p, part, size, bias, color, intensity, rate = 0, phase = 0, duty = 1, threshold = 0) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < 4; k++) {
    const o = (i * 4 + k) * SPRITE_FLOATS;
    data[o] = p[0]; data[o + 1] = p[1]; data[o + 2] = p[2]; data[o + 3] = part;
    data[o + 4] = corners[k][0]; data[o + 5] = corners[k][1]; data[o + 6] = size; data[o + 7] = bias;
    data[o + 8] = color[0]; data[o + 9] = color[1]; data[o + 10] = color[2]; data[o + 11] = intensity;
    data[o + 12] = rate; data[o + 13] = phase; data[o + 14] = duty; data[o + 15] = threshold;
  }
}
function quadIndices(count) {
  const idx = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  return idx;
}

const FIRST_SEED = 0x5EED1;

export function initStarshipGlass(gl, { software, outlines, filament }) {
  if (!outlines) return null;
  const litProg = program(gl, litVert, litFrag);
  const shadowProg = program(gl, shadowVert, shadowFrag);
  const spriteProg = program(gl, spriteVert, spriteFrag);
  const trailProg = program(gl, trailVert, trailFrag);
  if (!litProg || !spriteProg || !trailProg) return null;

  const rng = rngOf(0xB7E11);
  const hull = new Mesh();
  const hullLights = [];
  outlines.forEach((o, part) => buildHalf(hull, hullLights, o, part, rng));
  // The reactor beam: a lime core and its bloom along the kerf.
  const [[fx0, fy0], [fx1, fy1]] = filament || [[.09, KERF_MID - SLOPE * .09], [.96, KERF_MID - SLOPE * .96]];
  const beamA = [fx0, fy0, 0], beamB = [fx1, fy1, 0];
  const beamSprites = [];
  for (let t = 0; t <= 1.0001; t += 1 / 18) {
    const p = [fx0 + (fx1 - fx0) * t, fy0 + (fy1 - fy0) * t, 0];
    beamSprites.push({ p, part: 2, color: [.5, 1, .18], size: .07, intensity: .2, rate: 0, phase: 0, duty: 1, threshold: .1, bias: .004 });
    if (t * 18 % 2 < .5) beamSprites.push({ p, part: 2, color: [.45, 1, .2], size: .17, intensity: .1, rate: 0, phase: 0, duty: 1, threshold: .2, bias: .06 });
  }
  const staticSprites = [...hullLights, ...beamSprites];

  const models = [lancerMesh(rng), bulwarkMesh(rng), wardenMesh(rng)];
  const hullChunks = hull.upload(gl);
  const modelChunks = models.map(m => m.mesh.upload(gl));
  const fleet = createFleet(models);

  const staticVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, staticVbo);
  gl.bufferData(gl.ARRAY_BUFFER, spriteData(staticSprites), gl.STATIC_DRAW);
  const MAX_DYN = 160;
  const dynData = new Float32Array(MAX_DYN * 4 * SPRITE_FLOATS);
  const dynVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dynVbo);
  gl.bufferData(gl.ARRAY_BUFFER, dynData.byteLength, gl.DYNAMIC_DRAW);
  const quadIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(Math.max(staticSprites.length, MAX_DYN)), gl.STATIC_DRAW);

  const MAX_TRAILS = 32;
  const trailData = new Float32Array(MAX_TRAILS * TRAIL_N * 2 * 8);
  const trailVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, trailVbo);
  gl.bufferData(gl.ARRAY_BUFFER, trailData.byteLength, gl.DYNAMIC_DRAW);
  const trailIdx = new Uint16Array(MAX_TRAILS * (TRAIL_N - 1) * 6);
  for (let t = 0; t < MAX_TRAILS; t++) {
    for (let k = 0; k < TRAIL_N - 1; k++) {
      const b = (t * TRAIL_N + k) * 2, o = (t * (TRAIL_N - 1) + k) * 6;
      trailIdx.set([b, b + 1, b + 3, b, b + 3, b + 2], o);
    }
  }
  const trailIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, trailIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, trailIdx, gl.STATIC_DRAW);

  // Shadow map from the key light, depth packed into RGBA8.
  const SHADOW = software ? 0 : 1024;
  let shadowTex = null, shadowFbo = null;
  if (SHADOW && shadowProg) {
    shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW, SHADOW, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW, SHADOW);
    shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) shadowFbo = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // Without a shadow map the sampler still needs something bound.
  if (!shadowFbo) {
    shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  const uniforms = prog => {
    const map = {};
    return name => (name in map ? map[name] : (map[name] = gl.getUniformLocation(prog, name)));
  };
  const ul = uniforms(litProg), us = shadowProg ? uniforms(shadowProg) : null, up = uniforms(spriteProg);
  const attribs = (prog, names) => names.map(n => gl.getAttribLocation(prog, n));
  const litA = attribs(litProg, ['aPos', 'aNrm', 'aUv', 'aExt']);
  const shadowA = shadowProg ? attribs(shadowProg, ['aPos', 'aNrm']) : [];
  const spriteA = attribs(spriteProg, ['aCenter', 'aCorner', 'aColor', 'aParam']);
  const trailA = attribs(trailProg, ['aClip', 'aColor']);
  const bindAttribs = locs => {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    locs.forEach((loc, k) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
    });
  };
  const bindTrail = () => {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    trailA.forEach((loc, k) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, k * 16);
    });
  };

  // Per-frame scratch space for projected trail points.
  const sp = new Float32Array(TRAIL_N * 4);
  const pts = Array.from({ length: TRAIL_N }, () => [0, 0, 0]);
  // Simulation clock, warp-in and reboot state.
  let simTime = null, powerStart = -Infinity, armed = false, armedAt = 0;
  let lastShock = [9, 9];
  fleet.reset(FIRST_SEED, 5);

  const rotY = (v, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  };
  const KEY = norm([-.66, -.74, -.12]), KICK = norm([.74, -.4, .54]), SUN = norm([.4, .3, .87]);

  function setCommon(u, p) {
    gl.uniform3fv(u('row1'), p.rows[0]);
    gl.uniform3fv(u('row2'), p.rows[1]);
    gl.uniform3fv(u('row3'), p.rows[2]);
    gl.uniform4f(u('box'), p.box[0], p.box[1], p.box[2], p.box[3]);
    gl.uniform2f(u('centre'), p.centre[0], p.centre[1]);
    gl.uniform1f(u('size'), p.size);
    gl.uniform1f(u('lift'), p.lift);
    gl.uniform1f(u('spread'), p.spread);
    gl.uniform4f(u('halfMotion'), p.halfMotion[0], p.halfMotion[1], p.halfMotion[2], p.halfMotion[3]);
  }
  function setShip(u, s) {
    gl.uniform1f(u('mode'), 1);
    gl.uniform3fv(u('shipPos'), s.pos);
    gl.uniform3fv(u('shipFwd'), s.fwd);
    gl.uniform3fv(u('shipUp'), s.up);
    gl.uniform3fv(u('shipRight'), s.right);
    gl.uniform1f(u('shipScale'), s.cls.length);
  }
  const drawChunks = (chunks, locs) => {
    for (const c of chunks) {
      gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo);
      bindAttribs(locs);
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_SHORT, 0);
    }
  };

  return {
    // The next visible frame after a glitch brings the fleet in from warp
    // and reboots the station's lights.
    arrive() {
      armed = true;
      armedAt = null;
    },
    render(params, { box, ratio }) {
      const { rows, centre, size, lift, shift, sway, pulse = 0, lightAngle = 0, time = 0, quality = 2,
        pointer = [0, 0], shocks = [[0, 0, 9, 0], [0, 0, 9, 0]], halfMotion = [0, 0, 0, 0], glow = 1, view = [1, 1] } = params;
      const effQ = software ? 0 : quality;
      const spread = Math.abs(shift[1]);
      if (armed && armedAt === null) {
        // The swap frame: the station is dark and the fleet has not arrived.
        armedAt = time;
        fleet.reset((Math.random() * 0xFFFFFF) | 0, 3);
        fleet.ships.forEach(s => { s.arrive = Infinity; });
        powerStart = Infinity;
        simTime = time;
      } else if (armed && time - armedAt > .04) {
        armed = false;
        powerStart = time;
        fleet.ships.forEach((s, i) => {
          s.arrive = time + .45 + i * .26 + Math.random() * .18;
          s.trail.forEach(t => { t.count = 0; });
        });
      }

      // Step the flight; clicks scatter nearby craft.
      const dt = simTime === null ? 0 : clamp(time - simTime, 0, .1);
      simTime = time;
      const events = [];
      shocks.forEach((s, k) => {
        if (s[3] > 0 && s[2] < lastShock[k] && s[2] < .2) events.push({ at: [s[0], s[1], .2], reach: .42 });
        lastShock[k] = s[2];
      });
      if (dt > 0) {
        const n = Math.ceil(dt / (1 / 90));
        for (let k = 0; k < n; k++) fleet.step(dt / n, k ? [] : events);
      }
      for (const s of fleet.ships) {
        if (s.arrive > 0 && s.arrive !== Infinity && time >= s.arrive) {
          s.arrive = -1;
          s.flash = 1;
        }
        s.flash = Math.max(0, s.flash - dt * 2.4);
      }
      const power = powerStart === -Infinity ? 1 : powerStart === Infinity ? .06 : clamp((time - powerStart) / 1.9, 0, 1);

      // Lights in view space; the wheel swings the key and kicker round.
      const key = rotY(KEY, lightAngle), kick = rotY(KICK, lightAngle * .6), sun = SUN;
      const toObj = v => [
        v[0] * rows[0][0] + v[1] * rows[1][0] + v[2] * rows[2][0],
        v[0] * rows[0][1] + v[1] * rows[1][1] + v[2] * rows[2][1],
        v[0] * rows[0][2] + v[1] * rows[1][2] + v[2] * rows[2][2],
      ];
      const w = toObj(key).map(v => -v);
      const lu = norm(cross(w, Math.abs(w[1]) < .95 ? [0, 1, 0] : [1, 0, 0]));
      const lv = cross(w, lu);
      const common = { rows, box, centre, size, lift, spread, halfMotion };
      const visible = fleet.ships.filter(s => s.arrive <= 0);

      // Pass 1: shadow depth from the key light.
      const useShadow = Boolean(shadowFbo) && effQ >= 1;
      if (useShadow) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
        gl.viewport(0, 0, SHADOW, SHADOW);
        gl.clearColor(1, 1, 1, 1);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.useProgram(shadowProg);
        gl.uniform3fv(us('lightU'), lu);
        gl.uniform3fv(us('lightV'), lv);
        gl.uniform3fv(us('lightW'), w);
        gl.uniform1f(us('spread'), spread);
        gl.uniform4f(us('halfMotion'), halfMotion[0], halfMotion[1], halfMotion[2], halfMotion[3]);
        gl.uniform1f(us('mode'), 0);
        drawChunks(hullChunks, shadowA);
        for (const s of visible) {
          setShip(us, s);
          drawChunks(modelChunks[s.cls.hull], shadowA);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }

      // Pass 2: the lit hull and fleet.
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(litProg);
      setCommon(ul, common);
      gl.uniform3fv(ul('lightU'), lu);
      gl.uniform3fv(ul('lightV'), lv);
      gl.uniform3fv(ul('lightW'), w);
      gl.uniform3fv(ul('keyV'), key);
      gl.uniform3fv(ul('sunV'), sun);
      gl.uniform3fv(ul('kickV'), kick);
      gl.uniform3f(ul('keyCol'), 1.85, 1.95, 2.2);
      gl.uniform3f(ul('sunCol'), 4.4, 2.5, 1.12);
      gl.uniform3f(ul('kickCol'), .38, 1.0, 1.5);
      gl.uniform3fv(ul('kerfA'), beamA);
      gl.uniform3fv(ul('kerfB'), beamB);
      gl.uniform1f(ul('time'), time);
      gl.uniform1f(ul('pixel'), 1 / (size * ratio));
      gl.uniform1f(ul('power'), power);
      gl.uniform1f(ul('pulse'), pulse);
      gl.uniform1f(ul('quality'), effQ);
      gl.uniform1f(ul('glow'), Math.min(1.6, glow));
      gl.uniform1f(ul('shadowOn'), useShadow ? 1 : 0);
      gl.uniform1f(ul('shadowTexel'), 1 / (SHADOW || 1));
      gl.uniform4fv(ul('shockA'), shocks[0]);
      gl.uniform4fv(ul('shockB'), shocks[1]);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(ul('shadowMap'), 3);
      gl.uniform1f(ul('mode'), 0);
      gl.uniform1f(ul('boost'), 0);
      gl.uniform3f(ul('engineCol'), 1, .5, .2);
      drawChunks(hullChunks, litA);
      for (const s of visible) {
        setShip(ul, s);
        gl.uniform1f(ul('boost'), s.boost);
        gl.uniform3fv(ul('engineCol'), s.cls.col);
        drawChunks(modelChunks[s.cls.hull], litA);
      }

      // Pass 3: engine trails, warp streaks and light sprites, additive over
      // the scene but hidden behind the hull.
      const project = (p, out, o) => {
        const qx = p[0] - CX, qy = p[1] - CY + lift, qz = p[2];
        const vx = rows[0][0] * qx + rows[0][1] * qy + rows[0][2] * qz;
        const vy = rows[1][0] * qx + rows[1][1] * qy + rows[1][2] * qz;
        const vz = rows[2][0] * qx + rows[2][1] * qy + rows[2][2] * qz;
        const k = D_CAM / (D_CAM + vz);
        out[o] = centre[0] + size * vx * k;
        out[o + 1] = centre[1] + size * vy * k;
        out[o + 2] = vz * .25;
        out[o + 3] = k;
      };
      let trails = 0;
      const ribbon = (points, count, width, color, fade, even = false) => {
        if (count < 2 || trails >= MAX_TRAILS) return;
        for (let k = 0; k < count; k++) project(points[k], sp, k * 4);
        const base = trails * TRAIL_N * 2 * 8;
        for (let k = 0; k < TRAIL_N; k++) {
          const kk = Math.min(k, count - 1);
          const a = Math.max(0, kk - 1), b = Math.min(count - 1, kk + 1);
          let dx = sp[a * 4] - sp[b * 4], dy = sp[a * 4 + 1] - sp[b * 4 + 1];
          const l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;
          const t = kk / Math.max(1, count - 1);
          const wpx = width * size * sp[kk * 4 + 3] * (even ? 1 : Math.pow(1 - t, .6)) + .45;
          const alpha = k < count ? fade(t) : 0;
          for (const side of [-1, 1]) {
            const o = base + (k * 2 + (side > 0 ? 1 : 0)) * 8;
            const sx = sp[kk * 4] - dy * wpx * side, sy = sp[kk * 4 + 1] + dx * wpx * side;
            trailData[o] = (sx - box[0]) / box[2] * 2 - 1;
            trailData[o + 1] = -((sy - box[1]) / box[3] * 2 - 1);
            trailData[o + 2] = sp[kk * 4 + 2];
            trailData[o + 3] = side;
            trailData[o + 4] = color[0]; trailData[o + 5] = color[1]; trailData[o + 6] = color[2];
            trailData[o + 7] = alpha;
          }
        }
        trails++;
      };
      let dyn = 0;
      const pushSprite = (p, sizeU, bias, color, intensity, rate = 0, phase = 0, duty = 1) => {
        if (dyn >= MAX_DYN) return;
        writeSprite(dynData, dyn++, p, 2, sizeU, bias, color, intensity, rate, phase, duty, 0);
      };
      for (const s of fleet.ships) {
        const model = s.model, L = s.cls.length;
        if (s.arrive > 0) {
          // Dropping out of warp: a streak collapsing onto the arrival point.
          const lead = s.arrive - time;
          if (lead < .32 && lead > 0) {
            const k = 1 - lead / .32;
            const reach = 1.6 * (1 - k) * (1 - k) + .05;
            for (let j = 0; j < 10; j++) pts[j] = mad(s.pos, s.fwd, -reach * j / 9);
            ribbon(pts, 10, .006 + .014 * k, [.62, .84, 1], t => (1 - t) * (.8 + 1.6 * k), true);
          }
          continue;
        }
        model.engines.forEach((en, k) => {
          const tr = s.trail[k];
          const head = fleet.enginePoint(s, en.p);
          pts[0] = head;
          let count = 1;
          for (let j = 0; j < tr.count && count < TRAIL_N; j++) {
            const idx = ((tr.head - j) % TRAIL_N + TRAIL_N) % TRAIL_N;
            pts[count++] = [tr.pts[idx * 3], tr.pts[idx * 3 + 1], tr.pts[idx * 3 + 2]];
          }
          const hot = .55 + s.boost * .9;
          ribbon(pts, count, en.r * L * .95, s.cls.col, t => Math.pow(1 - t, 1.5) * hot);
          pushSprite(head, L * (.11 + .09 * s.boost) * (en.r / .05), .01, s.cls.col, 1.5 + s.boost * 1.8);
          pushSprite(head, L * .035 * (en.r / .05), .012, [1, .96, .9], 1.6 + s.boost);
        });
        for (const nav of model.nav || []) {
          const p = fleet.enginePoint(s, nav.p);
          if (nav.strobe) pushSprite(p, .016, .006, nav.c, 2.2, 1.1, s.tint * 3, .07);
          else pushSprite(p, .011, .006, nav.c, 1.2, .55, s.tint * 5, .5);
        }
        if (s.flash > 0) {
          pushSprite(s.pos, Math.min(.2, L * (1.1 + 2.6 * (1 - s.flash))), .02, [.7, .88, 1], 2.4 * s.flash);
        }
      }

      // The reactor beam: a continuous lime core with pulses running along it.
      const beamN = 26;
      for (let j = 0; j < beamN; j++) {
        const t = j / (beamN - 1);
        pts[j] = [beamA[0] + (beamB[0] - beamA[0]) * t, beamA[1] + (beamB[1] - beamA[1]) * t, 0];
      }
      const beamGlow = power * Math.min(1.6, glow);
      ribbon(pts, beamN, .009, [.55, 1, .2], t => {
        const run = (t * 1.6 - time * .55) % 1;
        const ph = (run + 1) % 1 - .5;
        const pulseK = Math.exp(-ph * ph / .006);
        const ends = Math.min(1, t * 14, (1 - t) * 14);
        return (1.1 + 1.8 * pulseK) * ends * beamGlow * (1 + .6 * pulse);
      }, true);

      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (trails) {
        gl.useProgram(trailProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, trailVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, trailData.subarray(0, trails * TRAIL_N * 2 * 8));
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, trailIbo);
        bindTrail();
        gl.drawElements(gl.TRIANGLES, trails * (TRAIL_N - 1) * 6, gl.UNSIGNED_SHORT, 0);
      }
      gl.useProgram(spriteProg);
      setCommon(up, common);
      gl.uniform1f(up('time'), time);
      gl.uniform1f(up('power'), power);
      gl.uniform1f(up('sway'), sway);
      gl.uniform1f(up('mode'), 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIbo);
      gl.bindBuffer(gl.ARRAY_BUFFER, staticVbo);
      bindAttribs(spriteA);
      gl.drawElements(gl.TRIANGLES, staticSprites.length * 6, gl.UNSIGNED_SHORT, 0);
      if (dyn) {
        gl.bindBuffer(gl.ARRAY_BUFFER, dynVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, dynData.subarray(0, dyn * 4 * SPRITE_FLOATS));
        bindAttribs(spriteA);
        gl.drawElements(gl.TRIANGLES, dyn * 6, gl.UNSIGNED_SHORT, 0);
      }
      gl.depthMask(true);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      return true;
    },
  };
}
