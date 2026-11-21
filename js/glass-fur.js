// Variant 2: AAA 3D Plush Fur Split-B Sculpture — Bright Orange Fur with Electric Bright Purple Streaks.
//
// Groom, Physics & Rendering Architecture (V2 Museum Lookdev):
//   - Watertight Cubed-Sphere Pillowed Split-B Core + Deep Velvety Underfur Coat:
//     Exact 3D SDF projection creates a seamless pillowed split-B inner skin tucked strictly
//     beneath the strand roots (-0.006 to +0.018), guaranteeing rich deep root color and
//     zero bald gaps from any 3D orbit angle without ever poking through the silky top coat.
//   - Real-Time PBD / Verlet Guide-Hair Physics Engine (480 Guides × 6 Dynamic Nodes):
//     Zero-GC typed-array Position-Based Dynamics with exact inextensible distance constraints,
//     3D B-half SDF collision push-out, half-B rigid inertial whip on drag/orbit/sway,
//     interactive cursor brushing wake, expanding click air-puff shockwaves, and a coherent
//     travelling light-breeze wind field rippling serenely across the fur locks.
//     Simulated displacements upload to the GPU at exact 16-bit fixed-point precision via a
//     standard WebGL 1 RGBA8 data texture (zero float-texture extensions required!).
//   - 27,600 Real 3D 6-Segment Tapered Hair Strand Ribbons (6 Uint16 VBO batches):
//     Area-stratified across front, back, curved barrels, flat stem, top/bottom ends, and
//     feathered diagonal cut lips. Tangent-projected multi-scale clumping creates lush silky
//     locks with cohesive sweeping electric-purple streaks weaving through blazing bright
//     orange fur. Sub-pixel width clamping + analytic coverage compensation keeps wispy tips
//     razor-smooth without aliasing.
//   - Two-Pass Depth-Core + Silky Anti-Aliased Fringe Shading:
//     Pass 1 writes exact 3D depth for solid strand cores; Pass 2 alpha-blends feathery edges
//     and translucent backlit tips against the warm gallery paper with saturation-preserving
//     Marschner/Kajiya-Kay dual-lobe anisotropic specular (R + pigmented TRT), Pixar multiple-
//     scattering shadow richness, and sunlit TT rim translucency.
import { program } from './gl/gl.js';

const SLOPE = 0.27875;
const NORM = 1 / Math.hypot(SLOPE, 1);
const D_CAM = 10.5;
const SEGMENTS = 6;
const NUM_GUIDES = 480;
const GUIDE_TEX_W = 512;
const GUIDE_TEX_H = 16; // rows 0..5 = hi byte of offsets 1..6, rows 8..13 = lo byte
const PACK_RANGE = 0.42;

// ---------------------------------------------------------------------------
// 1. Exact 3D Pillowed Split-B Signed Distance Field & Analytical Gradient
// ---------------------------------------------------------------------------
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
  const crown = 0.036 * smoothstep(0, 0.34, -d2d);
  const halfZ = 0.236 + crown;
  const dz = Math.abs(pz) - halfZ;
  const bev = d2d * 0.72 + dz * 0.69 + 0.068;
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

// ---------------------------------------------------------------------------
// 2. Sculpted Flowing Streak Field (Bright Orange + Sleek Bright Purple Streaks)
//    & Natural Groom Flow Field
// ---------------------------------------------------------------------------
function streakField(x, y, z) {
  // Cohesive, sleek editorial streak ribbons flowing along the fur's natural comb direction!
  // Gently S-curved diagonal locks wrapping cleanly around both bowls & curved 3D barrels
  // (zero crossing blotches — reads unmistakably as bright orange fur with bright purple streaks!).
  const flowWarp = 0.092 * Math.sin(y * 3.8 - x * 1.4 + z * 1.8 + 0.35)
    + 0.032 * Math.cos(y * 7.4 + x * 2.5 - z * 2.2);
  // Perpendicular coordinate across the sweeping diagonal-downward streak bands
  const across = x * 0.88 - y * 0.34 + z * 0.38 + flowWarp;

  // 3 bold sweeping purple streak ribbons (~28% coverage) + 1 delicate secondary highlight streak
  const band1 = Math.sin(across * 13.8 - 0.85);
  const primary = smoothstep(0.54, 0.82, band1);

  // Fine secondary wisp streak offset smoothly between main ribbons for layered natural depth
  const band2 = Math.sin(across * 27.6 + 1.45);
  const fineWisp = smoothstep(0.84, 0.96, band2) * 0.78;

  return Math.max(0, Math.min(1, Math.max(primary, fineWisp)));
}

