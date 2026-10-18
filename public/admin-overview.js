/* LUMA admin — Platform Overview */
(function(){
  const A = window.LUMA_ADMIN = window.LUMA_ADMIN || {};

  const STATS=[
    {icon:'wallet', k:'إجمالي المبيعات (GMV)', val:'412,600', unit:'ر.س', delta:'+18%', up:true},
    {icon:'commission', k:'إيراد المنصة', val:'58,900', unit:'ر.س', delta:'+22%', up:true},
    {icon:'users', k:'مزوّدو الخدمة النشطون', val:'164', unit:'', delta:'+12', up:true},
    {icon:'calendar', k:'حجوزات هذا الشهر', val:'1,847', unit:'', delta:'+9%', up:true},
  ];

  /* platform revenue: subscriptions + commissions, last 7 months (k SAR) */
  const REV=[
    {m:'مارس',sub:14,com:9},{m:'أبريل',sub:18,com:11},{m:'مايو',sub:21,com:13},
    {m:'يونيو',sub:26,com:16},{m:'يوليو',sub:31,com:20},{m:'أغسطس',sub:36,com:23},{m:'سبتمبر',sub:40,com:24},
  ];
  const TIERS=[['فَرِيد',28,'#dbbd81'],['وَهَج',86,'#ccab64'],['سَناء',50,'#9c8047']];
  const TIER_TOTAL=164;

  const NEWP=[
    {n:'غادة الفيفي', c:'مصوّرة · جازان', tier:'وَهَج', when:'اليوم', st:'بانتظار التوثيق', stc:'gold'},
    {n:'ريم العنزي', c:'فنية رموش · الدمام', tier:'فَرِيد', when:'أمس', st:'موثّقة', stc:'green'},
    {n:'هند المالكي', c:'أخصائية بشرة · جازان', tier:'سَناء', when:'قبل يومين', st:'موثّقة', stc:'green'},
    {n:'وجدان الحربي', c:'خبيرة شعر · جدة', tier:'وَهَج', when:'قبل ٣ أيام', st:'موثّقة', stc:'green'},
  ];
  const PAYS=[
    {n:'رهف العتيبي', t:'تحويل أرباح', a:17150, dir:'out', when:'اليوم'},
    {n:'دانة الشهري', t:'اشتراك وَهَج', a:399, dir:'in', when:'اليوم'},
    {n:'سارة الغامدي', t:'عمولة حجز', a:48, dir:'in', when:'اليوم'},
    {n:'لمياء الزهراني', t:'اشتراك فَرِيد', a:799, dir:'in', when:'أمس'},
  ];
  const ALERTS=[
    {ic:'users', c:'gold', t:'٧ مزوّدات بانتظار التوثيق', d:'راجع طلبات الانضمام الجديدة', cta:'مراجعة', go:'providers'},
    {ic:'wallet', c:'soft', t:'١٢ تحويل أرباح مجدول اليوم', d:'بإجمالي 84,200 ر.س', cta:'المدفوعات', go:'payments'},
    {ic:'star', c:'soft', t:'٣ بلاغات بحاجة لمراجعة', d:'تقييمات أو محتوى مُبلّغ عنه', cta:'عرض', go:'providers'},
  ];

  function revChart(){
    const W=640,H=240,pad={t:18,r:12,b:32,l:34},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,max=70,step=iw/REV.length,bw=Math.min(30,step*0.42);
    let grid='';
    for(let g=0;g<=4;g++){const y=pad.t+ih-(g/4)*ih;grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#26242d" stroke-width="1" stroke-dasharray="2 4"/><text x="${pad.l-7}" y="${y+4}" fill="#58545f" font-size="9.5" font-family="IBM Plex Mono" text-anchor="end">${((g/4)*max).toFixed(0)}</text>`;}
    let bars=REV.map((d,i)=>{
      const x=pad.l+i*step+(step-bw)/2;
      const hs=(d.sub/max)*ih, hc=(d.com/max)*ih;
      const yb=pad.t+ih-hs, yc=yb-hc;
      return `<g><rect x="${x}" y="${yb}" width="${bw}" height="${hs}" rx="3" fill="url(#gsub)"/><rect x="${x}" y="${yc}" width="${bw}" height="${hc}" rx="3" fill="url(#gcom)"/><text x="${x+bw/2}" y="${H-12}" fill="#86818d" font-size="10" font-family="IBM Plex Sans Arabic" text-anchor="middle">${d.m}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible"><defs>
      <linearGradient id="gsub" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c8047"/><stop offset="1" stop-color="#6e5526"/></linearGradient>
      <linearGradient id="gcom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbbd81"/><stop offset="1" stop-color="#caa85f"/></linearGradient>
    </defs>${grid}${bars}</svg>`;
  }
  function donut(){
    const r=52,c=2*Math.PI*r; let off=0; const segs=TIERS.map(t=>{const frac=t[1]/TIER_TOTAL;const seg=`<circle cx="70" cy="70" r="${r}" fill="none" stroke="${t[2]}" stroke-width="16" stroke-dasharray="${(frac*c).toFixed(1)} ${c}" stroke-dashoffset="${(-off*c).toFixed(1)}" transform="rotate(-90 70 70)"/>`;off+=frac;return seg;}).join('');
    return `<svg width="140" height="140" viewBox="0 0 140 140">${segs}<text x="70" y="66" fill="#f6f2ec" font-size="26" font-family="Cormorant Garamond" font-weight="500" text-anchor="middle">${TIER_TOTAL}</text><text x="70" y="86" fill="#86818d" font-size="11" font-family="IBM Plex Sans Arabic" text-anchor="middle">مشترك</text></svg>`;
  }

  A.overview = { render(){ return `
<style>
  .ov-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
  @media(max-width:1180px){.ov-grid{grid-template-columns:1fr 1fr;}}
  .ov-main{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:24px;align-items:start;}
  @media(max-width:1180px){.ov-main{grid-template-columns:1fr;}}
  .ov-row{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;align-items:start;}
  @media(max-width:1180px){.ov-row{grid-template-columns:1fr;}}
  .ov-hi{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
  .ov-hi .t{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:600;font-size:17px;color:var(--white);}
  .ov-hi .s{font-size:12.5px;color:var(--muted);margin-top:2px;}
  .legend{display:flex;gap:16px;flex-wrap:wrap;}
  .legend .lg{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--cream);}
  .legend .lg .sw{width:11px;height:11px;border-radius:3px;}
  .donut-wrap{display:flex;align-items:center;gap:18px;}
  .donut-leg{display:flex;flex-direction:column;gap:11px;flex:1;}
  .donut-leg .r{display:flex;align-items:center;gap:10px;}
  .donut-leg .r .sw{width:11px;height:11px;border-radius:3px;}
  .donut-leg .r .nm{flex:1;font-size:13.5px;color:var(--white);}
  .donut-leg .r .v{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--gold-pale);direction:ltr;}
  .row-item{display:flex;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid var(--line-soft);}
  .row-item:last-child{border-bottom:none;}
  .row-item .av{width:38px;height:38px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:16px;flex-shrink:0;}
  .row-item .ti{flex:1;min-width:0;} .row-item .ti .n{font-size:14px;color:var(--white);font-weight:500;} .row-item .ti .s{font-size:12px;color:var(--muted);}
  .row-item .when{font-size:11.5px;color:var(--muted-deep);}
  .pay .amt{font-family:'Bodoni Moda',serif;font-size:18px;direction:ltr;}
  .pay .amt.in{color:var(--green);} .pay .amt.out{color:var(--gold-light);}
  .ic-box{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .ic-box.gold{background:rgba(156,124,58,0.16);color:var(--gold-light);border:0.5px solid var(--gold-deep);}
  .ic-box.soft{background:var(--surface3);color:var(--gold-pale);border:0.5px solid var(--line);}
  .alert{display:flex;align-items:flex-start;gap:13px;padding:14px 0;border-bottom:1px solid var(--line-soft);}
  .alert:last-child{border-bottom:none;}
  .alert .tx{flex:1;} .alert .tx .t{font-size:13.8px;color:var(--white);font-weight:500;} .alert .tx .d{font-size:12px;color:var(--muted);margin-top:2px;}
  .alert .go{font-size:12px;color:var(--gold-light);border:0.5px solid var(--gold-deep);border-radius:20px;padding:6px 13px;cursor:pointer;white-space:nowrap;transition:all .25s;}
  .alert .go:hover{background:var(--gold-light);color:#131217;}
</style>
<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:16px">
  <div>
    <div style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:600;font-size:26px;color:var(--white)">لوحة تحكّم المنصة <span style="color:var(--gold-light)">◈</span></div>
    <div style="font-size:14px;color:var(--gold-pale);margin-top:2px">نمو الإيراد <b style="color:var(--green);font-weight:600">+22%</b> هذا الشهر · ٧ مزوّدات بانتظار التوثيق.</div>
  </div>
  <div style="display:flex;gap:10px"><button class="btn btn-ghost" onclick="ADMIN.go('analytics')">${icon('trend',16)} التحليلات</button><button class="btn btn-gold" onclick="ADMIN.go('providers')">إدارة المزوّدين</button></div>
</div>
<div class="ov-grid">
  ${STATS.map(s=>`<div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon(s.icon,19)}</div><div class="delta ${s.up?'up':'down'}">${s.up?'▲':'▼'} ${s.delta}</div></div><div class="val">${s.val}${s.unit?`<span class="u">${s.unit}</span>`:''}</div><div class="k">${s.k}</div></div>`).join('')}
</div>
<div class="ov-main">
  <div class="card">
    <div class="ov-hi"><div><div class="t">إيراد المنصة</div><div class="s">اشتراكات + عمولات · آخر ٧ أشهر (بالألف ر.س)</div></div>
      <div class="legend"><span class="lg"><span class="sw" style="background:#dbbd81"></span> عمولات</span><span class="lg"><span class="sw" style="background:#9c8047"></span> اشتراكات</span></div></div>
    ${revChart()}
  </div>
  <div class="card">
    <div class="sec-label">الإشعارات الحية <span class="ln"></span><span style="font-size:10.5px;color:var(--muted)">كل حجز أو عملية تحدث بالمنصة</span></div>
    ${(()=>{
      const NTFI={booking:'calendar',pay:'wallet',order:'box',review:'star',hr:'users',block:'gear'};
      const evs=(window.LumaEvents?LumaEvents.list():[]).slice(0,6);
      return evs.length
        ?evs.map(e=>`<div class="alert" ${e.href?`style="cursor:pointer" onclick="LumaEvents.markRead();location.href='${e.href}'" title="فتح صفحة الحدث"`:''}><div class="ic-box gold">${icon(NTFI[e.type]||'pulse',18)}</div><div class="tx"><div class="t" style="font-weight:400;font-size:12.5px;line-height:1.7">${e.msg}</div><div class="d">${LumaEvents.ago(e.at)}</div></div>${e.href?'<div class="go">فتح</div>':''}</div>`).join('')
        :'<div style="font-size:12px;color:var(--muted);padding:8px 0 14px;line-height:1.9">لا إشعارات بعد — أي حجز أو دفعة أو تقييم أو طلب يحدث بالمنصة سيظهر هنا فوراً.</div>';
    })()}
    <div class="sec-label" style="margin-top:14px">تنبيهات تشغيلية <span class="ln"></span></div>
    ${ALERTS.map(a=>`<div class="alert"><div class="ic-box ${a.c}">${icon(a.ic,18)}</div><div class="tx"><div class="t">${a.t}</div><div class="d">${a.d}</div></div><div class="go" onclick="ADMIN.go('${a.go}')">${a.cta}</div></div>`).join('')}
  </div>
</div>
<div class="ov-row">
  <div class="card">
    <div class="ov-hi"><div><div class="t">المشتركون حسب الباقة</div><div class="s">إجمالي ١٦٤ مزوّد نشط</div></div></div>
    <div class="donut-wrap">${donut()}<div class="donut-leg">${TIERS.map(t=>`<div class="r"><span class="sw" style="background:${t[2]}"></span><span class="nm">${t[0]}</span><span class="v">${t[1]} · ${(t[1]/TIER_TOTAL*100).toFixed(0)}%</span></div>`).join('')}</div></div>
  </div>
  <div class="card">
    <div class="ov-hi" style="margin-bottom:6px"><div><div class="t">أحدث المزوّدات</div><div class="s">طلبات انضمام جديدة</div></div><span class="sec-label" style="margin:0"><span class="more" onclick="ADMIN.go('providers')">عرض الكل ←</span></span></div>
    ${NEWP.map(p=>`<div class="row-item"><div class="av">${p.n.charAt(0)}</div><div class="ti"><div class="n">${p.n} <span class="badge soft" style="margin-right:5px">${p.tier}</span></div><div class="s">${p.c}</div></div><span class="badge ${p.stc}">${p.st}</span></div>`).join('')}
  </div>
</div>
<div class="card" style="margin-top:18px">
  <div class="ov-hi" style="margin-bottom:6px"><div><div class="t">آخر العمليات المالية</div><div class="s">مدفوعات وتحويلات اليوم</div></div><span class="sec-label" style="margin:0"><span class="more" onclick="ADMIN.go('payments')">عرض الكل ←</span></span></div>
  ${PAYS.map(p=>`<div class="row-item pay"><div class="av">${p.n.charAt(0)}</div><div class="ti"><div class="n">${p.n}</div><div class="s">${p.t} · ${p.when}</div></div><div class="amt ${p.dir}">${p.dir==='in'?'+':'−'}${p.a.toLocaleString('en')} ر.س</div></div>`).join('')}
</div>`; }};
})();
