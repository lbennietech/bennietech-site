// Sunlight split by the glass B, thrown across the paper as spectral blades.
//
// Each blade is a thin fan of light that leaves a point on the B. Every
// wavelength leaves at a slightly different angle, so the colours overlap
// into a white-hot sliver where the light leaves the glass and draw apart
// into a full spectrum the further it travels. The blades are anchored to
// the block and swing with its turn, much faster than the block itself, as
// light thrown by a turning prism does.
//
// Inside the glass, the sunlight's path through the upper bowl is handed to
// the glass shader, where every reed splits it into a small spectrum and the
// barrel walls flare where it leaves. The glitch's torn print rows keep the
// light as it was when the picture was held.
import { program } from './gl/gl.js';

export const BEAM_COUNT = 4;

// Shared GLSL. Positions are CSS pixels on the page.
export const SPECTRUM = `
uniform vec4 beamRay[${BEAM_COUNT}];
uniform vec4 beamFan[${BEAM_COUNT}];
uniform vec4 beamTone[${BEAM_COUNT}];
uniform float beamRef;

// One line of the spectrum: its place across the blade, widened by the size
// of the sun. Where the spread is still smaller than the source, near the
// glass, the lines overlap into white.
float spectralLine(float x, float spread, float blur, float at) {
  float s = sqrt(.042 * spread * spread + blur * blur);
  float d = (x - at * spread) / s;
  return exp(-d * d) * inversesqrt(max(s / beamRef, .05));
}

vec3 spectralLight(vec2 s) {
  vec3 light = vec3(0.);
  for (int i = 0; i < ${BEAM_COUNT}; i++) {
    vec4 ray = beamRay[i], fan = beamFan[i], tone = beamTone[i];
    if (tone.x <= 0.) continue;
    vec2 r = s - ray.xy;
    float a = dot(r, ray.zw);
    if (a <= 0.) continue;
    float spread = a * fan.x;
    float blur = fan.y + a * fan.z;
    float x = (ray.z * r.y - ray.w * r.x) * tone.y;
    if (abs(x) > 1.3 * spread + 3. * blur + 2.) continue;
    // Six lines from red, which bends least, to violet. Together they sum
    // to warm sunlight.
    vec3 c = vec3(.255, .021, .010) * spectralLine(x, spread, blur, -.84)
      + vec3(.326, .135, .0) * spectralLine(x, spread, blur, -.50)
      + vec3(.326, .323, .035) * spectralLine(x, spread, blur, -.17)
      + vec3(.049, .342, .119) * spectralLine(x, spread, blur, .17)
      + vec3(.0, .146, .485) * spectralLine(x, spread, blur, .51)
      + vec3(.044, .013, .250) * spectralLine(x, spread, blur, .86);
    // A little of the light scatters off the paper around each blade.
    float wide = 2.4 * (spread + blur);
    c += vec3(1., .93, .80) * .05 * exp(-x * x / (wide * wide)) * inversesqrt(max(wide / beamRef, .2));
    float along = a / fan.w;
    float reach = (1. - smoothstep(.30, 1., along)) * smoothstep(0., tone.z, a);
    light += c * (2.8 * tone.x * reach * (1. - .35 * smoothstep(0., .9, along)));
  }
  return light;
}

// Light falling on paper. The paper keeps its own grain and tone, takes on
// the colour of the light, and brightens where the light is strong: the
// result is paper * tint + paper * light * gain.
vec3 lightTint(vec3 light) {
  float peak = max(light.r, max(light.g, light.b));
  if (peak < .0015) return vec3(1.);
  float cover = peak / (peak + .30);
  return mix(vec3(1.), light / peak, .62 * cover);
}
const float LIGHT_GAIN = .52;
vec3 litPaper(vec3 paper, vec3 light) {
  return paper * (lightTint(light) + light * LIGHT_GAIN);
}
`;

