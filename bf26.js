/*!
 * BF26 Black Friday — логіка сторінки для Webflow.
 * Квіз = нативна Webflow-форма в компоненті «BF26 Quiz Card» (hero + блок 7, стан спільний).
 * Потрібно: window.BF26_CONFIG (bf26-config.js у footer), head.html (стан дедлайну, клас bf-js, CSS станів).
 * Сабміт: перехоплюємо форму (нативний сабміт Webflow блокуємо) і викликаємо обробник allright.com/webflow/index.js
 * (form.onsubmit) — він шле POST /api/v1/users?go-to=true. Відповідь ловимо через обгортку fetch.
 * Без цього файлу форма показує всі кроки і сабмітиться нативно.
 * Дебаг: window.BF26 (state, reset, track), ?bf_debug=1, ?bf_state=ended, ?_t2=1 (index.js не відправляє).
 */
(function () {
  'use strict';

  var CFG = window.BF26_CONFIG;
  if (!CFG) { console.warn('[bf26] BF26_CONFIG is missing'); return; }

  // Прапорці нових функцій: false = працює лише не на kid.allright.com (staging), поки не підтверджено
  var LIVE = {};
  var IS_PROD = /(^|\.)kid\.allright\.com$/.test(location.hostname);
  function on(flag) { return LIVE[flag] !== false || !IS_PROD; }

  var doc = document, root = doc.documentElement;
  var params = new URLSearchParams(location.search);
  var DEBUG = !!CFG.debug || params.has('bf_debug');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_market', 'gclid', 'fbclid', 'ttclid'];
  var MULTI = { activities: 'activities_', child_hobby: 'child_hobby_' };
  // крок → поле; тип: radio | multi | contact
  var STEPS = [null,
    { f: 'child_age', t: 'radio' }, { f: 'who_user_is', t: 'radio' }, { f: 'activities', t: 'multi' },
    { f: 'lessons_frequency', t: 'radio' }, { f: 'study_period', t: 'radio' }, { f: 'start_timing', t: 'radio' },
    { f: 'child_hobby', t: 'multi' }, { t: 'contact' }];
  var LAST = STEPS.length - 1;
  var K = { quiz: 'bf26:quiz', attr: 'bf26:attr' };

  /* ---------------------------------------------------------------- helpers */

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function log() { if (DEBUG) console.log.apply(console, ['[bf26]'].concat([].slice.call(arguments))); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  // localStorage: повернення на сторінку продовжує квіз з останнього кроку
  var store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------------------------------------------------------------- locale */

  function detectLocale() {
    var seg = (location.pathname.split('/')[1] || '').toLowerCase();
    if (CFG.locales[seg]) return seg;
    var lang = (root.getAttribute('lang') || '').toLowerCase().split('-')[0];
    return CFG.locales[lang] ? lang : CFG.defaultLocale;
  }
  var LOCALE = detectLocale();
  var LOC = CFG.locales[LOCALE] || CFG.locales[CFG.defaultLocale];
  var L = { code: LOCALE, phoneCode: LOC[0], phoneLen: LOC[1], eu: !!LOC[2] };
  var T = merge(CFG.texts[CFG.defaultLocale], CFG.texts[LOCALE] || {});
  var STATS = merge(CFG.stats, (CFG.statsByLocale || {})[LOCALE] || {});
  root.setAttribute('lang', T.htmlLang || LOCALE);
  if ((CFG.rtlLocales || []).indexOf(LOCALE) > -1) root.setAttribute('dir', 'rtl');
  if (L.eu) root.setAttribute('data-bf-eu', ''); else root.removeAttribute('data-bf-eu');
  root.classList.add('bf-js');

  /* ---------------------------------------------------------------- deadline + templates */

  var DEADLINE_MS = Date.parse(CFG.deadline);
  var DEADLINE_LABEL = new Intl.DateTimeFormat(T.dateLocale || 'uk-UA', {
    day: 'numeric', month: 'long', timeZone: CFG.deadlineTimeZone
  }).format(new Date(DEADLINE_MS));
  function ended() { return root.getAttribute('data-bf-state') === 'ended'; }
  function syncDeadline() {
    if (Date.now() >= DEADLINE_MS || params.get('bf_state') === 'ended') root.setAttribute('data-bf-state', 'ended');
  }
  function tpl(s, extra) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      if (extra && k in extra) return extra[k];
      if (k === 'date') return DEADLINE_LABEL;
      return k in STATS ? STATS[k] : m;
    });
  }

  /* ---------------------------------------------------------------- attribution */

  // Справжні мітки з адреси зберігаємо; значення за замовчуванням — лише якщо міток немає ні в адресі, ні в cookie
  var ATTR = (function () {
    var saved = store.get(K.attr) || {};
    var fresh = ATTR_KEYS.some(function (k) { return params.get(k); });
    if (fresh) ATTR_KEYS.forEach(function (k) { saved[k] = params.get(k) || ''; });
    store.set(K.attr, saved);
    return saved;
  })();
  function hasCookieUtm() { return /(^|;\s*)[^=]*utm_source[^=]*=/.test(doc.cookie) || /utm_source/.test(decodeURIComponentSafe(doc.cookie)); }
  function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function attrValues() {
    var out = {};
    ATTR_KEYS.forEach(function (k) { out[k] = ATTR[k] || ''; });
    if (!out.utm_source && !hasCookieUtm()) Object.keys(CFG.defaultUtm || {}).forEach(function (k) { if (!out[k]) out[k] = CFG.defaultUtm[k]; });
    return out;
  }

  /* ---------------------------------------------------------------- analytics */

  function safeConsent() { try { return !!CFG.consent.hasConsent(); } catch (e) { return false; } }
  var consentOk = !L.eu || safeConsent();
  var queue = [];
  function track(name, p) {
    var payload = merge({ locale: LOCALE, quiz_version: CFG.quizVersion }, p || {});
    if (!consentOk) { queue.push([name, payload]); log('queued (no consent)', name, payload); return; }
    log(name, payload);
    CFG.analytics.send(name, payload);
  }
  function onConsent(ok) {
    if (ok) {
      consentOk = true;
      while (queue.length) { var q = queue.shift(); log(q[0], q[1]); CFG.analytics.send(q[0], q[1]); }
    } else queue.length = 0;
  }
  doc.addEventListener('bf26:consent', function (e) { onConsent(!!(e.detail && e.detail.analytics)); });
  // Cookiebot на kid.allright.com: згода або відмова в банері
  addEventListener('CookiebotOnAccept', function () { if (L.eu) onConsent(safeConsent()); });
  addEventListener('CookiebotOnDecline', function () { if (L.eu) onConsent(false); });

  /* ---------------------------------------------------------------- static content */

  function fillStatic() {
    $$('[data-bf-stat]').forEach(function (el) {
      var k = el.getAttribute('data-bf-stat');
      if (k in STATS) el.textContent = String(STATS[k]); else console.warn('[bf26] unknown stat:', k);
    });
    $$('[data-bf-date]').forEach(function (el) { el.textContent = DEADLINE_LABEL; });
    $$('[data-bf-tpl]').forEach(function (el) {
      var w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) if (n.nodeValue.indexOf('{') > -1) n.nodeValue = tpl(n.nodeValue);
    });
    $$('[data-bf-locales]').forEach(function (el) {
      var list = el.getAttribute('data-bf-locales').split(/[\s,]+/);
      if (list.indexOf(LOCALE) < 0) el.hidden = true;
    });
    $$('[data-bf-legal]').forEach(function (a) {               // юридичні PDF: свої для uk, pl, es, it, ro; решта — en
      var docName = a.getAttribute('data-bf-legal');
      if (!/\.pdf$/.test(a.getAttribute('href') || '')) return;
      var lang = ['uk', 'pl', 'en', 'es', 'it', 'ro'].indexOf(LOCALE) > -1 ? LOCALE : 'en';
      a.href = 'https://allright.com/legal/' + docName + '/' + lang + '.pdf';
    });
  }

  function initCountdown() {
    var els = $$('[data-bf-countdown]');
    if (!els.length) return;
    // секунди: дописуємо клітинку за зразком хвилин (у Designer їх немає)
    els.forEach(function (el) {
      var m = $('[data-cd="m"]', el), item = m && m.closest('.bf_cd-item');
      if (!item || $('[data-cd="s"]', el)) return;
      var sec = item.cloneNode(true);
      sec.classList.remove('bf_cd-min'); sec.classList.add('bf_cd-sec');
      $('[data-cd]', sec).setAttribute('data-cd', 's');
      var u = $('.bf_cd-unit', sec); if (u) u.textContent = T.cdSec || 'сек';
      item.parentNode.insertBefore(sec, item.nextSibling);
    });
    var timer = setInterval(tick, 1000);
    function tick() {
      var ms = DEADLINE_MS - Date.now();
      if (ms <= 0) { clearInterval(timer); syncDeadline(); renderAll(); return; }
      var v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
      els.forEach(function (el) {
        ['d', 'h', 'm', 's'].forEach(function (u) {
          var t = $('[data-cd="' + u + '"]', el);
          if (t) flipTo(t, String(v[u]).padStart(2, '0'));
        });
      });
    }
    tick();
  }

  // таймер як flip-годинник: кожна цифра — картка з двох половин; при зміні верхня половина
  // старої цифри перекидається вниз, відкриваючи нову (як Flip.js від pqina, але на нашій розмітці)
  function flipCard(d) {
    var c = doc.createElement('span');
    c.className = 'bf_flip'; c.setAttribute('aria-hidden', 'true');
    ['top', 'bottom', 'front', 'back'].forEach(function (k) {
      var h = doc.createElement('span'), i = doc.createElement('span');
      h.className = 'bf_flip-' + k; i.textContent = d; h.appendChild(i); c.appendChild(h);
    });
    c.setAttribute('data-v', d);
    return c;
  }
  function flipTo(el, str) {
    if (el.getAttribute('aria-label') === str) return;
    el.setAttribute('aria-label', str);
    var cards = $$('.bf_flip', el);
    if (cards.length !== str.length) {
      el.textContent = '';
      str.split('').forEach(function (d) { el.appendChild(flipCard(d)); });
      return;
    }
    cards.forEach(function (c, i) {
      var nv = str[i], ov = c.getAttribute('data-v');
      if (nv === ov) return;
      var part = function (k) { return c.querySelector('.bf_flip-' + k + ' > span'); };
      part('top').textContent = nv; part('back').textContent = nv;
      part('bottom').textContent = ov; part('front').textContent = ov;
      c.setAttribute('data-v', nv);
      c.classList.remove('is-flipping'); void c.offsetWidth; c.classList.add('is-flipping');
      clearTimeout(c._t);
      c._t = setTimeout(function () { part('bottom').textContent = nv; c.classList.remove('is-flipping'); }, 620);
    });
  }

  /* ---------------------------------------------------------------- quiz state */

  function freshState() {
    return { step: 1, child_age: null, who_user_is: null, activities: [], lessons_frequency: null, study_period: null,
      start_timing: null, child_hobby: [], phone: '', phoneCountry: '', email: '', consent_marketing: false,
      event_id: null, lead_id: null, booking_url: null, fails: 0, started: false };
  }
  var S = merge(freshState(), store.get(K.quiz) || {});
  ['activities', 'child_hobby'].forEach(function (k) { if (!Array.isArray(S[k])) S[k] = []; });
  function save() { store.set(K.quiz, S); }
  var ui = { errors: {}, sendErr: '', sending: false };
  var cards = [];

  function leadTemp() {
    var hot = S.who_user_is === 'parent' && S.activities.length && S.activities.indexOf('none') < 0 &&
      S.start_timing && S.start_timing !== 'after_new_year' && S.start_timing !== 'just_looking';
    return hot ? 'hot' : 'cold';
  }
  function answered(n) {
    var st = STEPS[n];
    if (!st || st.t === 'contact') return true;
    return st.t === 'multi' ? S[st.f].length > 0 : !!S[st.f];
  }
  // не пускаємо на крок, для якого бракує відповідей
  function sanitize() {
    if (S.step < 1 || S.step > LAST) S.step = 1;
    for (var n = 1; n < S.step; n++) if (!answered(n)) { S.step = n; break; }
  }

  function formOf(card) { return $('form', card); }
  function placeOf(el) { var c = el.closest('[data-bf-quiz]'); return c ? c.getAttribute('data-bf-quiz') : ''; }
  function cardOf(el) { return el.closest('[data-bf-card]'); }
  function field(form, name) { return form.querySelector('[name="' + name + '"]'); }
  function labelText(input) {
    var w = input.closest('label') || input.parentNode, l = w && $('.bf_tile-label', w);
    return l ? l.textContent.trim() : w ? w.textContent.trim() : input.value;
  }
  function labelFor(form, name, value) {
    var i = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    return i ? labelText(i) : value;
  }

  /* ---------------------------------------------------------------- phone (intl-tel-input, якщо підключено) */

  var ITI = [];
  function anyIti() { return ITI.length ? ITI[0].iti : null; }
  function homeCountry() { return ((CFG.phone && CFG.phone.countryByLocale) || {})[LOCALE] || ''; }
  function phoneCountry() { var i = anyIti(); return i ? i.getSelectedCountryData() : null; }
  function setupIti(tel) {
    if (!window.intlTelInput || !CFG.phone) return null;
    var home = homeCountry(), pref = (CFG.phone.preferred || []).slice();
    if (home) { pref = pref.filter(function (c) { return c !== home; }); pref.unshift(home); }
    var iti = window.intlTelInput(tel, {
      initialCountry: S.phoneCountry || home || 'auto', preferredCountries: pref, separateDialCode: true,
      autoPlaceholder: 'polite', utilsScript: CFG.phone.utilsUrl, formatOnDisplay: false
    });
    ITI.push({ input: tel, iti: iti });
    var wrap = tel.closest('.bf_phone'); if (wrap) wrap.classList.add('has-iti');
    tel.addEventListener('countrychange', function () {
      var c = iti.getSelectedCountryData(); if (!c || !c.iso2 || c.iso2 === S.phoneCountry) return;
      S.phoneCountry = c.iso2; save();
      ITI.forEach(function (o) { if (o.iti !== iti && o.iti.getSelectedCountryData().iso2 !== c.iso2) o.iti.setCountry(c.iso2); });
      if (ui.errors.phone) { delete ui.errors.phone; renderAll(); }
    });
    return iti;
  }
  function phoneDigits(v) {
    var d = String(v).replace(/\D/g, ''), c = phoneCountry(), cc = c ? String(c.dialCode) : L.phoneCode.replace(/\D/g, '');
    if (d.length > 8 && d.indexOf(cc) === 0) d = d.slice(cc.length);
    return d.replace(/^0+/, '');
  }
  function lenOk(d, len) {
    if (!len) return d.length >= 6 && d.length <= 14;
    return Array.isArray(len) ? d.length >= len[0] && d.length <= len[1] : d.length === len;
  }
  function phoneValid(digits) {
    var c = phoneCountry(), i = anyIti();
    if (!c) return lenOk(digits, L.phoneLen);
    if (window.intlTelInputUtils && i) return i.isValidNumber();
    return lenOk(digits, c.iso2 === homeCountry() ? L.phoneLen : null);
  }
  function phoneE164(digits) {
    var c = phoneCountry(), i = anyIti();
    if (c) {
      if (window.intlTelInputUtils && i) { var n = i.getNumber(); if (n) return n; }
      return '+' + c.dialCode + digits;
    }
    return L.phoneCode + digits;
  }

  /* ---------------------------------------------------------------- one-time form setup */

  function setupForm(card) {
    var form = formOf(card), place = placeOf(card);
    if (!form) return;
    form.setAttribute('novalidate', '');
    form.setAttribute('data-name', 'bf26-quiz-' + place);
    var w = form.closest('.w-form'); if (w) w.setAttribute('data-name', 'bf26-quiz-' + place);
    // Webflow ставить radio name = id елемента, а Group Name кладе в data-name — вирівнюємо
    $$('input[data-name]', form).forEach(function (inp) {
      var dn = inp.getAttribute('data-name');
      if (dn && inp.type === 'radio' && inp.name !== dn) inp.name = dn;
    });
    // унікальні id/for у двох копіях форми
    $$('input:not([type=hidden])', form).forEach(function (inp, i) {
      var id = 'bf-' + place + '-' + (inp.name || 'f') + '-' + (inp.type === 'radio' ? inp.value : i);
      var lbl = inp.id && form.querySelector('label[for="' + inp.id + '"]');
      inp.id = id; if (lbl) lbl.setAttribute('for', id);
    });
    $$('[data-for]', form).forEach(function (lbl) { var inp = field(form, lbl.getAttribute('data-for')); if (inp) lbl.setAttribute('for', inp.id); });
    $$('[data-err]', form).forEach(function (d) {
      d.id = 'bf-' + place + '-err-' + d.getAttribute('data-err');
      var inp = field(form, d.getAttribute('data-err'));
      if (inp) inp.setAttribute('aria-describedby', d.id);
    });
    var cm = field(form, 'consent_marketing');
    if (cm) { cm.value = 'yes'; if (!L.eu) { cm.checked = false; cm.disabled = true; } }
    Object.keys(T.placeholders || {}).forEach(function (n) { var i = field(form, n); if (i) i.placeholder = T.placeholders[n]; });
    var tel = field(form, 'phone');
    if (tel) { tel.setAttribute('inputmode', 'tel'); tel.setAttribute('autocomplete', 'tel-national'); if (setupIti(tel)) tel.removeAttribute('placeholder'); }
    var em = field(form, 'email'); if (em) { em.setAttribute('inputmode', 'email'); em.setAttribute('autocomplete', 'email'); }

    // кроки з кількома відповідями: підказка під питанням
    $$('[data-step]', form).forEach(function (fs) {
      var st = STEPS[+fs.getAttribute('data-step')], lg = $('legend', fs);
      if (!st || st.t !== 'multi' || !lg || $('.bf_qmulti', fs)) return;
      var h = doc.createElement('p'); h.className = 'bf_qmulti'; h.textContent = T.multiHint || 'Можна обрати кілька варіантів';
      lg.parentNode.insertBefore(h, lg.nextSibling);
    });

    // клік по вже обраній відповіді (після «Назад») не дає change — переходимо далі самі.
    // click спрацьовує раніше за change, тож S ще містить попереднє значення
    form.addEventListener('click', function (e) {
      var t = e.target, st = STEPS[S.step];
      if (t.type !== 'radio' || !st || st.f !== t.name || S[t.name] !== t.value) return;
      if (t.name === 'who_user_is' && t.value === 'child') return;
      go(S.step + 1, card);
    });
    form.addEventListener('change', onChange);
    form.addEventListener('input', onInput);
    form.addEventListener('submit', onSubmit, true);   // capture: раніше за webflow.js та index.js
    card.addEventListener('click', onClick);
  }

  /* ---------------------------------------------------------------- render */

  function setHidden(form, name, value) {
    var h = form.querySelector('input[type=hidden][name="' + name + '"]');
    if (!h) { h = doc.createElement('input'); h.type = 'hidden'; h.name = name; form.appendChild(h); }
    h.value = value == null ? '' : value;
  }

  function renderCard(card) {
    var form = formOf(card);
    if (!form) return;
    card.classList.toggle('is-done', !!S.lead_id);
    card.classList.add('is-ready');

    // значення
    STEPS.forEach(function (st) {
      if (!st || st.t !== 'radio') return;
      $$('input[name="' + st.f + '"]', form).forEach(function (i) { i.checked = i.value === S[st.f]; });
    });
    Object.keys(MULTI).forEach(function (f) {
      $$('input[type=checkbox][name^="' + MULTI[f] + '"]', form).forEach(function (i) {
        i.checked = S[f].indexOf(i.name.slice(MULTI[f].length)) > -1;
      });
    });
    $$('input[type=radio], input[type=checkbox]', form).forEach(function (i) {
      var w = i.closest('label'); if (w) w.classList.toggle('is-selected', i.checked);
    });
    var tel = field(form, 'phone'), em = field(form, 'email'), cm = field(form, 'consent_marketing');
    if (tel && doc.activeElement !== tel) tel.value = S.phone;
    if (em && doc.activeElement !== em) em.value = S.email;
    if (cm) cm.checked = L.eu && !!S.consent_marketing;
    $$('[data-phone-code]', form).forEach(function (el) { el.textContent = L.phoneCode; });

    // кроки
    card.setAttribute('data-quiz-step', S.step);
    $$('[data-step]', form).forEach(function (f) { f.classList.toggle('is-active', +f.getAttribute('data-step') === S.step); });
    $$('[data-stepc]', card).forEach(function (el) { el.textContent = tpl(T.step, { n: S.step }); });
    renderProgress(card);
    $$('[data-child-hint]', form).forEach(function (el) { el.hidden = S.who_user_is !== 'child'; });
    $$('[data-child-next]', form).forEach(function (el) { el.hidden = S.who_user_is !== 'child'; });
    $$('[data-step] [data-act=next]', form).forEach(function (b) {
      var st = STEPS[+b.closest('[data-step]').getAttribute('data-step')], off = st && !answered(STEPS.indexOf(st));
      b.classList.toggle('is-disabled', !!off); b.setAttribute('aria-disabled', String(!!off));
    });

    // екран 8
    $$('[data-result-title]', form).forEach(function (el) { el.textContent = ended() ? T.resultTitleEnded : tpl(T.resultTitle); });
    $$('[data-chips]', form).forEach(function (box) {
      var chips = [];
      if (S.child_age) chips.push(tpl(T.ageChip, { age: labelFor(form, 'child_age', S.child_age) }));
      ['lessons_frequency', 'start_timing'].forEach(function (f) { if (S[f]) chips.push(labelFor(form, f, S[f])); });
      S.child_hobby.forEach(function (k) { var i = field(form, MULTI.child_hobby + k); if (i) chips.push(labelText(i)); });
      box.innerHTML = '';
      chips.forEach(function (c) { var s = doc.createElement('span'); s.className = 'bf_chip'; s.textContent = c; box.appendChild(s); });
    });

    // помилки
    ['activities', 'child_hobby', 'phone', 'email'].forEach(function (n) {
      var d = form.querySelector('[data-err="' + n + '"]'), i = field(form, n);
      if (d) d.textContent = ui.errors[n] || '';
      if (i) { i.setAttribute('aria-invalid', String(!!ui.errors[n])); i.classList.toggle('is-error', !!ui.errors[n]); }
    });
    $$('[data-err=send]', form).forEach(function (d) { d.textContent = ui.sendErr; });
    var sb = form.querySelector('[type=submit]');
    if (sb) {
      sb.disabled = ui.sending; sb.setAttribute('aria-busy', String(ui.sending));
      sb.value = ui.sending ? T.sending : T.submit;
    }
    $$('[data-fallback]', form).forEach(function (fb) { fb.hidden = S.fails < 2; });
    $$('[data-fallback-link]', form).forEach(function (a) { a.href = CFG.fullFunnelUrl(LOCALE, S.child_age); });
  }

  function renderAll() {
    cards.forEach(renderCard);
    $$('[data-bf-cta-label]').forEach(function (el) {
      if (!el.hasAttribute('data-label')) el.setAttribute('data-label', el.textContent);
      el.textContent = S.lead_id ? T.ctaDone : el.getAttribute('data-label');
    });
  }

  function focusStep(card) {
    var lg = S.lead_id ? $('[data-bf-done] .bf_qtitle:not([hidden])', card) : $('[data-step].is-active legend', card);
    if (lg) try { lg.focus({ preventScroll: true }); } catch (e) {}
    var top = card.getBoundingClientRect().top;
    if (top < 56) card.scrollIntoView({ block: 'start' });
  }

  function go(step, card) {
    var place = placeOf(card);
    S.step = step; save();
    ui.errors = {}; ui.sendErr = '';
    renderAll();
    if (step >= 2) track('bf_quiz_step_view', { step: step, place: place });
    if (step === LAST) track('bf_quiz_result_view', { lead_temp: leadTemp(), place: place });
    focusStep(card);
  }

  /* ---------------------------------------------------------------- events */

  function onChange(e) {
    var t = e.target, card = cardOf(t), place = placeOf(t), n = S.step, st = STEPS[n];
    if (t.type === 'radio') {
      var f = t.name;
      S[f] = t.value;
      if (f === 'child_age' && !S.started) {
        S.started = true; if (!S.event_id) S.event_id = uuid();
        track('bf_quiz_start', { child_age: S.child_age, place: place });
      }
      track('bf_quiz_answer', { step: n, value: t.value, place: place });
      save();
      if (f === 'who_user_is' && t.value === 'child') { renderAll(); return; }   // показуємо підказку, далі — кнопкою
      if (st && st.f === f) go(n + 1, card); else renderAll();
    } else if (t.type === 'checkbox') {
      if (t.name === 'consent_marketing') { S.consent_marketing = t.checked; save(); renderAll(); return; }
      Object.keys(MULTI).forEach(function (fld) {
        if (t.name.indexOf(MULTI[fld]) !== 0) return;
        var k = t.name.slice(MULTI[fld].length), arr = S[fld], i = arr.indexOf(k);
        if (t.checked && i < 0) arr.push(k);
        if (!t.checked && i > -1) arr.splice(i, 1);
        if (fld === 'activities' && t.checked) S.activities = k === 'none' ? ['none'] : arr.filter(function (x) { return x !== 'none'; });
        delete ui.errors[fld];
      });
      save(); renderAll();
    }
  }

  function onInput(e) {
    var t = e.target, n = t.name;
    if (n === 'phone') { t.value = t.value.replace(/[^\d ()-]/g, ''); S.phone = t.value; }
    else if (n === 'email') S.email = t.value.trim();
    else return;
    save();
    cards.forEach(function (c) { var f = formOf(c), x = f && field(f, n); if (x && x !== t) x.value = t.value; });
    if (ui.errors[n]) { delete ui.errors[n]; renderAll(); }
  }

  function next(card) {
    var n = S.step, st = STEPS[n], place = placeOf(card);
    if (!answered(n)) {
      if (st.t === 'multi') { ui.errors[st.f] = st.f === 'activities' ? T.errActivities : T.errHobby; renderAll(); }
      return;
    }
    if (st.t === 'multi') track('bf_quiz_answer', { step: n, value: S[st.f].join(','), place: place });   // GA4 не приймає масиви
    go(n + 1, card);
  }

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), card = e.currentTarget;
    if (act === 'submit') return;                     // кнопка сабміту — звичайний submit форми
    e.preventDefault();
    if (act === 'back') go(Math.max(1, S.step - 1), card);
    else if (act === 'next') next(card);
    else if (act === 'book') goBooking(placeOf(card));
  }

  /* ---------------------------------------------------------------- submit */

  function validateContact(card) {
    var form = formOf(card), digits = phoneDigits(S.phone), errs = {};
    if (!digits || !phoneValid(digits)) errs.phone = T.phoneError;
    if (!EMAIL_RE.test(S.email)) errs.email = T.emailError;
    ui.errors = errs;
    renderAll();
    var first = errs.phone ? 'phone' : errs.email ? 'email' : null;
    if (first) { var i = field(form, first); if (i) i.focus(); return false; }
    return digits;
  }

  function fillHidden(form) {
    var a = attrValues();
    Object.keys(a).forEach(function (k) { setHidden(form, k, a[k]); });
    setHidden(form, 'activities', S.activities.join(','));
    setHidden(form, 'child_hobby', S.child_hobby.join(','));
    setHidden(form, 'quiz_version', CFG.quizVersion);
    setHidden(form, 'lead_temp', leadTemp());
    setHidden(form, 'goals', goalsText());
  }

  // index.js не пропускає activities/study_period/start_timing/consent_marketing/quiz_version/lead_temp,
  // тому за запасним планом ТЗ (розділ 5) склеюємо їх у goals; маркер bf26 — для пошуку лідів у CRM
  function goalsText() {
    var parts = [CFG.quizVersion,
      'гуртки: ' + (S.activities.join(', ') || '—'),
      'частота: ' + (S.lessons_frequency || '—'),
      'період: ' + (S.study_period || '—'),
      'старт: ' + (S.start_timing || '—'),
      'інтереси: ' + (S.child_hobby.join(', ') || '—'),
      'lead_temp: ' + leadTemp()];
    if (L.eu) parts.push('згода на розсилку: ' + (S.consent_marketing ? 'yes' : 'no'));
    return parts.join(' | ');
  }

  var pending = null;   // { card, place, timer }

  function onSubmit(e) {
    var form = e.currentTarget, card = cardOf(form), place = placeOf(card);
    // нативний сабміт Webflow не потрібен: заявку відправляє index.js
    e.preventDefault(); e.stopImmediatePropagation();
    if (S.step !== LAST || ui.sending || S.lead_id) return;
    var digits = validateContact(card);
    if (!digits) return;

    track('bf_quiz_contact_submit', { lead_temp: leadTemp(), place: place });
    if (!S.event_id) S.event_id = uuid();
    save();
    fillHidden(form);
    var handler = form.onsubmit;                      // обробник index.js (перепризначається його MutationObserver)
    ui.sending = true; ui.sendErr = ''; renderAll();
    // номер у форматі +380… ставимо ПІСЛЯ renderAll: renderCard повертає в поле введений вигляд, і index.js узяв би номер без коду
    var tel = field(form, 'phone'), shown = tel ? tel.value : '';
    if (tel) tel.value = phoneE164(digits);
    pending = { card: card, place: place, timer: setTimeout(function () { onFail(); }, CFG.submitTimeoutMs || 15000) };
    try {
      if (typeof handler !== 'function') throw new Error('index.js handler missing');
      handler.call(form, { preventDefault: function () {}, target: form, currentTarget: form, type: 'submit' });
    } catch (err) {
      console.error('[bf26] submit', err);
      onFail();
    }
    if (tel) setTimeout(function () { tel.value = shown; }, 0);   // FormData вже прочитано синхронно
    if (params.has('_t2')) {                         // index.js у режимі _t2 лише пише payload у консоль — емулюємо успіх для QA
      setTimeout(function () { onLead({ user_id: 'test-' + S.event_id, 'go-to': null }); }, 600);
    }
  }

  // відповідь POST /api/v1/users (go-to — посилання на вибір часу пробного уроку)
  (function () {
    if (!window.fetch || window.__bf26FetchHooked) return;
    window.__bf26FetchHooked = true;
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
    var place = pending.place; pending = null;
    ui.sending = false;
    S.lead_id = b.user_id || S.event_id;
    S.booking_url = b['go-to'] || b.go_to || null;
    S.fails = 0; save();
    track('bf_lead_created', { lead_temp: leadTemp(), place: place });
    // на сторінках /self… index.js переходить за go-to сам; якщо за 3 с переходу немає — переходимо ми або показуємо «зарезервовано»
    setTimeout(function () {
      renderAll();
      if (S.booking_url && !params.has('_t2')) goBooking(place);
      else cards.forEach(function (c) { if (placeOf(c) === place) focusStep(c); });
    }, S.booking_url ? CFG.goToWaitMs || 3000 : 0);
  }

  function onFieldErrors(b) {
    var out = {};
    var list = b && b.errors ? (Array.isArray(b.errors) ? b.errors : Object.keys(b.errors).map(function (k) { return { field: k, detail: b.errors[k] }; })) : [];
    list.forEach(function (er) {
      var f = String(er.field || (er.source && er.source.pointer) || '').split('/').pop().split('.').pop();
      var msg = er.detail || er.message || er.title;
      // «вже зареєстровано» з API приходить англійською — показуємо свій текст
      if (/NOT_UNIQUE/.test(er.code || '') || /already in use/i.test(msg || '')) msg = (f === 'email' ? T.emailTaken : T.phoneTaken) || msg;
      if ((f === 'phone' || f === 'email') && msg) out[f] = String(msg);
    });
    if (!Object.keys(out).length) return onFail();
    clearTimeout(pending.timer); pending = null;
    ui.sending = false; ui.errors = out; renderAll();
  }

  function onFail() {
    if (pending) { clearTimeout(pending.timer); pending = null; }
    if (!ui.sending) return;
    ui.sending = false; S.fails++; save();
    ui.sendErr = T.sendError;
    renderAll();
  }

  function goBooking(place) {
    if (!S.booking_url) return;
    track('bf_booking_click', { place: place, transport_type: 'beacon' });
    var url = S.booking_url;
    setTimeout(function () { location.assign(url); }, 200);
  }

  // прогрес-бар під шапкою квізу (як на 10thbirthday): створюється один раз, ширина = крок / кількість кроків
  function renderProgress(card) {
    var bar = $('[data-bf-progress]', card), head = $('.bf_quiz-head', card);
    if (!bar && head) {
      bar = doc.createElement('div');
      bar.className = 'bf_qprogress'; bar.setAttribute('data-bf-progress', ''); bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '1'); bar.setAttribute('aria-valuemax', String(LAST));
      bar.innerHTML = '<span class="bf_qprogress-fill"></span>';
      head.parentNode.insertBefore(bar, head.nextSibling);
    }
    if (!bar) return;
    bar.setAttribute('aria-valuenow', String(S.step));
    bar.setAttribute('aria-valuetext', tpl(T.step, { n: S.step }));
    bar.firstChild.style.width = (S.step / LAST * 100) + '%';
  }

  function initQuiz() {
    sanitize();
    cards = $$('[data-bf-quiz] [data-bf-card]');
    cards.forEach(setupForm);
    renderAll();
  }

  /* ---------------------------------------------------------------- CTA, video, FAQ, scroll */

  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initCtas() {
    $$('[data-bf-cta]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var place = el.getAttribute('data-bf-cta');
        if (S.lead_id && S.booking_url) { goBooking(place); return; }
        track('bf_cta_click', { place: place });
        var card = $('[data-bf-quiz="hero"] [data-bf-card]') || cards[0];
        if (!card) return;
        card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(function () { focusStep(card); }, reduceMotion ? 0 : 500);
      });
    });
  }

  // відео: data-bf-video="{YouTube id}", постер з i.ytimg.com, плеєр youtube-nocookie завантажується по кліку
  function initVideos() {
    $$('[data-bf-video]').forEach(function (box) {
      var id = box.getAttribute('data-bf-video'); if (!id) return;
      var img = $('img', box);
      if (img) {
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.alt = '';
        img.onerror = function () { img.onerror = null; img.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; };
        img.src = 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg';
      }
      var btn = $('[data-bf-video-play]', box) || box;
      btn.setAttribute('role', 'button'); btn.setAttribute('tabindex', '0');
      function play(e) {
        e.preventDefault();
        if (box.classList.contains('is-playing')) return;
        box.classList.add('is-playing');
        var f = doc.createElement('iframe');
        f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&playsinline=1&cc_load_policy=1&hl=' + LOCALE;
        f.allow = 'autoplay; fullscreen; picture-in-picture'; f.allowFullscreen = true;
        f.title = btn.getAttribute('aria-label') || 'Video'; f.className = 'bf_video-frame';
        box.appendChild(f);
        track('bf_video_play', { id: id });
      }
      btn.addEventListener('click', play);
      btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') play(e); });
    });
  }

  // FAQ: [data-bf-faq-item] > [data-bf-faq-q] + [data-bf-faq-a]. Два Collection List: data-bf-show="before" (усі питання)
  // і data-bf-show="after" (лише «Show after deadline») — беремо той, що видно в поточному стані
  function initFaq() {
    var hiddenList = ended() ? '[data-bf-show="before"]' : '[data-bf-show="after"]';
    var items = $$('[data-bf-faq-item]').filter(function (it) { return !it.closest(hiddenList); });
    $$('[data-bf-block="faq"]').forEach(function (b) { if (!items.length) b.hidden = true; });
    if (!items.length) return;
    var entities = [];
    items.forEach(function (item, i) {
      var q = $('[data-bf-faq-q]', item), a = $('[data-bf-faq-a]', item);
      if (!q || !a) return;
      q.id = q.id || 'bf-faq-' + (i + 1) + '-q'; a.id = a.id || 'bf-faq-' + (i + 1) + '-a';
      q.setAttribute('role', 'button'); q.setAttribute('tabindex', '0');
      q.setAttribute('aria-controls', a.id); q.setAttribute('aria-expanded', 'false');
      a.setAttribute('role', 'region'); a.setAttribute('aria-labelledby', q.id);
      a.hidden = false; a.style.height = '0px'; a.setAttribute('aria-hidden', 'true');
      a.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'height' && q.getAttribute('aria-expanded') === 'true') a.style.height = 'auto';
      });
      // розгортання по висоті, як на CAH (CSS-перехід 400 мс)
      function toggle() {
        var open = q.getAttribute('aria-expanded') !== 'true';
        q.setAttribute('aria-expanded', String(open)); item.classList.toggle('is-open', open);
        a.setAttribute('aria-hidden', String(!open));
        if (open) {
          a.style.height = a.scrollHeight + 'px';
          if (reduceMotion) a.style.height = 'auto';
          track('bf_faq_open', { q: item.getAttribute('data-bf-faq-item') || q.textContent.trim() });
        } else {
          a.style.height = a.scrollHeight + 'px'; void a.offsetHeight; a.style.height = '0px';
        }
      }
      q.addEventListener('click', toggle);
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      entities.push({ '@type': 'Question', name: q.textContent.trim(), acceptedAnswer: { '@type': 'Answer', text: a.textContent.trim() } });
    });
    var s = doc.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities });
    doc.head.appendChild(s);
  }

  // порожні CMS-блоки: відгуки без записів ховаємо разом із заголовком, пакети — без карток
  function initEmptyBlocks() {
    $$('[data-bf-block^="reviews"]').forEach(function (b) {
      // відео-картки без ID (текстові відгуки) прибираємо; блок ховаємо, лише коли немає ні відео, ні тексту
      $$('[data-bf-video]', b).forEach(function (v) { if (!v.getAttribute('data-bf-video')) { var it = v.closest('.w-dyn-item') || v; it.remove(); } });
      var vids = $('[data-bf-video]', b), texts = $('[data-bf-wall] .w-dyn-item', b);
      var slot = $('[data-bf-reviews]', b); if (slot && !vids) slot.hidden = true;
      var tw = $('[data-bf-wall]', b); if (tw && !texts) tw.hidden = true;
      if (!vids && !texts) b.hidden = true;
    });
    $$('[data-bf-packages]').forEach(function (b) { if (!$('.w-dyn-item', b)) b.hidden = true; });
  }

  // стрічка нагород (як на 10thbirthday): нескінченна, пауза при наведенні, тягнеться мишею/пальцем, стоїть поза екраном
  function initMarquee() {
    var M = { speed: 0.6, stopOnMouseEnter: true };
    $$('[data-bf-marquee]').forEach(function (wrap) {
      var track = wrap.querySelector('[role=list]') || wrap.firstElementChild;
      if (!track || track.children.length < 2) return;
      var orig = Array.prototype.slice.call(track.children);
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.classList.add('is-marquee');
      var setW = 0, x = 0, vel = 0, hover = false, drag = null, moved = false, last = 0;
      function build() {
        Array.prototype.slice.call(track.querySelectorAll('.is-clone')).forEach(function (c) { c.remove(); });
        setW = track.scrollWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
        // клони, поки стрічка не покриє 2 ширини обгортки (щоб «шов» ніколи не було видно)
        var k = 0;
        while (track.scrollWidth < wrap.clientWidth * 2 + setW && k < 8) {
          orig.forEach(function (o) {
            var c = o.cloneNode(true); c.classList.add('is-clone'); c.setAttribute('aria-hidden', 'true'); c.setAttribute('inert', '');
            track.appendChild(c);
          });
          k++;
        }
      }
      function wrapX() { if (setW > 0) { while (x <= -setW) x += setW; while (x > 0) x -= setW; } }
      function tick(t) {
        var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
        if (!drag) {
          if (Math.abs(vel) > 5) { x += vel * dt; vel *= Math.pow(0.05, dt); }          // інерція після кидка
          else { vel = 0; if (!hover && !reduce) x -= (M.speed || 0.6) * 60 * dt * (root.dir === 'rtl' ? -1 : 1); }
        }
        wrapX();
        track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
        if (onScreen || drag) requestAnimationFrame(tick); else { running = false; last = 0; }
      }
      var onScreen = true, running = true;
      function resume() { if (!running) { running = true; last = 0; requestAnimationFrame(tick); } }
      if (window.IntersectionObserver) {   // поза екраном стрічка стоїть — не вантажить процесор
        new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen) resume(); }).observe(wrap);
      }
      wrap.addEventListener('mouseenter', function () { if (M.stopOnMouseEnter !== false) hover = true; });
      wrap.addEventListener('mouseleave', function () { hover = false; });
      wrap.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return;
        drag = { sx: e.clientX, x0: x, px: e.clientX, pt: performance.now(), v: 0, id: e.pointerId }; moved = false; vel = 0; resume();
      });
      addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.sx;
        if (!moved && Math.abs(dx) > 5) { moved = true; wrap.classList.add('is-dragging'); try { wrap.setPointerCapture(e.pointerId); } catch (er) {} }
        if (!moved) return;
        var now = performance.now();
        drag.v = (e.clientX - drag.px) / Math.max(1, (now - drag.pt) / 1000); drag.px = e.clientX; drag.pt = now;
        x = drag.x0 + dx;
      }, { passive: true });
      function end() { if (!drag) return; if (moved) vel = Math.max(-2500, Math.min(2500, drag.v)); drag = null; wrap.classList.remove('is-dragging'); }
      addEventListener('pointerup', end); addEventListener('pointercancel', end);
      wrap.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      build();
      if (window.ResizeObserver) new ResizeObserver(function () { build(); }).observe(wrap);
      addEventListener('load', build);
      requestAnimationFrame(tick);
    });
  }
  // «Що входить» як на pika.art: на десктопі активна картка — та, що посередині екрана (або під курсором),
  // зображення ліворуч змінюється під неї; на мобільному кожна картка показує копію свого зображення
  function initFeat() {
    $$('[data-bf-feat-wrap]').forEach(function (wrap) {
      var cards = $$('[data-bf-feat]', wrap), medias = $$('.bf_feat-frame [data-bf-feat-media]', wrap), frame = $('.bf_feat-frame', wrap);
      if (!cards.length) return;
      cards.forEach(function (c) {                       // зображення вставляють один раз — у рамку ліворуч
        var slot = $('[data-bf-feat-slot]', c), m = medias[+c.getAttribute('data-bf-feat')];
        if (slot && m && !slot.firstChild) { var k = m.cloneNode(true); k.setAttribute('aria-hidden', 'true'); slot.appendChild(k); }
      });
      var current = -1;
      function set(i) {
        if (i === current) return; current = i;
        cards.forEach(function (c, n) { c.classList.toggle('is-active', n === i); });
        medias.forEach(function (m, n) { m.classList.toggle('is-active', n === i); });
      }
      function sync() { if (frame && frame.offsetHeight) wrap.style.setProperty('--bf-feat-h', frame.offsetHeight + 'px'); }
      sync(); addEventListener('resize', sync, { passive: true });
      set(0);
      var desktop = window.matchMedia ? matchMedia('(min-width: 992px)') : { matches: true };
      if (window.IntersectionObserver) {
        var io = new IntersectionObserver(function (en) {
          if (!desktop.matches) return;
          en.forEach(function (e) { if (e.isIntersecting) set(+e.target.getAttribute('data-bf-feat')); });
        }, { rootMargin: '-45% 0px -45% 0px' });
        cards.forEach(function (c) { io.observe(c); });
      }
      cards.forEach(function (c) {
        c.addEventListener('mouseenter', function () { if (desktop.matches) set(+c.getAttribute('data-bf-feat')); });
        c.addEventListener('click', function () { set(+c.getAttribute('data-bf-feat')); });
      });
    });
  }

  // фон hero «Light Bloom» (Originkit, WebGL): окремий файл, найнижчий шар hero; замінив «Side Rays» (bf26-rays.js лишився в репо)
  function initRays() {
    if (!$('.bf_hero') || window.BF26_BLOOM === false) return;
    var me = $('script[src*="bf26.js"]'), base = me ? me.src.replace(/bf26\.js.*$/, '') : 'https://cdn.jsdelivr.net/gh/design-spec/bf26-assets@v1.0.0/';
    var s = doc.createElement('script'); s.src = base + 'bf26-bloom.js'; s.async = true; doc.head.appendChild(s);
  }


  // hero: «Black Friday в All Right» — стрічки скотчу BLACK / FRIDAY, за BLACK «в» + логотип, за FRIDAY зірка −60%.
  // Зірка переїжджає з h1, тож двокрапка в кінці заголовка більше не потрібна
  // логотип для hero — файл із Webflow Assets (кольори вже в SVG)
  var LOGO = '<img class="bf_brand-logo" src="https://cdn.prod.website-files.com/64997bee22af293e5156648a/69a6f4aacf26fb8379def5e1_Al%20Right.svg" width="176" height="32" alt="All Right">';
  function initTapes() {
    var eb = $('.bf_hero .bf_eyebrow');
    if (!eb || eb.querySelector('.bf_tape')) return;
    var words = eb.textContent.trim().split(/\s+/);
    if (words.length < 2) return;
    var rest = words.slice(2).join(' '), m = rest.match(/^(.*?)\s*All\s*Right$/i);
    // два рядки: [BLACK][в + логотип] / [FRIDAY][зірка] — логотип стоїть одразу за BLACK, а не за ширшою FRIDAY
    eb.innerHTML = '<span class="bf_tapes-row"><span class="bf_tape is-1"></span> ' +
      '<span class="bf_brand"><span class="bf_brand-pre"></span> ' + (m ? LOGO : '<span class="bf_brand-text"></span>') + '</span></span> ' +
      '<span class="bf_tapes-row is-2"><span class="bf_tape is-2"></span></span>';
    $('.bf_tape.is-1', eb).textContent = words[0];
    $('.bf_tape.is-2', eb).textContent = words[1];
    $('.bf_brand-pre', eb).textContent = m ? m[1] : '';
    if (!m) $('.bf_brand-text', eb).textContent = rest;
    var st = $('.bf_hero .bf_sticker.is-hero');
    if (st) {
      var h1 = st.closest('h1'), tag = doc.createElement('span');
      tag.className = 'bf_tag';
      tag.appendChild(st);
      $('.bf_tapes-row.is-2', eb).appendChild(tag);
      if (h1) {
        var t = h1.lastChild;
        while (t && t.nodeType === 3 && !t.nodeValue.trim()) t = t.previousSibling;
        if (t && t.nodeType === 3) t.nodeValue = t.nodeValue.replace(/\s*[:：]\s*$/, '');
      }
    }
    eb.classList.add('is-tapes');
  }

  // швидке меню у верхній смузі: пункти — T.nav [[id секції, підпис], …]; на всіх екранах — кнопка-«бургер» зі списком.
  // Пункт поточної секції підсвічується (IntersectionObserver)
  function initNav() {
    // якір для блоку цін (він усередині секції «Що входить» і власного id у Designer не має)
    var pk = $('[data-bf-packages]'); if (pk && !pk.id) pk.id = 'bf-prices';
    var bar = $('.bf_bar-inner'), items = (T.nav || []).filter(function (n) { return doc.getElementById(n[0]); });
    if (!bar || !items.length || $('.bf_nav', bar)) return;
    var nav = doc.createElement('nav'), btn = doc.createElement('button');
    nav.className = 'bf_nav'; nav.id = 'bf-nav'; nav.setAttribute('aria-label', T.navLabel || 'Меню');
    items.forEach(function (n) {
      var a = doc.createElement('a');
      a.href = '#' + n[0]; a.textContent = n[1]; a.className = 'bf_nav-link';
      a.addEventListener('click', function (e) {
        track('bf_nav_click', { section: n[0] }); close();
        // скролимо самі: Webflow рахує позицію з transform, а ще не показаний .bf_reveal зсунутий на 100px
        var t = doc.getElementById(n[0]); if (!t) return;
        e.preventDefault(); e.stopPropagation();
        var y = 0; for (var el = t; el; el = el.offsetParent) y += el.offsetTop;
        y -= parseFloat(getComputedStyle(t).scrollMarginTop) || 0;
        window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
        try { history.replaceState(null, '', '#' + n[0]); } catch (er) {}
      });
      nav.appendChild(a);
    });
    btn.type = 'button'; btn.className = 'bf_nav-toggle';
    btn.setAttribute('aria-controls', 'bf-nav'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', T.navLabel || 'Меню');
    btn.innerHTML = '<span></span><span></span><span></span>';
    function close() { bar.classList.remove('is-nav-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function () {
      var open = bar.classList.toggle('is-nav-open');
      btn.setAttribute('aria-expanded', String(open));
    });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    doc.addEventListener('click', function (e) { if (!bar.contains(e.target)) close(); });
    var cta = $('.bf_btn-bar', bar);
    if (cta) {
      var c2 = cta.cloneNode(true);
      c2.classList.add('bf_nav-cta'); c2.setAttribute('data-bf-cta', 'nav');
      c2.addEventListener('click', close);
      nav.appendChild(c2);
    }
    initLang(bar, cta);
    // логотип по центру «таблетки» (той самий файл, що й у hero)
    var logo = doc.createElement('a');
    logo.className = 'bf_nav-logo'; logo.href = '#bf-quiz'; logo.setAttribute('aria-label', 'All Right');
    logo.innerHTML = LOGO;
    bar.insertBefore(logo, bar.firstChild);
    bar.insertBefore(nav, bar.firstChild);
    bar.appendChild(btn);
    bar.classList.add('has-nav');
    if (!window.IntersectionObserver) return;
    var links = $$('.bf_nav-link', nav);
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    items.forEach(function (n) { io.observe(doc.getElementById(n[0])); });
  }

  // компактний вибір мови в шапці зліва від CTA. Список — CFG.langs [код, підпис, назва];
  // мова без готової сторінки (немає в CFG.langsLive) показується неактивною з підказкою «Незабаром»
  function initLang(bar, cta) {
    var list = CFG.langs || [], live = CFG.langsLive || [LOCALE];
    if (list.length < 2 || $('.bf_lang', bar)) return;
    var cur = list.filter(function (l) { return l[0] === LOCALE; })[0] || list[0];
    var wrap = doc.createElement('div'), btn = doc.createElement('button'), menu = doc.createElement('ul');
    wrap.className = 'bf_lang';
    btn.type = 'button'; btn.className = 'bf_lang-btn';
    btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', (T.langLabel || 'Мова') + ': ' + cur[2]);
    btn.innerHTML = '<span class="bf_lang-ico" aria-hidden="true"></span><span>' + cur[1] + '</span><span class="bf_lang-chev" aria-hidden="true"></span>';
    menu.className = 'bf_lang-menu';
    list.forEach(function (l) {
      var li = doc.createElement('li'), a = doc.createElement('a'), on = live.indexOf(l[0]) > -1;
      a.className = 'bf_lang-item' + (l[0] === LOCALE ? ' is-current' : '');
      a.setAttribute('lang', l[0]); a.textContent = l[2];
      if (l[0] === LOCALE) a.setAttribute('aria-current', 'true');
      if (on) a.href = location.pathname.replace(/^\/[a-z]{2}(?=\/)/, '/' + l[0]) + location.search;
      else { a.setAttribute('aria-disabled', 'true'); a.title = T.langSoon || 'Незабаром'; a.className += ' is-soon'; }
      a.addEventListener('click', function (e) { if (!on) return e.preventDefault(); track('bf_lang_click', { to: l[0] }); });
      li.appendChild(a); menu.appendChild(li);
    });
    function close() { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); bar.classList.remove('is-nav-open');
      btn.setAttribute('aria-expanded', String(wrap.classList.toggle('is-open')));
    });
    doc.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    wrap.appendChild(btn); wrap.appendChild(menu);
    bar.insertBefore(wrap, cta || null);
  }

  // фон hero «поле з кільцем» (Canvas 2D): окремий файл; вимкнути — window.BF26_RING = false
  function initRing() {
    if (!$('.bf_hero') || window.BF26_RING === false) return;
    var me = $('script[src*="bf26.js"]'), base = me ? me.src.replace(/bf26\.js.*$/, '') : 'https://cdn.jsdelivr.net/gh/design-spec/bf26-assets@v1.0.0/';
    var s = doc.createElement('script'); s.src = base + 'bf26-ring.js'; s.async = true; doc.head.appendChild(s);
  }

  // «Animated Content» (reactbits): контент секцій по черзі виїжджає знизу, коли потрапляє в кадр.
  // Блок «Зарезервуйте» — по елементах тексту + квіз; решта секцій — прямі діти контейнера
  function initReveal() {
    if (reduceMotion || !window.IntersectionObserver) return;
    var groups = [$$('#bf-repeat .bf_hero-text > *, #bf-repeat .bf_quiz-slot')];
    $$('.bf_section:not(.bf_repeat) > .bf_container').forEach(function (c) { groups.push($$(':scope > *', c)); });
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    groups.forEach(function (items) {
      items.forEach(function (el, i) {
        el.classList.add('bf_reveal'); el.style.setProperty('--bf-rd', (Math.min(i, 5) * 0.1) + 's'); io.observe(el);
      });
    });
  }

  // «Scroll Stack» (reactbits): картка зменшується, поки наступна наїжджає на неї; глибші картки — менші (як baseScale + i·itemScale)
  function initStack() {
    var cards = $$('[data-bf-feat-wrap] [data-bf-feat]');
    if (cards.length < 2 || reduceMotion) return;
    var BASE = 0.85, STEP = 0.03, busy = false;
    function update() {
      busy = false;
      cards.forEach(function (c, i) {
        var next = cards[i + 1];
        if (!next) { c.style.transform = ''; return; }
        var stick = parseFloat(getComputedStyle(next).top) || 0, h = c.offsetHeight || 1;
        var p = Math.min(1, Math.max(0, 1 - (next.getBoundingClientRect().top - stick) / h));
        var target = BASE + i * STEP;
        // далі наступні картки докидають ще трохи — стопка «осідає» глибше
        for (var j = i + 2; j < cards.length; j++) {
          var n = cards[j], st = parseFloat(getComputedStyle(n).top) || 0;
          p += Math.min(1, Math.max(0, 1 - (n.getBoundingClientRect().top - st) / (n.offsetHeight || 1))) * 0.35;
        }
        c.style.transform = 'scale(' + Math.max(target - 0.05, 1 - Math.min(p, 1.35) * (1 - target)).toFixed(4) + ')';
      });
    }
    addEventListener('scroll', function () { if (!busy) { busy = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  }

  // «Emoji Burst» (Originkit, код надав користувач): натиск на помаранчеву кнопку — 16 емодзі вилітають угору й падають
  // під гравітацією, кнопка коротко хитається. Шар фіксований над сторінкою, тож видно й під час прокрутки до квізу
  function initBurst() {
    if (reduceMotion) return;
    var EMOJIS = ['🎉', '✨', '😄', '🔥', '💥', '⭐', '💖', '🤩', '👍', '🥳', '🎊', '😎'];
    var COUNT = 16, POWER = 12, SPREAD = 55, GRAVITY = 4 * 0.15, SIZE = 20, MAX = 140;
    var layer = null, parts = [], raf = 0, last = 0;
    function step(ts) {
      var dt = last ? (ts - last) / 16.6667 : 1; last = ts; if (dt > 3) dt = 3;
      var W = innerWidth, H = innerHeight;
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt; p.life -= dt;
        if (p.life <= 0 || p.y > H + p.size * 2.5 || p.x < -p.size * 3 || p.x > W + p.size * 3) { p.el.remove(); parts.splice(i, 1); continue; }
        p.el.style.opacity = String(p.life < 22 ? Math.max(0, p.life / 22) : 1);
        p.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) rotate(' + p.rot + 'deg)';
      }
      if (parts.length) raf = requestAnimationFrame(step); else { raf = 0; last = 0; }
    }
    function burst(btn) {
      if (!layer) {
        layer = doc.createElement('div'); layer.setAttribute('aria-hidden', 'true');
        layer.style.cssText = 'position:fixed;inset:0;z-index:1000;pointer-events:none;overflow:hidden';
        doc.body.appendChild(layer);
      }
      var r = btn.getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      if (btn.animate) btn.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2.5deg)' }, { transform: 'rotate(-1deg)' }, { transform: 'rotate(0deg)' }],
        { duration: 260, easing: 'cubic-bezier(.36,.07,.19,.97)' });
      for (var k = 0; k < COUNT && parts.length < MAX; k++) {
        var el = doc.createElement('span');
        el.textContent = EMOJIS[(Math.random() * EMOJIS.length) | 0];
        el.style.cssText = 'position:absolute;left:0;top:0;font-size:' + SIZE + 'px;line-height:1;will-change:transform,opacity;user-select:none';
        layer.appendChild(el);
        var ang = ((-90 + (Math.random() * 2 - 1) * SPREAD) * Math.PI) / 180, sp = POWER * (0.65 + Math.random() * 0.8);
        parts.push({ el: el, x: ox - SIZE / 2, y: oy - SIZE / 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          rot: Math.random() * 360, vrot: (Math.random() * 2 - 1) * 14, size: SIZE, life: 260 });
      }
      if (!raf) { last = 0; raf = requestAnimationFrame(step); }
    }
    doc.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest('.bf_btn:not(.bf_btn-bar), .bf_qnext, .bf_nav-cta');
      if (!b || b.classList.contains('is-disabled') || b.disabled) return;
      burst(b);
    }, { passive: true });
  }

  // святкові кульки при відкритті сторінки: окремий файл, без «зменшення руху»; вимкнути — window.BF26_BALLOONS = false
  function initBalloons() {
    if (reduceMotion || window.BF26_BALLOONS === false) return;
    var me = $('script[src*="bf26.js"]'), base = me ? me.src.replace(/bf26\.js.*$/, '') : 'https://cdn.jsdelivr.net/gh/design-spec/bf26-assets@v1.0.0/';
    var s = doc.createElement('script'); s.src = base + 'bf26-balloons.js'; s.async = true; doc.head.appendChild(s);
  }

  // hero «як CAH»: карти час від часу перероздаються (одна за раз, нова лягає зверху); стоїть поза екраном і у фоновій вкладці
  function initTable() {
    var table = $('[data-bf-table]');
    if (!table || reduceMotion || root.getAttribute('data-bf-hero') !== 'cards') return;
    var visible = true, last = null;
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(table);
    setInterval(function () {
      if (!visible || doc.hidden || !table.offsetParent) return;
      var cards = $$('[data-bf-pcard]', table).filter(function (c) { return c !== last && !c.matches(':hover'); });
      if (!cards.length) return;
      var c = cards[Math.floor(Math.random() * cards.length)]; last = c;
      c.classList.remove('is-redeal'); void c.offsetWidth; c.classList.add('is-redeal');
      setTimeout(function () { table.appendChild(c); }, 420);   // у верхній точці «польоту» — на верх колоди
    }, 3600);
  }

  // колода карт «Як працює резервування»: роздаються, коли блок з'являється на екрані
  function initDeck() {
    var decks = $$('[data-bf-deck]');
    if (!decks.length) return;
    if (!window.IntersectionObserver || reduceMotion) { decks.forEach(function (d) { d.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.2 });
    decks.forEach(function (d) { io.observe(d); });
  }

  // умови знижки у футері як Blur Highlight (React Bits): фрази з T.termsHighlight обгортаються в span.bf_hl,
  // абзац проявляється з розмиття, підсвітка «заливається» зліва направо, коли футер з'являється на екрані
  function markPhrase(p, phrase, i) {
    var walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) {
      if (node.parentNode.classList && node.parentNode.classList.contains('bf_hl')) continue;
      var at = node.nodeValue.indexOf(phrase);
      if (at < 0) continue;
      var hit = node.splitText(at); hit.splitText(phrase.length);
      var span = doc.createElement('span');
      span.className = 'bf_hl'; span.style.setProperty('--bf-i', i);
      hit.parentNode.replaceChild(span, hit); span.appendChild(hit);
      return true;
    }
    return false;
  }

  // підсвітка фраз + проява з розмиття, коли блок у полі зору: умови у футері і підзаголовок hero
  function highlight(box, paras, phrases) {
    if (!box) return;
    var n = 0;
    paras.forEach(function (p) {
      (phrases || []).forEach(function (ph) { if (markPhrase(p, ph, n)) n++; });
    });
    if (!window.IntersectionObserver || reduceMotion) { box.classList.add('is-in'); return; }
    var io = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { box.classList.add('is-in'); io.disconnect(); }
    }, { rootMargin: '0px 0px -20% 0px', threshold: 0.3 });
    io.observe(box);
  }

  // «−60%» — окрема плашка (span навколо фрази, текст у Designer не міняється): заголовок «Що входить» — помаранчева, смуга вгорі — фіолетова
  function initPill() {
    [['#bf-offer .bf_h2', ''], ['.bf_bar-text', ' is-violet']].forEach(function (cfg) {
      $$(cfg[0]).forEach(function (h) {
        if ($('.bf_pill60', h)) return;
        var w = doc.createTreeWalker(h, NodeFilter.SHOW_TEXT), n;
        while ((n = w.nextNode())) {
          var at = n.nodeValue.search(/[−-]\s?60\s?%/);
          if (at < 0) continue;
          var m = n.nodeValue.slice(at).match(/^[−-]\s?60\s?%/)[0], hit = n.splitText(at);
          hit.splitText(m.length);
          var sp = doc.createElement('span'); sp.className = 'bf_pill60' + cfg[1];
          hit.parentNode.replaceChild(sp, hit); sp.appendChild(hit);
          return;
        }
      });
    });
  }

  // заголовок блоку «Зарезервуйте»: «Зарезервуйте» + біла плашка з датою + біла зірка «−60%» (макет 29.10).
  // Текст береться з заголовка після підстановки {date}, тож у Designer він редагується як звичайно
  function initCtaHead() {
    $$('#bf-repeat .bf_h2[data-bf-show="before"]').forEach(function (h) {
      if (h.classList.contains('is-split')) return;
      var t = h.textContent.trim(), m = t.match(/^(.*?)\s*([−-]\s?60\s?%)\s*(.*)$/);
      if (!m) return;
      h.textContent = '';
      [['bf_ctah-main', m[1]], ['bf_ctah-star', m[2]], ['bf_ctah-date', m[3]]].forEach(function (p) {
        if (!p[1]) return;
        var sp = doc.createElement('span'); sp.className = p[0]; sp.textContent = p[1];
        h.appendChild(sp); h.appendChild(doc.createTextNode(' '));
      });
      h.classList.add('is-split');
    });
  }

  function initTerms() {
    var box = $('[data-bf-terms]'), lead = $('.bf_lead[data-bf-tpl]');
    if (box) highlight(box, $$('.w-richtext p', box), T.termsHighlight);
    // підзаголовок hero: розмитий з першого кадру (CSS), фрази — після підстановки {date} (fillStatic вже відпрацював)
    if (lead) highlight(lead, [lead], T.leadHighlight);
  }

  function initScroll() {
    var done = {}, busy = false;
    addEventListener('scroll', function () {
      if (busy) return; busy = true;
      requestAnimationFrame(function () {
        busy = false;
        var max = root.scrollHeight - innerHeight; if (max <= 0) return;
        var pct = scrollY / max * 100;
        [50, 90].forEach(function (m) { if (pct >= m && !done[m]) { done[m] = true; track('bf_scroll', { percent: m }); } });
      });
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- start */

  function start() {
    syncDeadline();
    fillStatic();
    initTapes();
    initNav();
    initQuiz();
    initCountdown();
    initCtas();
    initVideos();
    initFaq();
    initEmptyBlocks();
    initDeck();
    initTerms();
    initPill();
    initCtaHead();
    initMarquee();
    initTable();
    initRays();
    initRing();
    initReveal();
    initBurst();
    initBalloons();
    initFeat();
    initStack();
    initScroll();
    track('bf_page_view', {});
    window.BF26 = {
      state: S, track: track, leadTemp: leadTemp,
      reset: function () { store.del(K.quiz); store.del(K.attr); location.reload(); }
    };
    log('ready', LOCALE, S);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
