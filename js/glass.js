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
uniform float kind, part, sway, glint, flute, front, back, pixel, recovery, pulse;
uniform vec3 row3;
uniform vec2 tile, pad, filamentRange, focus;
uniform sampler2D behind, sideRamp, arrisRamp, groundMap;
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

vec3 reeds(vec2 p, float inside, float cutDist) {
  // A cylindrical reed magnifies its centre and folds the far wall over
  // its shoulders. Moving the eye moves the reflection inside each flute.
  float k = floor(p.x / flute), u = fract(p.x / flute);
  float dFocus = length(p - focus);
  float localWarp = exp(-dFocus * dFocus * 7.5) * pulse;
  float centre = k * flute + flute * .5 + sway * .62 + .011 * sin(k * 2.31 + part) + (p.x - focus.x) * localWarp * .085;
  float lens = u * 2. - 1.;
  float bend = lens * (.52 + .48 * lens * lens);
  vec2 at = (vec2(centre + bend * flute * (1.75 + .42 * localWarp), p.y + .014 * bend) + pad) / tile;
  vec2 uv = vec2(at.x, 1. - at.y);
  vec3 colour = texture2D(behind, uv).rgb;
  // Dispersion splits the green channel slightly from red and blue on steep rays,
  // and widens under direct tactile stress.
  float fringe = (.0031 + .0068 * pulse + .0045 * localWarp) * bend * bend * bend;
  colour.r = texture2D(behind, uv + vec2(fringe, .0006 * bend)).r;
  colour.b = texture2D(behind, uv - vec2(fringe, .0006 * bend)).b;
  // Deep bottle-green optical density in the valley between adjacent reeds.
  float groove = .38 * (1. - smoothstep(0., .22, u)) + .28 * smoothstep(.80, 1., u);
  float cusp = exp(-min(u, 1. - u) * 34.);
  colour = mix(colour, vec3(.10, .22, .17), groove);
  // Subtle internal lime light trapped along the reed cusps near the kerf,
  // surging outward through the flutes when the filament is excited.
  float kerfGlow = exp(-cutDist * (5.2 - 1.9 * pulse)) * (.35 + .65 * cusp);
  colour += vec3(.42, .62, .08) * kerfGlow * (.22 + .34 * pulse);
  // Birefringent stress wave travelling from the kerf and pointer contact point.
  float wave = exp(-abs(cutDist - pulse * .58) * 18.) * pulse * (.45 + .55 * cusp);
  colour += vec3(.46, .68, .10) * wave * .26;
  float crest = clamp(.51 + sway * 1.72 + (k - 13.) * .008 + .043 * (p.y - .8), .16, .84);
  float aa = min(.11, pixel / flute);
  float shine = smoothstep(crest - .16 - aa, crest, u) * (1. - smoothstep(crest, crest + .048 + aa, u));
  // Secondary narrow specular filament on the opposite slope of each reed.
  float counter = clamp(1. - crest + .08, .12, .88);
  float hairline = smoothstep(counter - .045 - aa, counter, u) * (1. - smoothstep(counter, counter + .028 + aa, u));
  float window = dot(p, vec2(.73, .38)) - sway * .53;
  float softbox = smoothstep(.13, .33, window) * (1. - smoothstep(.45, .66, window));
  float transom = smoothstep(.69, .75, window) * (1. - smoothstep(.79, .86, window));
  float studio = softbox + .45 * transom;
  colour = mix(colour, vec3(1., .998, .945), shine * (.38 + .42 * studio) + .14 * studio);
  colour = mix(colour, vec3(.93, .97, .89), hairline * (.11 + .16 * (1. - softbox) + .14 * pulse));
  return colour;
}

vec2 sideNormal(vec2 p) {
  float cut = part < .5 ? .9125 : 1.0475;
  if (abs(p.y + .27875 * p.x - cut) < .001) return normalize(vec2(.27875, 1.)) * (part < .5 ? 1. : -1.);
  if (p.x < .0001) return vec2(-1., 0.);
  vec2 upper = vec2(max(p.x - .57, 0.), p.y - .43);
  vec2 lower = vec2(max(p.x - .71, 0.), p.y - 1.20);
  return normalize(length(upper) - .43 < length(lower) - .49 ? upper : lower);
}

