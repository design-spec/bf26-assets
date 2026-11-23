/*!
 * NY26 Новорічна посадкова — логіка сторінки для Webflow (форк bf26.js v1.0.64, класи bf_* і data-bf-* лишились з BF26).
 * Квіз = нативна Webflow-форма в компоненті «NY26 Quiz Card» (hero + блок 7, стан спільний).
 * Потрібно: window.NY26_CONFIG (конфіг у footer), head.html (стан дедлайну, тема, запобіжник часового поясу, клас bf-js).
 * Відмінності від BF26: тема christmas | winter (html[data-ny-theme]), без відліку, картки пакетів з API payment-plans,
 * події ny_*, маркер у goals ny26 | ny26w.
 * Сабміт: перехоплюємо форму (нативний сабміт Webflow блокуємо) і викликаємо обробник allright.com/webflow/index.js
 * (form.onsubmit) — він шле POST /api/v1/users?go-to=true. Відповідь ловимо через обгортку fetch.
 * Без цього файлу форма показує всі кроки і сабмітиться нативно.
 * Дебаг: window.NY26 (state, reset, track), ?ny_debug=1, ?ny_state=ended, ?theme=winter, ?_t2=1 (index.js не відправляє).
 */
(function () {
  'use strict';

  var CFG = window.NY26_CONFIG;
  if (!CFG) { console.warn('[ny26] NY26_CONFIG is missing'); return; }

  // Прапорці нових функцій: false = працює лише не на kid.allright.com (staging), поки не підтверджено
  var LIVE = {};
  var IS_PROD = /(^|\.)kid\.allright\.com$/.test(location.hostname);
  function on(flag) { return LIVE[flag] !== false || !IS_PROD; }

  var doc = document, root = doc.documentElement;
  var params = new URLSearchParams(location.search);
  var DEBUG = !!CFG.debug || params.has('ny_debug');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_market', 'gclid', 'fbclid', 'ttclid'];
  var MULTI = { activities: 'activities_', child_hobby: 'child_hobby_' };
  // крок → поле; тип: radio | multi | contact
  var STEPS = [null,
    { f: 'child_age', t: 'radio' }, { f: 'who_user_is', t: 'radio' }, { f: 'activities', t: 'multi' },
    { f: 'lessons_frequency', t: 'radio' }, { f: 'study_period', t: 'radio' }, { f: 'start_timing', t: 'radio' },
    { f: 'child_hobby', t: 'multi' }, { t: 'contact' }];
  var LAST = STEPS.length - 1;
  var K = { quiz: 'ny26:quiz', attr: 'ny26:attr' };
  // тема сторінки: christmas (різдвяні сторінки) або winter (Ізраїль: he і /ru/self-winter); ставить head до першого кадру
  var THEME = document.documentElement.getAttribute('data-ny-theme') === 'winter' ? 'winter' : 'christmas';
  var QUIZ_VERSION = (CFG.quizVersions || {})[THEME] || CFG.quizVersion;

  /* ---------------------------------------------------------------- helpers */

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function log() { if (DEBUG) console.log.apply(console, ['[ny26]'].concat([].slice.call(arguments))); }
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
    if (Date.now() >= DEADLINE_MS || params.get('ny_state') === 'ended') root.setAttribute('data-bf-state', 'ended');
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
    var payload = merge({ locale: LOCALE, quiz_version: QUIZ_VERSION, theme: THEME }, p || {});
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
  doc.addEventListener('ny26:consent', function (e) { onConsent(!!(e.detail && e.detail.analytics)); });
  // Cookiebot на kid.allright.com: згода або відмова в банері
  addEventListener('CookiebotOnAccept', function () { if (L.eu) onConsent(safeConsent()); });
  addEventListener('CookiebotOnDecline', function () { if (L.eu) onConsent(false); });

  /* ---------------------------------------------------------------- static content */

  function fillStatic() {
    $$('[data-bf-stat]').forEach(function (el) {
      var k = el.getAttribute('data-bf-stat');
      if (k in STATS) el.textContent = String(STATS[k]); else console.warn('[ny26] unknown stat:', k);
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
      S.start_timing && S.start_timing !== 'after_holidays' && S.start_timing !== 'just_looking';
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
    form.setAttribute('data-name', 'ny26-quiz-' + place);
    var w = form.closest('.w-form'); if (w) w.setAttribute('data-name', 'ny26-quiz-' + place);
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

    // екран 8: підпис над полями контактів «Куди надіслати підтвердження уроку?» (ТЗ 3.3)
    var cf = $('[data-step="' + LAST + '"] .bf_field', form);
    if (cf && T.contactTitle && !$('.bf_qcontact-title', form)) {
      var ct = doc.createElement('p'); ct.className = 'bf_qcontact-title'; ct.textContent = T.contactTitle;
      cf.parentNode.insertBefore(ct, cf);
    }
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
    // картка, з якою працює людина: під час перерендеру тримаємо її на тому ж місці екрана
    ['pointerdown', 'focusin', 'keydown'].forEach(function (t) { card.addEventListener(t, function () { activeCard = card; }, true); });
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

  // Квізів на сторінці два (hero і «Зарезервуйте»), кроки синхронні. Коли змінюється висота однієї картки,
  // все під нею зсувається; Safari на iOS не має scroll anchoring, тож нижня картка «стрибала».
  // Після рендеру компенсуємо зсув активної картки (де вже спрацював anchoring — дельта 0, нічого не робимо).
  var activeCard = null;
  function renderAll() {
    var ac = activeCard && doc.contains(activeCard) ? activeCard : null, t0 = ac ? ac.getBoundingClientRect().top : 0;
    cards.forEach(renderCard);
    if (ac) { var d = ac.getBoundingClientRect().top - t0; if (Math.abs(d) > 1) window.scrollBy(0, d); }
    $$('[data-bf-cta-label]').forEach(function (el) {
      if (!el.hasAttribute('data-label')) el.setAttribute('data-label', el.textContent);
      el.textContent = S.lead_id ? T.ctaDone : el.getAttribute('data-label');
    });
  }

  function focusStep(card) {
    var lg = S.lead_id ? $('[data-bf-done] .bf_qtitle:not([hidden])', card) : $('[data-step].is-active legend', card);
    if (lg) try { lg.focus({ preventScroll: true }); } catch (e) {}
    // верх картки сховався під фіксовану смугу — прокручуємо рівно під неї, без smooth (щоб не «їздило»)
    var bar = $('.bf_bar'), off = (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0) + 12, top = card.getBoundingClientRect().top;
    if (top < off) window.scrollBy(0, top - off);
  }

  function go(step, card) {
    var place = placeOf(card);
    S.step = step; save();
    ui.errors = {}; ui.sendErr = '';
    renderAll();
    if (step >= 2) track('ny_quiz_step_view', { step: step, place: place });
    if (step === LAST) track('ny_quiz_result_view', { lead_temp: leadTemp(), place: place });
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
        track('ny_quiz_start', { child_age: S.child_age, place: place });
      }
      track('ny_quiz_answer', { step: n, value: t.value, place: place });
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
    if (st.t === 'multi') track('ny_quiz_answer', { step: n, value: S[st.f].join(','), place: place });   // GA4 не приймає масиви
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
    setHidden(form, 'quiz_version', QUIZ_VERSION);
    setHidden(form, 'lead_temp', leadTemp());
    setHidden(form, 'goals', goalsText());
  }

  // index.js не пропускає activities/study_period/start_timing/consent_marketing/quiz_version/lead_temp,
  // тому за запасним планом ТЗ (розділ 5) склеюємо їх у goals; маркер ny26 (зимова — ny26w) — для пошуку лідів у CRM
  function goalsText() {
    var parts = [(CFG.goalsMarker || {})[THEME] || QUIZ_VERSION,
      'гуртки: ' + (S.activities.join(', ') || '—'),
      'частота: ' + (S.lessons_frequency || '—'),
      'період: ' + (S.study_period || '—'),
      'старт: ' + (S.start_timing || '—'),
      'інтереси: ' + (S.child_hobby.join(', ') || '—'),
      'lead_temp: ' + leadTemp()];
    if (L.eu) parts.push('згода на розсилку: ' + (S.consent_marketing ? 'yes' : 'no'));
    return parts.join('; ');
  }

  /* ---- копія заявки у Webflow Forms (нативний сабміт заблоковано, тому шлемо самі після успіху CRM) ---- */
  // Знімок усіх полів форми в момент сабміту (телефон уже в E.164, hidden заповнені) — формат як у webflow.js
  function wfSnapshot(form) {
    var fields = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      var t = (el.type || '').toLowerCase(), n = el.getAttribute('data-name') || el.name;
      if (!n || el.disabled || /^(submit|button|file|reset)$/.test(t) || el.tagName === 'FIELDSET' || el.tagName === 'BUTTON') return;
      if (t === 'checkbox') { if (el.checked) fields[n] = el.value && el.value !== 'on' ? el.value : 'true'; return; }
      if (t === 'radio') { if (el.checked) fields[n] = el.value; else if (!(n in fields)) fields[n] = ''; return; }
      fields[n] = String(el.value == null ? '' : el.value).trim();
    });
    return {
      form: form,
      name: form.getAttribute('data-name') || form.getAttribute('name') || 'ny26-quiz',
      pageId: form.getAttribute('data-wf-page-id') || doc.documentElement.getAttribute('data-wf-page') || '',
      elementId: form.getAttribute('data-wf-element-id') || '',
      fields: fields
    };
  }

  // Токен Cloudflare Turnstile (захист форм Webflow): без нього API відповідає 422. Беремо свіжий у момент відправки.
  function wfToken(form) {
    var i = form && form.querySelector('[name="cf-turnstile-response"]');
    if (i && i.value) return i.value;
    try { var d = window.jQuery && window.jQuery.data(form, '.w-form'); if (d && d.turnstileToken) return d.turnstileToken; } catch (e) {}
    return '';
  }

  function wfCopy(snap, extra, tries) {
    try {
      var site = doc.documentElement.getAttribute('data-wf-site');
      if (!snap || !site || CFG.webflowCopy === false || (params.has('_t2') && !params.has('ny_wfcopy'))) return;
      var needToken = !!doc.querySelector('[data-turnstile-sitekey]'), token = wfToken(snap.form);
      tries = tries || 0;
      if (needToken && !token && tries < 16) return setTimeout(function () { wfCopy(snap, extra, tries + 1); }, 500);
      if (needToken) snap.fields['cf-turnstile-response'] = token;
      Object.keys(extra || {}).forEach(function (k) { snap.fields[k] = extra[k] == null ? '' : String(extra[k]); });
      var body = new URLSearchParams();
      body.append('name', snap.name);
      body.append('pageId', snap.pageId);
      body.append('elementId', snap.elementId);
      body.append('domain', doc.documentElement.getAttribute('data-wf-domain') || location.hostname);
      body.append('source', location.href);
      body.append('test', 'false');
      body.append('dolphin', 'false');
      Object.keys(snap.fields).forEach(function (k) { body.append('fields[' + k + ']', snap.fields[k]); });
      fetch('https://webflow.com/api/v1/form/' + site, { method: 'POST', body: body, keepalive: true, credentials: 'omit' })
        .then(function (r) { if (!r.ok) console.warn('[ny26] webflow copy', r.status, token ? 'token' : 'no token'); })
        .catch(function (err) { console.warn('[ny26] webflow copy', err); });
    } catch (err) { console.warn('[ny26] webflow copy', err); }
  }

  var pending = null;   // { card, place, timer, wf }

  function onSubmit(e) {
    var form = e.currentTarget, card = cardOf(form), place = placeOf(card);
    // нативний сабміт Webflow не потрібен: заявку відправляє index.js
    e.preventDefault(); e.stopImmediatePropagation();
    if (S.step !== LAST || ui.sending || S.lead_id) return;
    var digits = validateContact(card);
    if (!digits) return;

    track('ny_quiz_contact_submit', { lead_temp: leadTemp(), place: place });
    if (!S.event_id) S.event_id = uuid();
    save();
    fillHidden(form);
    var handler = form.onsubmit;                      // обробник index.js (перепризначається його MutationObserver)
    ui.sending = true; ui.sendErr = ''; renderAll();
    // номер у форматі +380… ставимо ПІСЛЯ renderAll: renderCard повертає в поле введений вигляд, і index.js узяв би номер без коду
    var tel = field(form, 'phone'), shown = tel ? tel.value : '';
    if (tel) tel.value = phoneE164(digits);
    var wf = null; try { wf = wfSnapshot(form); } catch (err) {}
    pending = { card: card, place: place, wf: wf, timer: setTimeout(function () { onFail(); }, CFG.submitTimeoutMs || 15000) };
    try {
      if (typeof handler !== 'function') throw new Error('index.js handler missing');
      handler.call(form, { preventDefault: function () {}, target: form, currentTarget: form, type: 'submit' });
    } catch (err) {
      console.error('[ny26] submit', err);
      onFail();
    }
    if (tel) setTimeout(function () { tel.value = shown; }, 0);   // FormData вже прочитано синхронно
    if (params.has('_t2')) {                         // index.js у режимі _t2 лише пише payload у консоль — емулюємо успіх для QA
      setTimeout(function () { onLead({ user_id: 'test-' + S.event_id, 'go-to': null }); }, 600);
    }
  }

  // відповідь POST /api/v1/users (go-to — посилання на вибір часу пробного уроку)
  (function () {
    if (!window.fetch || window.__ny26FetchHooked) return;
    window.__ny26FetchHooked = true;
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
    var place = pending.place, wf = pending.wf; pending = null;
    ui.sending = false;
    S.lead_id = b.user_id || S.event_id;
    S.booking_url = b['go-to'] || b.go_to || null;
    wfCopy(wf, { quiz_place: place, lang: doc.documentElement.lang || '', crm_user_id: b.user_id || '', event_id: S.event_id || '' });
    S.fails = 0; save();
    track('ny_lead_created', { lead_temp: leadTemp(), place: place });
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
    track('ny_booking_click', { place: place, transport_type: 'beacon' });
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

  function initCtas(rootEl) {
    $$('[data-bf-cta]', rootEl).forEach(function (el) {
      if (el._nyCta) return; el._nyCta = true;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();   // інакше webflow.js ще й прокручує до #bf-quiz (уся hero-секція) — картка опинялась унизу екрана
        var place = el.getAttribute('data-bf-cta');
        if (S.lead_id && S.booking_url) { goBooking(place); return; }
        track('ny_cta_click', { place: place });
        var card = $('[data-bf-quiz="hero"] [data-bf-card]') || cards[0];
        if (!card) return;
        // верх картки — одразу під фіксованою смугою (на мобільному форма у верхній половині екрана)
        var bar = $('.bf_bar'), off = (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0) + 16;
        window.scrollTo({ top: Math.max(0, scrollY + card.getBoundingClientRect().top - off), behavior: reduceMotion ? 'auto' : 'smooth' });
        setTimeout(function () { focusStep(card); }, reduceMotion ? 0 : 700);
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
        track('ny_video_play', { id: id });
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
          track('ny_faq_open', { q: item.getAttribute('data-bf-faq-item') || q.textContent.trim() });
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
    if (!$('.bf_hero') || window.NY26_BLOOM === false) return;
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
        track('ny_nav_click', { section: n[0] }); close();
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
      a.addEventListener('click', function (e) { if (!on) return e.preventDefault(); track('ny_lang_click', { to: l[0] }); });
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

  // фон hero «поле з кільцем» (Canvas 2D): окремий файл; вимкнути — window.NY26_RING = false
  function initRing() {
    if (!$('.bf_hero') || window.NY26_RING === false) return;
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

  // святкові кульки при відкритті сторінки: окремий файл, без «зменшення руху»; вимкнути — window.NY26_BALLOONS = false
  function initBalloons() {
    if (reduceMotion || window.NY26_BALLOONS === false) return;
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


  // Картки пакетів (ТЗ v1.1, розділ 5.1): той самий запит, що робить сторінка цін allright.com, без currency і country_code —
  // ринок і валюта за IP відвідувача. На картці — ціна за урок без знижки і розмір знижки саме цього пакета (лише коли
  // first-payment-bonus.amount > 0). «До −40%» у заголовках — статика. API не відповів за 3 с — лишається перелік цінності.
  // CORS API дозволяє лише https://kid.allright.com: на staging *.webflow.io блок порожній; ?ny_plans=sample — знімок для QA.
  var PLANS_API = 'https://allright.com/api/v1/payment-plans';
  var PLANS_SAMPLE = { data: [   // UA, 23.11.2026 (ще Black Friday): для перевірки верстки на staging
    { attributes: { 'is-show': true, 'period-amount': 1, qty: 8, 'is-popular': null, 'price-curr-parts': { priceFormatted: '574,38\u00a0₴', wholeNumber: '574', fractionalPart: ',38', priceWithDecimal: 574.38, currencySymbol: '₴', currency: 'UAH' }, 'first-payment-bonus': { amount: 0 } } },
    { attributes: { 'is-show': true, 'period-amount': 6, qty: 48, 'is-popular': false, 'price-curr-parts': { priceFormatted: '337,87\u00a0₴', wholeNumber: '337', fractionalPart: ',87', priceWithDecimal: 337.87, currencySymbol: '₴', currency: 'UAH' }, 'first-payment-bonus': { amount: 0 } } },
    { attributes: { 'is-show': true, 'period-amount': 12, qty: 96, 'is-popular': false, 'price-curr-parts': { priceFormatted: '287,19\u00a0₴', wholeNumber: '287', fractionalPart: ',19', priceWithDecimal: 287.19, currencySymbol: '₴', currency: 'UAH' }, 'first-payment-bonus': { amount: 0 } } },
    { attributes: { 'is-show': true, 'period-amount': 18, qty: 144, 'is-popular': false, 'price-curr-parts': { priceFormatted: '229,75\u00a0₴', wholeNumber: '229', fractionalPart: ',75', priceWithDecimal: 229.75, currencySymbol: '₴', currency: 'UAH' },
      'old-price-curr-parts': { priceFormatted: '270,29\u00a0₴', wholeNumber: '270', fractionalPart: ',29', priceWithDecimal: 270.29, currencySymbol: '₴', currency: 'UAH' }, 'first-payment-bonus': { amount: 14.998, is_real_discount: true, banner_title: 'Чорна пʼятниця' } } }
  ] };
  function plural(forms, n) {
    if (!forms) return String(n);
    if (typeof forms === 'string') return tpl(forms, { n: n });
    var k = 'other'; try { k = new Intl.PluralRules(T.htmlLang || LOCALE).select(n); } catch (e) {}
    return tpl(forms[k] || forms.other || forms.many || '', { n: n });
  }
  function initPlans() {
    var box = $('[data-ny-plans]');
    if (!box) return;
    box.classList.add('ny_plans');
    var sample = params.get('ny_plans') === 'sample', done = false, perWeek = CFG.plansPerWeek || 2;
    function render(json, source) {
      if (done) return; done = true;
      var rows = ((json && json.data) || []).map(function (p) { return p.attributes || {}; }).filter(function (a) {
        return a['is-show'] !== false && a['price-curr-parts'];
      }).sort(function (a, b) { return (+a['period-amount'] || 0) - (+b['period-amount'] || 0); });
      if (!rows.length) { track('ny_prices_loaded', { plans: 0, source: source }); return; }
      var maxAmount = 0, currency = '', bonusTitle = '';
      // «Краща ціна» — пакет з найнижчою ціною за урок (без знижки), як бейдж на allright.com
      var unit = function (a) { var fb = a['first-payment-bonus'] || {}, b = (+fb.amount > 0 && a['old-price-curr-parts']) || a['price-curr-parts'];
        return +b.priceWithDecimal || parseFloat(String(b.priceFormatted || '').replace(/[^\d,.]/g, '').replace(',', '.')) || Infinity; };
      var best = rows.reduce(function (m, a) { return unit(a) < unit(m) ? a : m; }, rows[0]);
      box.innerHTML = '';
      rows.forEach(function (a) {
        var fb = a['first-payment-bonus'] || {}, amount = +fb.amount || 0;
        // ціна без знижки: при реальній знижці API віддає стару ціну в old-price-curr-parts
        var base = amount > 0 && a['old-price-curr-parts'] ? a['old-price-curr-parts'] : a['price-curr-parts'];
        currency = currency || base.currency || ''; bonusTitle = bonusTitle || fb.banner_title || '';
        maxAmount = Math.max(maxAmount, amount);
        var n = +a['period-amount'] || 1, qty = +a.qty || 0, isBest = a === best && rows.length > 1;
        var whole = base.wholeNumber || String(base.priceFormatted || base.priceWithDecimal || '').replace(/[,.]\d+.*$/, '').replace(/[^\d\s\u00a0]/g, '').trim();
        var sym = base.currencySymbol || String(base.priceFormatted || '').replace(/[\d\s\u00a0,.]/g, '') || base.currency || '';
        var card = doc.createElement('div');
        card.className = 'ny_plan' + (isBest ? ' is-best' : '') + (amount > 0 ? ' has-discount' : '');
        card.setAttribute('role', 'listitem');
        card.style.order = String(n); card.style.setProperty('--o', String(n));
        var feats = ((T.planFeatures || {})[n] || (T.planFeatures || {}).other || []);
        card.innerHTML = (isBest ? '<span class="ny_plan-badge"></span>' : '') +
          '<div class="ny_plan-top"><div class="ny_plan-title"></div><div class="ny_plan-sub"></div>' +
          '<div class="ny_plan-price"><span class="ny_plan-num"></span><span class="ny_plan-cur"><span class="ny_plan-sym"></span><span class="ny_plan-per"></span></span></div>' +
          (amount > 0 ? '<div class="ny_plan-disc" data-bf-show="before"></div>' : '') + '</div>' +
          '<ul class="ny_plan-feats"></ul>' +
          '<a href="#bf-quiz" class="ny_plan-cta" data-bf-cta="plans"><span></span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';
        if (isBest) $('.ny_plan-badge', card).textContent = T.planBest || '';
        $('.ny_plan-title', card).textContent = n === 1 ? (T.planTitleMonth || plural(T.planPeriod, n)) : tpl(T.planTitle || '{period}', { period: plural(T.planPeriodGen || T.planPeriod, n) });
        var span = n === 1 ? (T.planSpanMonth || '') : n === 12 && T.planSpanYear ? T.planSpanYear : plural(T.planPeriodGen || T.planPeriod, n);
        $('.ny_plan-sub', card).textContent = tpl(T.planSub || '{lessons}', { lessons: plural(T.planLessons, qty), span: span, perWeek: perWeek });
        $('.ny_plan-num', card).textContent = whole;
        $('.ny_plan-sym', card).textContent = sym;
        $('.ny_plan-per', card).textContent = T.planPerLesson || '';
        // ціле число без завищення: 14.998 → 15, 16.19 → 16
        if (amount > 0) $('.ny_plan-disc', card).textContent = tpl(T.planDiscount || '−{n}%', { n: Math.floor(amount + 0.01) });
        var ul = $('.ny_plan-feats', card);
        feats.forEach(function (f) { var li = doc.createElement('li'); li.textContent = tpl(f, { n: n }); ul.appendChild(li); });
        if (!feats.length) ul.remove();
        $('.ny_plan-cta span', card).textContent = T.planCta || '';
        box.appendChild(card);
      });
      initCtas(box);
      box.setAttribute('role', 'list');
      var wrap = box.closest('[data-ny-plans-wrap]') || box; wrap.classList.add('is-loaded');
      track('ny_prices_loaded', { plans: rows.length, currency: currency, bonus_title: bonusTitle, max_amount: Math.round(maxAmount * 100) / 100, source: source });
    }
    if (sample) return render(PLANS_SAMPLE, 'sample');
    if (!window.fetch) return;
    setTimeout(function () { if (!done) { done = true; track('ny_prices_loaded', { plans: 0, source: 'timeout' }); } }, CFG.plansTimeoutMs || 3000);
    var q = { locale: CFG.plansLocale || LOCALE, tutor_type_alias: 'standard', qty_per_week: perWeek };
    if (params.get('cc')) q.country_code = params.get('cc').toUpperCase();
    fetch(PLANS_API + '?' + Object.keys(q).map(function (k) { return 'filter%5B' + k + '%5D=' + encodeURIComponent(q[k]); }).join('&'), { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) { render(j, 'api'); })
      .catch(function (e) {
        // staging (*.webflow.io): API дозволяє CORS лише для kid.allright.com — показуємо знімок цін з позначкою «зразок», щоб блок можна було перевірити.
        // На проді правило ТЗ без змін: API не відповів — лише перелік цінності
        if (!done && !IS_PROD) { box.setAttribute('data-ny-sample', T.planSampleNote || 'Зразок цін для перевірки на staging'); return render(PLANS_SAMPLE, 'sample-staging'); }
        if (!done) { done = true; track('ny_prices_loaded', { plans: 0, source: 'error', reason: String(e && e.message || e).slice(0, 60) }); }
      });
  }

  // квіз як подарункова коробка: бант угорі картки (лише різдвяна тема; зимова — нейтральна коробка без банта)
  function initBow() {
    if (THEME !== 'christmas') return;
    $$('[data-bf-quiz] .bf_quiz').forEach(function (q) {
      if ($('.bf_quiz-bow', q)) return;
      var b = doc.createElement('span'); b.className = 'bf_quiz-bow'; b.setAttribute('aria-hidden', 'true'); q.appendChild(b);
    });
  }

  // Чарлі в зимовому светрі визирає з-за верхнього краю картки квізу (лапи лежать на картці). Файл — поруч з ny26.js на CDN (img/),
  // WebP 360/520 px; вимкнути — window.NY26_CHARLIE = false
  function initCharlie() {
    if (window.NY26_CHARLIE === false) return;
    var me = $('script[src*="ny26.js"]'), base = me ? me.src.replace(/ny26\.js.*$/, '') : '';
    if (!base) return;
    $$('[data-bf-quiz] .bf_quiz').forEach(function (q) {
      if ($('.ny_charlie', q)) return;
      var img = doc.createElement('img');
      img.className = 'ny_charlie'; img.alt = ''; img.setAttribute('aria-hidden', 'true'); img.decoding = 'async';
      img.width = 260; img.height = 260;
      img.src = base + 'img/ny26-charlie-520.webp';
      img.srcset = base + 'img/ny26-charlie-360.webp 360w, ' + base + 'img/ny26-charlie-520.webp 520w';
      img.sizes = '(max-width: 767px) 170px, 260px';
      if (placeOf(q) !== 'hero') img.loading = 'lazy';
      q.appendChild(img); q.classList.add('has-charlie');
      // hero: підзаголовок (Webflow-елементи .bf_lead до/після дедлайну) переїжджає в «спіч» Чарлі над карткою
      if (placeOf(q) === 'hero' && !$('.ny_speech', q)) {
        var leads = $$('.bf_hero .bf_hero-text .bf_lead');
        if (leads.length) {
          var sp = doc.createElement('div'); sp.className = 'ny_speech';
          leads.forEach(function (l) { sp.appendChild(l); });
          q.appendChild(sp); q.classList.add('has-speech');
          // спіч з'являється через 2 с від початку завантаження сторінки (не від запуску скрипта)
          var wait = Math.max(0, (CFG.speechDelayMs || 2000) - (window.performance && performance.now ? performance.now() : 0));
          setTimeout(function () { sp.classList.add('is-in'); }, wait);
        }
      }
      var slot = q.closest('[data-bf-quiz]'); if (slot) slot.classList.add('has-charlie');
    });
  }

  // Відгуки як на /uk/back (RT26): заголовок по центру; контейнер — синя плашка рейтингу (Facebook, Otzyvua) + стрічка карток (Embla Carousel 8.5.2,
  // перетягування з інерцією, свайп на тачпаді). Картки — ті самі CMS-записи BF26 Reviews (.bf_tr-wall), JS лише переставляє їх. Світла тема — у CSS
  var NY_FB_ICO = '<svg viewBox="0 0 41 41" width="40" height="40" aria-hidden="true"><path d="M17.34 39.24C8.39 37.66 1.55 29.87 1.55 20.5 1.55 10.08 10.08 1.55 20.5 1.55s18.95 8.53 18.95 18.95c0 9.37-6.84 17.16-15.79 18.74l-1.05-.84h-4.21z" fill="#fff"/><path d="M27.87 25.76l.84-5.26h-5.05v-3.68c0-1.48.52-2.64 2.84-2.64h2.42V9.34c-1.37-.21-2.84-.42-4.21-.42-4.32 0-7.37 2.63-7.37 7.37v4.21h-4.73v5.26h4.73v13.37c1.05.21 2.11.32 3.16.32s2.1-.11 3.16-.32V25.76z" fill="#027de5"/></svg>';
  function initReviews() {
    var sec = $('[data-bf-block="reviews-text"]'); if (!sec || $('.ny_rv', sec)) return;
    var list = $('.bf_tr-wall .w-dyn-list', sec), track = list && $('.bf_ttrack', list);
    if (!track || !$('.w-dyn-item', track)) return;
    var layout = $('.bf_tr-layout', sec), h2 = $('.bf_tr-intro .bf_h2', sec);
    var head = doc.createElement('div'); head.className = 'ny_rv-head';
    if (h2) head.appendChild(h2);
    var box = doc.createElement('div'); box.className = 'ny_rv';
    var R = T.rating || [{ icon: 'facebook', value: STATS.fbRating, label: 'Facebook' }, { icon: 'otzyvua', value: STATS.otzyvRating, label: 'otzyvua.net' }];
    R = R.filter(function (r) { return r && r.value; });
    if (R.length) {
      var b = doc.createElement('div'); b.className = 'ny_rv-badge';
      R.forEach(function (r) {
        var st = doc.createElement('div'); st.className = 'ny_rv-stat';
        var ico = r.icon === 'facebook' ? NY_FB_ICO : r.icon === 'otzyvua' ? '<img src="' + (CFG.otzyvuaIcon || 'https://cdn.jsdelivr.net/gh/design-spec/bf26-assets@rt26-v1.8.4/rt26/img/otzyvua.png') + '" width="58" height="40" alt="" loading="lazy">' : '';
        st.innerHTML = '<div class="ny_rv-num">' + ico + '<span></span></div><span class="ny_rv-src"></span>';
        $('.ny_rv-num span', st).textContent = r.value; $('.ny_rv-src', st).textContent = r.label;
        b.appendChild(st);
      });
      box.appendChild(b);
    }
    var rail = doc.createElement('div'); rail.className = 'ny_rv-rail';
    rail.appendChild(list); box.appendChild(rail);
    (layout || sec.firstElementChild).parentNode.insertBefore(head, layout);
    head.parentNode.insertBefore(box, layout);
    sec.classList.add('ny-rv-ready');
    $$('.bf_tcard-name', track).forEach(function (n) {
      if ($('.ny_stars', n.parentNode)) return;
      var st = doc.createElement('div'); st.className = 'ny_stars'; st.setAttribute('aria-label', '5/5'); st.textContent = '★★★★★';
      n.parentNode.insertBefore(st, n.nextSibling);
    });
    function init() {
      if (!window.EmblaCarousel || box.classList.contains('is-embla')) return;
      box.classList.add('is-embla');
      var plugins = window.EmblaCarouselWheelGestures ? [window.EmblaCarouselWheelGestures()] : [];
      try { window.EmblaCarousel(list, { align: 'start', containScroll: 'trimSnaps', dragFree: false, duration: 30, direction: root.dir === 'rtl' ? 'rtl' : 'ltr' }, plugins); }
      catch (e) { box.classList.remove('is-embla'); }
    }
    function load(src, cb) { var sc = doc.createElement('script'); sc.src = src; sc.async = true; sc.onload = sc.onerror = cb; doc.head.appendChild(sc); }
    var start = function () {
      load('https://cdn.jsdelivr.net/npm/embla-carousel@8.5.2/embla-carousel.umd.js', function () {
        load('https://cdn.jsdelivr.net/npm/embla-carousel-wheel-gestures@8.0.2/dist/embla-carousel-wheel-gestures.umd.js', init);
      });
    };
    // бібліотеку вантажимо, коли відгуки за 800 px від екрана (не гальмує перший екран)
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '800px 0px' });
      io.observe(box);
    } else start();
  }


  // Сніг у hero (за мотивами codepen Anna_Batura «Snow | Svg animate», середня картка): фіолетові сніжинки з білим сяйвом пливуть
  // хвилястими траєкторіями і мерехтять (SVG SMIL, без canvas). ТЗ 3.1/10: лише десктоп ≥992 px, без reduced-motion; поза екраном — пауза.
  // Одне SVG на весь hero: плитки 202×202 (≈380 px), сніжинки рухаються вздовж 8 спільних шляхів у зсунутих групах. Вимкнути — window.NY26_SNOW = false
  var SNOW_PATHS = ["M20.5 1L15.2519 8.24732C12.1426 12.5412 12.2536 18.3752 15.5239 22.5477L18.9254 26.8875C21.8053 30.5619 20.5929 35.9536 16.4172 38.0414V38.0414C11.7027 40.3986 10.9078 46.7956 14.902 50.235L16.7227 51.8029C20.8398 55.3482 20.8898 61.709 16.829 65.3187L15.0066 66.9386C10.5287 70.919 10.6409 77.9507 15.2435 81.7862L16.9464 83.2053C20.8422 86.4518 20.7695 92.4587 16.7962 95.6099V95.6099C13.1358 98.513 12.7342 103.923 15.9258 107.334L17.8439 109.385C21.6055 113.406 21.6548 119.64 17.9573 123.72L16.7501 125.052C12.8059 129.404 12.4129 135.911 15.8046 140.707L19.0231 145.257C22.2119 149.765 21.7931 155.894 18.0207 159.926V159.926C13.6026 164.649 13.883 172.068 18.645 176.444L20.5313 178.177C25.2365 182.501 26.4673 189.438 23.5365 195.117L20.5 201", "M37.5 1L42.8215 6.53434C46.3688 10.2236 45.2924 16.2991 40.6936 18.545L39.6461 19.0565C34.7857 21.4302 34.4242 28.2199 39.0051 31.0962L40.7006 32.1608C44.6603 34.6472 44.2329 40.5483 39.9562 42.438V42.438C35.4213 44.4418 35.2944 50.8306 39.7462 53.0128L41.174 53.7127C46.2161 56.1844 46.0072 63.4452 40.8504 65.6679V65.6679C35.288 68.0655 35.5724 76.076 41.3103 78.0167L44.4754 79.0873C50.556 81.1439 51.7692 89.2129 46.5623 92.9667L44.2062 94.6653C40.3726 97.429 39.191 102.611 41.4477 106.764L43.7892 111.072C47.3506 117.625 45.54 125.8 39.5448 130.237L34.0495 134.303C29.1484 137.93 28.3296 144.943 32.2634 149.601L38.8066 157.35C41.1207 160.09 39.6111 164.308 36.0836 164.958V164.958C31.9916 165.712 30.8524 171.036 34.2777 173.398L43.8174 179.978C48.9515 183.518 49.3238 190.968 44.5683 195.003L37.5 201", "M59.5 1L54.6281 15.6158C53.2213 19.836 55.768 24.3478 60.108 25.3243V25.3243C65.5653 26.5522 67.8163 33.0989 64.2681 37.4233L63.8947 37.8784C60.2266 42.3488 62.4643 49.1161 68.0744 50.5186L68.5016 50.6254C74.9612 52.2403 76.8691 60.4964 71.773 64.7818L70.7684 65.6265C66.3373 69.3527 66.6327 76.264 71.3656 79.5985L72.0355 80.0704C77.6479 84.0247 77.3103 92.453 71.3996 95.9457L62.0283 101.483C54.5164 105.922 56.6243 117.318 65.227 118.776L66.9594 119.069C75.8732 120.58 77.0949 132.889 68.652 136.123L65.6388 137.277C60.0308 139.424 59.2924 147.058 64.3849 150.241L67.4723 152.17C71.9609 154.976 70.6977 161.827 65.5038 162.847V162.847C60.4476 163.841 59.0647 170.42 63.2931 173.365L71.609 179.156C76.2311 182.375 77.3419 188.745 74.0821 193.339L69 200.5", "M91.5 1L88.896 3.60402C85.2599 7.24011 87.3754 13.4673 92.474 14.1359V14.1359C98.339 14.9051 99.7859 22.7337 94.6731 25.7084V25.7084C90.0718 28.3855 90.5987 35.2632 95.6016 37.0824L98.0858 37.9857C103.563 39.9773 104.787 47.1745 100.276 50.8648L98.6577 52.1892C92.7509 57.022 95.5649 66.5848 103.137 67.5398V67.5398C112.122 68.6731 113.65 81.1221 105.148 84.2431L98.0316 86.8555C90.3798 89.6644 92.3947 101 100.546 101V101C108.475 101 110.712 111.868 103.426 114.999L93.1524 119.414C85.8833 122.538 85.3045 132.621 92.1682 136.556L95.5604 138.501C103.292 142.934 103.303 154.083 95.5786 158.53L94.3876 159.216C87.3858 163.248 86.506 173.005 92.6737 178.224V178.224C96.7007 181.631 97.9386 187.318 95.6925 192.091L91.5 201", "M119.5 1L122.46 2.55053C129.968 6.48331 129.844 17.273 122.248 21.0321L117.061 23.5985C109.475 27.3528 111.315 38.658 119.701 39.812L127.763 40.9215C133.568 41.7204 134.912 49.5088 129.709 52.2064V52.2064C125.401 54.4402 125.382 60.5959 129.676 62.856L135.641 65.9955C143.355 70.0552 142.02 81.4839 133.578 83.6563L121.628 86.7319C111.891 89.2376 111.256 102.825 120.717 106.227L127.208 108.562C133.865 110.956 133.972 120.332 127.371 122.878V122.878C121.221 125.25 120.761 133.775 126.62 136.796L131.188 139.152C136.882 142.087 137.543 149.968 132.418 153.811L126.85 157.987C123.701 160.349 124.445 165.266 128.153 166.59V166.59C132.444 168.123 132.548 174.153 128.312 175.833L119.613 179.283C115.173 181.043 113.068 186.127 114.964 190.511L119.5 201", "M154.5 1L147.419 16.8475C145.5 21.1417 147.269 26.187 151.448 28.3442V28.3442C155.867 30.6247 157.546 36.092 155.171 40.4601L148.691 52.3751C146.118 57.1051 147.944 63.0253 152.734 65.4849V65.4849C157.901 68.1381 159.54 74.7396 156.216 79.5021L149.86 88.6057C146.976 92.7377 148.983 98.4813 153.813 99.9174V99.9174C158.298 101.251 160.43 106.364 158.22 110.489L152.177 121.77C149.33 127.084 149.863 133.572 153.538 138.35L156.64 142.382C159.915 146.64 159.25 152.723 155.133 156.172L152.609 158.287C148.452 161.77 149.147 168.382 153.879 171.032V171.032C159.658 174.269 158.992 182.89 152.718 185.015V185.015C146.707 187.051 145.649 195.1 150.93 198.62L154.5 201", "M167.5 1L171.772 7.02022C175.936 12.8866 176.654 20.528 173.657 27.0673L170.632 33.6673C168.768 37.7339 169.758 42.5396 173.078 45.538L175.698 47.905C179.38 51.2305 178.901 57.1444 174.732 59.834V59.834C170.902 62.305 170.124 67.5834 173.078 71.0545L178.608 77.5516C182.111 81.6683 179.186 88 173.78 88V88C168.208 88 165.346 94.6718 169.187 98.7089L172.068 101.738C175.468 105.313 174.928 111.067 170.922 113.947L170.156 114.497C165.993 117.489 165.187 123.359 168.39 127.362L171.718 131.522C175.71 136.513 175.821 143.573 171.986 148.685L167.311 154.918C162.933 160.757 164.763 169.122 171.18 172.597V172.597C177.471 176.005 179.379 184.14 175.258 189.989L167.5 201", "M185.5 1L182.564 23.3857C181.893 28.5015 183.638 33.6384 187.287 37.2868V37.2868C192.219 42.2189 193.543 49.7074 190.602 56.0317L189.142 59.1697C186.804 64.1957 186.493 69.9291 188.272 75.1787L192.464 87.5451C194.376 93.1833 193.525 99.392 190.168 104.308L186.144 110.2C183.437 114.163 183.877 119.48 187.197 122.945V122.945C190.565 126.459 190.963 131.87 188.146 135.839L178.292 149.725C174.486 155.088 176.44 162.586 182.38 165.41L186.855 167.537C192.889 170.406 193.058 178.932 187.142 182.038V182.038C183.831 183.776 182.139 187.554 183.046 191.182L185.5 201"];
  function initSnow() {
    var hero = $('.bf_hero');
    if (!hero || window.NY26_SNOW === false || reduceMotion || THEME !== 'christmas') return;
    var mq = window.matchMedia ? matchMedia('(min-width: 992px)') : { matches: true };
    var svg = null, NS = 'http://www.w3.org/2000/svg', XL = 'http://www.w3.org/1999/xlink';
    function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function el(n, at) { var e = doc.createElementNS(NS, n); for (var k in at) e.setAttribute(k, at[k]); return e; }
    function build() {
      if (svg) { svg.remove(); svg = null; }
      if (!mq.matches) return;
      var w = hero.clientWidth, h = hero.clientHeight, T = 380, cols = Math.max(1, Math.round(w / T)), rows = Math.max(1, Math.round(h / T));
      svg = el('svg', { 'class': 'ny_snow', viewBox: '0 0 ' + 202 * cols + ' ' + 202 * rows, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
      var defs = el('defs', {});
      var g = el('radialGradient', { id: 'ny-snow-g', cx: '50%', cy: '50%', fx: '50%', fy: '50%', r: '72.4736449%' });
      g.appendChild(el('stop', { offset: '0%', 'stop-color': '#8A7FCD' })); g.appendChild(el('stop', { offset: '100%', 'stop-color': '#59338D' }));
      var f = el('filter', { id: 'ny-snow-f', filterUnits: 'objectBoundingBox', x: '-81.2%', y: '-68.8%', width: '262.5%', height: '262.5%' });
      f.appendChild(el('feOffset', { dx: '0', dy: '1', 'in': 'SourceAlpha', result: 'o' }));
      f.appendChild(el('feGaussianBlur', { 'in': 'o', result: 'b', stdDeviation: '2' }));
      f.appendChild(el('feColorMatrix', { 'in': 'b', type: 'matrix', values: '0 0 0 0 1   0 0 0 0 1   0 0 0 0 1  0 0 0 0.5 0' }));
      defs.appendChild(g); defs.appendChild(f);
      SNOW_PATHS.forEach(function (d, i) { defs.appendChild(el('path', { id: 'ny-snow-l' + (i + 1), d: d })); });
      svg.appendChild(defs);
      var per = CFG.snowPerTile || 14;
      for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cols; cx++) {
        var tile = el('g', { transform: 'translate(' + 202 * cx + ' ' + 202 * cy + ')' });
        for (var k = 0; k < per; k++) {
          var c = el('circle', { fill: 'url(#ny-snow-g)', filter: 'url(#ny-snow-f)', r: String(rnd(1, 3)) });
          c.appendChild(el('animate', { attributeName: 'opacity', begin: '0.1s', dur: rnd(1, 6) + 's', repeatCount: 'indefinite', values: '0;1;0' }));
          var dur = rnd(10, 22), m = el('animateMotion', { dur: dur + 's', begin: '-' + rnd(0, dur) + 's', repeatCount: 'indefinite' });
          var mp = el('mpath', {}); mp.setAttributeNS(XL, 'xlink:href', '#ny-snow-l' + rnd(1, 8)); mp.setAttribute('href', mp.getAttributeNS(XL, 'href'));
          m.appendChild(mp); c.appendChild(m); tile.appendChild(c);
        }
        svg.appendChild(tile);
      }
      hero.insertBefore(svg, hero.firstChild);
      if (window.IntersectionObserver) {
        new IntersectionObserver(function (en) { if (!svg || !svg.pauseAnimations) return; en[0].isIntersecting && !doc.hidden ? svg.unpauseAnimations() : svg.pauseAnimations(); }).observe(svg);
      }
    }
    // після load і в простої — не заважає першому кадру (LCP)
    var go = function () { (window.requestIdleCallback || function (cb) { setTimeout(cb, 300); })(build); };
    if (doc.readyState === 'complete') go(); else addEventListener('load', go);
    doc.addEventListener('visibilitychange', function () { if (svg && svg.pauseAnimations) doc.hidden ? svg.pauseAnimations() : svg.unpauseAnimations(); });
    var t; addEventListener('resize', function () { clearTimeout(t); t = setTimeout(build, 400); }, { passive: true });
  }

  // Гірлянди під шапкою: тонкий шнур провисає дугами (≈360 px кожна), на коротких нитках висять фігури Coolshapes (MIT, coolshap.es) і ледь гойдаються.
  // Лише різдвяна тема; ширина міняється — перебудовуємо. Файли фігур — img/cs/*.svg поруч з ny26.js. Вимкнути — window.NY26_GARLAND = false
  var GARLAND_SHAPES = ['flower-14', 'flower-8', 'flower-13', 'flower-9', 'flower-15'];
  function initGarland() {
    var pill = $('.bf_bar-inner');
    if (!pill || window.NY26_GARLAND === false || THEME !== 'christmas') return;
    var me = $('script[src*="ny26.js"]'), base = me ? me.src.replace(/ny26\.js.*$/, '') + 'img/cs/' : '';
    if (!base) return;
    var box = null, lastW = 0;
    // гірлянда висить з нижнього краю шапки-«таблетки» і рухається разом із нею (шапка sticky)
    function build() {
      var w = pill.clientWidth; if (!w || (box && Math.abs(w - lastW) < 30)) return; lastW = w;
      if (box) box.remove();
      var mob = w < 600, pad = mob ? 22 : 30, span = w - pad * 2, H = mob ? 26 : 30, sag = mob ? 6 : 8, size = mob ? [11, 15] : [13, 18];
      var n = Math.max(2, Math.round(span / (mob ? 170 : 300))), sw = span / n, k = 0, i;
      box = doc.createElement('div'); box.className = 'ny_garland'; box.setAttribute('aria-hidden', 'true');
      var d = 'M' + pad + ' 0';
      for (i = 0; i < n; i++) d += ' Q' + (pad + i * sw + sw / 2).toFixed(1) + ' ' + sag * 2 + ' ' + (pad + (i + 1) * sw).toFixed(1) + ' 0';
      box.innerHTML = '<svg class="ny_garland-cord" width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '"><path d="' + d + '" fill="none" stroke="#c9b6ef" stroke-width="1.25" stroke-linecap="round"/></svg>';
      for (i = 0; i < n; i++) {
        [0.25, 0.5, 0.75].forEach(function (t) {
          var x = pad + i * sw + t * sw, y = sag * 4 * t * (1 - t), s = size[0] + Math.round(Math.random() * (size[1] - size[0]));
          var o = doc.createElement('span'); o.className = 'ny_garland-o';
          o.style.left = x.toFixed(1) + 'px'; o.style.top = y.toFixed(1) + 'px';
          o.style.setProperty('--len', (mob ? 2 : 3) + Math.round(Math.random() * 4) + 'px');
          o.style.setProperty('--d', (2.6 + Math.random() * 2).toFixed(2) + 's');
          o.style.setProperty('--del', (-Math.random() * 3).toFixed(2) + 's');
          o.innerHTML = '<i></i><img alt="" width="' + s + '" height="' + s + '" decoding="async" src="' + base + GARLAND_SHAPES[k++ % GARLAND_SHAPES.length] + '.svg">';
          box.appendChild(o);
        });
      }
      pill.appendChild(box);
    }
    build();
    var t; addEventListener('resize', function () { clearTimeout(t); t = setTimeout(build, 300); }, { passive: true });
  }

  // заголовок hero: «до -40%» (слово перед відсотком + відсоток) — стікер, як плашки «-60%» на BF26
  function initHeroPill() {
    $$('.bf_hero .bf_h1').forEach(function (h) {
      if ($('.ny_h1-pill', h)) return;
      var w = doc.createTreeWalker(h, NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) {
        var m = n.nodeValue.match(/([^\s:;,.!?]{1,6}[\s\u00a0])?[−-]\s?\d{1,2}\s?%/);
        if (!m) continue;
        var hit = n.splitText(m.index); hit.splitText(m[0].length);
        var sp = doc.createElement('span'); sp.className = 'ny_h1-pill';
        hit.parentNode.replaceChild(sp, hit); sp.appendChild(hit);
        return;
      }
    });
  }

  // «−60%» — окрема плашка (span навколо фрази, текст у Designer не міняється): заголовок «Що входить» — помаранчева, смуга вгорі — фіолетова
  function initPill() {
    [['#bf-offer .bf_h2', ''], ['.bf_bar-text', ' is-violet']].forEach(function (cfg) {
      $$(cfg[0]).forEach(function (h) {
        if ($('.bf_pill60', h)) return;
        var w = doc.createTreeWalker(h, NodeFilter.SHOW_TEXT), n;
        while ((n = w.nextNode())) {
          var at = n.nodeValue.search(/[−-]\s?\d{1,2}\s?%/);
          if (at < 0) continue;
          var m = n.nodeValue.slice(at).match(/^[−-]\s?\d{1,2}\s?%/)[0], hit = n.splitText(at);
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
      var t = h.textContent.trim(), m = t.match(/^(.*?)\s*([−-]\s?\d{1,2}\s?%)\s*(.*)$/);
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
        [50, 90].forEach(function (m) { if (pct >= m && !done[m]) { done[m] = true; track('ny_scroll', { percent: m }); } });
      });
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- start */

  function start() {
    syncDeadline();
    fillStatic();
    initNav();
    initQuiz();
    initCtas();
    initVideos();
    initFaq();
    initEmptyBlocks();
    initDeck();
    initTerms();
    initPill();
    initCtaHead();
    initMarquee();
    initReveal();
    initPlans();
    initBow();
    initCharlie();
    initHeroPill();
    initReviews();
    initSnow();
    initGarland();
    initFeat();
    initStack();
    initScroll();
    track('ny_page_view', {});
    // запобіжник часового поясу в head перевів з /ru/self-new-year — подія на сторінці, куди перевели
    try { var tz = JSON.parse(sessionStorage.getItem('ny26:tz') || 'null'); if (tz) { sessionStorage.removeItem('ny26:tz'); track('ny_tz_redirect', tz); } } catch (e) {}
    window.NY26 = {
      theme: THEME, state: S, track: track, leadTemp: leadTemp,
      reset: function () { store.del(K.quiz); store.del(K.attr); location.reload(); }
    };
    log('ready', LOCALE, S);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
