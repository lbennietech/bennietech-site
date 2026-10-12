/**
 * hero-sculpt.js — the hero centrepiece: the BennieTech block-B, rendered live as a 3D sculpture (WebGL).
 * <canvas data-module="hero-sculpt">
 *
 * - The geometry comes straight from the logo (js/brand/logotype.js -> blockGeom), so 2D logo and 3D object match.
 * - Two machined pieces: upper = mirror-polished chrome, lower = smoked titanium with a thin-film sheen.
 *   Lime light leaks out of the cut between them.
 * - Ray-marched signed distance field, lit by a procedural photo studio (gl.js -> GLSL.studio), rounded bevels,
 *   ambient occlusion, soft contact shadow. Transparent background: it floats over the page.
 * - Motion: the pieces assemble on load, part as you scroll ("built block by block"), turn with the pointer.
 * - Resolution adapts to the GPU (never below 1x CSS pixels; then the frame rate drops instead). Falls back to the flat logo without WebGL.
 */
import { createRenderer, GLSL } from '../gl/gl.js?v=mv56u9f9';
import { blockGeom, BLOCK, logoSVG } from '../brand/logotype.js?v=mv56u9f9';
import { addTask } from '../core/ticker.js?v=mv56u9f9';
import { whenVisible, onResize, reducedMotion, lerp, clamp } from '../core/utils.js?v=mv56u9f9';
import { pointer, listenPointer } from '../core/pointer.js?v=mv56u9f9';

