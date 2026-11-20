// The calm glass B, drawn on the GPU as a real extruded block.
//
// Each half of the B is its outline extruded through the block's depth, and
// every pixel of it is lit by following the light through the glass. A ray
// from the eye reflects off the surface it meets and refracts into the block.
// Inside, it crosses to the back face or to a wall, where it either leaves
// toward the studio or is turned back by total internal reflection. Along the
// way the glass absorbs red and blue in proportion to the distance travelled,
// so it is clear where it is thin and bottle-green where the path is long.
//
// The front face is reeded: every reed is a shallow cylinder that bends what
// lies behind into a compressed strip. Every edge is a small polished chamfer.
// The diagonal cut is frosted, and a lime filament in the kerf lights it, so
// the cut glows and its light scatters through the volume of both halves.
//
// What the glass sees is the page itself: the paper behind and the B's own
// shadow on it, then a studio of soft lights, a white card and black flags
// beyond the paper's edge, placed the way a glass photographer would.
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

// The studio's lights, in the viewer's axes (right, down, away) and B units:
// centre, half width and height, edge softness, and colour times intensity.
const LIGHTS = [
  [[-3.7, .35, -1.4], [.75, 1.5], .25, [6, 5.85, 5.58]],
  [[2.3, .8, -3.2], [.10, 1.7], .05, [2.2, 2.2, 2.2]],
  [[3.2, -.4, 2.4], [.16, 2.4], .07, [2.85, 2.94, 3]],
  [[-1.6, -3.4, -1.2], [1.5, .15], .06, [2.2, 2.2, 2.2]],
  [[-1.25, -.3, 2.8], [.05, 2.4], .04, [2.6, 2.574, 2.47]],
  [[1.45, -.3, 2.8], [.04, 2.4], .03, [1.6, 1.584, 1.52]],
  [[-.1, -1.9, 3], [1.6, .08], .05, [2.4, 2.376, 2.304]],
].map(([at, extent, soft, colour]) => {
  // Each light's frame is fixed, so it is worked out once here.
  const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = unit(at.map(x => -x)), u = unit(cross([0, 1, 0], n)), v = cross(n, u);
  const vec = (k, a) => `vec${k}(${a.map(x => (+x.toFixed(5)).toString().replace(/^(-?)0\./, '$1.').replace(/^(-?\d+)$/, '$1.')).join(', ')})`;
  return `  c += ${vec(3, colour)} * panel(ro, rd, ${vec(3, at)}, ${vec(3, n)}, ${vec(3, u)}, ${vec(3, v)}, ${vec(2, extent)}, ${soft});`;
}).join('\n');

