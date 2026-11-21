// Variant 3: Architectural Terrazzo & Emerald Louver B.
//
// Inspired by kinetic brutalist mineral-stone & concentric louver sculpture:
//   - Outer thick-walled speckled white architectural terrazzo monolith shell
//     with interlocking cantilevered stepped corner overhangs and crisp 45-deg
//     mineral chamfers.
//   - Deeply carved architectural chambers inside both halves of the B, filled
//     with tightly nested concentric emerald-to-mint terraced louver fins that
//     descend into rich forest shadow while gleaming turquoise-mint on their
//     leading crests.
//   - Signature prismatic folded accordion V-pinch at the sculpted waist where
//     opposing mint-cyan fan louvers meet beneath the cantilevered stone lip.
//   - Side barrels combining deep longitudinal emerald louver bays with
//     anodized micro-perforated periwinkle-cobalt architectural panels.
//   - Real-time 1024^2 RGBA-packed PCF shadow map so the cantilevered terrazzo
//     overhangs and every concentric fin cast crisp architectural self-shadows,
//     paired with fake-GI emerald cavity radiosity and violet-periwinkle floor
//     and gallery bounce lighting.
//   - Living kinetic motion: concentric fins breathe in a smooth travelling
//     architectural wave, and clicks send a tactile mechanical ripple outward
//     through every fin.
import { program } from './gl/gl.js';

const SLOPE = .27875;
const NORM = 1 / Math.hypot(SLOPE, 1);
const D_CAM = 10.5;
const CX = .56, CY = .845;
const FRONT = .2805, BACK = -.272, CHAMFER = .014;
const CUTS = [.9125, 1.0475];
const KERF_MID = (CUTS[0] + CUTS[1]) / 2;
const SHADOW_EXTENT = 1.28;
const STRIDE = 16;
// The lacquered floor plane the monolith floats above (plate units).
const FLOOR_Y = 1.83;

// Material IDs encoded into aUv.z:
//   0 = Speckled white architectural terrazzo shell
//   1 = Concentric emerald-to-mint louver fin body/wall
//   2 = Louver fin leading crest / mint-cyan chamfer lip
//   3 = Prismatic folded accordion V-pinch louver
//   4 = Micro-perforated periwinkle-cobalt side panel
//   5 = Diagonal kerf emerald-lime louver & luminous channel
//   6 = Deep cavity emerald-shadow core backing
const M = { TERRAZZO: 0, FIN: 1, CREST: 2, PINCH: 3, PERF: 4, KERF: 5, CORE: 6 };

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function tRule(n) {
  if (Math.abs(n[2]) > .7) return norm3([1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]);
  return norm3([-n[1], n[0], 0]);
}
function uvOf(p, n) {
  const t = tRule(n), b = cross3(n, t);
  return [dot3(p, t), dot3(p, b)];
}

// ---------------------------------------------------------------------------
// Chunked Uint16 Mesh Builder (16 floats/vertex)
//   aPos  x y z part
//   aNrm  nx ny nz ao
//   aUv   u v kind seed
//   aExt  depthT kineticPhase cavityBounce extra
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
    c.data.push(
      p[0], p[1], p[2], m.part || 0,
      n[0], n[1], n[2], ao,
      uv[0], uv[1], m.kind, m.seed || 0,
      m.depthT || 0, m.phase ?? -1, m.bounce || 0, m.extra || 0
    );
    return c.count++;
  }
  tri(a, b, c, n, m, aos = null, uvs = null) {
    this.reserve(3);
    const base = this.cur.count;
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      this.vert(pts[i], n, uvs ? uvs[i] : uvOf(pts[i], n), m, aos ? aos[i] : 1);
    }
    this.cur.idx.push(base, base + 1, base + 2);
  }
  poly(points, n, m, aos = null, uvs = null) {
    if (points.length < 3) return;
    this.reserve(points.length);
    const base = this.cur.count;
    points.forEach((p, i) => this.vert(p, n, uvs ? uvs[i] : uvOf(p, n), m, aos ? aos[i] : 1));
    for (let i = 1; i < points.length - 1; i++) this.cur.idx.push(base, base + i, base + i + 1);
  }
  quadN(points, normals, m, aos = null, uvs = null) {
    this.reserve(4);
    const base = this.cur.count;
    points.forEach((p, i) => this.vert(p, normals[i], uvs ? uvs[i] : uvOf(p, normals[i]), m, aos ? aos[i] : 1));
    this.cur.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

// ---------------------------------------------------------------------------
// 2D Convex Polygon Helpers (exact half-plane clipping & exact inward inset)
// ---------------------------------------------------------------------------
function polyAreaSigned(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * .5;
}
function polyCentroid(poly) {
  let sx = 0, sy = 0, sa = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const c = p[0] * q[1] - q[0] * p[1];
    sa += c;
    sx += (p[0] + q[0]) * c;
    sy += (p[1] + q[1]) * c;
  }
  if (Math.abs(sa) < 1e-9) {
    const m = poly.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [m[0] / Math.max(1, poly.length), m[1] / Math.max(1, poly.length)];
  }
  return [sx / (3 * sa), sy / (3 * sa)];
}

// Ensure polygon has positive signed area in screen-Y-down space, meaning
// outward edge normal is (dy, -dx) normalized!
function cleanPoly(raw, minStep = .012) {
  const dedup = [];
  for (const p of raw) {
    const q = dedup[dedup.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) dedup.push([p[0], p[1]]);
  }
  if (dedup.length > 1 && Math.hypot(dedup[0][0] - dedup.at(-1)[0], dedup[0][1] - dedup.at(-1)[1]) < 1e-5) dedup.pop();
  if (dedup.length < 3) return [];
  // Keep polygon clean and gently decimated along tiny arc segments for fast exact clipping.
  const out = [];
  for (let i = 0; i < dedup.length; i++) {
    const prev = out[out.length - 1];
    const cur = dedup[i];
    const next = dedup[(i + 1) % dedup.length];
    if (!prev) { out.push(cur); continue; }
    const d1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const d2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    if (d1 < minStep && d2 < .06) {
      // Keep sharp corners even if short.
      const ax = (cur[0] - prev[0]) / (d1 || 1), ay = (cur[1] - prev[1]) / (d1 || 1);
      const bx = (next[0] - cur[0]) / (d2 || 1), by = (next[1] - cur[1]) / (d2 || 1);
      if (ax * bx + ay * by > .996) continue;
    }
    out.push(cur);
  }
  if (out.length < 3) return [];
  // Outward normal is (dy, -dx) when signed area > 0.
  if (polyAreaSigned(out) < 0) out.reverse();
  return out;
}

// Keep points satisfying nx*x + ny*y <= c.
function clipHalfPlane(poly, nx, ny, c) {
  if (poly.length < 3) return [];
  const out = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = a[0] * nx + a[1] * ny - c;
    const db = b[0] * nx + b[1] * ny - c;
    if (da <= 1e-7) out.push(a);
    if ((da < -1e-7 && db > 1e-7) || (da > 1e-7 && db < -1e-7)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  // Remove micro-duplicates introduced by clipping.
  const res = [];
  for (const p of out) {
    const q = res[res.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) res.push(p);
  }
  if (res.length > 1 && Math.hypot(res[0][0] - res.at(-1)[0], res[0][1] - res.at(-1)[1]) < 1e-5) res.pop();
  return res.length >= 3 ? res : [];
}

// Exact mathematically valid inward offset of any convex polygon!
// Guarantees zero self-intersections and graceful corner collapse at any depth.
function insetConvex(poly, d) {
  if (poly.length < 3) return [];
  let cur = poly.map(p => [p[0], p[1]]);
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-7) continue;
    const nx = dy / l, ny = -dx / l;
    const c = a[0] * nx + a[1] * ny - d;
    cur = clipHalfPlane(cur, nx, ny, c);
    if (cur.length < 3) return [];
  }
  return Math.abs(polyAreaSigned(cur)) > 1e-6 ? cur : [];
}

function analysePoly(pts, part) {
  const n = pts.length;
  const cut = CUTS[part];
  const onCut = p => Math.abs(p[1] + SLOPE * p[0] - cut) < 3e-3;
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-6;
    const d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    return { a: p, b: q, d, n: [d[1], -d[0]], l, cut: onCut(p) && onCut(q) };
  });
  const verts = pts.map((p, i) => {
    const e0 = edges[(i - 1 + n) % n], e1 = edges[i];
    const c = e0.n[0] * e1.n[0] + e0.n[1] * e1.n[1];
    const sharp = c < Math.cos(.42) || e0.cut !== e1.cut;
    const avg = [e0.n[0] + e1.n[0], e0.n[1] + e1.n[1]];
    const al = Math.hypot(avg[0], avg[1]) || 1;
    return { p, sharp, smooth: [avg[0] / al, avg[1] / al] };
  });
  return { edges, verts };
}

