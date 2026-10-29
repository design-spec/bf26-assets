/*!
 * BF26 — святкові кульки при відкритті сторінки.
 * Основа: balloons-js 0.0.1 (c) Artur Bień, MIT — https://github.com/arturbien/balloons-js
 * Зміни: кольори сторінки (#9762fd, #fe8b21), без blur-фільтра (на macOS Chrome blur з анімацією дає темну смугу),
 * IIFE замість ES-модуля. Підвантажує bf26.js; не запускається при «зменшенні руху». Налаштування — window.BF26_BALLOONS.
 */
(function () {
  'use strict';
  var O = window.BF26_BALLOONS || {};
  var balloonSvgHTML = "\n<svg\n\nstyle=\"width: var(".concat("--balloon-width", "); height: var(").concat("--balloon-height", ");\"\nviewBox=\"0 0 223 609\"\nfill=\"none\"\nxmlns=\"http://www.w3.org/2000/svg\"\n>\n<g opacity=\"0.8\" filter=\"url(#filter0_f_102_49)\" >\n  <path\n    d=\"M117.5 253C136.167 294.5 134.7 395 125.5 453C116.3 511 133.833 578.167 125.5 606\"\n    stroke=\"url(#paint0_linear_102_49)\"\n    stroke-width=\"2\"\n  />\n</g>\n<g opacity=\"0.85\" filter=\"url(#filter1_ii_102_49)\">\n  <path\n    fill-rule=\"evenodd\"\n    clip-rule=\"evenodd\"\n    d=\"M176.876 204.032C181.934 198.064 209.694 160.262 210.899 127.619C213.023 70.1236 176.876 13 118.337 13C55.7949 13 18.5828 69.332 22.2724 127.619C24.0956 156.423 38.9766 178.5 51.7922 195.372C57.7811 203.257 90.0671 238.749 112.15 245.044C111.698 248.246 112.044 253.284 116.338 254H121.838V245.71C143.277 242.292 172.085 209.686 176.876 204.032Z\"\n    fill=\"var(").concat("--balloon-color", ", ").concat("#9762fd", ")\"\n  />\n</g>\n<g filter=\"url(#filter2_f_102_49)\">\n  <path\n    d=\"M125 256.5C125 258.433 122.09 260 118.5 260C114.91 260 112 258.433 112 256.5C112 254.567 114.91 255 118.5 255C122.09 255 125 254.567 125 256.5Z\"\n    fill=\"var(").concat("--balloon-color", ", ").concat("#9762fd", ")\"\n  />\n</g>\n<g opacity=\"0.2\" filter=\"url(#filter3_f_102_49)\">\n  <path\n    d=\"M178.928 128.12C178.011 152.146 172.137 162.97 154.623 184.2C141.594 199.992 128.28 215 112.805 215C104.349 215 92.739 215 65.2673 177.844C56.1123 165.461 45.4818 149.259 44.1794 128.12C41.5436 85.3424 68.1267 44 112.805 44C154.623 44 180.55 85.6242 178.928 128.12Z\"\n    fill=\"url(#paint1_radial_102_49)\"\n  />\n</g>\n<g\n  style=\"mix-blend-mode: lighten\"\n  opacity=\"0.7\"\n  filter=\"url(#filter4_df_102_49)\"\n>\n  <path\n    d=\"M72.7992 108.638L74.0985 87.5247C74.3145 84.0152 77.4883 81.4427 80.9664 81.958L94.8619 84.0166C98.4018 84.541 100.699 88.0277 99.7828 91.4871L94.0502 113.144C93.1964 116.369 89.8758 118.278 86.659 117.394L77.1969 114.792C74.4599 114.039 72.6249 111.471 72.7992 108.638Z\"\n    fill=\"var(").concat("--light-color", ", ").concat("#c9b0ff", ")\"\n  />\n</g>\n<g\n  style=\"mix-blend-mode: lighten\"\n  opacity=\"0.5\"\n  filter=\"url(#filter5_f_102_49)\"\n>\n  <path\n    d=\"M147.76 88.7366L144.842 67.9855C144.378 64.687 141.316 62.3976 138.021 62.8858L123.638 65.0166C120.098 65.541 117.801 69.0277 118.717 72.4871L124.462 94.1891C125.311 97.3967 128.602 99.3061 131.808 98.4512L143.364 95.3695C146.296 94.5878 148.182 91.7409 147.76 88.7366Z\"\n    fill=\"var(").concat("--light-color", ", ").concat("#c9b0ff", ")\"\n  />\n</g>\n<g style=\"mix-blend-mode: lighten\" filter=\"url(#filter6_f_102_49)\">\n  <path\n    d=\"M46.4087 131.164C38.1642 111.726 43.2454 91.2599 47.4381 82.0988C47.7504 81.4164 48.5574 80.8601 48.8712 81.5418C48.9711 81.7589 48.9188 82.1169 48.8357 82.3409C41.2341 102.832 45.5154 122.958 47.3397 130.925C47.8434 133.124 47.2898 133.242 46.4087 131.164Z\"\n    fill=\"var(").concat("--light-color", ", ").concat("#c9b0ff", ")\"\n  />\n</g>\n<g style=\"mix-blend-mode: lighten\" filter=\"url(#filter7_f_102_49)\">\n  <path\n    d=\"M46.4087 131.164C38.1642 111.726 43.2454 91.2599 47.4381 82.0988C47.7504 81.4164 48.5574 80.8601 48.8712 81.5418C48.9711 81.7589 48.9188 82.1169 48.8357 82.3409C41.2341 102.832 45.5154 122.958 47.3397 130.925C47.8434 133.124 47.2898 133.242 46.4087 131.164Z\"\n    fill=\"var(").concat("--light-color", ", ").concat("#c9b0ff", ")\"\n  />\n</g>\n<g opacity=\"0.3\">\n  <g style=\"mix-blend-mode: lighten\" filter=\"url(#filter8_f_102_49)\">\n    <path\n      d=\"M190.817 150.078C196.906 136.754 196.503 119.258 195.396 111.05C195.318 110.475 194.888 109.925 194.734 110.403C194.704 110.495 194.689 110.697 194.699 110.807C196.396 129.344 191.942 144.593 190.447 149.824C190.122 150.959 190.349 151.104 190.817 150.078Z\"\n      fill=\"var(").concat("--light-color", ", ").concat("#c9b0ff", ")\"\n    />\n  </g>\n  <g style=\"mix-blend-mode: lighten\" filter=\"url(#filter9_f_102_49)\">\n    <path\n      d=\"M190.817 150.078C196.906 136.754 196.503 119.258 195.396 111.05C195.318 110.475 194.888 109.925 194.734 110.403C194.704 110.495 194.689 110.697 194.699 110.807C196.396 129.344 191.942 144.593 190.447 149.824C190.122 150.959 190.349 151.104 190.817 150.078Z\"\n      fill=\"var(").concat("--light-color", ", ").concat("#c9b0ff", ")\"\n    />\n  </g>\n</g>\n</svg>\n");
  var svgFiltersHtml = "\n<svg>\n  <defs>\n    <filter\n      id=\"filter0_f_102_49\"\n      x=\"114.588\"\n      y=\"250.59\"\n      width=\"20.5082\"\n      height=\"357.697\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"1\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter1_ii_102_49\"\n      x=\"22.0213\"\n      y=\"13\"\n      width=\"188.967\"\n      height=\"241\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feColorMatrix\n        in=\"SourceAlpha\"\n        type=\"matrix\"\n        values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\"\n        result=\"hardAlpha\"\n      />\n      <feOffset />\n      <feGaussianBlur stdDeviation=\"4.5\" />\n      <feComposite in2=\"hardAlpha\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\" />\n      <feColorMatrix\n        type=\"matrix\"\n        values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0\"\n      />\n      <feBlend\n        mode=\"normal\"\n        in2=\"shape\"\n        result=\"effect1_innerShadow_102_49\"\n      />\n      <feColorMatrix\n        in=\"SourceAlpha\"\n        type=\"matrix\"\n        values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\"\n        result=\"hardAlpha\"\n      />\n      <feOffset />\n      <feGaussianBlur stdDeviation=\"18\" />\n      <feComposite in2=\"hardAlpha\" operator=\"arithmetic\" k2=\"-1\" k3=\"1\" />\n      <feColorMatrix\n        type=\"matrix\"\n        values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0\"\n      />\n      <feBlend\n        mode=\"overlay\"\n        in2=\"effect1_innerShadow_102_49\"\n        result=\"effect2_innerShadow_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter2_f_102_49\"\n      x=\"111\"\n      y=\"253.959\"\n      width=\"15\"\n      height=\"7.04138\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"0.5\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter3_f_102_49\"\n      x=\"0\"\n      y=\"0\"\n      width=\"223\"\n      height=\"259\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"22\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter4_df_102_49\"\n      x=\"46.7878\"\n      y=\"59.8922\"\n      width=\"79.1969\"\n      height=\"87.7179\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feColorMatrix\n        in=\"SourceAlpha\"\n        type=\"matrix\"\n        values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0\"\n        result=\"hardAlpha\"\n      />\n      <feOffset dy=\"4\" />\n      <feGaussianBlur stdDeviation=\"13\" />\n      <feComposite in2=\"hardAlpha\" operator=\"out\" />\n      <feColorMatrix\n        type=\"matrix\"\n        values=\"0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.8 0\"\n      />\n      <feBlend\n        mode=\"overlay\"\n        in2=\"BackgroundImageFix\"\n        result=\"effect1_dropShadow_102_49\"\n      />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"effect1_dropShadow_102_49\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"5.5\"\n        result=\"effect2_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter5_f_102_49\"\n      x=\"102.515\"\n      y=\"46.8202\"\n      width=\"61.3035\"\n      height=\"67.8351\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"8\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter6_f_102_49\"\n      x=\"34\"\n      y=\"73.2313\"\n      width=\"22.9258\"\n      height=\"67.4198\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"4\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter7_f_102_49\"\n      x=\"40\"\n      y=\"79.2313\"\n      width=\"10.9258\"\n      height=\"55.4198\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"1\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter8_f_102_49\"\n      x=\"186.419\"\n      y=\"106.345\"\n      width=\"13.5106\"\n      height=\"48.2987\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"1.93775\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <filter\n      id=\"filter9_f_102_49\"\n      x=\"189.326\"\n      y=\"109.252\"\n      width=\"7.69731\"\n      height=\"42.4855\"\n      filterUnits=\"userSpaceOnUse\"\n      color-interpolation-filters=\"sRGB\"\n    >\n      <feFlood flood-opacity=\"0\" result=\"BackgroundImageFix\" />\n      <feBlend\n        mode=\"normal\"\n        in=\"SourceGraphic\"\n        in2=\"BackgroundImageFix\"\n        result=\"shape\"\n      />\n      <feGaussianBlur\n        stdDeviation=\"0.484439\"\n        result=\"effect1_foregroundBlur_102_49\"\n      />\n    </filter>\n    <linearGradient\n      id=\"paint0_linear_102_49\"\n      x1=\"124.798\"\n      y1=\"253\"\n      x2=\"124.798\"\n      y2=\"606\"\n      gradientUnits=\"userSpaceOnUse\"\n    >\n      <stop stop-color=\"white\" />\n      <stop offset=\"0.474934\" stop-color=\"grey\" stop-opacity=\"0.1\" />\n      <stop offset=\"0.722707\" stop-color=\"white\" stop-opacity=\"0.6\" />\n      <stop offset=\"0.93469\" stop-color=\"grey\" stop-opacity=\"0.7\" />\n      <stop offset=\"1\" stop-color=\"white\" stop-opacity=\"0\" />\n    </linearGradient>\n    <radialGradient\n      id=\"paint1_radial_102_49\"\n      cx=\"0\"\n      cy=\"0\"\n      r=\"1\"\n      gradientUnits=\"userSpaceOnUse\"\n      gradientTransform=\"translate(134 149.5) rotate(-123.69) scale(82.9277 65.4692)\"\n    >\n      <stop />\n      <stop offset=\"1\" stop-opacity=\"0\" />\n    </radialGradient>\n  </defs>\n</svg>\n";

  var easings = ['cubic-bezier(0.22, 1, 0.36, 1)', 'cubic-bezier(0.33, 1, 0.68, 1)'];
  // [відблиск, колір кульки]
  var colorPairs = O.colors || [['#c9b0ffee', '#9762fdff'], ['#ffc27aee', '#fe8b21ff']];
  var speed = O.speed || 1;                        // 1 = як в оригіналі (≈25–30 с), 2 = удвічі швидше

  function createBalloon(color, light, width) {
    var b = document.createElement('div');
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = balloonSvgHTML;
    Object.assign(b.style, {
      position: 'absolute', overflow: 'hidden', top: '0', left: '0', display: 'inline-block',
      isolation: 'isolate', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden', opacity: '0.001',
      transform: 'translate(calc(-100% + 1px), calc(-100% + 1px))', contain: 'style, layout, paint',
      transformOrigin: width / 2 + 'px ' + width / 2 + 'px', willChange: 'transform'
    });
    b.style.setProperty('--balloon-color', color);
    b.style.setProperty('--light-color', light);
    b.style.setProperty('--balloon-width', width + 'px');
    b.style.setProperty('--balloon-height', (width * 609) / 223 + 'px');
    return b;
  }

  function animate(b, p, zIndex) {
    b.style.zIndex = String(zIndex);
    var tilt = Math.random() * 7 + 8, dir = Math.random() < 0.5 ? 1 : -1;
    var t = function (x, y, z, a) { return 'translate(-50%, 0%) translate3d(' + x + 'px, ' + y + 'px, ' + z + 'px) rotate3d(0, 0, 1, ' + a + 'deg)'; };
    return b.animate([
      { transform: t(p.x, p.y, p.z, -dir * tilt), opacity: 1 },
      { transform: t(p.x + (p.tx - p.x) / 2, p.y + p.ty * 2.5, p.z, dir * tilt), opacity: 1, offset: 0.5 },
      { transform: t(p.tx, p.y + p.ty * 5, p.z, -dir * tilt), opacity: 1 }
    ], {
      duration: (Math.random() * 1000 + 5000) * 5 / speed,
      easing: easings[Math.floor(Math.random() * easings.length)],
      delay: zIndex * 200 / speed
    });
  }

  function balloons() {
    var box = document.createElement('div');
    box.className = 'bf_balloons';
    box.setAttribute('aria-hidden', 'true');
    Object.assign(box.style, {
      overflow: 'hidden', position: 'fixed', inset: '0', zIndex: '999', display: 'block', pointerEvents: 'none',
      perspective: '1500px', perspectiveOrigin: '50vw 100vh', contain: 'style, layout, paint'
    });
    document.documentElement.appendChild(box);
    var W = window.innerWidth, H = window.innerHeight;
    var bh = Math.floor(Math.min(W, H)), bw = (233 / 609) * bh;
    var amount = O.amount || Math.max(7, Math.round(W / (bw / 2)));
    var maxDist = Math.max((amount * bw) / 2, (bw / 2) * 10);
    var pos = [];
    for (var i = 0; i < amount; i++) {
      var x = Math.round(W * Math.random());
      pos.push({ x: x, y: H, z: Math.round(-Math.random() * maxDist), tx: Math.round(x + Math.random() * bw * 6 * (Math.random() > 0.5 ? 1 : -1)), ty: -H });
    }
    pos.sort(function (a, b) { return a.z - b.z; });
    var zMax = pos[pos.length - 1].z;
    var defs = document.createElement('div');
    defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    defs.innerHTML = svgFiltersHtml;
    box.appendChild(defs);
    var items = pos.map(function (p, i) {
      p.z -= zMax;
      var c = colorPairs[i % colorPairs.length], b = createBalloon(c[1], c[0], bw);
      box.appendChild(b);
      return { b: b, p: p, z: i + 1 };
    });
    requestAnimationFrame(function () {
      Promise.all(items.map(function (it) {
        return animate(it.b, it.p, it.z).finished.then(function () { it.b.remove(); });
      })).then(function () { box.remove(); });
    });
  }

  if (!Element.prototype.animate) return;
  balloons();
})();
