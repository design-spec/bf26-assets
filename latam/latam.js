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
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  V.monthSpec=(S.freq*4)+' clases al mes'; if(VARIANT==='A') V.visShort=S.ended?'−'+Math.floor((1-f.y.nom/f.month)*100)+'%':'más del 60% menos'; V.deadline=dl(false); V.deadlineShort=dl(true);
  $$('[data-p]').forEach(function(el){ var k=el.getAttribute('data-p'); if(k in V) el.textContent=V[k]; });
  /* великі ціни: «US$» окремим меншим знаком */
  $$('.bl-new[data-p],.bl-p12-big[data-p]').forEach(function(el){ var m=/^US\$(.*)$/.exec(el.textContent); if(m) el.innerHTML='<span class="bl-cur">US$</span>'+m[1]; });
  $$('[data-freq]').forEach(function(b){ b.setAttribute('role','button'); b.setAttribute('aria-pressed',String(+b.getAttribute('data-freq')===S.freq)); });
  headerMid();
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
    if(!a.__bl){ a.__bl=1; a.addEventListener('click',function(){ track('lp_cta',{place:a.getAttribute('data-go'),child_age:age?+age:null}); }); }
  });
}

/* Таймер як у BF26: кожна цифра — flip-картка, при зміні верхня половина перекидається вниз */
function flipCard(d){
  var c=document.createElement('span'); c.className='bl-flip'; c.setAttribute('aria-hidden','true');
  ['top','bottom','front','back'].forEach(function(k){ var h=document.createElement('span'), i=document.createElement('span'); h.className='bl-flip-'+k; i.textContent=d; h.appendChild(i); c.appendChild(h); });
  c.setAttribute('data-v',d); return c;
}
function flipTo(el,str){
  if(el.getAttribute('aria-label')===str) return;
  el.setAttribute('aria-label',str); if(!el.getAttribute('role')) el.setAttribute('role','img');
  var cards=[].slice.call(el.querySelectorAll('.bl-flip'));
  if(cards.length!==str.length){ el.textContent=''; str.split('').forEach(function(d){ el.appendChild(flipCard(d)); }); return; }
  cards.forEach(function(c,i){
    var nv=str[i], ov=c.getAttribute('data-v'); if(nv===ov) return;
    var part=function(k){ return c.querySelector('.bl-flip-'+k+' > span'); };
    part('top').textContent=nv; part('back').textContent=nv; part('bottom').textContent=ov; part('front').textContent=ov;
    c.setAttribute('data-v',nv);
    if(reduce){ part('bottom').textContent=nv; return; }
    c.classList.remove('is-flipping'); void c.offsetWidth; c.classList.add('is-flipping');
    clearTimeout(c._t); c._t=setTimeout(function(){ part('bottom').textContent=nv; c.classList.remove('is-flipping'); },620);
  });
}
/* шапка як на /uk/back (RT26): лого · фіолетова плашка з акцією + рядок з датою · кнопка; на мобільному — два рядки без лого */
function headerMid(){
  var hi=document.querySelector('.bl-hdr-in'), logo=hi&&hi.querySelector('.bl-logo'); if(!hi||!logo) return;
  var old=hi.querySelector('.bl-hdr-m'); if(old) old.remove();
  var on=discOn(), l1, l2;
  if(S.ended){ l1='Black Friday terminó'; l2='La clase de prueba sigue siendo gratuita'; }
  else if(VARIANT==='A'){ l1='Black Friday: −60% en el plan anual'; l2='válido hasta el '+dl(false); }
  else if(on){ l1='Black Friday: −'+Math.round(S.disc)+'% en el plan de 3 meses'; l2='válido hasta el '+dl(false); }
  else { l1='Inglés para niños: plan de 3 meses'; l2='sin pagar un año por adelantado'; }
  var m=document.createElement('div'); m.className='bl-hdr-m';
  m.innerHTML='<span class="bl-hdr-m1"></span><span class="bl-hdr-m2"></span>';
  m.firstChild.textContent=l1; m.lastChild.textContent=l2;
  logo.parentNode.insertBefore(m,logo.nextSibling);
}
/* кнопка в шапці: на вузьких екранах — коротко */
(function(){
  var b=document.querySelector('.bl-btn-sm'); if(!b||!window.matchMedia) return;
  var full=b.textContent.trim(), mq=matchMedia('(max-width: 479px)');
  function set(){ b.textContent= mq.matches ? 'Reservar' : full; }
  set(); if(mq.addEventListener) mq.addEventListener('change',set); else if(mq.addListener) mq.addListener(set);
})();
function tick(){
  var left=Math.max(0,DEADLINE-Date.now());
  var v={d:Math.floor(left/864e5),h:Math.floor(left/36e5)%24,m:Math.floor(left/6e4)%60,s:Math.floor(left/1e3)%60};
  $$('[data-t]').forEach(function(el){ flipTo(el,String(v[el.getAttribute('data-t')]).padStart(2,'0')); });
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
    render(); tapes(); howDeck(); setLinks(); track('lp_prices',{source:'api',disc3:S.disc});
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
  els=els.filter(function(el){ return !el.classList.contains('bl-steps')&&!el.classList.contains('bl-deck')&&!el.classList.contains('bl-why'); });
  els.forEach(function(el,i){ el.classList.add('bl-rv'); el.style.setProperty('--bl-rd',(i%3)*0.08+'s'); io.observe(el); });
}
function fx(){
  /* важкі ефекти — після load і в простої, щоб не блокувати перший показ */
  if(!fx.ready){ fx.ready=1; var run=function(){ (window.requestIdleCallback||function(f){setTimeout(f,1)})(fx,{timeout:2500}); }; if(document.readyState==='complete') run(); else window.addEventListener('load',run); return; }
  var hero=document.querySelector('.bl-hero');
  if(hero && !reduce && matchMedia('(min-width: 992px)').matches){ hero.classList.add('bf_hero'); load('bf26-bloom.js'); }
  if(!reduce && discOn()) load('bf26-balloons.js');
}
/* ===== Ілюстрації з BF26 / RT26 (Webflow Assets) і блоки відгуків/нагород ===== */
var A='https://cdn.prod.website-files.com/64997bee22af293e5156648a/', A2='https://cdn.prod.website-files.com/65c9f35f8714a83ce2973aef/';
var IMG={
  quiz:A+'6adb99b350014ad9744e4ec7_bf26-how-quiz.webp', lesson:A+'6adb99b505ecc8a857d970b5_bf26-how-lesson.webp', trophy:A+'6adb99b61eff88918319ff30_bf26-how-trophy.webp',
  ind:A+'6ae0bab933a4021eaf0658ee_49bdb421c0f34b8d42774202d1744b33_1_%D0%86%D0%BD%D0%B4%D0%B8%D0%B2%D1%96%D0%B4%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D1%96%20%D1%83%D1%80%D0%BE%D0%BA%D0%B8.avif',
  mat:A+'6ae0babadf84cfa99c9d9a85_4d5ed9ead5dece14ee84e1d322b227a9_2_%D0%9C%D0%B0%D1%82%D0%B5%D1%80%D1%96%D0%B0%D0%BB%D0%B8%20%D0%BF%D1%96%D0%B4%20%D1%96%D0%BD%D1%82%D0%B5%D1%80%D0%B5%D1%81%D0%B8.avif',
  kids:A+'6ae0babac8913492d1c71c3e_5088c14bdd55c546167542720c790d4c_3_%D0%9C%D1%96%D1%81%D1%8F%D1%86%D1%8C%20%D1%80%D0%BE%D0%B7%D0%BC%D0%BE%D0%B2%D0%BD%D0%B8%D1%85%20%D0%BA%D0%BB%D1%83%D0%B1%D1%96%D0%B2.avif',
  fox:A+'6ae0babaa207c4e25b741c0a_12ffc344872d3c96042a4b3aa2c38cc2_4_%D0%93%D0%B0%D1%80%D0%B0%D0%BD%D1%82%D1%96%D1%8F%20%D0%BF%D0%BE%D0%B2%D0%B5%D1%80%D0%BD%D0%B5%D0%BD%D0%BD%D1%8F%20%D0%B3%D1%80%D0%BE%D1%88%D0%B5%D0%B8%CC%86.avif',
  cls:A+'6af35231a45b522339711ebb_Hero_pic_RT26.avif', cta:A+'69cfda4076b862ff651a4a22_pic_card_forwho3.avif', cup:A+'6ad1d87e8f10766b0f4fc542_image-x7AMcdc77bLjrT7fLhP52TPpyoaLvY.avif'
};
function ill(src,alt,contain){ var d=document.createElement('div'); d.className='bl-ill'+(contain?' is-contain':''); var i=new Image(); i.src=src; i.alt=alt||''; i.loading='lazy'; d.appendChild(i); return d; }
function illus(){
  var st=$$('.bl-step'); [[IMG.quiz,'Preguntas sobre el niño',1],[IMG.lesson,'Clase de prueba con la profesora',1],[IMG.trophy,'Resultado',1]].forEach(function(x,k){ if(st[k]) st[k].insertBefore(ill(x[0],x[1],x[2]),st[k].firstChild); });
  var wc=$$('.bl-why-c'); [[IMG.ind,'Clase individual online con la profesora'],[IMG.mat,'Materiales según los intereses del niño'],[IMG.cls,'Clase en la plataforma de All Right',1],[IMG.kids,'Niños de distintos países']].forEach(function(x,k){ if(wc[k]) wc[k].insertBefore(ill(x[0],x[1],x[2]),wc[k].firstChild); });
  var g=document.querySelector('.bl-g28'); if(g){ var w=document.createElement('div'); w.className='bl-guar-ill'; var i=new Image(); i.src=IMG.fox; i.alt='Garantía de devolución: el zorrito de All Right con una moneda'; i.loading='lazy'; g.parentNode.insertBefore(w,g); w.appendChild(i); w.appendChild(g); }
  /* фінальний CTA — без зображення (рішення 13.11) */
  var rv=document.querySelector('.bl-revs .bl-wrap');
  if(rv){
    var AW=[['6ad1d6f4fffe6a658429a957_deloitte.DapqUt8R.png','Technology Fast 500 — 2022'],['6ad1d71c1da9794f69ef6018_forbes.Bq2Plsz6.png','Top 30 mejores startups'],['6ad1d71d1da9794f69ef601e_holoniq.BtBALW6d.png','Top 200 startups EdTech de Europa'],['6ad1d7732530eafa97c495b6_tracxn.D1Lc_o5g.png','Startup tecnológica líder'],['6ad1d7732530eafa97c495e0_edtechx.BV_dA2_H.png','Finalista en la categoría de aprendizaje de idiomas'],['6ad1d7742530eafa97c49607_digital_education_awards.CyoId8iL.png','Producto digital del año para aprender idiomas'],['6ad1d71c1da9794f69ef601b_edtech.BygLEFFc.png','Finalista de los EdTech Awards Cool Tool 2025'],['6ad1d71c1da9794f69ef6014_qs_reimagine_education.DRtPb4KD.png','QS Reimagine Education Awards — finalista 2025']];
    var items=AW.map(function(x){ return '<div class="bl-award"><img src="'+A2+x[0]+'" alt="'+x[1]+'" loading="lazy"><div class="bl-award-cap">'+x[1]+'</div></div>'; }).join('');
    var aw=document.createElement('div'); aw.className='bl-awards';
    aw.innerHTML='<img class="bl-awards-trophy" src="'+IMG.cup+'" alt="" aria-hidden="true" loading="lazy" decoding="async"><div class="bl-awards-panel"><h3 class="bl-awards-title">Nuestros premios</h3><div class="bl-award-track">'+items+items.replace(/class="bl-award"/g,'class="bl-award is-dup" aria-hidden="true"')+'</div></div>';
    rv.appendChild(aw);
  }
}
/* «Cómo funciona» як «Як працює резервування» у BF26: колода з трьох карток, роздаються при появі */
function howDeck(){
  var steps=document.querySelector('.bl-steps'); if(!steps) return;
  var sec=steps.closest('section'); if(sec) sec.classList.add('bl-how');
  var on=discOn(), d3t, star=null;
  if(S.ended) d3t='Elige tu plan y págalo en tu área personal.';
  else if(VARIANT==='A'){ d3t='Pago del plan anual con −60% hasta el 30 de noviembre.'; star='−60%'; }
  else if(on){ d3t='Pago del plan de 3 meses con descuento hasta el 30 de noviembre.'; star='−'+Math.round(S.disc)+'%'; }
  else d3t='Pago de 3 meses, sin pagar un año por adelantado.';
  var cards=[
    ['is-orange','Paso 1','Unas preguntas y tus datos.',IMG.quiz,'','Empezar ↗','go'],
    ['is-violet','Paso 2','Clase de prueba gratuita a la hora que te convenga.',IMG.lesson,'','Elegir edad ↗','age'],
    ['is-accent','Paso 3',d3t,IMG.trophy,' is-sm','Reservar ↗','go']
  ];
  var deck=document.createElement('div'); deck.className='bl-deck';
  cards.forEach(function(c,k){
    var el=document.createElement('div'); el.className='bl-deal '+c[0];
    el.innerHTML=(k===2&&star?'<div class="bl-sticker" aria-hidden="true"><span></span></div>':'')+'<div class="bl-deal-tag"></div><div class="bl-deal-title"></div><div class="bl-deal-media"><img class="bl-deal-img'+c[4]+'" alt="" loading="lazy"></div><a class="bl-deal-link" href="#"></a>';
    if(k===2&&star) el.querySelector('.bl-sticker span').textContent=star;
    el.querySelector('.bl-deal-tag').textContent=c[1]; el.querySelector('.bl-deal-title').textContent=c[2];
    el.querySelector('img').src=c[3]; var a=el.querySelector('.bl-deal-link'); a.textContent=c[5];
    if(c[6]==='go'){ a.setAttribute('data-go','how'); }
    else a.addEventListener('click',function(e){ e.preventDefault(); var t=document.querySelector('.bl-ages'); if(t){ scrollTo({top:t.getBoundingClientRect().top+scrollY-140,behavior:reduce?'auto':'smooth'}); } track('lp_cta',{place:'how-age'}); });
    deck.appendChild(el);
  });
  steps.style.display='none';
  var old=sec&&sec.querySelector('.bl-deck'); if(old) old.remove();
  steps.parentNode.insertBefore(deck,steps.nextSibling);
  if(reduce||!('IntersectionObserver' in window)){ deck.classList.add('is-in'); return; }
  html.classList.add('bl-js');
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ deck.classList.add('is-in'); io.disconnect(); } }); },{threshold:0.2});
  io.observe(deck);
}
/* Відгуки як на /uk/back (RT26 setupReviews): CMS-список «BF26 Reviews» (locale=es) у [data-bl-reviews];
   немає жодного запису для мови — секцію ховаємо; плашка рейтингу (дані як у RT26 es) + стрічка Embla Carousel */
