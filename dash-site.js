/* LUMA dashboard — "موقعي التعريفي" professional page builder (overrides basic S.site) */
(function(){
  const S = window.LUMA_SCREENS = window.LUMA_SCREENS || {};

  /* curated luxury palettes */
  const PALS = {
    gold:    {name:'ذهبي كلاسيك', sw:['#ccab64','#9c8047','#1b1a21'], bg:'#131217', surf:'#221b13', soft:'#201f26', acc:'#ccab64', acc2:'#9c8047', txt:'#f6f2ec', sub:'#e6ce95', line:'#3a2f1f', tile:'linear-gradient(150deg,#2a2218,#131217)', dark:true},
    rose:    {name:'وردي هادئ', sw:['#dda5ab','#b87f86','#271c20'], bg:'#1b1416', surf:'#271c20', soft:'#31242a', acc:'#dda5ab', acc2:'#b87f86', txt:'#f7eff1', sub:'#d6bcc0', line:'#3a2c33', tile:'linear-gradient(150deg,#31242a,#1a1214)', dark:true},
    emerald: {name:'أخضر زمردي', sw:['#86b89a','#5f8a6f','#17211c'], bg:'#0f1613', surf:'#17211c', soft:'#1f2c25', acc:'#8fc1a1', acc2:'#5f8a6f', txt:'#eef5f0', sub:'#b6cfbf', line:'#26352c', tile:'linear-gradient(150deg,#1f2c25,#0d1410)', dark:true},
    plum:    {name:'بنفسجي ملكي', sw:['#bf9bd1','#9472a8','#221b29'], bg:'#16121b', surf:'#221b29', soft:'#2b2235', acc:'#c4a2d6', acc2:'#9472a8', txt:'#f4eff7', sub:'#cdbcd8', line:'#312640', tile:'linear-gradient(150deg,#2b2235,#140f1a)', dark:true},
    sand:    {name:'رملي فاتح', sw:['#b0894f','#8a6a39','#efe7d8'], bg:'#f4efe5', surf:'#fbf8f1', soft:'#efe7d8', acc:'#a9824a', acc2:'#876534', txt:'#2a2418', sub:'#7c7160', line:'#e6dccb', tile:'linear-gradient(150deg,#ece2d0,#f7f1e6)', dark:false},
  };
  const LAYOUTS=[['classic','كلاسيك'],['minimal','مينيمال'],['cards','بطاقات']];
  const COVERS=[['gradient','متدرّج'],['solid','لون ثابت'],['pattern','نقشة']];
  const FONTS=[['serif','كلاسيكي'],['modern','عصري']];
  const SEC=[['about','نبذة تعريفية'],['services','الخدمات والأسعار'],['gallery','معرض الأعمال'],['reviews','التقييمات'],['gift','بطاقات الإهداء'],['faq','الأسئلة الشائعة']];

  function defaults(){return {palette:'gold',layout:'classic',cover:'gradient',font:'serif',sections:{about:true,services:true,gallery:true,reviews:true,gift:false,faq:false}};}
  function state(){ if(!window.__siteState){ try{window.__siteState=JSON.parse(localStorage.getItem('luma_site'))||defaults();}catch(e){window.__siteState=defaults();} } return window.__siteState; }
  function save(){ try{localStorage.setItem('luma_site',JSON.stringify(state()));}catch(e){} }

  /* ── live preview builder ── */
  function buildPreview(st){
    const p = PALS[st.palette];
    const hf = st.font==='serif' ? "'Bodoni Moda',serif" : "'IBM Plex Sans Arabic','Cairo',sans-serif";
    const hw = st.font==='serif' ? '500' : '700';
    const card = st.layout==='cards';
    const mini = st.layout==='minimal';
    const pad = mini ? 26 : 20;

    let cover;
    if(st.cover==='gradient') cover = `radial-gradient(120% 90% at 50% -10%, ${p.acc2}44, ${p.surf} 62%)`;
    else if(st.cover==='solid') cover = p.surf;
    else cover = p.surf; // pattern handled by overlay
    const patternOverlay = st.cover==='pattern' ? `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:${p.dark?0.5:0.35}"><rect width="100%" height="100%" fill="url(#sp-${st.palette})"/></svg>` : '';

    const sep = `<div style="height:1px;background:${p.line};margin:${mini?22:16}px 0"></div>`;
    function head(t){
      if(mini) return `<div style="font-family:${hf};font-weight:${hw};font-size:17px;color:${p.txt};text-align:center;letter-spacing:0.02em;margin-bottom:14px">${t}</div>`;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:13px"><span style="font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:0.16em;color:${p.acc2};direction:ltr">◆</span><span style="font-family:${hf};font-weight:${hw};font-size:16px;color:${p.txt}">${t}</span></div>`;
    }
    function wrap(inner){ return card ? `<div style="background:${p.surf};border:1px solid ${p.line};border-radius:14px;padding:${pad}px;margin-bottom:14px">${inner}</div>` : `<div style="margin-bottom:${mini?28:22}px">${inner}</div>`; }

    const tiles = (n)=>`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px">${Array.from({length:n}).map(()=>`<div style="aspect-ratio:1;border-radius:9px;background:${p.tile};border:1px solid ${p.line};display:flex;align-items:center;justify-content:center;color:${p.acc2};font-size:15px">◆</div>`).join('')}</div>`;

    const SVC=[['مكياج عروس كامل','١٢٠ د','850'],['مكياج سهرة','٦٠ د','350'],['مكياج ناعم','٤٥ د','250']];
    const svcRows = SVC.map((s,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;${i<2?`border-bottom:1px solid ${p.line}`:''}"><div><div style="font-size:13.5px;color:${p.txt};font-weight:500">${s[0]}</div><div style="font-size:11px;color:${p.sub}">◷ ${s[1]}</div></div><div style="font-family:'Bodoni Moda',serif;font-size:19px;color:${p.acc};direction:ltr">${s[2]} <span style="font-family:'IBM Plex Sans Arabic',Cairo;font-size:10px;color:${p.sub}">ر.س</span></div></div>`).join('');

    const stars = `<span style="color:${p.acc};font-size:12px;letter-spacing:1px">★★★★★</span>`;
    const REV=[['منى','احترافية عالية ونتيجة مبهرة فاقت توقعاتي.'],['هند','في الموعد بالضبط ولمسة راقية تدوم.']];
    const revBlocks = REV.map((r,i)=>`<div style="${i?`margin-top:13px;padding-top:13px;border-top:1px solid ${p.line}`:''}"><div style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><span style="width:24px;height:24px;border-radius:50%;background:${p.soft};border:0.5px solid ${p.line};display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:12px;color:${p.acc}">${r[0].charAt(0)}</span><span style="font-size:12.5px;color:${p.txt};font-weight:500">${r[0]}</span></div>${stars}</div><div style="font-size:12px;color:${p.sub};line-height:1.7;margin-top:7px">${r[1]}</div></div>`).join('');

    const FAQ=[['كم مدة الجلسة؟','تختلف حسب الخدمة، من ٤٥ إلى ١٢٠ دقيقة.'],['هل يوجد دفع مسبق؟','نعم، لتأكيد الموعد عبر mada أو Apple Pay.']];
    const faqRows = FAQ.map((f,i)=>`<div style="padding:11px 0;${i<1?`border-bottom:1px solid ${p.line}`:''}"><div style="font-size:13px;color:${p.txt};font-weight:500">${f[0]}</div><div style="font-size:11.5px;color:${p.sub};margin-top:4px;line-height:1.6">${f[1]}</div></div>`).join('');

    let body='';
    if(st.sections.about) body += wrap(head('نبذة')+`<div style="font-size:13px;color:${p.sub};line-height:1.9;text-align:${mini?'center':'right'}">متخصصة في مكياج العرائس والسهرات بلمسة ناعمة تُبرز ملامحكِ الطبيعية. خبرة ٨ سنوات في أرقى مناسبات جدة.</div>`);
    if(st.sections.services) body += wrap(head('الخدمات والأسعار')+svcRows);
    if(st.sections.gallery) body += wrap(head('معرض الأعمال')+tiles(6));
    if(st.sections.reviews) body += wrap(head('التقييمات')+revBlocks);
    if(st.sections.gift) body += wrap(`<div style="text-align:center;padding:6px 0"><div style="font-family:${hf};font-weight:${hw};font-size:15px;color:${p.txt}">أهدي من تحبّين</div><div style="font-size:11.5px;color:${p.sub};margin:6px 0 12px">بطاقة إهداء بقيمة من اختيارك</div><div style="display:inline-block;border:1px solid ${p.acc2};color:${p.acc};font-size:11.5px;padding:8px 18px;border-radius:20px">شراء بطاقة</div></div>`);
    if(st.sections.faq) body += wrap(head('الأسئلة الشائعة')+faqRows);

    const btnText = p.dark ? p.bg : '#fff';
    const nameSize = mini ? 19 : 21;
    return `
      <svg style="position:absolute;width:0;height:0"><defs><pattern id="sp-${st.palette}" width="56" height="56" patternUnits="userSpaceOnUse"><g fill="none" stroke="${p.acc2}" stroke-width="1"><circle cx="0" cy="0" r="28"/><circle cx="56" cy="0" r="28"/><circle cx="0" cy="56" r="28"/><circle cx="56" cy="56" r="28"/><circle cx="28" cy="28" r="28"/></g></pattern></defs></svg>
      <div style="background:${p.bg};color:${p.txt};min-height:100%;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:300">
        <div style="position:relative;height:120px;background:${cover};overflow:hidden">${patternOverlay}</div>
        <div style="padding:0 ${pad}px ${pad}px;margin-top:-46px;position:relative">
          <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
            <div style="width:84px;height:84px;border-radius:50%;background:${p.soft};border:2px solid ${p.acc};display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:38px;color:${p.acc};box-shadow:0 8px 24px rgba(0,0,0,${p.dark?0.5:0.15})">ر</div>
            <div style="font-family:${hf};font-weight:${hw};font-size:${nameSize}px;color:${p.txt};margin-top:12px">رهف · استوديو مكياج</div>
            <div style="font-size:12.5px;color:${p.acc};margin-top:3px">خبيرة مكياج · جدة</div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${p.sub};margin-top:7px">${stars} <b style="color:${p.txt};font-weight:600">4.9</b> · ٢١٣ حجز</div>
            <div style="width:100%;background:${p.acc};color:${btnText};font-family:'IBM Plex Sans Arabic',Cairo;font-weight:600;font-size:14px;text-align:center;padding:13px;border-radius:11px;margin-top:16px">احجزي الآن</div>
          </div>
          ${sep}
          ${body}
        </div>
      </div>`;
  }

  /* ── interactivity ── */
  window.__site = {
    pick(group,val,el){ state()[group]=val; if(el){[...el.parentElement.children].forEach(c=>c.classList.remove('on'));el.classList.add('on');} save(); this.refresh(); },
    toggle(id,el){ const s=state(); s.sections[id]=!s.sections[id]; el.classList.toggle('on',s.sections[id]); el.classList.toggle('off',!s.sections[id]); save(); this.refresh(); },
    refresh(){ const h=document.getElementById('site-preview'); if(h) h.innerHTML=buildPreview(state()); }
  };

  S.site = {
    render(){
      const st = state();
      const palCards = Object.keys(PALS).map(k=>{
        const p=PALS[k]; const on=st.palette===k?'on':'';
        const sw=p.sw.map(c=>`<span style="flex:1;background:${c}"></span>`).join('');
        return `<button class="pal ${on}" onclick="__site.pick('palette','${k}',this)"><span class="strip">${sw}</span><span class="pn">${p.name}</span></button>`;
      }).join('');
      const seg=(group,opts)=>`<div class="seg">${opts.map(o=>`<button class="${st[group]===o[0]?'on':''}" onclick="__site.pick('${group}','${o[0]}',this)">${o[1]}</button>`).join('')}</div>`;
      const toggles = SEC.map(s=>{const on=st.sections[s[0]];return `<div class="sec-row"><span class="drag">⋮⋮</span><span class="nm">${s[1]}</span><button class="toggle ${on?'on':'off'}" onclick="__site.toggle('${s[0]}',this)"><span class="k"></span></button></div>`;}).join('');
      return `
<style>
  .sb-wrap{display:grid;grid-template-columns:400px 1fr;gap:26px;align-items:start;}
  @media(max-width:1080px){.sb-wrap{grid-template-columns:1fr;}}
  .sb-ctrl{display:flex;flex-direction:column;gap:18px;}
  .ctrl-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;}
  .ctrl-card .ct{font-size:13.5px;font-weight:600;color:var(--white);margin-bottom:14px;display:flex;align-items:center;gap:9px;}
  .ctrl-card .ct .i{color:var(--gold-light);display:flex;}
  .pal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .pal{display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--bg);border:1px solid var(--line);border-radius:12px;cursor:pointer;transition:border-color .2s,transform .2s;}
  .pal:hover{transform:translateY(-2px);}
  .pal.on{border-color:var(--gold-light);box-shadow:0 0 0 1px var(--gold-light);}
  .pal .strip{display:flex;height:30px;border-radius:7px;overflow:hidden;border:0.5px solid var(--line);}
  .pal .pn{font-size:12px;color:var(--cream);text-align:center;}
  .pal.on .pn{color:var(--gold-light);}
  .seg{display:flex;gap:5px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:4px;}
  .seg button{flex:1;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12.5px;color:var(--muted);background:none;border:none;padding:9px 8px;border-radius:7px;cursor:pointer;transition:all .2s;}
  .seg button.on{background:linear-gradient(120deg,#dbbd81,#9c8047);color:#131217;font-weight:600;}
  .sec-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line-soft);}
  .sec-row:last-child{border-bottom:none;}
  .sec-row .drag{color:var(--muted-deep);cursor:grab;font-size:13px;letter-spacing:-2px;}
  .sec-row .nm{flex:1;font-size:14px;color:var(--cream);}
  .sb-preview{display:flex;flex-direction:column;align-items:center;gap:16px;position:sticky;top:90px;}
  .phone{width:330px;height:680px;border-radius:42px;background:#0c0b0e;border:1px solid var(--line);padding:11px;box-shadow:0 30px 80px rgba(0,0,0,0.5);position:relative;}
  .phone .notch{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:120px;height:26px;background:#0c0b0e;border-radius:0 0 16px 16px;z-index:5;}
  .phone .scr{width:100%;height:100%;border-radius:32px;overflow:hidden;position:relative;}
  .phone .scr-inner{width:100%;height:100%;overflow-y:auto;}
  .phone .scr-inner::-webkit-scrollbar{width:0;}
  .url-bar{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:5px 5px 5px 14px;width:330px;}
  .url-bar .u{flex:1;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-light);direction:ltr;text-align:left;}
</style>
<div class="sb-wrap">
  <div class="sb-ctrl">
    <div class="ctrl-card">
      <div class="ct"><span class="i">${icon('globe',17)}</span> الهوية اللونية</div>
      <div class="pal-grid">${palCards}</div>
    </div>
    <div class="ctrl-card">
      <div class="ct">نمط التخطيط</div>
      ${seg('layout',LAYOUTS)}
      <div class="ct" style="margin-top:18px">شكل الغلاف</div>
      ${seg('cover',COVERS)}
      <div class="ct" style="margin-top:18px">خط العناوين</div>
      ${seg('font',FONTS)}
    </div>
    <div class="ctrl-card">
      <div class="ct">أقسام الصفحة <span style="font-size:11px;color:var(--muted);font-weight:300;margin-right:auto">اسحبي لإعادة الترتيب</span></div>
      ${toggles}
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn btn-gold" style="flex:1;justify-content:center">حفظ ونشر</button>
      <button class="btn btn-ghost">معاينة كاملة</button>
    </div>
  </div>
  <div class="sb-preview">
    <div class="url-bar"><span class="u">luma.sa/rahaf</span><button class="btn btn-ghost" style="padding:8px 14px">نسخ</button><button class="btn btn-gold" style="padding:8px 14px">مشاركة</button></div>
    <div class="phone"><div class="notch"></div><div class="scr"><div class="scr-inner" id="site-preview"></div></div></div>
    <div style="font-size:12px;color:var(--muted)">معاينة حيّة · هكذا تظهر صفحتك للعميلات</div>
  </div>
</div>`;
    },
    init(){ window.__site.refresh(); }
  };
})();
