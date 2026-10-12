/**
 * cta-mark.js — the contact panel's centrepiece: the block-B rebuilt as a stack of machined slabs (WebGL).
 * <canvas data-module="cta-mark">
 *
 * - Same geometry as the logo (js/brand/logotype.js -> blockGeom), but sliced into thin layers along its depth:
 *   "built block by block", taken literally. Each slab keeps the rising cut, so the B splits into upper and
 *   lower stacks.
 * - Slabs alternate gloss-black lacquer and mirror chrome (the ink of the button and type, the metal of the
 *   hero), lit by the shared photo studio (gl.js -> GLSL.studio) with the lime panel in the lower reflections.
 *   White light leaks out of the cut.
 * - Motion: when the panel scrolls into view the slabs grow into place one after another, back to front, and the
 *   cut lights up once the stack is complete. Afterwards they ripple gently, fan open while the pointer is over
 *   the panel, and the whole stack turns towards the pointer.
 * - Transparent background with a soft contact shadow, so it floats over the lime aurora.
 *   Falls back to the flat logo mark without WebGL.
 */
import { createRenderer, GLSL } from '../gl/gl.js?v=mv56u9f9';
import { blockGeom, BLOCK, logoSVG } from '../brand/logotype.js?v=mv56u9f9';
import { addTask } from '../core/ticker.js?v=mv56u9f9';
import { whenVisible, onResize, reducedMotion, lerp, clamp } from '../core/utils.js?v=mv56u9f9';
import { pointer, listenPointer } from '../core/pointer.js?v=mv56u9f9';

const LAYERS = 5;

