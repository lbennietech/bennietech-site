// The two halves share a groom of short down, swept awn hairs and longer,
// banded guard hairs. Rest curves belong to each follicle. Nearby simulated
// guides supply just the displacement, so even a sharp shoulder keeps its nap.
import { program } from './gl/gl.js';

const SLOPE = 0.27875;
const NORM = 1 / Math.hypot(SLOPE, 1);
const D_CAM = 10.5;
const SEGMENTS = 6;
const NUM_GUIDES = 480;
const GUIDE_TEX_W = 512;
const GUIDE_TEX_H = 2; // Midpoint and tip displacement from the combed pose.
const PACK_RANGE = 0.32;
const COUNTS = [10240, 49152, 90112];
const SHADOW_SIZE = 512;
const SHADOW_RADIUS = 1.28;

// The pillowed skin supplies surface samples, collision distances and brush hits.
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

function halfRound(px, py, cx, cy, r) {
  const dx = Math.max(px - cx, 0);
  const dy = py - cy;
  return Math.hypot(dx, dy) - r;
}

function sdBHalf2D(px, py, part) {
  const dStem = -px;
  let dBowl, dCut;
  if (part === 0) {
    dBowl = halfRound(px, py, 0.57, 0.43, 0.43);
    dCut = ((py + SLOPE * px) - 0.908) * NORM;
  } else {
    dBowl = halfRound(px, py, 0.71, 1.20, 0.49);
    dCut = (1.052 - (py + SLOPE * px)) * NORM;
  }
  return smax(smax(dStem, dBowl, 0.022), dCut, 0.018);
}

function sdBHalf(px, py, pz, part) {
  const d2d = sdBHalf2D(px, py, part);
  const crown = .143 * (1 - Math.exp(Math.min(0, d2d) * 4.2));
  const halfZ = .198 + crown;
  const dz = Math.abs(pz) - halfZ;
  const bev = d2d * 0.72 + dz * 0.69 + 0.084;
  return smax(smax(d2d, dz, 0.024), bev, 0.022);
}

function gradBHalf(px, py, pz, part, out) {
  const e = 0.0018;
  const d0 = sdBHalf(px + e, py - e, pz - e, part);
  const d1 = sdBHalf(px - e, py - e, pz + e, part);
  const d2 = sdBHalf(px - e, py + e, pz - e, part);
  const d3 = sdBHalf(px + e, py + e, pz + e, part);
  const nx = d0 - d1 - d2 + d3;
  const ny = -d0 - d1 + d2 + d3;
  const nz = -d0 + d1 - d2 + d3;
  const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
  out[0] = nx * inv;
  out[1] = ny * inv;
  out[2] = nz * inv;
  return out;
}

function projectToBHalf(cx, cy, cz, dx, dy, dz, part, out) {
  let lo = 0.02, hi = 1.05;
  for (let i = 0; i < 16; i++) {
    const mid = 0.5 * (lo + hi);
    if (sdBHalf(cx + dx * mid, cy + dy * mid, cz + dz * mid, part) < 0) lo = mid;
    else hi = mid;
  }
  const t = 0.5 * (lo + hi);
  out[0] = cx + dx * t;
  out[1] = cy + dy * t;
  out[2] = cz + dz * t;
  return out;
}

const _tmpG = new Float32Array(3);
function snapToBHalf(p, part) {
  for (let i = 0; i < 3; i++) {
    const d = sdBHalf(p[0], p[1], p[2], part);
    if (Math.abs(d) < 1e-4) break;
    gradBHalf(p[0], p[1], p[2], part, _tmpG);
    p[0] -= _tmpG[0] * d;
    p[1] -= _tmpG[1] * d;
    p[2] -= _tmpG[2] * d;
  }
}

// Tapered violet markings follow the two flanks and continue around the barrel.
function streakField(x, y, z) {
  const across = x - 0.28 * y + 0.47 * z + 0.078 * Math.sin(y * 4.4 - z * 2.2)
    + 0.028 * Math.sin(x * 8.2 + y * 5.7 + z * 4.1);
  const flank = Math.abs(across - 0.57 - 0.045 * Math.cos(y * 3.8));
  const saddle = Math.abs(across - 0.09 + 0.043 * Math.sin(y * 5.8));
  const w = 0.094 + 0.043 * Math.sin(y * 4.6 + 0.6);
  const fine = Math.abs(across + 0.23 + 0.036 * Math.cos(y * 6.2));
  return Math.max(1 - smoothstep(w * .48, w + .025, flank),
    1 - smoothstep(.030, .091 + .024 * Math.cos(y * 5.2), saddle),
    (1 - smoothstep(.012, .043, fine)) * (.64 + .30 * Math.sin(y * 3.4)));
}

