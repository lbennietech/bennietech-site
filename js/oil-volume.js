// Orthographic ray casting of the two wet solids and their pendant liquid.
// The camera basis comes from the engraving renderer, in the same logo units.
import { createRenderer, GLSL } from './gl/gl.js';

const fragment = GLSL.head + GLSL.tone + `
uniform vec2 resolution;
uniform vec3 rightAxis, downAxis;
uniform float age, lift, separation;
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
  float extension=reach*growth;
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
vec3 shade(vec3 p,vec3 view) {
  vec3 n=normal(p);
  // Shallow surface ripples bend the softboxes across the face. They live
  // in object space, so the highlights turn with the surface under the mouse.
  float ripple=sin(p.y*10.4-p.x*3.4-.34*sin(age*1.5707963)+sin(p.x*9.));
  n=normalize(n+n.z*vec3(.018*cos(p.x*31.+ripple),.016*ripple,0.));
  vec3 r=reflect(-view,n);
  vec3 reflected=vec3(dot(r,rightAxis),dot(r,downAxis),dot(r,view));
  vec3 room=vec3(.12,.125,.14)*(1.25-.72*reflected.y);
  // The large diffusion frame reads as a gradient in the liquid, bracketed
  // by two narrow reflection cards on the necks and reflected bulbs.
  room+=vec3(.87,.91,.94)*panel(reflected,vec3(-.92,.10,.69),vec2(.31,.75),.33);
  room+=vec3(.62,.60,.56)*panel(reflected,vec3(.1,.95,.46),vec2(.85,.16),.13);
  room+=vec3(3.7,3.86,4.)*panel(reflected,vec3(-.75,-.65,.55),vec2(.23,.83),.085);
  room+=vec3(1.55,1.48,1.35)*panel(reflected,vec3(.6,-.85,-.52),vec2(.72,.11),.052);
  room+=vec3(2.3)*panel(reflected,vec3(.92,.18,.4),vec2(.055,.88),.035);
  float fresnel=.046+.954*pow(1.-max(dot(n,view),0.),5.);
  vec3 col=vec3(.0033,.0035,.0042)+room*fresnel;
  float gap=emitter(p);
  float lit=exp(-max(gap,0.)*15.);
  col+=lime*lit*(.06+.63*max(0.,-sign(p.y+.27875*p.x-.98)*n.y));
  col+=lime*exp(-max(gap,0.)*25.)*panel(reflected,vec3(.05,.65,.35),vec2(1.1,.18),.20);
  return col;
}
void main() {
  vec2 uv=(gl_FragCoord.xy/resolution-.5)*vec2(2.20,-2.85);
  uv.y+=.35;
  vec3 view=normalize(cross(rightAxis,downAxis));
  vec3 ro=centre+rightAxis*uv.x+downAxis*(uv.y-lift)+view*1.40;
  vec3 rd=-view;
  float t=0., nearestCore=1., coverage=0.;
  bool hit=false;
  vec3 col=vec3(0.);
  float pixel=2.85/resolution.y;
  // The first place the ray grazes a surface without entering it. That
  // contour covers part of the pixel, so it is blended over what lies behind.
  float prevD=1e3, prevT=0., edgeD=1e3, edgeT=0.;
  for(int i=0;i<128;i++) {
    vec3 p=ro+rd*t;
    float oil=surface(p), core=emitter(p), d=min(oil,core);
    nearestCore=min(nearestCore,core);
    if(d<pixel*.06) {
      hit=true;
      // The released bead falls out of the pool of studio light before
      // reaching the signature. Its silhouette and reflection recede together.
      coverage=1.-smoothstep(2.095,2.275,p.y);
      col=core<oil ? vec3(1.65,2.7,.16) : shade(p,view);
      break;
    }
    if(edgeD>pixel && d>prevD && prevD<pixel) { edgeD=prevD; edgeT=prevT; }
    prevD=d; prevT=t;
    t+=max(.00025,d*.76);
    if(t>2.22) break;
  }
  if(!hit && edgeD>pixel && prevD<pixel) { edgeD=prevD; edgeT=prevT; }
  vec3 bloom=lime*(.31*exp(-max(nearestCore,0.)*51.)+.047*exp(-max(nearestCore,0.)*19.));
  vec3 rgb=toSRGB(aces(col+bloom));
  vec4 back=hit ? vec4(rgb*coverage,coverage) : vec4(rgb,0.);
  back.a=max(back.a,max(back.r,max(back.g,back.b)));
  if(edgeD<pixel) {
    vec3 q=ro+rd*edgeT;
    float oil=surface(q), core=emitter(q);
    vec3 edge=toSRGB(aces((core<oil ? vec3(1.65,2.7,.16) : shade(q,view))+bloom));
    float g=(1.-smoothstep(0.,pixel,edgeD))*(1.-smoothstep(2.095,2.275,q.y));
    back=vec4(edge,1.)*g+back*(1.-g);
  }
  gl_FragColor=back;
}
`;

export function createOilVolume(hardwareOnly = false) {
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
  return function render(ctx, { w, h, size, pixelRatio, right, down, age, lift, separation }) {
    if (renderer.gl.isContextLost()) return false;
    const width = size * 2.20, height = size * 2.85;
    const scale = Math.min(Math.max(1.4, pixelRatio), 1120 / height);
    const rw = Math.max(1, Math.round(width * scale));
    const rh = Math.max(1, Math.round(height * scale));
    if (image.width !== rw || image.height !== rh) {
      image.width = rw;
      image.height = rh;
    }
    renderer.draw({ resolution: [rw, rh], rightAxis: right, downAxis: down, age, lift, separation });
    ctx.drawImage(image, (w - width) / 2, h * .45 + size * .35 - height / 2, width, height);
    return true;
  };
}

// The baked take is sampled from the same surface at 16 fps. It keeps the
// liquid moving on systems where WebGL would run on the CPU.
function bakedTake() {
  const sheets = Array.from({ length: 4 }, (_, i) => {
    const image = new Image();
    image.src = new URL('../assets/liquid/exposure-' + i + '.webp', import.meta.url);
    return image;
  });
  return (ctx, { w, h, size, lift, age }) => {
    const frame = Math.floor((age % 4) * 16);
    const sheet = sheets[Math.floor(frame / 16)];
    if (!sheet.complete || !sheet.naturalWidth) return false;
    const width = size * 2.20, height = size * 2.85;
    const sw = sheet.naturalWidth / 4, sh = sheet.naturalHeight / 4;
    ctx.drawImage(sheet, frame % 4 * sw, Math.floor(frame % 16 / 4) * sh, sw, sh,
      (w - width) / 2, h * .45 + size * (.35 + lift) - height / 2, width, height);
    return true;
  };
}

export function prepareOil() {
  const live = createOilVolume(true);
  if (!live) return bakedTake();
  let fallback;
  return (ctx, scene) => {
    if (live(ctx, scene)) return true;
    fallback ??= bakedTake();
    return fallback(ctx, scene);
  };
}
