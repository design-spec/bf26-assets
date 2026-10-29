/*!
 * BF26 — фон першого екрана «поле з кільцем»: сітка коротких рисок, кільце їде за курсором,
 * розштовхує риски й підсвічує їх; без курсора (сенсорні екрани) кільце повільно блукає.
 * Власна реалізація на Canvas 2D за мотивами originkit «Cursor Ring Field» (без їхнього коду).
 * Підвантажує bf26.js; при «зменшенні руху» — один статичний кадр. Налаштування — window.BF26_RING.
 */
(function () {
  'use strict';
  var host = document.querySelector('.bf_hero');
  if (!host || host.querySelector('.bf_ring')) return;

  var O = Object.assign({
    background: '#04050A',
    colors: ['#170332', '#290857'],   // далеке поле → ближче до кільця
    hot: '#4f22c0',                    // смуга кільця
    spacing: 26,                       // крок сітки, px — «Density 300»: рідке поле
    radius: .4,                        // радіус кільця, частка ширини — «Camera Distance 150»: кільце майже на весь екран
    width: 150,                        // ширина смуги кільця, px
    push: 14,                          // наскільки смуга розштовхує точки, px
    dash: 5.5,                         // довжина точки-овалу, px — «Dot Size 85%»
    thick: 3,                          // товщина точки, px
    speed: .6,                         // загальна швидкість — «Speed 10»: повільно
    drift: 3                           // амбієнтне «дихання» поля, px
  }, window.BF26_RING || {});

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.className = 'bf_ring'; canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);

  var W = 0, H = 0, dpr = 1, pts = [], visible = true, raf = 0, t0 = performance.now();
  var ring = { x: 0, y: 0 }, target = { x: 0, y: 0 }, pointer = null;

  function hex(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var C0 = hex(O.colors[0]), C1 = hex(O.colors[1] || O.colors[0]), CH = hex(O.hot);
  // 6 рівнів яскравості — риски малюємо пачками по кольору, а не по одній
  var LEVELS = 6, palette = [];
  for (var l = 0; l < LEVELS; l++) {
    var k = l / (LEVELS - 1), a = k < .5 ? C0 : C1, b = k < .5 ? C1 : CH, f = k < .5 ? k * 2 : (k - .5) * 2;
    palette.push('rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * f); }).join(',') + ')');
  }

  function build() {
    var r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var step = W < 600 ? O.spacing - 6 : O.spacing;
    pts = [];
    for (var y = step / 2; y < H; y += step) {
      for (var x = step / 2; x < W; x += step) {
        // псевдовипадковий зсув і фаза — стабільні між перебудовами
        var s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, j = s - Math.floor(s);
        pts.push({ x: x + (j - .5) * step * .8, y: y + ((j * 7) % 1 - .5) * step * .8, p: j * 6.283, a: j * 3.1416 });
      }
    }
    if (!ring.x) { ring.x = target.x = W * .6; ring.y = target.y = H * .5; }
  }

  function frame(now) {
    var t = (now - t0) / 1000 * O.speed;
    if (!pointer) {   // блукання без курсора
      target.x = W * (.55 + .25 * Math.sin(t * .23)); target.y = H * (.5 + .28 * Math.sin(t * .31 + 1.3));
    }
    var k = pointer ? .12 : .02;
    ring.x += (target.x - ring.x) * k; ring.y += (target.y - ring.y) * k;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = O.background; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineWidth = O.thick;

    var buckets = [];
    for (var b = 0; b < LEVELS; b++) buckets.push([]);
    var R = Math.max(W, H) * O.radius * (1 + .03 * Math.sin(t * 1.3)), w = O.width / 2;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], dx = p.x - ring.x, dy = p.y - ring.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var band = Math.exp(-((d - R) * (d - R)) / (w * w));          // 0…1, пік на колі
      var inner = d < R ? .25 * (1 - d / R) : 0;                     // легке підсвічування всередині
      var shimmer = .5 + .5 * Math.sin(t * 1.7 + p.p);
      var lvl = Math.min(LEVELS - 1, Math.floor((band * .95 + inner * .6 + shimmer * .18) * LEVELS));
      if (lvl < 1 && shimmer < .55) continue;                        // частину далеких точок не малюємо — поле «мерехтить»
      var off = band * O.push, ox = dx / d * off, oy = dy / d * off;
      var dr = O.drift * Math.sin(t * .8 + p.p);
      var x = p.x + ox + dr, y = p.y + oy + dr * .6;
      var ang = Math.atan2(dy, dx) + 1.5708 + (p.a - 1.57) * .35 + Math.sin(t * .5 + p.p) * .2, len = O.dash * (.7 + band * .5) / 2;
      buckets[lvl].push(x - Math.cos(ang) * len, y - Math.sin(ang) * len, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    }
    for (b = 0; b < LEVELS; b++) {
      var L = buckets[b]; if (!L.length) continue;
      ctx.strokeStyle = palette[b]; ctx.beginPath();
      for (var q = 0; q < L.length; q += 4) { ctx.moveTo(L[q], L[q + 1]); ctx.lineTo(L[q + 2], L[q + 3]); }
      ctx.stroke();
    }
    if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame); else raf = 0;
  }
  function start() { if (!raf && !reduce) raf = requestAnimationFrame(frame); }

  host.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = host.getBoundingClientRect();
    pointer = true; target.x = e.clientX - r.left; target.y = e.clientY - r.top;
  }, { passive: true });
  host.addEventListener('pointerleave', function () { pointer = null; }, { passive: true });
  if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(host);
  document.addEventListener('visibilitychange', start);
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { build(); if (reduce) frame(performance.now()); }, 150); });

  build();
  frame(performance.now());
})();