void main() {
  vec2 p = plate.xy;
  if (kind < .5) {
    // Looking along the polished wall reveals the bottle-green optical
    // path, a reflected studio card and a second, fainter internal image.
    vec2 a = vec2(-.12 + glint, .05), d = vec2(1.52, .48);
    vec3 colour = texture2D(sideRamp, vec2(clamp(dot(p - a, d) / dot(d, d), 0., 1.), .5)).rgb;
    vec2 n = sideNormal(p);
    float depth = ramp(plate.z, back, front);
    // Follow a refracted ray from this wall to the rear surface. The reed
    // reflections bend around the round end and straighten along the cut.
    vec3 viewDir = normalize(row3);
    vec3 ray = refract(viewDir, vec3(n, 0.), 1. / 1.52);
    float path = (back - plate.z) / min(ray.z, -.01);
    vec2 exitPoint = p + ray.xy * path;
    vec2 uv = (exitPoint + pad) / tile;
    vec3 through = texture2D(behind, vec2(uv.x, 1. - uv.y)).rgb;
    through *= exp(-vec3(1.42, .68, 1.12) * (.18 + .78 * path));
    float reed = .5 + .5 * cos(6.283185 * exitPoint.x / flute);
    float window = smoothstep(-.93, -.35, n.y) * (1. - smoothstep(.46, .91, n.y));
    through *= 1. - .16 * reed * reed * reed * window * smoothstep(.04, .28, path);
    // Total internal reflection brighten where the internal ray grazes the rear face.
    float tir = pow(clamp(1. - abs(ray.z) * 1.15, 0., 1.), 3.);
    through = mix(through, vec3(.84, .92, .80), .28 * tir);
    colour = mix(colour, through, .46);
    float fold = depth + .24 * n.y - .12 * n.x - glint * .9;
    float flag = smoothstep(.18, .49, fold) * (1. - smoothstep(.53, .76, fold));
    float card = smoothstep(.52, .63, fold) * (1. - smoothstep(.66, .87, fold));
    float echo = 1. - smoothstep(.005, .034, abs(fold - .29));
    float grazing = 1. - abs(dot(n, viewDir.xy));
    float fresnel = .04 + .96 * pow(clamp(grazing, 0., 1.), 3.2);
    colour = mix(colour, vec3(.062, .185, .148), .14 + .38 * flag);
    colour = mix(colour, vec3(.91, .97, .87), card * (.22 + .36 * fresnel) + .18 * echo);
    float shoulder = n.y + .43 + .19 * (depth - .5) + glint;
    colour = mix(colour, vec3(.96, .99, .90), .58 * exp(-shoulder * shoulder * 72.) * max(n.x, 0.));
    float cutDist = abs(p.y + .27875 * p.x - .98);
    float spill = exp(-15. * cutDist);
    float internal = exp(-31. * abs(exitPoint.y + .27875 * exitPoint.x - .98));
    // Direct kerf wall catches the lime filament across its polished thickness.
    float kerfWall = max(0., (part < .5 ? 1. : -1.) * n.y) * smoothstep(.15, .95, abs(n.y));
    colour += vec3(.17, .21, .028) * (1. + .95 * pulse) * (spill * (1. + .55 * kerfWall) + internal * .72) * (.38 + .62 * depth);
    colour = mix(colour, arris(p), 1. - ramp(front - plate.z, .002, .0075));
    colour = mix(colour, vec3(236., 244., 224.) / 255., .74 * (1. - ramp(plate.z - back, .0025, .009)));
    gl_FragColor = vec4(colour, 1.);
  } else if (kind < 1.5) {
    // The front face, its polished edge picked out in light.
    float line = (p.y + .27875 * p.x) * .9633;
    float cutEdge = part < .5 ? line - .9125 * .9633 : 1.0475 * .9633 - line;
    float inside = -max(contour(p), cutEdge);
    float cutDist = abs(line - .98 * .9633);
    float edge = 1. - smoothstep(.0038 - pixel, .0042 + pixel, inside);
    float bevel = 1. - smoothstep(.005, .024, inside);
    float innerLip = smoothstep(.004, .008, inside) * (1. - smoothstep(.008, .015, inside));
    vec3 face = mix(reeds(p, inside, cutDist), vec3(.20, .35, .27), .35 * bevel);
    face = mix(face, vec3(.94, .98, .88), (.22 + .15 * pulse) * innerLip);
    // Warm lime rim along the inner bevel adjacent to the diagonal kerf.
    float kerfRim = (1. - smoothstep(.003, .018 + .008 * pulse, -cutEdge)) * smoothstep(.08, .22, p.x);
    face += vec3(.22, .30, .04) * (1. + .85 * pulse) * kerfRim;
    // As the print resolves back into glass, the cut's light travels a
    // short distance into the reeds and dies there.
    float travel = cutDist - (.05 + .46 * recovery);
    float light = (1. - recovery) * exp(-travel * travel * 420.);
    face = mix(face, vec3(.92, .98, .71), .42 * light);
    gl_FragColor = vec4(mix(face, arris(p), edge), 1.);
  } else if (kind < 2.5) {
    float z = ramp(plate.z, -.1445, .1615);
    vec3 bar = mix(vec3(.62, .80, .16), vec3(.95, 1., .74), clamp(z * z + .35 * pulse, 0., 1.));
    gl_FragColor = vec4(bar, 1.);
  } else if (kind > 3.5) {
    vec4 ink = texture2D(groundMap, vec2(p.x, -p.y) * .5 + .5);
    gl_FragColor = vec4(ink.rgb * ink.a, ink.a);
  } else {
    // The filament's glow, with an incandescent near-white core.
    float d = abs(side);
    float cap = smoothstep(filamentRange.x - .028, filamentRange.x + .008, p.x)
      * (1. - smoothstep(filamentRange.y - .008, filamentRange.y + .028, p.x));
    float glow = (.29 + .16 * pulse) * exp(-d * d * (4.4 - 1.2 * pulse)) * cap;
    float halo = (.12 + .09 * pulse) * exp(-d * d * 18.) * cap;
    float core = (1. - smoothstep(.055, .175 + .045 * pulse, d)) * cap * cap;
    float alpha = min(1., max(glow + halo, core));
    vec3 colour = mix(vec3(178., 224., 50.) / 255., vec3(249., 255., 224.) / 255., core);
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
  for (const [x, y] of [[x0, y0], [x1, y1]]) quad(corner(x, y, -.006, far), corner(x, y, .006, far), corner(x, y, .006, near), corner(x, y, -.006, near));
  const data = [];
  box.forEach(v => data.push(...v, 0));
  const ux = (x1 - x0) / length * .03, uy = (y1 - y0) / length * .03;
  const card = [];
  const at = (x, y, s) => [x + nx * .03 * s, y + ny * .03 * s, near + .001, s];
  const a = at(x0 - ux, y0 - uy, -1), b = at(x1 + ux, y1 + uy, -1), c = at(x1 + ux, y1 + uy, 1), d = at(x0 - ux, y0 - uy, 1);
  [a, b, c, a, c, d].forEach(v => card.push(...v));
  return { data: data.concat(card), barCount: box.length, glowCount: 6 };
}

export function createGlass(stage, { outlines, tiles, scale, pad, flute, sideStops, arrisStops, filament, back, front, groundMap }) {
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
  const groundTexture = texture(gl, groundMap);
  gl.uniform2f(u('tile'), tiles[0].width / scale, tiles[0].height / scale);
  gl.uniform2f(u('pad'), pad[0], pad[1]);
  gl.uniform1f(u('flute'), flute);
  gl.uniform1f(u('front'), front);
  gl.uniform1f(u('back'), back);
  gl.uniform2f(u('filamentRange'), filament[0][0], filament[1][0]);
  [['behind', 0], ['sideRamp', 1], ['arrisRamp', 2], ['groundMap', 3]].forEach(([name, unit]) => gl.uniform1i(u(name), unit));
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sideRamp);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, arrisRamp);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, groundTexture);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let box = [0, 0, 1, 1], ratio = 1;
  return {
    canvas,
    get box() { return box; },
    // The layer covers every place the B can reach as it sways and follows
    // the pointer, measured once per resize.
    resize(pixelRatio, reach) {
      ratio = pixelRatio;
      const [left, top, right, bottom] = reach;
      box = [Math.floor(left) - 4, Math.floor(top) - 4, Math.ceil(right - left) + 8, Math.ceil(bottom - top) + 8];
      Object.assign(canvas.style, {
        inset: 'auto', left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
      });
      canvas.width = Math.max(1, Math.round(box[2] * ratio));
      canvas.height = Math.max(1, Math.round(box[3] * ratio));
    },
    render({ rows, centre, size, lift, shift, glint, sway, ground, recovery, pulse = 0, focus = [.56, .845] }) {
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
      gl.uniform1f(u('recovery'), recovery);
      gl.uniform1f(u('pulse'), pulse);
      gl.uniform2f(u('focus'), ...focus);
      gl.uniform1f(u('pixel'), 1 / (size * ratio));

      // The ground goes down first, blended and outside the depth test.
      const groundFirst = halves.reduce((n, half) => n + half.sideCount + half.faceCount, 0) + bars.barCount + bars.glowCount;
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.uniform1f(u('ground'), 1);
      gl.uniform4f(u('shadow'), ...ground);
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