const fragment = `precision highp float;
uniform vec2 res;
uniform float scale, lightAngle;
${SPECTRUM}

vec3 paperAt(vec2 s) {
  vec2 uv = s / res;
  float t = length((uv - vec2(.36, .26)) / vec2(.64, .74)) * .7071;
  vec3 c = mix(vec3(.984, .976, .945), vec3(.937, .925, .886), clamp(t / .43, 0., 1.));
  c = mix(c, vec3(.867, .867, .824), clamp((t - .43) / .35, 0., 1.));
  c = mix(c, vec3(.784, .788, .737), clamp((t - .78) / .34, 0., 1.));
  float diag = uv.x * .899 + uv.y * .438 - lightAngle * .18;
  c = mix(c, vec3(1., .996, .953), smoothstep(.16, .26, diag) * (1. - smoothstep(.26, .45, diag)) * .24);
  return c;
}

float dither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))) - .5;
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / scale;
  vec3 light = spectralLight(s);
  float peak = max(light.r, max(light.g, light.b));
  if (peak < .0015) { gl_FragColor = vec4(0.); return; }
  vec3 paper = paperAt(s);
  vec3 tint = lightTint(light);
  // Composited over the real paper, which shows through by the share it
  // keeps in every channel; this layer supplies the rest.
  float keep = min(tint.r, min(tint.g, tint.b));
  vec3 colour = paper * (tint - keep + light * LIGHT_GAIN);
  colour += dither(gl_FragCoord.xy) / 255.;
  gl_FragColor = vec4(max(colour, 0.), 1. - keep);
}`;

const vertex = `attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`;

// The sun enters the stem of the upper bowl from the window side and leaves
// through the crown of its barrel (plate units). Every blade below starts
// where light leaves the glass.
const ENTRY = [0, .26], EXIT = [.99, .52], LOWER_EXIT = [1.2, 1.2];
const PATH = (() => {
  const dx = EXIT[0] - ENTRY[0], dy = EXIT[1] - ENTRY[1], length = Math.hypot(dx, dy);
  return { dir: [dx / length, dy / length], length };
})();

// Which way each blade runs at rest, on a wide screen and on a tall one, and
// how hard it swings as the B turns [yaw, pitch, studio light]. Spread is
// the tangent of half the spectrum's angle; source and divergence set how
// soon the white separates into colour. Reach is in B heights.
const BLADES = [
  { at: EXIT, angle: [-.40, -1.22], lever: [2.4, -1.0, .75], spread: .032, source: .014, diverge: .009, reach: 1.45, power: 1, side: 1, wobble: .7 },
  { at: EXIT, angle: [-.50, -1.34], lever: [2.8, -.9, .8], spread: .024, source: .008, diverge: .008, reach: 1.05, power: .30, side: 1, wobble: 4.4 },
  { at: LOWER_EXIT, angle: [.36, 1.16], lever: [3.0, 1.2, .85], spread: .028, source: .011, diverge: .009, reach: 1.1, power: .6, side: -1, wobble: 3.1 },
  // The sunlight itself, falling across the paper toward the B.
  { at: ENTRY, sun: true, lever: [0, 0, .25], spread: 0, source: .034, diverge: .007, reach: 1.5, power: .24, side: 1, wobble: 2.2 },
];

export function createSpectrum(before, { software = false } = {}) {
  if (software) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'spectrum';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) return null;
  const prog = program(gl, vertex, fragment);
  if (!prog) return null;
  before.before(canvas);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(prog);
  gl.disable(gl.BLEND);
  const at = name => gl.getUniformLocation(prog, name);
  const uniforms = {
    res: at('res'), scale: at('scale'), lightAngle: at('lightAngle'), ref: at('beamRef'),
    ray: at('beamRay'), fan: at('beamFan'), tone: at('beamTone'),
  };
  let scale = 1, blank = true;

  return {
    canvas,
    resize(w, h, ratio) {
      // The light is soft-edged, so CSS resolution is indistinguishable from device resolution.
      scale = Math.min(ratio, 1);
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      blank = false;
    },
    render(beams, lightAngle) {
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.scale, scale);
      gl.uniform1f(uniforms.lightAngle, lightAngle);
      gl.uniform1f(uniforms.ref, beams.ref);
      gl.uniform4fv(uniforms.ray, beams.ray);
      gl.uniform4fv(uniforms.fan, beams.fan);
      gl.uniform4fv(uniforms.tone, beams.tone);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      blank = false;
    },
    clear() {
      if (blank || gl.isContextLost()) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      blank = true;
    },
  };
}

const ease = (t, length) => {
  const x = Math.min(1, Math.max(0, t / length));
  return 1 - (1 - x) ** 3;
};

