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

export function createGlass(stage, { outlines, flute, filament, back, front, reededGroundMap, furGroundMap, halo, haloPad = 0 }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'glass';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true, preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  const software = /swiftshader|llvmpipe|software/i.test(rendererName);

  const starship = initStarshipGlass(gl, { software, outlines, filament });
  const reeded = outlines ? initReededGlass(gl, {
    software, outlines, flute, filament, back, front, groundMap: reededGroundMap, halo, haloPad,
  }) : null;
  const fur = initFurGlass(gl, { software, groundMap: furGroundMap || reededGroundMap });
  const louver = outlines ? initLouverGlass(gl, { software, outlines, filament }) : null;
  const voxel = outlines ? initVoxelGlass(gl, { software, outlines, filament }) : null;
  if (!starship && !reeded && !fur && !louver && !voxel) return null;
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
    get box() { return box; },
    resize(pixelRatio, reach) {
      baseRatio = software ? Math.min(.85, pixelRatio) : pixelRatio;
      const [left, top, right, bottom] = reach;
      box = [Math.floor(left) - 4, Math.floor(top) - 4, Math.ceil(right - left) + 8, Math.ceil(bottom - top) + 8];
      Object.assign(canvas.style, {
        inset: 'auto', left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
      });
      applyBufferSize();
    },
    // The starship's fleet warps in and its lights reboot on its next showing.
    arrive() {
      starship?.arrive();
    },
    render(params) {
      const { size, detail = 1, variant = 0 } = params;
      if (gl.isContextLost() || !Number.isFinite(size) || size <= 0) return false;
      if (Math.abs(detail - activeScale) > .01) {
        activeScale = detail;
        applyBufferSize();
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      const frame = { box, ratio };
      if (variant === 1 && reeded) return reeded.render(params, frame);
      if (variant === 2 && fur) return fur.render(params, frame);
      if (variant === 3 && louver) return louver.render(params, frame);
      if (variant === 4 && voxel) return voxel.render(params, frame);
      if (starship) return starship.render(params, frame);
      return reeded ? reeded.render(params, frame) : false;
    },
  };
}