// Triangulate a convex annulus (outerP \ innerQ) around innerQ's centroid with
// guaranteed non-overlapping positive-normal triangles on plane z.
function addAnnulus(mesh, outerP, innerQ, z, normalZ, m, aoOuter = 1, aoInner = 1) {
  if (outerP.length < 3 || innerQ.length < 3) return;
  const C = polyCentroid(innerQ);
  const angleOf = p => Math.atan2(p[1] - C[1], p[0] - C[0]);
  const prepRing = ring => {
    // Ensure CCW increasing angle in (x, y) around C.
    const arr = ring.map(p => ({ p, a: angleOf(p) }));
    // Find minimum angle index to start cleanly.
    let minI = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i].a < arr[minI].a) minI = i;
    const rot = [];
    for (let k = 0; k < arr.length; k++) rot.push(arr[(minI + k) % arr.length]);
    // Verify monotonic direction; if decreasing, reverse.
    let dir = 0;
    for (let k = 0; k < rot.length; k++) {
      let da = rot[(k + 1) % rot.length].a - rot[k].a;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      dir += da;
    }
    if (dir < 0) rot.reverse();
    // Unwrap angles monotonically starting from rot[0].a.
    const out = [{ p: rot[0].p, a: rot[0].a }];
    for (let k = 1; k < rot.length; k++) {
      let a = rot[k].a;
      while (a < out[k - 1].a - 1e-6) a += Math.PI * 2;
      out.push({ p: rot[k].p, a });
    }
    return out;
  };
  const P = prepRing(outerP);
  const Q = prepRing(innerQ);
  const nP = P.length, nQ = Q.length;
  // Align Q's start angle closest to P[0].a.
  let bestJ = 0, bestDiff = Infinity;
  for (let j = 0; j < nQ; j++) {
    let diff = Math.abs(Q[j].a - P[0].a);
    diff = Math.min(diff, Math.abs(diff - Math.PI * 2));
    if (diff < bestDiff) { bestDiff = diff; bestJ = j; }
  }
  const Q2 = [];
  for (let k = 0; k < nQ; k++) {
    const src = Q[(bestJ + k) % nQ];
    let a = src.a;
    if (k === 0) {
      while (a > P[0].a + Math.PI) a -= Math.PI * 2;
      while (a < P[0].a - Math.PI) a += Math.PI * 2;
    } else {
      while (a < Q2[k - 1].a - 1e-6) a += Math.PI * 2;
    }
    Q2.push({ p: src.p, a });
  }
  const nrm = [0, 0, normalZ];
  const emitTri = (pa, pb, pc, aa, ab, ac) => {
    const area2 = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    if (Math.abs(area2) < 1e-8) return;
    const A = [pa[0], pa[1], z], B = [pb[0], pb[1], z], D = [pc[0], pc[1], z];
    if ((area2 > 0) === (normalZ > 0)) mesh.tri(A, B, D, nrm, m, [aa, ab, ac]);
    else mesh.tri(A, D, B, nrm, m, [aa, ac, ab]);
  };
  let i = 0, j = 0;
  const pAt = idx => (idx < nP ? P[idx] : { p: P[0].p, a: P[0].a + Math.PI * 2 });
  const qAt = idx => (idx < nQ ? Q2[idx] : { p: Q2[0].p, a: Q2[0].a + Math.PI * 2 });
  while (i < nP || j < nQ) {
    const pCur = pAt(i), qCur = qAt(j);
    const pNext = pAt(i + 1), qNext = qAt(j + 1);
    const advanceP = i < nP && (j >= nQ || pNext.a <= qNext.a);
    if (advanceP) {
      emitTri(pCur.p, pNext.p, qCur.p, aoOuter, aoOuter, aoInner);
      i++;
    } else {
      emitTri(pCur.p, qNext.p, qCur.p, aoOuter, aoInner, aoInner);
      j++;
    }
  }
}

// Extrude a vertical ribbon wall around a closed polygon (outward = +1 or inward = -1).
function addWallRibbon(mesh, poly, z0, z1, outward, m, ao0 = .45, ao1 = 1) {
  const n = poly.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const nx = (b[1] - a[1]) / l * outward;
    const ny = -(b[0] - a[0]) / l * outward;
    const nrm = [nx, ny, 0];
    const pts = outward > 0
      ? [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]
      : [[b[0], b[1], z0], [a[0], a[1], z0], [a[0], a[1], z1], [b[0], b[1], z1]];
    mesh.poly(pts, nrm, m, [ao0, ao0, ao1, ao1], [[s, z0], [s + l, z0], [s + l, z1], [s, z1]]);
    s += l;
  }
}

