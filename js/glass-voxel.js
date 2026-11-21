// Variant 4: Quantum Glass Voxel Core B.
//
// Inspired by translucent micro-grid optical containment housing a blazing
// 3D neural voxel supercomputer matrix:
//   - Outer crystal-clear chamfered B glass enclosure with fine laser-etched
//     micro-grid mesh, architectural glass panel mullions, internal divider
//     panes, chromatic Fresnel edge dispersion, and vertical barrel refraction.
//   - True 3D sculpted voxel core (~3,000 neighbor-culled beveled micro-cubes
//     plus ~220 floating micro-voxel quantum motes inside hollow glass atriums):
//       * Deep translucent sapphire-cobalt crystal voxel towers with baked 3D
//         voxel ambient occlusion and real-time neon-pink radiosity bounce!
//       * Connected 3D Manhattan-routed blazing white-hot & cotton-candy pink
//         emissive neural data buses with animated light-speed data surges!
//       * Glowing magenta-violet transition crystal clusters bordering the bus!
//   - Sleek multi-tier anodized electric-sky-blue & blazing hot-magenta neon
//     perimeter hardware cradle framing the rear & side edges of both halves.
//   - Photonic diagonal kerf bridge with animated high-speed energy filaments,
//     plus optical bloom flares and a radiant blue-pink floor reflection pool
//     cast onto the etched indigo PCB studio beneath.
import { program } from './gl/gl.js';

const SLOPE = .27875;
const NORM = 1 / Math.hypot(SLOPE, 1);
const D_CAM = 10.5;
const CX = .56, CY = .845;
const FRONT = .2805, BACK = -.272, CHAMFER = .018;
const CUTS = [.9125, 1.0475];
const KERF_MID = (CUTS[0] + CUTS[1]) / 2;
const STRIDE = 16;

// Voxel / hardware material kinds:
//   0 = Sapphire-cobalt translucent crystal voxel
//   1 = Blazing white-hot / cotton-candy neon-pink neural bus voxel
//   2 = Glowing electric-magenta / violet transition crystal voxel
//   3 = Floating quantum micro-voxel mote
//   4 = Glossy electric-sky-blue anodized hardware cradle lip
//   5 = Blazing hot-pink neon hardware trim light-guide strip
//   6 = Dark brushed indigo-chrome hardware chassis backing
const K = { BLUE: 0, HOT: 1, PINK: 2, MOTE: 3, RIM_BLUE: 4, RIM_PINK: 5, CHASSIS: 6 };

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => {
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

// Signed 2D distance to each exact BennieTech B half (negative inside).
function sdHalf2D(px, py, part) {
  const c = part ? { x: .71, y: 1.2, r: .49 } : { x: .57, y: .43, r: .43 };
  const dx = Math.max(px - c.x, 0), dy = py - c.y;
  const bowl = Math.hypot(dx, dy) - c.r;
  const top = part ? -1 : -py;
  const bottom = part ? py - 1.69 : -1;
  const cutD = part ? (CUTS[1] - (py + SLOPE * px)) * NORM : ((py + SLOPE * px) - CUTS[0]) * NORM;
  return Math.max(-px, bowl, top, bottom, cutD);
}

// ---------------------------------------------------------------------------
// Chunked Uint16 Mesh Builder (16 floats/vertex)
//   aPos  x y z part
//   aNrm  nx ny nz ao
//   aUv   u v kind seed
//   aExt  hotBounce pathT localScale extra
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
      uv[0], uv[1], m.kind || 0, m.seed || 0,
      m.bounce || 0, m.pathT ?? -1, m.scale || 1, m.extra || 0
    );
    return c.count++;
  }
  poly(points, n, m, aos = null, uvs = null) {
    if (points.length < 3) return;
    this.reserve(points.length);
    const base = this.cur.count;
    points.forEach((p, i) => this.vert(p, n, uvs ? uvs[i] : [p[0], p[1]], m, aos ? aos[i] : 1));
    for (let i = 1; i < points.length - 1; i++) this.cur.idx.push(base, base + i, base + i + 1);
  }
  quadN(points, normals, m, aos = null, uvs = null) {
    this.reserve(4);
    const base = this.cur.count;
    points.forEach((p, i) => this.vert(p, normals[i], uvs ? uvs[i] : [p[0], p[1]], m, aos ? aos[i] : 1));
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
// Outline processing for Hardware Cradle + Outer Crystal Micro-Grid Glass
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
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / .024));
    for (let k = 0; k < n; k++) R.push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]);
  });
  let s = 0;
  for (let i = 0; i < R.length; i++) {
    const p = R[i], q = R[(i + 1) % R.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  if (s < 0) R.reverse();
  const n = R.length;
  const edges = R.map((p, i) => {
    const q = R[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-6;
    const d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    return { a: p, b: q, d, n: [d[1], -d[0]], l };
  });
  const verts = R.map((p, i) => {
    const e0 = edges[(i - 1 + n) % n], e1 = edges[i];
    const c = e0.n[0] * e1.n[0] + e0.n[1] * e1.n[1];
    const sharp = c < Math.cos(.45);
    const avg = [e0.n[0] + e1.n[0], e0.n[1] + e1.n[1]];
    const al = Math.hypot(avg[0], avg[1]) || 1;
    const m = [avg[0] / al, avg[1] / al];
    return { p, sharp, smooth: m, miter: Math.max(.4, m[0] * e1.n[0] + m[1] * e1.n[1]) };
  });
  return { pts: R, edges, verts };
}

function offsetOutline(pts, verts, edges, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const v = verts[i];
    const q = [p[0] - v.smooth[0] * d / v.miter, p[1] - v.smooth[1] * d / v.miter];
    for (let pass = 0; pass < 3; pass++) {
      for (let k = -8; k <= 8; k++) {
        const e = edges[(i + k + n) % n];
        const over = (q[0] - e.a[0]) * e.n[0] + (q[1] - e.a[1]) * e.n[1] + d;
        if (over > 0) { q[0] -= e.n[0] * over; q[1] -= e.n[1] * over; }
      }
    }
    return q;
  });
}

