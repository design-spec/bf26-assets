/*!
 * RT26 — сторінка повернення для ретаргетингу Facebook (kid.allright.com/{мова}/back), ТЗ v2.1 від 03.11.2026.
 * Конфіг (тексти мови, ціни, ринки) — window.RT26_CONFIG у footer сторінки; дедлайн і варіанти — інлайн-скрипт у head.
 * Сабміт форми робить allright.com/webflow/index.js (form.onsubmit, POST /api/v1/users?go-to=true);
 * ми блокуємо нативний сабміт Webflow, викликаємо обробник index.js вручну і ловимо відповідь обгорткою fetch.
 * Дебаг: window.RT26, ?rt_debug=1, ?rt_state=ended, ?_t2=1 (index.js не відправляє, ми емулюємо успіх).
 */
(function () {
  'use strict';
  var CFG = window.RT26_CONFIG || {};
  var T = CFG.texts || {};
  var doc = document, html = doc.documentElement;
  var params = new URLSearchParams(location.search);
  var DEBUG = CFG.debug || params.has('rt_debug');
  var LOCALE = ((location.pathname.split('/')[1] || '') + '').toLowerCase();
  if ((CFG.langs || []).indexOf(LOCALE) < 0) LOCALE = CFG.locale || 'uk';
  var DEADLINE_MS = Date.parse(window.RT26_DEADLINE || CFG.deadline || '2026-11-30T21:59:59Z');

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function log() { if (DEBUG) try { console.log.apply(console, ['[rt26]'].concat([].slice.call(arguments))); } catch (e) {} }
  function tpl(s, o) { return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return o && k in o ? o[k] : m; }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uuid() { return 'rt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }

  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var K = { branch: 'rt26_branch', age: 'rt26_age', lead: 'rt26_lead', quiz: 'rt26_quiz', pkg: 'rt26_pkg', attr: 'rt26_attr', cc: 'rt26_cc' };

  /* ---------------------------------------------------------------- ринок, зона цін */

  var MARKET = String(params.get('utm_market') || CFG.market || '').toUpperCase();
  var EU = (CFG.euMarkets || []).indexOf(MARKET) > -1;
  if (EU) html.setAttribute('data-rt-eu', ''); else html.removeAttribute('data-rt-eu');
  function zoneFor(mk) {
    if (!mk) return CFG.generalZone || 'general-usd';
    if ((CFG.zoneByMarket || {})[mk]) return CFG.zoneByMarket[mk];
    return (CFG.noPlanMarkets || []).indexOf(mk) > -1 ? null : (CFG.generalZone || 'general-usd');
  }
  var ZONE = zoneFor(MARKET);
  var PLAN = ZONE ? (CFG.plans || {})[ZONE] : null;

  /* ---------------------------------------------------------------- варіанти (head ставить data-rt-v до першого кадру) */

  function variantKey() {
    if (Date.now() >= DEADLINE_MS || params.get('rt_state') === 'ended') return 'ended';
    if (params.get('offer') === 'off') return 'off';
    return params.get('h') === 'bf' ? 'bf' : 'own';
  }
  function syncVariant() { var v = variantKey(); if (html.getAttribute('data-rt-v') !== v) html.setAttribute('data-rt-v', v); return v; }
  function offerOn() { var v = syncVariant(); return v === 'own' || v === 'bf'; }

  /* ---------------------------------------------------------------- атрибуція */

  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_market', 'gclid', 'fbclid', 'ttclid'];
  var MARK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'ttclid'];
  var ATTR = (function () {
    var saved = store.get(K.attr) || {};
    if (MARK_KEYS.some(function (k) { return params.get(k); })) { saved = {}; ATTR_KEYS.forEach(function (k) { if (params.get(k)) saved[k] = params.get(k); }); }
    if (params.get('utm_market')) saved.utm_market = params.get('utm_market');
    store.set(K.attr, saved);
    return saved;
  })();
  function hasCookieUtm() { var c = doc.cookie; try { c = decodeURIComponent(c); } catch (e) {} return /utm_source/.test(c); }
  function attrValues() {
    var out = {};
    ATTR_KEYS.forEach(function (k) { out[k] = ATTR[k] || ''; });
    var real = MARK_KEYS.some(function (k) { return out[k]; });
    if (!real && !hasCookieUtm()) Object.keys(CFG.defaultUtm || {}).forEach(function (k) { if (!out[k]) out[k] = CFG.defaultUtm[k]; });
    return out;
  }
  // обраний пакет: S.pkg = «6 місяців · 3 на тиждень» → { months: 6, freq: 3 }
  function pkgInfo() {
    if (!S.pkg) return null;
    var t = (T.terms || []).filter(function (x) { return S.pkg.indexOf(x[0] + ' · ') === 0; })[0];
    var m = S.pkg.match(/·\s*(\d+)/);
    return t ? { months: t[1], freq: m ? +m[1] : freq() } : null;
  }
  // сторінка цін allright.com/{мова}/app/price одразу показує обраний пакет: planSubType (термін, CFG.planSubTypes)
  // і planQtyPerWeek (уроків на тиждень); без обраного пакета — лише кількість уроків з перемикача
  function priceUrl() {
    var q = {}, info = pkgInfo(), st = info && (CFG.planSubTypes || {})[info.months];
    if (st) q.planSubType = st;
    q.planQtyPerWeek = info ? info.freq : freq();
    var a = attrValues(); Object.keys(a).forEach(function (k) { if (a[k]) q[k] = a[k]; });
    q.quiz_version = CFG.quizVersion;
    return 'https://allright.com/' + LOCALE + '/app/price?' + new URLSearchParams(q).toString();
  }
  function syncPayLinks() { $$('[data-rt-pay]').forEach(function (a) { a.href = priceUrl(); }); }

  /* ---------------------------------------------------------------- аналітика */

  var queue = [];
  var consentOk = !EU || !CFG.consent || !CFG.consent.required;
  function track(name, p) {
    var payload = { locale: LOCALE, market: MARKET || '', quiz_version: CFG.quizVersion, variant: html.getAttribute('data-rt-theme') || 'light',
      headline: params.get('h') === 'bf' ? 'bf' : 'own', offer: params.get('offer') === 'off' ? 'off' : 'on', ft: params.get('ft') === 'popup' ? 'popup' : 'inline' };
    Object.keys(p || {}).forEach(function (k) { payload[k] = p[k]; });
    if (!consentOk) { queue.push([name, payload]); return; }
    log(name, payload);
    try { if (CFG.analytics && CFG.analytics.send) CFG.analytics.send(name, payload); } catch (e) {}
  }
  doc.addEventListener('rt26:consent', function (e) {
    if (e.detail && e.detail.analytics) { consentOk = true; while (queue.length) { var q = queue.shift(); track(q[0], q[1]); } } else queue.length = 0;
  });

  /* ---------------------------------------------------------------- прокрутка */

  function barH() { var b = $('.rt_bar'); return b ? b.getBoundingClientRect().height : 0; }
  function scrollToEl(el) {
    if (!el) return;
    setTimeout(function () {
      var y = el.getBoundingClientRect().top + pageYOffset - barH() - 16;
      scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }, 60);
  }

  /* ---------------------------------------------------------------- стан */

  // квіз — 3 кроки (рішення 10.11): крок 4 «Тепер оберіть пакет» прибрано, кнопка кроку 3 одразу веде до цін
  var QUIZ_STEPS = 3;
  var Q = store.get(K.quiz) || {};
  if (!Q.step) Q.step = 1;
  if (Q.step > QUIZ_STEPS) Q.step = QUIZ_STEPS;           // збережений крок 4 зі старої версії квізу
  if (!Q.a) Q.a = {};
  var S = { branch: store.get(K.branch) || 'none', pkg: store.get(K.pkg) || '', lead: store.get(K.lead) || null, fails: 0 };
  function freq() { return +(Q.a.freq || 3) === 2 ? 2 : 3; }
  function saveQ() { store.set(K.quiz, Q); }

  /* ---------------------------------------------------------------- гілки */

  function setBranch(v, silent) {
    var b = v === 'yes' ? 'yes' : (v === 'no' || v === 'unsure') ? 'no' : 'none';
    S.branch = b;
    html.setAttribute('data-rt-branch', b);
    if (b === 'none') store.del(K.branch); else store.set(K.branch, b);
    $$('[data-rt-answer-label]').forEach(function (el) { el.textContent = b === 'yes' ? (T.answerYes || '') : (T.answerNo || ''); });
    fillAllHidden();
    renderQuiz();
    dwSync();
    repeatSync();
    if ((!silent || silent === 'stay') && b !== 'none') {   // silent === 'stay' — вибір у фінальному блоці: подія є, прокрутки немає
      track('rt_branch_select', { value: v === 'unsure' ? 'unsure' : b === 'yes' ? 'trial_yes' : 'trial_no', place: silent === 'stay' ? 'repeat' : 'top' });
      if (b === 'yes') track('rt_quiz_step', { step: Q.step, doubt: Q.doubt || 'none' });
      if (!silent) scrollToEl(b === 'yes' ? $('#rt-quiz') : $('#rt-time'));
    }
  }

  /* ---------------------------------------------------------------- ціни */

  // як на allright.com/{мова}/app/price: розряди через пробіл, копійки після коми — «4 595,04 ₴»
  function num2(n) { return (+n).toLocaleString(T.numLocale || 'uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money(n) {
    var cur = PLAN ? PLAN.cur : '';
    var s = num2(n);
    return (PLAN && PLAN.curBefore) ? cur + s : s + '\u00a0' + cur;
  }
  // ціна за урок як на сторінці цін: велике ціле, поруч дрібно «,38 ₴», під ним «за урок»
  function priceHtml(n) {
    var cur = PLAN ? PLAN.cur : '', s = num2(n), dp = (T.decimal || ','), i = s.lastIndexOf(dp);
    if (i < 0) { dp = /[.,]\d\d$/.test(s) ? s.charAt(s.length - 3) : ''; i = dp ? s.length - 3 : s.length; }
    var whole = s.slice(0, i), dec = s.slice(i);
    if (PLAN && PLAN.curBefore) whole = cur + whole; else dec += '\u00a0' + cur;
    return '<span class="rt_pr"><span class="rt_pr-int">' + esc(whole) + '</span><span class="rt_pr-side"><span class="rt_pr-dec">' + esc(dec) +
      '</span><span class="rt_pr-per">' + esc(T.perLesson || '') + '</span></span></span>';
  }
  function money0(n) {
    var cur = PLAN ? PLAN.cur : '';
    var s = Math.round(n).toLocaleString(T.numLocale || 'uk-UA');
    return (PLAN && PLAN.curBefore) ? cur + s : s + ' ' + cur;
  }
  // Перемикач «Уроків на тиждень» — сегментований, як pricing-12 у reactbits: «2 уроки | 3 уроки», повзунок їздить під активним (без бейджа — рішення 10.11).
  // Кнопки ті самі [data-rt-freq] (клік ловить спільний обробник), змінюється лише розмітка; фінальний блок копіює її (setupRepeat).
  function setupFreqToggle() {
    $$('[data-rt-freqwrap]').forEach(function (w) {
      var chips = $$('[data-rt-freq]', w); if (chips.length < 2 || $('.rt_seg', w)) return;
      var seg = doc.createElement('div'); seg.className = 'rt_seg'; seg.setAttribute('role', 'group');
      var lb = $('.rt_freq-label', w); if (lb) seg.setAttribute('aria-label', lb.textContent.replace(/:\s*$/, ''));
      seg.innerHTML = '<span class="rt_seg-thumb" aria-hidden="true"></span>'; seg.setAttribute('data-on', freq());
      chips.forEach(function (c) {
        var n = c.getAttribute('data-rt-freq');
        c.className = 'rt_seg-opt';
        c.innerHTML = '<span>' + esc(tpl(T.freqOpt || '{n} уроки', { n: n })) + '</span>';
        seg.appendChild(c);
      });
      w.appendChild(seg);
    });
  }
  function renderPrices() {
    var f = freq(), rows = PLAN ? PLAN.f[f] : null, lpm = (CFG.lessonsPerMonth || { 2: 8, 3: 12 })[f];
    html.toggleAttribute('data-rt-noplan', !PLAN);
    $$('[data-rt-freq]').forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-rt-freq') === f ? 'true' : 'false'); });
    $$('.rt_seg').forEach(function (s) { s.setAttribute('data-on', f); });
    $$('[data-rt-freqn]').forEach(function (el) { el.textContent = f; });
    $$('[data-rt-price]').forEach(function (el) {
      var k = el.getAttribute('data-rt-price');
      if (!rows) { el.textContent = T.noZonePrice || '—'; return; }
      var v = k === 'm1' ? rows.m[0] : k === 'm12' ? rows.m[3] : k === 'inst12' ? (rows.i[2] != null ? rows.i[2] : rows.m[3]) : null;
      el.textContent = v != null ? money(v) : (T.noZonePrice || '—');
    });
    var bestM = 0;                                     // найдовший доступний термін = найнижча ціна за урок
    if (rows) (T.terms || []).forEach(function (t, idx) { if (rows.m[idx] != null && t[1] > bestM) bestM = t[1]; });
    $$('[data-rt-packages]').forEach(function (box) {
      box.innerHTML = '';
      if (!rows) return;
      (T.terms || []).forEach(function (t, idx) {
        var months = t[1], per = rows.m[idx], inst = idx > 0 ? rows.i[idx - 1] : null;
        if (per == null) return;                       // план вимкнений на сторінці цін (курсив у payment_plans_by_zone.xlsx)
        var label = t[0] + ' · ' + tpl(T.perWeekShort || '{n} на тиждень', { n: f });
        var sel = S.pkg === label;
        var card = doc.createElement('div');
        card.className = 'rt_pkg' + (months === bestM ? ' is-best' : '') + (sel ? ' is-sel' : '');
        card.setAttribute('role', 'button'); card.tabIndex = 0;
        card.setAttribute('aria-pressed', sel ? 'true' : 'false');
        card.setAttribute('data-rt-pkg', label);
        card.innerHTML =
          (months === bestM ? '<div class="rt_pkg-tag">' + esc(T.bestTag || '') + '</div>' : '') +
          '<div class="rt_pkg-name">' + esc(t[0]) + '</div>' +
          '<div class="rt_pkg-sub">' + esc(tpl(T.pkgLessons || '{n} уроків', { n: months * lpm })) + '</div>' +
          '<div class="rt_pkg-price">' + priceHtml(per) + '</div>' +
          '<div class="rt_pkg-month">' + esc(tpl(T.perMonth || '', { sum: money0(per * lpm), n: lpm })) + '</div>' +
          '<div class="rt_pkg-inst">' + esc(inst != null ? tpl(T.installments || '', { p: money(inst) }) : idx === 0 ? (T.payMonthly || '') : (T.payUpfront || '')) + '</div>' +
          (EU ? '<div class="rt_pkg-omni" data-rt-variant="own bf">' + esc(tpl(T.omnibus || '', { p: money(per) })) + '</div>' : '');
        function pick() { pickPkg(label, f, 'prices'); }
        card.addEventListener('click', pick);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        box.appendChild(card);
      });
    });
    // фінальний блок, гілка «так»: компактні плитки пакетів (той самий вибір, що й у блоці цін)
    $$('[data-rt-minipkgs]').forEach(function (box) {
      box.innerHTML = '';
      if (!rows) return;
      (T.terms || []).forEach(function (t, idx) {
        var months = t[1], per = rows.m[idx];
        if (per == null) return;
        var label = t[0] + ' · ' + tpl(T.perWeekShort || '{n} на тиждень', { n: f });
        var sel = S.pkg === label;
        var b = doc.createElement('button'); b.type = 'button';
        b.className = 'rt_mpkg' + (months === bestM ? ' is-best' : '') + (sel ? ' is-sel' : '');
        b.setAttribute('aria-pressed', sel ? 'true' : 'false'); b.setAttribute('data-rt-pkg', label);
        b.innerHTML = '<span class="rt_mpkg-name">' + esc(t[0]) + '</span><span class="rt_mpkg-price">' + priceHtml(per) + '</span>' +
          (months === bestM ? '<span class="rt_mpkg-tag">' + esc(T.bestShort || T.bestTag || '') + '</span>' : '');
        b.addEventListener('click', function () { pickPkg(label, f, 'repeat'); });
        box.appendChild(b);
      });
    });
    renderPkgLabel();
  }
  function pickPkg(label, f, place) {
    S.pkg = label; store.set(K.pkg, label);
    $$('.rt_pkg, .rt_mpkg').forEach(function (c) { var on = c.getAttribute('data-rt-pkg') === label; c.classList.toggle('is-sel', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    renderPkgLabel(); fillAllHidden();
    track('rt_package_select', { package: label, freq: f, place: place || 'prices' });
  }
  function renderPkgLabel() { $$('[data-rt-pkg-label]').forEach(function (el) { el.textContent = S.pkg || T.pkgNone || ''; }); syncPayLinks(); }

  /* ---------------------------------------------------------------- квіз-розігрів */

  function renderQuiz() {
    $$('[data-rt-step]').forEach(function (s) { s.classList.toggle('is-on', +s.getAttribute('data-rt-step') === Q.step); });
    $$('#rt-quiz [data-rt-doubt]').forEach(function (v) { v.classList.toggle('is-on', v.getAttribute('data-rt-doubt') === (Q.doubt || 'think')); });
    $$('[data-rt-q]').forEach(function (o) {
      var q = o.getAttribute('data-rt-q'), v = o.getAttribute('data-rt-v');
      var on = q === 'doubt' ? Q.doubt === v : Q.a[q] === v;
      o.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-rt-progress]').forEach(function (el) { el.textContent = tpl(T.progress || 'Крок {n} з 3', { n: Q.step }); });
    $$('[data-rt-progress-bar]').forEach(function (el) { el.style.width = (Q.step / QUIZ_STEPS * 100) + '%'; });
    $$('#rt-quiz .rt_back').forEach(function (el) { el.hidden = Q.step < 2; });
    renderPrices();
  }
  function quizStep(n) {
    Q.step = n; saveQ(); renderQuiz();
    track('rt_quiz_step', { step: n, doubt: Q.doubt || 'none' });
    scrollToEl($('#rt-quiz'));
  }
  // рядок «Пробний урок: ще не було · змінити» — у картці квізу (гілка «так») і форми (гілка «ні»), як «Вік: 6 · змінити»;
  // замість плашки-відповіді на першому екрані (її ховає CSS). «змінити» — [data-rt-change]: скидає гілку і веде до питання
  function setupTrialRow() {
    [$('#rt-quiz .rt_quiz-head'), $('#rt-time .rt_form-head')].forEach(function (box) {
      if (!box || $('.rt_trialrow', box)) return;
      var row = doc.createElement('div'); row.className = 'rt_trialrow';
      row.innerHTML = esc(T.trialLabel || 'Пробний урок:') + ' <b data-rt-answer-label>' + esc(S.branch === 'yes' ? (T.answerYes || '') : (T.answerNo || '')) + '</b> · <a href="#" class="rt_link" data-rt-change>' + esc(T.change || 'змінити') + '</a>';
      var before = $('.rt_progress', box);
      if (before) box.insertBefore(row, before); else box.appendChild(row);
    });
  }
  // крок 3 — останній: його кнопка стає «Подивитись пакети» (текст і дія з кнопки кроку 4 Webflow), крок 4 ховається (CSS)
  function setupQuizEnd() {
    var b3 = $('#rt-quiz [data-rt-step="3"] [data-rt-next]'), b4 = $('#rt-quiz [data-rt-step="4"] [data-rt-done]');
    if (!b3) return;
    b3.removeAttribute('data-rt-next');
    b3.setAttribute('data-rt-done', b4 ? b4.getAttribute('data-rt-done') || 'packages' : 'packages');
    if (b4) b3.textContent = b4.textContent.trim();
  }
  // Фінальний блок (ТЗ блок 6): у гілці «так» — вибір пакета на місці (перемикач уроків на тиждень + плитки), «Обрати пакет» не потрібна;
  // підзаголовок під стан (T.repeatLead.yes/no; без відповіді — текст із Webflow); рядок довіри під діями (T.trust.pay/trial)
  var repeatSync = function () {};
  function setupRepeat() {
    var box = $('#rt-repeat .rt_repeat'); if (!box) return;
    var yes = $('.rt_repeat-yes', box), btns = yes && $('.rt_repeat-btns', yes);
    if (yes && btns && !$('[data-rt-minipkgs]', yes)) {
      var mini = doc.createElement('div'); mini.className = 'rt_mini';
      var fw = $('[data-rt-freqwrap]');
      mini.innerHTML = '<div class="rt_mini-freq">' + (fw ? fw.innerHTML : '') + '</div><div class="rt_mini-pkgs" data-rt-minipkgs role="group"></div>';
      $$('a', mini).forEach(function (a) { a.removeAttribute('href'); a.setAttribute('role', 'button'); a.tabIndex = 0; });
      yes.insertBefore(mini, btns);
    }
    var lead = $('.rt_repeat-lead', box), base = lead ? lead.textContent : '';
    var L = T.repeatLead || {}, TR = T.trust || {};
    var trust = doc.createElement('p'); trust.className = 'rt_trust'; box.appendChild(trust);
    repeatSync = function () {
      var b = S.branch;
      if (lead) lead.textContent = (b === 'yes' ? L.yes : b === 'no' ? L.no : '') || base;
      var t = b === 'no' ? TR.trial : TR.pay;
      trust.hidden = !t; trust.innerHTML = t ? t.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') : '';
    };
    repeatSync();
    renderPrices();
  }

  // кнопка «Назад» квізу — одна, маленька, зліва під прогрес-баром; видно на кроках 2–4 (renderQuiz ховає на кроці 1)
  function setupQuizBack() {
    var head = $('#rt-quiz .rt_quiz-head'); if (!head || $('.rt_back', head)) return;
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'rt_back'; b.hidden = Q.step < 2;
    b.innerHTML = '<span class="rt_back-ico" aria-hidden="true"></span>' + esc(T.back || 'Назад');
    b.addEventListener('click', function () {
      if (Q.step < 2) return;
      var from = Q.step; Q.step = from - 1; saveQ(); renderQuiz();
      track('rt_quiz_back', { from: from, to: Q.step, doubt: Q.doubt || 'none' });
      var q = $('#rt-quiz'); if (q && q.getBoundingClientRect().top < 0) scrollToEl(q);
      if (b.hidden) { var t = $('#rt-quiz [data-rt-step].is-on [data-rt-q]'); if (t) t.focus({ preventScroll: true }); }
    });
    var bar = $('.rt_progress-track', head);
    if (bar && bar.nextSibling) head.insertBefore(b, bar.nextSibling); else head.appendChild(b);
  }
  function onOption(o) {
    var q = o.getAttribute('data-rt-q'), v = o.getAttribute('data-rt-v');
    if (q === 'doubt') {
      Q.doubt = v; Q.step = 2; saveQ();
      track('rt_quiz_answer', { step: 1, field: 'doubt', value: v });
      renderQuiz(); fillAllHidden();
      track('rt_quiz_step', { step: 2, doubt: v });
      scrollToEl($('#rt-quiz'));
      return;
    }
    Q.a[q] = Q.a[q] === v ? undefined : v;            // повторний клік знімає відповідь (уточнення необов'язкове)
    if (Q.a[q] === undefined) delete Q.a[q];
    saveQ();
    if (Q.a[q]) track('rt_quiz_answer', { step: Q.step, field: q, value: v });
    if (q === 'freq' && Q.a[q]) track('rt_freq_select', { freq: +v, place: 'quiz' });
    renderQuiz(); fillAllHidden();
  }

  /* ---------------------------------------------------------------- блок «Що зазвичай зупиняє?» */

  // Блок «Що зазвичай зупиняє?»: інтерактив «крок 1 + крок 2 = відповідь» (референс: englishdom-speaking-boost, «Курс підлаштовується під тебе»).
  // Крок 1 — сумнів (картки [data-rt-dcard] з Webflow — джерело назв), крок 2 — «Пробний урок уже був?» (спільний стан з першим екраном),
  // відповідь — аргумент із кроку 2 квізу (#rt-quiz [data-rt-doubt] .rt_arg) і кнопка наступного кроку.
  // Без JS лишаються статичні картки Webflow.
  var dwSync = function () {};
  var ICON = {
    doubt: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/></svg>',
    trial: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/></svg>',
    res: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/></svg>'
  };
  function setupDoubts() {
    var cards = $$('[data-rt-dcard]');
    var grid = cards.length ? cards[0].parentNode : null;
    if (!grid) return;
    var D = T.dw || {};
    var doubts = cards.map(function (c) {
      var t = c.querySelector('.rt_dcard-title');
      return { k: c.getAttribute('data-rt-dcard'), label: (t ? t.textContent : c.textContent).replace(/[«»"]/g, '').trim() };
    });
    var yesB = $('#rt-top [data-rt-branch="yes"]'), noB = $('#rt-top [data-rt-branch="no"]');
    var trials = [{ k: 'yes', label: yesB ? yesB.textContent.trim() : 'Так' }, { k: 'no', label: noB ? noB.textContent.trim() : 'Ні' }];
    var sel = { d: doubts.some(function (x) { return x.k === Q.doubt; }) ? Q.doubt : doubts[0].k };

    function chips(list, kind) {
      return list.map(function (x) { return '<button type="button" class="rt_dw-chip" data-dw-' + kind + '="' + esc(x.k) + '" aria-pressed="false">' + esc(x.label) + '</button>'; }).join('');
    }
    function head(icon, k, s) { return '<div class="rt_dw-head"><span class="rt_dw-ico">' + ICON[icon] + '</span><span><span class="rt_dw-k">' + esc(k) + '</span><span class="rt_dw-s">' + esc(s) + '</span></span></div>'; }
    var w = doc.createElement('div'); w.className = 'rt_dw'; w.setAttribute('data-rt-dw', '');
    w.innerHTML =
      '<div class="rt_dw-in">' +
      '<div class="rt_dw-card">' + head('doubt', D.k1 || 'Що зупиняє', D.s1 || 'Крок 1') + '<div class="rt_dw-chips" role="group" aria-label="' + esc(D.k1 || '') + '">' + chips(doubts, 'd') + '</div></div>' +
      '<div class="rt_dw-op" aria-hidden="true">+</div>' +
      '<div class="rt_dw-card">' + head('trial', D.k2 || 'Пробний урок уже був?', D.s2 || 'Крок 2') + '<div class="rt_dw-chips" role="group" aria-label="' + esc(D.k2 || '') + '">' + chips(trials, 't') + '</div></div>' +
      '</div>' +
      '<div class="rt_dw-op is-eq" aria-hidden="true">=</div>' +
      '<div class="rt_dw-res" aria-live="polite"><div class="rt_dw-badge" data-rt-variant="own bf" aria-hidden="true">-60%</div>' + head('res', D.k3 || 'Відповідь', D.s3 || 'Для вас') +
        '<div class="rt_dw-path"></div><div class="rt_dw-title"></div><div class="rt_dw-body"></div>' +
        '<button type="button" class="rt_dw-cta"></button><p class="rt_dw-hint"></p></div>';
    grid.parentNode.insertBefore(w, grid);
    html.classList.add('rt-dw');                       // CSS ховає статичні картки і стару панель
    var res = w.querySelector('.rt_dw-res'), cta = w.querySelector('.rt_dw-cta'), hint = w.querySelector('.rt_dw-hint');

    function render() {
      var d = sel.d, b = S.branch;
      $$('[data-dw-d]', w).forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-dw-d') === d ? 'true' : 'false'); });
      $$('[data-dw-t]', w).forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-dw-t') === b ? 'true' : 'false'); });
      var src = $('#rt-quiz [data-rt-doubt="' + d + '"] .rt_arg');
      var title = src && src.querySelector('.rt_arg-title') ? src.querySelector('.rt_arg-title').textContent.trim() : '';
      var dl = (doubts.filter(function (x) { return x.k === d; })[0] || {}).label || '';
      var tl = b === 'yes' || b === 'no' ? (trials.filter(function (x) { return x.k === b; })[0] || {}).label : '';
      w.querySelector('.rt_dw-path').textContent = dl + (tl ? ' → ' + tl : '');
      w.querySelector('.rt_dw-title').textContent = title.replace(/^[^?]*\?\s*/, '') || title;   // «Дорого? Є розтермінування…» → «Є розтермінування…»
      var body = '';
      if (src) {
        var tx = src.querySelector('.rt_text'); if (tx) body += '<p class="rt_dw-text">' + tx.innerHTML + '</p>';
        var li = $$('.rt_facts li', src); if (li.length) body += '<ul class="rt_dw-facts">' + li.map(function (x) { return '<li>' + x.innerHTML + '</li>'; }).join('') + '</ul>';
      }
      w.querySelector('.rt_dw-body').innerHTML = body;
      var go = b === 'yes' ? 'yes' : b === 'no' ? 'no' : '';
      cta.hidden = !go; cta.textContent = go === 'yes' ? (D.ctaYes || 'Подивитись пакети') : (D.ctaNo || 'Обрати час уроку');
      hint.hidden = !!go; hint.textContent = D.hint || '';
      res.classList.remove('is-flash'); void res.offsetWidth; res.classList.add('is-flash');
      renderPrices();                                   // числа в аргументі «Дорого» під ринок і частоту
    }
    dwSync = render;

    w.addEventListener('click', function (e) {
      var c = e.target.closest('[data-dw-d],[data-dw-t]'); if (!c) return;
      if (c.hasAttribute('data-dw-d')) {
        sel.d = c.getAttribute('data-dw-d');
        Q.doubt = sel.d; saveQ(); renderQuiz(); fillAllHidden();
        track('rt_objection_open', { q: sel.d });
        render();
      } else {
        var v = c.getAttribute('data-dw-t');
        if (S.branch !== v) {
          // гілка відкриває/ховає блоки вище (квіз, ціни, форма) — тримаємо блок на тому ж місці екрана
          var y0 = w.getBoundingClientRect().top;
          setBranch(v, true);
          window.scrollBy(0, w.getBoundingClientRect().top - y0);
          track('rt_branch_select', { value: v === 'yes' ? 'trial_yes' : 'trial_no', place: 'doubts' });
        }
        render();
      }
    });
    cta.addEventListener('click', function () {
      var nx = S.branch === 'yes' ? 'packages' : 'time';
      track('rt_objection_next', { q: sel.d, next: nx });
      scrollToEl(nx === 'packages' ? $('#rt-prices') : $('#rt-time'));
    });
    render();
  }

  /* ---------------------------------------------------------------- телефон (intl-tel-input) */

  var ITI = [];
  function setupIti(tel) {
    if (!window.intlTelInput || !CFG.phone) return null;
    var home = ((CFG.phone.countryByMarket || {})[MARKET] || (CFG.phone.countryByLocale || {})[LOCALE] || '').toLowerCase();
    var pref = (CFG.phone.preferred || []).filter(function (c) { return c !== home; });
    if (home) pref.unshift(home);
    var iti = window.intlTelInput(tel, {
      initialCountry: store.get(K.cc) || home || 'auto', preferredCountries: pref, separateDialCode: true,
      autoPlaceholder: 'polite', utilsScript: CFG.phone.utilsUrl, formatOnDisplay: false
    });
    ITI.push(iti);
    tel.addEventListener('countrychange', function () {
      var c = iti.getSelectedCountryData(); if (!c || !c.iso2) return;
      store.set(K.cc, c.iso2);
      ITI.forEach(function (o) { if (o !== iti && o.getSelectedCountryData().iso2 !== c.iso2) o.setCountry(c.iso2); });
    });
    tel.__iti = iti;
    return iti;
  }
  function phoneE164(tel) {
    var iti = tel.__iti, raw = String(tel.value || '');
    var d = raw.replace(/\D/g, '');
    if (iti) {
      if (window.intlTelInputUtils) { var n = iti.getNumber(); if (n) return n; }
      var c = iti.getSelectedCountryData();
      if (c && c.dialCode) { if (d.indexOf(c.dialCode) === 0 && d.length > 9) d = d.slice(c.dialCode.length); return '+' + c.dialCode + d.replace(/^0+/, ''); }
    }
    return /^\+/.test(raw.trim()) ? '+' + d : (CFG.phone && CFG.phone.fallbackCode || '+380') + d.replace(/^0+/, '');
  }
  function phoneValid(tel) {
    var iti = tel.__iti, d = String(tel.value || '').replace(/\D/g, '');
    if (iti && window.intlTelInputUtils) return iti.isValidNumber();
    return d.length >= 7 && d.length <= 14;
  }

  /* ---------------------------------------------------------------- форми */

  var forms = [];
  function field(form, name) { return form.querySelector('[name="' + name + '"]') || form.querySelector('[data-name="' + name + '"]'); }
  function setHidden(form, name, value) {
    var i = form.querySelector('input[type="hidden"][name="' + name + '"]');
    if (!i) { i = doc.createElement('input'); i.type = 'hidden'; i.name = name; i.setAttribute('data-name', name); form.appendChild(i); }
    i.value = value == null ? '' : String(value);
  }
  function goalsText() {
    var parts = ['rt26', (T.goals && T.goals.trial || 'пробний') + ': ' + (S.branch === 'yes' ? (T.goals && T.goals.yes || 'так') : (T.goals && T.goals.no || 'ні')),
      (T.goals && T.goals.req || 'запит: обрати час')];
    var G = T.goals || {};
    if (Q.doubt) parts.push((G.doubt || 'сумнів') + ': ' + ((G.doubts || {})[Q.doubt] || Q.doubt));
    if (Q.a.freq) parts.push((G.freq || 'уроків/тиждень') + ': ' + Q.a.freq);
    if (Q.a.when) parts.push((G.when || 'час') + ': ' + Q.a.when);
    if (Q.a.hobby) parts.push((G.hobby || 'інтереси') + ': ' + Q.a.hobby);
    if (Q.a.priority) parts.push((G.priority || 'важливо') + ': ' + Q.a.priority);
    if (S.pkg) parts.push((G.pkg || 'пакет') + ': ' + S.pkg);
    if (EU) { parts.push((G.consent || 'згода на розсилку') + ': ' + (anyConsent() ? 'yes' : 'no')); }
    return parts.join('; ');
  }
  function anyConsent() { return forms.some(function (o) { var c = field(o.form, 'consent_marketing'); return c && c.checked; }); }
  function fillHidden(form) {
    var a = attrValues();
    Object.keys(a).forEach(function (k) { setHidden(form, k, a[k]); });
    setHidden(form, 'goals', goalsText());
    setHidden(form, 'quiz_version', CFG.quizVersion);
    setHidden(form, 'rt_branch', S.branch);
  }
  function fillAllHidden() { forms.forEach(function (o) { fillHidden(o.form); }); }

  function errBox(form, name) {
    var b = form.querySelector('[data-rt-err="' + name + '"]');
    if (!b) {
      b = doc.createElement('div'); b.className = 'rt_err'; b.setAttribute('data-rt-err', name); b.setAttribute('aria-live', 'polite');
      var anchor = name === 'child_age' ? form.querySelector('[data-rt-ages]') : name === 'form' ? form.querySelector('input[type="submit"],button[type="submit"]') : field(form, name);
      if (anchor && name === 'phone') anchor = anchor.closest('.iti') || anchor;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor.nextSibling); else form.appendChild(b);
    }
    return b;
  }
  function setErr(form, name, msg) {
    errBox(form, name).textContent = msg || '';
    var i = name === 'child_age' ? null : field(form, name);
    if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function syncAge() {
    var age = store.get(K.age) || params.get('child_age') || '';
    forms.forEach(function (o) {
      var f = o.form;
      $$('input[type="radio"]', f).forEach(function (r) { if ((r.getAttribute('data-name') || r.name) === 'child_age') r.checked = r.value === String(age); });
      var row = f.querySelector('[data-rt-agerow]');
      var on = !!(age && f.querySelector('input[type="radio"][value="' + age + '"]'));
      if (row) { row.hidden = !on; var b = row.querySelector('b'); if (b) b.textContent = age === '13' ? '13+' : age; }
      var tiles = f.querySelector('[data-rt-ages]');
      if (tiles) tiles.classList.toggle('is-collapsed', on);
    });
  }

  function setupForm(form, place) {
    var o = { form: form, place: place, sending: false, fails: 0 };
    forms.push(o);
    var name = 'rt26-form-' + place;
    form.setAttribute('novalidate', '');
    form.setAttribute('data-name', name);
    var w = form.closest('.w-form'); if (w) w.setAttribute('data-name', name);
    $$('input[data-name]', form).forEach(function (inp) { var dn = inp.getAttribute('data-name'); if (dn && inp.type === 'radio' && inp.name !== dn) inp.name = dn; });
    // вік: рядок «Вік: 8 · змінити»
    var tiles = form.querySelector('[data-rt-ages]');
    if (tiles && !form.querySelector('[data-rt-agerow]')) {
      var row = doc.createElement('div'); row.className = 'rt_agerow'; row.setAttribute('data-rt-agerow', ''); row.hidden = true;
      row.innerHTML = esc(T.ageLabel || 'Вік:') + ' <b></b> · <a href="#" class="rt_link">' + esc(T.change || 'змінити') + '</a>';
      tiles.parentNode.insertBefore(row, tiles);
      row.querySelector('a').addEventListener('click', function (e) {
        e.preventDefault(); store.del(K.age);
        forms.forEach(function (x) { x.form.querySelectorAll('[data-rt-agerow]').forEach(function (r) { r.hidden = true; }); var t = x.form.querySelector('[data-rt-ages]'); if (t) t.classList.remove('is-collapsed'); });
      });
    }
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type === 'radio' && (t.getAttribute('data-name') || t.name) === 'child_age') {
        var first = !store.get(K.age);
        store.set(K.age, t.value); setErr(form, 'child_age', '');
        if (first) track('rt_form_start', { form: name, child_age: t.value });
        syncAge();
        var tel = field(form, 'phone'); if (tel && !tel.value) setTimeout(function () { try { tel.focus({ preventScroll: true }); } catch (er) {} }, 50);
      }
      if (t.name === 'consent_marketing') fillAllHidden();
    });
    var tel = field(form, 'phone');
    // Webflow ставить у поля placeholder «Example Text» (атрибут placeholder зарезервований у Designer API) — прибираємо
    if (tel) { tel.type = 'tel'; tel.autocomplete = 'tel'; tel.removeAttribute('placeholder'); setupIti(tel); tel.addEventListener('input', function () { setErr(form, 'phone', ''); }); }
    var em = field(form, 'email');
    if (em) { em.autocomplete = 'email'; if (T.phEmail) em.placeholder = T.phEmail; else em.removeAttribute('placeholder'); em.addEventListener('input', function () { setErr(form, 'email', ''); }); }
    // екран «Заявку прийнято» + запасне посилання
    var done = doc.createElement('div'); done.className = 'rt_done'; done.setAttribute('data-rt-donebox', ''); done.hidden = true;
    done.innerHTML = '<div class="rt_done-title">' + esc(T.doneTitle || '') + '</div><p class="rt_done-text">' + esc(T.doneText || '') +
      '</p><a href="#" class="rt_btn" data-rt-book>' + esc(T.bookBtn || '') + '</a>';
    form.parentNode.insertBefore(done, form.nextSibling);
    done.querySelector('[data-rt-book]').addEventListener('click', function (e) { e.preventDefault(); goBooking(place); });
    var fb = doc.createElement('p'); fb.className = 'rt_fallback'; fb.hidden = true; fb.setAttribute('data-rt-fallback', '');
    fb.innerHTML = esc(T.fallback || '') + ' <a class="rt_link" href="#" target="_self">' + esc(T.fallbackLink || '') + '</a>';
    form.appendChild(fb);
    // поки Webflow (Turnstile) тримає кнопку неактивною — пояснюємо, що відбувається
    var sb = btnOf(form);
    if (sb && T.verifying && window.MutationObserver) {
      var wait = doc.createElement('p'); wait.className = 'rt_wait'; wait.hidden = true; wait.textContent = T.verifying;
      sb.parentNode.insertBefore(wait, sb.nextSibling);
      var syncWait = function () { wait.hidden = !(sb.disabled && !o.sending); };
      new MutationObserver(syncWait).observe(sb, { attributes: true, attributeFilter: ['disabled'] }); syncWait();
    }
    form.addEventListener('submit', onSubmit, true);   // capture: раніше за webflow.js та index.js
    fillHidden(form);
    return o;
  }
  function formObj(form) { for (var i = 0; i < forms.length; i++) if (forms[i].form === form) return forms[i]; return null; }

  function validate(o) {
    var f = o.form, ok = true, first = null;
    var age = $$('input[type="radio"]', f).filter(function (r) { return (r.getAttribute('data-name') || r.name) === 'child_age' && r.checked; })[0];
    setErr(f, 'child_age', age ? '' : T.errAge); if (!age) { ok = false; first = first || f.querySelector('[data-rt-ages] input'); }
    var tel = field(f, 'phone'), em = field(f, 'email');
    var pOk = tel && phoneValid(tel); setErr(f, 'phone', pOk ? '' : T.errPhone); if (!pOk) { ok = false; first = first || tel; }
    var eOk = em && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(em.value || '').trim()); setErr(f, 'email', eOk ? '' : T.errEmail); if (!eOk) { ok = false; first = first || em; }
    if (first) try { first.focus(); } catch (e) {}
    return ok;
  }

  var pending = null;
  function btnOf(f) { return f.querySelector('input[type="submit"],button[type="submit"]'); }
  function setSending(o, on) {
    o.sending = on;
    var b = btnOf(o.form); if (!b) return;
    if (on) { b.__txt = b.value || b.textContent; b.disabled = true; if (b.tagName === 'INPUT') b.value = T.sending; else b.textContent = T.sending; }
    else { b.disabled = false; if (b.__txt) { if (b.tagName === 'INPUT') b.value = b.__txt; else b.textContent = b.__txt; } }
  }
  function onSubmit(e) {
    var form = e.currentTarget, o = formObj(form);
    e.preventDefault(); e.stopImmediatePropagation();        // нативний сабміт Webflow не потрібен: заявку відправляє index.js
    if (!o || o.sending || pending) return;
    setErr(form, 'form', '');
    if (!validate(o)) return;
    track('rt_form_submit', { form: form.getAttribute('data-name') });
    fillHidden(form);
    var tel = field(form, 'phone'), shown = tel ? tel.value : '';
    if (tel) tel.value = phoneE164(tel);
    var handler = form.onsubmit;
    setSending(o, true);
    pending = { o: o, timer: setTimeout(function () { onFail(); }, CFG.submitTimeoutMs || 15000) };
    try {
      if (typeof handler !== 'function') throw new Error('index.js handler missing');
      handler.call(form, { preventDefault: function () {}, target: form, currentTarget: form, type: 'submit' });
    } catch (err) { console.error('[rt26] submit', err); onFail(); }
    if (tel) setTimeout(function () { tel.value = shown; }, 0);
    if (params.has('_t2')) setTimeout(function () { onLead({ user_id: 'test', 'go-to': null }); }, 600);
  }
  (function () {
    if (!window.fetch || window.__rt26FetchHooked) return;
    window.__rt26FetchHooked = true;
    var orig = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = orig.apply(this, arguments);
      if (/\/api\/v1\/users/.test(url) && pending) {
        p.then(function (res) {
          res.clone().json().catch(function () { return null; }).then(function (b) {
            log('api', res.status, b);
            if (res.ok && b && (b.user_id || b['go-to'])) onLead(b);
            else if (res.status >= 400 && res.status < 500) onFieldErrors(b);
            else onFail();
          });
        }, function () { onFail(); });
      }
      return p;
    };
  })();
  function onLead(b) {
    if (!pending) return;
    clearTimeout(pending.timer);
    var o = pending.o; pending = null;
    setSending(o, false);
    S.lead = { go_to: b['go-to'] || b.go_to || null, at: Date.now() };
    store.set(K.lead, S.lead);
    forms.forEach(function (x) { x.fails = 0; });
    track('rt_lead_created', { form: o.form.getAttribute('data-name') });
    renderDone();
    closePopup();
    if (S.lead.go_to && !params.has('_t2')) setTimeout(function () { goBooking(o.place); }, 300);
  }
  function onFieldErrors(b) {
    var o = pending && pending.o; if (!o) return;
    var list = b && b.errors ? (Array.isArray(b.errors) ? b.errors : Object.keys(b.errors).map(function (k) { return { field: k, detail: b.errors[k] }; })) : [];
    var any = false;
    list.forEach(function (er) {
      var f = String(er.field || (er.source && er.source.pointer) || '').split('/').pop().split('.').pop();
      var msg = er.detail || er.message || er.title;
      if (/NOT_UNIQUE/.test(er.code || '') || /already in use/i.test(msg || '')) msg = (f === 'email' ? T.emailTaken : T.phoneTaken) || msg;
      if ((f === 'phone' || f === 'email') && msg) { setErr(o.form, f, String(msg)); any = true; }
    });
    if (!any) return onFail();
    clearTimeout(pending.timer); pending = null; setSending(o, false);
  }
  function onFail() {
    var o = pending && pending.o;
    if (pending) { clearTimeout(pending.timer); pending = null; }
    if (!o) return;
    setSending(o, false);
    o.fails++;
    setErr(o.form, 'form', T.sendError);
    if (o.fails >= 2) {
      var fb = o.form.querySelector('[data-rt-fallback]');
      if (fb) { fb.hidden = false; fb.querySelector('a').href = 'https://allright.com/' + LOCALE + '/app/sign-up?child_age=' + encodeURIComponent(store.get(K.age) || '') + '&event_transition_from=FREE_TRIAL'; }
    }
  }
  function renderDone() {
    var done = !!S.lead;
    forms.forEach(function (o) {
      o.form.hidden = done;
      var d = o.form.parentNode.querySelector('[data-rt-donebox]'); if (d) d.hidden = !done;
    });
    html.toggleAttribute('data-rt-lead', done);
  }
  function goBooking(place) {
    var url = S.lead && S.lead.go_to;
    if (!url) return;
    track('rt_booking_click', { place: place, transport_type: 'beacon' });
    setTimeout(function () { location.assign(url); }, 200);
  }

  /* ---------------------------------------------------------------- підвал: попап (ft=popup) */

  var popup = null, lastFocus = null;
  function setupPopup() {
    if (params.get('ft') !== 'popup') return;
    var slot = $('[data-rt-footform]'); if (!slot) return;
    html.setAttribute('data-rt-ft', 'popup');
    var btn = doc.createElement('a'); btn.href = '#'; btn.className = 'rt_btn'; btn.setAttribute('data-rt-popup-open', ''); btn.setAttribute('data-rt-only', 'no'); btn.textContent = T.bookBtn || '';
    slot.parentNode.insertBefore(btn, slot);
    popup = doc.createElement('div'); popup.className = 'rt_modal'; popup.hidden = true;
    popup.innerHTML = '<div class="rt_modal-box" role="dialog" aria-modal="true"><button type="button" class="rt_modal-x" aria-label="' + esc(T.close || '×') + '">✕</button></div>';
    doc.body.appendChild(popup);
    popup.querySelector('.rt_modal-box').appendChild(slot);
    btn.addEventListener('click', function (e) {
      e.preventDefault(); lastFocus = btn; popup.hidden = false;
      track('rt_cta_click', { place: 'footer-popup' });
      var f = popup.querySelector('input:not([type=hidden])'); if (f) try { f.focus(); } catch (er) {}
    });
    popup.querySelector('.rt_modal-x').addEventListener('click', closePopup);
    popup.addEventListener('click', function (e) { if (e.target === popup) closePopup(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popup && !popup.hidden) closePopup(); });
  }
  function closePopup() { if (!popup || popup.hidden) return; popup.hidden = true; if (lastFocus) try { lastFocus.focus(); } catch (e) {} }

  /* ---------------------------------------------------------------- верхня смуга (ТЗ блок 0, як у прототипі) */

  // Кнопка «Скористатись» завжди видна: гілка «так» → квіз, «ні» → форма, без відповіді → питання.
  // Поруч вибір мови: та сама сторінка /{мова}/back з усіма параметрами URL.
  // Вибір мови — як у BF26 (kid.allright.com/uk/self-black-friday): кнопка «глобус + UA + шеврон» і меню з назвами мов.
  // Мова без готової сторінки /{мова}/back (немає в CFG.langsLive) неактивна з підказкою «Незабаром».
  var LANG_NAMES = { uk: ['UA', 'Українська'], ru: ['RU', 'Русский'], pl: ['PL', 'Polski'], ro: ['RO', 'Română'], it: ['IT', 'Italiano'], es: ['ES', 'Español'],
    he: ['HE', 'עברית'], sr: ['SR', 'Srpski'], sk: ['SK', 'Slovenčina'], cs: ['CS', 'Čeština'], en: ['EN', 'English'], bg: ['BG', 'Български'], hr: ['HR', 'Hrvatski'], sl: ['SL', 'Slovenščina'] };
  function setupBar() {
    var cta = $('[data-rt-cta="bar"]'); if (!cta) return;
    var langs = CFG.langs || [], live = CFG.langsLive || [LOCALE];
    if (langs.length < 2 || $('[data-rt-lang]')) return;
    var nm = function (c) { return LANG_NAMES[c] || [c.toUpperCase(), c]; };
    var wrap = doc.createElement('div'), btn = doc.createElement('button'), menu = doc.createElement('ul');
    wrap.className = 'rt_lang'; wrap.setAttribute('data-rt-lang', '');
    btn.type = 'button'; btn.className = 'rt_lang-btn';
    btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', (T.lang || 'Мова') + ': ' + nm(LOCALE)[1]);
    btn.innerHTML = '<span class="rt_lang-ico" aria-hidden="true"></span><span>' + esc(nm(LOCALE)[0]) + '</span><span class="rt_lang-chev" aria-hidden="true"></span>';
    menu.className = 'rt_lang-menu';
    langs.forEach(function (c) {
      var li = doc.createElement('li'), a = doc.createElement('a'), on = live.indexOf(c) > -1;
      a.className = 'rt_lang-item' + (c === LOCALE ? ' is-current' : '');
      a.setAttribute('lang', c); a.setAttribute('data-rt-lang-to', c); a.textContent = nm(c)[1];
      if (c === LOCALE) a.setAttribute('aria-current', 'true');
      if (on) { var path = location.pathname.replace(/^\/[a-z]{2}(?=\/|$)/i, '/' + c); a.href = (path === location.pathname && c !== LOCALE ? '/' + c + '/back' : path) + location.search; }
      else { a.setAttribute('aria-disabled', 'true'); a.title = T.langSoon || 'Незабаром'; a.className += ' is-soon'; }
      a.addEventListener('click', function (e) { if (!on || c === LOCALE) { e.preventDefault(); if (c === LOCALE) close(); return; } track('rt_lang_change', { from: LOCALE, to: c }); });
      li.appendChild(a); menu.appendChild(li);
    });
    function close() { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); btn.setAttribute('aria-expanded', String(wrap.classList.toggle('is-open'))); });
    doc.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && wrap.classList.contains('is-open')) { close(); btn.focus(); } });
    wrap.appendChild(btn); wrap.appendChild(menu);
    cta.parentNode.insertBefore(wrap, cta);
  }
  function barClick() {
    track('rt_cta_click', { place: 'bar' });
    scrollToEl(S.branch === 'yes' ? $('#rt-quiz') : S.branch === 'no' ? $('#rt-time') : ($('#rt-top .rt_question') || $('#rt-top')));
  }

  /* ---------------------------------------------------------------- юридичні посилання, мітки на посиланнях оплати */

  function setupLinks() {
    $$('[data-rt-legal]').forEach(function (a) {
      var l = (CFG.legalPdfLangs || []).indexOf(LOCALE) > -1 ? LOCALE : 'en';
      a.href = 'https://allright.com/legal/' + a.getAttribute('data-rt-legal') + '/' + l + '.pdf';
      a.target = '_blank'; a.rel = 'noopener';
    });
    $$('[data-rt-pay]').forEach(function (a) {
      a.href = priceUrl(); a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', function () { a.href = priceUrl(); var ps = new URL(a.href).searchParams; track('rt_price_click', { package: S.pkg || 'none', place: a.getAttribute('data-rt-pay') || 'prices', plan_sub_type: ps.get('planSubType') || '', qty_per_week: ps.get('planQtyPerWeek') || '' }); });
    });
  }

  /* ---------------------------------------------------------------- делеговані кліки */

  doc.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-rt-branch],[data-rt-q],[data-rt-next],[data-rt-done],[data-rt-freq],[data-rt-change],[data-rt-cta]') : null;
    if (!t || t === html) return;                     // <html data-rt-branch> — це стан, не кнопка
    if (t.hasAttribute('data-rt-branch')) {
      e.preventDefault();
      // фінальний блок (ТЗ блок 6) — дзеркало першого екрана: відповідь розкриває форму / пакет тут же, без прокрутки нагору;
      // блоки над ним (квіз, форма) змінюють висоту, тож компенсуємо зсув, щоб блок лишився на місці
      var rep = t.closest('#rt-repeat');
      if (rep) { var y0 = rep.getBoundingClientRect().top; setBranch(t.getAttribute('data-rt-branch'), 'stay'); window.scrollBy(0, rep.getBoundingClientRect().top - y0); }
      else setBranch(t.getAttribute('data-rt-branch'));
      return;
    }
    if (t.hasAttribute('data-rt-q')) { e.preventDefault(); onOption(t); return; }
    if (t.hasAttribute('data-rt-next')) { e.preventDefault(); quizStep(+t.getAttribute('data-rt-next')); return; }
    if (t.hasAttribute('data-rt-done')) {
      e.preventDefault();
      var nx = t.getAttribute('data-rt-done');
      track('rt_quiz_done', { doubt: Q.doubt || 'none', next: nx });
      scrollToEl(nx === 'packages' ? $('#rt-prices') : $('#rt-time'));
      return;
    }
    if (t.hasAttribute('data-rt-freq')) {
      e.preventDefault();
      Q.a.freq = t.getAttribute('data-rt-freq'); saveQ();
      track('rt_freq_select', { freq: +Q.a.freq, place: 'prices' });
      renderQuiz(); fillAllHidden();
      return;
    }
    if (t.hasAttribute('data-rt-change')) {
      e.preventDefault();
      var from = S.branch; setBranch('none', true);
      track('rt_branch_change', { from: from });
      scrollToEl($('#rt-top'));
      return;
    }
    if (t.hasAttribute('data-rt-cta')) {
      e.preventDefault();
      var place = t.getAttribute('data-rt-cta');
      if (place === 'bar') { barClick(); return; }
      track('rt_cta_click', { place: place });
      if (place === 'footer-pkgs') { scrollToEl($('#rt-prices')); return; }
      scrollToEl(S.branch === 'yes' ? $('#rt-quiz') : S.branch === 'no' ? $('#rt-time') : $('#rt-top'));
    }
  });

  /* ---------------------------------------------------------------- прокрутка 50/90 */

  var s50 = false, s90 = false;
  addEventListener('scroll', function () {
    var p = (pageYOffset + innerHeight) / Math.max(1, doc.documentElement.scrollHeight);
    if (!s50 && p > 0.5) { s50 = true; track('rt_scroll', { percent: 50 }); }
    if (!s90 && p > 0.9) { s90 = true; track('rt_scroll', { percent: 90 }); }
  }, { passive: true });

  /* ---------------------------------------------------------------- старт */

  // Відгуки як «Батьки говорять про нас» на головній: синя плашка рейтингу (T.rating) зліва + стрічка карток у темному контейнері.
  // Немає T.rating для мови — плашки немає, стрічка лишається.
  var FB_ICO = '<svg viewBox="0 0 41 41" width="40" height="40" aria-hidden="true"><path d="M17.34 39.24C8.39 37.66 1.55 29.87 1.55 20.5 1.55 10.08 10.08 1.55 20.5 1.55s18.95 8.53 18.95 18.95c0 9.37-6.84 17.16-15.79 18.74l-1.05-.84h-4.21z" fill="#fff"/><path d="M27.87 25.76l.84-5.26h-5.05v-3.68c0-1.48.52-2.64 2.84-2.64h2.42V9.34c-1.37-.21-2.84-.42-4.21-.42-4.32 0-7.37 2.63-7.37 7.37v4.21h-4.73v5.26h4.73v13.37c1.05.21 2.11.32 3.16.32s2.1-.11 3.16-.32V25.76z" fill="#027de5"/></svg>';
  function setupReviews() {
    var slot = $('[data-rt-reviews]'); if (!slot || $('.rt_rv')) return;
    var box = doc.createElement('div'); box.className = 'rt_rv';
    slot.parentNode.insertBefore(box, slot);
    var R = T.rating || [];
    if (R.length) {
      var base = (($('script[src*="rt26.js"]') || {}).src || '').replace(/rt26\.js.*$/, '');
      var b = doc.createElement('div'); b.className = 'rt_rv-badge';
      b.innerHTML = R.map(function (r) {
        var ico = r.icon === 'facebook' ? FB_ICO : r.icon === 'otzyvua' ? '<img src="' + base + 'img/otzyvua.png" width="58" height="40" alt="" loading="lazy">' : '';
        return '<div class="rt_rv-stat"><div class="rt_rv-num">' + ico + '<span>' + esc(r.value) + '</span></div><span class="rt_rv-src">' + esc(r.label) + '</span></div>';
      }).join('');
      box.appendChild(b);
    }
    box.appendChild(slot);
    // стрічка як на головній: Embla Carousel (та сама бібліотека) — перетягування з інерцією і плавне докручування до картки;
    // якщо бібліотека не завантажилась — лишається нативна горизонтальна прокрутка
    var rail = $('.rt_reviews', slot), vp = rail && rail.parentNode; if (!rail || html.getAttribute('data-rt-theme') !== 'main') return;
    // + плагін embla-carousel-wheel-gestures: горизонтальний свайп двома пальцями на тачпаді гортає стрічку (вертикальний — сторінку)
    function init() {
      if (!window.EmblaCarousel || box.classList.contains('is-embla')) return;
      box.classList.add('is-embla');
      var plugins = window.EmblaCarouselWheelGestures ? [window.EmblaCarouselWheelGestures()] : [];
      try { window.EmblaCarousel(vp, { align: 'start', containScroll: 'trimSnaps', dragFree: false, duration: 30 }, plugins); }
      catch (e) { box.classList.remove('is-embla'); }
    }
    function load(src, cb) { var sc = doc.createElement('script'); sc.src = src; sc.async = true; sc.onload = sc.onerror = cb; doc.head.appendChild(sc); }
    var CDN = 'https://cdn.jsdelivr.net/npm/';
    load(CDN + 'embla-carousel@8.5.2/embla-carousel.umd.js', function () {
      load(CDN + 'embla-carousel-wheel-gestures@8.0.2/dist/embla-carousel-wheel-gestures.umd.js', init);
    });
  }

  // Підвал як у BF26: ключові фрази умов (T.termsHl) — span.rt_hl; абзац проявляється з розмиття, коли підвал на екрані.
  function setupFooter() {
    var main = $('.rt_footer [data-rt-ft="main"]'); if (!main) return;
    var hl = T.termsHl || [], i = 0;
    $$('.rt_terms', main).forEach(function (p) {
      hl.forEach(function (ph) {
        if (!ph) return;
        var walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT, null), n;
        while ((n = walker.nextNode())) {
          if (n.parentNode.classList && n.parentNode.classList.contains('rt_hl')) continue;
          var k = n.nodeValue.replace(/ /g, ' ').indexOf(ph.replace(/ /g, ' '));
          if (k < 0) continue;
          var mid = n.splitText(k); mid.splitText(ph.length);
          var sp = doc.createElement('span'); sp.className = 'rt_hl'; sp.style.setProperty('--rt-i', i++);
          mid.parentNode.replaceChild(sp, mid); sp.appendChild(mid);
          break;
        }
      });
    });
    if (!window.IntersectionObserver) { main.classList.add('is-in'); return; }
    main.classList.add('rt-hl-ready');
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { main.classList.add('is-in'); io.disconnect(); } }); }, { threshold: 0.35 });
    io.observe(main);
  }

  // Поява при скролі (як halloween.englishdom.com): IntersectionObserver додає .in, рух робить CSS (rt26.css «поява при скролі»).
  // rise — діти блока піднімаються по черзі; deal — картки «роздаються» з поворотом; pop — фінальний блок + Чарлі; stamp — бейдж-штамп.
  // Позначаємо лише те, що на старті нижче першого екрана (без мигання); після анімації атрибут знімаємо — повертаються власні transition.
  // Вимкнено при prefers-reduced-motion і з ?anim=off.
  function setupReveal() {
    if (!('IntersectionObserver' in window) || /[?&]anim=off/.test(location.search)) return;
    try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    var MAP = [
      ['rise', '.rt_section .rt_head-center, .rt_quiz-head, #rt-time .rt_form-head, .rt_pay, .rt_rv-badge, .rt_steps'],
      ['deal', '.rt_pkgs, .rt_dcards, .rt_dw, .rt_rv .rt_reviews, .rt_how-grid'],
      ['pop', '.rt_repeat'],
      ['stamp', '.rt_repeat > .rt_badge.is-big']
    ];
    var fold = window.innerHeight * 0.92, els = [];
    MAP.forEach(function (m) {
      $$(m[1]).forEach(function (el) {
        if (el.hasAttribute('data-rt-a')) return;
        var r = el.getBoundingClientRect();
        if (!r.height || r.top < fold) return;
        el.setAttribute('data-rt-a', m[0]); els.push(el);
      });
    });
    if (!els.length) return;
    html.classList.add('rt-anim');
    function countUp(span) {
      var t = span.textContent, m = t.match(/^(\D*)(\d+(?:[.,]\d+)?)(.*)$/);
      if (!m) return;
      var to = parseFloat(m[2].replace(',', '.')), dec = (m[2].split(/[.,]/)[1] || '').length, sep = m[2].indexOf(',') > -1 ? ',' : '.', t0 = 0;
      function step(ts) {
        t0 = t0 || ts; var k = Math.min(1, (ts - t0) / 1400), e = 1 - Math.pow(1 - k, 3);
        span.textContent = k < 1 ? m[1] + (to * e).toFixed(dec).replace('.', sep) + m[3] : t;
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    function show(el) {
      el.classList.add('in');
      if (el.matches('.rt_rv-badge')) $$('.rt_rv-num span', el).forEach(countUp);
      setTimeout(function () { el.removeAttribute('data-rt-a'); el.classList.remove('in'); }, 1900);
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  // Кнопки-якорі (#rt-quiz, #rt-prices…) потрібні лише без JS. Зі скриптом прибираємо href:
  // інакше webflow.js на кожен клік сам прокручує до якоря і сторінка «стрибає».
  function anchorsToButtons() {
    $$('a[href^="#"]').forEach(function (a) {
      if (!a.matches('[data-rt-branch],[data-rt-q],[data-rt-next],[data-rt-done],[data-rt-freq],[data-rt-change],[data-rt-cta]')) return;
      a.removeAttribute('href'); a.setAttribute('role', 'button'); if (!a.hasAttribute('tabindex')) a.tabIndex = 0;
      a.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); } });
    });
  }

  function start() {
    html.lang = LOCALE;
    anchorsToButtons();
    if ((CFG.rtl || []).indexOf(LOCALE) > -1) html.dir = 'rtl';
    syncVariant();
    setInterval(syncVariant, 1000);
    $$('form').forEach(function (f) {
      var slot = f.closest('[data-rt-place]');
      if (slot && field(f, 'phone')) setupForm(f, slot.getAttribute('data-rt-place'));
    });
    setupFreqToggle();
    setupDoubts();
    setupFooter();
    setupQuizEnd();
    setupRepeat();
    setupQuizBack();
    setupTrialRow();
    setupReviews();
    setupLinks();
    setupPopup();
    setupBar();
    setBranch(S.branch, true);
    syncAge();
    renderDone();
    html.classList.add('rt-ready');
    setupReveal();
    track('rt_page_view', {});
    log('market', MARKET || '(none)', 'zone', ZONE, 'branch', S.branch);
  }

  window.RT26 = {
    version: '1.6.21', state: function () { return { Q: Q, S: S, market: MARKET, zone: ZONE, eu: EU }; }, track: track,
    reset: function () { Object.keys(K).forEach(function (k) { store.del(K[k]); }); location.reload(); }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