// Add a beveled solid architectural prism from a convex polygon between z0 and z1.
function addBeveledBlock(mesh, poly, z0, z1, bev, m, aoBase = .48) {
  const topPoly = insetConvex(poly, bev);
  if (topPoly.length < 3) {
    mesh.poly(poly.map(p => [p[0], p[1], z1]), [0, 0, 1], m);
    addWallRibbon(mesh, poly, z0, z1, 1, m, aoBase, 1);
    return;
  }
  const zb = z1 - bev;
  // Front flat face
  mesh.poly(topPoly.map(p => [p[0], p[1], z1]), [0, 0, 1], m);
  // Crisp vertical sides
  addWallRibbon(mesh, poly, z0, zb, 1, m, aoBase, .96);
  // Crisp 45-degree chamfer bevel ring between poly@zb and topPoly@z1
  const C = polyCentroid(topPoly);
  const angleOf = p => Math.atan2(p[1] - C[1], p[0] - C[0]);
  const prep = ring => {
    const arr = ring.map(p => ({ p, a: angleOf(p) }));
    let minI = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i].a < arr[minI].a) minI = i;
    const rot = [];
    for (let k = 0; k < arr.length; k++) rot.push(arr[(minI + k) % arr.length]);
    let dir = 0;
    for (let k = 0; k < rot.length; k++) {
      let da = rot[(k + 1) % rot.length].a - rot[k].a;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      dir += da;
    }
    if (dir < 0) rot.reverse();
    const out = [{ p: rot[0].p, a: rot[0].a }];
    for (let k = 1; k < rot.length; k++) {
      let a = rot[k].a;
      while (a < out[k - 1].a - 1e-6) a += Math.PI * 2;
      out.push({ p: rot[k].p, a });
    }
    return out;
  };
  const P = prep(poly), Q = prep(topPoly);
  const nP = P.length, nQ = Q.length;
  let bestJ = 0, bestDiff = Infinity;
  for (let j = 0; j < nQ; j++) {
    let diff = Math.abs(Q[j].a - P[0].a);
    diff = Math.min(diff, Math.abs(diff - Math.PI * 2));
    if (diff < bestDiff) { bestDiff = diff; bestJ = j; }
  }
  const Q2 = [];
  for (let k = 0; k < nQ; k++) {
    const src = Q[(bestJ + k) % nQ];
    let a = src.a;
    if (k === 0) {
      while (a > P[0].a + Math.PI) a -= Math.PI * 2;
      while (a < P[0].a - Math.PI) a += Math.PI * 2;
    } else {
      while (a < Q2[k - 1].a - 1e-6) a += Math.PI * 2;
    }
    Q2.push({ p: src.p, a });
  }
  let i = 0, j = 0;
  const pAt = idx => (idx < nP ? P[idx] : { p: P[0].p, a: P[0].a + Math.PI * 2 });
  const qAt = idx => (idx < nQ ? Q2[idx] : { p: Q2[0].p, a: Q2[0].a + Math.PI * 2 });
  while (i < nP || j < nQ) {
    const p0 = pAt(i), q0 = qAt(j), p1 = pAt(i + 1), q1 = qAt(j + 1);
    if (i < nP && (j >= nQ || p1.a <= q1.a)) {
      const A = [p0.p[0], p0.p[1], zb], B = [p1.p[0], p1.p[1], zb], D = [q0.p[0], q0.p[1], z1];
      const nrm = norm3(cross3([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [D[0] - A[0], D[1] - A[1], D[2] - A[2]]));
      if (nrm[2] < 0) mesh.tri(A, D, B, [-nrm[0], -nrm[1], -nrm[2]], m, [.94, 1, .94]);
      else mesh.tri(A, B, D, nrm, m, [.94, .94, 1]);
      i++;
    } else {
      const A = [p0.p[0], p0.p[1], zb], B = [q1.p[0], q1.p[1], z1], D = [q0.p[0], q0.p[1], z1];
      const nrm = norm3(cross3([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [D[0] - A[0], D[1] - A[1], D[2] - A[2]]));
      if (nrm[2] < 0) mesh.tri(A, D, B, [-nrm[0], -nrm[1], -nrm[2]], m, [.94, 1, 1]);
      else mesh.tri(A, B, D, nrm, m, [.94, 1, 1]);
      j++;
    }
  }
}

// ---------------------------------------------------------------------------
// Concentric Emerald-to-Mint Terraced Louver Canyon Generator
// Builds 12-18 tightly nested concentric beveled emerald fins inside any
// convex carved chamber, stepping progressively deeper into the canyon!
// ---------------------------------------------------------------------------
function addConcentricLouvers(mesh, chamberPoly, part, opts = {}) {
  const {
    maxFins = 18,
    finStep = .0162,
    finThick = .0076,
    zStart = FRONT - .016,
    zDrop = .0145,
    zFloor = FRONT - .35,
    seedBase = 0,
  } = opts;
  if (chamberPoly.length < 3 || Math.abs(polyAreaSigned(chamberPoly)) < .002) return;

  // Inner chamber surrounding speckled-terrazzo walls plunging straight back.
  const wallM = { kind: M.TERRAZZO, part, seed: .31 + seedBase, depthT: 0, phase: -1, bounce: .88, extra: 0 };
  addWallRibbon(mesh, chamberPoly, zFloor, FRONT - CHAMFER * .5, -1, wallM, .32, .96);

  // Dark emerald backing plate at the very bottom of the carved recess.
  const backM = { kind: M.CORE, part, seed: .77 + seedBase, depthT: 1, phase: -1, bounce: .55, extra: 0 };
  mesh.poly(chamberPoly.map(p => [p[0], p[1], zFloor]), [0, 0, 1], backM, chamberPoly.map(() => .22));

  let lastValid = chamberPoly;
  for (let k = 0; k < maxFins; k++) {
    const dOut = .005 + k * finStep;
    const outer = insetConvex(chamberPoly, dOut);
    if (outer.length < 3 || Math.abs(polyAreaSigned(outer)) < .00028) break;

    const t = k / Math.max(1, maxFins - 1);
    const zCrest = Math.max(zFloor + .022, zStart - k * zDrop);
    const zBack = Math.max(zFloor, zCrest - .115);
    const inner = insetConvex(chamberPoly, dOut + finThick);

    const crestM = { kind: M.CREST, part, seed: (k * .137 + seedBase) % 1, depthT: t, phase: t, bounce: 1 - t * .32, extra: k };
    const finM = { kind: M.FIN, part, seed: (k * .137 + seedBase) % 1, depthT: t, phase: t, bounce: .82 - t * .25, extra: k };
    const aoTop = 1 - t * .30;
    const aoDeep = Math.max(.08, .26 - t * .15);

    // Outer face & inner face of this concentric louver blade.
    addWallRibbon(mesh, outer, zBack, zCrest, 1, finM, aoDeep, aoTop);
    if (inner.length >= 3 && Math.abs(polyAreaSigned(inner)) > .00018) {
      addWallRibbon(mesh, inner, zBack, zCrest, -1, finM, aoDeep, aoTop);
      // Crisp bright emerald-mint leading crest ring!
      addAnnulus(mesh, outer, inner, zCrest, 1, crestM, aoTop, aoTop * .94);
      lastValid = inner;
    } else {
      // Deepest innermost heart fin: solid terraced jewel emerald core cap!
      mesh.poly(outer.map(p => [p[0], p[1], zCrest]), [0, 0, 1], crestM, outer.map(() => aoTop * .85));
      lastValid = null;
      break;
    }
  }
  // If we stopped at maxFins with an inner hole left, cap its core with a recessed dark emerald floor plate.
  if (lastValid && lastValid.length >= 3) {
    const zCap = Math.max(zFloor + .018, zStart - maxFins * zDrop);
    const capM = { kind: M.CORE, part, seed: .91 + seedBase, depthT: 1, phase: 1, bounce: .45, extra: maxFins };
    mesh.poly(lastValid.map(p => [p[0], p[1], zCap]), [0, 0, 1], capM, lastValid.map(() => .28));
  }
}

// ---------------------------------------------------------------------------
// Signature Image-1 Prismatic Accordion V-Pinch Louvers!
// Builds crisp, razor-thin, deeply shadowed pleated emerald-to-aqua origami
// louver steps recessed cleanly inside the cantilevered cutout notch!
// ---------------------------------------------------------------------------
function addAccordionPinch(mesh, part, apex, cornerA, cornerB, zFront, zDeep, count = 16) {
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const z0 = zFront - t * (zFront - zDeep);
    const zStep = (zFront - zDeep) / Math.max(1, count - 1);
    const bladeThick = zStep * .46;
    // Recessed stepped pleats fanning from outer opening into the deep pinched vertex!
    const pull = t * .76;
    const pA = [cornerA[0] + (apex[0] - cornerA[0]) * pull, cornerA[1] + (apex[1] - cornerA[1]) * pull];
    const pB = [cornerB[0] + (apex[0] - cornerB[0]) * pull, cornerB[1] + (apex[1] - cornerB[1]) * pull];
    const pA2 = [cornerA[0] + (apex[0] - cornerA[0]) * Math.min(.94, pull + .065), cornerA[1] + (apex[1] - cornerA[1]) * Math.min(.94, pull + .065)];
    const pB2 = [cornerB[0] + (apex[0] - cornerB[0]) * Math.min(.94, pull + .065), cornerB[1] + (apex[1] - cornerB[1]) * Math.min(.94, pull + .065)];
    const mCrest = { kind: M.PINCH, part, seed: .2 + t * .6, depthT: t, phase: t, bounce: 1, extra: 1 };
    const mRiser = { kind: M.PINCH, part, seed: .2 + t * .6, depthT: Math.min(1, t + .28), phase: t, bounce: .85, extra: 0 };
    const aoTop = 1 - t * .38;
    const aoDeep = Math.max(.12, .36 - t * .22);

    // Narrow pleated strip along the leading fan contour (leaving deep dark shadow slots between blades!)
    const A = [pA[0], pA[1], z0], B = [pB[0], pB[1], z0];
    const C = [pB2[0], pB2[1], z0 - bladeThick * .6], D = [pA2[0], pA2[1], z0 - bladeThick * .6];
    const nrm = norm3(cross3([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [D[0] - A[0], D[1] - A[1], D[2] - A[2]]));
    const fn = nrm[2] < 0 ? [-nrm[0], -nrm[1], -nrm[2]] : nrm;
    if (nrm[2] < 0) mesh.poly([A, D, C, B], fn, mCrest, [aoTop, aoTop * .72, aoTop * .72, aoTop]);
    else mesh.poly([A, B, C, D], fn, mCrest, [aoTop, aoTop, aoTop * .72, aoTop * .72]);

    // Deep dark emerald riser edge plunging back behind each pleat!
    const eN = norm3([pB[1] - pA[1], -(pB[0] - pA[0]), .18]);
    mesh.poly([[pA[0], pA[1], z0 - bladeThick * 1.4], [pB[0], pB[1], z0 - bladeThick * 1.4], [pB[0], pB[1], z0], [pA[0], pA[1], z0]],
      eN, mRiser, [aoDeep, aoDeep, aoTop * .92, aoTop * .92]);
  }
}

// ---------------------------------------------------------------------------
// Outer Side Walls: Terrazzo Structural Frames + Recessed Longitudinal Emerald
// Louver Bays + Micro-Perforated Periwinkle-Cobalt Architectural Panels!
// ---------------------------------------------------------------------------
function buildSideWalls(mesh, pts, edges, verts, part) {
  const n = pts.length;
  const zf0 = FRONT - CHAMFER, zb0 = BACK + CHAMFER;
  const zBay0 = -.165, zBay1 = .175;
  const vn = (i, e) => (verts[i].sharp ? e.n : verts[i].smooth);
  const terraM = { kind: M.TERRAZZO, part, seed: .18 + part * .2, depthT: 0, phase: -1, bounce: .22, extra: 0 };
  const perfM = { kind: M.PERF, part, seed: .52 + part * .17, depthT: 0, phase: -1, bounce: .15, extra: 1 };
  const kerfM = { kind: M.KERF, part, seed: .63 + part * .11, depthT: 0, phase: -1, bounce: 1, extra: 0 };

  let s = 0;
  const totalLen = edges.reduce((acc, e) => acc + e.l, 0);
  edges.forEach((e, i) => {
    const j = (i + 1) % n;
    const na = vn(i, e), nb = vn(j, e);
    const n3a = [na[0], na[1], 0], n3b = [nb[0], nb[1], 0];
    const s0 = s, s1 = s + e.l;
    s = s1;

    if (e.cut) {
      // Diagonal kerf wall: crisp terrazzo lips + 7 recessed emerald-lime louvers!
      const lipW = .065;
      // Front & back terrazzo lips along the cut
      mesh.quadN([[e.a[0], e.a[1], zb0], [e.b[0], e.b[1], zb0], [e.b[0], e.b[1], zb0 + lipW], [e.a[0], e.a[1], zb0 + lipW]],
        [n3a, n3b, n3b, n3a], terraM, [.85, .85, .95, .95], [[s0, zb0], [s1, zb0], [s1, zb0 + lipW], [s0, zb0 + lipW]]);
      mesh.quadN([[e.a[0], e.a[1], zf0 - lipW], [e.b[0], e.b[1], zf0 - lipW], [e.b[0], e.b[1], zf0], [e.a[0], e.a[1], zf0]],
        [n3a, n3b, n3b, n3a], terraM, [.95, .95, 1, 1], [[s0, zf0 - lipW], [s1, zf0 - lipW], [s1, zf0], [s0, zf0]]);
      // Recessed glowing emerald-lime louver bay inside the kerf!
      const rec = .034;
      const ra = [e.a[0] - e.n[0] * rec, e.a[1] - e.n[1] * rec];
      const rb = [e.b[0] - e.n[0] * rec, e.b[1] - e.n[1] * rec];
      mesh.quadN([[ra[0], ra[1], zb0 + lipW], [rb[0], rb[1], zb0 + lipW], [rb[0], rb[1], zf0 - lipW], [ra[0], ra[1], zf0 - lipW]],
        [n3a, n3b, n3b, n3a], kerfM, [.35, .35, .45, .45], [[s0, zb0 + lipW], [s1, zb0 + lipW], [s1, zf0 - lipW], [s0, zf0 - lipW]]);
      // 7 parallel longitudinal emerald-mint louver slats running along the diagonal cut
      const slats = 7;
      for (let k = 0; k < slats; k++) {
        const zc = zb0 + lipW + (k + .5) / slats * (zf0 - zb0 - lipW * 2);
        const h = .0085;
        const sm = { kind: M.KERF, part, seed: k / slats, depthT: Math.abs(k / (slats - 1) - .5) * 1.4, phase: k / slats, bounce: 1, extra: 1 };
        const ea = [e.a[0] - e.n[0] * .006, e.a[1] - e.n[1] * .006];
        const eb = [e.b[0] - e.n[0] * .006, e.b[1] - e.n[1] * .006];
        // Leading edge of slat
        mesh.quadN([[ea[0], ea[1], zc - h], [eb[0], eb[1], zc - h], [eb[0], eb[1], zc + h], [ea[0], ea[1], zc + h]],
          [n3a, n3b, n3b, n3a], sm, [.95, .95, 1, 1], [[s0, zc - h], [s1, zc - h], [s1, zc + h], [s0, zc + h]]);
        // Upper & lower slat faces plunging back into the kerf recess
        mesh.poly([[ra[0], ra[1], zc + h], [rb[0], rb[1], zc + h], [eb[0], eb[1], zc + h], [ea[0], ea[1], zc + h]], [0, 0, 1], sm, [.28, .28, .92, .92]);
        mesh.poly([[ea[0], ea[1], zc - h], [eb[0], eb[1], zc - h], [rb[0], rb[1], zc - h], [ra[0], ra[1], zc - h]], [0, 0, -1], sm, [.92, .92, .28, .28]);
      }
      return;
    }

    // Outer perimeter wall: front & back speckled-terrazzo frames enclosing a
    // recessed architectural band that alternates between deep emerald side
    // louvers and Image-1 micro-perforated periwinkle-cobalt panels!
    const frac = s0 / Math.max(totalLen, 1e-4);
    const onSpine = e.a[0] < .02 && e.b[0] < .02;
    const onFlatTopBot = (e.a[1] < .02 && e.b[1] < .02) || (e.a[1] > 1.67 && e.b[1] > 1.67);
    const isLouverBay = !onFlatTopBot && ((part === 0 && (onSpine || (frac > .18 && frac < .52)))
      || (part === 1 && (!onSpine && frac > .12 && frac < .46)));
    const isPerfBay = !onFlatTopBot && !isLouverBay && !onSpine;

    // Front & back solid speckled-terrazzo edge bands
    mesh.quadN([[e.a[0], e.a[1], zb0], [e.b[0], e.b[1], zb0], [e.b[0], e.b[1], zBay0], [e.a[0], e.a[1], zBay0]],
      [n3a, n3b, n3b, n3a], terraM, [.82, .82, .94, .94], [[s0, zb0], [s1, zb0], [s1, zBay0], [s0, zBay0]]);
    mesh.quadN([[e.a[0], e.a[1], zBay1], [e.b[0], e.b[1], zBay1], [e.b[0], e.b[1], zf0], [e.a[0], e.a[1], zf0]],
      [n3a, n3b, n3b, n3a], terraM, [.94, .94, 1, 1], [[s0, zBay1], [s1, zBay1], [s1, zf0], [s0, zf0]]);

    if (isLouverBay) {
      // Deep recessed side bay with 8 stacked emerald-to-mint horizontal louvers!
      const rec = .044;
      const ra = [e.a[0] - na[0] * rec, e.a[1] - na[1] * rec];
      const rb = [e.b[0] - nb[0] * rec, e.b[1] - nb[1] * rec];
      // Bay inner back wall
      mesh.quadN([[ra[0], ra[1], zBay0], [rb[0], rb[1], zBay0], [rb[0], rb[1], zBay1], [ra[0], ra[1], zBay1]],
        [n3a, n3b, n3b, n3a], { kind: M.CORE, part, seed: .4, depthT: 1, phase: -1, bounce: .6, extra: 0 }, [.2, .2, .25, .25]);
      // Side bay top/bottom terrazzo returns
      mesh.poly([[ra[0], ra[1], zBay1], [rb[0], rb[1], zBay1], [e.b[0], e.b[1], zBay1], [e.a[0], e.a[1], zBay1]], [0, 0, -1], terraM, [.35, .35, .92, .92]);
      mesh.poly([[e.a[0], e.a[1], zBay0], [e.b[0], e.b[1], zBay0], [rb[0], rb[1], zBay0], [ra[0], ra[1], zBay0]], [0, 0, 1], terraM, [.92, .92, .35, .35]);
      const slats = 8;
      for (let k = 0; k < slats; k++) {
        const t = k / (slats - 1);
        const zc = zBay0 + .018 + t * (zBay1 - zBay0 - .036);
        const h = .009;
        const inset = .008 + Math.abs(t - .5) * .012;
        const ea = [e.a[0] - na[0] * inset, e.a[1] - na[1] * inset];
        const eb = [e.b[0] - nb[0] * inset, e.b[1] - nb[1] * inset];
        const fm = { kind: M.FIN, part, seed: t, depthT: .25 + Math.abs(t - .5) * .9, phase: t, bounce: .9, extra: k };
        const cm = { kind: M.CREST, part, seed: t, depthT: .18 + Math.abs(t - .5) * .7, phase: t, bounce: 1, extra: k };
        mesh.quadN([[ea[0], ea[1], zc - h], [eb[0], eb[1], zc - h], [eb[0], eb[1], zc + h], [ea[0], ea[1], zc + h]],
          [n3a, n3b, n3b, n3a], cm, [.92, .92, .98, .98], [[s0, zc - h], [s1, zc - h], [s1, zc + h], [s0, zc + h]]);
        mesh.poly([[ra[0], ra[1], zc + h], [rb[0], rb[1], zc + h], [eb[0], eb[1], zc + h], [ea[0], ea[1], zc + h]], [0, 0, 1], fm, [.22, .22, .9, .9]);
        mesh.poly([[ea[0], ea[1], zc - h], [eb[0], eb[1], zc - h], [rb[0], rb[1], zc - h], [ra[0], ra[1], zc - h]], [0, 0, -1], fm, [.9, .9, .22, .22]);
      }
    } else if (isPerfBay) {
      // Slightly recessed micro-perforated periwinkle-cobalt anodized architectural panel (Image 1 flank homage!).
      const rec = .012;
      const ra = [e.a[0] - na[0] * rec, e.a[1] - na[1] * rec];
      const rb = [e.b[0] - nb[0] * rec, e.b[1] - nb[1] * rec];
      mesh.quadN([[ra[0], ra[1], zBay0], [rb[0], rb[1], zBay0], [rb[0], rb[1], zBay1], [ra[0], ra[1], zBay1]],
        [n3a, n3b, n3b, n3a], perfM, [.86, .86, .95, .95], [[s0, zBay0], [s1, zBay0], [s1, zBay1], [s0, zBay1]]);
      mesh.poly([[ra[0], ra[1], zBay1], [rb[0], rb[1], zBay1], [e.b[0], e.b[1], zBay1], [e.a[0], e.a[1], zBay1]], [0, 0, -1], terraM, [.55, .55, .95, .95]);
      mesh.poly([[e.a[0], e.a[1], zBay0], [e.b[0], e.b[1], zBay0], [rb[0], rb[1], zBay0], [ra[0], ra[1], zBay0]], [0, 0, 1], terraM, [.95, .95, .55, .55]);
    } else {
      // Solid speckled-terrazzo architectural wall on flat top/bottom/spine rest plates.
      mesh.quadN([[e.a[0], e.a[1], zBay0], [e.b[0], e.b[1], zBay0], [e.b[0], e.b[1], zBay1], [e.a[0], e.a[1], zBay1]],
        [n3a, n3b, n3b, n3a], terraM, [.90, .90, .98, .98], [[s0, zBay0], [s1, zBay0], [s1, zBay1], [s0, zBay1]]);
    }
  });
}

// ---------------------------------------------------------------------------
// Complete Sculpted B Half Assembly
// ---------------------------------------------------------------------------
function buildLouverHalf(mesh, rawOutline, part) {
  const pts = cleanPoly(rawOutline, .016);
  const { edges, verts } = analysePoly(pts, part);
  const n = pts.length;
  const innerChamfer = insetConvex(pts, CHAMFER);
  const innerAperture = insetConvex(pts, .058);
  const zf = FRONT, zb = BACK, zf0 = FRONT - CHAMFER, zb0 = BACK + CHAMFER;
  const terraM = { kind: M.TERRAZZO, part, seed: .14 + part * .33, depthT: 0, phase: -1, bounce: .18, extra: 0 };
  const vn = (i, e) => (verts[i].sharp ? e.n : verts[i].smooth);

  // 1. Solid back face (terrazzo monolith)
  mesh.poly(innerChamfer.map(p => [p[0], p[1], zb]).reverse(), [0, 0, -1], terraM);

  // 2. Crisp 45-degree front & back perimeter chamfers around the B contour
  // Use matching vertices along the outer perimeter via exact edge offsets.
  const offsetVerts = pts.map((p, i) => {
    const e0 = edges[(i - 1 + n) % n], e1 = edges[i];
    const avg = [e0.n[0] + e1.n[0], e0.n[1] + e1.n[1]];
    const al = Math.hypot(avg[0], avg[1]) || 1;
    const m = [avg[0] / al, avg[1] / al];
    const miter = Math.max(.45, m[0] * e1.n[0] + m[1] * e1.n[1]);
    return [p[0] - m[0] * CHAMFER / miter, p[1] - m[1] * CHAMFER / miter];
  });
  edges.forEach((e, i) => {
    const j = (i + 1) % n;
    const na = vn(i, e), nb = vn(j, e);
    const cfM = e.cut ? { ...terraM, bounce: .72 } : terraM;
    const nfA = norm3([na[0], na[1], 1]), nfB = norm3([nb[0], nb[1], 1]);
    const nbA = norm3([na[0], na[1], -1]), nbB = norm3([nb[0], nb[1], -1]);
    mesh.quadN([
      [offsetVerts[i][0], offsetVerts[i][1], zf],
      [offsetVerts[j][0], offsetVerts[j][1], zf],
      [e.b[0], e.b[1], zf0],
      [e.a[0], e.a[1], zf0],
    ], [nfA, nfB, nfB, nfA], cfM);
    mesh.quadN([
      [e.a[0], e.a[1], zb0],
      [e.b[0], e.b[1], zb0],
      [offsetVerts[j][0], offsetVerts[j][1], zb],
      [offsetVerts[i][0], offsetVerts[i][1], zb],
    ], [nbA, nbB, nbB, nbA], cfM);
  });

  // 3. Outer front terrazzo perimeter frame (annulus between chamfer edge and carved aperture)
  addAnnulus(mesh, offsetVerts, innerAperture, zf, 1, { ...terraM, bounce: .35 }, 1, .94);

  // 4. Side walls (terrazzo frames + recessed emerald louver bays + periwinkle perforated panels + kerf louvers)
  buildSideWalls(mesh, pts, edges, verts, part);

  // 5. Sculpted Interior Chambers + Interlocking Cantilevered Terrazzo Overhangs + Prismatic V-Pinch!
  if (part === 0) {
    // Upper half:
    //   - Main sweeping upper-right bowl louver canyon (x >= 0.36)
    //   - Upper-left recessed emerald louver bay (x <= 0.31, y <= 0.44)
    //   - Cantilevered speckled-terrazzo stepped corner block jutting proudly
    //     over the inner lower-left corner (echoing Image 1's iconic stepped white stone overhang!)
    //   - Prismatic folded turquoise-mint accordion V-pinch tucked right beside the overhang!
    // Clean architectural chamber geometry (zero overlapping pinch triangles!):
    // Carve an iconic diagonal-faceted chamfer recess directly at the inner waist
    // between the cantilevered terrazzo monolith pier and the grand concentric bowl!
    const mainBay = clipHalfPlane(innerAperture, -1, 0, -.375);
    const topLeftBay = clipHalfPlane(clipHalfPlane(innerAperture, 1, 0, .32), 0, 1, .435);
    addConcentricLouvers(mesh, mainBay, part, {
      maxFins: 26, finStep: .0152, finThick: .0070, zStart: FRONT - .014, zDrop: .0135, zFloor: FRONT - .37, seedBase: .1,
    });
    addConcentricLouvers(mesh, topLeftBay, part, {
      maxFins: 14, finStep: .0146, finThick: .0068, zStart: FRONT - .022, zDrop: .0145, zFloor: FRONT - .29, seedBase: .42,
    });

    // Crisp speckled-terrazzo dividing bridge between topLeftBay and mainBay
    const bridge = clipHalfPlane(clipHalfPlane(clipHalfPlane(innerAperture, -1, 0, -.315), 1, 0, .38), 0, 1, .445);
    if (bridge.length >= 3) {
      addBeveledBlock(mesh, bridge, FRONT - .32, FRONT + .004, .007, { ...terraM, seed: .41, bounce: .42 });
    }
    // Hero cantilevered white speckled-terrazzo architectural monolith block (with a
    // sculpted 45-degree notch carved out of its inner-right corner for the iconic
    // Image-1 turquoise-emerald pleated accordion V-pinch — zero overlap!)
    const pierFull = clipHalfPlane(clipHalfPlane(innerAperture, 1, 0, .385), 0, -1, -.435);
    const pierNotched = clipHalfPlane(pierFull, .7071, -.7071, .385 * .7071 - .58 * .7071);
    if (pierNotched.length >= 3) {
      addBeveledBlock(mesh, pierNotched, FRONT - .33, FRONT + .018, .009, { ...terraM, seed: .57, bounce: .52 });
      const cap = clipHalfPlane(clipHalfPlane(innerAperture, -1, 0, -.22), 0, 1, .165);
      if (cap.length >= 3) {
        addBeveledBlock(mesh, cap, FRONT - .05, FRONT + .010, .007, { ...terraM, seed: .27, bounce: .28 });
      }
    }
    // Fill ONLY the carved triangular corner notch with razor-crisp turquoise-emerald accordion pleats!
    const notchTri = clipHalfPlane(pierFull, -.7071, .7071, -(.385 * .7071 - .58 * .7071));
    if (notchTri.length >= 3) {
      addConcentricLouvers(mesh, notchTri, part, {
        maxFins: 11, finStep: .0128, finThick: .0062, zStart: FRONT - .008, zDrop: .018, zFloor: FRONT - .26, seedBase: .88,
      });
    }
  } else {
    // Lower half:
    //   - Grand sweeping curved lower bowl amphitheater (x >= 0.385) spiraling to a crisp emerald vortex!
    //   - Lower-left deep undercut emerald louver alcove (x <= 0.335, y >= 1.245)
    //   - Foreground sculpted speckled-terrazzo stepped pier with matching diagonal carved louver corner!
    const grandBowl = clipHalfPlane(innerAperture, -1, 0, -.385);
    const lowLeftBay = clipHalfPlane(clipHalfPlane(innerAperture, 1, 0, .335), 0, -1, -1.245);
    addConcentricLouvers(mesh, grandBowl, part, {
      maxFins: 28, finStep: .0152, finThick: .0070, zStart: FRONT - .012, zDrop: .0132, zFloor: FRONT - .39, seedBase: .25,
    });
    addConcentricLouvers(mesh, lowLeftBay, part, {
      maxFins: 16, finStep: .0144, finThick: .0068, zStart: FRONT - .026, zDrop: .0148, zFloor: FRONT - .32, seedBase: .68,
    });

    // Crisp vertical terrazzo mullion between lowLeftBay and grandBowl
    const divider = clipHalfPlane(clipHalfPlane(clipHalfPlane(innerAperture, -1, 0, -.33), 1, 0, .39), 0, -1, -1.24);
    if (divider.length >= 3) {
      addBeveledBlock(mesh, divider, FRONT - .34, FRONT + .005, .007, { ...terraM, seed: .73, bounce: .45 });
    }
    // Sculpted foreground cantilevered white terrazzo monolith pier with matching diagonal louver notch!
    const foreFull = clipHalfPlane(clipHalfPlane(innerAperture, 1, 0, .392), 0, 1, 1.252);
    const foreNotched = clipHalfPlane(foreFull, .7071, .7071, .392 * .7071 + 1.07 * .7071);
    if (foreNotched.length >= 3) {
      addBeveledBlock(mesh, foreNotched, FRONT - .34, FRONT + .020, .009, { ...terraM, seed: .83, bounce: .56 });
    }
    const foreNotch = clipHalfPlane(foreFull, -.7071, -.7071, -(.392 * .7071 + 1.07 * .7071));
    if (foreNotch.length >= 3) {
      addConcentricLouvers(mesh, foreNotch, part, {
        maxFins: 11, finStep: .0128, finThick: .0062, zStart: FRONT - .008, zDrop: .018, zFloor: FRONT - .27, seedBase: .93,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Shaders (WebGL 1 / GLSL ES 1.00)
// ---------------------------------------------------------------------------
const PLACE = `
uniform vec4 halfMotion, shockA, shockB;
uniform float spread, time, mirror;
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float clickRipple(vec2 p, vec4 s) {
  if (s.w <= 0. || s.z > 3.2) return 0.;
  float d = length(p - s.xy);
  float r = s.z * .88;
  float x = (d - r) / (.065 + s.z * .045);
  return s.w * exp(-x * x) * exp(-s.z * 1.45);
}

void place(vec3 p, vec3 n, vec3 t, float part, float kinPhase, out vec3 wp, out vec3 wn, out vec3 wt, out float wave) {
  wave = clickRipple(p.xy, shockA) + clickRipple(p.xy, shockB);
  vec3 lp = p;
  if (kinPhase >= 0.) {
    // Silky kinetic architectural louver wave + tactile ripple cascade on click!
    float breath = sin(time * 1.35 - kinPhase * 5.2 + part * 1.7) * .0115;
    float kick = wave * .028 * (1. - .35 * kinPhase);
    lp.z += breath + kick;
  }
  bool upper = part < .5;
  mat2 R = rot2(upper ? -halfMotion.z : -halfMotion.w);
  vec2 piv = upper ? vec2(.50, .46) : vec2(.58, 1.22);
  vec2 off = upper ? vec2(halfMotion.x, -spread) : vec2(halfMotion.y, spread);
  wp = vec3(R * (lp.xy - piv) + piv + off, lp.z);
  wn = vec3(R * n.xy, n.z);
  wt = vec3(R * t.xy, t.z);
  // The lacquered floor reflection mirrors the world about the floor plane.
  if (mirror > 0.) { wp.y = 2. * mirror - wp.y; wn.y = -wn.y; wt.y = -wt.y; }
}
vec3 tRule(vec3 n) {
  return abs(n.z) > .7 ? normalize(vec3(1., 0., 0.) - n * n.x) : normalize(vec3(-n.y, n.x, 0.));
}
`;

const shadowVert = `precision highp float;
attribute vec4 aPos, aNrm, aUv, aExt;
uniform vec3 lightU, lightV, lightW;
${PLACE}
varying float vDepth;
void main() {
  vec3 wp, wn, wt; float wave;
  place(aPos.xyz, aNrm.xyz, vec3(1., 0., 0.), aPos.w, aExt.y, wp, wn, wt, wave);
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
varying float vAo, vWave;
void main() {
  vec3 wp, wn, wt; float wave;
  place(aPos.xyz, aNrm.xyz, tRule(aNrm.xyz), aPos.w, aExt.y, wp, wn, wt, wave);
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
  vec3 rel = wp - vec3(${CX}, ${CY}, 0.) + wn * .0038;
  vShadow = vec3(dot(rel, lightU), dot(rel, lightV), dot(rel, lightW)) / ${SHADOW_EXTENT.toFixed(2)} * .5 + .5;
  vUv = aUv;
  vExt = aExt;
  vAo = aNrm.w;
  vWave = wave;
}`;

const litFrag = `precision highp float;
uniform vec3 row1, row2, row3;
uniform vec3 keyV, fillV, floorV, rimV;
uniform vec3 kerfA, kerfB;
uniform float time, pixel, pulse, glow, quality, shadowOn, shadowTexel, mirror;
uniform sampler2D shadowMap;
varying vec3 vObj, vView, vN, vT, vShadow;
varying vec4 vUv, vExt;
varying float vAo, vWave;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y);
}

// Multi-scale speckled architectural mineral terrazzo aggregate (Image 1 signature!).
// One layer of terrazzo aggregate: irregular chips on a jittered grid.
float chipLayer(vec2 p, float scale, float density, float size, out vec2 dir, out float pick) {
  vec2 g = p * scale;
  vec2 c = floor(g), f = fract(g);
  pick = hash12(c + scale * .37);
  dir = vec2(0.);
  if (hash12(c + 3.3 + scale) > density) return 0.;
  vec2 j = .25 + .5 * hash22(c + 13.7 + scale);
  vec2 d = f - j;
  float ang = atan(d.y, d.x) + hash12(c + 1.9) * 6.28;
  // Fractured stone: a rounded polygon with a few flat facets.
  float r = size * (.7 + .5 * hash12(c + 7.1)) * (.84 + .12 * cos(ang * 3.) + .07 * cos(ang * 5. + 1.3));
  float l = length(d);
  dir = d / max(l, 1e-4);
  return 1. - smoothstep(r * .9, r, l);
}

// Polished architectural terrazzo: a warm white cement matrix carrying large
// emerald, periwinkle, violet and graphite chips, medium chips and fine grit.
void terrazzo(vec2 p, out vec3 col, out float rough, out vec2 dn) {
  float cloud = vnoise(p * 5.) * .6 + vnoise(p * 13. + 3.1) * .4;
  col = mix(vec3(.93, .925, .935), vec3(.975, .97, .985), cloud);
  rough = .2;
  dn = vec2(0.);
  vec2 dir; float pick;

  float m = chipLayer(p, 11., .55, .34, dir, pick);
  if (m > 0.) {
    vec3 chip = pick < .3 ? vec3(.03, .44, .27) : pick < .52 ? vec3(.36, .40, .86) : pick < .7 ? vec3(.50, .34, .80)
      : pick < .86 ? vec3(.11, .11, .16) : vec3(.97, .96, .99);
    chip *= .86 + .28 * vnoise(p * 60. + pick * 9.);
    col = mix(col, chip, m);
    dn += dir * m * (1. - m) * .5;
  }
  m = chipLayer(p + 4.1, 23., .5, .33, dir, pick);
  if (m > 0.) {
    vec3 chip = pick < .28 ? vec3(.05, .52, .34) : pick < .55 ? vec3(.40, .44, .9) : pick < .75 ? vec3(.15, .15, .22) : vec3(.62, .44, .86);
    col = mix(col, chip, m * .92);
  }
  m = chipLayer(p + 9.7, 58., .55, .3, dir, pick);
  col = mix(col, pick < .5 ? vec3(.38, .4, .62) : vec3(.62, .6, .7), m * .55);
  // Fine pores catch grazing light.
  float pore = vnoise(p * 220.);
  dn += vec2(vnoise(p * 180. + vec2(1., 0.)) - pore, vnoise(p * 180. + vec2(0., 1.)) - pore) * .08;
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

vec3 shadeGGX(vec3 N, vec3 V, vec3 L, vec3 col, vec3 diff, vec3 F0, float a) {
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

// Photographic architectural gallery studio environment map (Image 1 lighting mood!).
vec3 studioEnv(vec3 r, float rough) {
  float soft = .06 + rough * .42;
  float floorMask = smoothstep(-soft, soft, r.y - .12);
  // Bright luminous warm-alabaster upper softbox + lavender gallery wall
  vec3 sky = mix(vec3(.78, .79, 1.05), vec3(1.18, 1.16, 1.12), smoothstep(-.1, -.85, r.y));
  // Rich electric ultraviolet-magenta studio floor reflection
  vec3 flr = mix(vec3(.32, .22, .88), vec3(.68, .18, .92), clamp(r.x * .5 + .5, 0., 1.));
  vec3 c = mix(sky, flr, floorMask);
  // Crisp overhead architectural skylight softbox strip
  float boxL = smoothstep(.62, .86, -r.y) * smoothstep(.78, .22, abs(r.x + .12));
  c += vec3(1.35, 1.32, 1.24) * boxL * mix(1.4, .35, rough);
  // Cool periwinkle left gallery panel reflection
  c += vec3(.32, .36, .92) * smoothstep(.2, .85, -r.x) * (1. - floorMask) * .35;
  return c;
}

vec3 toView(vec3 v) { return vec3(dot(row1, v), dot(row2, v), dot(row3, v)); }

vec3 toneACES(vec3 c) {
  c *= .96;
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2));
}

void main() {
  float kind = floor(vUv.z + .5);
  float seed = vUv.w;
  float depthT = vExt.x;
  float bounceW = vExt.z;
  vec3 N = normalize(vN);
  vec3 T = normalize(vT - N * dot(vT, N));
  vec3 Bt = cross(N, T);
  vec3 V = normalize(vec3(0., 0., -${D_CAM.toFixed(1)}) - vView);

  vec3 albedo = vec3(.93, .94, .96);
  float rough = .65, metal = .02, cavity = vAo;
  vec2 dn = vec2(0.);
  vec3 emit = vec3(0.);
  // Tri-planar object-space coordinate so terrazzo speckles wrap cleanly across chamfers!
  vec2 objUv = abs(vObj.z) > .001 && abs(N.z) > .55 ? vObj.xy : vUv.xy;

  if (kind < .5) {
    // 0: Speckled White Architectural Terrazzo Monolith
    terrazzo(vUv.xy + vec2(seed * 2.1, seed * 1.3), albedo, rough, dn);
    // Crisp emerald-mint indirect bounce tint bleeding softly onto recessed terrazzo inner walls!
    albedo = mix(albedo, vec3(.48, .92, .74), bounceW * .26 * (1. - cavity * .58));
  } else if (kind < 2.5) {
    // 1 & 2: Lush Botanical Jewel-Emerald to Fresh Spearmint-Aqua Louver Fins (EXACT Image 1 emerald green!)
    bool isCrest = kind > 1.5;
    vec3 abyssEm = vec3(.001, .042, .012);
    vec3 deepEm = vec3(.003, .225, .052);
    vec3 richEm = vec3(.008, .48, .115);
    vec3 mintLip = vec3(.055, .86, .40);
    vec3 aquaEdge = vec3(.16, .96, .64);
    // Steep AO curve plunges the gaps between every concentric fin into velvety forest-emerald shadow!
    cavity = pow(clamp(vAo, 0., 1.), 1.9);
    albedo = mix(richEm, abyssEm, smoothstep(.04, .90, depthT));
    if (isCrest) {
      albedo = mix(aquaEdge, richEm * .55, smoothstep(.0, .6, depthT));
      rough = .26 + .16 * depthT;
      metal = .04;
      emit += mix(vec3(.010, .18, .085), vec3(.001, .032, .010), depthT) * (.28 + .72 * vWave);
    } else {
      albedo = mix(abyssEm, deepEm, smoothstep(.08, .82, cavity)) * (1. - .6 * smoothstep(.15, .8, depthT)) + mintLip * smoothstep(.8, 1., vAo) * (1. - depthT) * .3;
      rough = .36 + .20 * depthT;
      metal = .03;
    }
    float mill = sin(vObj.z * 260.) * .5 + .5;
    dn.y += (mill - .5) * .08;
  } else if (kind < 3.5) {
    // 3: Signature Recessed Pleated Accordion V-Pinch (Image 1 turquoise-to-emerald pleated heart!)
    bool isEdge = vExt.w > .5;
    cavity = pow(clamp(vAo, 0., 1.), 1.65);
    vec3 aquaCrest = vec3(.16, .95, .86);
    vec3 richEm = vec3(.006, .34, .16);
    albedo = isEdge ? mix(aquaCrest, vec3(.04, .68, .42), depthT) : mix(richEm, vec3(.002, .09, .045), depthT);
    rough = isEdge ? .24 : .40;
    metal = .06;
    emit += (isEdge ? vec3(.03, .28, .24) : vec3(.004, .06, .035)) * (.52 - .28 * depthT + .75 * vWave);
  } else if (kind < 4.5) {
    // 4: Saturated Micro-Perforated Periwinkle-Cobalt Side Panel (Image 1 flank blocks!)
    vec2 g = vUv.xy * 86.;
    vec2 f = fract(g) - .5;
    float d = length(f);
    float hole = 1. - smoothstep(.18, .29, d);
    float rimD = smoothstep(.24, .35, d) * (1. - smoothstep(.35, .45, d));
    vec3 cobalt = vec3(.16, .19, .88);
    vec3 holeCol = vec3(.035, .042, .26);
    albedo = mix(cobalt, holeCol, hole * .92);
    rough = mix(.34, .84, hole);
    metal = mix(.18, .02, hole);
    cavity *= 1. - hole * .56;
    dn += normalize(f + 1e-4) * rimD * .36;
  } else if (kind < 5.5) {
    // 5: Diagonal Kerf Deep Emerald-to-Chartreuse-Mint Louvers
    vec3 limeMint = vec3(.32, .94, .34);
    vec3 emKerf = vec3(.01, .34, .14);
    float hot = vExt.w > .5 ? 1. : 0.;
    cavity = pow(clamp(vAo, 0., 1.), 1.6);
    albedo = mix(emKerf, limeMint, hot * (.50 + .50 * (1. - depthT)));
    rough = .30;
    float flow = .5 + .5 * sin(vUv.x * 16. - time * 2.4 + depthT * 4.);
    emit += mix(vec3(.015, .16, .07), vec3(.26, .82, .18), hot * (.40 + .60 * flow)) * (.30 + .42 * glow + .8 * vWave);
  } else {
    // 6: Deep Cavity Velvety Emerald-Black Core Backing
    albedo = vec3(.001, .032, .016);
    rough = .74;
    cavity = .12;
  }

  vec3 Nd = normalize(N + T * dn.x + Bt * dn.y);
  float a = max(.045, rough * rough);
  vec3 diff = albedo * (1. - metal);
  vec3 F0 = mix(vec3(.042), albedo * .85 + .15, metal);

  float sh = mirror > 0. ? 1. : shadowAt(vShadow, .0018 + .0038 * (1. - clamp(dot(N, keyV), 0., 1.)));
  // Rich Octane shadow depth: deeper shadows inside louver canyons, luminous bounce on open stone!
  float isLouver = (kind > .5 && kind < 3.5) || kind > 5.5 ? 1. : 0.;
  float directShadow = mix(isLouver > .5 ? .07 : .24, 1., sh);
  float cavDirect = mix(isLouver > .5 ? .14 : .45, 1., cavity);

  // 1. Overhead-right warm architectural studio key light (carves crisp deep louver shadows!)
  vec3 col = shadeGGX(Nd, V, keyV, vec3(2.45, 2.40, 2.26) * directShadow, diff, F0, a) * cavDirect;
  // 2. Cool periwinkle-violet left gallery fill (creates Image 1's iconic warm-top vs cool-lavender-left stone contrast!)
  col += shadeGGX(Nd, V, fillV, vec3(.42, .45, 1.38) * mix(1., .45, isLouver), diff, F0, max(a, .24)) * mix(.38, 1., cavity);
  // 3. Vibrant ultraviolet-magenta upward bounce from the drafting grid floor!
  col += shadeGGX(Nd, V, floorV, vec3(.68, .18, 1.18), diff, F0, max(a, .28)) * mix(.32, 1., cavity);
  // 4. Crisp overhead-rear architectural skylight rim (highlights terrazzo edges & louver crests!)
  col += shadeGGX(Nd, V, rimV, vec3(1.12, 1.18, 1.34), diff, F0, a) * cavDirect;

  // 5. Restrained hemispheric architectural ambient (never washes out deep emerald louver crevices!)
  vec3 hemi = mix(vec3(.28, .29, .46), vec3(.14, .08, .34), Nd.y * .5 + .5);
  col += diff * hemi * mix(.18, .72, cavity) * mix(1., .42, isLouver);

  // 6. Fake-GI Saturated Emerald Cavity Radiosity (rich lush botanical green inter-bounce!)
  float inCavity = bounceW * (1. - cavity * .55);
  vec3 emBounce = mix(vec3(.003, .36, .095), vec3(.045, .74, .32), smoothstep(.0, .85, 1. - depthT));
  col += diff * emBounce * inCavity * (.22 + .26 * sh);

  // 7. Diagonal kerf mint-lime line light illuminating nearby terrazzo & louver faces
  vec3 ab = kerfB - kerfA;
  float kt = clamp(dot(vObj - kerfA, ab) / dot(ab, ab), 0., 1.);
  vec3 toKerf = kerfA + ab * kt - vObj;
  float kd = length(toKerf);
  vec3 Lk = toView(toKerf / max(kd, 1e-4));
  float kFall = (1. / (1. + kd * kd / .0055)) * smoothstep(0., .06, kt) * smoothstep(1., .94, kt);
  col += shadeGGX(Nd, V, Lk, vec3(.22, 1.05, .44) * kFall * glow, diff, F0, a);

  // 8. Studio environment specular reflections
  vec3 R = reflect(-V, Nd);
  float NdV = max(dot(Nd, V), 0.);
  vec3 Fe = F0 + (max(vec3(1. - a), F0) - F0) * pow(1. - NdV, 5.);
  col += studioEnv(R, rough) * Fe * mix(.22, 1., cavity) * .56;
  // Polished terrazzo carries a clear lacquer coat.
  if (kind < .5) {
    float Fc = .04 + .96 * pow(1. - NdV, 5.);
    col += studioEnv(reflect(-V, N), .06) * Fc * mix(.3, 1., cavity) * .9;
  }

  // 9. Tactile click shimmer along louver crests
  col += vec3(.12, .92, .68) * vWave * .32 * (kind > .5 && kind < 3.5 ? 1. : .35);
  col += emit;

  if (mirror > 0.) {
    float fade = .34 * exp(-max(vObj.y - mirror, 0.) / .26);
    gl_FragColor = vec4(toneACES(col) * fade, fade);
    return;
  }
  gl_FragColor = vec4(toneACES(col), 1.);
}`;

// Projected architectural contact shadow + subtle emerald-mint floor bounce beneath the B!
const floorVert = `precision highp float;
attribute vec2 p;
uniform vec4 box, shadow;
varying vec2 vUv;
void main() {
  vUv = p;
  vec2 screen = shadow.xy + p * shadow.zw;
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, .99, 1.);
}`;

const floorFrag = `precision highp float;
uniform float sway, lift, lightAngle, pulse;
varying vec2 vUv;
void main() {
  // Architectural cast shadow thrown onto the violet-magenta grid floor (matches Image 1!)
  vec2 q = vUv;
  float dirShift = -.12 - lightAngle * .22 - sway * .18;
  // Crisp main directional cast shadow silhouette (elongated along key direction)
  vec2 shP = (q - vec2(dirShift, -.04)) / vec2(.66, .48);
  float shCore = exp(-dot(shP, shP) * 2.8);
  vec2 shWide = (q - vec2(dirShift * 1.15, -.02)) / vec2(.96, .74);
  float shPen = exp(-dot(shWide, shWide) * 1.9);
  // Tight contact AO shadow directly under the lower B base
  vec2 aoP = (q - vec2(-.04, .06)) / vec2(.44, .26);
  float ao = exp(-dot(aoP, aoP) * 3.4);

  // Deep royal-indigo architectural shadow (never muddy grey on the magenta-violet floor!)
  vec3 shadowCol = vec3(.075, .045, .36);
  float alpha = clamp(ao * .44 + shCore * .34 + shPen * .18, 0., .68) * (1. - lift * 3.2);

  // Delicate luminous mint-emerald bounce light spilled onto the grid near the front right!
  vec2 emP = (q - vec2(.24, .04)) / vec2(.52, .34);
  float emGlow = exp(-dot(emP, emP) * 2.8) * (.14 + .08 * pulse);
  vec3 premul = shadowCol * alpha + vec3(.08, .78, .58) * emGlow;
  gl_FragColor = vec4(premul, clamp(alpha, 0., 1.));
}`;

// Subtle glowing mint-lime architectural blade running deep inside the diagonal kerf.
const kerfVert = `precision highp float;
attribute vec4 aClip, aColor;
varying float vAcross;
varying vec4 vColor;
void main() {
  vAcross = aClip.w;
  vColor = aColor;
  gl_Position = vec4(aClip.xyz, 1.);
}`;

const kerfFrag = `precision highp float;
varying float vAcross;
varying vec4 vColor;
void main() {
  float x = vAcross;
  float body = exp(-x * x * 3.6);
  float core = exp(-x * x * 24.);
  vec3 c = vColor.rgb * (body * .48 + core * .85) * vColor.a;
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)) * .45, 0., .65));
}`;

export function initLouverGlass(gl, { software, outlines, filament }) {
  if (!outlines) return null;
  const litProg = program(gl, litVert, litFrag);
  const shadowProg = program(gl, shadowVert, shadowFrag);
  const floorProg = program(gl, floorVert, floorFrag);
  const kerfProg = program(gl, kerfVert, kerfFrag);
  if (!litProg || !floorProg || !kerfProg) return null;

  const mesh = new Mesh();
  outlines.forEach((o, part) => buildLouverHalf(mesh, o, part));
  const chunks = mesh.upload(gl);

  const [[fx0, fy0], [fx1, fy1]] = filament || [[.09, KERF_MID - SLOPE * .09], [.96, KERF_MID - SLOPE * .96]];
  const beamA = [fx0, fy0, 0], beamB = [fx1, fy1, 0];

  // Floor quad VBO
  const floorVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, floorVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  // Kerf light ribbon buffers
  const BEAM_N = 24;
  const kerfData = new Float32Array(BEAM_N * 2 * 8);
  const kerfVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, kerfVbo);
  gl.bufferData(gl.ARRAY_BUFFER, kerfData.byteLength, gl.DYNAMIC_DRAW);
  const kerfIdx = new Uint16Array((BEAM_N - 1) * 6);
  for (let k = 0; k < BEAM_N - 1; k++) {
    const b = k * 2;
    kerfIdx.set([b, b + 1, b + 3, b, b + 3, b + 2], k * 6);
  }
  const kerfIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, kerfIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, kerfIdx, gl.STATIC_DRAW);

  // 1024^2 RGBA-packed shadow map from studio key light
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
  const ul = uniforms(litProg), us = shadowProg ? uniforms(shadowProg) : null, uf = uniforms(floorProg);
  const attribs = (prog, names) => names.map(n => gl.getAttribLocation(prog, n));
  const litA = attribs(litProg, ['aPos', 'aNrm', 'aUv', 'aExt']);
  const shadowA = shadowProg ? attribs(shadowProg, ['aPos', 'aNrm', 'aUv', 'aExt']) : [];
  const floorLoc = gl.getAttribLocation(floorProg, 'p');
  const kerfA = attribs(kerfProg, ['aClip', 'aColor']);

  const bindAttribs = locs => {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    locs.forEach((loc, k) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
    });
  };
  const drawChunks = locs => {
    for (const c of chunks) {
      gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo);
      bindAttribs(locs);
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_SHORT, 0);
    }
  };

  const rotY = (v, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  };
  // High architectural studio key from upper-right-front (throws dramatic shadows across concentric fins!)
  const KEY = norm3([.48, -.76, -.44]);
  const FILL = norm3([-.84, -.16, -.52]);
  const FLOOR_L = norm3([.12, .94, -.32]);
  const RIM = norm3([-.35, -.68, .64]);
  const sp = new Float32Array(BEAM_N * 4);

  return {
    render(params, { box, ratio }) {
      const { rows, centre, size, lift, shift, sway = 0, pulse = 0, ground, lightAngle = 0, time = 0, quality = 2,
        shocks = [[0, 0, 9, 0], [0, 0, 9, 0]], halfMotion = [0, 0, 0, 0], glow = 1 } = params;
      const effQ = software ? 0 : quality;
      const spread = Math.abs(shift[1]);

      const key = rotY(KEY, lightAngle);
      const fill = rotY(FILL, lightAngle * .45);
      const rim = rotY(RIM, lightAngle * .5);
      const toObj = v => [
        v[0] * rows[0][0] + v[1] * rows[1][0] + v[2] * rows[2][0],
        v[0] * rows[0][1] + v[1] * rows[1][1] + v[2] * rows[2][1],
        v[0] * rows[0][2] + v[1] * rows[1][2] + v[2] * rows[2][2],
      ];
      const w = toObj(key).map(v => -v);
      const lu = norm3(cross3(w, Math.abs(w[1]) < .95 ? [0, 1, 0] : [1, 0, 0]));
      const lv = cross3(w, lu);

      // Pass 1: 1024^2 architectural shadow map
      const useShadow = Boolean(shadowFbo) && effQ >= 1;
      if (useShadow) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
        gl.viewport(0, 0, SHADOW, SHADOW);
        gl.colorMask(true, true, true, true);
        gl.clearColor(1, 1, 1, 1);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.useProgram(shadowProg);
        gl.uniform3fv(us('lightU'), lu);
        gl.uniform3fv(us('lightV'), lv);
        gl.uniform3fv(us('lightW'), w);
        gl.uniform1f(us('spread'), spread);
        gl.uniform1f(us('time'), time);
        gl.uniform4f(us('halfMotion'), halfMotion[0], halfMotion[1], halfMotion[2], halfMotion[3]);
        gl.uniform4fv(us('shockA'), shocks[0]);
        gl.uniform4fv(us('shockB'), shocks[1]);
        drawChunks(shadowA);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }

      // Pass 2: Projected architectural shadow & emerald bounce on the violet-magenta grid floor
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (ground) {
        for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
        gl.useProgram(floorProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, floorVbo);
        gl.enableVertexAttribArray(floorLoc);
        gl.vertexAttribPointer(floorLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform4fv(uf('box'), box);
        gl.uniform4f(uf('shadow'), ground[0], ground[1] + size * .02, ground[2] * 1.12, ground[3] * 1.18);
        gl.uniform1f(uf('sway'), sway);
        gl.uniform1f(uf('lift'), lift);
        gl.uniform1f(uf('lightAngle'), lightAngle);
        gl.uniform1f(uf('pulse'), pulse);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(floorLoc);
      }

      // Pass 3: Lit architectural speckled terrazzo + concentric emerald louvers
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(litProg);
      gl.uniform3fv(ul('row1'), rows[0]);
      gl.uniform3fv(ul('row2'), rows[1]);
      gl.uniform3fv(ul('row3'), rows[2]);
      gl.uniform4f(ul('box'), box[0], box[1], box[2], box[3]);
      gl.uniform2f(ul('centre'), centre[0], centre[1]);
      gl.uniform1f(ul('size'), size);
      gl.uniform1f(ul('lift'), lift);
      gl.uniform1f(ul('spread'), spread);
      gl.uniform4f(ul('halfMotion'), halfMotion[0], halfMotion[1], halfMotion[2], halfMotion[3]);
      gl.uniform3fv(ul('lightU'), lu);
      gl.uniform3fv(ul('lightV'), lv);
      gl.uniform3fv(ul('lightW'), w);
      gl.uniform3fv(ul('keyV'), key);
      gl.uniform3fv(ul('fillV'), fill);
      gl.uniform3fv(ul('floorV'), FLOOR_L);
      gl.uniform3fv(ul('rimV'), rim);
      gl.uniform3fv(ul('kerfA'), beamA);
      gl.uniform3fv(ul('kerfB'), beamB);
      gl.uniform1f(ul('time'), time);
      gl.uniform1f(ul('pixel'), 1 / (size * ratio));
      gl.uniform1f(ul('pulse'), pulse);
      gl.uniform1f(ul('glow'), Math.min(1.5, glow));
      gl.uniform1f(ul('quality'), effQ);
      gl.uniform1f(ul('shadowOn'), useShadow ? 1 : 0);
      gl.uniform1f(ul('shadowTexel'), 1 / (SHADOW || 1));
      gl.uniform4fv(ul('shockA'), shocks[0]);
      gl.uniform4fv(ul('shockB'), shocks[1]);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(ul('shadowMap'), 3);
      // The monolith mirrored in the lacquered floor, then the monolith itself.
      if (ground && effQ >= 1) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(ul('mirror'), FLOOR_Y);
        drawChunks(litA);
        gl.uniform1f(ul('mirror'), 0);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.BLEND);
      }
      drawChunks(litA);

      // Pass 4: Delicate luminous mint-lime architectural light blade nestled inside the diagonal kerf
      for (let k = 0; k < BEAM_N; k++) {
        const t = k / (BEAM_N - 1);
        const px = beamA[0] + (beamB[0] - beamA[0]) * t;
        const py = beamA[1] + (beamB[1] - beamA[1]) * t;
        const qx = px - CX, qy = py - CY + lift, qz = .02;
        const vx = rows[0][0] * qx + rows[0][1] * qy + rows[0][2] * qz;
        const vy = rows[1][0] * qx + rows[1][1] * qy + rows[1][2] * qz;
        const vz = rows[2][0] * qx + rows[2][1] * qy + rows[2][2] * qz;
        const persp = D_CAM / (D_CAM + vz);
        sp[k * 4] = centre[0] + size * vx * persp;
        sp[k * 4 + 1] = centre[1] + size * vy * persp;
        sp[k * 4 + 2] = vz * .25;
        sp[k * 4 + 3] = persp;
      }
      for (let k = 0; k < BEAM_N; k++) {
        const a = Math.max(0, k - 1), b = Math.min(BEAM_N - 1, k + 1);
        let dx = sp[a * 4] - sp[b * 4], dy = sp[a * 4 + 1] - sp[b * 4 + 1];
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        const t = k / (BEAM_N - 1);
        const wpx = .011 * size * sp[k * 4 + 3] + .5;
        const run = ((t * 1.4 - time * .42) % 1 + 1) % 1 - .5;
        const pulseK = Math.exp(-run * run / .012);
        const ends = Math.min(1, t * 12, (1 - t) * 12);
        const alpha = (.58 + .85 * pulseK) * ends * Math.min(1.4, glow) * (1 + .45 * pulse);
        for (const side of [-1, 1]) {
          const o = (k * 2 + (side > 0 ? 1 : 0)) * 8;
          const sx = sp[k * 4] - dy * wpx * side;
          const sy = sp[k * 4 + 1] + dx * wpx * side;
          kerfData[o] = (sx - box[0]) / box[2] * 2 - 1;
          kerfData[o + 1] = -((sy - box[1]) / box[3] * 2 - 1);
          kerfData[o + 2] = sp[k * 4 + 2];
          kerfData[o + 3] = side;
          kerfData[o + 4] = .42; kerfData[o + 5] = 1.0; kerfData[o + 6] = .62;
          kerfData[o + 7] = alpha;
        }
      }
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(kerfProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, kerfVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, kerfData);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, kerfIbo);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      kerfA.forEach((loc, k) => {
        if (loc < 0) return;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, k * 16);
      });
      gl.drawElements(gl.TRIANGLES, (BEAM_N - 1) * 6, gl.UNSIGNED_SHORT, 0);

      gl.depthMask(true);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      return true;
    },
  };
}