function groomDirection(px, py, pz, nx, ny, nz, part, outDir, outLenScale) {
  const v = part ? py - 0.95 : py;
  const parting = (part ? .46 : .32) + .08 * Math.sin(v * 5.1 + part * 1.8) - .12 * v;
  const fan = Math.tanh((px - parting) * 6.8);
  const flank = smoothstep(.38, 1.05, px);
  const nearCut = 1 - smoothstep(.065, .21, Math.abs((py + SLOPE * px - .98) * NORM));
  // The crown parts above the shoulder. The cheek sweeps around the barrel,
  // then falls into a longer ruff. At the cut the short nap lies along the lip.
  let fx = .19 + .72 * fan + .31 * Math.cos(v * 5.3 + 1.5 * px + part * 1.4)
    + (part ? -.14 : .36) * nearCut;
  let fy = .86 - .24 * flank + .15 * Math.sin(px * 5.7 + v * 3.3)
    - (part ? 0 : .57) * nearCut;
  // An eccentric whorl opens the crown. Its influence fades before the
  // long flank so the surrounding locks still follow the sweep of the coat.
  const wx = px - (part ? .67 : .26), wy = v - (part ? .17 : .24);
  const whorl = Math.exp(-18 * wx * wx - 28 * wy * wy) * smoothstep(.05, .22, pz);
  fx += whorl * (-5.9 * wy - .64 * fx);
  fy += whorl * (5.9 * wx - .82 * fy);
  const fz = -.34 * Math.tanh(pz * 7) + .13 * Math.sin(py * 4.7 + px * 3.2);
  const nd = nx * fx + ny * fy + nz * fz;
  let tx = fx - nx * nd, ty = fy - ny * nd, tz = fz - nz * nd;
  const tl = Math.hypot(tx, ty, tz);
  if (tl < .0001) {
    tx = nz; ty = 0; tz = -nx;
    if (Math.abs(ny) > .99) tx = 1;
  }
  const inv = 1 / Math.hypot(tx, ty, tz);
  const loft = .24 + .13 * flank + .07 * (1 - Math.abs(nz));
  const scale = 1 / Math.hypot(1, loft);
  outDir[0] = (tx * inv + nx * loft) * scale;
  outDir[1] = (ty * inv + ny * loft) * scale;
  outDir[2] = (tz * inv + nz * loft) * scale;
  outLenScale[0] = (.78 + .42 * flank + .11 * Math.sin(v * 5.8 - px * 2.7))
    * (1 - (.42 + .16 * Math.abs(ny)) * nearCut);
  return outDir;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Project a subdivided cube onto each half and tabulate triangle areas for follicle sampling.
function buildCoreMesh(subdiv = 12) {
  const centroids = [[0.45, 0.44, 0], [0.55, 1.24, 0]];
  const verts = []; // 12 floats/vert
  const indices = [];
  const triAreaCdf = [];
  const triMeta = [];
  let totalArea = 0;

  const p = new Float32Array(3);
  const n = new Float32Array(3);
  const gDir = new Float32Array(3);
  const lenS = new Float32Array(1);

  const faces = [
    (u, v) => [1, v, -u],
    (u, v) => [-1, v, u],
    (u, v) => [u, 1, -v],
    (u, v) => [u, -1, v],
    (u, v) => [u, v, 1],
    (u, v) => [-u, v, -1],
  ];

  const stride = 12;
  for (let part = 0; part < 2; part++) {
    const [cx, cy, cz] = centroids[part];
    for (let f = 0; f < 6; f++) {
      const baseV = verts.length / stride;
      const fn = faces[f];
      for (let iy = 0; iy <= subdiv; iy++) {
        const v = (iy / subdiv) * 2 - 1;
        for (let ix = 0; ix <= subdiv; ix++) {
          const u = (ix / subdiv) * 2 - 1;
          const [rx, ry, rz] = fn(u, v);
          const rl = Math.hypot(rx, ry, rz);
          projectToBHalf(cx, cy, cz, rx / rl, ry / rl, rz / rl, part, p);
          gradBHalf(p[0], p[1], p[2], part, n);
          const st = streakField(p[0], p[1], p[2]);
          groomDirection(p[0], p[1], p[2], n[0], n[1], n[2], part, gDir, lenS);
          verts.push(p[0], p[1], p[2], part, n[0], n[1], n[2], st, gDir[0], gDir[1], gDir[2], lenS[0]);
        }
      }
      const row = subdiv + 1;
      for (let iy = 0; iy < subdiv; iy++) {
        for (let ix = 0; ix < subdiv; ix++) {
          const a = baseV + iy * row + ix;
          const b = a + 1;
          const c = a + row;
          const d = c + 1;
          const quads = [[a, b, d], [a, d, c]];
          for (const [i0, i1, i2] of quads) {
            const o0 = i0 * stride, o1 = i1 * stride, o2 = i2 * stride;
            const ax = verts[o1] - verts[o0], ay = verts[o1 + 1] - verts[o0 + 1], az = verts[o1 + 2] - verts[o0 + 2];
            const bx = verts[o2] - verts[o0], by = verts[o2 + 1] - verts[o0 + 1], bz = verts[o2 + 2] - verts[o0 + 2];
            const crx = ay * bz - az * by, cry = az * bx - ax * bz, crz = ax * by - ay * bx;
            const area = 0.5 * Math.hypot(crx, cry, crz);
            const dotN = crx * verts[o0 + 4] + cry * verts[o0 + 5] + crz * verts[o0 + 6];
            if (dotN >= 0) indices.push(i0, i1, i2);
            else indices.push(i0, i2, i1);
            totalArea += area;
            triAreaCdf.push(totalArea);
            triMeta.push(i0, i1, i2, part);
          }
        }
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(indices),
    stride,
    triAreaCdf: new Float32Array(triAreaCdf),
    triMeta: new Uint16Array(triMeta),
    totalArea,
  };
}

function sampleSurfacePoint(mesh, rng, outPos, outNorm, areaFraction = rng()) {
  const target = areaFraction * mesh.totalArea;
  const cdf = mesh.triAreaCdf;
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cdf[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const m = lo * 4;
  const v = mesh.vertices;
  const s = mesh.stride;
  const o0 = mesh.triMeta[m] * s;
  const o1 = mesh.triMeta[m + 1] * s;
  const o2 = mesh.triMeta[m + 2] * s;
  const part = mesh.triMeta[m + 3];

  const r1 = Math.sqrt(rng());
  const r2 = rng();
  const w0 = 1 - r1;
  const w1 = r1 * (1 - r2);
  const w2 = r1 * r2;

  outPos[0] = v[o0] * w0 + v[o1] * w1 + v[o2] * w2;
  outPos[1] = v[o0 + 1] * w0 + v[o1 + 1] * w1 + v[o2 + 1] * w2;
  outPos[2] = v[o0 + 2] * w0 + v[o1 + 2] * w1 + v[o2 + 2] * w2;
  snapToBHalf(outPos, part);
  gradBHalf(outPos[0], outPos[1], outPos[2], part, outNorm);
  return part;
}

function buildSpatialGrid(coords, parts, count, cellSize = 0.14) {
  const map = new Map();
  // Each axis fits in six bits including the three-cell search margin.
  const key = (part, ix, iy, iz) => ((part * 64 + ix + 16) * 64 + iy + 16) * 64 + iz + 16;
  for (let i = 0; i < count; i++) {
    const ix = Math.floor(coords[i * 3] / cellSize);
    const iy = Math.floor(coords[i * 3 + 1] / cellSize);
    const iz = Math.floor(coords[i * 3 + 2] / cellSize);
    const k = key(parts[i], ix, iy, iz);
    let arr = map.get(k);
    if (!arr) { arr = []; map.set(k, arr); }
    arr.push(i);
  }
  return {
    findTwoNearest(x, y, z, part, outIdx, outDist) {
      const ix = Math.floor(x / cellSize);
      const iy = Math.floor(y / cellSize);
      const iz = Math.floor(z / cellSize);
      let i0 = -1, i1 = -1, d0 = 1e9, d1 = 1e9;
      for (let rad = 1; rad <= 3; rad++) {
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dy = -rad; dy <= rad; dy++) {
            for (let dz = -rad; dz <= rad; dz++) {
              if (rad > 1 && Math.abs(dx) < rad && Math.abs(dy) < rad && Math.abs(dz) < rad) continue;
              const arr = map.get(key(part, ix + dx, iy + dy, iz + dz));
              if (!arr) continue;
              for (let j = 0; j < arr.length; j++) {
                const idx = arr[j];
                const ox = coords[idx * 3] - x;
                const oy = coords[idx * 3 + 1] - y;
                const oz = coords[idx * 3 + 2] - z;
                const d2 = ox * ox + oy * oy + oz * oz;
                if (d2 < d0) { d1 = d0; i1 = i0; d0 = d2; i0 = idx; }
                else if (d2 < d1) { d1 = d2; i1 = idx; }
              }
            }
          }
        }
        if (i1 >= 0 && d1 <= rad * rad * cellSize * cellSize) break;
      }
      if (i0 < 0) {
        for (let idx = 0; idx < count; idx++) {
          if (parts[idx] !== part) continue;
          const ox = coords[idx * 3] - x;
          const oy = coords[idx * 3 + 1] - y;
          const oz = coords[idx * 3 + 2] - z;
          const d2 = ox * ox + oy * oy + oz * oz;
          if (d2 < d0) { d1 = d0; i1 = i0; d0 = d2; i0 = idx; }
          else if (d2 < d1) { d1 = d2; i1 = idx; }
        }
      }
      if (i1 < 0) { i1 = i0; d1 = d0; }
      outIdx[0] = i0; outIdx[1] = i1;
      outDist[0] = Math.sqrt(d0); outDist[1] = Math.sqrt(d1);
    },
  };
}

// Pick the coat in each half's local space. Brushing the far-right cheek at
// a steep orbit must reach the fibers under the pointer on that cheek.
function pickCoat(nx, ny, frame, out) {
  const { rows, centre, size, lift, shift, halfMotion, view } = frame;
  const sx = ((nx + 1) * .5 * view[0] - centre[0]) / size;
  const sy = ((ny + 1) * .5 * view[1] - centre[1]) / size;
  out[3] = -1;
  if (Math.abs(sx) > 1.24 || Math.abs(sy) > 1.24) return;
  const [right, down, depth] = rows;
  const ox = .56 - D_CAM * depth[0], oy = .845 - lift - D_CAM * depth[1], oz = -D_CAM * depth[2];
  const inv = 1 / Math.hypot(D_CAM, sx, sy);
  const dx = (D_CAM * depth[0] + sx * right[0] + sy * down[0]) * inv;
  const dy = (D_CAM * depth[1] + sx * right[1] + sy * down[1]) * inv;
  const dz = (D_CAM * depth[2] + sx * right[2] + sy * down[2]) * inv;
  let nearest = D_CAM + 1.6;
  for (let part = 0; part < 2; part++) {
    const cx = part ? .58 : .50, cy = part ? 1.22 : .46;
    const a = halfMotion[part + 2], c = Math.cos(a), s = Math.sin(a);
    const x0 = ox - cx - halfMotion[part], y0 = oy - cy - (part ? 1 : -1) * Math.abs(shift[1]);
    const x = cx + c * x0 + s * y0, y = cy - s * x0 + c * y0;
    const vx = c * dx + s * dy, vy = c * dy - s * dx;
    let t = D_CAM - 1.6;
    for (let i = 0; i < 48 && t < nearest; i++) {
      const px = x + t * vx, py = y + t * vy, pz = oz + t * dz;
      const distance = sdBHalf(px, py, pz, part) - .038;
      if (distance < .0015) {
        out[0] = px; out[1] = py; out[2] = pz; out[3] = part;
        nearest = t;
        break;
      }
      t += .86 * distance;
    }
  }
}

function coatContact() {
  const hit = new Float32Array([0, 0, 0, -1]), previous = new Float32Array(4);
  const velocity = new Float32Array(3);
  const rings = [new Float32Array(4), new Float32Array(4)];
  const ringHit = new Float32Array(4), ringValid = [false, false];
  let lastTime = -1;
  function update(frame) {
    previous.set(hit);
    pickCoat(frame.pointer[0], frame.pointer[1], frame, hit);
    const dt = frame.time - lastTime;
    const speed = dt > 0 && dt < .12 && hit[3] >= 0 && hit[3] === previous[3] ? 1 / dt : 0;
    for (let i = 0; i < 3; i++) velocity[i] = Math.max(-5, Math.min(5, (hit[i] - previous[i]) * speed));
    for (let i = 0; i < rings.length; i++) {
      const shock = frame.shocks[i], ring = rings[i];
      if (shock[3] > 0 && (shock[2] < ring[2] || lastTime < 0 || dt > .25)) {
        // The scene supplies clicks in its normalized focus coordinates.
        // Trace once at impact so the pressure wave stays on the turned pelt.
        pickCoat((shock[0] - .56) / .48, (shock[1] - .845) / .62, frame, ringHit);
        ring[0] = ringHit[0]; ring[1] = ringHit[1];
        ringValid[i] = ringHit[3] >= 0;
      }
      ring[2] = shock[2];
      ring[3] = ringValid[i] ? shock[3] : 0;
    }
    lastTime = frame.time;
  }
  return { hit, velocity, rings, update };
}

function createHairPhysics(mesh, rng) {
  const rootPos = new Float32Array(NUM_GUIDES * 3);
  const rootNorm = new Float32Array(NUM_GUIDES * 3);
  const guidePart = new Uint8Array(NUM_GUIDES);
  const guideLen = new Float32Array(NUM_GUIDES);
  const guideSeed = new Float32Array(NUM_GUIDES);

  const candP = new Float32Array(3);
  const candN = new Float32Array(3);
  const bestP = new Float32Array(3);
  const bestN = new Float32Array(3);
  const gDir = new Float32Array(3);
  const lenScale = new Float32Array(1);

  for (let i = 0; i < NUM_GUIDES; i++) {
    let bestMinD2 = -1;
    let bestPart = 0;
    const tries = i < 40 ? 6 : 10;
    for (let t = 0; t < tries; t++) {
      const part = sampleSurfacePoint(mesh, rng, candP, candN);
      let minD2 = 1e9;
      for (let j = 0; j < i; j++) {
        if (guidePart[j] !== part) continue;
        const dx = rootPos[j * 3] - candP[0];
        const dy = rootPos[j * 3 + 1] - candP[1];
        const dz = rootPos[j * 3 + 2] - candP[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minD2) minD2 = d2;
      }
      if (minD2 > bestMinD2) {
        bestMinD2 = minD2;
        bestPart = part;
        bestP[0] = candP[0]; bestP[1] = candP[1]; bestP[2] = candP[2];
        bestN[0] = candN[0]; bestN[1] = candN[1]; bestN[2] = candN[2];
      }
    }
    rootPos[i * 3] = bestP[0];
    rootPos[i * 3 + 1] = bestP[1];
    rootPos[i * 3 + 2] = bestP[2];
    rootNorm[i * 3] = bestN[0];
    rootNorm[i * 3 + 1] = bestN[1];
    rootNorm[i * 3 + 2] = bestN[2];
    guidePart[i] = bestPart;
    groomDirection(bestP[0], bestP[1], bestP[2], bestN[0], bestN[1], bestN[2], bestPart, gDir, lenScale);
    guideLen[i] = 0.168 * lenScale[0];
    guideSeed[i] = rng();
  }

  const strideN = SEGMENTS + 1;
  const totalNodes = NUM_GUIDES * strideN;
  const pos = new Float32Array(totalNodes * 3);
  const prev = new Float32Array(totalNodes * 3);
  const rest = new Float32Array(totalNodes * 3);

  for (let i = 0; i < NUM_GUIDES; i++) {
    const rx = rootPos[i * 3], ry = rootPos[i * 3 + 1], rz = rootPos[i * 3 + 2];
    const nx = rootNorm[i * 3], ny = rootNorm[i * 3 + 1], nz = rootNorm[i * 3 + 2];
    const part = guidePart[i];
    groomDirection(rx, ry, rz, nx, ny, nz, part, gDir, lenScale);
    const segL = guideLen[i] / SEGMENTS;

    let px = rx, py = ry, pz = rz;
    const base = i * strideN * 3;
    rest[base] = pos[base] = prev[base] = px;
    rest[base + 1] = pos[base + 1] = prev[base + 1] = py;
    rest[base + 2] = pos[base + 2] = prev[base + 2] = pz;

    for (let k = 1; k <= SEGMENTS; k++) {
      const f = k / SEGMENTS;
      // Graceful outward arch curving softly downward along the fur's combed fall
      const dx = gDir[0] + 0.14 * f;
      const dy = gDir[1] + 0.30 * f;
      const dz = gDir[2] * (1 - 0.12 * f);
      const dInv = 1 / (Math.hypot(dx, dy, dz) || 1);
      px += dx * dInv * segL;
      py += dy * dInv * segL;
      pz += dz * dInv * segL;
      const minClear = 0.012 + 0.016 * f;
      const sd = sdBHalf(px, py, pz, part);
      if (sd < minClear) {
        gradBHalf(px, py, pz, part, _tmpG);
        const push = minClear - sd;
        px += _tmpG[0] * push;
        py += _tmpG[1] * push;
        pz += _tmpG[2] * push;
      }
      const o = base + k * 3;
      rest[o] = pos[o] = prev[o] = px;
      rest[o + 1] = pos[o + 1] = prev[o + 1] = py;
      rest[o + 2] = pos[o + 2] = prev[o + 2] = pz;
    }
  }

  const texData = new Uint8Array(GUIDE_TEX_W * GUIDE_TEX_H * 4);
  const colGrad = new Float32Array(3);

  let lastTime = -1;
  let lastSway = 0, lastLift = 0;
  let lastShear0 = 0, lastShear1 = 0, lastR1y = 1;
  let velSway = 0, velLift = 0, velPitch = 0;

  function stepSub(dt, time, accelX, accelY, accelZ, contact, pulse) {
    const dt2 = dt * dt;
    const damp = Math.exp(-5.2 * dt);

    // Correlated gusts travel across the coat from left to right.
    const macroBreath = 0.82 + 0.28 * Math.sin(time * 0.88) + 0.14 * Math.sin(time * 1.52 + 1.1);
    const breezeBaseX = .96 * macroBreath;
    const breezeBaseY = (-0.18 + 0.22 * Math.sin(time * 0.68 + 0.5)) * macroBreath;
    const breezeBaseZ = (0.34 + 0.20 * Math.cos(time * 0.82 + 1.9)) * macroBreath;

    const { hit, velocity, rings } = contact;
    const pSpeed = Math.min(5, Math.hypot(velocity[0], velocity[1], velocity[2]));

    for (let i = 0; i < NUM_GUIDES; i++) {
      const part = guidePart[i];
      const base = i * strideN * 3;
      const rx = rootPos[i * 3], ry = rootPos[i * 3 + 1], rz = rootPos[i * 3 + 2];
      const nx = rootNorm[i * 3], ny = rootNorm[i * 3 + 1], nz = rootNorm[i * 3 + 2];
      const segL = guideLen[i] / SEGMENTS;
      const seed = guideSeed[i];

      const wPhase1 = rx * 3.1 - ry * 0.95 - time * 2.25;
      const wPhase2 = rx * 5.2 + ry * 2.4 - time * 3.35 + rz * 2.8;
      const wPhase3 = ry * 3.8 - rx * 1.7 + time * 1.65;
      const waveGust = 0.78 + 0.34 * Math.sin(wPhase1) + 0.15 * Math.sin(wPhase2);
      const eddyY = 0.36 * Math.sin(wPhase2 + 0.7) + 0.20 * Math.cos(wPhase3);
      const eddyZ = 0.38 * Math.cos(wPhase1 * 1.15 + rz * 2.6) + 0.22 * Math.sin(wPhase3 * 1.2);

      const exposure = 0.68 + 0.32 * Math.max(0, 0.5 + 0.5 * (nx * 0.4 + nz * 0.6));

      const dx = rx - hit[0], dy = ry - hit[1], dz = rz - hit[2];
      const brushWeight = part === hit[3] ? Math.exp(-24 * (dx * dx + dy * dy + dz * dz)) : 0;
      const brushForce = brushWeight * (.85 + .64 * pSpeed);
      const brushX = velocity[0] * brushForce;
      const brushY = velocity[1] * brushForce;
      const brushZ = velocity[2] * brushForce;

      // Click air-puff expanding shockwave
      let puffX = 0, puffY = 0, puffZ = 0;
      for (let si = 0; si < 2; si++) {
        const s = rings[si];
        if (s[3] > 0.01 && s[2] < 1.9) {
          const sdx = rx - s[0], sdy = ry - s[1];
          const sr = Math.hypot(sdx, sdy);
          const ringX = (sr - s[2] * 0.95) / (0.095 + s[2] * 0.07);
          const w = Math.exp(-ringX * ringX) * s[3] * Math.exp(-s[2] * 1.85);
          if (w > 0.005) {
            const invR = 1 / (sr + 0.04);
            puffX += (sdx * invR * 3.2 + nx * 2.0) * w;
            puffY += (sdy * invR * 3.2 + ny * 2.0) * w;
            puffZ += (nz * 2.4 + 0.6) * w;
          }
        }
      }

      const pressLift = -pulse * brushWeight * 2.8;

      for (let k = 1; k <= SEGMENTS; k++) {
        const o = base + k * 3;
        const frac = k / SEGMENTS;
        const flex = Math.pow(frac, 1.38);

        // Only the tips pick up the higher-frequency flutter.
        const flutter = frac * frac * frac * (0.55 + 0.45 * macroBreath);
        const flY = Math.sin(time * 5.2 + seed * 14.0 + k * 0.7) * 0.28 * flutter;
        const flZ = Math.cos(time * 4.4 + seed * 11.3 + k * 0.9) * 0.32 * flutter;

        const fx = (breezeBaseX * waveGust * exposure + accelX + brushX + puffX + nx * pressLift) * flex;
        const fy = (breezeBaseY * waveGust * exposure + eddyY * exposure + 0.42 + accelY + brushY + puffY + ny * pressLift + flY) * flex;
        const fz = (breezeBaseZ * waveGust * exposure + eddyZ * exposure + accelZ + brushZ + puffZ + nz * pressLift + flZ) * flex;

        // The restoring force falls along the shaft.
        const stiff = 94 * Math.pow(1 - .61 * frac, 1.4);
        const cx = pos[o], cy = pos[o + 1], cz = pos[o + 2];
        const vx = (cx - prev[o]) * damp;
        const vy = (cy - prev[o + 1]) * damp;
        const vz = (cz - prev[o + 2]) * damp;

        prev[o] = cx; prev[o + 1] = cy; prev[o + 2] = cz;
        pos[o] = cx + vx + (fx + (rest[o] - cx) * stiff) * dt2;
        pos[o + 1] = cy + vy + (fy + (rest[o + 1] - cy) * stiff) * dt2;
        pos[o + 2] = cz + vz + (fz + (rest[o + 2] - cz) * stiff) * dt2;
      }

      // Project outwards from the pinned root, then give each joint skin clearance.
      for (let k = 1; k <= SEGMENTS; k++) {
        const oPrev = base + (k - 1) * 3;
        const oCur = base + k * 3;
        let dx = pos[oCur] - pos[oPrev];
        let dy = pos[oCur + 1] - pos[oPrev + 1];
        let dz = pos[oCur + 2] - pos[oPrev + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const corr = segL / d;
        pos[oCur] = pos[oPrev] + dx * corr;
        pos[oCur + 1] = pos[oPrev + 1] + dy * corr;
        pos[oCur + 2] = pos[oPrev + 2] + dz * corr;

        const minClear = 0.014 + 0.012 * (k / SEGMENTS);
        const sd = sdBHalf(pos[oCur], pos[oCur + 1], pos[oCur + 2], part);
        if (sd < minClear) {
          gradBHalf(pos[oCur], pos[oCur + 1], pos[oCur + 2], part, colGrad);
          const push = minClear - sd;
          pos[oCur] += colGrad[0] * push;
          pos[oCur + 1] += colGrad[1] * push;
          pos[oCur + 2] += colGrad[2] * push;
          dx = pos[oCur] - pos[oPrev];
          dy = pos[oCur + 1] - pos[oPrev + 1];
          dz = pos[oCur + 2] - pos[oPrev + 2];
          const d2 = Math.hypot(dx, dy, dz) || 1e-6;
          const c2 = segL / d2;
          pos[oCur] = pos[oPrev] + dx * c2;
          pos[oCur + 1] = pos[oPrev + 1] + dy * c2;
          pos[oCur + 2] = pos[oPrev + 2] + dz * c2;
        }
      }
    }
  }

  // Signed square-root encoding spends the most precision on minute motion.
  // With NEAREST filtering, byte 128 is exactly the resting displacement.
  function packTexture() {
    for (let row = 0; row < 2; row++) {
      const joint = row ? SEGMENTS : SEGMENTS / 2;
      for (let i = 0; i < NUM_GUIDES; i++) {
        const o = (i * strideN + joint) * 3;
        const dst = (row * GUIDE_TEX_W + i) * 4;
        for (let c = 0; c < 3; c++) {
          const d = pos[o + c] - rest[o + c];
          texData[dst + c] = 128 + Math.round(127 * Math.sign(d) * Math.sqrt(Math.min(1, Math.abs(d) / PACK_RANGE)));
        }
      }
    }
  }

  let remainder = 0;
  function update({ time, sway, lift, contact, pulse, halfMotion, rows }) {
    let dt = lastTime < 0 ? 1 / 60 : time - lastTime;
    const coldJump = lastTime < 0 || dt < 0 || dt > 0.25;
    if (coldJump) {
      lastSway = sway; lastLift = lift;
      lastShear0 = halfMotion[0]; lastShear1 = halfMotion[1];
      lastR1y = rows[1][2];
      velSway = velLift = velPitch = 0;
      pos.set(rest);
      prev.set(rest);
      remainder = 0;
      lastTime = time;
      packTexture();
      return;
    }

    if (dt < 1e-5) return;
    dt = Math.min(dt, 0.05);
    const invDt = 1 / dt;

    const newVelSway = Math.max(-6, Math.min(6, (sway - lastSway) * invDt));
    const newVelLift = Math.max(-4, Math.min(4, (lift - lastLift) * invDt));
    const shearVel = ((halfMotion[0] - lastShear0) + (halfMotion[1] - lastShear1)) * 0.5 * invDt;
    const pitchProxy = rows[1][2];
    const newVelPitch = Math.max(-6, Math.min(6, (pitchProxy - lastR1y) * invDt));

    const accSway = Math.max(-26, Math.min(26, (newVelSway - velSway) * invDt));
    const accLift = Math.max(-18, Math.min(18, (newVelLift - velLift) * invDt));
    const accPitch = Math.max(-20, Math.min(20, (newVelPitch - velPitch) * invDt));

    const inertiaX = -accSway * 0.42 - newVelSway * 1.45 - shearVel * 6.0;
    const inertiaY = accLift * 0.85 - accPitch * 0.34 - newVelPitch * 0.90;
    const inertiaZ = -accSway * 0.24 - newVelSway * 0.80;

    lastTime = time;
    lastSway = sway; lastLift = lift;
    lastShear0 = halfMotion[0]; lastShear1 = halfMotion[1];
    lastR1y = pitchProxy;
    velSway = newVelSway; velLift = newVelLift; velPitch = newVelPitch;

    const fixedDt = 1 / 90;
    remainder += dt;
    while (remainder >= fixedDt) {
      remainder -= fixedDt;
      stepSub(fixedDt, time - remainder, inertiaX, inertiaY, inertiaZ, contact, pulse);
    }
    packTexture();
  }

  return {
    rootPos, texData, update,
    grid: buildSpatialGrid(rootPos, guidePart, NUM_GUIDES, 0.14),
  };
}

// Six vec4s describe one follicle. On WebGL 1 instancing keeps that record
// resident once. The projected size determines the tessellation of its curve.
const STRIDE = 24;
const LAYER_ENDS = [.29, .91, 1];
const ATTRIBUTES = ['aRoot', 'aNormal', 'aEnd', 'aBow', 'aGuides', 'aCoat'];

function buildLayer(layer, count, mesh, physics, rng, locks) {
  const data = new Float32Array(count * STRIDE);
  const p = new Float32Array(3), n = new Float32Array(3), flow = new Float32Array(3);
  const scale = [1], ids = [0, 0], dist = [0, 0];
  const down = layer === 0, guard = layer === 2;
  const phase = rng();
  for (let i = 0; i < count; i++) {
    // Every prefix covers both halves, including the small shadow-map sample.
    const part = sampleSurfacePoint(mesh, rng, p, n, (phase + i * .61803398875) % 1);
    const [x, y, z] = p, [nx, ny, nz] = n;
    groomDirection(x, y, z, nx, ny, nz, part, flow, scale);
    physics.grid.findTwoNearest(x, y, z, part, ids, dist);
    const g = ids[0], center = g * 3;
    const blend = dist[0] ** 2 / Math.max(1e-9, dist[0] ** 2 + dist[1] ** 2);
    const lock = locks[g];
    const seed = rng(), variation = rng();
    const len = scale[0] * (down ? .051 + .052 * rng()
      : guard ? .184 + .085 * rng() : .114 + .073 * rng()) * (.81 + .37 * lock);
    // Cross-grain direction and the tangent offset towards the lock's spine.
    let sx = ny * flow[2] - nz * flow[1], sy = nz * flow[0] - nx * flow[2], sz = nx * flow[1] - ny * flow[0];
    const inv = 1 / Math.hypot(sx, sy, sz);
    sx *= inv; sy *= inv; sz *= inv;
    let dx = physics.rootPos[center] - x, dy = physics.rootPos[center + 1] - y, dz = physics.rootPos[center + 2] - z;
    const normalOffset = dx * nx + dy * ny + dz * nz;
    dx -= normalOffset * nx; dy -= normalOffset * ny; dz -= normalOffset * nz;
    const lockRadius = Math.hypot(dx, dy, dz);
    const pull = (down ? .25 : guard ? .29 : .77) * (.55 + .7 * rng())
      / (1 + lockRadius / .10);
    const wave = Math.sin(9.1 * x - 5.3 * y + 2.4 * z + .8 * Math.sin(y * 4));
    const tuft = Math.sin(42 * x - 21 * y + 26 * z + 1.9 * Math.sin(15 * y - 8 * x));
    const turn = len * (.32 * wave + .48 * (lock - .5) + .082 * tuft + (seed - .5) * (guard ? .61 : .27));
    const loft = len * ((down ? .23 : .03) + (guard ? .27 : .17) * (variation - .35));
    // Quadratic arch: the shaft lifts clear of its root, then turns over and
    // settles onto the pile. Fine guards break away from the tips of the awns.
    const arch = len * ((down ? .89 : guard ? .68 : .67) + .60 * lock + .07 * tuft);
    const curl = len * (.35 * wave + .34 * (lock - .5) + (variation - .5) * (down ? .81 : .38));
    const width = (down ? .00155 : guard ? .00112 : .00143) * (.77 + .66 * rng());
    const pigment = smoothstep(.13, .85, streakField(x, y, z) + (rng() - .5) * .31);
    // Broader color variation belongs to the pelt, with lighter ticking over
    // the ruff and a russet saddle. Neighbors share this even in a breeze.
    const mantle = .5 + .5 * Math.cos(5.2 * x - 3.4 * y + 3 * z + part * 1.3);
    const tone = .28 * lock + .22 * rng() + .39 * mantle + .11 * (.5 + .5 * tuft);
    const valley = smoothstep(.011, .090, lockRadius);
    const response = len / .168 * (down ? .25 : guard ? 1.12 : .78);
    const o = i * STRIDE;
    data.set([x, y, z, part, nx, ny, nz, layer,
      flow[0] * len + nx * loft + sx * turn + dx * pull,
      flow[1] * len + ny * loft + sy * turn + dy * pull,
      flow[2] * len + nz * loft + sz * turn + dz * pull, width,
      nx * arch + sx * curl - flow[0] * len * .22,
      ny * arch + sy * curl - flow[1] * len * .22,
      nz * arch + sz * curl - flow[2] * len * .22, seed,
      ids[0], ids[1], blend, response, pigment, tone, valley, variation], o);
  }
  return data;
}

function buffer(gl, target, data) {
  const handle = gl.createBuffer();
  gl.bindBuffer(target, handle);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return handle;
}

function strandGeometry(gl, instancing, mesh, physics, rng, limit) {
  const steps = instancing ? 12 : 6;
  const nodes = 2 * (steps + 1);
  const ribbon = new Float32Array(nodes * 2);
  for (let i = 0; i < nodes; i++) {
    ribbon[2 * i] = Math.floor(i / 2) / steps;
    ribbon[2 * i + 1] = (i % 2) * 2 - 1;
  }
  const ribbonBuffer = instancing && buffer(gl, gl.ARRAY_BUFFER, ribbon);
  const batchSize = Math.floor(65535 / nodes);
  function ribbonIndices(segments) {
    const step = steps / segments, per = 6 * segments;
    const indices = new Uint16Array(per * (instancing ? 1 : batchSize));
    for (let o = 0; o < indices.length; o += 6) {
      const v = Math.floor(o / per) * nodes + (o % per) / 6 * step * 2;
      const next = v + 2 * step;
      indices.set([v, v + 1, next, v + 1, next + 1, next], o);
    }
    return buffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices);
  }
  const elements = { 3: ribbonIndices(3), 6: ribbonIndices(6) };
  if (instancing) elements[12] = ribbonIndices(12);
  const locks = Float32Array.from({ length: NUM_GUIDES }, rng);
  const layers = LAYER_ENDS.map((end, layer) => {
    const start = layer ? LAYER_ENDS[layer - 1] : 0;
    const count = Math.floor(limit * end) - Math.floor(limit * start);
    const data = buildLayer(layer, count, mesh, physics, rng, locks);
    if (instancing) return [buffer(gl, gl.ARRAY_BUFFER, data)];

    // The same curves on devices without ANGLE_instanced_arrays. Keep each
    // batch within the guaranteed WebGL 1 unsigned-short index range.
    const buffers = [];
    for (let first = 0; first < count; first += batchSize) {
      const n = Math.min(count - first, batchSize);
      const expanded = new Float32Array(n * nodes * (STRIDE + 2));
      for (let i = 0; i < n; i++) {
        const record = data.subarray((first + i) * STRIDE, (first + i + 1) * STRIDE);
        for (let k = 0; k < nodes; k++) {
          const o = (i * nodes + k) * (STRIDE + 2);
          expanded.set(record, o);
          expanded[o + STRIDE] = ribbon[k * 2];
          expanded[o + STRIDE + 1] = ribbon[k * 2 + 1];
        }
      }
      buffers.push(buffer(gl, gl.ARRAY_BUFFER, expanded));
    }
    return buffers;
  });

  return function drawStrands(loc, budget, pass = 'depth', pixelsPerUnit = 0) {
    gl.enableVertexAttribArray(loc.aRibbon);
    if (instancing) {
      gl.bindBuffer(gl.ARRAY_BUFFER, ribbonBuffer);
      gl.vertexAttribPointer(loc.aRibbon, 2, gl.FLOAT, false, 0, 0);
    }
    for (const name of ATTRIBUTES) {
      if (loc[name] < 0) continue;
      gl.enableVertexAttribArray(loc[name]);
      if (instancing) instancing.vertexAttribDivisorANGLE(loc[name], 1);
    }
    let first = 0;
    for (let layer = 0; layer < layers.length; layer++) {
      const end = Math.floor(budget * LAYER_ENDS[layer]);
      let remaining = end - first;
      const short = pass === 'tufts' && layer < 2;
      // On large, dense screens a guard can span well over 100 pixels.
      // Subdivide those arcs before their joints become visible in silhouette.
      const longArc = (layer === 2 && pixelsPerUnit > 350) || (layer === 1 && pixelsPerUnit > 640);
      const segments = short ? 3 : longArc ? steps : 6;
      const indexCount = segments * 6;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements[segments]);
      for (const vbo of layers[layer]) {
        if (remaining <= 0) break;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        const stride = (STRIDE + (instancing ? 0 : 2)) * 4;
        ATTRIBUTES.forEach((name, i) => {
          if (loc[name] >= 0) gl.vertexAttribPointer(loc[name], 4, gl.FLOAT, false, stride, i * 16);
        });
        if (instancing) {
          // Blend from roots towards tips across the whole coat. Otherwise a
          // distant subpixel root can be composited on top of a nearby tip.
          if (short) {
            instancing.drawElementsInstancedANGLE(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, remaining);
            instancing.drawElementsInstancedANGLE(gl.TRIANGLES, indexCount - 6, gl.UNSIGNED_SHORT, 12, remaining);
          } else {
            const groups = pass === 'depth' ? 1 : 3;
            const n = indexCount / groups;
            for (let k = 0; k < groups; k++) {
              instancing.drawElementsInstancedANGLE(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 2 * k * n, remaining);
            }
          }
          break;
        }
        gl.vertexAttribPointer(loc.aRibbon, 2, gl.FLOAT, false, stride, STRIDE * 4);
        gl.drawElements(gl.TRIANGLES, Math.min(remaining, batchSize) * indexCount, gl.UNSIGNED_SHORT, 0);
        remaining -= batchSize;
      }
      first = end;
    }
    for (const name of ATTRIBUTES) {
      if (loc[name] < 0) continue;
      if (instancing) instancing.vertexAttribDivisorANGLE(loc[name], 0);
      gl.disableVertexAttribArray(loc[name]);
    }
    gl.disableVertexAttribArray(loc.aRibbon);
  };
}

const groundVert = `
attribute vec2 p;
uniform vec4 box, shadow;
varying vec2 vPlate;
void main() {
  vPlate = p;
  vec2 clip = (shadow.xy + p * shadow.zw - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, .99, 1.);
}`;

const groundFrag = `precision highp float;
uniform float sway, pulse, lightAngle, lift, time;
uniform sampler2D groundMap;
varying vec2 vPlate;

void main() {
  vec2 guv = vec2(vPlate.x, -vPlate.y) * .5 + .5;
  float breezeShift = .003 * sin(time * 1.35 + guv.x * 4.5) + sway * .0055 + lightAngle * .009;
  vec4 base = texture2D(groundMap, guv + vec2(breezeShift * .45, 0.));
  vec2 margin = min(guv, 1. - guv);
  float alpha = base.a * smoothstep(0., .09, margin.x) * smoothstep(0., .19, margin.y);
  if (alpha < .0025) discard;
  float heightMod = clamp(1. - lift * 4.2, .88, 1.12);
  vec4 softTap = texture2D(groundMap, guv + vec2(breezeShift * 1.1, .012));
  vec3 col = mix(base.rgb, softTap.rgb, .38);
  float aOut = alpha * heightMod * (1. + .06 * pulse);
  gl_FragColor = vec4(col * aOut, aOut);
}`;

const halves = `
uniform vec4 halfMotion;
uniform float spread;

mat2 halfTurn(float part) {
  float a = mix(halfMotion.z, halfMotion.w, part);
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

vec3 place(vec3 p, float part) {
  vec2 pivot = mix(vec2(.50, .46), vec2(.58, 1.22), part);
  vec2 drift = vec2(mix(halfMotion.x, halfMotion.y, part), (2. * part - 1.) * spread);
  return vec3(halfTurn(part) * (p.xy - pivot) + pivot + drift, p.z);
}
`;

const camera = `
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift;

vec3 pivot() { return vec3(.56, .845 - lift, 0.); }

vec4 project(vec3 p) {
  vec3 q = p - pivot();
  float z = dot(row3, q);
  float scale = size * ${D_CAM} / (${D_CAM} + z);
  vec2 screen = centre + vec2(dot(row1, q), dot(row2, q)) * scale;
  vec2 clip = (screen - box.xy) * 2. / box.zw - 1.;
  return vec4(clip.x, -clip.y, z * .25, 1.);
}
`;

// Both depths use the same orthographic key-light camera. RG stores the
// opaque skin and BA the first illuminated fibers. Their separation gives
// the pile thickness along a light ray, including across the split.
const lightSpace = `
uniform vec3 lightX, lightY, key;
vec3 lightCoord(vec3 p) {
  vec3 q = p - vec3(.56, .845, 0.);
  return vec3(dot(q, lightX), dot(q, lightY), -dot(q, key)) * ${.5 / SHADOW_RADIUS} + .5;
}
`;

const coatLight = `
uniform sampler2D shadowMap;
uniform float shadowTaps;
uniform vec3 key, fill, rim;

float transmission(vec3 coord, vec2 offset) {
  vec4 z = texture2D(shadowMap, coord.xy + offset / ${SHADOW_SIZE}.);
  vec2 depth = vec2(z.r + z.g / 255., z.b + z.a / 255.);
  vec2 path = (coord.z - depth) * ${2 * SHADOW_RADIUS};
  float skin = 1. - .96 * smoothstep(.003, .020, path.x);
  return skin * exp2(-19. * max(0., path.y - .004));
}

float keyVisibility(vec3 coord, float estimate) {
  if (shadowTaps < .5) return estimate;
  if (shadowTaps < 2.) return transmission(coord, vec2(0.));
  return .25 * (transmission(coord, vec2(-1.4, -.6)) + transmission(coord, vec2(.6, -1.4))
    + transmission(coord, vec2(1.4, .6)) + transmission(coord, vec2(-.6, 1.4)));
}

vec3 displayColor(vec3 linear) {
  // One shoulder for all channels preserves violet and copper in backlight.
  float peak = max(linear.r, max(linear.g, linear.b));
  return pow(clamp(linear / (1. + .30 * peak), 0., 1.), vec3(1. / 2.2));
}

vec3 shaftColor(float streak, float tone) {
  vec3 russet = mix(vec3(.38, .054, .010), vec3(1.03, .238, .035), smoothstep(.15, .73, tone));
  russet = mix(russet, vec3(1.16, .48, .14), .65 * smoothstep(.58, .94, tone));
  vec3 violet = mix(vec3(.094, .015, .167), vec3(.37, .068, .58), smoothstep(.11, .86, tone));
  return mix(russet, violet, streak);
}
`;

const coreShape = `
attribute vec4 aPosPart, aNormSt, aFlowLen;
uniform float shellFrac;
${halves}
vec3 corePoint() {
  vec3 n = normalize(aNormSt.xyz), flow = normalize(aFlowLen.xyz);
  float h = shellFrac * .034 * aFlowLen.w;
  return place(aPosPart.xyz + n * (h - .004) + flow * (.58 * h), aPosPart.w);
}
`;

const shellVert = `
${coreShape}
${camera}
${lightSpace}
varying vec3 vRest, vNormal, vFlow, vLight;
varying vec2 vCoat;
void main() {
  vec3 p = corePoint();
  gl_Position = project(p);
  vRest = aPosPart.xyz;
  vNormal = aNormSt.xyz;
  vFlow = aFlowLen.xyz;
  vCoat = vec2(aNormSt.w, aPosPart.w);
  vLight = lightCoord(p);
}`;

const shellFrag = `precision highp float;
${coatLight}
${halves}
uniform sampler2D napMap;
uniform float shellFrac;
varying vec3 vRest, vNormal, vFlow, vLight;
varying vec2 vCoat;

// Each channel contains a different direction of short, combed underfur.
// Use local direction weights without rotating the position itself: even at
// a whorl the nap stays attached to the skin as the halves turn.
float nap(vec2 p, vec2 t) {
  vec2 d = t / max(.01, length(t));
  vec4 axes = abs(vec4(d.x, d.y, dot(d, vec2(.7071)), dot(d, vec2(.7071, -.7071))));
  vec4 w = pow(axes, vec4(14.)) + .0001;
  return dot(texture2D(napMap, p * 2.7), w) / dot(w, vec4(1.));
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 w = pow(abs(n), vec3(6.));
  w /= dot(w, vec3(1.));
  vec3 flow = normalize(vFlow);
  vec3 p = vRest - flow * shellFrac * .022;
  float fiber = w.x * nap(p.zy, flow.zy) + w.y * nap(p.xz, flow.xz) + w.z * nap(p.xy, flow.xy);
  if (shellFrac > .01 && fiber < .22 + .42 * shellFrac) discard;
  n.xy = halfTurn(vCoat.y) * n.xy;
  float incident = clamp((dot(n, key) + .30) / 1.30, 0., 1.);
  float light = keyVisibility(vLight, .42 + .24 * shellFrac);
  vec3 pigment = shaftColor(vCoat.x, .35 + .28 * fiber);
  vec3 inner = mix(vec3(.26, .17, .19), vec3(.24, .20, .33), vCoat.x);
  vec3 albedo = pigment * mix(inner, vec3(.77), .27 + .48 * shellFrac);
  float bounce = .20 + .12 * max(0., dot(n, fill));
  vec3 col = albedo * (bounce + incident * (.16 + 1.12 * light)) * (.64 + .64 * fiber);
  gl_FragColor = vec4(displayColor(col), 1.);
}`;

function strandShape(vertexTextures) {
  return `
attribute vec2 aRibbon;
attribute vec4 aRoot, aNormal, aEnd, aBow, aGuides, aCoat;
uniform float time, sway;
${halves}
${vertexTextures ? `
uniform sampler2D guideTex;
vec3 guide(float index, float row) {
  vec3 d = (texture2D(guideTex, vec2((index + .5) / ${GUIDE_TEX_W}., row)).rgb * 255. - 128.) / 127.;
  return d * abs(d) * ${PACK_RANGE};
}
void guideMotion(out vec3 mid, out vec3 tip) {
  mid = mix(guide(aGuides.x, .25), guide(aGuides.y, .25), aGuides.z);
  tip = mix(guide(aGuides.x, .75), guide(aGuides.y, .75), aGuides.z);
}
` : `
uniform vec4 brush, rippleA, rippleB;
uniform vec3 brushForce;
float puff(vec4 shock) {
  float d = (length(aRoot.xy - shock.xy) - shock.z * .95) / .12;
  return shock.w * exp(-d * d - 2. * shock.z);
}
void guideMotion(out vec3 mid, out vec3 tip) {
  float wave = sin(time * 1.9 - aRoot.x * 3.7 + aRoot.y * 2.4);
  vec3 delta = aRoot.xyz - brush.xyz;
  tip = vec3(.016 + .020 * wave, .011 * wave, .007 * cos(time + aRoot.y * 4.));
  if (abs(aRoot.w - brush.w) < .5) tip += brushForce * (.016 * exp(-24. * dot(delta, delta)));
  tip += .037 * aNormal.xyz * (puff(rippleA) + puff(rippleB));
  mid = tip * .23;
}
`}

void strandPoint(out vec3 p, out vec3 tangent) {
  float u = aRibbon.x, u2 = u * u;
  vec3 mid, tip;
  guideMotion(mid, tip);
  // Cubic displacement interpolates the simulated middle and tip with a
  // pinned root and zero root slope. Different coats carry different inertia.
  vec3 bend = 8. * mid - 2. * tip;
  vec3 motion = aGuides.w * u2 * (tip + (1. - u) * bend);
  vec3 velocity = aGuides.w * u * (2. * tip + (2. - 3. * u) * bend);
  vec3 across = cross(aNormal.xyz, aEnd.xyz);
  across /= max(length(across), .0001);
  float wave = sin(time * 2.5 + aRoot.y * 8. - aRoot.x * 5. + aBow.w * 1.7 + sway);
  vec3 flick = across * ((aBow.w - .49) * .013 + wave * .0036) * aGuides.w;
  float kink = (aCoat.w - .5) * .040 + (aBow.w - .5) * .018;
  vec3 crimp = across * kink;
  vec3 local = aRoot.xyz - aNormal.xyz * .003 + aEnd.xyz * u + aBow.xyz * (u * (1. - u))
    + motion + flick * u2 * u + crimp * (u * (1. - u) * (2. * u - 1.));
  vec3 t = aEnd.xyz + aBow.xyz * (1. - 2. * u) + velocity + 3. * flick * u2
    + crimp * (6. * u * (1. - u) - 1.);
  p = place(local, aRoot.w);
  tangent = normalize(vec3(halfTurn(aRoot.w) * t.xy, t.z));
}
`;
}

const coreShadowVert = `
${coreShape}
${lightSpace}
void main() { gl_Position = vec4(2. * lightCoord(corePoint()) - 1., 1.); }`;

function furShadowVert(shape) {
  return `
${shape}
${lightSpace}
void main() {
  vec3 p, t;
  strandPoint(p, t);
  vec3 width = cross(t, key);
  width /= max(.0001, length(width));
  // A representative subset of shafts casts the shadow of each small lock.
  float halfWidth = (.004 + 2. * aEnd.w) * (1. - .79 * aRibbon.x * aRibbon.x);
  p += width * (aRibbon.y * halfWidth);
  gl_Position = vec4(2. * lightCoord(p) - 1., 1.);
}`;
}

const shadowFrag = `precision highp float;
void main() {
  float value = gl_FragCoord.z * 255.;
  vec2 packedDepth = vec2(floor(value) / 255., fract(value));
  gl_FragColor = packedDepth.xyxy;
}`;

function furVert(shape) {
  return `
${shape}
${camera}
${lightSpace}
uniform float pixel, widthBoost, tuftMode;
varying vec3 vT, vN, vView, vLight;
varying vec4 vMeta, vHair;
varying vec3 vOcclusion;
void main() {
  vec3 p, t;
  strandPoint(p, t);
  vec3 q = p - pivot();
  vec3 view = normalize(-row3 * ${D_CAM} - q);
  vec3 width = cross(t, view);
  float span = length(width);
  width = span > .001 ? width / span : normalize(cross(t, row2));
  float u = aRibbon.x;
  // The guard's belly is wider than its base. The long distal taper fades
  // continuously even when the full shaft is narrower than a display pixel.
  float belly = 1. + .24 * aNormal.w * sin(3.14159 * u);
  bool bundled = tuftMode > .5 && (aNormal.w < .5 || (aNormal.w < 1.5 && fract(aBow.w * 19.137) < .63));
  float taper = bundled ? 6.7 * (1. - .83 * u) : widthBoost * belly * (1. - .98 * pow(u, 1.26));
  float radius = aEnd.w * taper;
  float px = pixel * (1. + dot(row3, q) / ${D_CAM});
  // Focus on the near surface. Distant flyaways spread their light over a
  // slightly wider footprint, while the individual shafts in focus stay crisp.
  float defocus = max(0., abs(dot(row3, q) + .24) - .085);
  float opticalWidth = (.00036 + .0038 * defocus + .00060 * max(0., 1. - aNormal.w)) / px;
  float filterWidth = min(3.8, length(vec2(.53, opticalWidth)));
  gl_Position = project(p + width * aRibbon.y * (radius + filterWidth * px));
  vT = t;
  vN = vec3(halfTurn(aRoot.w) * aNormal.xy, aNormal.z);
  vView = view;
  vLight = lightCoord(p);
  vMeta = vec4(u, aRibbon.y, aCoat.xy);
  vHair = vec4(radius / px, aNormal.w, aBow.w, aCoat.w);
  float cutDist = abs((aRoot.y + .27875 * aRoot.x - .98) * .9633);
  vOcclusion = vec3(aCoat.z, mix(1., .72 + .28 * smoothstep(.06, .21, cutDist), aRoot.w), filterWidth);
}`;
}

const strandFrag = `precision highp float;
${coatLight}
uniform float passMode, pulse, recovery, tuftMode;
uniform sampler2D tuftMap;
uniform vec3 brushLight;
varying vec3 vT, vN, vView, vLight;
varying vec4 vMeta, vHair;
varying vec3 vOcclusion;

float sheen(vec3 t, vec3 h, float shift, float focus) {
  float d = dot(t, h) - shift;
  return exp2(-focus * d * d);
}

void main() {
  float u = vMeta.x, side = abs(vMeta.y), streak = vMeta.z, tone = vMeta.w;
  float radius = vHair.x, layer = vHair.y, seed = vHair.z, variation = vHair.w;
  float filterWidth = vOcclusion.z;
  float offset = side * (radius + filterWidth);
  // Difference of filter integrals conserves the energy of a subpixel shaft.
  float coverage = smoothstep(-filterWidth, filterWidth, radius - offset)
    - smoothstep(-filterWidth, filterWidth, -radius - offset);
  float core = .96;
  bool bundled = tuftMode > .5 && (layer < .5 || (layer < 1.5 && fract(seed * 19.137) < .63));
  if (bundled) {
    // Lower tiers resolve a lock of tapered fibers within each ribbon. The
    // atlas is premultiplied so the mip chain preserves the fine tips.
    float crossSection = vMeta.y * (1. + filterWidth / max(.001, radius));
    float x = .5 + .5 * crossSection;
    if (x < 0. || x > 1.) discard;
    float tile = floor(seed * 7.999);
    vec2 uv = vec2((64. * tile + 3. + 58. * x) / 512., (3. + 122. * u) / 128.);
    vec4 fibers = texture2D(tuftMap, uv);
    coverage *= fibers.a;
    vec3 detail = fibers.rgb / max(.002, fibers.a);
    u = mix(u, detail.g, .72);
    tone = clamp(tone + .47 * (detail.r - .5), 0., 1.);
    variation = mix(variation, detail.b, .65);
  }
  if (coverage < .014 || (passMode < .5 && coverage < core)
    || (passMode > .5 && passMode < 1.5 && coverage >= core)) discard;

  vec3 t = normalize(vT), n = normalize(vN), view = normalize(vView);
  float guard = max(0., layer - 1.), down = max(0., 1. - layer);
  float exposed = smoothstep(.06, .88, u) * (1. - .43 * down);
  float valley = vOcclusion.x;
  vec3 mid = shaftColor(streak, tone);
  vec3 root = mix(vec3(.145, .036, .013), vec3(.064, .016, .081), streak);
  vec3 tip = mix(vec3(1.06, .39, .084), vec3(.44, .133, .59), streak);
  vec3 pigment = mix(root, mid, smoothstep(-.02, .56, u));
  pigment = mix(pigment, tip, smoothstep(.50, .97, u) * (.36 + .42 * tone));
  // Agouti banding is strongest in the long guards. A pale subterminal band
  // and a dark terminal point break up the mass of solid pigment in the awns.
  float bandAt = u + .15 * (variation - .5);
  float band = smoothstep(.46, .67, bandAt) * (1. - smoothstep(.73, .91, bandAt));
  float tick = smoothstep(.69, .96, bandAt) * smoothstep(.12, .69, seed);
  vec3 bandColor = mix(vec3(1.12, .70, .39), vec3(.70, .43, .78), streak);
  pigment = mix(pigment, bandColor, band * (.59 * guard + .16 * layer) * (.46 + .54 * variation));
  pigment *= 1. - tick * (.64 * guard + .064 * layer);
  pigment = mix(pigment, bandColor, guard * smoothstep(.78, .98, u) * (1. - smoothstep(.02, .22, seed)) * .72);
  pigment *= .84 + .28 * variation;

  float nk = dot(n, key);
  float wrap = clamp((nk + .37) / 1.37, 0., 1.);
  float tk = dot(t, key);
  float cylinder = sqrt(max(.0, 1. - tk * tk));
  float estimate = mix(.34, .95, exposed) * (1. - .21 * valley);
  float vis = keyVisibility(vLight, estimate);
  float pocket = (1. - .33 * valley * (1. - .68 * exposed)) * vOcclusion.y;
  float roots = mix(.50, 1., smoothstep(.02, .72, u));
  float hemi = .5 + .5 * dot(n, fill);
  vec3 sky = mix(vec3(.115, .108, .151), vec3(.25, .28, .38), hemi);
  vec3 bounce = vec3(.095, .061, .032) * (.32 + .68 * max(0., dot(n, fill)));
  vec3 indirect = (sky + bounce) * pigment + .09 * pigment * pigment;
  vec3 diffuse = pigment * vec3(1.76, 1.59, 1.37) * (.10 + .90 * wrap) * (.40 + .60 * cylinder);

  // Two shifted longitudinal lobes: a nearly colorless cuticle reflection
  // and a broader, pigmented internal reflection on the opposite slope.
  vec3 hk = normalize(key + view);
  float smoothCoat = .52 + .27 * layer;
  // On a resolved shaft the window catches one side of the cylindrical
  // cuticle. Integrate that response across the width of subpixel fibers.
  float resolved = bundled ? 0. : smoothstep(.80, 2.3, radius / filterWidth);
  vec3 widthAxis = cross(t, view);
  widthAxis /= max(.001, length(widthAxis));
  float crossPos = clamp(vMeta.y * (radius + filterWidth) / max(radius, .01), -.96, .96);
  vec3 fiberNormal = widthAxis * crossPos + cross(widthAxis, t) * sqrt(1. - crossPos * crossPos);
  float azimuth = clamp(dot(fiberNormal, hk), 0., 1.);
  float cuticle = sheen(t, hk, -.085 + .045 * seed, 82. + 98. * smoothCoat);
  float internal = sheen(t, hk, .17, 20. + 20. * smoothCoat);
  cuticle *= mix(1., .16 + 1.44 * azimuth * azimuth * azimuth, resolved);
  diffuse *= mix(1., .69 + .41 * max(0., dot(fiberNormal, key)), resolved);
  float gloss = (.26 + .74 * exposed) * smoothCoat * (.21 + .79 * wrap);
  vec3 spec = (vec3(.58, .51, .44) * cuticle + (.045 + .64 * pigment) * internal) * gloss;
  float brush = sheen(t, normalize(brushLight + view), -.07, 85.);
  spec += vec3(.085, .077, .083) * brush * pulse * exposed;

  // Backlight travels through the thinner tips and catches the guard cuticle.
  float rimFace = smoothstep(-.38, .78, dot(n, rim));
  float edge = pow(1. - clamp(dot(n, view), 0., 1.), 1.75);
  float rimLobe = sheen(t, normalize(rim + view), -.04, 52.);
  float back = rimFace * (.06 + .94 * edge) * (.20 + .80 * exposed);
  vec3 scatter = (sqrt(pigment) * vec3(1.22, .86, .66) + (.33 + .38 * guard) * rimLobe) * back;
  vec3 col = (indirect * roots + diffuse * roots * (.07 + .93 * vis)
    + spec * (.09 + .91 * sqrt(vis))) * pocket + scatter;
  col += .06 * (1. - recovery) * exposed * sqrt(pigment);
  vec3 rgb = displayColor(col);
  float alpha = passMode < .5 ? 1. : min(1., coverage / (tuftMode > .5 ? .86 : core));
  gl_FragColor = vec4(rgb * alpha, alpha);
}`;

function make2DTexture(gl, source) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function makeGuideTexture(gl, data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GUIDE_TEX_W, GUIDE_TEX_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Eight lock profiles for the down and awn hairs on the lowest tier. Alpha
// is optical coverage; the premultiplied channels carry pigment variation,
// distance along the individual fiber, and its relative brightness.
function makeTuftMap(gl) {
  const w = 512, h = 128, tileW = 64, tileH = 128;
  const data = new Uint8Array(w * h * 4);
  const rng = makeRng(0xf0c02a);
  for (let tile = 0; tile < 8; tile++) {
    const count = 17;
    for (let i = 0; i < count; i++) {
      const root = (rng() - .5) * .93, lean = (rng() - .5) * .29;
      const curl = (rng() - .5) * .30, hFrac = .67 + .32 * rng();
      const phase = rng() * 6.28, width = 1.2 + 1.57 * rng();
      const tone = rng(), light = rng();
      for (let y = 3; y < tileH - 3; y++) {
        const u = (y - 3) / (122 * hFrac);
        if (u >= 1) break;
        const center = 32 + 55 * (root * (1 - .60 * u) + lean * u
          + curl * u * (1 - u) + .028 * Math.sin(phase + u * 5) * u);
        const radius = width * (1 - .98 * u ** 1.4);
        const left = Math.max(2, Math.floor(center - radius - .5));
        const right = Math.min(tileW - 3, Math.ceil(center + radius + .5));
        for (let x = left; x <= right; x++) {
          const a = .95 * Math.max(0, Math.min(1, radius * 2, .5 + radius - Math.abs(x + .5 - center)));
          const o = (y * w + tile * tileW + x) * 4;
          data[o] = Math.round(tone * a * 255 + data[o] * (1 - a));
          data[o + 1] = Math.round(u * a * 255 + data[o + 1] * (1 - a));
          data[o + 2] = Math.round(light * a * 255 + data[o + 2] * (1 - a));
          data[o + 3] = Math.round(a * 255 + data[o + 3] * (1 - a));
        }
      }
    }
  }
  return fiberTexture(gl, w, h, data, gl.CLAMP_TO_EDGE);
}

function makeNapMap(gl) {
  const size = 128, mask = size - 1;
  const rng = makeRng(0xead7ab);
  const noise = Float32Array.from({ length: size * size }, () => 2 * rng() - 1);
  const data = new Uint8Array(size * size * 4);
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < directions.length; c++) {
    const [dx, dy] = directions[c];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -7; k <= 7; k++) {
        const weight = 1 - Math.abs(k) / 8;
        sum += weight * noise[((y + k * dy) & mask) * size + ((x + k * dx) & mask)];
      }
      data[(y * size + x) * 4 + c] = Math.round(255 * Math.max(0, Math.min(1, .5 + .16 * sum)));
    }
  }
  return fiberTexture(gl, size, size, data, gl.REPEAT);
}

