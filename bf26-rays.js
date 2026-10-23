/*!
 * BF26 — фон першого екрана «Side Rays» (порт React Bits SideRays на чистий JS, WebGL2, без залежностей).
 * Підвантажує bf26.js після load лише на десктопі (≥ 992 px) і без «зменшення руху»; інакше лишається CSS-сяйво.
 * Контейнер: [data-bf-rays] у hero. Налаштування — window.BF26_RAYS (необов'язково) поверх значень нижче.
 */
(function () {
  'use strict';
  var box = document.querySelector('[data-bf-rays]');
  if (!box || box.__bfRays) return;
  box.__bfRays = true;

  var O = Object.assign({
    rayColor1: '#7c3aed', rayColor2: '#7c3aed', blend: 0.6, origin: 'top-right', speed: 2.5, intensity: 2, spread: 2,
    density: 5, sharpness: 0.5, tilt: 0, falloff: 1.6, glow: 1, saturation: 1, dust: 0, followMouse: true,
    mouseInfluence: 0.5, intro: true, opacity: 1, maxDevicePixelRatio: 1, pixelBudget: 1.2e6
  }, window.BF26_RAYS || {});

  var TAU = Math.PI * 2;
  var ORIGINS = {
    'top-right': [0, 0, 0], 'top-left': [1, 0, 0], 'bottom-right': [0, 1, 0], 'bottom-left': [1, 1, 0], right: [0, 0, 1], left: [1, 0, 1]
  };
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function wrap(a) { return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI; }
  function color(v) {
    var h = /^#?([0-9a-f]{6})$/i.exec(String(v).trim());
    return h ? [0, 2, 4].map(function (i) { return parseInt(h[1].slice(i, i + 2), 16) / 255; }) : [1, 1, 1];
  }

  var S = {
    a: color(O.rayColor1), b: color(O.rayColor2), blend: clamp(O.blend, 0, 1), frame: ORIGINS[O.origin] || ORIGINS['top-right'],
    speed: Math.max(0, O.speed) * 0.4, intensity: Math.max(0, O.intensity) * 0.75, spread: clamp(O.spread, 0.1, 8) * 0.225,
    density: clamp(O.density, 1, 40), sharpness: clamp(O.sharpness, 0, 1), tilt: clamp(O.tilt, -180, 180) * Math.PI / 180,
    falloff: clamp(O.falloff, 0.2, 6), glow: Math.max(0, O.glow) * 1.2, saturation: Math.max(0, O.saturation),
    dust: clamp(O.dust, 0, 1), mouse: clamp(O.mouseInfluence, 0, 1), opacity: clamp(O.opacity, 0, 1)
  };

  var VERT = '#version 300 es\nconst vec2 c[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));void main(){gl_Position=vec4(c[gl_VertexID],0.,1.);}';
  // фрагментний шейдер — без змін логіки відносно оригіналу (light mode прибрано: фон темний)
  var FRAG = ['#version 300 es', 'precision highp float;',
    'uniform vec2 uResolution;uniform float uTime;uniform vec3 uColorA;uniform vec3 uColorB;uniform float uBlend;uniform float uIntensity;',
    'uniform float uSpread;uniform float uDensity;uniform float uSharpness;uniform float uFalloff;uniform float uGlow;uniform float uSaturation;',
    'uniform float uDust;uniform float uOpacity;uniform float uReveal;uniform vec3 uFrame;uniform float uAim;uniform vec3 uFocus;uniform float uSway;',
    'out vec4 fragColor;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p);vec2 f=p-i;vec2 w=f*f*f*(f*(f*6.0-15.0)+10.0);float a=hash(i);float b=hash(i+vec2(1.,0.));float c=hash(i+vec2(0.,1.));float d=hash(i+vec2(1.,1.));return mix(mix(a,b,w.x),mix(c,d,w.x),w.y);}',
    'float shafts(float u,float t,float seed,float aa){float sway=(0.4*sin(t*0.31+seed)+0.24*sin(t*0.17+seed*2.3))*uSway;float n=0.7*noise(vec2(u+sway+seed,t*0.3))+0.3*noise(vec2(u*2.4+sway*1.5+seed*1.7,t*0.45+3.0));float width=mix(0.5,0.1,uSharpness);float s=mix(smoothstep(0.5-width,0.5+width,n),0.5,aa);return mix(0.05,1.0,s);}',
    'float motes(vec2 p,float cell,float t,float seed){p+=vec2(t*0.021,-t*0.013)+seed*7.31;vec2 grid=p/cell;vec2 id=floor(grid);vec2 f=grid-id;float h=hash(id+seed);if(h>0.5)return 0.0;vec2 center=0.25+0.5*vec2(hash(id+1.7+seed),hash(id+3.1+seed));center+=0.1*vec2(sin(t*0.7+h*31.0),cos(t*0.6+h*23.0));float size=mix(0.035,0.09,hash(id+5.3+seed));float edge=length(fwidth(grid))*0.7;float twinkle=0.55+0.45*sin(t*1.9+h*41.0);return(1.0-smoothstep(size-edge,size+edge,length(f-center)))*twinkle;}',
    'void main(){float aspect=uResolution.x/uResolution.y;vec2 q=(gl_FragCoord.xy-0.5*uResolution)/uResolution.y;if(uFrame.x>0.5)q.x=-q.x;if(uFrame.y>0.5)q.y=-q.y;',
    'vec2 source=uFrame.z>0.5?vec2(aspect*0.5+0.42,0.3):vec2(aspect*0.5+0.1,0.62);float heading=(uFrame.z>0.5?3.42:-2.48)+uAim+0.035*sin(uTime*0.21)*uSway;',
    'vec2 v=q-source;float r=length(v);float angle=mod(atan(v.y,v.x)-heading+3.14159265,6.28318531)-3.14159265;float t=uTime;float u=angle*uDensity;float aa=smoothstep(0.12,0.45,fwidth(u));',
    'float offset=uSpread*0.22;float fanA=exp(-pow((angle+offset)/uSpread,2.0)*1.4);float fanB=exp(-pow((angle-offset)/(uSpread*1.15),2.0)*1.4);',
    'float focus=1.0+uFocus.z*exp(-pow((angle-uFocus.x)/uFocus.y,2.0));float lightA=fanA*shafts(u,t,0.0,aa)*focus;float lightB=fanB*shafts(u*0.83,t*0.6,17.0,aa)*focus;',
    'float reach=1.0/(1.0+pow(r/0.4,uFalloff));vec3 glowColor=mix(uColorA,uColorB,uBlend);vec3 light=(uColorA*lightA*(1.0-uBlend)+uColorB*lightB*uBlend)*2.0*reach;light+=glowColor*uGlow*exp(-pow(r/0.4,2.0));',
    'if(uDust>0.0){float sparkle=motes(q,0.06,t,0.0)+0.7*motes(q,0.038,t*0.8,9.0);light+=mix(glowColor,vec3(1.0),0.6)*sparkle*(lightA+lightB)*reach*uDust*2.5;}',
    'light*=uIntensity*(1.0-smoothstep(uReveal*2.6-0.45,uReveal*2.6,r))*smoothstep(0.0,0.35,uReveal);float gray=dot(light,vec3(0.2126,0.7152,0.0722));light=max(mix(vec3(gray),light,uSaturation),0.0);',
    'float peak=max(light.r,max(light.g,light.b));float grain=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))-0.5)/255.0;',
    'float mapped=1.0-exp(-peak);vec3 tone=light*(mapped/max(peak,1e-4));tone=mix(tone,vec3(mapped),smoothstep(0.7,1.0,mapped)*0.55);vec3 shown=clamp(tone*uOpacity,0.0,1.0);',
    'float alpha=max(shown.r,max(shown.g,shown.b));vec3 col=clamp(shown*alpha+grain,0.0,1.0);fragColor=vec4(min(col,vec3(alpha)),alpha);}'].join('\n');

  var canvas = document.createElement('canvas');
  canvas.className = 'bf_rays-canvas'; canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return;
  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[bf26-rays]', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  var U = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(prog, i); U[info.name] = gl.getUniformLocation(prog, info.name); }
  var vao = gl.createVertexArray();
  box.appendChild(canvas);
  box.classList.add('is-webgl');

  var size = { w: 1, h: 1 }, ptr = { x: 0, y: 0, inside: false }, aim = { v: 0, vel: 0 }, focus = { a: 0, s: 0 };
  var time = Math.random() * 100, reveal = O.intro ? 0 : 1, raf = 0, last = 0, visible = true, lost = false;

  function resize() {
    var r = box.getBoundingClientRect(), cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    var ratio = Math.min(window.devicePixelRatio || 1, O.maxDevicePixelRatio, Math.sqrt(O.pixelBudget / (cw * ch)));
    var w = Math.max(1, Math.round(cw * ratio)), h = Math.max(1, Math.round(ch * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    size.w = cw; size.h = ch;
  }
  function pointerAngle() {
    var x = (ptr.x - size.w / 2) / size.h, y = (size.h / 2 - ptr.y) / size.h, f = S.frame, asp = size.w / size.h;
    if (f[0]) x = -x; if (f[1]) y = -y;
    var src = f[2] ? [asp * 0.5 + 0.42, 0.3] : [asp * 0.5 + 0.1, 0.62], head = f[2] ? 3.42 : -2.48;
    return wrap(Math.atan2(y - src[1], x - src[0]) - head - S.tilt);
  }
  function frame(now) {
    raf = 0; if (lost) return;
    var dt = clamp((now - last) / 1000 || 0, 0, 0.05); last = Math.max(last, now);
    time += dt * S.speed;
    if (reveal < 1) reveal = Math.min(1, reveal + dt / 1.6);
    var tracking = O.followMouse && ptr.inside, pointed = tracking ? pointerAngle() : 0;
    var target = tracking ? clamp(pointed, -S.spread, S.spread) * S.mouse : 0, fTarget = tracking ? S.mouse : 0, ease = 1 - Math.exp(-dt * 6);
    if (tracking) focus.a += (clamp(pointed - aim.v, -S.spread * 1.5, S.spread * 1.5) - focus.a) * ease;
    focus.s += (fTarget - focus.s) * ease;
    aim.vel += ((target - aim.v) * 18 - aim.vel * 2 * Math.sqrt(18)) * dt; aim.v += aim.vel * dt;
    gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.uniform2f(U.uResolution, canvas.width, canvas.height); gl.uniform1f(U.uTime, time);
    gl.uniform3f(U.uColorA, S.a[0], S.a[1], S.a[2]); gl.uniform3f(U.uColorB, S.b[0], S.b[1], S.b[2]);
    gl.uniform1f(U.uBlend, S.blend); gl.uniform1f(U.uIntensity, S.intensity); gl.uniform1f(U.uSpread, S.spread);
    gl.uniform1f(U.uDensity, S.density); gl.uniform1f(U.uSharpness, S.sharpness); gl.uniform1f(U.uFalloff, S.falloff);
    gl.uniform1f(U.uGlow, S.glow); gl.uniform1f(U.uSaturation, S.saturation); gl.uniform1f(U.uDust, S.dust);
    gl.uniform1f(U.uOpacity, S.opacity); gl.uniform1f(U.uReveal, 1 - Math.pow(1 - reveal, 3));
    gl.uniform3f(U.uFrame, S.frame[0], S.frame[1], S.frame[2]); gl.uniform1f(U.uAim, S.tilt + aim.v);
    gl.uniform3f(U.uFocus, focus.a, Math.max(0.06, S.spread * 0.25), focus.s * 1.4); gl.uniform1f(U.uSway, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function wake() { if (raf || lost || !visible || document.hidden) return; last = performance.now(); raf = requestAnimationFrame(frame); }

  addEventListener('pointermove', function (e) {
    var r = box.getBoundingClientRect();
    ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
    ptr.inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', function () { ptr.inside = false; });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; box.classList.remove('is-webgl'); });
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); wake(); }).observe(box);
  new IntersectionObserver(function (en) { visible = en.some(function (x) { return x.isIntersecting; }); wake(); }).observe(box);
  document.addEventListener('visibilitychange', wake);
  resize(); wake();
})();