const FRAG = GLSL.head + GLSL.tone + GLSL.studio + `
uniform vec2 uRes; uniform float uTime; uniform vec2 uRot; uniform float uBuild; uniform float uFan; uniform float uZoom;
uniform vec3 uTop; uniform vec3 uBot;      // D blocks: width, y0, y1 (logo coords, y down)
uniform vec4 uSlot;                         // slot line: normal.xy (towards the upper piece), offset, half thickness
uniform vec2 uCenter;                       // logo centre (logo coords)

#define N ${LAYERS}
const float HZ = .042;    // half thickness of one slab
const float RR = .022;    // bevel radius

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float sdD(vec2 p, vec3 D){
  float r = (D.z - D.y) * .5, cx = D.x - r, cy = (D.y + D.z) * .5;
  return min(sdBox2(p - vec2(cx * .5, cy), vec2(cx * .5, r)), length(p - vec2(cx, cy)) - r);
}
vec2 logo(vec2 p){ return vec2(p.x + uCenter.x, uCenter.y - p.y); }
float sLine(vec2 q){ return dot(q, uSlot.xy) - uSlot.z; }        // > 0 above the cut
// the cut B in 2D: both pieces at once (the slot is removed from the silhouette)
float mark2(vec2 q){ return max(min(sdD(q, uTop), sdD(q, uBot)), uSlot.w - abs(sLine(q))); }
float slab(float d2, float z){ vec2 w = vec2(d2 + RR, abs(z) - HZ + RR); return min(max(w.x, w.y), 0.) + length(max(w, 0.)) - RR; }

float pitch(){ return 2. * HZ + .018 + uFan * .09; }               // slab spacing (opens up when fanned)
// how far slab i has arrived (0..1): they land one after another, back to front
float arrive(float i){ float a = clamp(uBuild * 1.7 - i * .175, 0., 1.); return 1. - pow(1. - a, 3.); }
// each slab's rigid placement: xy offset, z, and turn about the depth axis
vec4 place(float i){
  float k = i - float(N - 1) * .5, a = arrive(i);
  vec2 rip = vec2(sin(uTime * .9 - i * .8), cos(uTime * .7 - i * .8)) * (.018 + uFan * .05);
  return vec4(rip + vec2(.25, .35) * (1. - a), k * pitch() - (1. - a) * .9, (1. - a) * 1.3 + uFan * k * .05);
}

// returns distance, slab index
vec2 map(vec3 p){
  vec2 m = vec2(1e9, 0.);
  for (int j = 0; j < N; j++){
    float i = float(j), s = arrive(i);
    if (s < .02) continue;                                        // not here yet
    vec4 o = place(i);
    vec3 q = p - o.xyz;
    q.xy *= rot(o.w);
    q /= s;                                                       // slabs grow into place
    float d = slab(mark2(logo(q.xy)), q.z) * s;
    if (d < m.x) m = vec2(d, i);
  }
  return m;
}
// light sheet inside the cut, for the glow
float core(vec3 p){
  vec2 q = logo(p.xy);
  float span = float(N) * pitch() * .5;
  return max(max(min(sdD(q, uTop), sdD(q, uBot)) + .05, abs(sLine(q)) - .002), abs(p.z) - span);
}
vec3 normal(vec3 p){
  const vec2 e = vec2(.0009, -.0009);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}
float ao(vec3 p, vec3 n){
  float o = 0., s = 1.;
  for (int i = 1; i <= 4; i++){ float h = .015 + .04 * float(i); o += (h - map(p + n * h).x) * s; s *= .65; }
  return clamp(1. - 2. * o, 0., 1.);
}

float lit(){ return smoothstep(.85, 1., uBuild); }                   // the cut lights up once the stack is complete

vec3 shade(vec3 p, float id, vec3 rd){
  vec3 n = normal(p), v = -rd, r = reflect(rd, n);
  float cosT = clamp(dot(n, v), 0., 1.);
  float occ = ao(p, n);
  vec3 env = studio(r);
  env = mix(env, env * vec3(.85, 1.1, .3) + vec3(.05, .07, 0.), smoothstep(.15, -.45, r.y));   // the lime panel, seen in the lower half
  bool metal = mod(id, 2.) > .5;
  // chrome: mirror; lacquer: near-black base under a clear coat (Fresnel from 4%)
  vec3 F0 = metal ? vec3(.95, .955, .965) : vec3(.05);
  vec3 F = F0 + (1. - F0) * pow(1. - cosT, 5.);
  vec3 base = metal ? vec3(0.) : vec3(.016, .016, .019) * (.4 + .6 * clamp(dot(n, normalize(vec3(-.4, .8, .5))), 0., 1.));
  vec3 col = (base + env * F) * mix(.3, 1., occ);
  // walls of the cut glow from within while the stack is closed
  vec4 o = place(id);
  vec2 q = (p.xy - o.xy) * rot(o.w);
  float wall = smoothstep(.016, .0, abs(abs(sLine(logo(q))) - uSlot.w));
  col += vec3(1., 1., .9) * wall * (.6 + .6 * pow(1. - cosT, 2.)) * lit() * occ;
  return col;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0., 0., 4.4 / uZoom);
  vec3 rd = normalize(vec3(uv, -1.75));
  mat2 ry = rot(uRot.x), rx = rot(uRot.y);
  ro.yz *= rx; rd.yz *= rx; ro.xz *= ry; rd.xz *= ry;

  vec3 col = vec3(0.); float alpha = 0., gmin = 1e3;
  float pix = 1. / (min(uRes.x, uRes.y) * 1.75);
  float bestR = 1e9, bestT = 0.;
  float b = dot(ro, rd), c = dot(ro, ro) - 2.4 * 2.4, disc = b * b - c;
  float t = disc > 0. ? max(0., -b - sqrt(disc)) : 1e9, tEnd = disc > 0. ? -b + sqrt(disc) : 0.;
  t += fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * .015;
  vec2 h = vec2(1e9, 0.); bool hit = false;
  if (disc > 0.){
    for (int i = 0; i < 110; i++){
      vec3 p = ro + rd * t;
      h = map(p);
      gmin = min(gmin, core(p));
      float ratio = h.x / (pix * t);
      if (ratio < bestR){ bestR = ratio; bestT = t; }
      if (h.x < .0006 * t){ hit = true; break; }
      if (t > tEnd) break;
      t += h.x * .85;
    }
  }
  float cover = hit ? 1. : 1. - smoothstep(0., 1.5, bestR);
  if (cover > 0.){
    vec3 p = ro + rd * (hit ? t : bestT);
    col = shade(p, hit ? h.y : map(p).y, rd);
    alpha = cover;
  }
  float edge = smoothstep(.5, .36, max(abs(uv.x), abs(uv.y)));   // nothing may touch the canvas border
  if (cover < 1. && rd.y < 0.){
    // soft contact shadow on an invisible floor
    float tf = (-1.25 - ro.y) / rd.y;
    vec3 pf = ro + rd * tf;
    float d = map(pf + vec3(0., .02, 0.)).x;
    alpha += exp(-d * 2.6) * .26 * smoothstep(2.4, .8, length(pf.xz)) * edge * lit() * (1. - cover);
  }
  float glow = max(exp(-max(gmin, 0.) * 30.) * .35 + exp(-max(gmin, 0.) * 120.) * .8 - .012, 0.) * edge * lit() * (1. - uFan * .8);
  vec3 gl = vec3(1., 1., .86) * glow * (.9 + .12 * sin(uTime * 1.3));
  vec3 outc = toSRGB(aces(col + gl)) * cover + toSRGB(aces(gl)) * (1. - cover);
  alpha = clamp(alpha + dot(gl, vec3(.3)) * (1. - cover), 0., 1.);
  gl_FragColor = vec4(outc, alpha);
}`;

