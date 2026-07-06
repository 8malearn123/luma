/* ===== LUMA Theme — dark (Eclipse · Black & Gold) / light (Aura · Champagne & Nude) =====
   Brand palettes from LUMA_Brand_Identity:
   Eclipse: Obsidian #0C0B0E · Ink #15141A · Luminance Gold #C9A75E · Champagne #E9D29A · Pearl #EDE7DA
   Aura:    Cream #F3ECE2 · Nude #DEC4B0 · Blush #ECCDBD · Bronze Light #A97E4F · Espresso #3B2F2B */
(function(){
  if(window.__LUMA_THEME__) return; window.__LUMA_THEME__=true;

  var KEY='luma_theme';
  var saved='dark';
  try{saved=localStorage.getItem(KEY)||'dark';}catch(e){}
  document.documentElement.dataset.theme=saved;

  var css=[
  /* ── DARK — Eclipse: true black per brand ── */
  'html:not([data-theme="light"]){',
  '  --bg:#0C0B0E; --bg2:#0A090C; --bg-soft:#0E0C0A;',
  '  --panel:#15141A; --panel2:#191820; --panel3:#1D1B23;',
  '  --surface:#15141A; --surface2:#191820; --surface3:#1E1C24;',
  '  --charcoal:#0C0B0E; --warm-black:#0E0D0B;',
  '}',
  /* ── LIGHT — Aura: white/cream per brand ── */
  'html[data-theme="light"]{',
  '  --bg:#F6F1E8; --bg2:#F3ECE2; --bg-soft:#F3ECE2;',
  '  --panel:#FDFBF7; --panel2:#F8F3EB; --panel3:#F1EADE;',
  '  --surface:#FDFBF7; --surface2:#F7F1E8; --surface3:#EFE8DB;',
  '  --charcoal:#F3ECE2; --warm-black:#F6F1E8;',
  '  --gold:#A97E4F; --gold-light:#9A7238; --gold-bright:#B08A45; --gold-pale:#8A6B3F; --gold-deep:#C9AC7E;',
  '  --white:#2E241B; --off-white:#2E241B; --text:#3B2F2B; --cream:#54473A;',
  '  --muted:#8D8172; --muted-deep:#B3A794; --muted2:#7B6F60;',
  '  --line:#E4DACA; --line-soft:#ECE3D4; --border:#DCD1BF;',
  '  --green:#557F4F; --green-bg:rgba(85,127,79,0.12);',
  '  --red:#B0604E; --red-bg:rgba(176,96,78,0.12);',
  '  --blue:#5B7FA6; --rose:#B96A76;',
  '}',
  'html[data-theme="light"] body{background:var(--bg);color:var(--text);}',
  /* structural chrome with hardcoded dark backgrounds */
  'html[data-theme="light"] .nav{background:rgba(250,246,238,.8);}',
  'html[data-theme="light"] .nav.scrolled{background:rgba(250,246,238,.94);}',
  'html[data-theme="light"] .topbar{background:rgba(250,246,238,.86);}',
  'html[data-theme="light"] .sidebar{background:linear-gradient(190deg,#F3ECDE,#EAE0CD);}',
  /* sections with hardcoded dark radial glows (index closing, pricing philo/closing) */
  'html[data-theme="light"] .closing{background:radial-gradient(ellipse at 50% 40%,#EDE3D2,var(--bg2,#F3ECE2) 72%);}',
  'html[data-theme="light"] .philo{background:radial-gradient(ellipse at 50% 50%,#EFE7D8,#F3ECE2 74%);}',
  /* luma-ui widgets (modals/toasts/menus) carry dark fallbacks — recolor for light */
  'html[data-theme="light"] .lux-modal{background:linear-gradient(168deg,#FDFBF7,#F5EFE5);border-color:#E4DACA;}',
  'html[data-theme="light"] .lux-h{background:#FBF7F0;border-bottom-color:#E4DACA;}',
  'html[data-theme="light"] .lux-h h3{color:#2E241B;}',
  'html[data-theme="light"] .lux-h .x{color:#8D8172;}',
  'html[data-theme="light"] .lux-b .lux-lead{color:#8D8172;}',
  'html[data-theme="light"] .lux-f input,html[data-theme="light"] .lux-f select,html[data-theme="light"] .lux-f textarea{background:#FFFFFF;border-color:#E4DACA;color:#2E241B;}',
  'html[data-theme="light"] .lux-row{border-bottom-color:rgba(0,0,0,.06);}',
  'html[data-theme="light"] .lux-row .k{color:#8D8172;} html[data-theme="light"] .lux-row .v{color:#2E241B;}',
  'html[data-theme="light"] .lux-toast{background:#FDFBF7;border-color:#C9AC7E;color:#8A6B3F;box-shadow:0 12px 34px rgba(59,47,43,.18);}',
  'html[data-theme="light"] .lux-toast.ok{border-color:#557F4F;color:#476B42;}',
  'html[data-theme="light"] .lux-toast.err{border-color:#B0604E;color:#9A4F3E;}',
  'html[data-theme="light"] .lux-menu{background:#FDFBF7;border-color:#E4DACA;box-shadow:0 16px 40px rgba(59,47,43,.18);}',
  'html[data-theme="light"] .lux-menu button{color:#3B2F2B;}',
  'html[data-theme="light"] .lux-seg button{background:#FFFFFF;border-color:#E4DACA;color:#8D8172;}',
  'html[data-theme="light"] .lux-chip{background:#FFFFFF;border-color:#E4DACA;color:#3B2F2B;}',
  'html[data-theme="light"] .lux-ck{background:#FFFFFF;}',
  /* theme toggle button */
  '.luma-theme-btn{position:fixed;bottom:22px;left:22px;z-index:9500;width:46px;height:46px;border-radius:50%;',
  '  background:var(--surface,#15141A);border:1px solid var(--gold-deep,#846a38);color:var(--gold-light,#ccab64);',
  '  display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.35);',
  '  transition:transform .2s,filter .2s;}',
  '.luma-theme-btn:hover{transform:translateY(-2px);filter:brightness(1.1);}',
  'html.luma-anim, html.luma-anim body, html.luma-anim *{transition:background-color .35s ease,color .35s ease,border-color .35s ease,fill .35s ease !important;}',
  ].join('\n');

  var st=document.createElement('style');st.id='luma-theme-css';st.textContent=css;
  document.head.appendChild(st);

  var SUN='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';
  var MOON='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 14.2A8.8 8.8 0 019.8 3.4a8.8 8.8 0 1010.8 10.8z"/></svg>';

  function ready(fn){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn();}
  ready(function(){
    var b=document.createElement('button');
    b.className='luma-theme-btn';b.setAttribute('onclick',';');/* keep luma-ui delegation away */
    function paint(){
      var light=document.documentElement.dataset.theme==='light';
      b.innerHTML=light?MOON:SUN;
      b.title=light?'التبديل إلى الوضع الداكن':'التبديل إلى الوضع الفاتح';
    }
    b.addEventListener('click',function(){
      var next=document.documentElement.dataset.theme==='light'?'dark':'light';
      document.documentElement.classList.add('luma-anim');
      document.documentElement.dataset.theme=next;
      try{localStorage.setItem(KEY,next);}catch(e){}
      paint();
      setTimeout(function(){document.documentElement.classList.remove('luma-anim');},420);
    });
    paint();
    document.body.appendChild(b);
  });
})();