const FRAG = GLSL.head + GLSL.tone + GLSL.studio + `
uniform vec2 uRes; uniform float uTime; uniform vec2 uRot; uniform float uSep; uniform float uZoom; uniform vec2 uShift;
uniform vec3 uTop; uniform vec3 uBot;      // D blocks: width, y0, y1 (logo coords, y down)
uniform vec4 uSlot;                         // slot line: normal.xy (towards the upper piece), offset, half thickness
uniform vec2 uCenter;                       // logo centre (logo coords)

const float HZ = .25;     // half depth of the extrusion
const float RR = .065;    // bevel radius

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float sdD(vec2 p, vec3 D){
  float r = (D.z - D.y) * .5, cx = D.x - r, cy = (D.y + D.z) * .5;
  return min(sdBox2(p - vec2(cx * .5, cy), vec2(cx * .5, r)), length(p - vec2(cx, cy)) - r);
}
// extrusion with rounded bevels; faces are slightly domed ("pillowed") so reflections sweep across them
float extrude(float d2, float z, float dome){ float hz = HZ + dome; vec2 w = vec2(d2 + RR, abs(z) - hz + RR); return min(max(w.x, w.y), 0.) + length(max(w, 0.)) - RR; }
vec2 logo(vec3 p){ return vec2(p.x + uCenter.x, uCenter.y - p.y); }
float silhouette(vec2 q){ return min(sdD(q, uTop), sdD(q, uBot)); }
float sLine(vec2 q){ return dot(q, uSlot.xy) - uSlot.z; }        // > 0 above the cut

vec3 N3;   // slot normal in 3D (y up)
vec3 pieceUp(vec3 p){ p -= N3 * uSep; p.xy *= rot(-uSep * .35); return p; }
vec3 pieceLo(vec3 p){ p += N3 * uSep; p.xz *= rot(uSep * .25); return p; }

vec2 map(vec3 p){
  vec3 pu = pieceUp(p), pl = pieceLo(p);
  vec2 qu = logo(pu), ql = logo(pl);
  // smooth dome over each piece (a function of position, so it never creases)
  float domeU = .06 * (1. - min(1., dot((qu - vec2(.45, .42)) / vec2(.75, .6), (qu - vec2(.45, .42)) / vec2(.75, .6))));
  float domeL = .06 * (1. - min(1., dot((ql - vec2(.55, 1.24)) / vec2(.85, .65), (ql - vec2(.55, 1.24)) / vec2(.85, .65))));
  float du = extrude(max(silhouette(qu), uSlot.w - sLine(qu)), pu.z, domeU);
  float dl = extrude(max(silhouette(ql), sLine(ql) + uSlot.w), pl.z, domeL);
  return du < dl ? vec2(du, 1.) : vec2(dl, 2.);
}
// the light plate living in the cut (for the glow)
float core(vec3 p){
  vec2 q = logo(p);
  return max(max(silhouette(q) + .04, abs(sLine(q)) - .002), abs(p.z) - HZ * .55);
}
vec3 normal(vec3 p){
  const vec2 e = vec2(.0012, -.0012);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}
float ao(vec3 p, vec3 n){
  float o = 0., s = 1.;
  for (int i = 1; i <= 5; i++){ float h = .02 + .07 * float(i); o += (h - map(p + n * h).x) * s; s *= .7; }
  return clamp(1. - 1.6 * o, 0., 1.);
}
vec3 film(float c){ // thin-film interference tint
  float ph = 6.2831 * (2.0 * 1.38 * .42 * c) * 2.2;
  return .55 + .45 * cos(ph + vec3(0., 2.1, 4.2));
}

vec3 shade(vec3 p, float id, vec3 rd){
  vec3 n = normal(p), v = -rd, r = reflect(rd, n);
  float cosT = clamp(dot(n, v), 0., 1.);
  float occ = ao(p, n);
  vec3 env = studio(r);
  vec3 F0 = id < 1.5 ? vec3(.96, .962, .97) : mix(vec3(.15, .155, .165), vec3(.15, .155, .165) * film(cosT) * 1.6, .2);
  vec3 F = F0 + (1. - F0) * pow(1. - cosT, 5.);
  vec3 col = env * F * mix(.35, 1., occ);
  // faces of the cut: anodised lime metal, lit from inside while the pieces are closed
  vec2 q = logo(id < 1.5 ? pieceUp(p) : pieceLo(p));
  float cutFace = smoothstep(.02, .0, abs(abs(sLine(q)) - uSlot.w)) * smoothstep(.6, .9, abs(dot(n, N3)));
  float lit = smoothstep(.25, .04, uSep);
  vec3 anod = vec3(.5, .9, .02) * (dot(env, vec3(.3)) * .75 + .08) * mix(.4, 1., occ);
  return mix(col, anod + vec3(.55, 1., .02) * (.9 + pow(1. - cosT, 2.)) * lit, cutFace);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  uv -= uShift;
  // orbit camera
  vec3 ro = vec3(0., 0., 4.6 / uZoom);
  vec3 rd = normalize(vec3(uv, -1.75));
  mat2 ry = rot(uRot.x), rx = rot(uRot.y);
  ro.yz *= rx; rd.yz *= rx; ro.xz *= ry; rd.xz *= ry;
  N3 = normalize(vec3(uSlot.x, -uSlot.y, 0.));

  vec3 col = vec3(0.); float alpha = 0.;
  float gmin = 1e3;
  // anti-aliasing: track how close the ray passes to the surface, measured in pixels (pixel footprint grows with t)
  float pix = 1. / (uRes.y * 1.75);
  float bestR = 1e9, bestT = 0.;
  // bounding sphere
  float b = dot(ro, rd), c = dot(ro, ro) - 2.6 * 2.6, disc = b * b - c;
  float t = disc > 0. ? max(0., -b - sqrt(disc)) : 1e9, tEnd = disc > 0. ? -b + sqrt(disc) : 0.;
  t += fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * .02;   // jitter: no banding in the glow
  vec2 h = vec2(1e9, 0.);
  bool hit = false;
  if (disc > 0.){
    for (int i = 0; i < 120; i++){
      vec3 p = ro + rd * t;
      h = map(p);
      gmin = min(gmin, core(p));
      float ratio = h.x / (pix * t);
      if (ratio < bestR){ bestR = ratio; bestT = t; }
      if (h.x < .0007 * t){ hit = true; break; }
      if (t > tEnd) break;
      t += h.x * .8;
    }
  }
  // coverage of this pixel by the sculpture: 1 on a hit, fading over ~1.5px outside the silhouette
  float cover = hit ? 1. : 1. - smoothstep(0., 1.5, bestR);
  if (cover > 0.){
    float ts = hit ? t : bestT;
    vec3 p = ro + rd * ts;
    float id = hit ? h.y : map(p).y;
    col = shade(p, id, rd);
    alpha = cover;
  }
  if (cover < 1.){
    // soft contact shadow on an invisible floor under the sculpture (behind the object's edge pixels)
    float fy = -1.2;
    if (rd.y < 0.){
      float tf = (fy - ro.y) / rd.y;
      vec3 pf = ro + rd * tf;
      float d = map(pf + vec3(0., .02, 0.)).x;
      float sh = exp(-d * 3.2) * .34 * smoothstep(3.5, 1.2, length(pf.xz));
      alpha += sh * (1. - cover);          // shadow is black: adds alpha, no colour (premultiplied)
    }
  }
  vec3 lime = vec3(.6, 1., .05);
  float glow = (exp(-max(gmin, 0.) * 40.) * .32 + exp(-max(gmin, 0.) * 140.) * .7) * smoothstep(.25, .04, uSep);
  vec3 gl = lime * glow * (.9 + .15 * sin(uTime * 1.3));
  // premultiplied output: object colour is weighted by its coverage; glow is additive light
  vec3 outc = toSRGB(aces(col + gl)) * cover + toSRGB(aces(gl)) * (1. - cover);
  alpha = clamp(alpha + dot(gl, vec3(.3)) * (1. - cover), 0., 1.);
  gl_FragColor = vec4(outc, alpha);
}`;

