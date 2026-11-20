// Orthographic ray casting of the two wet black-oil solids, dynamic kerf
// bridges, and Plateau-Rayleigh pendant drips. The camera basis matches the
// glass renderer in the same logo units, and every cyclic term is strictly
// periodic over 4 seconds so the baked fallback loops seamlessly.
import { createRenderer, GLSL } from './gl/gl.js';
import { TEAR, tearRows } from './negative.js';

const fragment = GLSL.head + GLSL.tone + TEAR + `
uniform vec2 resolution, focus, view, vel;
uniform vec3 rightAxis, downAxis, screen;
uniform vec4 tear, rippleA, rippleB;
uniform float age, lift, separation, pulse, lightAngle;

const vec3 centre = vec3(.56, .845, 0.);
const vec3 lime = vec3(.56, .97, .04);
const vec3 filA = vec3(.085, .956, 0.);
const vec3 filB = vec3(.885, .733, 0.);
const float OMEGA = 1.5707963268; // 2*pi / 4s exact loop period

float weld(float a, float b, float r) {
  float h = max(r - abs(a - b), 0.) / r;
  return min(a, b) - h * h * r * .25;
}

// C2-continuous cubic smooth maximum: rounds corners and bevels with zero
// curvature seam, matching the surface tension of heavy poured black oil.
float smax3(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.) / k;
  return max(a, b) + h * h * h * k * .1666667;
}

float halfRound(vec2 p, float cx, float cy, float r) {
  return length(vec2(max(p.x - cx, 0.), p.y - cy)) - r;
}
float contour(vec2 p) {
  return smax3(-p.x, min(halfRound(p, .57, .43, .43), halfRound(p, .71, 1.20, .49)), .038);
}

// Viscous black-oil coating draping the split B monolith.
// Long laminar vertical oil curtains creep downward under gravity, pooling into
// scalloped meniscus beads along the upper kerf lip and bottom baseline while
// wrapping smoothly over the top dome and curved right barrels.
float solid(vec3 p, float border, float line) {
  float cutWall = .065 + separation - abs(line);
  float wt = OMEGA * age;

  // Smooth interior taper keeps perimeter bevels pristine and liquid-smooth.
  float edgeQuiet = smoothstep(-.01, -.16, border) * smoothstep(-.01, -.12, cutWall);

  // Heavy pooling bands where viscous oil accumulates along dripping lips.
  float upperKerfPool = exp(-max(-line - .070, 0.) * 6.4) * step(line, 0.)
                      * smoothstep(.02, .16, p.x) * (1. - .30 * smoothstep(.58, .96, p.x));
  float bottomPool = smoothstep(1.32, 1.67, p.y) * smoothstep(.01, .14, p.x);
  // Subtle poured-oil crown rounding the top shelf of the upper B.
  float topDome = .015 * exp(-max(p.y, 0.) * 8.2) * smoothstep(.02, .22, p.x) * smoothstep(-.01, -.11, border);

  // Long, sweeping vertical liquid curtains (anisotropically stretched vertically
  // so studio softboxes reflect as unbroken liquid-silver silk ribbons).
  float swayX = .062 * sin(p.y * 2.10 - wt) + .026 * cos(p.y * 4.2 - 2. * wt + p.x * 2.1);
  float curtain = .0092 * sin((p.x + swayX) * 7.6 + .52 * p.y - wt)
                + .0038 * cos((p.x - swayX * .7) * 14.2 - 1.15 * p.y + wt);

  // Slow downward-moving peristaltic oil swells feeding directly into the hero drip roots.
  float mx = .022 * sin(p.y * 3.0 + .5);
  float r1 = exp(-pow((p.x - .445 - mx) / .118, 2.)) * (.60 + .40 * sin(p.y * 3.3 - wt - .7));
  float r2 = exp(-pow((p.x - .865 + mx * .7) / .125, 2.)) * (.60 + .40 * sin(p.y * 3.1 - wt + 1.5));
  float r3 = exp(-pow((p.x - .175 - mx * .5) / .095, 2.)) * (.60 + .40 * sin(p.y * 3.5 - wt + .4));
  float rivulet = .0102 * (r1 + .85 * r2 + .72 * r3) * smoothstep(.06, .34, p.y);

  // Glossy viscous drapes wrapping smoothly onto the curved outer right bowls.
  float sideMask = smoothstep(.46, .88, p.x) * smoothstep(.07, .22, abs(line));
  float sideDrape = (.0056 * sin(p.y * 6.0 - wt + p.z * 5.2)
                   + .0022 * cos(p.y * 12.0 - 2. * wt - p.z * 7.8)) * sideMask;

  // Heavy liquid-tension scalloped pooling overhang along the bottom rim & upper kerf lip.
  float scallop = .68 + .32 * sin(p.x * 13.8 - 1.1) + .14 * cos(p.x * 7.2 - wt);
  float lipSwell = .024 * bottomPool * scallop
                 + .015 * upperKerfPool * (.74 + .26 * cos(p.x * 10.5 - wt));
  float outline = smax3(border - sideDrape, cutWall, .036) - lipSwell * .48;

  float crown = .048 * cos(2.30 * (p.x - .49)) * cos(2.40 * (p.y - .84));
  float slump = .023 * bottomPool + .015 * upperKerfPool + topDome;
  float frontMask = smoothstep(-.12, .22, p.z);
  float thickness = .266 + crown + slump + (curtain + rivulet) * edgeQuiet * (.22 + .78 * frontMask);

  // C2-continuous poured-oil bevel: slightly fuller along heavy pooling lips.
  float k = .096 + .022 * max(bottomPool, upperKerfPool);
  return smax3(outline, abs(p.z) - thickness, k);
}

// Plateau-Rayleigh viscous pendant drop with beads-on-a-string capillary necking,
// elastic snap-back recoil, oscillating detached pearl, and trailing micro-satellite.
float viscousDrop(vec3 p, vec3 root, float radius, float reach, float phase, float doRelease, vec2 sway) {
  vec3 q = p - root;
  float u = fract(age * .25 + phase);
  float gY = max(q.y, 0.);
  float lat = clamp(gY / max(reach, .08), 0., 1.8);
  vec2 grav = downAxis.xz * (q.y / max(downAxis.y, .25));
  q.xz -= grav + sway * (lat * lat) + vec2(.005 * sin(3.4 * lat + phase * 6.28), .006 * cos(2.8 * lat)) * min(lat, 1.);
  float radial = length(q.xz);

  if (doRelease < .5) {
    // Plump, slow-breathing pendant tear with real concave viscous neck.
    float cyc = u * 6.2831853;
    float growth = .70 + .28 * sin(cyc) + .05 * sin(2. * cyc - .6);
    float ext = reach * growth * (1. + .08 * pulse);
    float v = clamp(q.y / max(ext, .01), 0., 1.);
    float waist = exp(-pow((v - .62) / .27, 2.));
    float neckR = radius * (.27 + .90 * exp(-v * 4.5) + .32 * exp(-(1. - v) * 5.2)) * (1. - .24 * waist * growth);
    float stalk = length(vec2(radial, q.y - clamp(q.y, -.02, ext))) - neckR;
    float bulbR = radius * (.86 + .18 * growth);
    float pear = 1. + .13 * clamp((q.y - ext) / max(bulbR, .01), -1., 1.);
    float bulb = (length(vec3(q.x, (q.y - ext) * .84, q.z)) - bulbR * pear) * .84;
    return weld(stalk, bulb, radius * .54);
  }

  // Full 5-stage viscous detachment lifecycle (seamless at u = 0 and u = 1).
  const float uSnap = .58;
  float ySnap = radius * .48 + reach * (1. + .07 * pulse);

  if (u < uSnap) {
    float s = u / uSnap;
    float swell = smoothstep(0., .42, s);
    float stretch = pow(s, 1.85);
    float dropY = radius * .48 + reach * (.14 * swell + .86 * stretch) * (1. + .07 * pulse);
    float pinch = smoothstep(.46, 1., s);
    float pinch2 = pinch * pinch;

    float v = clamp(q.y / max(dropY, .01), 0., 1.);
    // Double-pinch capillary waist with a tiny proto-satellite bead forming right before break.
    float waistLo = exp(-pow((v - .73) / .17, 2.));
    float waistHi = exp(-pow((v - .44) / .19, 2.));
    float protoSat = smoothstep(.65, 1., s) * radius * .14 * exp(-pow((v - .60) / .095, 2.));
    float baseNeck = radius * (.28 + .94 * exp(-v * 4.6) + .36 * exp(-(1. - v) * 5.5));
    float neckR = max(.0042, baseNeck * (1. - .82 * pinch2 * max(waistLo, .72 * waistHi))
                                      * (1. - .20 * pinch * smoothstep(.22, .85, v))
                             + protoSat);
    float stalk = length(vec2(radial, q.y - clamp(q.y, -.02, dropY))) - neckR;

    float bulbR = radius * (.75 + .30 * swell) * (1. - .04 * pinch);
    float elong = 1.12 + .24 * stretch;
    float pear = 1. + .14 * clamp((q.y - dropY) / max(bulbR, .01), -1., 1.);
    float bulb = (length(vec3(q.x, (q.y - dropY) / elong, q.z)) - bulbR * pear) / elong;
    return weld(stalk, bulb, radius * (.55 - .28 * pinch2));
  } else {
    float dt = (u - uSnap) * 4.0;
    float post = (u - uSnap) / (1. - uSnap);
    float v0 = reach * .72;

    // 1. Severed parent thread snapping elastically back into the lip, then refilling to match u=0.
    float stump0 = ySnap * .52;
    float snapEnv = exp(-6.6 * dt);
    float refill = smoothstep(.26, 1., post);
    float stumpY = max(.014, mix(radius * .48 * refill, stump0, exp(-8.0 * dt))
                             + radius * .24 * snapEnv * sin(14.5 * dt));
    float v = clamp(q.y / max(stumpY, .01), 0., 1.);
    float stumpNeck = max(.005, radius * (.24 + .88 * exp(-v * 4.3)) * (.55 + .45 * refill));
    float stalk = length(vec2(radial, q.y - clamp(q.y, -.02, stumpY))) - stumpNeck;
    float tipR = radius * (.26 + .49 * refill + .12 * snapEnv);
    float tip = length(vec3(q.x, (q.y - stumpY) * .90, q.z)) - tipR;
    float parent = weld(stalk, tip, radius * (.24 + .32 * refill));

    // 2. Detached hero pearl falling with damped quadrupole capillary oscillation (prolate <-> oblate).
    float fallY = ySnap + v0 * dt + .5 * 2.10 * dt * dt;
    float osc = .26 * exp(-4.5 * dt) * cos(16.2 * dt);
    float sy = 1. + osc;
    float sxz = inversesqrt(max(sy, .55));
    float dropR = radius * 1.02;
    vec3 fd = vec3(q.x / sxz, (q.y - fallY) / sy, q.z / sxz);
    float tailLift = exp(-dt * 15.) * max(0., -(q.y - fallY)) * .24;
    float mainDrop = (length(fd) - dropR - tailLift * .25) * min(sxz, sy);

    // 3. Gleaming satellite micro-pearl emerging from the snapped proto-satellite bead.
    float satY = ySnap * .63 + v0 * .62 * dt + .5 * 1.68 * dt * dt;
    float satOsc = 1. + .20 * exp(-7.2 * dt) * cos(23. * dt);
    float satR = radius * (.20 + .16 * smoothstep(0., .06, dt)) * (1. - .12 * smoothstep(.55, 1.15, dt));
    float satDrop = length(vec3(q.x - .005 * sin(dt * 8. + phase * 9.), (q.y - satY) / satOsc, q.z)) * min(1., satOsc) - satR;

    float falling = min(mainDrop, satDrop);
    float snapWeld = radius * .22 * exp(-dt * 42.);
    return snapWeld > .001 ? weld(parent, falling, snapWeld) : min(parent, falling);
  }
}

// Sleek taut hyperbolic catenoid bridge of black oil spanning across the glowing kerf.
float kerfBridge(vec3 p, float x0, float z0, float baseR, float phase, vec2 sway) {
  float yCut = .98 - .27875 * x0;
  float halfGap = (.065 + separation) / .9633;
  float yTop = yCut - halfGap + .008;
  float yBot = yCut + halfGap - .008;
  float span = max(yBot - yTop, .04);
  float v = clamp((p.y - yTop) / span, 0., 1.);
  float mid = 2. * v - 1.;
  vec2 grav = downAxis.xz * ((p.y - yTop) / max(downAxis.y, .25));
  vec2 d = p.xz - vec2(x0, z0) - grav - sway * (1. - mid * mid) * .35;
  float breath = 1. - .20 * sin(OMEGA * age + phase) - separation * 4.5;
  float rWaist = max(.0072, baseR * .42 * clamp(breath, .64, 1.15));
  float rEnd = baseR * 1.65;
  float r = rWaist + (rEnd - rWaist) * (mid * mid);
  return length(vec2(length(d), p.y - clamp(p.y, yTop - .015, yBot + .015))) - r;
}

// Active kerf-crossing drip: swells into a glossy obsidian bead over the glowing lime
// filament, touches down to form a slender draining strand, and snaps back cleanly.
float kerfSpanDrip(vec3 p, float x0, float z0, float radius, float phase, vec2 sway) {
  float yCut = .98 - .27875 * x0;
  float halfGap = (.065 + separation) / .9633;
  float yTop = yCut - halfGap + .006;
  float yBot = yCut + halfGap - .006;
  float span = max(yBot - yTop, .05);

  float u = fract(age * .25 + phase);
  vec2 grav = downAxis.xz * ((p.y - yTop) / max(downAxis.y, .25));
  vec2 d = p.xz - vec2(x0, z0) - grav;
  float radial = length(d);

  // Lifecycle: 0..0.44 plump hanging bead | 0.44..0.72 sleek draining bridge | 0.72..1.0 snap & recoil
  float bridgeOn = smoothstep(.40, .48, u) * (1. - smoothstep(.68, .75, u));
  float thin = smoothstep(.48, .72, u);
  float v = clamp((p.y - yTop) / span, 0., 1.);
  float mid = 2. * v - 1.;

  float reachU = mix(.28 + .56 * smoothstep(0., .44, u),
                     .26 + .25 * exp(-(u - .72) * 14.) * cos((u - .72) * 58.),
                     step(.70, u));
  float hangLen = span * clamp(reachU, .18, .90) * (1. + .08 * pulse);
  float vh = clamp((p.y - yTop) / max(hangLen, .01), 0., 1.);
  float hangNeck = radius * (.26 + .86 * exp(-vh * 4.5));
  float stalk = length(vec2(radial, p.y - clamp(p.y, yTop - .015, yTop + hangLen))) - hangNeck;
  float bulbR = radius * (.72 + .34 * smoothstep(0., .42, u) * (1. - step(.70, u)));
  float bulb = length(vec3(d.x, (p.y - (yTop + hangLen)) * .86, d.y)) - bulbR;
  float hang = weld(stalk, bulb, radius * .50);

  float rWaist = max(.0055, radius * (.45 - .32 * thin));
  float rEnd = radius * (1.35 - .24 * thin);
  float rBr = rWaist + (rEnd - rWaist) * (mid * mid);
  float bridge = length(vec2(radial - sway.x * (1. - mid * mid) * .2, p.y - clamp(p.y, yTop - .015, yBot + .015))) - rBr;

  float catchAmp = smoothstep(.42, .52, u) * exp(-max(u - .62, 0.) * 5.2);
  float catchBead = length(vec3(d.x, (p.y - yBot) * 1.25, d.y)) - radius * (1.12 * catchAmp);

  float res = mix(hang, min(bridge, hang + .04), bridgeOn);
  if (catchAmp > .02) res = weld(res, catchBead, radius * .62);
  return res;
}

float surface(vec3 p) {
  float line = (p.y + .27875 * p.x - .98) * .9633;
  float border = contour(p.xy);
  float body = solid(p, border, line);

  vec2 sway = clamp(-vel * .014, vec2(-.045), vec2(.045));

  // Kerf bridges & crossing drips (asymmetrical scale and depth).
  if (abs(line) < .30 && p.z > -.22 && p.z < .40) {
    if (abs(p.x - .195) < .24)
      body = weld(body, kerfBridge(p, .195, .155, .023, .4, sway), .054);
    if (abs(p.x - .565) < .24)
      body = weld(body, kerfSpanDrip(p, .565, .172, .032, .28, sway), .058);
    if (abs(p.x - .795) < .22)
      body = weld(body, viscousDrop(p, vec3(.795, .682, .028), .024, .092, .74, 0., sway), .048);
  }

  // Bottom baseline & lower-bowl drips — clean sculptural spacing with zero accidental webbing.
  if (p.y > 1.24) {
    // 1. Hero center-left primary release + gleaming satellite bead (snaps ~t=2.00s).
    if (abs(p.x - .445) < .36)
      body = weld(body, viscousDrop(p, vec3(.445, 1.662, .148), .061, .36, .08, 1., sway), .088);
    // 2. Right-curve medium release + satellite (snaps ~t=0.68s).
    if (abs(p.x - .865) < .36)
      body = weld(body, viscousDrop(p, vec3(.865, 1.638, .115), .048, .31, .41, 1., sway), .076);
    // 3. Left-corner slender release (snaps ~t=3.36s).
    if (abs(p.x - .175) < .32)
      body = weld(body, viscousDrop(p, vec3(.175, 1.658, .128), .042, .27, .74, 1., sway), .072);
    // 4. Mid-right deeper underside pendant (peaks ~t=2.55s, rich 3D depth parallax).
    if (abs(p.x - .675) < .28 && p.z < .20)
      body = weld(body, viscousDrop(p, vec3(.675, 1.656, -.045), .039, .195, .62, 0., sway), .066);
    // 5. Outer lower-right bowl hanging tear cleanly separated along the sweeping curve.
    if (abs(p.x - 1.048) < .24 && p.y < 1.92)
      body = weld(body, viscousDrop(p, vec3(1.048, 1.525, .072), .031, .145, .20, 0., sway), .056);
  }
  return body;
}

float emitter(vec3 p) {
  float line = (p.y + .27875 * p.x - .98) * .9633;
  return max(max(contour(p.xy) + .046, abs(line) - .007), abs(p.z) - .17);
}

vec3 normal(vec3 p) {
  vec2 e = vec2(.0010, -.0010);
  return normalize(e.xyy * surface(p + e.xyy) + e.yyx * surface(p + e.yyx)
                 + e.yxy * surface(p + e.yxy) + e.xxx * surface(p + e.xxx));
}

// Energy-conserving, pixel-footprint-filtered studio scrim: stays razor-sharp at 4K
// retina while eliminating dotted bevel aliasing at mobile & baked-sheet resolutions.
float scrim(vec3 reflected, vec3 aim, vec2 extent, float feather, vec2 gradDir, float aa) {
  vec3 axis = normalize(aim);
  vec3 horizontal = normalize(cross(vec3(0., 1., 0.), axis));
  vec3 vertical = cross(axis, horizontal);
  float facing = dot(reflected, axis);
  vec2 uv = vec2(dot(reflected, horizontal), dot(reflected, vertical)) / max(facing, .01);
  float ef = feather + aa;
  vec2 d = abs(uv) - extent;
  float box = step(.01, facing) * (1. - smoothstep(-ef, ef, max(d.x, d.y)));
  float ramp = clamp(.66 + .56 * dot(uv / max(extent, vec2(.01)), gradDir), .18, 1.28);
  float conserve = extent.x / (extent.x + aa * .65);
  return box * ramp * conserve;
}

vec2 waveRipple(vec2 p, vec4 rip, out float amp) {
  amp = 0.;
  if (rip.w <= .001 || rip.z > 2.6) return vec2(0.);
  vec2 d = p - rip.xy;
  float r = length(d);
  float front = rip.z * .76;
  float env = exp(-pow(r - front, 2.) * 13.) * exp(-rip.z * 1.35) * rip.w;
  float w = (sin((r - front) * 34.) + .32 * sin((r - front) * 68. - .8)) * env;
  amp = w;
  return (d / max(r, .001)) * w;
}

// Restrained petrol/obsidian thin-film interference.
vec3 thinFilm(float ndv, float thickness) {
  vec3 phase = 6.2831853 * (2. * thickness * 1.48 * max(ndv, .14)) / vec3(650., 540., 450.);
  vec3 irid = .5 + .5 * cos(phase);
  return mix(vec3(.28, .48, .52), irid * vec3(.62, .96, .92), .76);
}

// Consolidated HDR negative-fill macro studio rig: broad, cleanly separated
// photographic softboxes sweep smoothly across curved bevels (zero zebra ridges
// or dotted aliasing) while high-HDR front strobes paint wet-jewel catchlights
// directly onto the plump bellies of every hanging drop and satellite pearl.
vec3 studioEnv(vec3 reflected, float broad, float aa) {
  vec3 room = vec3(.011, .0135, .0175) * (1.15 - .45 * reflected.y);
  float f = 1. + broad * 2.4;

  // 1. Pinpoint HDR overhead-front macro catchlight (jewel highlight on every drop & satellite).
  room += vec3(30.0, 31.5, 33.5) * scrim(reflected, vec3(-.35, -.47, .81), vec2(.062, .105), .030 * f, vec2(-.5, -.7), aa * .45);

  // 2. Hero overhead-left gradated softbox (sculpted liquid crescents & sweeping face ribbons).
  room += vec3(15.5, 16.5, 17.6) * scrim(reflected, vec3(-.55, -.48, .68), vec2(.18, .46), .058 * f, vec2(-.6, -.65), aa * .55);

  // 3. Tall architectural front-left softbox (continuous liquid-silver silk curtains down face).
  room += vec3(3.4, 3.65, 3.80) * scrim(reflected, vec3(-.48, -.06, .87), vec2(.16, .78), .095 * f, vec2(-.85, -.30), aa * .5);

  // 4. Clean left architectural rim scrim (one uninterrupted silky silver edge, zero dotted bevel).
  room += vec3(2.9, 3.18, 3.35) * scrim(reflected, vec3(-.90, -.04, .43), vec2(.14, .92), .072 * f, vec2(-.8, 0.), aa);

  // 5. Tight front-right secondary macro glint (dual-highlight jewel depth on drop bulbs).
  room += vec3(10.0, 10.6, 11.4) * scrim(reflected, vec3(.46, -.32, .83), vec2(.050, .13), .030 * f, vec2(.6, -.6), aa * .5);

  // 6. Single continuous right curved-barrel scrim (sweeps dark chrome cleanly around both
  //    curved right bowls and rims dark droplets without double-stripe zebra ridges).
  room += vec3(4.0, 4.30, 4.65) * scrim(reflected, vec3(.84, -.10, .53), vec2(.22, .90), .088 * f, vec2(.75, -.20), aa * .85);

  // 7. Cool overhead cove strip (catches the poured-oil top dome and upper bowl shoulders).
  room += vec3(3.1, 3.3, 3.45) * scrim(reflected, vec3(.10, -.92, .38), vec2(.68, .16), .056 * f, vec2(0., -1.), aa * .7);

  // 8. Cool silver-emerald lower-right bounce card (carves the plump underbelly of falling drops).
  room += vec3(1.28, 1.44, 1.38) * scrim(reflected, vec3(.32, .82, .47), vec2(.65, .24), .10 * f, vec2(.4, .8), aa * .5);

  // 9. Rear-left grazing rim scrim for dark droplet silhouette separation.
  room += vec3(1.80, 1.95, 2.08) * scrim(reflected, vec3(-.72, .24, -.65), vec2(.22, .80), .078 * f, vec2(-1., 0.), aa * .7);
  return room;
}

// Analytical glossy reflection of the glowing lime filament bar across wet lips,
// hanging kerf drops, and downward-flowing waves near the cut.
vec3 filamentReflection(vec3 p, vec3 n, vec3 r, float fresnel) {
  vec3 ab = filB - filA;
  vec3 ap = p - filA;
  float ab2 = dot(ab, ab);
  float rab = dot(r, ab);
  float denom = max(ab2 - rab * rab, 1e-4);
  float u = clamp((dot(ap, ab) - dot(ap, r) * rab) / denom, 0., 1.);
  vec3 segP = filA + ab * u;
  float s = max(dot(segP - p, r), .001);
  segP.z = clamp((p + r * s).z, -.165, .175);
  s = max(dot(segP - p, r), .001);

  float distRay = length((p + r * s) - segP);
  float angular = distRay / (s + .068);
  float sharp = exp(-angular * angular * 95.);
  float soft = .28 * exp(-angular * angular * 14.);

  vec3 toFil = segP - p;
  float filDist = length(toFil);
  float facing = smoothstep(-.06, .20, dot(n, toFil / max(filDist, .001)));
  float occ = smoothstep(-.018, .048, surface(mix(p, segP, .52)));
  float reach = 1. / (1. + 2.9 * filDist * filDist);
  float vis = facing * mix(.25, 1., occ) * reach;

  float spec = (sharp * 4.4 + soft * 1.35) * vis * (.16 + .84 * fresnel);
  vec3 coreCol = mix(lime, vec3(.88, 1., .46), sharp * .58);
  return coreCol * spec * (1. + .55 * pulse);
}

vec3 shade(vec3 p, vec3 view, float pixel, out float ndvOut) {
  vec3 n = normal(p);
  float wt = OMEGA * age;

  // Flowing laminar micro-undulation + interactive travelling capillary waves.
  float flowRipple = sin(p.y * 8.4 - wt * 2. - p.x * 2.2 + .7 * sin(p.x * 6.2 + p.y * 1.8));
  vec2 df = p.xy - focus;
  float rDist = length(df);
  float capillary = sin(rDist * 38. - age * 10.) * exp(-rDist * 3.0) * pulse;
  vec2 cDir = df / max(rDist, .001);
  float ampA, ampB;
  vec2 wA = waveRipple(p.xy, rippleA, ampA);
  vec2 wB = waveRipple(p.xy, rippleB, ampB);
  vec2 totalCap = cDir * capillary * .036 + (wA + wB) * .054;
  float lineSigned = (p.y + .27875 * p.x - .98) * .9633;
  // Keep hanging drops & kerf strands mirror-smooth so their specular crescents stay razor-sharp.
  float dropQuiet = (1. - .86 * smoothstep(1.64, 1.76, p.y)) * smoothstep(.04, .18, abs(lineSigned));
  n = normalize(n + vec3(.0075 * cos(p.x * 20. + flowRipple) * dropQuiet * abs(n.z) + totalCap.x,
                         .0085 * flowRipple * dropQuiet * abs(n.z) + totalCap.y, 0.));

  // 2-tap SDF Ambient Occlusion for lush, velvety dark crevices where drops & fillets weld.
  float ao1 = clamp(surface(p + n * .026) / .026, 0., 1.);
  float ao2 = clamp(surface(p + n * .082) / .082, 0., 1.);
  float ao = mix(.12, 1., ao1 * .55 + ao2 * .45);

  vec3 r = reflect(-view, n);
  vec3 reflected = vec3(dot(r, rightAxis), dot(r, downAxis), dot(r, view));
  float ca = cos(lightAngle * .72), sa = sin(lightAngle * .72);
  reflected.xz = mat2(ca, -sa, sa, ca) * reflected.xz;

  float ndv = max(dot(n, view), 0.);
  ndvOut = ndv;

  // Pixel-footprint specular filter increases gently on grazing high-curvature bevels.
  float aa = pixel * (10. + 20. * (1. - ndv));
  vec3 envSharp = studioEnv(reflected, 0., aa);
  vec3 envSoft = studioEnv(reflected, 1., aa);
  vec3 room = envSharp * .89 + envSoft * .11;

  // Heavy crude oil / black obsidian lacquer Fresnel (IOR ~1.55 -> F0 = 0.048).
  float fresnel = .048 + .952 * pow(1. - ndv, 4.9);

  // Subtle petrol-emerald thin-film sheen modulated by reflected luminance & drop curvature.
  float filmThick = 345. + 86. * sin(p.x * 4.6 + p.y * 3.9 - wt) + 92. * (capillary + ampA + ampB);
  float envLum = dot(room, vec3(.28, .58, .14));
  float dropBoost = 1. + .55 * smoothstep(1.66, 1.84, p.y);
  vec3 irid = thinFilm(ndv, filmThick);
  vec3 sheen = irid * pow(1. - ndv, 3.0) * dropBoost * (.038 + .20 * min(envLum, 1.9) + .20 * abs(ampA + ampB) + .09 * pulse);

  // True abyssal obsidian oil base + AO-sculpted studio reflections.
  vec3 col = vec3(.0009, .0011, .0015)
           + room * fresnel * mix(.45, 1., ao)
           + sheen * ao;

  // Analytical specular reflection + cut-lip glow of the glowing lime filament.
  col += filamentReflection(p, n, r, fresnel);

  float gap = emitter(p);
  float meniscusShimmer = 1. + .13 * sin(p.x * 24. - wt * 2.);
  float lit = exp(-max(gap, 0.) * (14.5 - 3.0 * pulse)) * meniscusShimmer;
  float cutFacing = max(0., -sign(lineSigned) * n.y);
  float rimWrap = pow(1. - ndv, 2.5);
  col += lime * lit * (1. + .50 * pulse) * (.022 + .56 * cutFacing + .55 * rimWrap * (.45 + .55 * cutFacing)) * mix(.55, 1., ao);

  // Thin-filament backlit translucency: strictly on razor-thin pinched waists & grazing rims,
  // preserving the glossy obsidian-black core of thicker bridges and droplets.
  float innerDepth = -surface(p - n * .034);
  float thinness = 1. - smoothstep(.003, .024, innerDepth);
  if (thinness > .01) {
    float nearKerf = exp(-max(gap, 0.) * 8.2);
    col += vec3(.58, 1., .09) * thinness * nearKerf * (.08 + .85 * rimWrap) * (1. + .45 * pulse);
    float lowNeck = smoothstep(1.66, 1.88, p.y);
    col += vec3(.18, .23, .11) * thinness * lowNeck * rimWrap * .55;
  }

  return col;
}

float rayToFilament(vec3 ro, vec3 rd) {
  float tPlane = clamp(-ro.z / (abs(rd.z) < 1e-5 ? 1e-5 : rd.z), 0., 2.35);
  return emitter(ro + rd * tPlane);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / resolution - .5) * vec2(2.20, -2.85);
  uv.y += .35;
  // During the handover the liquid shows only in the rows that have already
  // torn over to the negative, displaced exactly as the field beneath it.
  if (tear.x > 0.) {
    float kind, split, seam;
    vec2 from = tearAt(screen.xy + uv * screen.z, view, tear, kind, split, seam);
    if (kind > .5 || seam > .5) { gl_FragColor = vec4(0.); return; }
    uv = (from - screen.xy) / screen.z;
  }
  vec3 view = normalize(cross(rightAxis, downAxis));
  vec3 ro = centre + rightAxis * uv.x + downAxis * (uv.y - lift) + view * 1.40;
  vec3 rd = -view;

  // Tight AABB ray clip skips empty background space while preserving exact filament bloom.
  vec3 bMin = vec3(-.18, -.20, -.48);
  vec3 bMax = vec3(1.38, 2.40, .52);
  vec3 safeRd = vec3(abs(rd.x) < 1e-5 ? 1e-5 : rd.x,
                     abs(rd.y) < 1e-5 ? 1e-5 : rd.y,
                     abs(rd.z) < 1e-5 ? 1e-5 : rd.z);
  vec3 t0 = (bMin - ro) / safeRd;
  vec3 t1 = (bMax - ro) / safeRd;
  vec3 tSmall = min(t0, t1);
  vec3 tBig = max(t0, t1);
  float tEnter = max(0., max(tSmall.x, max(tSmall.y, tSmall.z)));
  float tExit = min(2.35, min(tBig.x, min(tBig.y, tBig.z)));

  if (tEnter > tExit) {
    float nearF = rayToFilament(ro, rd);
    if (nearF > .45) { gl_FragColor = vec4(0.); return; }
    vec3 bloom = lime * (1. + .40 * pulse) * (.35 * exp(-max(nearF, 0.) * 50.) + .056 * exp(-max(nearF, 0.) * 18.));
    vec3 rgb = toSRGB(aces(bloom));
    gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
    return;
  }

  float t = tEnter, nearestCore = 1., coverage = 0.;
  bool hit = false, hitCore = false;
  vec3 col = vec3(0.), hitP = vec3(0.);
  float pixel = 2.85 / resolution.y, edge = pixel * 1.25;
  float prevD = 1e3, prevT = tEnter, edgeD = 1e3, edgeT = tEnter;

  for (int i = 0; i < 92; i++) {
    vec3 p = ro + rd * t;
    float oil = surface(p), core = emitter(p), d = min(oil, core);
    nearestCore = min(nearestCore, core);
    if (d < pixel * .18) {
      hit = true; hitP = p; hitCore = core < oil;
      break;
    }
    if (edgeD > edge && d > prevD && prevD < edge) { edgeD = prevD; edgeT = prevT; }
    prevD = d; prevT = t;
    t += max(.00035, d * .68);
    if (t > tExit) break;
  }
  if (!hit && edgeD > edge && prevD < edge) { edgeD = prevD; edgeT = prevT; }

  float hitNdv = 0.;
  if (hit) {
    // Falling beads recede smoothly into darkness before reaching the signature.
    coverage = 1. - smoothstep(2.085, 2.265, hitP.y);
    col = hitCore ? vec3(1.95, 3.05, .28) * (1. + .28 * pulse) : shade(hitP, view, pixel, hitNdv);
  }
  vec3 rawBloom = lime * (1. + .40 * pulse) * (.35 * exp(-max(nearestCore, 0.) * 50.) + .056 * exp(-max(nearestCore, 0.) * 18.));
  // Foreground oil strands silhouetted in front of the filament stay pitch-black along their
  // glossy spine while optical glare wraps organically around their grazing edges.
  float fgOcclusion = (hit && !hitCore) ? mix(.26, .92, pow(1. - hitNdv, 2.0)) : 1.;
  vec3 rgb = toSRGB(aces(col + rawBloom * fgOcclusion));
  vec4 back = hit ? vec4(rgb * coverage, coverage) : vec4(rgb, 0.);
  back.a = max(back.a, max(back.r, max(back.g, back.b)));

  if (edgeD < edge) {
    vec3 q = ro + rd * edgeT;
    float oil = surface(q), core = emitter(q), rimNdv = 0.;
    vec3 rimCol = core < oil ? vec3(1.95, 3.05, .28) * (1. + .28 * pulse) : shade(q, view, pixel, rimNdv);
    float rimOcc = core < oil ? 1. : mix(.26, .92, pow(1. - rimNdv, 2.0));
    vec3 rim = toSRGB(aces(rimCol + rawBloom * rimOcc));
    float g = (1. - smoothstep(pixel * .18, edge, edgeD)) * (1. - smoothstep(2.085, 2.265, q.y));
    back = vec4(rim, 1.) * g + back * (1. - g);
  }
  gl_FragColor = back;
}
`;