function groomDirection(px, py, pz, nx, ny, nz, part, outDir, outLenScale) {
  const cutSigned = (py + SLOPE * px - 0.98) * NORM;
  const cutDist = Math.abs(cutSigned);
  const nearCut = 1 - smoothstep(0.052, 0.165, cutDist);

  // Natural downward-right combed pelage following the sculptural curves of both B bowls
  const cx = part === 0 ? 0.57 : 0.71;
  const cy = part === 0 ? 0.43 : 1.20;
  const rx = px - cx, ry = py - cy;
  const rad = Math.hypot(rx, ry) + 1e-4;
  const swirlX = -ry / rad * 0.24;
  const swirlY = rx / rad * 0.20;

  let fx = 0.30 + swirlX;
  let fy = 0.88 + swirlY;
  let fz = 0.08 * Math.sign(pz || 1);

  if (nearCut > 0.001) {
    const awaySign = part === 0 ? -1 : 1;
    fx += SLOPE * NORM * awaySign * nearCut * 0.85;
    fy += NORM * awaySign * nearCut * 1.05;
  }

  const ndf = nx * fx + ny * fy + nz * fz;
  let tx = fx - nx * ndf;
  let ty = fy - ny * ndf;
  let tz = fz - nz * ndf;
  const tLen = Math.hypot(tx, ty, tz);
  if (tLen > 1e-4) {
    tx /= tLen; ty /= tLen; tz /= tLen;
  } else {
    tx = 1; ty = 0; tz = 0;
  }

  // Lush outward loft so locks stand full & plush (zero matted flat patches!)
  const liftAmt = 0.64 + 0.14 * (1 - Math.abs(nz));
  const flowAmt = 0.74 - 0.10 * nearCut;
  const dx = nx * liftAmt + tx * flowAmt;
  const dy = ny * liftAmt + ty * flowAmt;
  const dz = nz * liftAmt + tz * flowAmt;
  const dInv = 1 / (Math.hypot(dx, dy, dz) || 1);
  outDir[0] = dx * dInv;
  outDir[1] = dy * dInv;
  outDir[2] = dz * dInv;

  const cutWallFacing = (part === 0 ? ny > 0.45 : ny < -0.45) ? nearCut : nearCut * 0.52;
  const lenScale = 1.0 - 0.54 * cutWallFacing;
  if (outLenScale) outLenScale[0] = lenScale;
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

// ---------------------------------------------------------------------------
// 3. Watertight Cubed-Sphere Core Mesh + Deep Velvety Underfur Coat
// ---------------------------------------------------------------------------
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
          verts.push(p[0], p[1], p[2], n[0], n[1], n[2], part, st, gDir[0], gDir[1], gDir[2], lenS[0]);
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
            const dotN = crx * verts[o0 + 3] + cry * verts[o0 + 4] + crz * verts[o0 + 5];
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

function sampleSurfacePoint(mesh, rng, outPos, outNorm) {
  const target = rng() * mesh.totalArea;
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

// ---------------------------------------------------------------------------
// 4. Spatial Grid for Instant O(1) Nearest-Guide & Nearest-Clump Lookup
// ---------------------------------------------------------------------------
function buildSpatialGrid(coords, parts, count, cellSize = 0.14) {
  const map = new Map();
  const key = (part, ix, iy, iz) => `${part}:${ix},${iy},${iz}`;
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
        if (i1 >= 0) break;
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

// ---------------------------------------------------------------------------
// 5. Real-Time PBD / Verlet Guide-Hair Physics Engine (480 Guides × 6 Nodes)
//    Tuned specifically for a serene, coherent, rippling LIGHT BREEZE!
// ---------------------------------------------------------------------------
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
  let lastSway = 0, lastLift = 0, lastPx = 0, lastPy = 0;
  let lastShear0 = 0, lastShear1 = 0, lastR1y = 1;
  let velSway = 0, velLift = 0, velPitch = 0;

  function stepSub(dt, time, accelX, accelY, accelZ, pointerX, pointerY, pVelX, pVelY, shocks, pulse) {
    const dt2 = dt * dt;
    const damp = Math.pow(0.035, dt); // silky, plush damping — zero choppy jitter!

    // Serene, continuous gallery LIGHT BREEZE blowing smoothly from left-to-right!
    // Coherent travelling spatial waves make locks ripple gracefully together in unison.
    const macroBreath = 0.82 + 0.28 * Math.sin(time * 0.88) + 0.14 * Math.sin(time * 1.52 + 1.1);
    const breezeBaseX = 1.28 * macroBreath;
    const breezeBaseY = (-0.18 + 0.22 * Math.sin(time * 0.68 + 0.5)) * macroBreath;
    const breezeBaseZ = (0.34 + 0.20 * Math.cos(time * 0.82 + 1.9)) * macroBreath;

    const curX = 0.56 + pointerX * 0.52;
    const curY = 0.845 + pointerY * 0.68;
    const pSpeed = Math.hypot(pVelX, pVelY);
    const sA = shocks[0], sB = shocks[1];

    for (let i = 0; i < NUM_GUIDES; i++) {
      const part = guidePart[i];
      const base = i * strideN * 3;
      const rx = rootPos[i * 3], ry = rootPos[i * 3 + 1], rz = rootPos[i * 3 + 2];
      const nx = rootNorm[i * 3], ny = rootNorm[i * 3 + 1], nz = rootNorm[i * 3 + 2];
      const segL = guideLen[i] / SEGMENTS;
      const seed = guideSeed[i];

      // COHERENT travelling wind waves (ZERO random phase jump between adjacent guides!)
      const wPhase1 = rx * 3.1 - ry * 0.95 - time * 2.25;
      const wPhase2 = rx * 5.2 + ry * 2.4 - time * 3.35 + rz * 2.8;
      const wPhase3 = ry * 3.8 - rx * 1.7 + time * 1.65;
      const waveGust = 0.78 + 0.34 * Math.sin(wPhase1) + 0.15 * Math.sin(wPhase2);
      const eddyY = 0.36 * Math.sin(wPhase2 + 0.7) + 0.20 * Math.cos(wPhase3);
      const eddyZ = 0.38 * Math.cos(wPhase1 * 1.15 + rz * 2.6) + 0.22 * Math.sin(wPhase3 * 1.2);

      // Gentle exposure gradient so front & windward barrels ripple cleanly
      const exposure = 0.68 + 0.32 * Math.max(0, 0.5 + 0.5 * (nx * 0.4 + nz * 0.6));

      // Interactive cursor brushing / air wake!
      let brushX = 0, brushY = 0, brushZ = 0;
      const pdx = rx - curX, pdy = ry - curY;
      const pDist2 = pdx * pdx + pdy * pdy;
      if (pDist2 < 0.32 && pSpeed > 0.02) {
        const fall = Math.exp(-pDist2 * 10.5) * Math.min(pSpeed, 6.0);
        const invD = 1 / (Math.sqrt(pDist2) + 0.08);
        brushX = (pVelX * 1.35 + pdx * invD * 0.75) * fall;
        brushY = (pVelY * 1.35 + pdy * invD * 0.75) * fall;
        brushZ = -0.35 * fall * (nz > 0 ? 1 : -0.3);
      }

      // Click air-puff expanding shockwave
      let puffX = 0, puffY = 0, puffZ = 0;
      for (let si = 0; si < 2; si++) {
        const s = si === 0 ? sA : sB;
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

      const pressLift = pulse * 1.15;

      for (let k = 1; k <= SEGMENTS; k++) {
        const o = base + k * 3;
        const frac = k / SEGMENTS;
        const flex = Math.pow(frac, 1.38);

        // Gossamer micro-flutter strictly at the fine tips (keeps roots & mid-shaft silky & cohesive!)
        const flutter = frac * frac * frac * (0.55 + 0.45 * macroBreath);
        const flY = Math.sin(time * 5.2 + seed * 14.0 + k * 0.7) * 0.28 * flutter;
        const flZ = Math.cos(time * 4.4 + seed * 11.3 + k * 0.9) * 0.32 * flutter;

        const fx = (breezeBaseX * waveGust * exposure + accelX + brushX + puffX + nx * pressLift) * flex;
        const fy = (breezeBaseY * waveGust * exposure + eddyY * exposure + 0.42 + accelY + brushY + puffY + ny * pressLift + flY) * flex;
        const fz = (breezeBaseZ * waveGust * exposure + eddyZ * exposure + accelZ + brushZ + puffZ + nz * pressLift + flZ) * flex;

        // Strong plush root anchor relaxing gracefully into supple wind-swept tips!
        const stiff = 42.0 * Math.pow(1 - 0.76 * frac, 1.8);
        const cx = pos[o], cy = pos[o + 1], cz = pos[o + 2];
        const vx = (cx - prev[o]) * damp;
        const vy = (cy - prev[o + 1]) * damp;
        const vz = (cz - prev[o + 2]) * damp;

        prev[o] = cx; prev[o + 1] = cy; prev[o + 2] = cz;
        pos[o] = cx + vx + (fx + (rest[o] - cx) * stiff) * dt2;
        pos[o + 1] = cy + vy + (fy + (rest[o + 1] - cy) * stiff) * dt2;
        pos[o + 2] = cz + vz + (fz + (rest[o + 2] - cz) * stiff) * dt2;
      }

      // Exact inextensible PBD constraints + generous SDF clearance so locks NEVER sink behind core!
      for (let iter = 0; iter < 2; iter++) {
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
  }

  function packTexture() {
    const invRange = 0.5 / PACK_RANGE;
    for (let i = 0; i < NUM_GUIDES; i++) {
      const rx = rootPos[i * 3], ry = rootPos[i * 3 + 1], rz = rootPos[i * 3 + 2];
      const base = i * strideN * 3;
      for (let k = 1; k <= SEGMENTS; k++) {
        const o = base + k * 3;
        const ox = Math.max(0, Math.min(1, (pos[o] - rx) * invRange + 0.5));
        const oy = Math.max(0, Math.min(1, (pos[o + 1] - ry) * invRange + 0.5));
        const oz = Math.max(0, Math.min(1, (pos[o + 2] - rz) * invRange + 0.5));

        const qx = Math.round(ox * 65535);
        const qy = Math.round(oy * 65535);
        const qz = Math.round(oz * 65535);

        const row = k - 1;
        const hiIdx = (row * GUIDE_TEX_W + i) * 4;
        const loIdx = ((row + 8) * GUIDE_TEX_W + i) * 4;

        texData[hiIdx] = qx >>> 8;
        texData[hiIdx + 1] = qy >>> 8;
        texData[hiIdx + 2] = qz >>> 8;
        texData[hiIdx + 3] = 255;

        texData[loIdx] = qx & 255;
        texData[loIdx + 1] = qy & 255;
        texData[loIdx + 2] = qz & 255;
        texData[loIdx + 3] = 255;
      }
    }
  }

  const zeroShocks = [[0, 0, 9, 0], [0, 0, 9, 0]];
  for (let w = 0; w < 24; w++) {
    stepSub(1 / 120, w * 0.016, 0, 0, 0, 0, 0, 0, 0, zeroShocks, 0);
    stepSub(1 / 120, w * 0.016 + 0.008, 0, 0, 0, 0, 0, 0, 0, zeroShocks, 0);
  }
  packTexture();

  function update({ time, sway, lift, pointer, shocks, pulse, halfMotion, rows }) {
    let dt = lastTime < 0 ? 1 / 60 : time - lastTime;
    const coldJump = lastTime < 0 || dt < 0 || dt > 0.25;
    if (coldJump) {
      lastSway = sway; lastLift = lift;
      lastPx = pointer[0]; lastPy = pointer[1];
      lastShear0 = halfMotion[0]; lastShear1 = halfMotion[1];
      lastR1y = rows[1][2];
      velSway = velLift = velPitch = 0;
      for (let w = 0; w < 12; w++) {
        const wt = Math.max(0, time - (11 - w) * 0.016);
        stepSub(1 / 120, wt, 0, 0, 0, pointer[0], pointer[1], 0, 0, shocks, pulse);
        stepSub(1 / 120, wt + 0.008, 0, 0, 0, pointer[0], pointer[1], 0, 0, shocks, pulse);
      }
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

    const pVelX = Math.max(-8, Math.min(8, (pointer[0] - lastPx) * invDt));
    const pVelY = Math.max(-8, Math.min(8, (pointer[1] - lastPy) * invDt));

    lastTime = time;
    lastSway = sway; lastLift = lift;
    lastPx = pointer[0]; lastPy = pointer[1];
    lastShear0 = halfMotion[0]; lastShear1 = halfMotion[1];
    lastR1y = pitchProxy;
    velSway = newVelSway; velLift = newVelLift; velPitch = newVelPitch;

    const subDt = dt * 0.5;
    stepSub(subDt, time - subDt, inertiaX, inertiaY, inertiaZ, pointer[0], pointer[1], pVelX, pVelY, shocks, pulse);
    stepSub(subDt, time, inertiaX, inertiaY, inertiaZ, pointer[0], pointer[1], pVelX, pVelY, shocks, pulse);
    packTexture();
  }

  return {
    rootPos, rootNorm, guidePart, guideLen, texData, update,
    grid: buildSpatialGrid(rootPos, guidePart, NUM_GUIDES, 0.14),
  };
}

// ---------------------------------------------------------------------------
// 6. Multi-Scale Sculpted Locks & 27,600 Fine Silky 6-Segment 3D Hair Strands!
// ---------------------------------------------------------------------------
function buildStrandBatches(gl, mesh, physics, rng) {
  const BATCHES = 6;
  const STRANDS_PER_BATCH = 4600; // 4600 * 14 = 64,400 verts (< 65535 Uint16!) -> 27,600 strands total!
  const VERTS_PER_STRAND = (SEGMENTS + 1) * 2; // 14 verts
  const TRIS_PER_STRAND = SEGMENTS * 2; // 12 tris -> 36 indices

  // 340 sculpted locks for silky tapered fur tufting with ZERO bald partings!
  const NUM_CLUMPS = 340;
  const clumpPos = new Float32Array(NUM_CLUMPS * 3);
  const clumpPart = new Uint8Array(NUM_CLUMPS);
  const clumpStreak = new Float32Array(NUM_CLUMPS);
  const clumpTone = new Float32Array(NUM_CLUMPS);

  const p = new Float32Array(3);
  const n = new Float32Array(3);

  for (let c = 0; c < NUM_CLUMPS; c++) {
    const part = sampleSurfacePoint(mesh, rng, p, n);
    clumpPos[c * 3] = p[0]; clumpPos[c * 3 + 1] = p[1]; clumpPos[c * 3 + 2] = p[2];
    clumpPart[c] = part;
    const baseSt = streakField(p[0], p[1], p[2]);
    // Cohesive lock-level streak pigment (clean flowing purple ribbons, never speckled noise!)
    clumpStreak[c] = smoothstep(0.36, 0.64, baseSt + (rng() - 0.5) * 0.08);
    clumpTone[c] = rng();
  }
  const clumpGrid = buildSpatialGrid(clumpPos, clumpPart, NUM_CLUMPS, 0.15);

  const FLOATS_PER_VERT = 23;
  const gIdx = [0, 0], gDist = [0, 0];
  const cIdx = [0, 0], cDist = [0, 0];

  const idxData = new Uint16Array(STRANDS_PER_BATCH * TRIS_PER_STRAND * 3);
  let io = 0;
  for (let s = 0; s < STRANDS_PER_BATCH; s++) {
    const bv = s * VERTS_PER_STRAND;
    for (let k = 0; k < SEGMENTS; k++) {
      const v0 = bv + k * 2;
      const v1 = v0 + 1;
      const v2 = v0 + 2;
      const v3 = v0 + 3;
      idxData[io++] = v0; idxData[io++] = v1; idxData[io++] = v2;
      idxData[io++] = v1; idxData[io++] = v3; idxData[io++] = v2;
    }
  }
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxData, gl.STATIC_DRAW);

  const batches = [];
  for (let b = 0; b < BATCHES; b++) {
    const vData = new Float32Array(STRANDS_PER_BATCH * VERTS_PER_STRAND * FLOATS_PER_VERT);
    let vo = 0;

    for (let s = 0; s < STRANDS_PER_BATCH; s++) {
      const part = sampleSurfacePoint(mesh, rng, p, n);
      const px = p[0], py = p[1], pz = p[2];
      const nx = n[0], ny = n[1], nz = n[2];

      physics.grid.findTwoNearest(px, py, pz, part, gIdx, gDist);
      const dSum = gDist[0] + gDist[1] + 1e-5;
      const blendB = Math.max(0, Math.min(1, gDist[0] / dSum));

      clumpGrid.findTwoNearest(px, py, pz, part, cIdx, cDist);
      const ci = cIdx[0];

      const seed = rng();
      const popRoll = rng();
      // Fine silky Pixar pelage mix:
      //   20% lush plush undercoat hairs (full coverage & zero bald spots!)
      //   64% fine silky sculpted primary fur strands
      //   16% delicate long guard hairs & airy fluttering flyaway wisps!
      let strandClass, lenRatio, baseHW, clumpPullAmt, curlAmp, clumpAO;
      if (popRoll < 0.20) {
        strandClass = 0.0;
        lenRatio = 0.62 + 0.24 * rng();
        baseHW = 0.0064 + 0.0020 * rng();
        clumpPullAmt = 0.26;
        curlAmp = 0.003 + 0.003 * rng();
        clumpAO = 0.60 + 0.22 * rng();
      } else if (popRoll < 0.84) {
        strandClass = 0.5;
        lenRatio = 0.88 + 0.28 * rng();
        baseHW = 0.0044 + 0.0018 * rng();
        clumpPullAmt = 0.42 + 0.22 * rng();
        curlAmp = 0.004 + 0.006 * rng();
        clumpAO = 0.78 + 0.20 * (1 - Math.min(1, cDist[0] * 6.5));
      } else {
        strandClass = 1.0;
        lenRatio = 1.12 + 0.32 * rng();
        baseHW = 0.0028 + 0.0014 * rng();
        clumpPullAmt = 0.18 + 0.20 * rng();
        curlAmp = 0.008 + 0.011 * rng();
        clumpAO = 0.92 + 0.08 * rng();
      }

      const cutDist = Math.abs((py + SLOPE * px - 0.98) * NORM);
      const nearCut = 1 - smoothstep(0.05, 0.14, cutDist);
      if (nearCut > 0.01) {
        lenRatio *= (1 - 0.34 * nearCut);
        curlAmp *= (1 - 0.45 * nearCut);
      }

      // CRITICAL: Project clump pull strictly onto the SURFACE TANGENT PLANE!
      // Prevents strands from ever diving inward into the convex B core mesh!
      let cpx = (clumpPos[ci * 3] - px) * clumpPullAmt;
      let cpy = (clumpPos[ci * 3 + 1] - py) * clumpPullAmt;
      let cpz = (clumpPos[ci * 3 + 2] - pz) * clumpPullAmt;
      const cDotN = cpx * nx + cpy * ny + cpz * nz;
      cpx -= nx * cDotN;
      cpy -= ny * cDotN;
      cpz -= nz * cDotN;

      // Clean cohesive flowing streaks with whisper-soft natural hair interleaving along ribbon edges
      const localSt = streakField(px, py, pz);
      const streakRaw = localSt * 0.62 + clumpStreak[ci] * 0.38 + (rng() - 0.5) * 0.12;
      const streak = smoothstep(0.38, 0.62, streakRaw);
      const toneVar = clumpTone[ci] * 0.45 + rng() * 0.55;

      for (let k = 0; k <= SEGMENTS; k++) {
        const u = k / SEGMENTS;
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          vData[vo++] = px; vData[vo++] = py; vData[vo++] = pz; vData[vo++] = part;
          vData[vo++] = u; vData[vo++] = sgn; vData[vo++] = baseHW; vData[vo++] = lenRatio;
          vData[vo++] = gIdx[0]; vData[vo++] = gIdx[1]; vData[vo++] = blendB; vData[vo++] = seed;
          vData[vo++] = streak; vData[vo++] = toneVar; vData[vo++] = clumpAO; vData[vo++] = curlAmp;
          vData[vo++] = cpx; vData[vo++] = cpy; vData[vo++] = cpz; vData[vo++] = strandClass;
          vData[vo++] = nx; vData[vo++] = ny; vData[vo++] = nz;
        }
      }
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vData, gl.STATIC_DRAW);
    batches.push({ vbo, indexCount: idxData.length });
  }

  return { batches, ibo, strideBytes: FLOATS_PER_VERT * 4 };
}

// ---------------------------------------------------------------------------
// 7. WebGL 1 Shaders (Soft Ground Shadow, Deep Velvety Underfur, AAA Hair)
// ---------------------------------------------------------------------------
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
uniform vec2 pointer;
uniform sampler2D groundMap;
varying vec2 vPlate;

void main() {
  vec2 guv = vec2(vPlate.x, -vPlate.y) * .5 + .5;
  float breezeShift = .003 * sin(time * 1.35 + guv.x * 4.5) + sway * .0055 + lightAngle * .009;
  vec4 base = texture2D(groundMap, guv + vec2(breezeShift * .45, 0.));
  float alpha = base.a;
  if (alpha < .0025) discard;
  float heightMod = clamp(1. - lift * 4.2, .88, 1.12);
  vec4 softTap = texture2D(groundMap, guv + vec2(breezeShift * 1.1, .012));
  vec3 col = mix(base.rgb, softTap.rgb, .38);
  float aOut = alpha * heightMod * (1. + .06 * pulse);
  gl_FragColor = vec4(col * aOut, aOut);
}`;

// Pass 1: Deep Plush Velvet Root Skin + Tight Sub-Surface Underfur Cushion
// (strictly <= 0.018 thickness so it NEVER pokes through the silky 3D hair strands!)
const shellVert = `
attribute vec4 aPosPart;
attribute vec4 aNormSt;
attribute vec4 aFlowLen;

uniform vec3 row1, row2, row3;
uniform vec4 box, halfMotion;
uniform vec2 centre;
uniform float size, lift, spread, time, shellFrac;

varying vec3 vPos;
varying vec3 vNorm;
varying vec3 vFlow;
varying float vStreak;
varying float vShell;
varying float vPart;

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 applyHalfTransform(vec3 p, float part) {
  if (part < .5) {
    vec2 c = p.xy - vec2(.50, .46);
    c = rot2(-halfMotion.z) * c;
    return vec3(c + vec2(.50, .46) + vec2(halfMotion.x, -spread), p.z);
  }
  vec2 c = p.xy - vec2(.58, 1.22);
  c = rot2(-halfMotion.w) * c;
  return vec3(c + vec2(.58, 1.22) + vec2(halfMotion.y, spread), p.z);
}

void main() {
  float part = aPosPart.w;
  vec3 p = aPosPart.xyz;
  vec3 n = normalize(aNormSt.xyz);
  vec3 flow = normalize(aFlowLen.xyz);
  float lenS = aFlowLen.w;

  // Tucked cleanly inside the fur roots (-0.008 core up to +0.018 max dense velvet base)
  float h = shellFrac < .001 ? -.008 : shellFrac * .018 * lenS;
  vec3 displaced = p + (shellFrac < .001 ? n * h : mix(n, flow, .35) * h);

  vec3 wp = applyHalfTransform(displaced, part);
  vec3 q = vec3(wp.x - .56, wp.y - .845 + lift, wp.z);
  float cz = dot(row3, q);
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + cz);
  vec2 screen = centre + size * vec2(dot(row1, q), dot(row2, q)) * persp;
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, cz * .25, 1.);

  vPos = wp;
  vNorm = n;
  vFlow = flow;
  vStreak = aNormSt.w;
  vShell = shellFrac;
  vPart = part;
}`;

const shellFrag = `precision highp float;
uniform vec3 row1, row2, row3;
uniform vec2 lightRot, pointer;
uniform float time, lift, sway, pulse;

varying vec3 vPos;
varying vec3 vNorm;
varying vec3 vFlow;
varying float vStreak;
varying float vShell;
varying float vPart;

float hash31(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3. - 2. * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
        mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
        mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}

vec3 rotY(vec3 d) {
  return vec3(lightRot.x * d.x + lightRot.y * d.z, d.y, -lightRot.y * d.x + lightRot.x * d.z);
}

// Saturation-preserving filmic sRGB curve (keeps blazing orange & electric purple vivid!)
vec3 toneDisplay(vec3 c) {
  c = max(c, 0.);
  float peak = max(c.r, max(c.g, c.b));
  float mappedPeak = peak / (1. + peak * .24);
  vec3 m = peak > 1e-4 ? c * (mappedPeak / peak) : vec3(0.);
  return pow(clamp(m, 0., 1.), vec3(1. / 2.2));
}

void main() {
  vec3 n = normalize(vNorm);
  vec3 T = normalize(vFlow);
  if (vShell > .001) {
    // Ultra-fine silky underfur fiber texture strictly deep between roots
    vec3 fiberCoord = vPos * 92. - T * (vShell * 4.5);
    float tuft = vnoise3(fiberCoord) * .65 + vnoise3(fiberCoord * 2.1 + 5.1) * .35;
    if (tuft < mix(.22, .72, vShell)) discard;
  }

  float st = smoothstep(.36, .64, vStreak);
  // Deep, velvety, saturated orange & royal-purple undercoat roots (never flat brown!)
  vec3 orangeRoot = vec3(.46, .048, .001);
  vec3 orangeMid  = vec3(.92, .140, .002);
  vec3 purpleRoot = vec3(.12, .006, .38);
  vec3 purpleMid  = vec3(.38, .022, .88);

  vec3 albedo = mix(mix(orangeRoot, purpleRoot, st), mix(orangeMid, purpleMid, st), vShell);

  float cutGap = abs((vPos.y + .27875 * vPos.x - .98) * .96327);
  float kerfAO = vPart > .5 ? smoothstep(.04, .22, cutGap) * .42 + .58 : 1.;
  float rootAO = mix(.38, .72, vShell) * kerfAO;

  vec3 Lkey  = rotY(normalize(vec3(-.66, -.54, .58)));
  vec3 Lfill = rotY(normalize(vec3(.76, .12, .50)));
  float wrapKey  = clamp((dot(n, Lkey) + .58) / 1.58, 0., 1.);
  float wrapFill = clamp((dot(n, Lfill) + .62) / 1.62, 0., 1.);

  vec3 deepTint = albedo * albedo * 1.45;
  vec3 col = (mix(deepTint, albedo, wrapKey) * (.32 + .92 * wrapKey) + albedo * wrapFill * .34) * rootAO;
  gl_FragColor = vec4(toneDisplay(col), 1.);
}`;

// Pass 2 & Pass 3: AAA 27,600 Fine 6-Segment Tapered 3D Hair Strand Ribbons!
const strandVert = `
attribute vec4 aRoot;
attribute vec4 aRibbon;
attribute vec4 aGuides;
attribute vec4 aStyle;
attribute vec4 aClump;
attribute vec3 aNorm;

uniform sampler2D guideTex;
uniform vec3 row1, row2, row3;
uniform vec4 box, halfMotion;
uniform vec2 centre;
uniform float size, lift, spread, time, pixel, widthBoost, sway, useTex;

varying vec3 vTan;
varying vec3 vNorm;
varying vec3 vSide;
varying vec3 vView;
varying vec3 vPos;
varying vec4 vMeta;
varying vec4 vShade;

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 applyHalfTransform(vec3 p, float part) {
  if (part < .5) {
    vec2 c = p.xy - vec2(.50, .46);
    c = rot2(-halfMotion.z) * c;
    return vec3(c + vec2(.50, .46) + vec2(halfMotion.x, -spread), p.z);
  }
  vec2 c = p.xy - vec2(.58, 1.22);
  c = rot2(-halfMotion.w) * c;
  return vec3(c + vec2(.58, 1.22) + vec2(halfMotion.y, spread), p.z);
}

vec3 fetchGuideOffset(float gIdx, float segIdx) {
  if (segIdx < .5) return vec3(0.);
  float row = segIdx - 1.;
  float gx = (gIdx + .5) / ${GUIDE_TEX_W.toFixed(1)};
  vec3 hi = texture2D(guideTex, vec2(gx, (row + .5) / ${GUIDE_TEX_H.toFixed(1)})).rgb;
  vec3 lo = texture2D(guideTex, vec2(gx, (row + 8.5) / ${GUIDE_TEX_H.toFixed(1)})).rgb;
  vec3 norm01 = (hi * 65280. + lo * 255.) / 65535.;
  return (norm01 * 2. - 1.) * ${PACK_RANGE.toFixed(3)};
}

vec3 fallbackOffset(vec3 root, vec3 n, float u) {
  float gust = .80 + .28 * sin(time * .88) + .32 * sin(root.x * 3.1 - root.y * .95 - time * 2.25);
  vec3 dir = normalize(n * .64 + vec3(.30, .86, .08));
  return dir * (.168 * u) + vec3(.048 * gust, .014 * sin(time * 2.0 + root.x * 3.), .014 * cos(time * 1.7 + root.y * 3.)) * (u * u);
}

vec3 evalStrandPos(float segIdx, vec3 root, vec3 n, float lenRatio, float gA, float gB, float wB, float seed, vec3 clumpPull, float curlAmp, float strandClass) {
  float u = segIdx / ${SEGMENTS.toFixed(1)};
  vec3 simOff;
  if (useTex > .5) {
    vec3 oA = fetchGuideOffset(gA, segIdx);
    vec3 oB = fetchGuideOffset(gB, segIdx);
    simOff = mix(oA, oB, wB) * lenRatio;
  } else {
    simOff = fallbackOffset(root, n, u) * lenRatio;
  }

  // Tangent-projected clumping + silky outward plush loft arch (ZERO inward core clipping!)
  vec3 clumpDisp = clumpPull * pow(u, 1.35);
  vec3 plushLoft = n * (.016 * sin(u * 3.14159265) * (.70 + .50 * strandClass));

  // Fine silky per-strand wave + gentle gossamer tip breeze flutter
  float ph = seed * 31.4159 + u * 6.4;
  float tipWave = u * u;
  float breezeFlutter = sin(time * 3.9 + seed * 21.0 + root.x * 3.4 - u * 2.8);
  vec3 t1 = normalize(cross(n, abs(n.y) > .85 ? vec3(1., 0., 0.) : vec3(0., 1., 0.)));
  vec3 t2 = cross(n, t1);
  vec3 curl = (t1 * sin(ph) + t2 * cos(ph * 1.15 + 1.2)) * (curlAmp * tipWave);
  vec3 wispDrift = vec3(.0075, .0036 * breezeFlutter, .0042 * cos(time * 3.2 + seed * 15.)) * (u * tipWave) * (.35 + .95 * strandClass);

  return root - n * (.003 * (1. - u)) + simOff + clumpDisp + plushLoft + curl + wispDrift;
}

void main() {
  float part = aRoot.w;
  float u = aRibbon.x;
  float side = aRibbon.y;
  float baseHW = aRibbon.z;
  float lenRatio = aRibbon.w;
  float gA = aGuides.x, gB = aGuides.y, wB = aGuides.z, seed = aGuides.w;
  float curlAmp = aStyle.w;
  float strandClass = aClump.w;
  vec3 root = aRoot.xyz;
  vec3 n = normalize(aNorm);

  float segIdx = floor(u * ${SEGMENTS.toFixed(1)} + .5);
  vec3 pCur  = evalStrandPos(segIdx, root, n, lenRatio, gA, gB, wB, seed, aClump.xyz, curlAmp, strandClass);
  vec3 pPrev = evalStrandPos(max(0., segIdx - 1.), root, n, lenRatio, gA, gB, wB, seed, aClump.xyz, curlAmp, strandClass);
  vec3 pNext = evalStrandPos(min(${SEGMENTS.toFixed(1)}, segIdx + 1.), root, n, lenRatio, gA, gB, wB, seed, aClump.xyz, curlAmp, strandClass);

  vec3 wp = applyHalfTransform(pCur, part);
  vec3 wpPrev = applyHalfTransform(pPrev, part);
  vec3 wpNext = applyHalfTransform(pNext, part);
  vec3 T = normalize(wpNext - wpPrev + vec3(1e-5, 0., 0.));

  vec3 pivot = vec3(.56, .845 - lift, 0.);
  vec3 camPos = pivot - row3 * ${D_CAM.toFixed(1)};
  vec3 toCam = normalize(camPos - wp);

  vec3 sideVec = cross(T, toCam);
  float sLen = length(sideVec);
  sideVec = sLen > .001 ? sideVec / sLen : normalize(cross(T, row2));

  // Fine silky keratin taper: lush root -> smooth narrow silky filament -> needle tip!
  float taper = mix(1.0, .14, pow(u, .82)) * (1. - .08 * u * u);
  float headOnBoost = 1. + .28 * pow(abs(dot(T, toCam)), 2.4);
  float targetHW = baseHW * taper * widthBoost * headOnBoost;

  // Sub-pixel width clamping + analytic coverage compensation
  vec3 q0 = wp - pivot;
  float cz0 = dot(row3, q0);
  float persp0 = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + cz0);
  float pxWorld = pixel / max(persp0, .5);
  float minHW = pxWorld * 1.12;
  float renderHW = max(targetHW, minHW);
  float opacityAA = clamp(targetHW / renderHW, 0., 1.);

  vec3 finalP = wp + sideVec * (side * renderHW);
  vec3 q = finalP - pivot;
  float cz = dot(row3, q);
  float persp = ${D_CAM.toFixed(1)} / (${D_CAM.toFixed(1)} + cz);
  vec2 screen = centre + size * vec2(dot(row1, q), dot(row2, q)) * persp;
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  float ndcZ = cz * .25 + sway * 1e-6;
  gl_Position = vec4(clip.x, -clip.y, ndcZ, 1.);

  vec3 rotN = n;
  rotN.xy = rot2(part < .5 ? -halfMotion.z : -halfMotion.w) * rotN.xy;

  vTan = T;
  vNorm = normalize(rotN);
  vSide = sideVec;
  vView = toCam;
  vPos = finalP;
  vMeta = vec4(u, side, aStyle.x, aStyle.y);
  vShade = vec4(aStyle.z, strandClass, opacityAA, part);
}`;

// Pass 2 & Pass 3: Saturation-Preserving Marschner / Kajiya-Kay Dual-Lobe Fur Shader!
const strandFrag = `precision highp float;
uniform vec2 lightRot, pointer;
uniform float sway, pulse, time, passMode, recovery;

varying vec3 vTan;
varying vec3 vNorm;
varying vec3 vSide;
varying vec3 vView;
varying vec3 vPos;
varying vec4 vMeta;
varying vec4 vShade;

vec3 rotY(vec3 d) {
  return vec3(lightRot.x * d.x + lightRot.y * d.z, d.y, -lightRot.y * d.x + lightRot.x * d.z);
}

float strandSpec(vec3 T, vec3 V, vec3 L, float exponent) {
  vec3 H = normalize(L + V);
  float th = clamp(dot(T, H), -1., 1.);
  float sinTH = sqrt(max(0., 1. - th * th));
  return pow(sinTH, exponent);
}

// Saturation-preserving luminance-keyed filmic curve:
// Keeps blazing BRIGHT ORANGE electric tangerine (never pale peach/cream!)
// and keeps electric BRIGHT PURPLE rich royal-neon violet (never washed-out pastel lilac!).
vec3 toneDisplay(vec3 c) {
  c = max(c, 0.);
  float peak = max(c.r, max(c.g, c.b));
  float mappedPeak = peak / (1. + peak * .28);
  vec3 mapped = peak > 1e-4 ? c * (mappedPeak / peak) : vec3(0.);
  // Only extreme pinpoint glint highlights lift slightly for crisp silk sparkle
  if (peak > 1.85) {
    float spark = smoothstep(1.85, 3.6, peak) * .20;
    mapped = mix(mapped, vec3(mappedPeak), spark);
  }
  return pow(clamp(mapped, 0., 1.), vec3(1. / 2.2));
}

void main() {
  float u = vMeta.x;
  float v = vMeta.y;
  float streak = vMeta.z;
  float toneVar = vMeta.w;
  float clumpAO = vShade.x;
  float strandClass = vShade.y;
  float opacityAA = vShade.z;
  float part = vShade.w;

  float edgeDist = 1. - abs(v);
  float edgeCov = smoothstep(0., .40, edgeDist);
  float tipFade = 1. - smoothstep(.82, 1.0, u);
  float cov = edgeCov * mix(.42, 1., tipFade) * opacityAA;

  const float CORE_CUT = .52;
  if (passMode < .5) {
    if (cov < CORE_CUT) discard;
  } else {
    if (cov >= CORE_CUT || cov < .025) discard;
  }

  vec3 T = normalize(vTan);
  vec3 V = normalize(vView);
  vec3 Nm = normalize(vNorm);
  vec3 Nstrand = normalize(vSide * (v * .80) + V * sqrt(max(.08, 1. - v * v * .64)));
  vec3 Nlight = normalize(mix(Nm, Nstrand, .32));

  // =========================================================================
  // BLAZING BRIGHT ORANGE FUR + ELECTRIC BRIGHT PURPLE STREAKS
  // =========================================================================
  float varShift = toneVar - .5;
  // Vivid Electric Tangerine / Bright Mandarin Orange (hyper-saturated linear RGB!)
  vec3 orRoot = vec3(.48, .042, .000);
  vec3 orMid  = vec3(1.08 + .08 * varShift, .148 + .032 * varShift, .001);
  vec3 orTip  = vec3(1.18, .245 + .045 * varShift, .004);
  vec3 orangeCol = u < .42
    ? mix(orRoot, orMid, smoothstep(0., .42, u))
    : mix(orMid,  orTip, smoothstep(.42, 1., u));

  // Vivid Electric Bright Purple / Ultraviolet-Violet Streaks!
  vec3 puRoot = vec3(.12, .004, .42);
  vec3 puMid  = vec3(.42 + .08 * varShift, .016 + .008 * varShift, 1.06 + .08 * varShift);
  vec3 puTip  = vec3(.60 + .08 * varShift, .055 + .018 * varShift, 1.18);
  vec3 purpleCol = u < .42
    ? mix(puRoot, puMid, smoothstep(0., .42, u))
    : mix(puMid,  puTip, smoothstep(.42, 1., u));

  vec3 albedo = mix(orangeCol, purpleCol, streak);
  albedo *= (.94 + .14 * strandClass);

  // =========================================================================
  // DEEP PLUSH SELF-SHADOWING & CLUMP RELIEF AO
  // =========================================================================
  float cutGap = abs((vPos.y + .27875 * vPos.x - .98) * .96327);
  float kerfAO = part > .5 ? (.56 + .44 * smoothstep(.04, .24, cutGap)) : 1.;
  float rootAO = mix(.34, 1.02, pow(u, .58));
  float totalAO = rootAO * mix(.76, 1.04, clumpAO) * kerfAO;

  // =========================================================================
  // GALLERY STUDIO LIGHTING (Synchronized with scroll-wheel lightAngle!)
  // =========================================================================
  vec3 Lkey  = rotY(normalize(vec3(-.66, -.54, .58)));
  vec3 Lfill = rotY(normalize(vec3(.76, .12, .50)));
  vec3 Lrim  = rotY(normalize(vec3(.52, -.38, -.76)));
  vec3 Ltop  = rotY(normalize(vec3(-.15, -.92, .34)));

  float kkKey  = sqrt(max(0., 1. - pow(dot(T, Lkey), 2.)));
  float kkFill = sqrt(max(0., 1. - pow(dot(T, Lfill), 2.)));
  float wrapKey  = clamp((dot(Nlight, Lkey) + .54) / 1.54, 0., 1.);
  float wrapFill = clamp((dot(Nlight, Lfill) + .62) / 1.62, 0., 1.);
  float wrapTop  = clamp((dot(Nlight, Ltop) + .50) / 1.50, 0., 1.);

  // Pixar Multiple-Scattering Deep Shadow Richness (glows fiery orange-red & deep royal purple!)
  vec3 multiScatter = albedo * albedo * 1.48 + albedo * .14;
  float directMask = clamp(wrapKey * (.58 + .42 * kkKey), 0., 1.);
  vec3 keyDiff  = mix(multiScatter, albedo, smoothstep(.08, .76, directMask)) * vec3(1.08, 1.05, 1.00) * (.28 + .94 * directMask);
  vec3 fillDiff = albedo * vec3(.48, .50, .58) * (wrapFill * (.55 + .45 * kkFill)) * .36;
  vec3 topDiff  = albedo * vec3(.92, .91, .88) * wrapTop * .16;
  vec3 floorBounce = albedo * vec3(.90, .84, .74) * (.14 + .22 * clamp(Nlight.y, 0., 1.)) * (.45 + .55 * u);

  // =========================================================================
  // MARSCHNER DUAL-LOBE ANISOTROPIC SILK SPECULAR (Restrained R + Vivid TRT!)
  // =========================================================================
  vec3 T_R   = normalize(T - Nlight * (.11 + .04 * varShift));
  vec3 T_TRT = normalize(T + Nlight * (.16 + .05 * varShift));

  float specGate = smoothstep(.10, .52, u) * (.38 + .62 * wrapKey);
  // Crisp narrow silk glint (R) kept subtle so it NEVER bleaches orange/purple into white!
  float specR   = strandSpec(T_R,   V, Lkey, 110.) * .26 + strandSpec(T_R,   V, Ltop, 96.) * .14;
  // Lush broad pigmented internal silk sheen (TRT) carries blazing tangerine & electric violet fire!
  float specTRT = strandSpec(T_TRT, V, Lkey, 24.) * .68 + strandSpec(T_TRT, V, Lfill, 22.) * .24;

  float pMag = dot(pointer, pointer);
  float specCursor = 0.;
  if (pMag > .002) {
    vec3 Lcur = normalize(vec3(pointer.x * 1.35, pointer.y * .95 - .22, 1.05));
    float pFade = smoothstep(.002, .09, pMag);
    specCursor = strandSpec(T_R, V, Lcur, 78.) * pFade * (.34 + .26 * pulse);
  }

  // Lightly warm/tinted cuticle glint preserves rich chroma on bright fur!
  vec3 rTint   = mix(vec3(1.12, .74, .46), vec3(.92, .72, 1.15), streak);
  vec3 R_col   = rTint * (specR + specCursor) * specGate;
  vec3 trtTint = mix(vec3(1.32, .26, .005), vec3(.66, .08, 1.38), streak);
  vec3 TRT_col = trtTint * specTRT * (.36 + .64 * smoothstep(.16, .84, u)) * (.50 + .50 * wrapKey);

  // =========================================================================
  // BACKLIT SUNLIT TRANSLUCENT RIM HALO (TT Lobe — Glowing Orange & Purple Tips!)
  // =========================================================================
  float grazing = pow(1. - max(abs(dot(Nm, V)), 0.), 2.4);
  float forwardKey = pow(max(dot(-V, Lkey), 0.), 2.6);
  float forwardRim = pow(max(dot(-V, Lrim), 0.), 2.0);
  float tipTrans = smoothstep(.24, .96, u) * (.55 + .55 * strandClass);
  vec3 ttTint = mix(vec3(1.42, .32, .006), vec3(.74, .10, 1.44), streak);
  vec3 rimGlow = ttTint * (grazing * (.44 + .42 * forwardRim) + forwardKey * .28) * tipTrans * (.82 + .18 * sin(sway * 1.2 + u * 2.));

  vec3 recBoost = recovery < .999 ? ttTint * (1. - recovery) * .28 * u : vec3(0.);

  // Cylindrical fiber cross-section shading gives tactile razor-crisp individual hairs!
  float fiberRound = .84 + .18 * sqrt(max(0., 1. - v * v));
  vec3 cLin = ((keyDiff + fillDiff + topDiff + floorBounce) * totalAO + R_col + TRT_col + rimGlow + recBoost) * fiberRound;

  vec3 srgb = toneDisplay(cLin);
  float dith = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5;
  srgb = clamp(srgb + dith / 255., 0., 1.);

  if (passMode < .5) {
    gl_FragColor = vec4(srgb, 1.);
  } else {
    float a = clamp(cov / CORE_CUT, 0., 1.);
    gl_FragColor = vec4(srgb * a, a);
  }
}`;

// ---------------------------------------------------------------------------
// 8. WebGL Helpers & Variant Entry Point
// ---------------------------------------------------------------------------
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

export function initFurGlass(gl, { software, groundMap }) {
  const groundProg = program(gl, groundVert, groundFrag);
  const shellProg = program(gl, shellVert, shellFrag);
  const strandProg = program(gl, strandVert, strandFrag);
  if (!groundProg || !shellProg || !strandProg) return null;

  const hasVertexTex = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
  const rng = makeRng(0xB3441E89);

  const coreMesh = buildCoreMesh(12);
  const physics = createHairPhysics(coreMesh, rng);
  const strands = buildStrandBatches(gl, coreMesh, physics, rng);

  const quadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  const coreVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coreVbo);
  gl.bufferData(gl.ARRAY_BUFFER, coreMesh.vertices, gl.STATIC_DRAW);
  const coreIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, coreIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, coreMesh.indices, gl.STATIC_DRAW);

  const groundTexture = make2DTexture(gl, groundMap);
  const guideTexture = makeGuideTexture(gl, physics.texData);

  const makeUniforms = prog => {
    const map = {};
    return name => (name in map ? map[name] : (map[name] = gl.getUniformLocation(prog, name)));
  };
  const ug = makeUniforms(groundProg);
  const us = makeUniforms(shellProg);
  const uh = makeUniforms(strandProg);

  const gLocP = gl.getAttribLocation(groundProg, 'p');

  const sLocPos = gl.getAttribLocation(shellProg, 'aPosPart');
  const sLocNorm = gl.getAttribLocation(shellProg, 'aNormSt');
  const sLocFlow = gl.getAttribLocation(shellProg, 'aFlowLen');

  const hLocRoot = gl.getAttribLocation(strandProg, 'aRoot');
  const hLocRib = gl.getAttribLocation(strandProg, 'aRibbon');
  const hLocGui = gl.getAttribLocation(strandProg, 'aGuides');
  const hLocSty = gl.getAttribLocation(strandProg, 'aStyle');
  const hLocClm = gl.getAttribLocation(strandProg, 'aClump');
  const hLocNrm = gl.getAttribLocation(strandProg, 'aNorm');

  const maxAttribsToReset = 7;
  const disableAllAttribs = () => {
    for (let i = 0; i < maxAttribsToReset; i++) gl.disableVertexAttribArray(i);
  };

  gl.useProgram(groundProg);
  gl.uniform1i(ug('groundMap'), 1);
  gl.useProgram(strandProg);
  gl.uniform1i(uh('guideTex'), 2);

  function bindStrandBatch(vbo) {
    const st = strands.strideBytes;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, strands.ibo);
    gl.enableVertexAttribArray(hLocRoot);
    gl.vertexAttribPointer(hLocRoot, 4, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(hLocRib);
    gl.vertexAttribPointer(hLocRib, 4, gl.FLOAT, false, st, 16);
    gl.enableVertexAttribArray(hLocGui);
    gl.vertexAttribPointer(hLocGui, 4, gl.FLOAT, false, st, 32);
    gl.enableVertexAttribArray(hLocSty);
    gl.vertexAttribPointer(hLocSty, 4, gl.FLOAT, false, st, 48);
    gl.enableVertexAttribArray(hLocClm);
    gl.vertexAttribPointer(hLocClm, 4, gl.FLOAT, false, st, 64);
    gl.enableVertexAttribArray(hLocNrm);
    gl.vertexAttribPointer(hLocNrm, 3, gl.FLOAT, false, st, 80);
  }

  return {
    render({ rows, centre, size, lift, shift, glint, sway, ground, recovery = 1, pulse = 0,
      lightAngle = 0, time = 0, quality = 2,
      pointer = [0, 0], shocks = [[0, 0, 9, 0], [0, 0, 9, 0]],
      halfMotion = [0, 0, 0, 0] }, { box, ratio }) {
      physics.update({ time, sway, lift, pointer, shocks, pulse, halfMotion, rows });

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, groundTexture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, guideTexture);
      if (hasVertexTex) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GUIDE_TEX_W, GUIDE_TEX_H, gl.RGBA, gl.UNSIGNED_BYTE, physics.texData);
      }

      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const bx = box[0], by = box[1], bw = box[2], bh = box[3];
      const cx = centre[0], cy = centre[1];
      const gx = ground[0], gy = ground[1], gw = ground[2], gh = ground[3];
      const px = pointer[0], py = pointer[1];
      const spread = Math.abs(shift[1]);
      const rot = lightAngle + glint * 0.35;
      const rotC = Math.cos(rot), rotS = Math.sin(rot);
      const effQuality = software ? 0 : quality;

      // Pass 0: Soft Plush Gallery Cast Shadow
      disableAllAttribs();
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(groundProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.enableVertexAttribArray(gLocP);
      gl.vertexAttribPointer(gLocP, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(ug('box'), bx, by, bw, bh);
      gl.uniform4f(ug('shadow'), gx, gy, gw, gh);
      gl.uniform2f(ug('pointer'), px, py);
      gl.uniform1f(ug('sway'), sway);
      gl.uniform1f(ug('lift'), lift);
      gl.uniform1f(ug('pulse'), pulse);
      gl.uniform1f(ug('lightAngle'), lightAngle);
      gl.uniform1f(ug('time'), time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 1: Tight Velvety Root Skin + Deep Sub-Surface Underfur Cushion (<= 0.018 max)
      disableAllAttribs();
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      gl.useProgram(shellProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, coreVbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, coreIbo);
      const coreStride = coreMesh.stride * 4;
      gl.enableVertexAttribArray(sLocPos);
      gl.vertexAttribPointer(sLocPos, 4, gl.FLOAT, false, coreStride, 0);
      gl.enableVertexAttribArray(sLocNorm);
      gl.vertexAttribPointer(sLocNorm, 4, gl.FLOAT, false, coreStride, 16);
      gl.enableVertexAttribArray(sLocFlow);
      gl.vertexAttribPointer(sLocFlow, 4, gl.FLOAT, false, coreStride, 32);

      gl.uniform3fv(us('row1'), rows[0]);
      gl.uniform3fv(us('row2'), rows[1]);
      gl.uniform3fv(us('row3'), rows[2]);
      gl.uniform4f(us('box'), bx, by, bw, bh);
      gl.uniform4f(us('halfMotion'), halfMotion[0], halfMotion[1], halfMotion[2], halfMotion[3]);
      gl.uniform2f(us('centre'), cx, cy);
      gl.uniform2f(us('lightRot'), rotC, rotS);
      gl.uniform2f(us('pointer'), px, py);
      gl.uniform1f(us('size'), size);
      gl.uniform1f(us('lift'), lift);
      gl.uniform1f(us('spread'), spread);
      gl.uniform1f(us('time'), time);
      gl.uniform1f(us('sway'), sway);
      gl.uniform1f(us('pulse'), pulse);

      const numShells = effQuality >= 1 ? 4 : 3;
      for (let s = 0; s <= numShells; s++) {
        gl.uniform1f(us('shellFrac'), s / numShells);
        gl.drawElements(gl.TRIANGLES, coreMesh.indices.length, gl.UNSIGNED_SHORT, 0);
      }

      // Pass 2 & Pass 3: 27,600 Fine 6-Segment Simulated Tapered Hair Strand Ribbons
      disableAllAttribs();
      gl.useProgram(strandProg);
      gl.uniform3fv(uh('row1'), rows[0]);
      gl.uniform3fv(uh('row2'), rows[1]);
      gl.uniform3fv(uh('row3'), rows[2]);
      gl.uniform4f(uh('box'), bx, by, bw, bh);
      gl.uniform4f(uh('halfMotion'), halfMotion[0], halfMotion[1], halfMotion[2], halfMotion[3]);
      gl.uniform2f(uh('centre'), cx, cy);
      gl.uniform2f(uh('lightRot'), rotC, rotS);
      gl.uniform2f(uh('pointer'), px, py);
      gl.uniform1f(uh('size'), size);
      gl.uniform1f(uh('lift'), lift);
      gl.uniform1f(uh('spread'), spread);
      gl.uniform1f(uh('time'), time);
      gl.uniform1f(uh('pixel'), 1 / (size * ratio));
      gl.uniform1f(uh('sway'), sway);
      gl.uniform1f(uh('pulse'), pulse);
      gl.uniform1f(uh('recovery'), recovery);
      gl.uniform1f(uh('useTex'), hasVertexTex ? 1 : 0);

      // 6 batches = 27,600 ultra-fine strands (hw), 4 = 18,400 (mid), 3 = 13,800 (sw/low-spec)
      const activeBatches = effQuality >= 2 ? 6 : effQuality === 1 ? 4 : 3;
      const widthBoost = effQuality >= 2 ? 1.0 : effQuality === 1 ? 1.15 : 1.28;
      gl.uniform1f(uh('widthBoost'), widthBoost);

      // Pass 2: Solid strand cores (Depth Write ON -> exact 3D occlusion!)
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(uh('passMode'), 0);
      for (let b = 0; b < activeBatches; b++) {
        bindStrandBatch(strands.batches[b].vbo);
        gl.drawElements(gl.TRIANGLES, strands.batches[b].indexCount, gl.UNSIGNED_SHORT, 0);
      }

      // Pass 3: Silky anti-aliased edges & backlit feathery tips (Depth Write OFF, Premul Blend ON!)
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(uh('passMode'), 1);
      for (let b = 0; b < activeBatches; b++) {
        bindStrandBatch(strands.batches[b].vbo);
        gl.drawElements(gl.TRIANGLES, strands.batches[b].indexCount, gl.UNSIGNED_SHORT, 0);
      }

      gl.depthMask(true);
      for (let i = 1; i < maxAttribsToReset; i++) gl.disableVertexAttribArray(i);
      return true;
    },
  };
}
