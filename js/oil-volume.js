// Orthographic ray casting of the two wet solids and their pendant liquid.
// The camera basis comes from the engraving renderer, in the same logo units.
import { createRenderer, GLSL } from './gl/gl.js';
import { TEAR, tearRows } from './negative.js';

const fragment = GLSL.head + GLSL.tone + TEAR + `
uniform vec2 resolution, focus, view;
uniform vec3 rightAxis, downAxis, screen;
uniform vec4 tear, rippleA, rippleB;
uniform float age, lift, separation, pulse, lightAngle;
const vec3 centre = vec3(.56,.845,0.);
const vec3 lime = vec3(.54,.94,.035);

float weld(float a, float b, float radius) {
  float h = max(radius-abs(a-b),0.)/radius;
  return min(a,b)-h*h*radius*.25;
}

float halfRound(vec2 p,float cx,float cy,float r) {
  return length(vec2(max(p.x-cx,0.),p.y-cy))-r;
}
float contour(vec2 p) {
  return max(-p.x,min(halfRound(p,.57,.43,.43),halfRound(p,.71,1.20,.49)));
}
float solid(vec3 p, float outline) {
  // The film swells around its perimeter and bows over the broad face.
  float crown = .055*cos(2.5*(p.x-.48))*cos(2.7*(p.y-.83));
  float run = .012*sin(8.*p.x+1.3*sin(3.7*p.y)+.65*p.y)
            +.0035*cos(23.*p.x-2.1*p.y+sin(4.*p.y));
  vec2 d = vec2(outline,abs(p.z)-.268-crown-run)+.065;
  return min(max(d.x,d.y),0.)+length(max(d,0.))-.065;
}

float drop(vec3 p,vec3 root,float radius,float reach,float speed,float release) {
  vec3 q = p-root;
  // A four-second periodic take. Small pendants swell out of phase.
  // The heaviest one necks, releases its bead and refills from the lip.
  float t=mod(age,4.);
  float phase=t*1.5707963+root.x*7.+speed;
  float growth=mix(.76+.22*sin(phase),.60+.40*(smoothstep(0.,1.94,t)-smoothstep(2.22,3.85,t)),release);
  float extension=reach*growth*(1.+.08*pulse);
  float pinch=release*(smoothstep(1.37,2.01,t)-smoothstep(2.19,3.68,t));
  float latitude=clamp(q.y/extension,0.,1.);
  q.xz-=downAxis.xz*q.y/downAxis.y
        +vec2(.011*sin(3.8*latitude),.014*sin(2.6*latitude))*latitude;
  float radial=length(q.xz);
  float end=extension-radius*.55-pinch*reach*.52;
  float u=clamp(q.y/max(end,.001),0.,1.);
  float neck=radius*(.25+.92*exp(-4.5*u))*(1.-.72*pinch*u);
  float stalk=length(vec2(radial,q.y-clamp(q.y,-.018,end)))-neck;
  float bulbY=extension;
  float bulbRadius=radius*(1.-.09*growth);
  if(release>.5 && t>=2.01) {
    float fall=t-2.01;
    float loose=length(vec3(q.x,(q.y-reach-fall*fall*1.75)*.91,q.z))-bulbRadius;
    stalk=min(stalk,loose);
    bulbY=end+radius*.55*(1.-pinch);
    bulbRadius*=1.-.84*pinch;
  }
  float bulb=length(vec3(q.x,(q.y-bulbY)*.88,q.z))-bulbRadius;
  return weld(stalk,bulb,radius*.76);
}

float surface(vec3 p) {
  float line = (p.y+.27875*p.x-.98)*.9633;
  float border = contour(p.xy);
  float body = solid(p,max(border,.065+separation-abs(line)));
  if(p.y>.49 && p.y<1.24 && p.z>-.29 && p.z<.41) {
    body=weld(body,drop(p,vec3(.175,.85,.23),.040,.162,.63,0.),.087);
    body=weld(body,drop(p,vec3(.65,.715,.238),.032,.102,.83,0.),.070);
    body=weld(body,drop(p,vec3(.81,.673,.02),.025,.075,.58,0.),.054);
  }
  if(p.y>1.38) {
    body=weld(body,drop(p,vec3(.13,1.659,.19),.054,.195,.55,0.),.096);
    body=weld(body,drop(p,vec3(.49,1.65,.211),.066,.36,.72,1.),.113);
    body=weld(body,drop(p,vec3(.73,1.65,-.085),.027,.105,.44,0.),.074);
    body=weld(body,drop(p,vec3(1.015,1.54,.163),.053,.285,.67,0.),.102);
  }
  return body;
}
float emitter(vec3 p) {
  float line=(p.y+.27875*p.x-.98)*.9633;
  return max(max(contour(p.xy)+.046,abs(line)-.007),abs(p.z)-.17);
}
vec3 normal(vec3 p) {
  vec2 e=vec2(.0011,-.0011);
  return normalize(e.xyy*surface(p+e.xyy)+e.yyx*surface(p+e.yyx)
      +e.yxy*surface(p+e.yxy)+e.xxx*surface(p+e.xxx));
}
float panel(vec3 reflected,vec3 aim,vec2 extent,float feather) {
  vec3 axis=normalize(aim);
  vec3 horizontal=normalize(cross(vec3(0.,1.,0.),axis));
  vec3 vertical=cross(axis,horizontal);
  float facing=dot(reflected,axis);
  vec2 uv=vec2(dot(reflected,horizontal),dot(reflected,vertical))/max(facing,.01);
  vec2 d=abs(uv)-extent;
  return step(.01,facing)*(1.-smoothstep(-feather,feather,max(d.x,d.y)));
}
vec2 waveRipple(vec2 p, vec4 rip, out float amp) {
  amp = 0.;
  if (rip.w <= .001 || rip.z > 2.6) return vec2(0.);
  vec2 d = p - rip.xy;
  float r = length(d);
  float front = rip.z * .78;
  float env = exp(-pow(r - front, 2.) * 16.) * exp(-rip.z * 1.45) * rip.w;
  float w = sin((r - front) * 44.) * env;
  amp = w;
  return (d / max(r, .001)) * w;
}
vec3 thinFilm(float ndv, float thickness) {
  vec3 phase = 6.283185 * (2. * thickness * 1.44 * max(ndv, .14)) / vec3(650., 545., 455.);
  vec3 irid = .5 + .5 * cos(phase);
  return mix(vec3(.45, .52, .48), irid, .72);
}
vec3 shade(vec3 p,vec3 view) {
  vec3 n=normal(p);
  // Shallow surface ripples bend the softboxes across the face. They live
  // in object space, so the highlights turn with the surface under the mouse.
  // When touched or pulsed, concentric capillary waves travel through the film.
  float ripple=sin(p.y*10.4-p.x*3.4-.34*sin(age*1.5707963)+sin(p.x*9.));
  vec2 df=p.xy-focus;
  float rDist=length(df);
  float capillary=sin(rDist*42.-age*11.)*exp(-rDist*3.2)*pulse;
  vec2 cDir=df/max(rDist,.001);
  float ampA, ampB;
  vec2 wA = waveRipple(p.xy, rippleA, ampA);
  vec2 wB = waveRipple(p.xy, rippleB, ampB);
  vec2 totalCap = cDir * capillary * .038 + (wA + wB) * .048;
  n=normalize(n+n.z*vec3(.018*cos(p.x*31.+ripple)+totalCap.x,.016*ripple+totalCap.y,0.));
  vec3 r=reflect(-view,n);
  vec3 reflected=vec3(dot(r,rightAxis),dot(r,downAxis),dot(r,view));
  float ca = cos(lightAngle * .68), sa = sin(lightAngle * .68);
  reflected.xz = mat2(ca, -sa, sa, ca) * reflected.xz;
  vec3 room=vec3(.095,.10,.115)*(1.22-.74*reflected.y);
  // The large diffusion frame reads as a gradient in the liquid, bracketed
  // by two narrow reflection cards on the necks and reflected bulbs.
  room+=vec3(.78,.83,.82)*panel(reflected,vec3(-.92,.10,.69),vec2(.31,.75),.31);
  // The narrow edge of the diffusion frame folds into a hairline on the
  // liquid face and breaks into individual glints on the pendant beads.
  room+=vec3(1.32,1.50,1.44)*panel(reflected,vec3(-.55,-.27,.82),vec2(.026,.72),.033);
  room+=vec3(.64,.62,.58)*panel(reflected,vec3(.1,.95,.46),vec2(.85,.16),.13);
  room+=vec3(3.95,4.12,4.28)*panel(reflected,vec3(-.75,-.65,.55),vec2(.22,.83),.082);
  room+=vec3(1.62,1.54,1.40)*panel(reflected,vec3(.6,-.85,-.52),vec2(.72,.11),.050);
  room+=vec3(2.55)*panel(reflected,vec3(.92,.18,.4),vec2(.052,.88),.032);
  float ndv=max(dot(n,view),0.);
  float fresnel=.042+(.958-.19*smoothstep(1.64,1.85,p.y))*pow(1.-ndv,4.8);
  // Restrained physical thin-film petrol iridescence at extreme grazing angles & capillary crests.
  float filmThick = 345. + 92. * sin(p.x * 5.2 + p.y * 3.8 + age * .6) + 75. * (capillary + ampA + ampB);
  vec3 sheen = thinFilm(ndv, filmThick) * pow(1. - ndv, 3.4) * (.13 + .11 * abs(ampA + ampB) + .06 * pulse);
  vec3 col=vec3(.0024,.0026,.0032)+room*fresnel+sheen*vec3(.58,.92,.76);
  float gap=emitter(p);
  float meniscusShimmer = 1. + .16 * sin(p.x * 26. - age * 4.2);
  float lit=exp(-max(gap,0.)*(14.2-3.2*pulse)) * meniscusShimmer;
  float cutFacing=max(0.,-sign(p.y+.27875*p.x-.98)*n.y);
  col+=lime*lit*(1.+.52*pulse)*(.072+.72*cutFacing+.34*pow(1.-ndv,3.)*cutFacing);
  col+=lime*exp(-max(gap,0.)*23.)*(1.+.55*pulse)*panel(reflected,vec3(.05,.65,.35),vec2(1.1,.18),.19);
  return col;
}
void main() {
  vec2 uv=(gl_FragCoord.xy/resolution-.5)*vec2(2.20,-2.85);
  uv.y+=.35;
  // During the handover the liquid shows only in the rows that have already
  // torn over to the negative, displaced exactly as the field beneath it.
  if(tear.x>0.) {
    float kind, split, seam;
    vec2 from=tearAt(screen.xy+uv*screen.z,view,tear,kind,split,seam);
    if(kind>.5 || seam>.5) { gl_FragColor=vec4(0.); return; }
    uv=(from-screen.xy)/screen.z;
  }
  vec3 view=normalize(cross(rightAxis,downAxis));
  vec3 ro=centre+rightAxis*uv.x+downAxis*(uv.y-lift)+view*1.40;
  vec3 rd=-view;
  float t=0., nearestCore=1., coverage=0.;
  bool hit=false, hitCore=false;
  vec3 col=vec3(0.), hitP=vec3(0.);
  float pixel=2.85/resolution.y, edge=pixel*1.2;
  // The first place the ray grazes a surface without entering it. That
  // contour covers part of the pixel, so it is blended over what lies behind.
  float prevD=1e3, prevT=0., edgeD=1e3, edgeT=0.;
  for(int i=0;i<100;i++) {
    vec3 p=ro+rd*t;
    float oil=surface(p), core=emitter(p), d=min(oil,core);
    nearestCore=min(nearestCore,core);
    if(d<pixel*.2) {
      hit=true; hitP=p; hitCore=core<oil;
      break;
    }
    if(edgeD>edge && d>prevD && prevD<edge) { edgeD=prevD; edgeT=prevT; }
    prevD=d; prevT=t;
    t+=max(.0004,d*.76);
    if(t>2.22) break;
  }
  if(!hit && edgeD>edge && prevD<edge) { edgeD=prevD; edgeT=prevT; }
  // Shading waits until every ray has finished marching, so neighbouring
  // pixels shade together instead of stalling each other inside the loop.
  if(hit) {
    // The released bead falls out of the pool of studio light before
    // reaching the signature. Its silhouette and reflection recede together.
    coverage=1.-smoothstep(2.095,2.275,hitP.y);
    col=hitCore ? vec3(1.85,2.95,.22)*(1.+.25*pulse) : shade(hitP,view);
  }
  vec3 bloom=lime*(1.+.38*pulse)*(.33*exp(-max(nearestCore,0.)*52.)+.050*exp(-max(nearestCore,0.)*19.));
  vec3 rgb=toSRGB(aces(col+bloom));
  vec4 back=hit ? vec4(rgb*coverage,coverage) : vec4(rgb,0.);
  back.a=max(back.a,max(back.r,max(back.g,back.b)));
  if(edgeD<edge) {
    vec3 q=ro+rd*edgeT;
    float oil=surface(q), core=emitter(q);
    vec3 rim=toSRGB(aces((core<oil ? vec3(1.85,2.95,.22)*(1.+.25*pulse) : shade(q,view))+bloom));
    float g=(1.-smoothstep(pixel*.2,edge,edgeD))*(1.-smoothstep(2.095,2.275,q.y));
    back=vec4(rim,1.)*g+back*(1.-g);
  }
  gl_FragColor=back;
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
    stage.after(image);
  }
  // Drivers often finish compiling on the first real draw. One pixel now
  // keeps that cost out of the first glitch.
  image.width = image.height = 1;
  renderer.draw({
    resolution: [1, 1], rightAxis: [1, 0, 0], downAxis: [0, 1, 0], age: 0, lift: 0, separation: .01,
    pulse: 0, focus: [.56, .845], tear: [0, 0, 0, 0], lightAngle: 0,
    rippleA: [0, 0, 10, 0], rippleB: [0, 0, 10, 0],
  });
  let lastSize = 0, lastCentre = 0;
  function render(ctx, {
    w, h, size, centre = h * .45, pixelRatio, detail = 1, right, down, age, lift, separation,
    tear = [0, 0, 0, 0], pulse = 0, focus = [.56, .845], lightAngle = 0,
    rippleA = [0, 0, 10, 0], rippleB = [0, 0, 10, 0],
  }) {
    if (renderer.gl.isContextLost()) return false;
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
      tear, view: [w, h], screen: [w / 2, centre, size], lightAngle, rippleA, rippleB,
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