export default {
  name: 'hero-sculpt',
  init(canvas) {
    const r = createRenderer(canvas, FRAG, { alpha: true });
    if (!r) { fallback(canvas); return; }

    const g = blockGeom(BLOCK);
    // slot line in logo coords: normal pointing to the upper piece, offset, half thickness
    const dx = g.slot.x1 - g.slot.x0, dy = g.slot.y1 - g.slot.y0, len = Math.hypot(dx, dy);
    const n = [dy / len, -dx / len];
    const off = n[0] * g.slot.x0 + n[1] * g.slot.y0;
    const geo = {
      uTop: [BLOCK.wT, 0, BLOCK.hT], uBot: [BLOCK.wB, BLOCK.H - BLOCK.hB, BLOCK.H],
      uSlot: [n[0], n[1], off, BLOCK.t / 2], uCenter: [BLOCK.wB / 2 + .02, BLOCK.H / 2],
    };

    /* Render at 2x the CSS size (the browser's downscale = 4-sample supersampling), or the screen's own pixel
       density if that is higher (up to 3x). Slow GPUs step down, but never below one pixel per CSS pixel: past
       that the frame rate drops instead, because a pixelated logo looks worse than a slower one. */
    const dpr = window.devicePixelRatio || 1;
    const MAX_SCALE = clamp(dpr, 2, 3), MIN_SCALE = 1;
    let scale = Math.min(2, MAX_SCALE), w = 0, h = 0, stop = null;
    let fit = { zoom: 1, shift: .1 };
    const sm = { x: 0, y: 0, scroll: 0 };
    const born = performance.now() / 1000;
    let avg = 1 / 60, judged = 0, interval = 0, lastDraw = 0, ceiling = MAX_SCALE;

    function size() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.max(2, Math.round(w * scale)); canvas.height = Math.max(2, Math.round(h * scale));
      fit = layout(rect);
      frame(performance.now() / 1000, 0);
    }

    /* Fit the sculpture into the free band between the nav and the hero copy. The camera frames ~2.63 units of
       height at the object, and the mark is 1.69 units tall (~64% of the frame at zoom 1). */
    function layout(rect) {
      if (!(w > 0 && h > 0)) return { zoom: 1, shift: .1 };          // not laid out yet (hidden tab)
      const copy = canvas.parentElement?.querySelector('.hero__copy > *');
      const top = Math.min(90, h * .12);
      const bottom = copy ? copy.getBoundingClientRect().top - rect.top - 24 : h * .55;
      const band = Math.max(120, bottom - top);
      const objH = Math.min(band * .86, w * 1.05);                 // keep it inside narrow screens too
      return { zoom: objH / (h * .64), shift: .5 - (top + band / 2) / h };
    }

    function frame(t, dt) {
      if (interval && t - lastDraw < interval) return;                               // weak GPU: fewer frames
      lastDraw = t;
      const age = t - born;
      const scroll = clamp(window.scrollY / Math.max(1, innerHeight), 0, 1.2);
      const ease = p => 1 - Math.pow(1 - clamp(p, 0, 1), 4);
      const assemble = reducedMotion() ? 0 : (1 - ease((age - .2) / 1.6)) * .55;     // pieces slide together on load (wall clock)
      const k = 1 - Math.exp(-Math.min(dt || .016, .1) * 4);
      sm.scroll = lerp(sm.scroll, scroll, k);
      let sep = .035 + assemble + sm.scroll * .13;
      sm.x = lerp(sm.x, pointer.active ? pointer.x : 0, k * .7);
      sm.y = lerp(sm.y, pointer.active ? pointer.y : 0, k * .7);
      let yaw = Math.sin(t * .32) * .38 + sm.x * .7 - .28;
      let pitch = -.2 + Math.sin(t * .23) * .05 + sm.y * .2;
      const o = window.__btHero;                         // debug override: window.__btHero = { yaw, pitch, sep }
      if (o) { yaw = o.yaw ?? yaw; pitch = o.pitch ?? pitch; sep = o.sep ?? sep; }
      r.draw({
        uRes: [canvas.width, canvas.height], uTime: t, uRot: [yaw, pitch], uSep: sep,
        uZoom: fit.zoom, uShift: [0, fit.shift], ...geo,
      });
      adapt(t, age, dt);
    }

    /* Adaptive quality, judged on the average frame time over a second or more. The first seconds are ignored:
       page load, web fonts and the tiles compiling their shaders stall every phone briefly, and those stalls used
       to knock the sculpture down to a fraction of its resolution for good. Single long frames (a scroll hitch,
       an in-app browser pausing the page) are ignored too. */
    function adapt(t, age, dt) {
      if (age < 3 || interval || !dt || dt >= .1) return;
      avg += (dt - avg) * .05;
      if (t - judged < 1.2) return;
      if (avg > 1 / 40) {                                   // under ~40 fps
        judged = t;
        if (scale > MIN_SCALE) { scale = ceiling = Math.max(MIN_SCALE, scale * .8); size(); }   // never climbs back past this
        else interval = 1 / 30;
        avg = 1 / 60;
      } else if (avg < 1 / 55 && scale < ceiling && t - judged > 4) {   // smooth for a while: win pixels back
        judged = t;
        scale = Math.min(ceiling, scale / .8); size();
      }
    }

    size(); onResize(canvas, size);
    document.fonts?.ready.then(size);                     // the copy moves once the web fonts land
    canvas.__frame = frame;                              // debug: canvas.__frame(t, dt) forces a draw
    if (reducedMotion()) return;
    listenPointer();
    whenVisible(canvas, v => {
      if (v && !stop) stop = addTask(frame);
      else if (!v && stop) { stop(); stop = null; }
    }, '0px');
  },
};

function fallback(canvas) {
  const div = document.createElement('div');
  div.className = canvas.className + ' hero__fallback';
  div.innerHTML = logoSVG({ layout: 'mark' });
  canvas.replaceWith(div);
}
