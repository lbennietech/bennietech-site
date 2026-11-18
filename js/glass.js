// The calm glass B, drawn on the GPU as a real extruded block.
//
// Each half of the B is its outline extruded through the block's depth.
// The sides carry the green of looking along thick glass, and the polished
// front and back edges catch the light. Each front face is reeded: every reed
// shows a compressed strip of the scene behind the glass, offset by the B's
// sway, with grooves at its edges and a highlight that crosses it. A lime
// filament lights the kerf between the halves.
//
// It draws to its own layer above the stage canvas, so nothing is copied back
// through a 2D canvas, which browsers often rasterise on the CPU.
import { program } from './gl/gl.js';

const vertex = `
attribute vec3 position;
attribute float across;
uniform vec3 row1, row2, row3;
uniform vec4 box;
uniform vec2 centre;
uniform float size, lift, shift, ground;
uniform vec4 shadow;
varying vec3 plate;
varying float side;
void main() {
  plate = position;
  side = across;
  if (ground > .5) {
    // The shadow card lies flat on the stage, in its own unit square.
    vec2 clip = (shadow.xy + position.xy * shadow.zw - box.xy) / box.zw * 2. - 1.;
    gl_Position = vec4(clip.x, -clip.y, .99, 1.);
    return;
  }
  // The same orthographic turn as the stage canvas, in CSS pixels.
  vec3 q = vec3(position.x - .56, position.y - .845 + lift + shift, position.z);
  vec2 screen = centre + size * vec2(dot(row1, q), dot(row2, q));
  vec2 clip = (screen - box.xy) / box.zw * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, dot(row3, q) * .25, 1.);
}`;

const fragment = `precision highp float;
uniform float kind, part, sway, glint, flute, front, back, pixel, focus;
uniform vec2 tile, pad;
uniform sampler2D behind, sideRamp, arrisRamp;
varying vec3 plate;
varying float side;

float halfRound(vec2 p, float cx, float cy, float r) {
  return length(vec2(max(p.x - cx, 0.), p.y - cy)) - r;
}
float contour(vec2 p) {
  return max(-p.x, min(halfRound(p, .57, .43, .43), halfRound(p, .71, 1.2, .49)));
}
float ramp(float x, float a, float b) { return clamp((x - a) / (b - a), 0., 1.); }
vec3 arris(vec2 p) { return texture2D(arrisRamp, vec2(clamp((p.x + p.y) * .5, 0., 1.), .5)).rgb; }

vec3 reeds(vec2 p) {
  // Each reed compresses a wider strip of the scene behind it.
  float k = floor(p.x / flute), u = fract(p.x / flute);
  float centre = k * flute + flute * .5 + sway * .62 + .011 * sin(k * 2.31 + part);
  vec2 at = (vec2(centre + (u - .5) * flute * 2.4, p.y) + pad) / tile;
  vec3 colour = texture2D(behind, vec2(at.x, 1. - at.y)).rgb;
  // Grooves at the reed's edges and a highlight that crosses it with the sway.
  float crest = clamp(.5 + sway * 2.1 + (k - 13.5) * .009, .16, .84);
  float groove = .24 * (1. - ramp(u, 0., .1)) + .17 * ramp(u, .9, 1.);
  float shine = .66 * (u < crest ? ramp(u, crest - .1, crest) : 1. - ramp(u, crest, crest + .06));
  colour = mix(colour, vec3(34., 46., 34.) / 255., groove);
  colour = mix(colour, vec3(1., 1., 248. / 255.), shine);
  // A broad window reflection rides over the reeds.
  vec2 a = vec2(-.3 + sway, .1), b = vec2(1.3 + sway, .9);
  float t = dot(p - a, b - a) / dot(b - a, b - a);
  float sheen = t < .36 ? .24 * ramp(t, .2, .36) : (t < .44 ? mix(.24, .05, ramp(t, .36, .44)) : .05 * (1. - ramp(t, .44, .52)));
  return mix(colour, vec3(1., 1., 252. / 255.), sheen);
}

void main() {
  vec2 p = plate.xy;
  if (kind < .5) {
    // The sides look along the glass, so they carry its green.
    vec2 a = vec2(-.12 + glint, .05), d = vec2(1.52, .48);
    vec3 colour = texture2D(sideRamp, vec2(clamp(dot(p - a, d) / dot(d, d), 0., 1.), .5)).rgb;
    colour = mix(colour, arris(p), 1. - ramp(front - plate.z, .002, .007));
    colour = mix(colour, vec3(232., 240., 220.) / 255., .7 * (1. - ramp(plate.z - back, .003, .009)));
    gl_FragColor = vec4(colour, 1.);
  } else if (kind < 1.5) {
    // The front face, its polished edge picked out in light.
    float line = (p.y + .27875 * p.x) * .9633;
    float inside = -max(contour(p), part < .5 ? line - .9125 * .9633 : 1.0475 * .9633 - line);
    float edge = 1. - smoothstep(.003 - pixel, .003 + pixel, inside);
    gl_FragColor = vec4(mix(reeds(p), arris(p), edge), 1.);
  } else if (kind < 2.5) {
    gl_FragColor = vec4(180., 220., 60., 255.) / 255.;
  } else if (kind > 3.5) {
    // A soft shadow, and light focused through the block tinted by the filament.
    float r = length(p);
    float shade = r < .5 ? mix(.15, .07, r / .5) : .07 * (1. - ramp(r, .5, 1.));
    vec3 dark = mix(vec3(44., 52., 40.), vec3(52., 58., 46.), ramp(r, 0., 1.)) / 255.;
    float c = length(p - vec2(focus, -.12)) / .42;
    float light = c < .35 ? mix(.7, .28, c / .35) : .28 * (1. - ramp(c, .35, 1.));
    vec3 tint = mix(vec3(236., 250., 176.), vec3(214., 238., 140.), ramp(c, 0., .35)) / 255.;
    gl_FragColor = vec4(tint * light + dark * shade * (1. - light), light + shade * (1. - light));
  } else {
    // The filament's glow, with a near-white core.
    float d = abs(side);
    float glow = (.07 + .16 * (1. - smoothstep(.4, .6, d))) * (1. - smoothstep(.85, 1., d));
    float core = 1. - smoothstep(.08, .14, d);
    float alpha = max(glow, core);
    vec3 colour = mix(vec3(176., 221., 52.) / 255., vec3(246., 255., 214.) / 255., core);
    gl_FragColor = vec4(colour * alpha, alpha);
  }
}`;