export default {
  name: 'cta-mark',
  init(canvas) {
    const r = createRenderer(canvas, FRAG, { alpha: true });
    if (!r) { fallback(canvas); return; }

    const g = blockGeom(BLOCK);
    const dx = g.slot.x1 - g.slot.x0, dy = g.slot.y1 - g.slot.y0, len = Math.hypot(dx, dy);
    const n = [dy / len, -dx / len];
    const geo = {
      uTop: [BLOCK.wT, 0, BLOCK.hT], uBot: [BLOCK.wB, BLOCK.H - BLOCK.hB, BLOCK.H],
      uSlot: [n[0], n[1], n[0] * g.slot.x0 + n[1] * g.slot.y0, BLOCK.t / 2], uCenter: [BLOCK.wB / 2, BLOCK.H / 2],
    };

    // 2x the CSS size (supersampling), or the screen's density up to 3x
    const scale = clamp(window.devicePixelRatio || 1, 2, 3);
    const panel = canvas.closest('.cta') || canvas.parentElement;
    const sm = { x: 0, y: 0, fan: 0 };
    let hover = false, builtAt = null, stop = null;

    function size() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(rect.width * scale)); canvas.height = Math.max(2, Math.round(rect.height * scale));
      frame(performance.now() / 1000, 0);
    }

    function frame(t, dt) {
      const build = reducedMotion() ? 1 : builtAt == null ? 0 : clamp((t - builtAt) / 2.2, 0, 1);
      const k = 1 - Math.exp(-Math.min(dt || .016, .1) * 3);
      sm.fan = lerp(sm.fan, hover ? 1 : 0, k);
      sm.x = lerp(sm.x, pointer.active ? pointer.x : 0, k * .8);
      sm.y = lerp(sm.y, pointer.active ? pointer.y : 0, k * .8);
      let yaw = -.62 + Math.sin(t * .3) * .22 + sm.x * .55 + sm.fan * .25;
      let pitch = -.16 + Math.sin(t * .21) * .05 + sm.y * .18;
      let fan = sm.fan, b = build;
      const o = window.__btCta;                            // debug override: window.__btCta = { yaw, pitch, build, fan }
      if (o) { yaw = o.yaw ?? yaw; pitch = o.pitch ?? pitch; b = o.build ?? b; fan = o.fan ?? fan; }
      r.draw({ uRes: [canvas.width, canvas.height], uTime: t, uRot: [yaw, pitch], uBuild: b, uFan: fan, uZoom: 1, ...geo });
    }

    size(); onResize(canvas, size);
    canvas.__frame = frame;                              // debug: canvas.__frame(t, dt) forces a draw
    if (reducedMotion()) return;
    listenPointer();
    panel.addEventListener('pointerenter', () => (hover = true));
    panel.addEventListener('pointerleave', () => (hover = false));
    whenVisible(canvas, v => {
      if (v && builtAt == null) builtAt = performance.now() / 1000 + .25;   // stack up as the panel arrives
      if (v && !stop) stop = addTask(frame);
      else if (!v && stop) { stop(); stop = null; }
    }, '0px');
  },
};

function fallback(canvas) {
  const div = document.createElement('div');
  div.className = canvas.className + ' cta__fallback';
  div.innerHTML = logoSVG({ layout: 'mark' });
  canvas.replaceWith(div);
}
