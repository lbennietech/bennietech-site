/**
 * gl.js — the smallest possible WebGL helper: one full-screen triangle + a fragment shader.
 *
 *   const r = createRenderer(canvas, FRAG, { alpha: true });
 *   r.draw({ uTime: t, uRes: [w, h], uColor: [1, 0, 0] });   // numbers, arrays (vec2/3/4) or textures
 *
 * Returns null if WebGL is unavailable or the shader fails to compile (the error is logged with line numbers),
 * so callers can fall back to a static image.
 */
import { logger } from '../core/debug.js?v=mv55min1';

const log = logger('gl');
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

export function createRenderer(canvas, frag, { alpha = true, preserve = false } = {}) {
  const gl = canvas.getContext('webgl', { alpha, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: preserve || !!window.__btCapture, powerPreference: 'high-performance' });
  if (!gl) { log.warn('WebGL unavailable'); return null; }
  const prog = program(gl, VERT, frag);
  if (!prog) return null;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(prog);

  const cache = {};
  const uni = name => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(prog, name)));

  return {
    gl, prog,
    set(uniforms) {
      let unit = 0;
      for (const [k, v] of Object.entries(uniforms)) {
        const l = uni(k);
        if (l == null) continue;
        if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(l, unit++); }
        else if (typeof v === 'number') gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else if (v.length === 4) gl.uniform4fv(l, v);
      }
    },
    draw(uniforms = {}, viewport) {
      const [x, y, w, h] = viewport || [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight];
      gl.viewport(x, y, w, h);
      this.set(uniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    /** Upload a canvas/image as a texture (e.g. text drawn with Canvas 2D). */
    texture(source, tex = gl.createTexture()) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    },
  };
}

export function program(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
      log.error('shader compile failed:\n' + gl.getShaderInfoLog(s) + '\n' + numbered);
      return null;
    }
    return s;
  };
  const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { log.error('program link failed: ' + gl.getProgramInfoLog(p)); return null; }
  return p;
}

/** Shared GLSL snippets. */
export const GLSL = {
  head: 'precision highp float;\n',
  // hash / value noise / fbm
  noise: `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + 1.7; a *= .5; } return s; }
`,
  // filmic tonemap + gamma
  tone: `
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return pow(c, vec3(1.0/2.2)); }
`,
  // a procedural photographic studio: softboxes + dark flags, used for chrome reflections everywhere
  studio: `
vec3 studio(vec3 r){
  float y = r.y;
  vec3 c = mix(vec3(.30,.31,.33), vec3(.86,.87,.88), smoothstep(-.35, .55, y));            // floor -> walls
  c = mix(c, vec3(.06,.065,.07), smoothstep(.02, -.12, y) * smoothstep(-.6, -.18, y));       // dark horizon flag
  c += vec3(3.4) * smoothstep(.62, .80, y) * smoothstep(.95, .55, abs(r.x));                 // big top softbox
  c += vec3(2.2,2.25,2.35) * smoothstep(.10, .0, abs(r.x + .78)) * smoothstep(-.2, .2, y);    // left strip light
  c += vec3(1.7) * smoothstep(.07, .0, abs(r.x - .86)) * smoothstep(-.1, .3, y);             // right rim strip
  c = mix(c, vec3(.03), smoothstep(.35, .7, -r.z) * smoothstep(.25, -.05, y) * .85);          // dark cyc behind camera
  c = mix(c, vec3(.02), smoothstep(.16, .05, abs(r.x + .42)) * smoothstep(-.3, .1, y) * .9);   // black flag, left
  c = mix(c, vec3(.02), smoothstep(.20, .08, abs(r.x - .55)) * smoothstep(-.2, .25, y) * smoothstep(.75, .4, y) * .9); // black flag, right
  c += vec3(.55,.75,.05) * smoothstep(.16, .0, abs(r.x - .35)) * smoothstep(-.32, -.10, y) * smoothstep(.12, -.08, y); // lime bounce card
  return c;
}
`,
};
