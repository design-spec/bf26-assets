/*!
 * BF26 — «стіна» текстових відгуків (як React Bits Social Proof 14 + 4):
 * картки з CMS-списку в [data-bf-wall] розкладаються в колонки (2 на ≥768px, 1 на мобільному),
 * колонки нескінченно їдуть вертикально в протилежні боки; пауза при наведенні та поза екраном,
 * prefers-reduced-motion — без руху, колонки просто прокручуються.
 */
(function () {
  'use strict';
  var wall = document.querySelector('[data-bf-wall]');
  if (!wall || wall.getAttribute('data-ready')) return;
  wall.setAttribute('data-ready', '1');
  var items = Array.prototype.slice.call(wall.querySelectorAll('.w-dyn-item'));
  if (!items.length) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPEED = [28, 22];                       // px/с для колонок
  var GAP = 16;
  var cols = [], n = 0, hover = false, visible = true, last = 0, raf = 0;

  var st = document.createElement('style');
  st.textContent =
    '[data-bf-wall]{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%)}' +
    '[data-bf-wall] .w-dyn-list{display:none}' +
    '.bf_tr-col{flex:1 1 0;min-width:0}' +
    '.bf_tr-track{display:flex;flex-direction:column;row-gap:' + GAP + 'px;will-change:transform}' +
    '[data-bf-wall] .bf_tcard{width:auto}' +
    '[data-bf-wall] .is-feat .bf_tcard-text{font-size:19px;line-height:1.45;font-weight:500}' +
    '[data-bf-wall].is-static .bf_tr-col{overflow-y:auto;padding:40px 0}';
  document.head.appendChild(st);

  function build() {
    var want = window.innerWidth >= 768 ? 2 : 1;
    if (want === n) return;
    n = want;
    cols.forEach(function (c) { c.el.remove(); });
    cols = [];
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div'); el.className = 'bf_tr-col';
      var tr = document.createElement('div'); tr.className = 'bf_tr-track';
      el.appendChild(tr); wall.appendChild(el);
      cols.push({ el: el, track: tr, y: 0, setH: 0, dir: i % 2 ? 1 : -1, speed: SPEED[i % SPEED.length] });
    }
    items.forEach(function (it, i) {
      it.classList.remove('is-feat');
      if (i < n) it.classList.add('is-feat');      // перша картка в колонці — більша, як у Social Proof 14
      cols[i % n].track.appendChild(it);
    });
    if (reduce) { wall.classList.add('is-static'); return; }
    cols.forEach(function (c) {
      c.setH = c.track.scrollHeight + GAP;
      // копії, щоб колонка завжди перекривала висоту стіни і не було «шву»
      var orig = Array.prototype.slice.call(c.track.children), k = 0;
      while (c.track.scrollHeight < wall.clientHeight + c.setH && k < 6) {
        orig.forEach(function (o) {
          var cl = o.cloneNode(true); cl.classList.add('is-clone');
          cl.setAttribute('aria-hidden', 'true'); cl.setAttribute('inert', '');
          c.track.appendChild(cl);
        });
        k++;
      }
      c.y = c.dir > 0 ? -c.setH : 0;
      c.track.style.transform = 'translate3d(0,' + c.y + 'px,0)';
    });
  }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    var dt = last ? Math.min((t - last) / 1000, 0.05) : 0; last = t;
    if (hover || !visible || document.hidden) return;
    cols.forEach(function (c) {
      if (!c.setH) return;
      c.y += c.dir * c.speed * dt;
      if (c.y <= -c.setH) c.y += c.setH;
      if (c.y > 0) c.y -= c.setH;
      c.track.style.transform = 'translate3d(0,' + c.y + 'px,0)';
    });
  }

  build();
  if (reduce) return;
  wall.addEventListener('mouseenter', function () { hover = true; });
  wall.addEventListener('mouseleave', function () { hover = false; });
  wall.addEventListener('focusin', function () { hover = true; });
  wall.addEventListener('focusout', function () { hover = false; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(wall);
  }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 200); });
  raf = requestAnimationFrame(tick);
})();
