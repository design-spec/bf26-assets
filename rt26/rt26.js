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
  function priceUrl(pkg) {
    var q = {};
    var a = attrValues(); Object.keys(a).forEach(function (k) { if (a[k]) q[k] = a[k]; });
    q.quiz_version = CFG.quizVersion;
    return 'https://allright.com/' + LOCALE + '/app/price?' + new URLSearchParams(q).toString();
  }

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

  var Q = store.get(K.quiz) || {};
  if (!Q.step) Q.step = 1;
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
    if (!silent && b !== 'none') {
      track('rt_branch_select', { value: v === 'unsure' ? 'unsure' : b === 'yes' ? 'trial_yes' : 'trial_no' });
      if (b === 'yes') track('rt_quiz_step', { step: Q.step, doubt: Q.doubt || 'none' });
      scrollToEl(b === 'yes' ? $('#rt-quiz') : $('#rt-time'));
    }
  }

  /* ---------------------------------------------------------------- ціни */

  function money(n) {
    var cur = PLAN ? PLAN.cur : '';
    var s = (+n).toFixed(2).replace('.', T.decimal || ',');
    return (PLAN && PLAN.curBefore) ? cur + s : s + ' ' + cur;
  }
  function money0(n) {
    var cur = PLAN ? PLAN.cur : '';
    var s = Math.round(n).toLocaleString(T.numLocale || 'uk-UA');
    return (PLAN && PLAN.curBefore) ? cur + s : s + ' ' + cur;
  }
  function renderPrices() {
    var f = freq(), rows = PLAN ? PLAN.f[f] : null, lpm = (CFG.lessonsPerMonth || { 2: 8, 3: 12 })[f];
    html.toggleAttribute('data-rt-noplan', !PLAN);
    $$('[data-rt-freq]').forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-rt-freq') === f ? 'true' : 'false'); });
    $$('[data-rt-freqn]').forEach(function (el) { el.textContent = f; });
    $$('[data-rt-price]').forEach(function (el) {
      var k = el.getAttribute('data-rt-price');
      if (!rows) { el.textContent = T.noZonePrice || '—'; return; }
      var v = k === 'm1' ? rows.m[0] : k === 'm12' ? rows.m[3] : k === 'inst12' ? (rows.i[2] != null ? rows.i[2] : rows.m[3]) : null;
      el.textContent = v != null ? money(v) : (T.noZonePrice || '—');
    });
    $$('[data-rt-packages]').forEach(function (box) {
      box.innerHTML = '';
      if (!rows) return;
      (T.terms || []).forEach(function (t, idx) {
        var months = t[1], per = rows.m[idx], inst = idx > 0 ? rows.i[idx - 1] : null;
        if (per == null) return;                       // план вимкнений на сторінці цін (курсив у payment_plans_by_zone.xlsx)
        var label = t[0] + ' · ' + tpl(T.perWeekShort || '{n} на тиждень', { n: f });
        var sel = S.pkg === label;
        var card = doc.createElement('div');
        card.className = 'rt_pkg' + (months === 12 ? ' is-best' : '') + (sel ? ' is-sel' : '');
        card.setAttribute('role', 'button'); card.tabIndex = 0;
        card.setAttribute('aria-pressed', sel ? 'true' : 'false');
        card.setAttribute('data-rt-pkg', label);
        card.innerHTML =
          (months === 12 ? '<div class="rt_pkg-tag">' + esc(T.bestTag || '') + '</div>' : '') +
          '<div class="rt_pkg-name">' + esc(t[0]) + '</div>' +
          '<div class="rt_pkg-sub">' + esc(tpl(T.pkgLessons || '{n} уроків', { n: months * lpm })) + '</div>' +
          '<div class="rt_pkg-price"><b>' + esc(money(per)) + '</b> <span>' + esc(T.perLesson || '') + '</span></div>' +
          '<div class="rt_pkg-month">' + esc(tpl(T.perMonth || '', { sum: money0(per * lpm), n: lpm })) + '</div>' +
          '<div class="rt_pkg-inst">' + esc(inst != null ? tpl(T.installments || '', { p: money(inst) }) : idx === 0 ? (T.payMonthly || '') : (T.payUpfront || '')) + '</div>' +
          (EU ? '<div class="rt_pkg-omni" data-rt-variant="own bf">' + esc(tpl(T.omnibus || '', { p: money(per) })) + '</div>' : '');
        function pick() {
          S.pkg = label; store.set(K.pkg, label);
          $$('.rt_pkg').forEach(function (c) { var on = c.getAttribute('data-rt-pkg') === label; c.classList.toggle('is-sel', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          renderPkgLabel(); fillAllHidden();
          track('rt_package_select', { package: label, freq: f });
        }
        card.addEventListener('click', pick);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        box.appendChild(card);
      });
    });
    renderPkgLabel();
  }
  function renderPkgLabel() { $$('[data-rt-pkg-label]').forEach(function (el) { el.textContent = S.pkg || T.pkgNone || ''; }); }

  /* ---------------------------------------------------------------- квіз-розігрів */

  function renderQuiz() {
    $$('[data-rt-step]').forEach(function (s) { s.classList.toggle('is-on', +s.getAttribute('data-rt-step') === Q.step); });
    $$('#rt-quiz [data-rt-doubt]').forEach(function (v) { v.classList.toggle('is-on', v.getAttribute('data-rt-doubt') === (Q.doubt || 'think')); });
    $$('[data-rt-q]').forEach(function (o) {
      var q = o.getAttribute('data-rt-q'), v = o.getAttribute('data-rt-v');
      var on = q === 'doubt' ? Q.doubt === v : Q.a[q] === v;
      o.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-rt-progress]').forEach(function (el) { el.textContent = tpl(T.progress || 'Крок {n} з 4', { n: Q.step }); });
    $$('[data-rt-progress-bar]').forEach(function (el) { el.style.width = (Q.step / 4 * 100) + '%'; });
    renderPrices();
  }
  function quizStep(n) {
    Q.step = n; saveQ(); renderQuiz();
    track('rt_quiz_step', { step: n, doubt: Q.doubt || 'none' });
    scrollToEl($('#rt-quiz'));
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

  function setupDoubts() {
    var panel = $('[data-rt-dpanel]');
    if (!panel) return;
    var body = doc.createElement('div'); body.className = 'rt_dpanel-body';
    var next = doc.createElement('a'); next.href = '#rt-top'; next.className = 'rt_btn is-secondary'; next.textContent = T.next || 'Далі';
    panel.innerHTML = ''; panel.appendChild(body); panel.appendChild(next);
    var open = null;
    function show(d) {
      open = d;
      $$('[data-rt-dcard]').forEach(function (c) { c.setAttribute('aria-expanded', c.getAttribute('data-rt-dcard') === d ? 'true' : 'false'); });
      panel.classList.toggle('is-on', !!d);
      if (!d) return;
      var src = $('#rt-quiz [data-rt-doubt="' + d + '"] .rt_arg');
      body.innerHTML = src ? src.innerHTML : '';
      renderPrices();
    }
    $$('[data-rt-dcard]').forEach(function (c) {
      c.setAttribute('role', 'button'); c.tabIndex = 0; c.setAttribute('aria-expanded', 'false');
      function act(e) {
        if (e) e.preventDefault();
        var d = c.getAttribute('data-rt-dcard');
        if (open === d) { show(null); return; }
        show(d);
        track('rt_objection_open', { q: d });
        Q.doubt = d; saveQ(); renderQuiz(); fillAllHidden();
        setTimeout(function () { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
      }
      c.addEventListener('click', act);
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') act(e); });
    });
    next.addEventListener('click', function (e) {
      e.preventDefault();
      var nx = S.branch === 'yes' ? 'packages' : S.branch === 'no' ? 'time' : 'question';
      track('rt_objection_next', { q: open || 'none', next: nx });
      scrollToEl(nx === 'packages' ? $('#rt-prices') : nx === 'time' ? $('#rt-time') : $('#rt-top'));
    });
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
  function setupBar() {
    var btn = $('[data-rt-cta="bar"]'); if (!btn) return;
    var langs = CFG.langs || [];
    if (langs.length > 1 && !$('[data-rt-lang]')) {
      var wrap = doc.createElement('label'); wrap.className = 'rt_lang'; wrap.setAttribute('data-rt-lang', '');
      wrap.innerHTML = '<span class="rt_lang-label">' + esc(T.lang || 'Мова') + '</span>';
      var sel = doc.createElement('select'); sel.className = 'rt_lang-select'; sel.setAttribute('aria-label', T.lang || 'Мова');
      langs.forEach(function (c) { var o = doc.createElement('option'); o.value = c; o.textContent = c; if (c === LOCALE) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () {
        var c = sel.value; if (c === LOCALE) return;
        track('rt_lang_change', { from: LOCALE, to: c });
        var path = location.pathname.replace(/^\/[a-z]{2}(?=\/|$)/i, '/' + c);
        if (path === location.pathname) path = '/' + c + '/back';
        location.href = path + location.search + location.hash;
      });
      wrap.appendChild(sel);
      btn.parentNode.insertBefore(wrap, btn);
    }
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
      a.addEventListener('click', function () { a.href = priceUrl(); track('rt_price_click', { package: S.pkg || 'none', place: a.getAttribute('data-rt-pay') || 'prices' }); });
    });
  }

  /* ---------------------------------------------------------------- делеговані кліки */

  doc.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-rt-branch],[data-rt-q],[data-rt-next],[data-rt-done],[data-rt-freq],[data-rt-change],[data-rt-cta]') : null;
    if (!t || t === html) return;                     // <html data-rt-branch> — це стан, не кнопка
    if (t.hasAttribute('data-rt-branch')) { e.preventDefault(); setBranch(t.getAttribute('data-rt-branch')); return; }
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
    setupDoubts();
    setupLinks();
    setupPopup();
    setupBar();
    setBranch(S.branch, true);
    syncAge();
    renderDone();
    html.classList.add('rt-ready');
    track('rt_page_view', {});
    log('market', MARKET || '(none)', 'zone', ZONE, 'branch', S.branch);
  }

  window.RT26 = {
    version: '1.3.0', state: function () { return { Q: Q, S: S, market: MARKET, zone: ZONE, eu: EU }; }, track: track,
    reset: function () { Object.keys(K).forEach(function (k) { store.del(K[k]); }); location.reload(); }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