var RATING=[{icon:'facebook',value:'100%',label:'Facebook'},{icon:'trustpilot',value:'4.7',label:'Trustpilot'}];
var FB_ICO='<svg viewBox="0 0 41 41" width="40" height="40" aria-hidden="true"><path d="M17.34 39.24C8.39 37.66 1.55 29.87 1.55 20.5 1.55 10.08 10.08 1.55 20.5 1.55s18.95 8.53 18.95 18.95c0 9.37-6.84 17.16-15.79 18.74l-1.05-.84h-4.21z" fill="#fff"/><path d="M27.87 25.76l.84-5.26h-5.05v-3.68c0-1.48.52-2.64 2.84-2.64h2.42V9.34c-1.37-.21-2.84-.42-4.21-.42-4.32 0-7.37 2.63-7.37 7.37v4.21h-4.73v5.26h4.73v13.37c1.05.21 2.11.32 3.16.32s2.1-.11 3.16-.32V25.76z" fill="#027de5"/></svg>';
var TP_ICO='<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="M20 3l4.9 11.9 12.8.9-9.8 8.3 3.1 12.5L20 29.8 9 36.6l3.1-12.5-9.8-8.3 12.8-.9z" fill="#00b67a"/><path d="M27.2 24.6l-.9-3.5L20 25.7z" fill="#005128"/></svg>';
function setupReviews(){
  var slot=document.querySelector('[data-bl-reviews]'); if(!slot||document.querySelector('.bl-rvbox')) return;
  var sec=slot.closest('section');
  if(!slot.querySelector('.w-dyn-item')){ if(sec) sec.style.display='none'; return; }
  var box=document.createElement('div'); box.className='bl-rvbox';
  slot.parentNode.insertBefore(box,slot);
  var b=document.createElement('div'); b.className='bl-rv-badge';
  b.innerHTML=RATING.map(function(r){ return '<div class="bl-rv-stat"><div class="bl-rv-num">'+(r.icon==='facebook'?FB_ICO:TP_ICO)+'<span>'+r.value+'</span></div><span class="bl-rv-src">'+r.label+'</span></div>'; }).join('');
  box.appendChild(b); box.appendChild(slot);
  var vp=slot.querySelector('.w-dyn-list'); if(!vp) return;
  function init(){
    if(!window.EmblaCarousel||box.classList.contains('is-embla')) return;
    box.classList.add('is-embla');
    var pl=window.EmblaCarouselWheelGestures?[window.EmblaCarouselWheelGestures()]:[];
    try{ window.EmblaCarousel(vp,{align:'start',containScroll:'trimSnaps',dragFree:false,duration:30},pl); }catch(e){ box.classList.remove('is-embla'); }
  }
  function ld(src,cb){ var sc=document.createElement('script'); sc.src=src; sc.async=true; sc.onload=sc.onerror=cb; document.head.appendChild(sc); }
  var CDN='https://cdn.jsdelivr.net/npm/';
  function go(){ ld(CDN+'embla-carousel@8.5.2/embla-carousel.umd.js',function(){ ld(CDN+'embla-carousel-wheel-gestures@8.0.2/dist/embla-carousel-wheel-gestures.umd.js',init); }); }
  /* Embla вантажимо, лише коли відгуки близько до екрана */
  if('IntersectionObserver' in window){ var io=new IntersectionObserver(function(es){ if(es.some(function(e){return e.isIntersecting;})){ io.disconnect(); go(); } },{rootMargin:'800px 0px'}); io.observe(box); } else go();
}
/* Футер як на /uk/back (RT26 setupFooter): лого + контакти (es), умови з підсвіткою ключових фраз, юр. посилання, © */
function setupFooter(){
  var fi=document.querySelector('.bl-foot-in'); if(!fi||fi.querySelector('[data-bl-ft]')) return;
  var top=document.createElement('div'); top.setAttribute('data-bl-ft','top');
  top.innerHTML='<div data-bl-ft="brand"><a aria-label="All Right" data-bl-logo href="https://allright.com/es" target="_blank" rel="noopener"></a><div data-bl-contacts="es"><a href="mailto:help@allright.com">help@allright.com</a><p data-bl-ft="hours">8:00 – 21:00</p><a href="https://wa.me/34672585377" target="_blank" rel="noopener">WhatsApp</a><a href="https://m.me/allrightES" target="_blank" rel="noopener">Messenger</a><a href="https://www.instagram.com/allright_spain/" target="_blank" rel="noopener">Instagram</a><a href="https://www.facebook.com/allrightES" target="_blank" rel="noopener">Facebook</a><a href="https://www.youtube.com/@allright_com" target="_blank" rel="noopener">YouTube</a></div></div><div data-bl-ft="main"></div>';
  var main=top.querySelector('[data-bl-ft="main"]');
  $$('.bl-foot-p',fi).forEach(function(p){ p.classList.add('bl-terms'); main.appendChild(p); });
  var legal=document.createElement('div'); legal.className='bl-legal';
  [['https://allright.com/legal/privacy-policy.html','Política de privacidad'],['https://allright.com/legal/cookie-policy.html','Política de cookies'],['https://allright.com/legal/terms-of-services-allright/es.pdf','Condiciones de uso de All Right'],['https://allright.com/legal/service-rules-and-code-of-conduct/es.pdf','Normas del servicio'],['https://allright.com/legal/payment-and-refund-policy/es.pdf','Pagos y reembolsos']].forEach(function(l){ var a=document.createElement('a'); a.className='bl-flink'; a.href=l[0]; a.target='_blank'; a.rel='noopener'; a.textContent=l[1]; legal.appendChild(a); });
  var cp=document.createElement('p'); cp.className='bl-copy'; cp.textContent='© All Right';
  fi.insertBefore(top,fi.firstChild); fi.appendChild(legal); fi.appendChild(cp);
  // підсвітка ключових фраз умов (як termsHl у RT26)
  var HL=['El descuento de Black Friday','primer pago','30 de noviembre de 2026 a las 23:59','ahorro mínimo','Precios según la página de precios'], i=0;
  $$('.bl-terms',main).forEach(function(p){ HL.forEach(function(ph){
    var w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT,null), n;
    while((n=w.nextNode())){ if(n.parentNode.classList&&n.parentNode.classList.contains('bl-hl')) continue;
      var k=n.nodeValue.indexOf(ph); if(k<0) continue;
      var mid=n.splitText(k); mid.splitText(ph.length); var sp=document.createElement('span'); sp.className='bl-hl'; sp.style.setProperty('--bl-i',i++);
      mid.parentNode.replaceChild(sp,mid); sp.appendChild(mid); break; }
  }); });
  if(!window.IntersectionObserver||reduce){ main.classList.add('is-in'); return; }
  html.classList.add('bl-js'); main.classList.add('bl-hl-ready');
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ main.classList.add('is-in'); io.disconnect(); } }); },{threshold:0.35});
  io.observe(main);
}
/* «Por qué» як «Що входить у навчання» у BF26: картки-стопка (зображення + текст), попередні зменшуються (initStack) */
function whyStack(){
  var why=document.querySelector('.bl-why'); if(!why||why.classList.contains('is-stack')) return;
  var sec=why.closest('section'); if(sec) sec.classList.add('bl-offer');
  $$('.bl-why-c',why).forEach(function(c){
    var body=document.createElement('div'); body.className='bl-feat-body';
    [].slice.call(c.children).forEach(function(ch){ if(!ch.classList.contains('bl-ill')) body.appendChild(ch); });
    c.appendChild(body);
  });
  why.classList.add('is-stack');
  var cards=$$('.bl-why-c',why); if(cards.length<2||reduce) return;
  var BASE=0.85, STEP=0.03, busy=false;
  function update(){
    busy=false;
    cards.forEach(function(c,i){
      var next=cards[i+1]; if(!next){ c.style.transform=''; return; }
      var stick=parseFloat(getComputedStyle(next).top)||0, h=c.offsetHeight||1;
      var p=Math.min(1,Math.max(0,1-(next.getBoundingClientRect().top-stick)/h)), target=BASE+i*STEP;
      for(var j=i+2;j<cards.length;j++){ var n=cards[j], st=parseFloat(getComputedStyle(n).top)||0; p+=Math.min(1,Math.max(0,1-(n.getBoundingClientRect().top-st)/(n.offsetHeight||1)))*0.35; }
      c.style.transform='scale('+Math.max(target-0.05,1-Math.min(p,1.35)*(1-target)).toFixed(4)+')';
    });
  }
  addEventListener('scroll',function(){ if(!busy){ busy=true; requestAnimationFrame(update); } },{passive:true});
  addEventListener('resize',update,{passive:true});
  update();
}
/* Смуга умов як зелений блок на allright.com: три темні картки з ілюстраціями (з allright.com, копії в latam/img) */
function promoStrip(){
  var ti=document.querySelector('.bl-trust-in'); if(!ti||ti.querySelector('.bl-promo')) return;
  var I='https://cdn.jsdelivr.net/gh/design-spec/bf26-assets@latam-v1.0.10/latam/img/';
  var CHEV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" fill="currentColor"/></svg>';
  var cards=[
    {img:'gift.png',sm:1,t:'La clase de prueba es gratuita',s:'Reservar clase'+CHEV,go:1},
    {img:'coin.webp',t:'Paga con tarjeta, Apple Pay o Google Pay',s:'Visa o Mastercard. Tenlo a mano para después de la clase.'},
    VARIANT==='A' ? {img:'folder.png',sm:1,t:'Sin sorpresas',s:'Precio, renovación y reembolso explicados antes de pagar.'}
                  : {img:'charlie-hi.webp',t:'Sin pagar un año por adelantado',s:'Empiezas con 3 meses y decides después.'}
  ];
  var box=document.createElement('div'); box.className='bl-promo';
  cards.forEach(function(c){
    var el=document.createElement(c.go?'a':'div'); el.className='bl-promo-card';
    if(c.go){ el.setAttribute('data-go','trust'); el.href=FUNNEL; }
    el.innerHTML='<img class="bl-promo-img'+(c.sm?' is-sm':'')+'" src="'+I+c.img+'" alt="" loading="lazy"><div class="bl-promo-txt"><div class="bl-promo-t"></div><span class="bl-promo-s">'+c.s+'</span></div>';
    el.querySelector('.bl-promo-t').textContent=c.t;
    box.appendChild(el);
  });
  $$('.bl-trust-p',ti).forEach(function(p){ p.style.display='none'; });
  ti.appendChild(box);
}
/* Блок «Precio claro» як React Bits Pricing 12, яскравіше: заголовок по центру + перемикач частоти + картка (ліво — ціна і кнопка, право — розбивка) + рядок гарантій */
function offerCard(){
  var cl=document.querySelector('.bl-clear'); if(!cl||cl.classList.contains('is-p12')) return;
  var left=cl.querySelector('.bl-clear-l'), tab=cl.querySelector('.bl-ptab'), np=cl.querySelector('.bl-noprice');
  var CHK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg>';
  var ic={
    shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3z" fill="currentColor"/></svg>',
    gift:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-2.2A3 3 0 0 0 12 4.2 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8h1a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-5-1a1 1 0 1 1 0 2h-2V7a1 1 0 0 1 2-1zM9 6a1 1 0 0 1 2 1v1H9a1 1 0 0 1 0-2zm2 14H7v-8h4v8zm0-10H5V9h6v1zm6 10h-4v-8h4v8zm2-10h-6V9h6v1z" fill="currentColor"/></svg>',
    cycle:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6V3L8 7l4 4V8a4 4 0 0 1 4 4 4 4 0 0 1-.5 1.9l1.5 1.5A6 6 0 0 0 12 6zm0 10a4 4 0 0 1-4-4c0-.7.2-1.3.5-1.9L7 8.6A6 6 0 0 0 12 18v3l4-4-4-4v3z" fill="currentColor"/></svg>'
  };
  var A=VARIANT==='A';
  cl.classList.add('is-p12');
  /* шапка */
  var head=document.createElement('div'); head.className='bl-p12-head';
  var h2=left.querySelector('.bl-h2'); head.appendChild(h2);
  [].slice.call(left.querySelectorAll('.bl-clear-p')).forEach(function(p){ head.appendChild(p);
    [].slice.call(p.querySelectorAll('span[data-s]')).forEach(function(sp){ if(sp.firstChild&&sp.firstChild.nodeType===3&&!/^\s/.test(sp.firstChild.nodeValue)) sp.firstChild.nodeValue=' '+sp.firstChild.nodeValue; }); });
  var seg=document.createElement('div'); seg.className='bl-p12-seg'; seg.setAttribute('role','group');
  seg.innerHTML='<a href="#" data-freq="2">2 clases por semana</a><a href="#" data-freq="3">3 clases por semana</a>';
  head.appendChild(seg);
  /* картка */
  var card=document.createElement('div'); card.className='bl-p12-card'; card.setAttribute('data-s','haspr');
  var L=document.createElement('div'); L.className='bl-p12-l';
  L.innerHTML=
    '<span class="bl-p12-badge'+(A?'':' is-v')+'">'+(A?'<span data-s="pre">Black Friday · </span>':'')+'<span data-p="planHead"></span></span>'+
    '<div class="bl-p12-price"><span class="bl-p12-big" data-p="heroPer"></span><span class="bl-p12-per">/ clase</span></div>'+
    '<div class="bl-p12-was"><s data-p="monthPer"></s> en el plan mensual · <b data-p="'+(A?'visShort':'saveVsMonth')+'"></b></div>'+
    '<div class="bl-p12-tot">Total <b data-p="heroTotal"></b> '+(A?'por 12 meses':'por 3 meses')+' en un solo pago, después de la clase de prueba.</div>'+
    '<div class="bl-p12-cta"><a class="bl-btn-c" data-go="price">Reservar clase de prueba gratis</a></div>'+
    '<p class="bl-p12-fine">Renovación automática a precio completo: <span data-p="renewShort"></span>. La cancelas en tu área personal antes del cobro.</p>';
  var R=document.createElement('div'); R.className='bl-p12-r';
  R.innerHTML='<div class="bl-p12-eye">Todo el precio, sin letra pequeña</div>';
  R.appendChild(tab); tab.removeAttribute('data-s');
  [].slice.call(tab.querySelectorAll('.bl-pr,.bl-pr-hl')).forEach(function(r){ var k=r.querySelector('.bl-pk'); if(k&&!k.querySelector('.bl-p12-chk')){ var s=document.createElement('span'); s.className='bl-p12-chk'; s.innerHTML=CHK; r.insertBefore(s,k); } });
  card.appendChild(L); card.appendChild(R);
  /* гарантії */
  var tr=document.createElement('div'); tr.className='bl-p12-trust';
  tr.innerHTML='<span>'+ic.shield+'Reembolso garantizado 28 días</span><span>'+ic.gift+'Clase de prueba gratis</span><span>'+ic.cycle+'Cancelas en tu área personal</span>';
  cl.innerHTML=''; cl.appendChild(head); cl.appendChild(card); if(np) cl.appendChild(np); cl.appendChild(tr);
  [].slice.call(seg.querySelectorAll('[data-freq]')).forEach(function(b){ b.addEventListener('click',function(e){ e.preventDefault(); S.freq=+b.getAttribute('data-freq'); render(); track('lp_freq',{value:S.freq,place:'price'}); }); });
}

function topH(){ var t=document.querySelector('.bl-top'); if(t) html.style.setProperty('--bl-top-h',t.offsetHeight+'px'); }
topH(); window.addEventListener('resize',topH); if(window.ResizeObserver){ var tt=document.querySelector('.bl-top'); if(tt) new ResizeObserver(topH).observe(tt); }
promoStrip(); offerCard(); setupReviews(); setupFooter(); render(); howDeck(); setLinks(); tapes(); illus(); whyStack(); reveal(); tick(); setInterval(tick,1000); loadPrices(); fx();
track('lp_view',{});
})();