export function createOilVolume(hardwareOnly = false, stage) {
  const image = document.createElement('canvas');
  if (hardwareOnly) {
    const gl = image.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info && /swiftshader|llvmpipe|software rasterizer/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return null;
    }
  }
  const renderer = createRenderer(image, fragment, { alpha: true });
  if (!renderer) return null;
  if (stage) {
    image.className = 'oil';
    image.setAttribute('aria-hidden', 'true');
    image.addEventListener('webglcontextlost', () => { image.hidden = true; });
    stage.after(image);
  }
  // Drivers often finish compiling on the first real draw. One pixel now
  // keeps that cost out of the first glitch.
  image.width = image.height = 1;
  renderer.draw({
    resolution: [1, 1], rightAxis: [1, 0, 0], downAxis: [0, 1, 0], age: 0, lift: 0, separation: .01,
    pulse: 0, focus: [.56, .845], tear: [0, 0, 0, 0], lightAngle: 0, vel: [0, 0],
    rippleA: [0, 0, 10, 0], rippleB: [0, 0, 10, 0],
  });
  let lastSize = 0, lastCentre = 0;
  function render(ctx, {
    w, h, size, centre = h * .45, pixelRatio, detail = 1, right, down, age, lift, separation,
    tear = [0, 0, 0, 0], pulse = 0, focus = [.56, .845], lightAngle = 0, vel = [0, 0],
    rippleA = [0, 0, 10, 0], rippleB = [0, 0, 10, 0],
  }) {
    if (renderer.gl.isContextLost()) {
      if (stage) image.hidden = true;
      return false;
    }
    const width = size * 2.20, height = size * 2.85;
    // Edges are resolved analytically in the shader, so no supersampling.
    const scale = Math.min(pixelRatio, 1500 / height) * detail;
    const rw = Math.max(1, Math.round(width * scale));
    const rh = Math.max(1, Math.round(height * scale));
    if (image.width !== rw || image.height !== rh) {
      image.width = rw;
      image.height = rh;
    }
    const top = centre + size * .35 - height / 2;
    if (stage && (size !== lastSize || centre !== lastCentre)) {
      Object.assign(image.style, { top: top + 'px', width: width + 'px', height: height + 'px' });
      lastSize = size;
      lastCentre = centre;
    }
    renderer.draw({
      resolution: [rw, rh], rightAxis: right, downAxis: down, age, lift, separation, pulse, focus,
      tear, view: [w, h], screen: [w / 2, centre, size], lightAngle, vel, rippleA, rippleB,
    });
    // Offscreen callers can still take a frame. In the exhibit the GPU
    // presents its own layer directly, torn rows included.
    if (!stage) ctx.drawImage(image, (w - width) / 2, top, width, height);
    return true;
  }
  return render;
}

