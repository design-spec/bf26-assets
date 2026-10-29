/*!
 * BF26 — фон першого екрана: Originkit «Light Bloom» (originkit.dev), код компонента надав користувач.
 * Порт React-компонента на чистий JS, шейдер без змін. Пресет користувача: direction top, base #23094F,
 * accent #2F0D68, speed 42, hover 200 (решта — значення компонента за замовчуванням, variant shafts).
 * Для лендінгу: canvas — найнижчий шар hero (під полем з кільцем), курсор читаємо з усього hero,
 * пауза поза екраном / у фоновій вкладці; при «зменшенні руху» — статичний кадр. Перевизначення — window.BF26_BLOOM.
 */
(function () {
  'use strict';
  var host = document.querySelector('.bf_hero');
  if (!host || host.querySelector('.bf_bloom')) return;

  var P = Object.assign({
    variant: 'shafts', direction: 'top', background: '#000000', baseColor: '#23094F', accentColor: '#2F0D68',
    speed: 42, hover: 200,
    light: { rise: 79, spread: 72 }, shafts: { count: 17, amount: 70, drift: 79 }, finish: { grain: 12, vignette: 25 }
  }, window.BF26_BLOOM || {});

  var MAX_DPR = 2;
  var VERT_SRC = 'attribute vec2 a_pos;\nvoid main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';
  var FRAG_SRC = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2  uRes; uniform float uTime; uniform int uStyle; uniform int uDirection;',
    'uniform vec3  uBg; uniform vec3 uBase; uniform vec3 uAccent;',
    'uniform float uRise; uniform float uSpread; uniform float uOriginX; uniform float uLift;',
    'uniform float uShaftCount; uniform float uShaftAmount; uniform float uShaftDrift; uniform float uGrain; uniform float uVignette;',
    'float h11(float x) { return fract(sin(x * 127.1) * 43758.5453123); }',
    'float vn1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }',
    'void main() {',
    '    vec2 uv = gl_FragCoord.xy / uRes;',
    '    float aspect = uRes.x / uRes.y;',
    '    float t = uTime;',
    '    float breathe = 1.0 + 0.06 * sin(t * 0.35);',
    '    float depth = mix(0.05, 1.20, uSpread);',
    '    vec2 lp; float acrossUv; float edgeCoord;',
    '    if (uDirection == 1) { lp = vec2(uOriginX, 1.0 + depth); acrossUv = uv.x; edgeCoord = 1.0 - uv.y; }',
    '    else if (uDirection == 2) { lp = vec2(-depth / aspect, uOriginX); acrossUv = uv.y; edgeCoord = uv.x; }',
    '    else if (uDirection == 3) { lp = vec2(1.0 + depth / aspect, uOriginX); acrossUv = uv.y; edgeCoord = 1.0 - uv.x; }',
    '    else { lp = vec2(uOriginX, -depth); acrossUv = uv.x; edgeCoord = uv.y; }',
    '    vec2 q = vec2((uv.x - lp.x) * aspect, uv.y - lp.y);',
    '    float d = length(q);',
    '    float k = mix(9.0, 1.4, uRise) / breathe;',
    '    float g = exp(-d * k) / max(exp(-depth * k), 1e-4);',
    '    g = clamp(g, 0.0, 1.0);',
    '    if (uStyle == 1) {',
    '        float sx = acrossUv * uShaftCount;',
    '        float dr = t * uShaftDrift;',
    '        float s = vn1(sx + dr) * 0.6 + vn1(sx * 2.17 - dr * 0.8) * 0.4;',
    '        float mask = smoothstep(0.0, 0.35, edgeCoord);',
    '        g *= mix(1.0, 0.45 + 1.25 * s, uShaftAmount * mask);',
    '    }',
    '    g = clamp(g * (1.0 + uLift * 0.25), 0.0, 1.0);',
    '    vec3 col = mix(uBg, uBase, smoothstep(0.0, 0.68, g));',
    '    col = mix(col, uAccent, smoothstep(0.58, 0.99, g));',
    '    vec2 vc = uv - 0.5;',
    '    vc.x *= aspect;',
    '    col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(vc));',
    '    float rnd = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
    '    col += (rnd - 0.5) * (uGrain * 0.06 + 1.5 / 255.0);',
    '    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function parseColor(input, fb) {
    if (!input) return fb;
    var hex = String(input).trim().replace('#', '');
    if (hex.length === 3 || hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? fb : [r / 255, g / 255, b / 255];
  }
  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { try { console.warn('BF26 bloom:', gl.getShaderInfoLog(sh)); } catch (e) {} return null; }
    return sh;
  }

  var light = Object.assign({ rise: 79, spread: 72 }, P.light), sh = Object.assign({ count: 17, amount: 70, drift: 79 }, P.shafts), fin = Object.assign({ grain: 12, vignette: 25 }, P.finish);
  var V = {
    style: P.variant === 'shafts' ? 1 : 0,
    direction: P.direction === 'top' ? 1 : P.direction === 'left' ? 2 : P.direction === 'right' ? 3 : 0,
    bg: parseColor(P.background, [0, 0, 0]), base: parseColor(P.baseColor, [0.42, 0.17, 0.96]), accent: parseColor(P.accentColor, [0.94, 0.9, 1]),
    rise: light.rise / 100, spread: light.spread / 100, speed: P.speed / 50, hover: P.hover / 100,
    count: Math.max(1, sh.count), amount: sh.amount / 100, drift: sh.drift / 100, grain: fin.grain / 100, vignette: fin.vignette / 100
  };

  var canvas = document.createElement('canvas');
  canvas.className = 'bf_bloom'; canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { canvas.remove(); return; }
  var vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) { canvas.remove(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var posLoc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  var u = {};
  ['uRes', 'uTime', 'uStyle', 'uDirection', 'uBg', 'uBase', 'uAccent', 'uRise', 'uSpread', 'uOriginX', 'uLift',
    'uShaftCount', 'uShaftAmount', 'uShaftDrift', 'uGrain', 'uVignette'].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = 0, last = performance.now(), clock = 0, visible = true, ptr = { x: 0.5, target: 0.5, on: 0, onTarget: 0 };

  function render(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock = (clock + dt * V.speed) % 3600;
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var cw = canvas.clientWidth || 1200, ch = canvas.clientHeight || 800;
    var bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; gl.viewport(0, 0, bw, bh); }
    var kx = 1 - Math.exp(-8 * dt), ko = 1 - Math.exp(-5 * dt);
    ptr.x += (ptr.target - ptr.x) * kx;
    ptr.on += (ptr.onTarget - ptr.on) * ko;
    var originX = 0.5 + (ptr.x - 0.5) * Math.min(1, V.hover) * ptr.on;
    gl.uniform2f(u.uRes, bw, bh);
    gl.uniform1f(u.uTime, clock);
    gl.uniform1i(u.uStyle, V.style);
    gl.uniform1i(u.uDirection, V.direction);
    gl.uniform3f(u.uBg, V.bg[0], V.bg[1], V.bg[2]);
    gl.uniform3f(u.uBase, V.base[0], V.base[1], V.base[2]);
    gl.uniform3f(u.uAccent, V.accent[0], V.accent[1], V.accent[2]);
    gl.uniform1f(u.uRise, V.rise);
    gl.uniform1f(u.uSpread, V.spread);
    gl.uniform1f(u.uOriginX, originX);
    gl.uniform1f(u.uLift, V.hover * ptr.on);
    gl.uniform1f(u.uShaftCount, V.count);
    gl.uniform1f(u.uShaftAmount, V.amount);
    gl.uniform1f(u.uShaftDrift, V.drift);
    gl.uniform1f(u.uGrain, V.grain);
    gl.uniform1f(u.uVignette, V.vignette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = (!reduce && visible && !document.hidden) ? requestAnimationFrame(render) : 0;
  }
  function start() { if (!raf && !reduce && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(render); } }

  // canvas під контентом, тож курсор читаємо з усього hero
  host.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = canvas.getBoundingClientRect();
    if (V.direction === 2 || V.direction === 3) ptr.target = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / (r.height || 1)));
    else ptr.target = Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
    ptr.onTarget = 1;
  }, { passive: true });
  host.addEventListener('pointerleave', function () { ptr.onTarget = 0; });
  if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; start(); }).observe(host);
  document.addEventListener('visibilitychange', start);
  render(performance.now());
  start();
})();