// ---------------------------------------------------------------------------
// Layer 1: Glossy Electric-Blue & Neon-Pink Multi-Tier Hardware Base Cradle
// (Echoes Image 2's iconic rounded cyan-blue + hot-pink neon-layered pads!)
// ---------------------------------------------------------------------------
function buildHardwareCradle(mesh, outline, part) {
  const { pts, edges, verts } = prepOutline(outline);
  const n = pts.length;
  const vn = (i, e) => (verts[i].sharp ? e.n : verts[i].smooth);

  // Subtle outward flange (+0.014) framing the rear of the transparent glass housing!
  const outerFlange = offsetOutline(pts, verts, edges, -.016);
  const backInset = offsetOutline(pts, verts, edges, .012);
  const zBack = BACK;
  const zPink0 = BACK + .024, zPink1 = BACK + .062;
  const zBlue0 = BACK + .062, zBlue1 = BACK + .104;
  const zGlassSeat = BACK + .106;

  const chM = { kind: K.CHASSIS, part, seed: .2 + part * .2, bounce: .3 };
  const pinkM = { kind: K.RIM_PINK, part, seed: .5 + part * .15, bounce: 1, pathT: 0 };
  const blueM = { kind: K.RIM_BLUE, part, seed: .8 + part * .12, bounce: .55 };

  // Solid dark indigo-chrome backplate
  mesh.poly(backInset.map(p => [p[0], p[1], zBack]).reverse(), [0, 0, -1], chM);
  // Inner glossy sapphire floor plate sitting right under the 3D voxels (reflects the pink/blue core!)
  mesh.poly(pts.map(p => [p[0], p[1], zGlassSeat]), [0, 0, 1], { ...blueM, bounce: .75 });

  let s = 0;
  edges.forEach((e, i) => {
    const j = (i + 1) % n;
    const na = vn(i, e), nb = vn(j, e);
    const n3a = [na[0], na[1], 0], n3b = [nb[0], nb[1], 0];
    const oa = outerFlange[i], ob = outerFlange[j];
    const ba = backInset[i], bb = backInset[j];
    const s0 = s, s1 = s + e.l;
    s = s1;

    // 1. Rear chamfered dark chassis lip
    const nRearA = norm3([na[0], na[1], -1]), nRearB = norm3([nb[0], nb[1], -1]);
    mesh.quadN([[ba[0], ba[1], zBack], [bb[0], bb[1], zBack], [ob[0], ob[1], zPink0], [oa[0], oa[1], zPink0]],
      [nRearA, nRearB, nRearB, nRearA], chM, [.7, .7, .9, .9], [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
    // 2. Blazing hot-pink / neon-magenta light-guide strip wrapping around the entire B perimeter!
    mesh.quadN([[oa[0], oa[1], zPink0], [ob[0], ob[1], zPink0], [ob[0], ob[1], zPink1], [oa[0], oa[1], zPink1]],
      [n3a, n3b, n3b, n3a], { ...pinkM, pathT: (s0 * .45) % 1 }, [1, 1, 1, 1], [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
    // 3. Glossy electric-sky-blue metallic upper flange
    mesh.quadN([[oa[0], oa[1], zBlue0], [ob[0], ob[1], zBlue0], [ob[0], ob[1], zBlue1], [oa[0], oa[1], zBlue1]],
      [n3a, n3b, n3b, n3a], blueM, [.9, .9, 1, 1], [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
    // 4. Rounded glossy cyan-blue top bevel stepping cleanly inward to the glass wall seat!
    const nTopA = norm3([na[0] * .55, na[1] * .55, 1]), nTopB = norm3([nb[0] * .55, nb[1] * .55, 1]);
    mesh.quadN([[oa[0], oa[1], zBlue1], [ob[0], ob[1], zBlue1], [e.b[0], e.b[1], zGlassSeat], [e.a[0], e.a[1], zGlassSeat]],
      [nTopA, nTopB, nTopB, nTopA], blueM, [1, 1, .94, .94], [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
  });
}

// ---------------------------------------------------------------------------
// Layer 2: True 3D Sculpted Quantum Voxel Matrix + Floating Micro-Motes
// (Neighbor-culled beveled cubes with baked 3D AO & emissive pink radiosity!)
// ---------------------------------------------------------------------------
function buildVoxelCore(mesh, bloomSprites, part, rng) {
  const VP = .043; // Crisp architectural voxel pitch
  const X0 = .02, Y0 = part ? .74 : .02, Z0 = BACK + .118;
  const NX = 28, NY = part ? 22 : 21, NZ = 9;
  const grid = new Uint8Array(NX * NY * NZ); // 0=empty, 1=BLUE, 2=HOT, 3=PINK
  const pathMap = new Float32Array(NX * NY * NZ).fill(-1);
  const idx = (x, y, z) => (z * NY + y) * NX + x;
  const inBounds = (x, y, z) => x >= 0 && x < NX && y >= 0 && y < NY && z >= 0 && z < NZ;
  const cellCenter = (x, y, z) => [X0 + (x + .5) * VP, Y0 + (y + .5) * VP, Z0 + (z + .5) * VP];

  // Valid mask: strictly inside the B half with clean transparent optical glass margin!
  const valid = new Uint8Array(NX * NY * NZ);
  for (let z = 0; z < NZ; z++) {
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const [px, py, pz] = cellCenter(x, y, z);
        if (pz < FRONT - .032 && sdHalf2D(px, py, part) < -.038) valid[idx(x, y, z)] = 1;
      }
    }
  }

  // Step 1: Sculpt bold architectural 3D skyscraper clusters & deep hollow glass atriums!
  // Base occupancy using structured stepped heights + carved cubic showcase chambers.
  for (let z = 0; z < NZ; z++) {
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const i = idx(x, y, z);
        if (!valid[i]) continue;
        // Architectural stepped skyline height in Z from macro 3x3 column blocks!
        const bx = Math.floor(x / 3), by = Math.floor(y / 3);
        const hSeed = Math.abs(Math.sin(bx * 12.9898 + by * 78.233 + part * 43.17) * 43758.5453) % 1;
        // Carve open showcase glass galleries around the upper-right and outer corners (Image 2 airy glass depth!)
        const [px, py] = cellCenter(x, y, z);
        const frontCarve = (part === 0 && px > .66 && py < .34 && z >= 4)
          || (part === 0 && px < .26 && py < .28 && z >= 5)
          || (part === 1 && px > .84 && py > 1.30 && z >= 4)
          || (part === 1 && px < .28 && py > 1.36 && z >= 5);
        if (frontCarve) continue;
        // Keep central architectural canyons recessed so glowing pink buses bridge across them!
        const canyon = Math.sin(x * .52 + y * .38 + part * 2.1) * Math.cos(y * .46 - x * .24);
        const maxZ = Math.floor(3 + hSeed * 5.6 + (canyon > .18 ? 1.5 : -1.2));
        if (z <= maxZ && (z < 2 || canyon > -.48)) {
          grid[i] = 1; // Sapphire-cobalt crystal tower
        }
      }
    }
  }

  // Carve 3 dramatic rectangular 3D showcase notches in front faces so viewers
  // peer deep through the micro-grid glass into layered voxel towers!
  const notches = part === 0
    ? [[13, 3, 5, 6, 4, 4], [4, 9, 6, 5, 4, 3], [16, 11, 5, 5, 4, 4]]
    : [[16, 5, 5, 6, 5, 4], [5, 11, 6, 5, 5, 3], [14, 14, 5, 6, 4, 4]];
  for (const [nx0, ny0, nz0, nw, nh, nd] of notches) {
    for (let z = nz0; z < nz0 + nd; z++)
      for (let y = ny0; y < ny0 + nh; y++)
        for (let x = nx0; x < nx0 + nw; x++)
          if (inBounds(x, y, z)) grid[idx(x, y, z)] = 0;
  }

  // Step 2: Route bold connected 3D Manhattan white-hot / neon-pink neural data buses!
  // These form Image 2's iconic blazing white-pink stepped pixel staircases wrapping around & through the core.
  const routes = part === 0 ? [
    // Sweeping diagonal-staircase hero bus across the upper B front face!
    [[2, 13, 6], [6, 13, 6], [6, 9, 7], [11, 9, 7], [11, 5, 6], [16, 5, 6], [16, 8, 5], [19, 8, 5]],
    // Upper crown arterial bus diving deep in Z and surfacing at the upper-right bowl!
    [[3, 4, 5], [9, 4, 5], [9, 4, 2], [14, 4, 2], [14, 7, 6], [14, 12, 6]],
    // Lower kerf feeder bus glowing right beside the BennieTech diagonal cut!
    [[3, 16, 5], [9, 15, 6], [14, 13, 6], [18, 11, 5]],
  ] : [
    // Grand sweeping lower-bowl blazing neural staircase (Image 2 hero centerpiece!)
    [[3, 7, 6], [8, 7, 6], [8, 11, 7], [14, 11, 7], [14, 8, 6], [20, 8, 6], [20, 12, 5], [22, 12, 5]],
    // Deep lower arch circuit wrapping around the curved belly and diving into depth!
    [[5, 16, 5], [11, 16, 6], [11, 13, 6], [17, 13, 5], [17, 16, 3], [21, 15, 4]],
    // Spine-to-kerf quantum uplink bus!
    [[3, 12, 5], [3, 6, 5], [9, 5, 6], [15, 4, 6]],
  ];

  const hotList = [];
  let stepCursor = 0;
  const stampHot = (x, y, z, tVal, thick = false) => {
    // Leaner, sharper 1-voxel-crisp glowing ribbons (thick only at key bends) so rich
    // jewel-sapphire crystal voxel towers dominate 60% of the core just like Image 2!
    const span = thick ? 1 : 0;
    for (let dy = 0; dy <= span; dy++) {
      const cx = x, cy = y + dy, cz = clamp(z, 0, NZ - 1);
      if (!inBounds(cx, cy, cz) || !valid[idx(cx, cy, cz)]) continue;
      const ii = idx(cx, cy, cz);
      grid[ii] = 2; // HOT white-pink bus
      pathMap[ii] = tVal;
      hotList.push([cx, cy, cz, tVal]);
    }
  };

  for (const route of routes) {
    const totalSegs = route.length - 1;
    for (let s = 0; s < totalSegs; s++) {
      let [x, y, z] = route[s];
      const [tx, ty, tz] = route[s + 1];
      let guard = 0;
      while ((x !== tx || y !== ty || z !== tz) && guard++ < 80) {
        const tVal = ((stepCursor++) * .038) % 1;
        stampHot(x, y, z, tVal, false);
        if (x !== tx) x += Math.sign(tx - x);
        else if (y !== ty) y += Math.sign(ty - y);
        else if (z !== tz) z += Math.sign(tz - z);
      }
      stampHot(tx, ty, tz, ((stepCursor++) * .038) % 1, s % 2 === 0);
    }
  }

  // Step 3: Turn select bordering voxels into vivid electric-magenta transition crystals!
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [hx, hy, hz, ht] of hotList) {
    for (const [dx, dy, dz] of DIRS) {
      const nx = hx + dx, ny = hy + dy, nz = hz + dz;
      if (!inBounds(nx, ny, nz)) continue;
      const ii = idx(nx, ny, nz);
      if (grid[ii] === 1 && rng() < .42) {
        grid[ii] = 3; // Glowing magenta-violet transition crystal
        pathMap[ii] = ht;
      }
    }
  }

  // Step 4: Precompute 3D emissive neon-pink proximity radiosity field for every cell!
  const bounceField = new Float32Array(NX * NY * NZ);
  for (const [hx, hy, hz] of hotList) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = hx + dx, ny = hy + dy, nz = hz + dz;
          if (!inBounds(nx, ny, nz)) continue;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 6) continue;
          const ii = idx(nx, ny, nz);
          bounceField[ii] = Math.min(1, bounceField[ii] + 1 / (1 + d2 * .85) * .68);
        }
      }
    }
  }

  // Step 5: Emit neighbor-culled 3D beveled voxel faces with exact per-vertex 3D AO!
  const occupied = (x, y, z) => inBounds(x, y, z) && grid[idx(x, y, z)] > 0;
  // Face definitions: normal, tangent U, tangent V, 4 corners in (-1,+1)
  const FACES = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], d: [0, 0, 1] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], d: [0, 0, -1] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], d: [1, 0, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], d: [-1, 0, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], d: [0, 1, 0] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], d: [0, -1, 0] },
  ];
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const CUVS = [[0, 0], [1, 0], [1, 1], [0, 1]];

  const half = VP * .488; // Tiny crisp hairline gap between micro-voxels!
  for (let z = 0; z < NZ; z++) {
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const ii = idx(x, y, z);
        const type = grid[ii];
        if (!type) continue;
        const [cx, cy, cz] = cellCenter(x, y, z);
        const seed = (x * .137 + y * .291 + z * .419 + part * .33) % 1;
        const kind = type === 2 ? K.HOT : type === 3 ? K.PINK : K.BLUE;
        const m = {
          kind, part, seed,
          bounce: type === 2 ? 1 : bounceField[ii],
          pathT: pathMap[ii] >= 0 ? pathMap[ii] : ((x + y) * .045) % 1,
          scale: 1,
          extra: z / (NZ - 1), // Depth inside the glass chamber
        };

        let exposed = 0;
        for (const f of FACES) {
          const nx = x + f.d[0], ny = y + f.d[1], nz = z + f.d[2];
          // Cull interior shared faces between solid neighbors (but let HOT faces shine against blue!)
          if (occupied(nx, ny, nz) && !(type === 2 && grid[idx(nx, ny, nz)] === 1)) continue;
          exposed++;
          const pts = [];
          const aos = [];
          for (let k = 0; k < 4; k++) {
            const [su, sv] = CORNERS[k];
            pts.push([
              cx + (f.n[0] + f.u[0] * su + f.v[0] * sv) * half,
              cy + (f.n[1] + f.u[1] * su + f.v[1] * sv) * half,
              cz + (f.n[2] + f.u[2] * su + f.v[2] * sv) * half,
            ]);
            // Classic 3D voxel vertex AO: check side1, side2, and diagonal corner in neighbor plane!
            const s1 = occupied(nx + f.u[0] * su, ny + f.u[1] * su, nz + f.u[2] * su) ? 1 : 0;
            const s2 = occupied(nx + f.v[0] * sv, ny + f.v[1] * sv, nz + f.v[2] * sv) ? 1 : 0;
            const cr = occupied(nx + f.u[0] * su + f.v[0] * sv, ny + f.u[1] * su + f.v[1] * sv, nz + f.u[2] * su + f.v[2] * sv) ? 1 : 0;
            const occ = (s1 && s2) ? 3 : (s1 + s2 + cr);
            aos.push(type === 2 ? 1 : (1 - occ * .22));
          }
          mesh.poly(pts, f.n, m, aos, CUVS);
        }

        // Seed tight optical bloom sprites on key exposed front-facing HOT bus junctions!
        if (type === 2 && exposed >= 2 && z >= 4 && ((x + y * 3 + z) % 5 === 0)) {
          bloomSprites.push({
            p: [cx, cy, cz + .018],
            part,
            size: .088 + .035 * rng(),
            color: rng() < .65 ? [1.0, .20, .86] : [.65, .32, 1.0],
            intensity: .28 + .14 * rng(),
            phase: m.pathT * 6.283,
            speed: 2.1,
          });
        }
      }
    }
  }

  // Step 6: Scatter ~68 delicate micro-voxel quantum sparks inside the carved hollow glass atriums!
  let motes = 0;
  for (let tries = 0; tries < 900 && motes < 68; tries++) {
    const x = Math.floor(rng() * NX);
    const y = Math.floor(rng() * NY);
    const z = Math.floor(2 + rng() * (NZ - 2));
    const ii = idx(x, y, z);
    if (!valid[ii] || grid[ii] !== 0) continue;
    let near = false;
    for (const [dx, dy, dz] of DIRS) {
      if (occupied(x + dx, y + dy, z + dz) || occupied(x + dx * 2, y + dy * 2, z + dz * 2)) { near = true; break; }
    }
    if (!near && rng() > .22) continue;
    const [cx, cy, cz] = cellCenter(x, y, z);
    const jx = cx + (rng() - .5) * VP * .55;
    const jy = cy + (rng() - .5) * VP * .55;
    const jz = cz + (rng() - .5) * VP * .55;
    const sz = VP * (rng() < .32 ? .18 : .115);
    const hotMote = rng() < .46;
    const m = {
      kind: K.MOTE, part, seed: rng(),
      bounce: hotMote ? 1 : .45,
      pathT: rng(),
      scale: hotMote ? 1 : 0, // 1 = glowing pearl-pink mote, 0 = sapphire crystal mote
      extra: .5 + .5 * rng(),
    };
    for (const f of FACES) {
      const pts = CORNERS.map(([su, sv]) => [
        jx + (f.n[0] + f.u[0] * su + f.v[0] * sv) * sz,
        jy + (f.n[1] + f.u[1] * su + f.v[1] * sv) * sz,
        jz + (f.n[2] + f.u[2] * su + f.v[2] * sv) * sz,
      ]);
      mesh.poly(pts, f.n, m, [1, 1, 1, 1], CUVS);
    }
    motes++;
  }
}

