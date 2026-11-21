// The sculpture layer: one WebGL canvas that carries whichever B is on show.
//
// Five works share this context so a swap during the black glitch costs
// nothing:
//   0 = Starship B: a kitbashed deep-space megastructure and its fleet
//       (`glass-scifi.js`)
//   1 = Classic reeded Fe2+ float-glass B (`glass-reeded.js`)
//   2 = Plush fur B, copper-orange with violet streaks (`glass-fur.js`)
//   3 = Architectural Terrazzo & Emerald Louver B (`glass-louver.js`)
//   4 = Quantum Glass Voxel Core B (`glass-voxel.js`)
import { initReededGlass } from './glass-reeded.js';
import { initFurGlass } from './glass-fur.js';
import { initStarshipGlass } from './glass-scifi.js';
import { initLouverGlass } from './glass-louver.js';
import { initVoxelGlass } from './glass-voxel.js';

export function createGlass(stage, {
  outlines, flute, filament, back, front,
  getReededGround, getFurGround, getHalo,
  reededGroundMap, furGroundMap, halo, haloPad = 0,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'glass';
  canvas.setAttribute('aria-hidden', 'true');
  // Probe hardware tier cleanly before choosing AA and buffer resolution.
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const lowMem = (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const wantAA = (!mobile && !lowMem) || (devicePixelRatio || 1) < 1.5;
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: wantAA, depth: true, preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  const software = /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render/i.test(rendererName);
  const weakGpu = /intel.*(?:hd|uhd|iris|gma)|mali-|adreno.*(?:[2345]\d\d|6[012]\d)|powervr|apple a[789]|apple a1[01]|geforce (?:gt |mx|[2-7]\d\d|8\d\d|9[0-4]\d)|radeon.*(?:vega [368]|r[2-7]|hd [4-8])/i.test(rendererName);
  const lowSpec = software || mobile || weakGpu || Boolean(lowMem);

  // Lazy per-variant initialization: only build & compile the active phase on first use,
  // slashing startup latency (~4x faster first frame) and peak VRAM on low-spec hardware.
  const instances = [undefined, undefined, undefined, undefined, undefined];
  let pendingArrive = false;
  let lastInitVariant = -1;

  function ensure(v) {
    if (instances[v] !== undefined) return instances[v];
    lastInitVariant = v;
    let inst = null;
    if (v === 0) {
      inst = initStarshipGlass(gl, { software, lowSpec, outlines, filament });
      if (inst && pendingArrive) { inst.arrive(); pendingArrive = false; }
    } else if (v === 1) {
      inst = outlines ? initReededGlass(gl, {
        software, lowSpec, outlines, flute, filament, back, front,
        groundMap: reededGroundMap || getReededGround?.(),
        halo: halo || getHalo?.(), haloPad,
      }) : null;
    } else if (v === 2) {
      inst = initFurGlass(gl, {
        software, lowSpec,
        groundMap: furGroundMap || getFurGround?.() || reededGroundMap || getReededGround?.(),
      });
    } else if (v === 3) {
      inst = outlines ? initLouverGlass(gl, { software, lowSpec, outlines, filament }) : null;
    } else if (v === 4) {
      inst = outlines ? initVoxelGlass(gl, { software, lowSpec, outlines, filament }) : null;
    }
    instances[v] = inst;
    return inst;
  }

  stage.after(canvas);

  let box = [0, 0, 1, 1], baseRatio = 1, ratio = 1, activeScale = 1;
  function applyBufferSize() {
    ratio = Math.max(.5, baseRatio * activeScale);
    const cw = Math.max(1, Math.round(box[2] * ratio));
    const ch = Math.max(1, Math.round(box[3] * ratio));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  }

  return {
    canvas,
    software,
    lowSpec,
    get box() { return box; },
    consumeInitFlag() {
      const hit = lastInitVariant >= 0;
      lastInitVariant = -1;
      return hit;
    },
    resize(pixelRatio, reach) {
      baseRatio = software ? Math.min(.85, pixelRatio) : lowSpec ? Math.min(1.5, pixelRatio) : pixelRatio;
      const [left, top, right, bottom] = reach;
      box = [Math.floor(left) - 4, Math.floor(top) - 4, Math.ceil(right - left) + 8, Math.ceil(bottom - top) + 8];
      Object.assign(canvas.style, {
        inset: 'auto', left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
      });
      applyBufferSize();
    },
    // The starship's fleet warps in and its lights reboot on its next showing.
    arrive() {
      if (instances[0]) instances[0].arrive();
      else pendingArrive = true;
    },
    render(params) {
      const { size, detail = 1, variant = 0 } = params;
      if (gl.isContextLost() || !Number.isFinite(size) || size <= 0) return false;
      if (Math.abs(detail - activeScale) > .01) {
        activeScale = detail;
        applyBufferSize();
      }
      // Reset shared baseline GL state so variants never leak masks, culling, or winding.
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.depthFunc(gl.LEQUAL);
      gl.clearDepth(1);
      gl.disable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      const frame = { box, ratio };
      const target = ensure(variant) || ensure(0) || ensure(1);
      return target ? target.render(params, frame) : false;
    },
  };
}