function rampTexture(gl, stops) {
  const strip = document.createElement('canvas');
  strip.width = 256; strip.height = 1;
  const g = strip.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 256, 0);
  stops.forEach(([at, colour]) => gradient.addColorStop(at, colour));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 1);
  return texture(gl, strip);
}
function texture(gl, source) {
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

// Both halves are convex, so a fan from the centroid fills each face.
function prism(points, back, front) {
  const data = [];
  const put = (x, y, z, across = 0) => data.push(x, y, z, across);
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const face = [], sides = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    face.push([cx, cy, front], [a[0], a[1], front], [b[0], b[1], front]);
    sides.push([a[0], a[1], back], [b[0], b[1], back], [b[0], b[1], front],
      [a[0], a[1], back], [b[0], b[1], front], [a[0], a[1], front]);
  });
  sides.forEach(v => put(...v));
  const sideCount = sides.length;
  face.forEach(v => put(...v));
  return { data, sideCount, faceCount: face.length };
}

// A thin bar along the filament, and a flat glow card in front of it.
function filamentBars([[x0, y0], [x1, y1]], near, far) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / length, ny = (x1 - x0) / length;
  const corner = (x, y, s, z) => [x + nx * s, y + ny * s, z];
  const box = [];
  const quad = (a, b, c, d) => box.push(a, b, c, a, c, d);
  for (const s of [-.006, .006]) quad(corner(x0, y0, s, far), corner(x1, y1, s, far), corner(x1, y1, s, near), corner(x0, y0, s, near));
  for (const z of [far, near]) quad(corner(x0, y0, -.006, z), corner(x1, y1, -.006, z), corner(x1, y1, .006, z), corner(x0, y0, .006, z));
  const data = [];
  box.forEach(v => data.push(...v, 0));
  const ux = (x1 - x0) / length * .03, uy = (y1 - y0) / length * .03;
  const card = [];
  const at = (x, y, s) => [x + nx * .03 * s, y + ny * .03 * s, near + .001, s];
  const a = at(x0 - ux, y0 - uy, -1), b = at(x1 + ux, y1 + uy, -1), c = at(x1 + ux, y1 + uy, 1), d = at(x0 - ux, y0 - uy, 1);
  [a, b, c, a, c, d].forEach(v => card.push(...v));
  return { data: data.concat(card), barCount: box.length, glowCount: 6 };
}