// Aims every blade for this frame, and the light inside the glass that feeds
// them. `dawn` counts seconds since the sunlight began to arrive: it falls
// on the paper, crosses the glass, breaks out of the barrels with a spark,
// and then the blades unfurl outward from the B.
export function aimBeams(out, { rows, centre, size, lift, yaw, pitch, lightAngle, time, dawn, pulse, tall }) {
  const sunIn = ease(dawn, .9);
  const crossing = ease(dawn - .4, .7);
  const breach = ease(dawn - .95, .3);
  const spark = breach * Math.exp(-Math.max(0, dawn - 1.1) * 3.2);
  const unfurl = ease(dawn - 1.0, 1.5);
  const press = 1 + .14 * pulse;
  out.lit = sunIn > .001;
  out.ref = size * .05;
  const [r0, r1] = rows;
  // A turning prism throws its light through a wider angle than it turns,
  // but the swing eases off so a hard drag never flings the blades about.
  const soft = x => x / (1 + Math.abs(x) * 1.6);
  const dyaw = soft(yaw + .46), dpitch = soft(pitch + .16);
  const screen = (u, v, z = 0) => {
    const qx = u - .56, qy = v - .845 + lift;
    return [centre[0] + size * (r0[0] * qx + r0[1] * qy + r0[2] * z),
      centre[1] + size * (r1[0] * qx + r1[1] * qy + r1[2] * z)];
  };
  BLADES.forEach((b, i) => {
    const [x, y] = screen(...b.at);
    // The sunlight runs on from the entry the way it crosses the glass.
    const toward = b.sun
      ? Math.atan2(-(r1[0] * PATH.dir[0] + r1[1] * PATH.dir[1]), -(r0[0] * PATH.dir[0] + r0[1] * PATH.dir[1]))
      : b.angle[0] + (b.angle[1] - b.angle[0]) * tall;
    const angle = toward + b.lever[0] * dyaw + b.lever[1] * dpitch + b.lever[2] * lightAngle
      + (b.sun ? 0 : .018 * Math.sin(time * .13 + b.wobble) + .010 * Math.sin(time * .29 + b.wobble * 2.3));
    const k = i * 4;
    out.ray[k] = x; out.ray[k + 1] = y; out.ray[k + 2] = Math.cos(angle); out.ray[k + 3] = Math.sin(angle);
    const breathe = 1 + .05 * Math.sin(time * .41 + b.wobble * 1.7);
    out.fan[k] = b.spread * breathe;
    out.fan[k + 1] = b.source * size;
    out.fan[k + 2] = b.diverge;
    out.fan[k + 3] = Math.max(1, b.reach * size * 1.69 * (b.sun ? 1 : .08 + .92 * unfurl));
    out.tone[k] = b.power * press * (b.sun ? sunIn : unfurl * (1 + .5 * spark));
    out.tone[k + 1] = b.side;
    out.tone[k + 2] = size * .08;
    out.tone[k + 3] = 0;
  });
  // Inside the glass: the sheet's path through the upper bowl, where each
  // reed's little spectrum falls as the B turns, and the flares at the exits.
  const { sun } = out;
  sun.path[0] = ENTRY[0]; sun.path[1] = ENTRY[1]; sun.path[2] = PATH.dir[0]; sun.path[3] = PATH.dir[1];
  sun.look[0] = .05;
  sun.look[1] = Math.max(.001, PATH.length * crossing);
  sun.look[2] = .8 * press * sunIn;
  sun.look[3] = .5 + .5 * Math.sin(dyaw * 5.5 + lightAngle * 2.2 + Math.sin(time * .21) * .35) * .62;
  const flare = breach * (1 + 1.4 * spark) * press;
  sun.exitA[0] = EXIT[0]; sun.exitA[1] = EXIT[1]; sun.exitA[2] = .85 * flare; sun.exitA[3] = .045;
  sun.exitB[0] = LOWER_EXIT[0]; sun.exitB[1] = LOWER_EXIT[1]; sun.exitB[2] = .5 * flare; sun.exitB[3] = .04;
  return out;
}

export const makeBeams = () => ({
  lit: false,
  ref: 1,
  ray: new Float32Array(BEAM_COUNT * 4),
  fan: new Float32Array(BEAM_COUNT * 4),
  tone: new Float32Array(BEAM_COUNT * 4),
  sun: { path: new Float32Array(4), look: new Float32Array(4), exitA: new Float32Array(4), exitB: new Float32Array(4) },
});