// The baked take is sampled from the same surface at 16 fps. It keeps the
// liquid moving on systems where WebGL would run on the CPU.
function bakedTake() {
  const sheets = Array.from({ length: 4 }, (_, i) => {
    const image = new Image();
    image.src = new URL('../assets/liquid/exposure-' + i + '.webp', import.meta.url);
    return image;
  });
  return (ctx, { w, h, size, centre = h * .45, lift, age, tear }) => {
    const frame = Math.floor((age % 4) * 16);
    const sheet = sheets[Math.floor(frame / 16)];
    if (!sheet.complete || !sheet.naturalWidth) return false;
    const width = size * 2.20, height = size * 2.85;
    const sw = sheet.naturalWidth / 4, sh = sheet.naturalHeight / 4;
    const sx = frame % 4 * sw, sy = Math.floor(frame % 16 / 4) * sh;
    const left = (w - width) / 2, top = centre + size * (.35 + lift) - height / 2;
    if (!tear?.[0]) {
      ctx.drawImage(sheet, sx, sy, sw, sh, left, top, width, height);
      return true;
    }
    // Slices on the torn rows that have gone over to the negative.
    for (const row of tearRows(tear, [w, h], top, top + height)) {
      const y0 = Math.max(top, row.top), y1 = Math.min(top + height, row.top + row.height);
      if (row.print || y1 <= y0) continue;
      const from = ((row.smear ? row.top : y0) - row.slip - top) / height;
      const to = from + (row.smear ? .5 : y1 - y0) / height;
      const a = Math.max(0, from), b = Math.min(1, to);
      if (b > a) ctx.drawImage(sheet, sx, sy + a * sh, sw, (b - a) * sh, left + row.shift, y0, width, y1 - y0);
    }
    return true;
  };
}

export function prepareOil(stage) {
  const live = createOilVolume(true, stage);
  let fallback = live ? null : bakedTake();
  return (ctx, scene) => {
    if (live?.(ctx, scene)) return stage ? 'layer' : 'stage';
    fallback ??= bakedTake();
    return fallback(ctx, scene) ? 'stage' : null;
  };
}
