(function(){
'use strict';
var html=document.documentElement, VARIANT=html.getAttribute('data-v')||'A';
var DEADLINE=Date.parse('2026-11-30T21:59:59Z');            // = 23:59 Kyiv, timer_deadline API
var FUNNEL='https://allright.com/es/app/sign-up/long/v9/';
var API='https://allright.com/api/v1/payment-plans';
var params=new URLSearchParams(location.search);
// Знімок API 13.11.2026 (locale=es, general-usd) — запас, якщо API не відповів
var P={2:{month:20,m3:11,q3:24,y:{nom:8.5,bf:7.14,qty:96}},3:{month:17,m3:10,q3:36,y:{nom:7.5,bf:6.3,qty:144}}};
var S={freq:3,ended:Date.now()>DEADLINE||params.get('ended')==='1',disc:+(params.get('disc')||0),src:'static'};
var TZ; try{TZ=Intl.DateTimeFormat().resolvedOptions().timeZone;}catch(e){}

window.dataLayer=window.dataLayer||[];
function track(ev,p){ window.dataLayer.push(Object.assign({event:ev,page_variant:VARIANT,market:'latam'},p||{})); }
function $$(s){ return [].slice.call(document.querySelectorAll(s)); }
function money(n){ return 'US$'+(+n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function dl(short){
  var d=new Date(DEADLINE), o={hour:'2-digit',minute:'2-digit'}; if(TZ) o.timeZone=TZ;
  var t=d.toLocaleTimeString('es',o); if(short) return t;
  var o2={day:'numeric',month:'long'}; if(TZ) o2.timeZone=TZ;
  return d.toLocaleDateString('es',o2)+', '+t+' (tu hora)';
}
function discOn(){ return !S.ended && (VARIANT==='A' || S.disc>0); }

function render(){
  html.setAttribute('data-disc',discOn()?'1':'0');
  if(S.ended) html.setAttribute('data-ended',''); else html.removeAttribute('data-ended');
  if(params.get('prices')==='none') html.setAttribute('data-zone','FAIL');
  var f=P[S.freq], V;
  if(VARIANT==='A'){
    var per=S.ended?f.y.nom:f.y.bf;
    V={planName:'plan anual',planHead:'Plan anual · 12 meses · '+f.y.qty+' clases',planSpec:'12 meses, '+f.y.qty+' clases',
       monthPer:money(f.month),nomPer:money(f.y.nom),bfPer:money(f.y.bf),heroPer:money(per),heroTotal:money(per*f.y.qty),
       renew:money(f.y.nom*f.y.qty)+' por 12 meses',renewShort:money(f.y.nom*f.y.qty)+' / 12 meses',
       vis:'−60%',real:'−'+Math.round((1-f.y.bf/f.y.nom)*100)+'%'};
  } else {
    var nom=f.m3, p3=discOn()?(f.m3bf||Math.round(nom*(1-S.disc/100)*100)/100):nom, lp=S.ended?f.y.nom:f.y.bf;
    V={planName:'plan de 3 meses',planHead:'Plan de 3 meses · '+f.q3+' clases',planSpec:'3 meses, '+f.q3+' clases',
       monthPer:money(f.month),nomPer:money(nom),heroPer:money(p3),heroTotal:money(p3*f.q3),
       saveVsMonth:'−'+Math.round((1-p3/f.month)*100)+'%',real:'−'+Math.round(S.disc)+'%',
       renew:money(nom*f.q3)+' por los siguientes 3 meses',renewShort:money(nom*f.q3)+' / 3 meses',
       longPer:money(lp),longTotal:money(lp*f.y.qty)};
  }
  V.monthSpec=(S.freq*4)+' clases al mes'; V.deadline=dl(false); V.deadlineShort=dl(true);
  $$('[data-p]').forEach(function(el){ var k=el.getAttribute('data-p'); if(k in V) el.textContent=V[k]; });
  $$('[data-freq]').forEach(function(b){ b.setAttribute('aria-pressed',String(+b.getAttribute('data-freq')===S.freq)); });
}

/* Посилання у long v9: utm/fbclid/gclid зі сторінки + мітка варіанта; плитки віку додають child_age */
function setLinks(){
  var q=new URLSearchParams();
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ttclid'].forEach(function(k){ var v=params.get(k); if(v) q.set(k,v); });
  if(!q.get('utm_source')) q.set('utm_source','facebook');
  if(!q.get('utm_campaign')) q.set('utm_campaign','bf26_latam');
  if(!q.get('utm_content')) q.set('utm_content','bf26_latam_'+VARIANT.toLowerCase());
  var u=FUNNEL+'?'+q.toString();
  $$('[data-go]').forEach(function(a){
    var age=a.getAttribute('data-age');
    a.setAttribute('href', age? u+'&child_age='+age : u); a.setAttribute('target','_blank'); a.setAttribute('rel','noopener');
    a.addEventListener('click',function(){ track('lp_cta',{place:a.getAttribute('data-go'),child_age:age?+age:null}); });
  });
}

function tick(){
  var left=Math.max(0,DEADLINE-Date.now());
  function p(n){return String(n).padStart(2,'0');}
  var v={d:Math.floor(left/864e5),h:p(Math.floor(left/36e5)%24),m:p(Math.floor(left/6e4)%60),s:p(Math.floor(left/1e3)%60)};
  $$('[data-t]').forEach(function(el){ el.textContent=v[el.getAttribute('data-t')]; });
  if(left===0 && !S.ended){ S.ended=true; render(); }
}

/* Ціни наживо: той самий запит, що робить allright.com/es/app/price (locale=es, USD, зона за IP) */
function loadPrices(){
  if(!window.fetch || params.get('prices')==='static') return;
  function get(qpw){
    var q={locale:'es',tutor_type_alias:'standard',qty_per_week:qpw,currency:'USD'}; if(params.get('cc')) q.country_code=params.get('cc').toUpperCase();
    return fetch(API+'?'+Object.keys(q).map(function(k){return 'filter%5B'+k+'%5D='+encodeURIComponent(q[k]);}).join('&'),{credentials:'omit'})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); });
  }
  var done=false; setTimeout(function(){ if(!done){ done=true; track('lp_prices',{source:'static',reason:'timeout'}); } },5000);
  Promise.all([get(2),get(3)]).then(function(res){
    if(done) return;
    var np={};
    [2,3].forEach(function(qpw,i){
      var o={y:{}};
      (res[i].data||[]).forEach(function(pl){
        var a=pl.attributes||{}, pp=a['price-curr-parts'], old=a['old-price-curr-parts'], fb=a['first-payment-bonus']||{};
        if(a['is-show']===false||!pp||pp.currency!=='USD') return;
        var n=+a['period-amount'], price=+pp.priceWithDecimal;
        if(n===1) o.month=price;
        if(n===3){ o.q3=+a.qty; if(fb.is_real_discount&&old){ o.m3=+old.priceWithDecimal; o.m3bf=price; o.disc3=+fb.amount; } else o.m3=price; }
        if(n===12){ o.y.qty=+a.qty; o.y.bf=price; o.y.nom=old?+old.priceWithDecimal:price; o.y.real=!!(fb.is_real_discount&&old); }
      });
      if(o.month&&o.y.bf&&(VARIANT==='A'?(o.y.real||S.ended):o.m3)) np[qpw]=Object.assign({},P[qpw],o,{y:Object.assign({},P[qpw].y,o.y)});
    });
    if(!np[2]||!np[3]) throw new Error('no plans');
    done=true; P=np; if(!params.get('disc')) S.disc=P[3].disc3||0; S.src='api';
    render(); tapes(); track('lp_prices',{source:'api',disc3:S.disc});
  }).catch(function(e){ if(!done){ done=true; track('lp_prices',{source:'static',reason:String(e&&e.message||e).slice(0,60)}); } });
}

$$('[data-freq]').forEach(function(b){ b.addEventListener('click',function(e){ e.preventDefault(); S.freq=+b.getAttribute('data-freq'); render(); track('lp_freq',{value:S.freq}); }); });
$$('.bl-fi').forEach(function(it){ var q=it.querySelector('.bl-fq'); if(!q) return;
  q.setAttribute('role','button'); q.setAttribute('tabindex','0');
  function t(){ it.classList.toggle('is-open'); q.setAttribute('aria-expanded',String(it.classList.contains('is-open'))); if(it.classList.contains('is-open')) track('lp_faq_open',{q:it.getAttribute('data-q')}); }
  q.addEventListener('click',t); q.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); t(); } });
});
/* Webflow обрізає пробіли на межах вставок <span data-s> — повертаємо; стилі сайту стискають line-height тексту — повертаємо 1.5 */
(function(){
  var st=document.createElement('style');
  st.textContent='.bl-lead,.bl-fine,.bl-total,.bl-micro,.bl-step-p,.bl-why-p,.bl-rev-q,.bl-guar-p,.bl-clear-p,.bl-trust-p,.bl-foot-p,.bl-fa,.bl-sub,.bl-per,.bl-ps{line-height:1.5}';
  document.head.appendChild(st);
  $$('span[data-s]').forEach(function(sp){
    var pv=sp.previousSibling, nx=sp.nextSibling, t=sp.textContent;
    if(pv && /\S$/.test(pv.textContent) && !/\($/.test(pv.textContent) && /^[^\s.,;:)]/.test(t)) sp.insertBefore(document.createTextNode(' '),sp.firstChild);
    if(nx && /\S$/.test(t) && /^[^\s.,;:)]/.test(nx.textContent)) sp.appendChild(document.createTextNode(' '));
  });
})();
/* ===== BF26: логотип, стрічки, фон Light Bloom, кульки, поява блоків ===== */
var LOGO='<img src="https://cdn.prod.website-files.com/64997bee22af293e5156648a/69a6f4aacf26fb8379def5e1_Al%20Right.svg" width="176" height="32" alt="All Right">';
var BF26='https://cdn.jsdelivr.net/gh/design-spec/bf26-assets@v1.0.64/';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function load(f){ var s=document.createElement('script'); s.src=BF26+f; s.async=true; document.head.appendChild(s); }
$$('.bl-logo').forEach(function(a){ a.innerHTML=LOGO; });
function tapes(){
  $$('.bl-chip').forEach(function(c){
    var ds=c.getAttribute('data-s')||'', w, star=null;
    if(/\bnodisc\b/.test(ds)) w=['Plan de','3 meses'];
    else { w=['Black','Friday']; star= /\bvb\b/.test(ds)? '−'+Math.round(S.disc)+'%' : '−60%'; }
    c.innerHTML='<span class="bl-tapes-row"><span class="bl-tape is-1"></span><span class="bl-brand"><span class="bl-brand-pre">en</span>'+LOGO+'</span></span>'+
      '<span class="bl-tapes-row is-2"><span class="bl-tape is-2"></span>'+(star?'<span class="bl-tag"><span></span></span>':'')+'</span>';
    c.querySelector('.bl-tape.is-1').textContent=w[0]; c.querySelector('.bl-tape.is-2').textContent=w[1];
    if(star) c.querySelector('.bl-tag span').textContent=star;
    c.classList.add('is-tapes');
  });
}
function reveal(){
  var els=$$('.bl-sec .bl-wrap > *, .bl-sec-np .bl-wrap > *, .bl-revs .bl-wrap > *, .bl-guar > *, .bl-final-in > *');
  if(reduce||!('IntersectionObserver' in window)) return;
  html.classList.add('bl-js');
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('is-in'); io.unobserve(e.target); } }); },{rootMargin:'0px 0px -10% 0px'});
  els.forEach(function(el,i){ el.classList.add('bl-rv'); el.style.setProperty('--bl-rd',(i%3)*0.08+'s'); io.observe(el); });
}
function fx(){
  var hero=document.querySelector('.bl-hero');
  if(hero && !reduce && matchMedia('(min-width: 992px)').matches){ hero.classList.add('bf_hero'); load('bf26-bloom.js'); }
  if(!reduce && discOn()) load('bf26-balloons.js');
}
render(); setLinks(); tapes(); reveal(); tick(); setInterval(tick,1000); loadPrices(); fx();
track('lp_view',{});
})();