export function createGlass(stage, { outlines, tiles, scale, pad, flute, sideStops, arrisStops, filament, back, front }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'glass';
  canvas.setAttribute('aria-hidden', 'true');
  // Kept so the dot-matrix field can hold the calm frame when a glitch begins.
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true, preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  const prog = program(gl, vertex, fragment);
  if (!prog) return null;
  stage.after(canvas);
  gl.useProgram(prog);

  const halves = outlines.map(points => prism(points, back, front));
  const bars = filamentBars(filament, .1615, -.1445);
  const card = [-1, -1, 0, 0, 1, -1, 0, 0, 1, 1, 0, 0, -1, -1, 0, 0, 1, 1, 0, 0, -1, 1, 0, 0];
  const all = [...halves.flatMap(h => h.data), ...bars.data, ...card];
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(prog, 'position');
  const across = gl.getAttribLocation(prog, 'across');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(across);
  gl.vertexAttribPointer(across, 1, gl.FLOAT, false, 16, 12);

  const uniform = {};
  const u = name => uniform[name] ??= gl.getUniformLocation(prog, name);
  const behind = tiles.map(tile => texture(gl, tile));
  const sideRamp = rampTexture(gl, sideStops), arrisRamp = rampTexture(gl, arrisStops);
  gl.uniform2f(u('tile'), tiles[0].width / scale, tiles[0].height / scale);
  gl.uniform2f(u('pad'), pad[0], pad[1]);
  gl.uniform1f(u('flute'), flute);
  gl.uniform1f(u('front'), front);
  gl.uniform1f(u('back'), back);
  [['behind', 0], ['sideRamp', 1], ['arrisRamp', 2]].forEach(([name, unit]) => gl.uniform1i(u(name), unit));
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sideRamp);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, arrisRamp);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let box = [0, 0, 1, 1], ratio = 1;
  return {
    canvas,
    get box() { return box; },
    // The layer covers every place the B can reach as it sways and follows
    // the pointer, measured once per resize.
    resize(w, h, pixelRatio, size, reach) {
      ratio = pixelRatio;
      const [left, top, right, bottom] = reach;
      box = [Math.floor(left) - 4, Math.floor(top) - 4, Math.ceil(right - left) + 8, Math.ceil(bottom - top) + 8];
      Object.assign(canvas.style, {
        inset: 'auto', left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
      });
      canvas.width = Math.max(1, Math.round(box[2] * ratio));
      canvas.height = Math.max(1, Math.round(box[3] * ratio));
    },
    render({ rows, centre, size, lift, shift, glint, sway, ground, focus }) {
      if (gl.isContextLost()) return false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      // The glow pass leaves depth writes off, which would also mask the clear.
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(u('row1'), rows[0]);
      gl.uniform3fv(u('row2'), rows[1]);
      gl.uniform3fv(u('row3'), rows[2]);
      gl.uniform4f(u('box'), ...box);
      gl.uniform2f(u('centre'), ...centre);
      gl.uniform1f(u('size'), size);
      gl.uniform1f(u('lift'), lift);
      gl.uniform1f(u('glint'), glint);
      gl.uniform1f(u('sway'), sway);
      gl.uniform1f(u('pixel'), 1 / (size * ratio));

      // The ground goes down first, blended and outside the depth test.
      const groundFirst = halves.reduce((n, half) => n + half.sideCount + half.faceCount, 0) + bars.barCount + bars.glowCount;
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.uniform1f(u('ground'), 1);
      gl.uniform4f(u('shadow'), ...ground);
      gl.uniform1f(u('focus'), focus);
      gl.uniform1f(u('kind'), 4);
      gl.drawArrays(gl.TRIANGLES, groundFirst, 6);
      gl.uniform1f(u('ground'), 0);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      let first = 0;
      halves.forEach((half, part) => {
        gl.uniform1f(u('part'), part);
        gl.uniform1f(u('shift'), shift[part]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, behind[part]);
        gl.uniform1f(u('kind'), 0);
        gl.drawArrays(gl.TRIANGLES, first, half.sideCount);
        gl.uniform1f(u('kind'), 1);
        gl.drawArrays(gl.TRIANGLES, first + half.sideCount, half.faceCount);
        first += half.sideCount + half.faceCount;
      });
      gl.uniform1f(u('shift'), 0);
      gl.uniform1f(u('kind'), 2);
      gl.drawArrays(gl.TRIANGLES, first, bars.barCount);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.uniform1f(u('kind'), 3);
      gl.drawArrays(gl.TRIANGLES, first + bars.barCount, bars.glowCount);
      return true;
    },
  };
}