const fragment = `precision highp float;
uniform float kind, part, sway, glint, flute, front, back, pixel, recovery, pulse, lightAngle, intro, glow, haloPad;
uniform float size, lift, shift, time, fine;
uniform vec3 row1, row2, row3;
uniform vec2 filamentRange, centre, view;
uniform vec4 shadow, shockA, shockB;
uniform sampler2D groundMap, halo;
varying vec3 plate;
varying float side;

const float ETA = 1.52;
const float CHAMFER = .0105;
const float SLOPE = .27875, NORM = .96327;
// Linear light. Soda-lime glass absorbs red most and green least.
const vec3 ABSORB = vec3(.60, .19, .44);
const vec3 LIME = vec3(.40, .70, .045);
// Thin glass looks nearly clear and long paths turn deep bottle-green, a
// little faster than one straight pass would.
vec3 absorb(float L) { return exp(-ABSORB * L * (.55 + .45 * L)); }

float halfRound(vec2 p, float cx, float cy, float r) {
  return length(vec2(max(p.x - cx, 0.), p.y - cy)) - r;
}
float contour(vec2 p) {
  return max(-p.x, min(halfRound(p, .57, .43, .43), halfRound(p, .71, 1.2, .49)));
}
// Signed distance past this half's side of the cut.
float cutSide(vec2 p) {
  float line = (p.y + SLOPE * p.x) * NORM;
  return part < .5 ? line - .9125 * NORM : 1.0475 * NORM - line;
}
// Negative inside this half of the block, in plan.
float solid(vec2 p) { return max(contour(p), cutSide(p)); }
// The outward normal of the wall nearest p, and whether that wall is the cut.
vec2 wallNormal(vec2 p, out float cut) {
  float c = cutSide(p);
  float up = halfRound(p, .57, .43, .43), low = halfRound(p, .71, 1.2, .49);
  float rim = min(up, low);
  cut = step(max(-p.x, rim), c);
  if (cut > .5) return vec2(SLOPE, 1.) * NORM * (part < .5 ? 1. : -1.);
  if (-p.x > rim) return vec2(-1., 0.);
  vec2 r = up < low ? vec2(max(p.x - .57, 0.), p.y - .43) : vec2(max(p.x - .71, 0.), p.y - 1.2);
  return r / max(length(r), 1e-5);
}
// Each reed is a shallow cylinder. Its slope runs from one shoulder to the
// other, and two neighbours meet in a sharp groove.
vec3 reedNormal(float x) {
  float s = (fract(x / flute) * 2. - 1.) * .78;
  return vec3(s, 0., sqrt(1. - s * s));
}
float ramp(float x, float a, float b) { return clamp((x - a) / (b - a), 0., 1.); }

// From the B's own axes to the viewer's: right, down, and away.
vec3 cam(vec3 v) { return vec3(dot(row1, v), dot(row2, v), dot(row3, v)); }
vec3 camAt(vec3 x) { return cam(vec3(x.x - .56, x.y - .845 + lift + shift, x.z)); }

// The page's own paper, as CSS paints it behind this layer.
vec3 paperAt(vec2 s) {
  vec2 uv = s / view;
  float t = length((uv - vec2(.36, .26)) / vec2(.64, .74)) * .7071;
  vec3 c = mix(vec3(.984, .976, .945), vec3(.937, .925, .886), clamp(t / .43, 0., 1.));
  c = mix(c, vec3(.867, .867, .824), clamp((t - .43) / .35, 0., 1.));
  c = mix(c, vec3(.784, .788, .737), clamp((t - .78) / .34, 0., 1.));
  float diag = uv.x * .899 + uv.y * .438 - lightAngle * .18;
  c = mix(c, vec3(1., .996, .953), smoothstep(.16, .26, diag) * (1. - smoothstep(.26, .45, diag)) * .24);
  // The B's shadow and cast light lie on it too.
  vec2 g = (s - shadow.xy) / shadow.zw;
  if (max(abs(g.x), abs(g.y)) < 1.) {
    vec4 ink = texture2D(groundMap, vec2(g.x, -g.y) * .5 + .5);
    c = c * (1. - ink.a) + ink.rgb;
  }
  return pow(c, vec3(2.2));
}

// A soft-edged rectangular light centred at 'at', facing the B along n,
// with u across it and v up it.
float panel(vec3 o, vec3 d, vec3 at, vec3 n, vec3 u, vec3 v, vec2 extent, float soft) {
  float facing = dot(d, n);
  if (facing > -.001) return 0.;
  float t = dot(at - o, n) / facing;
  if (t < 0.) return 0.;
  vec3 h = o + d * t - at;
  vec2 q = abs(vec2(dot(h, u), dot(h, v))) - extent;
  return 1. - smoothstep(-soft, soft, length(max(q, 0.)) + min(max(q.x, q.y), 0.));
}

// Everything around the B, seen from point o (viewer's axes) along d.
vec3 studio(vec3 o, vec3 d, float paperGain) {
  // A dim room, darker overhead. On the window side a broad white card
  // bounces light back; on the other stand black flags, as a glass
  // photographer would set them, so the edges read dark on one side and
  // bright on the other. The paper floor runs toward the viewer.
  vec3 c = mix(vec3(.15, .155, .145), vec3(.065, .07, .065), smoothstep(0., -.7, d.y));
  c = mix(c, vec3(.02, .024, .022), smoothstep(.45, .85, d.x) * smoothstep(.45, -.2, d.z));
  c = mix(c, vec3(.42, .41, .38), smoothstep(-.4, -.85, d.x) * smoothstep(-.75, -.2, d.y));
  c = mix(c, vec3(.52, .51, .47), smoothstep(.06, .6, d.y));
  if (d.z > .02) {
    // Behind the block, the page's own paper, lit in a pool. Past its edge
    // the card and the flags again, so every reed's shoulders read against
    // its bright middle.
    vec2 s = centre + size * (o.xy + d.xy * (2.4 - o.z) / d.z);
    vec2 wide = d.xy / d.z;
    float pool = 1. - smoothstep(.16, .74, length(wide * vec2(1., .8)));
    vec3 flag = mix(vec3(.05, .055, .05), vec3(.012, .014, .013), smoothstep(.5, 1., length(wide)));
    flag = mix(vec3(.36, .355, .33), flag, smoothstep(-.35, .15, wide.x));
    c = mix(c, flag, smoothstep(.3, .6, d.z));
    c = mix(c, paperAt(clamp(s, vec2(0.), view)) * paperGain, pool);
  }
  // The lights turn with the wheel and drift a little on their own.
  float a = lightAngle + glint * .35;
  float ca = cos(a), sa = sin(a);
  vec3 ro = vec3(ca * o.x + sa * o.z, o.y, -sa * o.x + ca * o.z);
  vec3 rd = vec3(ca * d.x + sa * d.z, d.y, -sa * d.x + ca * d.z);
  // A tall window on the left that every reed catches, a strip in front on
  // the right for the opposite slopes, a rim strip behind on the right for
  // the round walls, a bar overhead for the top edges, two backlights, and
  // a bar behind the top face.
${LIGHTS}
  // On arrival, a bright bar of light passes once across the glass.
  float sweep = sin(intro * 3.14159);
  if (sweep > .001) {
    vec3 at = vec3(-5.5 + 10. * intro, -.6, -2.6), n = normalize(-at), u = normalize(cross(vec3(0., 1., 0.), n));
    c += vec3(1., 1., .95) * 12. * sweep * panel(ro, rd, at, n, u, cross(n, u), vec2(.3, 3.2), .14);
  }
  return c;
}

// Whether a ray inside the glass can leave through a face with normal n.
bool escapes(vec3 T, vec3 n) { vec3 e = refract(T, -n, ETA); return dot(e, e) > .5; }

// Leaving the glass through face normal n, the colours part slightly.
// Near the critical angle the split grows without bound, so it is reined in
// there before it breaks into stray coloured lines.
vec3 leave(vec3 o, vec3 T, vec3 n) {
  vec3 g = refract(T, -n, ETA);
  float split = smoothstep(.04, .4, dot(g, n));
  vec3 r = refract(T, -n, ETA - .012 * split);
  vec3 b = refract(T, -n, ETA + .016 * split);
  if (dot(b, b) < .5) b = g;
  vec3 c = studio(o, cam(g), 1.);
  // Against a bright light the split would turn to saturated streaks, so
  // each colour may stray only a little from the unsplit one.
  return c + clamp(vec3(studio(o, cam(r), 1.).r, c.g, studio(o, cam(b), 1.).b) - c, -.07, .07);
}

// Slow pulses of light travel along the filament and through the cut.
float flow(float x) {
  return 1. + .15 * sin(x * 8.5 - time * 1.05) + .09 * sin(x * 3.7 + time * .61);
}

// The frosted cut scatters the filament's light, brightest across the
// filament's own depth and along its length.
vec3 satin(vec3 x) {
  float depth = exp(-pow((x.z - .0085) / .19, 2.));
  float along = smoothstep(filamentRange.x - .14, filamentRange.x + .1, x.x)
    * (1. - smoothstep(filamentRange.y - .1, filamentRange.y + .18, x.x));
  return LIME * (.9 + 1.3 * pulse) * glow * flow(x.x) * (.32 + .68 * depth) * (.28 + .72 * along) + vec3(.012, .02, .008);
}

// Past the critical angle at the back face, a ray is past it at the front
// too, so it is piped between them and keeps its course in plan until it
// meets a wall. This long path is what makes thick glass green at its edges.
vec3 pipe(vec3 x, vec3 T) {
  vec2 dir = T.xy;
  float lo = 0., hi = 3.6 / max(length(dir), .3);
  for (int i = 0; i < 11; i++) {
    float m = (lo + hi) * .5;
    if (solid(x.xy + dir * m) < 0.) lo = m; else hi = m;
  }
  vec3 y = vec3(x.xy + dir * lo, (front + back) * .5);
  float cut;
  vec2 nw = wallNormal(y.xy, cut);
  vec3 e = refract(vec3(dir, -abs(T.z)), -vec3(nw, 0.), ETA);
  vec3 seen = cut > .5 ? satin(y) * .25 : dot(e, e) > .5 ? studio(camAt(y), cam(e), 1.) : vec3(.004, .016, .01);
  return seen * absorb(lo);
}

// A little light is turned back at the back face. If that ray reaches the
// glowing cut before the front face, the cut shows as a faint mirror image
// set deeper in the block, sliding against the real one as the B turns.
vec3 echo(vec3 x, vec3 T) {
  vec3 R = vec3(T.xy, -T.z);
  float line = (x.y + SLOPE * x.x) * NORM;
  float rate = (R.y + SLOPE * R.x) * NORM;
  float t = ((part < .5 ? .9125 : 1.0475) * NORM - line) / (abs(rate) < 1e-4 ? 1e-4 : rate);
  if (t <= 0. || t > (front - x.z) / max(R.z, .02)) return vec3(0.);
  vec3 y = x + R * t;
  if (contour(y.xy) > 0.) return vec3(0.);
  return satin(y) * absorb(t) * .11;
}

// A ray leaving through the back face, or through its chamfer near the edge.
vec3 leaveBack(vec3 x, vec3 T) {
  float cut;
  vec2 nw = wallNormal(x.xy, cut);
  float edge = 1. - smoothstep(CHAMFER * .3, CHAMFER, max(-solid(x.xy), 0.));
  vec3 n = normalize(vec3(nw * edge, -1.));
  if (escapes(T, n)) return leave(camAt(x), T, n) + echo(x, T);
  return pipe(x, reflect(T, n));
}

// The light reaching the eye along a ray inside the glass from o. One bounce
// off a wall is followed. 'travelled' returns the length of the first leg.
vec3 transmit(vec3 o, vec3 T, out float travelled) {
  float L = (back - o.z) / min(T.z, -.02);
  vec3 radiance;
  float extra = 0.;
  if (solid(o.xy + T.xy * L) > 0.) {
    // The ray meets a wall first. The block is convex, so it crosses once.
    float lo = 0., hi = L;
    for (int i = 0; i < 10; i++) {
      float m = (lo + hi) * .5;
      if (solid(o.xy + T.xy * m) < 0.) lo = m; else hi = m;
    }
    L = lo;
    vec3 x = o + T * L;
    float cut;
    vec2 nw = wallNormal(x.xy, cut);
    vec3 n = vec3(nw, 0.);
    if (cut > .5) radiance = satin(x);
    else if (escapes(T, n)) radiance = leave(camAt(x), T, n);
    else {
      vec3 T2 = reflect(T, n);
      extra = (back - x.z) / min(T2.z, -.02);
      radiance = leaveBack(x + T2 * extra, T2);
    }
  } else radiance = leaveBack(o + T * L, T);
  travelled = L;
  return radiance * absorb(L + extra);
}

// Light from the cut scattered toward the eye along the ray's first leg:
// the integral of exp(-k * distance from the kerf).
float scatter(vec3 o, vec3 T, float L, float k) {
  float line = (o.y + SLOPE * o.x) * NORM;
  float d0 = abs(line - .98 * NORM);
  float rate = (T.y + SLOPE * T.x) * NORM * (part < .5 ? -1. : 1.);
  float e = k * rate * L;
  float along = abs(e) < .001 ? L : (1. - exp(-e)) / (k * rate);
  float mid = o.x + T.x * L * .5;
  float span = smoothstep(filamentRange.x - .16, filamentRange.x + .12, mid)
    * (1. - smoothstep(filamentRange.y - .12, filamentRange.y + .22, mid));
  return exp(-k * d0) * along * (.3 + .7 * span) * flow(mid);
}

// A touch sends a ring of compression through the glass that bends the
// light passing through it.
vec2 shockwave(vec2 p, vec4 s) {
  if (s.w <= 0. || s.z > 2.2) return vec2(0.);
  vec2 d = p - s.xy;
  float r = length(d);
  float x = (r - s.z * .95) / (.035 + s.z * .05);
  return d / max(r, 1e-4) * x * exp(-x * x) * s.w * exp(-s.z * 1.7) * .62;
}
// Where the ring is, stressed glass splits light into faint colours.
float stress(vec2 p, vec4 s) {
  if (s.w <= 0. || s.z > 2.2) return 0.;
  float x = (length(p - s.xy) - s.z * .95) / (.035 + s.z * .05);
  return exp(-x * x) * s.w * exp(-s.z * 1.7);
}

vec3 display(vec3 c) {
  // A soft shoulder keeps highlights from clipping to flat white.
  c = mix(c, 1. - .22 * exp(-(c - .78) / .22), step(.78, c));
  return pow(clamp(c, 0., 1.), vec3(1. / 2.2));
}

// The reeded face's normal at p. Its rim turns down into the chamfer, and
// a touch's shockwave bends it as it passes.
vec3 faceNormal(vec2 p, vec2 nw) {
  float edge = 1. - smoothstep(CHAMFER * .3, CHAMFER, -solid(p));
  vec3 n = normalize(mix(reedNormal(p.x), normalize(vec3(nw, 1.)), edge));
  n.xy += shockwave(p, shockA) + shockwave(p, shockB);
  return normalize(n);
}

// One ray from the eye meeting the glass at o, with surface normal n.
vec3 shade(vec3 o, vec3 n, float isFace) {
  vec3 V = normalize(row3);
  float fresnel = .04 + .96 * pow(1. - max(-dot(V, n), 0.), 5.);
  // In mirror views the paper is seen at a glancing angle and darkens.
  vec3 reflected = studio(camAt(o), cam(reflect(V, n)), .62);
  vec3 T = refract(V, n, 1. / ETA);
  float L;
  vec3 through = transmit(o, T, L);
  // Light entering a wall has crossed more glass on its way than one leg shows.
  if (isFace < .5) through *= exp(-ABSORB * .6);
  vec3 colour = mix(through, reflected, fresnel);
  // The filament's light, scattered in the body of the glass.
  return colour + LIME * glow * (.85 * scatter(o, T, L, 7.) + .16 * scatter(o, T, L, 1.8));
}

void main() {
  vec2 p = plate.xy;
  if (kind < 1.5) {
    float cut;
    vec2 nw = wallNormal(p, cut);
    float cutDist = abs((p.y + SLOPE * p.x) * NORM - .98 * NORM);
    vec3 colour;
    float edgeLit;
    if (kind < .5) {
      // A polished wall, rounding into chamfers at the front and back.
      float ef = 1. - smoothstep(CHAMFER * .3, CHAMFER, front - plate.z);
      float eb = 1. - smoothstep(CHAMFER * .3, CHAMFER, plate.z - back);
      vec3 n = normalize(vec3(nw, ef - eb));
      edgeLit = max(ef, eb);
      if (cut > .5 && edgeLit < .5) {
        // The frosted cut: a satin glow with only a dim, broad sheen.
        vec3 V = normalize(row3);
        float fresnel = .04 + .96 * pow(1. - max(-dot(V, n), 0.), 5.);
        // Its ground surface sparkles faintly.
        float grain = fract(sin(dot(floor(plate.xz * 1400.), vec2(12.9898, 78.233))) * 43758.5453);
        colour = satin(plate) * (.93 + .14 * grain) + studio(camAt(plate), cam(reflect(V, n)), .62) * fresnel * .25;
      } else colour = shade(vec3(p - nw * .0004, plate.z), n, 0.);
    } else {
      // Each reed bends a wide view into a few pixels, so the face is
      // sampled three times across each pixel where the GPU can afford it.
      colour = shade(vec3(p, front), faceNormal(p, nw), 1.);
      if (fine > .5) {
        float dx = pixel * .34;
        colour = (colour + shade(vec3(p.x - dx, p.y, front), faceNormal(vec2(p.x - dx, p.y), nw), 1.)
          + shade(vec3(p.x + dx, p.y, front), faceNormal(vec2(p.x + dx, p.y), nw), 1.)) / 3.;
      }
      float inside = -solid(p);
      edgeLit = 1. - smoothstep(CHAMFER * .3, CHAMFER, inside);
      // Filament light piped through the block leaks out just inside the
      // rim, so the face is edge-lit, most of all near the cut.
      float rim = exp(-max(inside - CHAMFER, 0.) * 38.) * (1. - edgeLit);
      colour += LIME * glow * flow(p.x) * rim * (.035 + .26 * exp(-cutDist * 2.6));
      float ring = stress(p, shockA) + stress(p, shockB);
      colour += (.5 + .5 * cos(cutDist * 30. + vec3(0., 2.1, 4.2))) * vec3(.10, .13, .06) * ring;
    }
    // Light trapped in the block escapes along its polished edges.
    colour += LIME * edgeLit * glow * flow(p.x) * (.05 + .42 * exp(-cutDist * 2.8));
    // The walls beside the cut carry its light out through their polish.
    if (kind < .5 && cut < .5) colour += LIME * glow * flow(p.x) * (.16 * exp(-cutDist * 6.) + .025 * exp(-cutDist * 1.6));
    // As the print resolves back into glass, the cut's light travels a
    // short distance into the reeds and dies there.
    float travel = cutDist - (.05 + .46 * recovery);
    colour += LIME * 1.4 * (1. - recovery) * exp(-travel * travel * 420.);
    gl_FragColor = vec4(display(colour), 1.);
  } else if (kind < 2.5) {
    float z = ramp(plate.z, -.1445, .1615);
    float wakePulse = (1. - intro) * .45;
    vec3 bar = mix(vec3(.62, .80, .16), vec3(.96, 1., .76), clamp(z * z + .38 * pulse + wakePulse + (flow(p.x) - 1.) * .8, 0., 1.));
    gl_FragColor = vec4(bar, 1.);
  } else if (kind > 4.5) {
    // The halo is light, so it adds to the paper rather than covering it.
    vec2 huv = (p + haloPad) / (vec2(1.21, 1.69) + 2. * haloPad);
    vec4 light = texture2D(halo, vec2(huv.x, 1. - huv.y));
    vec2 rim = min(huv, 1. - huv);
    float fade = smoothstep(0., .06, min(rim.x, rim.y));
    float a = light.a * fade * (.62 * glow + .24 * pulse);
    gl_FragColor = vec4(light.rgb * a, a * .82);
  } else if (kind > 3.5) {
    vec2 guv = vec2(p.x, -p.y) * .5 + .5;
    float shift = (sway * .0042 + lightAngle * .0075) * (1. + .55 * pulse);
    vec4 base = texture2D(groundMap, guv);
    vec4 rTap = texture2D(groundMap, guv + vec2(shift, 0.));
    vec4 bTap = texture2D(groundMap, guv - vec2(shift, 0.));
    vec3 inkRgb = vec3(mix(base.r, rTap.r, .52), base.g, mix(base.b, bTap.b, .52));
    float alpha = base.a;
    // Live lime caustic focal surge & sweeping studio key-light shimmer on the paper.
    vec2 cp = vec2((guv.x - (.555 - lightAngle * .09)) * 2.1, (guv.y - .535) * 4.2);
    float causticBand = exp(-dot(cp, cp) * 2.5) * smoothstep(.08, .48, alpha);
    float surge = pulse * .38 + (1. - recovery) * .30 + (1. - intro) * .22 + abs(lightAngle) * .24;
    inkRgb += vec3(.16, .25, .025) * causticBand * surge;
    alpha = min(1., alpha + causticBand * surge * .14);
    gl_FragColor = vec4(inkRgb * alpha, alpha);
  } else {
    // The filament's glow, with an incandescent near-white core.
    float d = abs(side);
    float cap = smoothstep(filamentRange.x - .028, filamentRange.x + .008, p.x)
      * (1. - smoothstep(filamentRange.y - .008, filamentRange.y + .028, p.x));
    float wakeBoost = (1. - intro) * .28;
    float bloom = (.29 + .18 * pulse + wakeBoost) * glow * flow(p.x) * exp(-d * d * (4.4 - 1.2 * pulse)) * cap;
    float spread = (.12 + .10 * pulse + wakeBoost * .5) * glow * exp(-d * d * 18.) * cap;
    float core = (1. - smoothstep(.055, .175 + .045 * pulse, d)) * cap * cap;
    float alpha = min(1., max(bloom + spread, core));
    vec3 colour = mix(vec3(178., 224., 50.) / 255., vec3(249., 255., 224.) / 255., core);
    gl_FragColor = vec4(colour * alpha, alpha);
  }
}`;

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

