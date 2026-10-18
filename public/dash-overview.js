/* LUMA dashboard — Overview screen */
(function(){
  const fmt = n => n.toLocaleString('en-US');

  const STATS = [
    {icon:'wallet', k:'أرباح هذا الشهر', val:'18,400', unit:'ر.س', delta:'+12%', up:true},
    {icon:'calendar', k:'حجوزات هذا الشهر', val:'47', unit:'حجز', delta:'+8', up:true},
    {icon:'star', k:'متوسط التقييم', val:'4.9', unit:'/ 5', delta:'213 تقييم', up:true},
    {icon:'users', k:'عميلات جديدات', val:'12', unit:'', delta:'+3', up:true},
  ];

  const CHART = [
    {m:'مارس', v:9.2}, {m:'أبريل', v:11.0}, {m:'مايو', v:10.4},
    {m:'يونيو', v:13.5}, {m:'يوليو', v:15.2}, {m:'أغسطس', v:16.8}, {m:'سبتمبر', v:18.4},
  ];

  const APPTS = [
    {t:'10:00 ص', n:'سارة الأحمدي', s:'مكياج سهرة', st:'مؤكد', stc:'green'},
    {t:'1:00 م', n:'نوف العتيبي', s:'مكياج عروس كامل', st:'مؤكد', stc:'green'},
    {t:'4:30 م', n:'ريم الزهراني', s:'مكياج ناعم', st:'بانتظار الدفع', stc:'gold'},
    {t:'7:00 م', n:'دانة السالم', s:'جلسة تعليمية', st:'مؤكد', stc:'green'},
  ];

  const REVIEWS = [
    {n:'منى العتيبي', r:5, txt:'احترافية عالية ونتيجة مبهرة، تجربة تستحق كل ريال.', ago:'قبل يومين'},
    {n:'هند المالكي', r:5, txt:'في الموعد بالضبط، ولمسة راقية. أنصح بها بشدة.', ago:'قبل ٤ أيام'},
    {n:'لمى السبيعي', r:4, txt:'تجربة ممتازة بشكل عام وأجواء مريحة.', ago:'قبل أسبوع'},
  ];

  const TASKS = [
    {ic:'loyalty', c:'gold', t:'اقتربتِ من حدّ الحجوزات في باقتك', d:'٤٧ من ٥٠ حجزة — فكّري بالترقية إلى فَرِيد', cta:'ترقية'},
    {ic:'calendar', c:'soft', t:'٣ عميلات بانتظار تأكيد الموعد', d:'راجعي قائمة الحجوزات المعلّقة', cta:'مراجعة'},
    {ic:'star', c:'soft', t:'تقييمان جديدان بانتظار ردّك', d:'الردّ على التقييمات يرفع ظهورك', cta:'الردّ'},
  ];

  const CHECK = [
    {t:'صورة الملف الشخصي', done:true},
    {t:'النبذة التعريفية', done:true},
    {t:'ربط الخدمات والأسعار', done:true},
    {t:'معرض الأعمال (٢٠ صورة)', done:true},
    {t:'ربط Google Calendar', done:false},
    {t:'تفعيل واتساب التلقائي', done:false},
  ];

  function chartSVG(){
    const W=620, H=240, pad={t:20,r:10,b:34,l:38};
    const iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
    const max=20, step=iw/CHART.length;
    const bw=Math.min(38, step*0.5);
    let grid='';
    for(let g=0;g<=4;g++){const y=pad.t+ih-(g/4)*ih;const lbl=(g/4)*max;grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#26242d" stroke-width="1" stroke-dasharray="2 4"/><text x="${pad.l-8}" y="${y+4}" fill="#58545f" font-size="10" font-family="IBM Plex Mono" text-anchor="end">${lbl}</text>`;}
    let bars=CHART.map((d,i)=>{
      const x=pad.l+i*step+(step-bw)/2;
      const h=(d.v/max)*ih; const y=pad.t+ih-h;
      const last=i===CHART.length-1;
      return `<g class="bar">
        <rect x="${x}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/>
        <rect class="b" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="url(#barg${last?'2':''})" />
        <text x="${x+bw/2}" y="${H-14}" fill="${last?'#ccab64':'#86818d'}" font-size="10.5" font-family="IBM Plex Sans Arabic" text-anchor="middle">${d.m}</text>
        ${last?`<text x="${x+bw/2}" y="${y-9}" fill="#ccab64" font-size="12" font-family="IBM Plex Mono" text-anchor="middle">18.4k</text>`:''}
      </g>`;}).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible">
      <defs>
        <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#846a38"/><stop offset="1" stop-color="#5a4624"/></linearGradient>
        <linearGradient id="barg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbbd81"/><stop offset="1" stop-color="#9c8047"/></linearGradient>
      </defs>
      ${grid}${bars}
    </svg>`;
  }

  function stars(r){let s='';for(let i=1;i<=5;i++)s+=`<span style="color:${i<=r?'#ccab64':'#26242d'}">★</span>`;return s;}

  window.LUMA_SCREENS = window.LUMA_SCREENS || {};
  window.LUMA_SCREENS.overview = {
    render(){
      return `
<style>
  .ov-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
  @media(max-width:1180px){.ov-grid{grid-template-columns:1fr 1fr;}}
  .ov-main{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:24px;align-items:start;}
  @media(max-width:1180px){.ov-main{grid-template-columns:1fr;}}
  .ov-row{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;align-items:start;}
  @media(max-width:1180px){.ov-row{grid-template-columns:1fr;}}
  .ov-hi{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;}
  .ov-hi .lt .t{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:600;font-size:17px;color:var(--white);}
  .ov-hi .lt .s{font-size:12.5px;color:var(--muted);margin-top:2px;}
  .ov-hi .tabs{display:flex;gap:6px;background:var(--surface3);border-radius:9px;padding:4px;}
  .ov-hi .tabs button{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12px;color:var(--muted);background:none;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;transition:all .2s;}
  .ov-hi .tabs button.on{background:var(--surface);color:var(--gold-light);}
  .chart-wrap .bar:hover .b{fill:url(#barg2);}
  .appt{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--line-soft);}
  .appt:last-child{border-bottom:none;}
  .appt .time{font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:var(--gold-light);direction:ltr;min-width:62px;text-align:center;}
  .appt .vline{width:1px;height:34px;background:var(--line);}
  .appt .who{flex:1;}
  .appt .who .n{font-size:14.5px;color:var(--white);font-weight:500;}
  .appt .who .s{font-size:12.5px;color:var(--muted);margin-top:1px;}
  .rev{padding:15px 0;border-bottom:1px solid var(--line-soft);}
  .rev:last-child{border-bottom:none;}
  .rev .top{display:flex;align-items:center;justify-content:space-between;}
  .rev .top .nm{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--white);font-weight:500;}
  .rev .top .av{width:30px;height:30px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:14px;color:var(--gold-light);}
  .rev .st{font-size:13px;letter-spacing:1px;}
  .rev .txt{font-size:13px;color:var(--cream);line-height:1.7;margin-top:8px;font-weight:300;}
  .rev .ago{font-size:11px;color:var(--muted-deep);margin-top:6px;}
  .task{display:flex;align-items:flex-start;gap:13px;padding:14px 0;border-bottom:1px solid var(--line-soft);}
  .task:last-child{border-bottom:none;}
  .task .ti{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .task .ti.gold{background:rgba(156,124,58,0.16);color:var(--gold-light);border:0.5px solid var(--gold-deep);}
  .task .ti.soft{background:var(--surface3);color:var(--gold-pale);border:0.5px solid var(--line);}
  .task .tx{flex:1;}
  .task .tx .t{font-size:13.8px;color:var(--white);font-weight:500;}
  .task .tx .d{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.6;}
  .task .go{font-size:12px;color:var(--gold-light);border:0.5px solid var(--gold-deep);border-radius:20px;padding:6px 13px;cursor:pointer;white-space:nowrap;transition:all .25s;}
  .task .go:hover{background:var(--gold-light);color:#131217;}
  .prog-ring{display:flex;align-items:center;gap:18px;margin-bottom:6px;}
  .check li{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--line-soft);font-size:13px;color:var(--cream);font-weight:300;list-style:none;}
  .check li:last-child{border-bottom:none;}
  .check li .bx{width:19px;height:19px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;}
  .check li .bx.on{background:var(--gold-light);color:#131217;}
  .check li .bx.off{border:1px solid var(--line);color:var(--muted-deep);}
  .check li.off-t{color:var(--muted);}
</style>

<!-- greeting -->
<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:16px;">
  <div>
    <div style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:600;font-size:26px;color:var(--white)">مساءِ الخير، رهف <span style="color:var(--gold-light)">✦</span></div>
    <div style="font-size:14px;color:var(--gold-pale);margin-top:2px">لديكِ <b style="color:var(--white);font-weight:600">٤ مواعيد</b> اليوم، وتقييمان بانتظار ردّك.</div>
  </div>
  <div style="display:flex;gap:10px"><button class="btn btn-ghost" onclick="LUMA.go('bookings')">${icon('calendar',16)} التقويم</button><button class="btn btn-gold" onclick="LUMA.go('myservices')">+ خدمة جديدة</button></div>
</div>

<!-- stats -->
<div class="ov-grid">
  ${STATS.map(s=>`<div class="stat"><div class="glow"></div>
    <div class="top"><div class="ico">${icon(s.icon,19)}</div><div class="delta ${s.up?'up':'down'}">${s.up?'▲':'▼'} ${s.delta}</div></div>
    <div class="val">${s.val}${s.unit?`<span class="u">${s.unit}</span>`:''}</div>
    <div class="k">${s.k}</div>
  </div>`).join('')}
</div>

<!-- chart + tasks -->
<div class="ov-main">
  <div class="card chart-wrap">
    <div class="ov-hi">
      <div class="lt"><div class="t">الأرباح الشهرية</div><div class="s">آخر ٧ أشهر · بالريال السعودي</div></div>
      <div class="tabs"><button class="on">أرباح</button><button onclick="LUMA.go('analytics')">حجوزات</button></div>
    </div>
    ${chartSVG()}
  </div>
  <div class="card">
    <div class="sec-label">تنبيهات ومهام <span class="ln"></span></div>
    ${TASKS.map(t=>`<div class="task">
      <div class="ti ${t.c}">${icon(t.ic,18)}</div>
      <div class="tx"><div class="t">${t.t}</div><div class="d">${t.d}</div></div>
      <div class="go" onclick="LUMA.go('${t.ic==='loyalty'?'advanced':t.ic==='star'?'reviews':'bookings'}')">${t.cta}</div>
    </div>`).join('')}
  </div>
</div>

<!-- appts + reviews -->
<div class="ov-row">
  <div class="card">
    <div class="ov-hi" style="margin-bottom:6px">
      <div class="lt"><div class="t">مواعيد اليوم القادمة</div><div class="s">٤ مواعيد</div></div>
      <span class="sec-label" style="margin:0"><span class="more" onclick="LUMA.go('bookings')">عرض الكل ←</span></span>
    </div>
    ${APPTS.map(a=>`<div class="appt">
      <div class="time">${a.t}</div><div class="vline"></div>
      <div class="who"><div class="n">${a.n}</div><div class="s">${a.s}</div></div>
      <span class="badge ${a.stc}">${a.st}</span>
    </div>`).join('')}
  </div>
  <div class="card">
    <div class="ov-hi" style="margin-bottom:6px">
      <div class="lt"><div class="t">آخر التقييمات</div><div class="s">متوسط ٤.٩ من ٥</div></div>
      <span class="sec-label" style="margin:0"><span class="more" onclick="LUMA.go('reviews')">عرض الكل ←</span></span>
    </div>
    ${REVIEWS.map(r=>`<div class="rev">
      <div class="top"><div class="nm"><span class="av">${r.n.charAt(0)}</span>${r.n}</div><div class="st">${stars(r.r)}</div></div>
      <div class="txt">${r.txt}</div><div class="ago">${r.ago}</div>
    </div>`).join('')}
  </div>
</div>

<!-- profile completion -->
<div class="card" style="margin-top:18px">
  <div class="ov-row" style="margin:0;grid-template-columns:0.9fr 1.1fr;align-items:center">
    <div>
      <div class="sec-label">اكتمال ملفك على لوما <span class="ln"></span></div>
      <div class="prog-ring">
        <svg width="92" height="92" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r="40" fill="none" stroke="#201f26" stroke-width="9"/>
          <circle cx="46" cy="46" r="40" fill="none" stroke="url(#pg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${2*Math.PI*40}" stroke-dashoffset="${2*Math.PI*40*0.2}" transform="rotate(-90 46 46)"/>
          <defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbbd81"/><stop offset="1" stop-color="#9c8047"/></linearGradient></defs>
          <text x="46" y="52" fill="#f6f2ec" font-size="22" font-family="Cormorant Garamond" font-weight="500" text-anchor="middle">80%</text>
        </svg>
        <div>
          <div style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:600;font-size:16px;color:var(--white)">ملفك شبه مكتمل</div>
          <div style="font-size:13px;color:var(--muted);margin-top:4px;max-width:30ch;line-height:1.7">أكملي الخطوتين المتبقيتين لرفع ظهورك في المتجر وجذب عميلات أكثر.</div>
          <button class="btn btn-gold" style="margin-top:14px" onclick="LUMA.go('profile')">إكمال الملف</button>
        </div>
      </div>
    </div>
    <div>
      <ul class="check">
        ${CHECK.map(c=>`<li class="${c.done?'':'off-t'}"><span class="bx ${c.done?'on':'off'}">${c.done?'✓':''}</span>${c.t}</li>`).join('')}
      </ul>
    </div>
  </div>
</div>
`;
    }
  };
})();