// ---------------------------------------------------------------------------
// Layer 3: Outer Crystal Micro-Grid Glass Containment Enclosure + Dividers
// ---------------------------------------------------------------------------
function buildGlassEnclosure(glassMesh, outline, part) {
  const { pts, edges, verts } = prepOutline(outline);
  const n = pts.length;
  const vn = (i, e) => (verts[i].sharp ? e.n : verts[i].smooth);
  const inner = offsetOutline(pts, verts, edges, CHAMFER);
  const zf = FRONT, zf0 = FRONT - CHAMFER, zb = BACK + .108;

  // Front glass pane (kind = 0), chamfer bevel (kind = 1), side curved walls (kind = 2), internal divider (kind = 3)
  const frontM = { kind: 0, part, seed: .1 + part * .2, bounce: .5 };
  const bevM = { kind: 1, part, seed: .3 + part * .2, bounce: 1 };
  const wallM = { kind: 2, part, seed: .5 + part * .2, bounce: .7 };
  const divM = { kind: 3, part, seed: .7 + part * .2, bounce: .6 };

  // Front face glass sheet
  glassMesh.poly(inner.map(p => [p[0], p[1], zf]), [0, 0, 1], frontM, null, inner.map(p => [p[0], p[1]]));

  // Perimeter 45-deg optical chamfers + crystal containment walls
  let s = 0;
  edges.forEach((e, i) => {
    const j = (i + 1) % n;
    const na = vn(i, e), nb = vn(j, e);
    const nfA = norm3([na[0], na[1], 1]), nfB = norm3([nb[0], nb[1], 1]);
    const n3a = [na[0], na[1], 0], n3b = [nb[0], nb[1], 0];
    const s0 = s, s1 = s + e.l;
    s = s1;
    // Razor-crisp polished 45-deg glass chamfer catching neon pink & white speculars!
    glassMesh.quadN([
      [inner[i][0], inner[i][1], zf], [inner[j][0], inner[j][1], zf],
      [e.b[0], e.b[1], zf0], [e.a[0], e.a[1], zf0],
    ], [nfA, nfB, nfB, nfA], bevM, [1, 1, 1, 1], [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
    // Transparent micro-grid side wall wrapping all the way around the B chamber
    glassMesh.quadN([
      [e.a[0], e.a[1], zb], [e.b[0], e.b[1], zb],
      [e.b[0], e.b[1], zf0], [e.a[0], e.a[1], zf0],
    ], [n3a, n3b, n3b, n3a], wallM, [1, 1, 1, 1], [[s0, zb], [s1, zb], [s1, zf0], [s0, zf0]]);
  });

  // Thin internal architectural glass partition plane slicing cleanly inside the chamber (Image 2 signature!)
  const splitX = part ? .52 : .44;
  let yMin = 9, yMax = -9;
  for (let y = 0; y <= 1.69; y += .01) {
    if (sdHalf2D(splitX, y, part) < -.018) {
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  }
  if (yMax > yMin + .08) {
    glassMesh.poly([
      [splitX, yMin, zb], [splitX, yMax, zb], [splitX, yMax, zf - .005], [splitX, yMin, zf - .005],
    ], [1, 0, 0], divM, [.8, .8, 1, 1], [[yMin, zb], [yMax, zb], [yMax, zf], [yMin, zf]]);
  }
}

// ---------------------------------------------------------------------------
// Shaders (WebGL 1 / GLSL ES 1.00)
// ---------------------------------------------------------------------------
const PLACE = `
uniform vec4 halfMotion, shockA, shockB;
uniform float spread, time;
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float surgeAt(vec2 p, vec4 s) {
  if (s.w <= 0. || s.z > 3.2) return 0.;
  float d = length(p - s.xy);
  float r = s.z * .98;
  float x = (d - r) / (.055 + s.z * .04);
  return s.w * exp(-x * x) * exp(-s.z * 1.35);
}

void place(vec3 p, vec3 n, float part, float isMote, float seed, out vec3 wp, out vec3 wn, out float wave) {
  wave = surgeAt(p.xy, shockA) + surgeAt(p.xy, shockB);
  vec3 lp = p;
  if (isMote > .5) {
    // Gentle quantum levitation on suspended micro-voxel motes!
    float ph = time * 1.6 + seed * 6.283;
    lp.x += sin(ph * .9) * .0055;
    lp.y += cos(ph * 1.15) * .0075;
    lp.z += sin(ph * .75 + 1.4) * .0065 + wave * .018;
  }
  bool upper = part < .5;
  mat2 R = rot2(upper ? -halfMotion.z : -halfMotion.w);
  vec2 piv = upper ? vec2(.50, .46) : vec2(.58, 1.22);
  vec2 off = upper ? vec2(halfMotion.x, -spread) : vec2(halfMotion.y, spread);
  wp = vec3(R * (lp.xy - piv) + piv + off, lp.z);
  wn = vec3(R * n.xy, n.z);
}
`;

const voxelVert = `precision highp float;
attribute vec4 aPos, aNrm, aUv, aExt;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift;
${PLACE}
varying vec3 vObj, vView, vN;
varying vec4 vUv, vExt;
varying float vAo, vWave;
void main() {
  vec3 wp, wn; float wave;
  float isMote = abs(aUv.z - 3.) < .5 ? 1. : 0.;
  place(aPos.xyz, aNrm.xyz, aPos.w, isMote, aUv.w, wp, wn, wave);
  vec3 q = vec3(wp.x - ${CX}, wp.y - ${CY} + lift, wp.z);
  vec3 vp = vec3(dot(row1, q), dot(row2, q), dot(row3, q));
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + vp.z);
  vec2 screen = centre + size * vp.xy * persp;
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, vp.z * .25, 1.);
  vObj = wp;
  vView = vp;
  vN = vec3(dot(row1, wn), dot(row2, wn), dot(row3, wn));
  vUv = aUv;
  vExt = aExt;
  vAo = aNrm.w;
  vWave = wave;
}`;

const voxelFrag = `precision highp float;
uniform vec3 keyV, rimV, pinkV;
uniform float time, pulse, glow;
varying vec3 vObj, vView, vN;
varying vec4 vUv, vExt;
varying float vAo, vWave;

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

vec3 cyberEnv(vec3 r, float rough) {
  vec3 c = mix(vec3(.04, .05, .14), vec3(.12, .08, .28), r.y * .5 + .5);
  // Crisp cyan-blue overhead softbox strip & hot-magenta side reflector (Image 2 lighting!)
  c += vec3(.45, .85, 1.65) * smoothstep(.42, .85, -r.y) * mix(1.4, .4, rough);
  c += vec3(1.55, .28, 1.15) * smoothstep(.28, .88, r.x) * mix(1.2, .35, rough);
  c += vec3(.25, .45, 1.55) * smoothstep(.32, .88, -r.x) * mix(1.1, .35, rough);
  return c;
}

vec3 toneACES(vec3 c) {
  c *= 1.02;
  c = (c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14);
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2));
}

void main() {
  float kind = floor(vUv.z + .5);
  float seed = vUv.w;
  float bounce = vExt.x;
  float pathT = vExt.y;
  float depthZ = vExt.w;
  vec3 N = normalize(vN);
  vec3 V = normalize(vec3(0., 0., -${D_CAM.toFixed(1)}) - vView);
  float NdV = max(dot(N, V), 0.);

  // Crisp micro-cube face bezel framing (gives every individual voxel its Lego-crystal jewel precision!)
  vec2 cellD = abs(vUv.xy - .5) * 2.;
  float edgeDist = max(cellD.x, cellD.y);
  float bevelLip = smoothstep(.70, .90, edgeDist);
  float groove = smoothstep(.86, .99, edgeDist);
  // Subtle internal crystalline sub-cube translucency & specular core
  float centerGlow = 1. - smoothstep(.0, .84, length(vUv.xy - .5) * 1.414);
  // Steep AO so deep voxel crevices plunge into rich royal-indigo shadow (Image 2 high-contrast depth!)
  float ao = pow(clamp(vAo, .18, 1.), 1.65);

  vec3 albedo = vec3(.02, .05, .48);
  float rough = .14, metal = .10;
  vec3 emit = vec3(0.);

  // Animated light-speed quantum data wave travelling along the 3D neural pathways!
  float pkt1 = pow(.5 + .5 * sin(pathT * 12.566 - time * 3.8), 6.);
  float pkt2 = pow(.5 + .5 * sin(pathT * 25.132 + time * 2.4 + seed * 6.28), 7.);
  float dataPulse = clamp(pkt1 * .90 + pkt2 * .45 + vWave * 1.6 + pulse * .45, 0., 2.4);

  if (kind < .5) {
    // 0: Deep Jewel Translucent Sapphire-Cobalt Crystal Voxel Tower (EXACT Image 2 faceted sapphire cubes!)
    vec3 abyssCob = vec3(.006, .014, .22);
    vec3 royalSap = vec3(.024, .090, .82);
    vec3 elecInd = vec3(.14, .055, .76);
    // Directional facet variation per axis (top brighter electric sapphire, sides richer royal indigo!)
    float facet = .68 + .32 * clamp(-N.y * .7 + N.z * -.3 + .35, 0., 1.);
    albedo = mix(abyssCob, royalSap, .25 + .48 * seed + .27 * depthZ) * facet;
    albedo = mix(albedo, elecInd, bevelLip * .38);
    albedo *= 1. - groove * .86;
    rough = .09 + .12 * groove;
    metal = .18;
    // Internal glassy sapphire refraction glow + directional neon-magenta radiosity bounce from nearby HOT buses!
    vec3 pinkRad = vec3(1.14, .09, .80) * bounce * bounce * (.58 + .42 * dataPulse);
    vec3 blueSub = vec3(.024, .11, .70) * (.18 + .44 * centerGlow) * (.35 + .65 * depthZ) * facet;
    emit += (blueSub + pinkRad * (.45 + .55 * bevelLip)) * (.30 + .70 * ao) * (1. - groove * .74);
    emit += vec3(.14, .56, 1.42) * bevelLip * (1. - groove) * .26 * pow(1. - NdV, 1.35);
  } else if (kind < 1.5) {
    // 1: Blazing Pure White-Hot / Hyper-Saturated Neon-Pink Emissive Neural Bus Voxel!
    albedo = vec3(.98, .72, .94);
    rough = .16;
    vec3 hotPink = vec3(1.55, .18, 1.05);
    vec3 pureWhite = vec3(2.85, 2.55, 2.88);
    // Blazing pearl-white core with crisp electric hot-magenta cube edges!
    vec3 busCol = mix(hotPink, pureWhite, smoothstep(.24, .88, centerGlow) * .88 + .12 * clamp(dataPulse, 0., 1.));
    busCol = mix(busCol, vec3(1.25, .12, .88), groove * .78);
    emit = busCol * (1.12 + .65 * dataPulse) * (.88 + .22 * glow);
  } else if (kind < 2.5) {
    // 2: Hyper-Saturated Electric-Magenta / Deep Violet Crystal Voxel bordering the white-hot bus!
    albedo = vec3(.34, .035, .64);
    rough = .12;
    metal = .14;
    vec3 mag = mix(vec3(.38, .04, .92), vec3(1.38, .16, .88), .35 + .45 * centerGlow + .2 * seed);
    emit = mag * (.42 + .48 * bounce + .52 * dataPulse) * (.38 + .62 * ao) * (1. - groove * .72);
  } else if (kind < 3.5) {
    // 3: Floating Quantum Micro-Voxel Mote suspended in empty glass atriums!
    bool isHotMote = vExt.z > .5;
    albedo = isHotMote ? vec3(1., .76, .96) : vec3(.08, .28, .96);
    rough = .08;
    float twink = .62 + .38 * sin(time * 3.2 + seed * 31.4);
    emit = isHotMote
      ? mix(vec3(1.45, .24, 1.02), vec3(2.5, 2.2, 2.55), twink * .65) * (1. + vWave)
      : vec3(.10, .42, 1.65) * (.75 + .55 * twink + vWave);
  } else if (kind < 4.5) {
    // 4: Mirror-Gloss Electric-Sky-Blue Anodized Hardware Cradle Lip (EXACT Image 2 glossy blue pad!)
    albedo = mix(vec3(.04, .22, .86), vec3(.14, .62, 1.0), smoothstep(-.35, .65, -N.y));
    rough = .10;
    metal = .68;
    emit += vec3(.02, .14, .48) * .24 + vec3(1.0, .14, .76) * pow(1. - NdV, 2.4) * .28;
  } else if (kind < 5.5) {
    // 5: Blazing Hyper-Saturated Hot-Pink Neon Trim Light-Guide Strip (Image 2 layered neon base!)
    albedo = vec3(1., .16, .74);
    rough = .18;
    float waveP = .74 + .26 * sin(vUv.x * 10. - time * 2.8);
    // Crisp dark machined trim seam at top & bottom of the neon strip!
    float seam = smoothstep(.86, .98, abs(vUv.y - .5) * 2.);
    emit = mix(vec3(1.85, .10, .88), vec3(2.55, .72, 1.95), waveP * .52) * (1.15 + .35 * glow + .85 * vWave) * (1. - seam * .82);
  } else {
    // 6: Dark Brushed Indigo-Chrome Hardware Chassis
    albedo = vec3(.022, .026, .085);
    rough = .22;
    metal = .86;
  }

  float a = max(.032, rough * rough);
  vec3 diff = albedo * (1. - metal);
  vec3 F0 = mix(vec3(.055), albedo * .75 + .25, metal);

  // Sculpted high-contrast cybernetic studio rig (keeps shadows deep sapphire, highlights crisp!)
  vec3 col = shadeGGX(N, V, keyV, vec3(1.25, 1.48, 2.05), diff, F0, a) * ao;
  col += shadeGGX(N, V, pinkV, vec3(1.75, .20, 1.25), diff, F0, a) * mix(.32, 1., ao);
  col += shadeGGX(N, V, rimV, vec3(.28, .72, 1.65), diff, F0, a) * mix(.32, 1., ao);

  // Studio environment reflections
  vec3 R = reflect(-V, N);
  vec3 Fe = F0 + (max(vec3(1. - a), F0) - F0) * pow(1. - NdV, 5.);
  col += cyberEnv(R, rough) * Fe * mix(.28, 1., ao) * .78;

  // Tactile click quantum surge wave rippling across the entire 3D lattice!
  col += mix(vec3(.18, .82, 1.45), vec3(1.55, .24, 1.15), seed) * vWave * 1.05;
  col += emit;

  gl_FragColor = vec4(toneACES(col), 1.);
}`;

// Outer Crystal Micro-Grid Glass Containment Enclosure Shader (Premultiplied Alpha!)
const glassVert = `precision highp float;
attribute vec4 aPos, aNrm, aUv, aExt;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift;
${PLACE}
varying vec3 vObj, vView, vN;
varying vec4 vUv;
varying float vWave;
void main() {
  vec3 wp, wn; float wave;
  place(aPos.xyz, aNrm.xyz, aPos.w, 0., aUv.w, wp, wn, wave);
  vec3 q = vec3(wp.x - ${CX}, wp.y - ${CY} + lift, wp.z);
  vec3 vp = vec3(dot(row1, q), dot(row2, q), dot(row3, q));
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + vp.z);
  vec2 screen = centre + size * vp.xy * persp;
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, vp.z * .25, 1.);
  vObj = wp;
  vView = vp;
  vN = vec3(dot(row1, wn), dot(row2, wn), dot(row3, wn));
  vUv = aUv;
  vWave = wave;
}`;

const glassFrag = `precision highp float;
uniform vec3 keyV, rimV, pinkV;
uniform float time, pixel, pulse, glow, passSide;
varying vec3 vObj, vView, vN;
varying vec4 vUv;
varying float vWave;

float gridLine(float c, float w) {
  float d = abs(fract(c + .5) - .5);
  return 1. - smoothstep(0., max(w, .002), d);
}

void main() {
  float kind = floor(vUv.z + .5); // 0=front, 1=bevel, 2=wall, 3=divider
  vec3 rawN = normalize(vN);
  vec3 V = normalize(vec3(0., 0., -${D_CAM.toFixed(1)}) - vView);
  float facing = dot(rawN, V);
  // Separate interior back-facing glass walls (passSide 0) from front glass walls (passSide 1)
  // purely via surface normal so winding stays 100% consistent across all geometry.
  if (kind < 2.5) {
    if (passSide < .5 && facing >= 0.) discard;
    if (passSide >= .5 && facing < 0.) discard;
  } else if (passSide >= .5) {
    discard;
  }
  vec3 N = facing < 0. ? -rawN : rawN;
  float NdV = clamp(dot(N, V), 0., 1.);
  float fresnel = pow(1. - NdV, 2.8);

  // Signature Image 2 crystal-clear optical glass with razor-sharp micro-dot holographic mesh!
  vec2 guv = vUv.xy;
  float fineFreq = kind > 1.5 ? 88. : 76.;
  float fw = clamp(pixel * fineFreq * 1.05, .055, .30);
  float microX = gridLine(guv.x * fineFreq, fw);
  float microY = gridLine(guv.y * fineFreq, fw);
  // Crisp glittering pinpoint dot-grid + whisper-thin mesh lines (never milky haze!)
  float microDot = microX * microY;
  float microMesh = max(microX, microY) * .28 + microDot * .88;

  // Crisp architectural glass pane dividers (razor-thin luminous mullions matching Image 2!)
  float majFreq = kind > 1.5 ? 4.6 : 2.8;
  float mw = clamp(pixel * majFreq * 1.15, .005, .028);
  float mullion = max(gridLine(guv.x * majFreq + .12, mw), gridLine(guv.y * majFreq + .08, mw));

  // Fine vertical prismatic refraction striations along the curved outer glass walls!
  float vStri = kind > 1.5 && kind < 2.5
    ? pow(.5 + .5 * sin(guv.x * 230. + vView.x * 9.), 5.) * .38 : 0.;

  // Sharp optical specular reflections on the crystal glass
  vec3 Hk = normalize(keyV + V);
  vec3 Hp = normalize(pinkV + V);
  vec3 Hr = normalize(rimV + V);
  float specK = pow(max(dot(N, Hk), 0.), 128.);
  float specP = pow(max(dot(N, Hp), 0.), 64.);
  float specR = pow(max(dot(N, Hr), 0.), 84.);

  // Chromatic iridescent glass reflection (deep sapphire-violet & hot neon-pink, zero milky white!)
  float rimF = pow(1. - NdV, 3.6);
  vec3 irid = mix(vec3(.24, .58, 1.15), vec3(1.15, .20, .92), smoothstep(-.45, .55, N.x + N.y * .4));
  vec3 col = irid * (rimF * .92 + .018);
  // Keep front center 97% optically crystal-clear so every deep sapphire & white-pink voxel pops!
  float meshVis = kind < .5 ? (.09 + .82 * rimF + .5 * vWave) : (.34 + .66 * rimF + .4 * vWave);
  col += mix(vec3(.65, .86, 1.2), vec3(1.25, .42, 1.05), .50 + .35 * sin(guv.y * 9.)) * microMesh * meshVis * .52;
  col += vec3(.98, .78, 1.15) * mullion * (kind > 2.5 ? .34 : .58);
  col += vec3(.75, .28, 1.15) * vStri * (.38 + .62 * rimF);

  // Polished 45-deg glass chamfers catch razor-sharp pearl-white, hot-pink & cyan specular fire!
  if (abs(kind - 1.) < .5) {
    col += mix(vec3(.55, .90, 1.45), vec3(1.55, .36, 1.25), .5 + .5 * N.x) * (.68 + .62 * rimF);
  }
  col += vec3(1.55, 1.62, 1.80) * specK * 1.05;
  col += vec3(1.45, .28, 1.15) * specP * .72;
  col += vec3(.32, .88, 1.65) * specR * .72;
  col += vec3(.42, .95, 1.45) * vWave * (.45 + .95 * microMesh);

  // Ultra-clean premultiplied optical alpha: crystal transparent across front voxels, crisp on bevels/edges!
  float baseAlpha = kind < .5 ? (.012 + .24 * rimF + .08 * microMesh * meshVis + .18 * mullion)
    : (abs(kind - 1.) < .5 ? (.26 + .48 * rimF)
    : (kind > 2.5 ? (.04 + .12 * rimF + .12 * mullion)
    : (.06 + .32 * rimF + .14 * microMesh + .16 * mullion + .12 * vStri)));
  if (passSide < .5) {
    col *= .38;
    baseAlpha *= .32;
  }
  float a = clamp(baseAlpha + (specK + specP * .55) * .42 + vWave * .16, 0., .84);
  vec3 outC = col / (1. + max(col.r, max(col.g, col.b)) * .30);
  gl_FragColor = vec4(outC * (a + .14), a);
}`;

// Radiant Electric-Blue & Hot-Pink PCB Floor Reflection Pool + Soft Shadow beneath the B!
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
uniform float sway, lift, lightAngle, pulse, time;
varying vec2 vUv;
void main() {
  vec2 q = vUv;
  float r2 = dot(q / vec2(.84, .62), q / vec2(.84, .62));
  // Soft dark contact occlusion directly under the monolith
  float ao = exp(-dot((q - vec2(-.04, .05)) / vec2(.42, .26), (q - vec2(-.04, .05)) / vec2(.42, .26)) * 3.2);
  // Radiant hot-pink + sapphire-blue underglow bouncing onto the etched circuit board!
  vec2 pinkP = (q - vec2(.06 - sway * .12, -.02)) / vec2(.76, .54);
  vec2 blueP = (q - vec2(-.18 - sway * .10, .06)) / vec2(.88, .62);
  float gPink = exp(-dot(pinkP, pinkP) * 2.6) * (.32 + .14 * pulse + .04 * sin(time * 2.1));
  float gBlue = exp(-dot(blueP, blueP) * 2.2) * (.36 + .10 * pulse);
  float halo = exp(-r2 * 1.9);
  vec3 glowCol = vec3(1.0, .24, .82) * gPink + vec3(.14, .48, 1.0) * gBlue;
  float alpha = clamp(ao * .48 * (1. - lift * 2.5), 0., .55);
  vec3 premul = vec3(.01, .01, .04) * alpha + glowCol * halo;
  gl_FragColor = vec4(premul, clamp(alpha + (gPink + gBlue) * .25, 0., .85));
}`;

// Optical Bloom Sprites (Octane-style camera glow over blazing voxel hubs & corner glints)
const spriteVert = `precision highp float;
attribute vec4 aCenter, aCorner, aColor, aParam;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift, pulse, glow;
${PLACE}
varying vec2 vCorner;
varying vec3 vColor;
void main() {
  vec3 wp, wn; float wave;
  place(aCenter.xyz, vec3(0., 0., 1.), aCenter.w, 0., aParam.y, wp, wn, wave);
  vec3 q = vec3(wp.x - ${CX}, wp.y - ${CY} + lift, wp.z);
  vec3 vp = vec3(dot(row1, q), dot(row2, q), dot(row3, q));
  vp.z -= aCorner.w;
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + vp.z);
  vec2 screen = centre + size * persp * (vp.xy + aCorner.xy * aCorner.z * (1. + .22 * pulse + .35 * wave));
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  float throb = .72 + .28 * sin(time * aParam.x + aParam.y);
  vColor = aColor.rgb * aColor.a * throb * (.85 + .25 * glow + .85 * wave);
  vCorner = aCorner.xy;
  gl_Position = vec4(clip.x, -clip.y, vp.z * .25, 1.);
}`;

const spriteFrag = `precision highp float;
varying vec2 vCorner;
varying vec3 vColor;
void main() {
  float r2 = dot(vCorner, vCorner);
  if (r2 > 1.) discard;
  float core = exp(-r2 * 26.);
  float halo = exp(-sqrt(r2) * 5.2) * (1. - r2);
  vec3 c = vColor * (core * .78 + halo * .34);
  c = c / (1. + max(c.r, max(c.g, c.b)) * .45);
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)) * .28, 0., .50));
}`;

// Photonic Diagonal Kerf Ribbons (electric lime-cyan core + neon-magenta data stream!)
const ribbonVert = `precision highp float;
attribute vec4 aClip, aColor;
varying float vAcross;
varying vec4 vColor;
void main() {
  vAcross = aClip.w;
  vColor = aColor;
  gl_Position = vec4(aClip.xyz, 1.);
}`;

const ribbonFrag = `precision highp float;
varying float vAcross;
varying vec4 vColor;
void main() {
  float x = vAcross;
  float body = exp(-x * x * 3.4);
  float core = exp(-x * x * 24.);
  vec3 c = vColor.rgb * (body * .52 + core * .95) * vColor.a;
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)) * .45, 0., .75));
}`;

const SPRITE_FLOATS = 16;
function buildSpriteBuffer(list) {
  const data = new Float32Array(list.length * 4 * SPRITE_FLOATS);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  list.forEach((l, i) => {
    for (let k = 0; k < 4; k++) {
      const o = (i * 4 + k) * SPRITE_FLOATS;
      data[o] = l.p[0]; data[o + 1] = l.p[1]; data[o + 2] = l.p[2]; data[o + 3] = l.part;
      data[o + 4] = corners[k][0]; data[o + 5] = corners[k][1]; data[o + 6] = l.size; data[o + 7] = l.bias ?? .035;
      data[o + 8] = l.color[0]; data[o + 9] = l.color[1]; data[o + 10] = l.color[2]; data[o + 11] = l.intensity;
      data[o + 12] = l.speed ?? 2; data[o + 13] = l.phase ?? 0; data[o + 14] = 1; data[o + 15] = 0;
    }
  });
  return data;
}
function quadIndices(count) {
  const idx = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  return idx;
}

export function initVoxelGlass(gl, { software, outlines, filament }) {
  if (!outlines) return null;
  const voxelProg = program(gl, voxelVert, voxelFrag);
  const glassProg = program(gl, glassVert, glassFrag);
  const floorProg = program(gl, floorVert, floorFrag);
  const spriteProg = program(gl, spriteVert, spriteFrag);
  const ribbonProg = program(gl, ribbonVert, ribbonFrag);
  if (!voxelProg || !glassProg || !floorProg || !spriteProg || !ribbonProg) return null;

  const rng = rngOf(0xC7BE2026);
  const solidMesh = new Mesh();
  const glassMesh = new Mesh();
  const bloomSprites = [];

  outlines.forEach((o, part) => {
    buildHardwareCradle(solidMesh, o, part);
    buildVoxelCore(solidMesh, bloomSprites, part, rng);
    buildGlassEnclosure(glassMesh, o, part);
  });

  // Add subtle photonic kerf glow sprites along the diagonal cut!
  const [[fx0, fy0], [fx1, fy1]] = filament || [[.09, KERF_MID - SLOPE * .09], [.96, KERF_MID - SLOPE * .96]];
  const beamA = [fx0, fy0, 0], beamB = [fx1, fy1, 0];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = [fx0 + (fx1 - fx0) * t, fy0 + (fy1 - fy0) * t, .04];
    bloomSprites.push({
      p, part: 2,
      size: i % 2 === 0 ? .13 : .075,
      color: i % 3 === 0 ? [.52, 1.0, .62] : [1.0, .42, .92],
      intensity: i % 2 === 0 ? .16 : .28,
      speed: 2.6, phase: t * 9.0, bias: .03,
    });
  }

  const solidChunks = solidMesh.upload(gl);
  const glassChunks = glassMesh.upload(gl);

  const floorVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, floorVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  const spriteVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteVbo);
  gl.bufferData(gl.ARRAY_BUFFER, buildSpriteBuffer(bloomSprites), gl.STATIC_DRAW);
  const spriteIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spriteIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(bloomSprites.length), gl.STATIC_DRAW);

  // Two intertwined photonic ribbons along the diagonal kerf (lime-cyan core + hot-pink energy filament)
  const RIB_N = 26, RIB_COUNT = 2;
  const ribData = new Float32Array(RIB_COUNT * RIB_N * 2 * 8);
  const ribVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ribVbo);
  gl.bufferData(gl.ARRAY_BUFFER, ribData.byteLength, gl.DYNAMIC_DRAW);
  const ribIdx = new Uint16Array(RIB_COUNT * (RIB_N - 1) * 6);
  for (let r = 0; r < RIB_COUNT; r++) {
    for (let k = 0; k < RIB_N - 1; k++) {
      const b = (r * RIB_N + k) * 2, o = (r * (RIB_N - 1) + k) * 6;
      ribIdx.set([b, b + 1, b + 3, b, b + 3, b + 2], o);
    }
  }
  const ribIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ribIdx, gl.STATIC_DRAW);

  const uniforms = prog => {
    const map = {};
    return name => (name in map ? map[name] : (map[name] = gl.getUniformLocation(prog, name)));
  };
  const uv = uniforms(voxelProg), ug = uniforms(glassProg), uf = uniforms(floorProg), us = uniforms(spriteProg);
  const attribs = (prog, names) => names.map(n => gl.getAttribLocation(prog, n));
  const voxA = attribs(voxelProg, ['aPos', 'aNrm', 'aUv', 'aExt']);
  const glsA = attribs(glassProg, ['aPos', 'aNrm', 'aUv', 'aExt']);
  const sprA = attribs(spriteProg, ['aCenter', 'aCorner', 'aColor', 'aParam']);
  const ribA = attribs(ribbonProg, ['aClip', 'aColor']);
  const floorLoc = gl.getAttribLocation(floorProg, 'p');

  const bindAttribs = locs => {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    locs.forEach((loc, k) => {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
    });
  };
  const drawChunks = (chunks, locs) => {
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
  const KEY = norm3([-.56, -.74, -.38]);
  const PINK_L = norm3([.76, -.12, -.64]);
  const RIM = norm3([.24, -.72, .65]);
  const sp = new Float32Array(RIB_N * 4);

  function setCommon(u, p) {
    gl.uniform3fv(u('row1'), p.rows[0]);
    gl.uniform3fv(u('row2'), p.rows[1]);
    gl.uniform3fv(u('row3'), p.rows[2]);
    gl.uniform4f(u('box'), p.box[0], p.box[1], p.box[2], p.box[3]);
    gl.uniform2f(u('centre'), p.centre[0], p.centre[1]);
    gl.uniform1f(u('size'), p.size);
    gl.uniform1f(u('lift'), p.lift);
    gl.uniform1f(u('spread'), p.spread);
    gl.uniform1f(u('time'), p.time);
    gl.uniform4f(u('halfMotion'), p.halfMotion[0], p.halfMotion[1], p.halfMotion[2], p.halfMotion[3]);
    gl.uniform4fv(u('shockA'), p.shocks[0]);
    gl.uniform4fv(u('shockB'), p.shocks[1]);
  }

  return {
    render(params, { box, ratio }) {
      const { rows, centre, size, lift, shift, sway = 0, pulse = 0, ground, lightAngle = 0, time = 0,
        shocks = [[0, 0, 9, 0], [0, 0, 9, 0]], halfMotion = [0, 0, 0, 0], glow = 1 } = params;
      const spread = Math.abs(shift[1]);
      const key = rotY(KEY, lightAngle);
      const pink = rotY(PINK_L, lightAngle * .6);
      const rim = rotY(RIM, lightAngle * .5);
      const common = { rows, box, centre, size, lift, spread, time, halfMotion, shocks };

      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE);

      // Pass 1: Radiant sapphire + hot-pink reflection pool & shadow on the dark PCB floor
      if (ground) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
        gl.useProgram(floorProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, floorVbo);
        gl.enableVertexAttribArray(floorLoc);
        gl.vertexAttribPointer(floorLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform4fv(uf('box'), box);
        gl.uniform4f(uf('shadow'), ground[0], ground[1] + size * .02, ground[2] * 1.18, ground[3] * 1.32);
        gl.uniform1f(uf('sway'), sway);
        gl.uniform1f(uf('lift'), lift);
        gl.uniform1f(uf('lightAngle'), lightAngle);
        gl.uniform1f(uf('pulse'), pulse);
        gl.uniform1f(uf('time'), time);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(floorLoc);
      }

      // Pass 2: Solid 3D Quantum Voxel Core + Floating Micro-Motes + Blue/Pink Hardware Cradle
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(voxelProg);
      setCommon(uv, common);
      gl.uniform3fv(uv('keyV'), key);
      gl.uniform3fv(uv('pinkV'), pink);
      gl.uniform3fv(uv('rimV'), rim);
      gl.uniform1f(uv('pulse'), pulse);
      gl.uniform1f(uv('glow'), Math.min(1.5, glow));
      drawChunks(solidChunks, voxA);

      // Pass 3: Photonic Diagonal Kerf Ribbons (lime-cyan BennieTech core + hot-pink harmonic stream)
      const writeRibbon = (rIdx, zOff, ampY, freq, speed, widthU, color, gain) => {
        for (let k = 0; k < RIB_N; k++) {
          const t = k / (RIB_N - 1);
          const waveY = Math.sin(t * freq - time * speed) * ampY * Math.sin(t * Math.PI);
          const px = beamA[0] + (beamB[0] - beamA[0]) * t;
          const py = beamA[1] + (beamB[1] - beamA[1]) * t + waveY;
          const qx = px - CX, qy = py - CY + lift, qz = zOff;
          const vx = rows[0][0] * qx + rows[0][1] * qy + rows[0][2] * qz;
          const vy = rows[1][0] * qx + rows[1][1] * qy + rows[1][2] * qz;
          const vz = rows[2][0] * qx + rows[2][1] * qy + rows[2][2] * qz;
          const persp = D_CAM / (D_CAM + vz);
          sp[k * 4] = centre[0] + size * vx * persp;
          sp[k * 4 + 1] = centre[1] + size * vy * persp;
          sp[k * 4 + 2] = vz * .25;
          sp[k * 4 + 3] = persp;
        }
        const base = rIdx * RIB_N * 2 * 8;
        for (let k = 0; k < RIB_N; k++) {
          const a = Math.max(0, k - 1), b = Math.min(RIB_N - 1, k + 1);
          let dx = sp[a * 4] - sp[b * 4], dy = sp[a * 4 + 1] - sp[b * 4 + 1];
          const l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;
          const t = k / (RIB_N - 1);
          const wpx = widthU * size * sp[k * 4 + 3] + .5;
          const run = ((t * 1.8 - time * (speed * .22)) % 1 + 1) % 1 - .5;
          const pkt = Math.exp(-run * run / .008);
          const ends = Math.min(1, t * 14, (1 - t) * 14);
          const alpha = (.85 + 1.55 * pkt) * ends * gain * Math.min(1.5, glow) * (1 + .55 * pulse);
          for (const side of [-1, 1]) {
            const o = base + (k * 2 + (side > 0 ? 1 : 0)) * 8;
            const sx = sp[k * 4] - dy * wpx * side;
            const sy = sp[k * 4 + 1] + dx * wpx * side;
            ribData[o] = (sx - box[0]) / box[2] * 2 - 1;
            ribData[o + 1] = -((sy - box[1]) / box[3] * 2 - 1);
            ribData[o + 2] = sp[k * 4 + 2];
            ribData[o + 3] = side;
            ribData[o + 4] = color[0]; ribData[o + 5] = color[1]; ribData[o + 6] = color[2];
            ribData[o + 7] = alpha;
          }
        }
      };
      writeRibbon(0, .03, .003, 12, 3.2, .0095, [.48, 1.0, .68], .92);
      writeRibbon(1, .06, .011, 18, -4.4, .007, [1.0, .38, .92], .78);

      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(ribbonProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, ribVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribData);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribIbo);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      ribA.forEach((loc, k) => {
        if (loc < 0) return;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, k * 16);
      });
      gl.drawElements(gl.TRIANGLES, RIB_COUNT * (RIB_N - 1) * 6, gl.UNSIGNED_SHORT, 0);

      // Pass 4: Outer Crystal Micro-Grid Glass Containment Enclosure (2-pass back then front!)
      gl.disable(gl.CULL_FACE);
      gl.useProgram(glassProg);
      setCommon(ug, common);
      gl.uniform3fv(ug('keyV'), key);
      gl.uniform3fv(ug('pinkV'), pink);
      gl.uniform3fv(ug('rimV'), rim);
      gl.uniform1f(ug('pixel'), 1 / (size * ratio));
      gl.uniform1f(ug('pulse'), pulse);
      gl.uniform1f(ug('glow'), Math.min(1.5, glow));
      // 4A: Interior rear glass faces & internal divider panes
      gl.uniform1f(ug('passSide'), 0);
      drawChunks(glassChunks, glsA);
      // 4B: Front-facing crystal micro-grid panes, polished 45-deg chamfers & curved walls
      gl.uniform1f(ug('passSide'), 1);
      drawChunks(glassChunks, glsA);

      // Pass 5: Soft Optical Bloom Halos over blazing white-pink voxel hubs & kerf nodes!
      if (!software || bloomSprites.length) {
        gl.useProgram(spriteProg);
        setCommon(us, common);
        gl.uniform1f(us('pulse'), pulse);
        gl.uniform1f(us('glow'), Math.min(1.5, glow));
        gl.bindBuffer(gl.ARRAY_BUFFER, spriteVbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spriteIbo);
        bindAttribs(sprA);
        gl.drawElements(gl.TRIANGLES, bloomSprites.length * 6, gl.UNSIGNED_SHORT, 0);
      }

      gl.depthMask(true);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      return true;
    },
  };
}