export function createGlass(stage, { outlines, flute, filament, back, front, groundMap, halo, haloPad = 0 }) {
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
  // Software rasterisers trace the glass once per CSS pixel.
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = !!info && /swiftshader|llvmpipe|software/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));

  const halves = outlines.map(points => prism(points, back, front));
  const bars = filamentBars(filament, .1615, -.1445);
  const card = [-1, -1, 0, 0, 1, -1, 0, 0, 1, 1, 0, 0, -1, -1, 0, 0, 1, 1, 0, 0, -1, 1, 0, 0];
  // The halo lies in the block's middle plane, around the whole B.
  const [l, t, r, b] = [-haloPad, -haloPad, 1.21 + haloPad, 1.69 + haloPad];
  const glowCard = [l, t, 0, 0, r, t, 0, 0, r, b, 0, 0, l, t, 0, 0, r, b, 0, 0, l, b, 0, 0];
  const all = [...halves.flatMap(h => h.data), ...bars.data, ...card, ...glowCard];
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
  const groundTexture = texture(gl, groundMap);
  const haloTexture = halo ? texture(gl, halo) : null;
  gl.uniform1f(u('flute'), flute);
  gl.uniform1f(u('front'), front);
  gl.uniform1f(u('back'), back);
  gl.uniform2f(u('filamentRange'), filament[0][0], filament[1][0]);
  gl.uniform1f(u('haloPad'), haloPad);
  [['groundMap', 3], ['halo', 4]].forEach(([name, unit]) => gl.uniform1i(u(name), unit));
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, groundTexture);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, haloTexture);
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
      ratio = software ? Math.min(1, pixelRatio) : pixelRatio;
      const [left, top, right, bottom] = reach;
      box = [Math.floor(left) - 4, Math.floor(top) - 4, Math.ceil(right - left) + 8, Math.ceil(bottom - top) + 8];
      Object.assign(canvas.style, {
        inset: 'auto', left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
      });
      canvas.width = Math.max(1, Math.round(box[2] * ratio));
      canvas.height = Math.max(1, Math.round(box[3] * ratio));
    },
    render({ rows, centre, size, view, lift, shift, glint, sway, ground, recovery, pulse = 0,
      lightAngle = 0, intro = 1, glow = 1, time = 0, fine = true, shocks = [[0, 0, 9, 0], [0, 0, 9, 0]] }) {
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
      gl.uniform2f(u('view'), ...view);
      gl.uniform1f(u('size'), size);
      gl.uniform1f(u('lift'), lift);
      gl.uniform1f(u('glint'), glint);
      gl.uniform1f(u('sway'), sway);
      gl.uniform1f(u('recovery'), recovery);
      gl.uniform1f(u('pulse'), pulse);
      gl.uniform1f(u('lightAngle'), lightAngle);
      gl.uniform1f(u('intro'), intro);
      gl.uniform1f(u('glow'), glow);
      gl.uniform1f(u('time'), time);
      gl.uniform1f(u('fine'), fine && !software ? 1 : 0);
      gl.uniform4f(u('shockA'), ...shocks[0]);
      gl.uniform4f(u('shockB'), ...shocks[1]);
      gl.uniform1f(u('pixel'), 1 / (size * ratio));
      gl.uniform4f(u('shadow'), ...ground);

      // The ground goes down first, blended and outside the depth test.
      const groundFirst = halves.reduce((n, half) => n + half.sideCount + half.faceCount, 0) + bars.barCount + bars.glowCount;
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.uniform1f(u('ground'), 1);
      gl.uniform1f(u('kind'), 4);
      gl.drawArrays(gl.TRIANGLES, groundFirst, 6);
      gl.uniform1f(u('ground'), 0);
      // Then the halo, which the glass drawn over it hides where it stands.
      if (haloTexture) {
        gl.uniform1f(u('kind'), 5);
        gl.drawArrays(gl.TRIANGLES, groundFirst + 6, 6);
      }
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      let first = 0;
      halves.forEach((half, part) => {
        gl.uniform1f(u('part'), part);
        gl.uniform1f(u('shift'), shift[part]);
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