function fiberTexture(gl, width, height, data, wrap) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

function makeShadowMap(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_SIZE, SHADOW_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHADOW_SIZE, SHADOW_SIZE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  if (complete) return { fbo, tex };
  gl.deleteFramebuffer(fbo);
  gl.deleteRenderbuffer(depth);
  gl.deleteTexture(tex);
  return null;
}

function locations(gl, prog, attributes) {
  const loc = { prog };
  for (const name of attributes) loc[name] = gl.getAttribLocation(prog, name);
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(prog, i).name;
    loc[name] = gl.getUniformLocation(prog, name);
  }
  return loc;
}

export function initFurGlass(gl, { software, groundMap }) {
  const vertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
  const instancing = gl.getExtension('ANGLE_instanced_arrays');
  const shape = strandShape(vertexTextures);
  const groundProg = program(gl, groundVert, groundFrag);
  const shellProg = program(gl, shellVert, shellFrag);
  const strandProg = program(gl, furVert(shape), strandFrag);
  if (!groundProg || !shellProg || !strandProg) return null;
  const coreAttrs = ['aPosPart', 'aNormSt', 'aFlowLen'];
  const strandAttrs = ['aRibbon', ...ATTRIBUTES];
  const floor = locations(gl, groundProg, ['p']);
  const shell = locations(gl, shellProg, coreAttrs);
  const hair = locations(gl, strandProg, strandAttrs);
  const tierLimit = software || !instancing ? 0 : 2;
  const shadow = tierLimit > 0 && makeShadowMap(gl);
  const skinDepth = shadow && program(gl, coreShadowVert, shadowFrag);
  const pileDepth = shadow && program(gl, furShadowVert(shape), shadowFrag);
  const skinCaster = skinDepth && locations(gl, skinDepth, coreAttrs);
  const pileCaster = pileDepth && locations(gl, pileDepth, strandAttrs);
  const rng = makeRng(0xB3441E89);
  const mesh = buildCoreMesh(software ? 18 : 24);
  const physics = createHairPhysics(mesh, rng);
  const contact = coatContact();
  const drawStrands = strandGeometry(gl, instancing, mesh, physics, rng, COUNTS[tierLimit]);
  const quad = buffer(gl, gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
  const vertices = buffer(gl, gl.ARRAY_BUFFER, mesh.vertices);
  const indices = buffer(gl, gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
  const napMap = makeNapMap(gl);
  const tuftMap = makeTuftMap(gl);
  const groundTexture = make2DTexture(gl, groundMap);
  const guideTexture = vertexTextures && makeGuideTexture(gl, physics.texData);

  function drawCore(loc, shellFrac) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    coreAttrs.forEach((name, i) => {
      if (loc[name] < 0) return;
      gl.enableVertexAttribArray(loc[name]);
      gl.vertexAttribPointer(loc[name], 4, gl.FLOAT, false, mesh.stride * 4, i * 16);
    });
    gl.uniform1f(loc.shellFrac, shellFrac);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    for (const name of coreAttrs) if (loc[name] >= 0) gl.disableVertexAttribArray(loc[name]);
  }

  const key = new Float32Array(3), rim = new Float32Array(3), fill = new Float32Array(3);
  const lightX = new Float32Array(3), lightY = new Float32Array(3), brushLight = new Float32Array(3);
  function studioVector(out, rows, x, y, z, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), inv = 1 / Math.hypot(x, y, z);
    const rx = (x * c + z * s) * inv, rz = (z * c - x * s) * inv;
    for (let i = 0; i < 3; i++) out[i] = rows[0][i] * rx + rows[1][i] * y * inv - rows[2][i] * rz;
  }
  function lightCamera(loc) {
    gl.uniform3fv(loc.key, key);
    gl.uniform3fv(loc.lightX, lightX);
    gl.uniform3fv(loc.lightY, lightY);
  }

  return {
    render({ rows, centre, view = [centre[0] * 2, centre[1] / .48], size, lift, shift, glint, sway, ground, recovery = 1, pulse = 0,
      lightAngle = 0, time = 0, quality = 2, pointer = [0, 0],
      shocks = [[0, 0, 9, 0], [0, 0, 9, 0]], halfMotion = [0, 0, 0, 0] }, { box, ratio }) {
      const tier = Math.min(quality, tierLimit);
      const useShadow = tier > 0 && skinCaster && pileCaster;
      const budget = COUNTS[tier];
      const angle = lightAngle + .22 * glint;
      studioVector(key, rows, -.73, -.60, .34, angle);
      studioVector(rim, rows, .76, -.35, -.54, angle * .55);
      studioVector(fill, rows, .28, .46, .82, 0);
      studioVector(brushLight, rows, pointer[0] * .85, pointer[1] * .80 - .2, .90, 0);
      // The key's tilt keeps its projection axis well away from the pole.
      const inv = 1 / Math.max(.0001, Math.hypot(key[0], key[2]));
      lightX[0] = key[2] * inv; lightX[1] = 0; lightX[2] = -key[0] * inv;
      lightY[0] = key[1] * lightX[2];
      lightY[1] = key[2] * lightX[0] - key[0] * lightX[2];
      lightY[2] = -key[1] * lightX[0];

      contact.update({ rows, centre, view, size, lift, shift, halfMotion, pointer, shocks, time });
      if (vertexTextures) {
        physics.update({ time, sway, lift, contact, pulse, halfMotion, rows });
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, guideTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GUIDE_TEX_W, GUIDE_TEX_H, gl.RGBA, gl.UNSIGNED_BYTE, physics.texData);
      }
      function pose(loc) {
        gl.useProgram(loc.prog);
        gl.uniform4fv(loc.halfMotion, halfMotion);
        gl.uniform1f(loc.spread, Math.abs(shift[1]));
        lightCamera(loc);
      }
      function lens(loc) {
        gl.uniform3fv(loc.row1, rows[0]);
        gl.uniform3fv(loc.row2, rows[1]);
        gl.uniform3fv(loc.row3, rows[2]);
        gl.uniform4fv(loc.box, box);
        gl.uniform2fv(loc.centre, centre);
        gl.uniform1f(loc.size, size);
        gl.uniform1f(loc.lift, lift);
        gl.uniform3fv(loc.fill, fill);
        if (loc.rim) gl.uniform3fv(loc.rim, rim);
        gl.uniform1i(loc.shadowMap, 3);
        gl.uniform1f(loc.shadowTaps, useShadow ? (tier === 2 ? 4 : 1) : 0);
      }
      function motion(loc) {
        gl.uniform1f(loc.time, time);
        gl.uniform1f(loc.sway, sway);
        if (vertexTextures) gl.uniform1i(loc.guideTex, 2);
        else {
          gl.uniform4fv(loc.brush, contact.hit);
          gl.uniform3fv(loc.brushForce, contact.velocity);
          gl.uniform4fv(loc.rippleA, contact.rings[0]);
          gl.uniform4fv(loc.rippleB, contact.rings[1]);
        }
      }

      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.depthFunc(gl.LEQUAL);
      gl.clearDepth(1);
      gl.disable(gl.BLEND);
      if (useShadow) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo);
        gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
        gl.clearColor(1, 0, 1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.colorMask(true, true, false, false);
        pose(skinCaster);
        drawCore(skinCaster, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(false, false, true, true);
        pose(pileCaster);
        motion(pileCaster);
        drawStrands(pileCaster, tier === 2 ? 12288 : 8192);
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, groundTexture);
      gl.useProgram(floor.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(floor.p);
      gl.vertexAttribPointer(floor.p, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(floor.groundMap, 1);
      gl.uniform4fv(floor.box, box);
      gl.uniform4fv(floor.shadow, ground);
      gl.uniform1f(floor.sway, sway);
      gl.uniform1f(floor.lift, lift);
      gl.uniform1f(floor.pulse, pulse);
      gl.uniform1f(floor.lightAngle, lightAngle);
      gl.uniform1f(floor.time, time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(floor.p);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, napMap);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, useShadow ? shadow.tex : napMap);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      pose(shell);
      lens(shell);
      gl.uniform1i(shell.napMap, 0);
      drawCore(shell, 0);
      if (tier > 0) drawCore(shell, .52);
      drawCore(shell, 1);

      pose(hair);
      lens(hair);
      motion(hair);
      gl.uniform3fv(hair.brushLight, brushLight);
      gl.uniform1f(hair.pixel, 1 / (size * ratio));
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, tuftMap);
      gl.uniform1i(hair.tuftMap, 4);
      gl.uniform1f(hair.tuftMode, tier === 0 ? 1 : 0);
      gl.uniform1f(hair.widthBoost, tier === 0 ? 1.48 : tier === 1 ? 1.24 : 1);
      gl.uniform1f(hair.pulse, pulse);
      gl.uniform1f(hair.recovery, recovery);
      const curveScale = tier === 2 ? size * ratio : 0;
      if (tier > 0) {
        gl.uniform1f(hair.passMode, 0);
        drawStrands(hair, budget, 'depth', curveScale);
      }
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.uniform1f(hair.passMode, tier === 0 ? 2 : 1);
      drawStrands(hair, budget, tier === 0 ? 'tufts' : 'fringe', curveScale);
      gl.depthMask(true);
      return true;
    },
  };
}
