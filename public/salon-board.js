/* لوما · داشبورد الصالون — النظرة العامة ولوحة الحجوزات والأجندة */
SCREENS.overview=()=>{
  const onDuty=STAFF.length;
  const todayCount=APPTS.length;
  const revenue='6,840';
  /* 7-day upcoming: confirmed + cancelled */
  const WEEK=[['الثلاثاء',9,0],['الأربعاء',9,1],['الخميس',12,0],['الجمعة',9,0],['السبت',1,0],['الأحد',3,0],['الإثنين',1,0]];
  const SALES=[['16',9],['17',11.5],['18',14],['19',10.4],['20',16],['21',12.6],['22',6.8]];
  const APVAL=[['16',5.4],['17',6.8],['18',5.1],['19',9.2],['20',11.4],['21',9.1],['22',4.2]];
  function apptBars(){
    const W=540,H=230,pad={t:18,r:8,b:34,l:30},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,max=12,step=iw/WEEK.length,bw=Math.min(30,step*0.42);
    let grid='';for(let g=0;g<=4;g++){const y=pad.t+ih-(g/4)*ih;grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#26242d" stroke-width="1"/><text x="${pad.l-6}" y="${y+4}" fill="#58545f" font-size="9.5" font-family="IBM Plex Mono" text-anchor="end">${((g/4)*max).toFixed(0)}</text>`;}
    let bars=WEEK.map((d,i)=>{const x=pad.l+i*step+(step-bw)/2;const hc=(d[1]/max)*ih,hx=(d[2]/max)*ih;const yC=pad.t+ih-hc,yX=yC-hx;return `<g><rect x="${x}" y="${yC}" width="${bw}" height="${hc}" rx="3" fill="url(#abg)"/>${d[2]?`<rect x="${x}" y="${yX}" width="${bw}" height="${hx}" rx="3" fill="#c2705f"/>`:''}<text x="${x+bw/2}" y="${H-14}" fill="#86818d" font-size="9.5" font-family="IBM Plex Sans Arabic" text-anchor="middle">${d[0]}</text></g>`;}).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible"><defs><linearGradient id="abg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbbd81"/><stop offset="1" stop-color="#9c8047"/></linearGradient></defs>${grid}${bars}</svg>`;
  }
  function salesLines(){
    const W=540,H=230,pad={t:18,r:10,b:30,l:38},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,max=28,step=iw/(SALES.length-1);
    const toPts=arr=>arr.map((d,i)=>[pad.l+i*step,pad.t+ih-(d[1]/max)*ih]);
    const p1=toPts(SALES),p2=toPts(APVAL);
    const path=p=>p.map((q,i)=>`${i?'L':'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    let grid='';for(let g=0;g<=4;g++){const y=pad.t+ih-(g/4)*ih;grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#26242d" stroke-width="1"/><text x="${pad.l-6}" y="${y+4}" fill="#58545f" font-size="9" font-family="IBM Plex Mono" text-anchor="end">${((g/4)*max).toFixed(0)}k</text>`;}
    const dots=(p,c)=>p.map(q=>`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" fill="${c}"/>`).join('');
    const labels=SALES.map((d,i)=>`<text x="${(pad.l+i*step).toFixed(1)}" y="${H-12}" fill="#86818d" font-size="9.5" font-family="IBM Plex Sans Arabic" text-anchor="middle">${d[0]}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible">${grid}<path d="${path(p2)}" fill="none" stroke="#6fa86a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="${path(p1)}" fill="none" stroke="#ccab64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots(p2,'#6fa86a')}${dots(p1,'#ccab64')}${labels}</svg>`;
  }
  const STATS=[
    {ic:'board',k:'حجوزات اليوم',v:todayCount,u:'',d:'+4'},
    {ic:'wallet',k:'دخل اليوم المتوقع',v:revenue,u:'ر.س',d:'+12%'},
    {ic:'staff',k:'موظفات على رأس العمل',v:onDuty,u:`/ ${STAFF.length}`,d:''},
    {ic:'chair',k:'إشغال الكراسي',v:'82',u:'%',d:'+6%'},
  ];
  const staffRows=STAFF.map(s=>{const cnt=APPTS.filter(a=>a.staff===s.id).length;return `<div style="display:flex;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid var(--line-soft)"><span style="width:38px;height:38px;border-radius:50%;background:var(--surface3);border:1px solid ${s.color};display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:${s.color};font-size:16px">${s.n.charAt(0)}</span><div style="flex:1"><div style="font-size:14px;color:var(--white);font-weight:500">${s.n}</div><div style="font-size:12px;color:var(--muted)">${s.role}</div></div><span class="badge soft">${cnt} مواعيد</span><span class="badge green">متاحة</span></div>`;}).join('');
  const next=APPTS.slice().sort((a,b)=>a.start-b.start).slice(0,5).map(a=>{const s=STAFF.find(x=>x.id===a.staff);return `<div style="display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid var(--line-soft)"><div class="mono" style="font-size:12.5px;color:var(--gold-light);min-width:60px;text-align:center">${slotLabel(a.start)}</div><div style="width:1px;height:30px;background:var(--line)"></div><div style="flex:1"><div style="font-size:13.5px;color:var(--white);font-weight:500">${a.client}</div><div style="font-size:11.5px;color:var(--muted)">${a.service} · مع ${s.n}</div></div><span class="badge ${a.st==='pending'?'gold':'green'}">${ST_STYLE[a.st].lb}</span></div>`;}).join('');
  return `
  <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:14px">
    <div><div style="font-weight:600;font-size:25px;color:var(--white)">صباح الخير، صالون لمسة <span style="color:var(--gold-light)">✦</span></div>
    <div style="font-size:13.5px;color:var(--gold-pale);margin-top:2px"><b style="color:var(--white)">${todayCount} موعد</b> اليوم موزّعة على ${STAFF.length} موظفات.</div></div>
    <button class="btn btn-ghost" onclick="SALON.go('board')">${icon('board',16)} لوحة الحجوزات</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
    ${STATS.map(s=>`<div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon(s.ic,19)}</div>${s.d?`<div class="delta">▲ ${s.d}</div>`:''}</div><div class="val">${s.v}${s.u?`<span class="u">${s.u}</span>`:''}</div><div class="k">${s.k}</div></div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;align-items:start">
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px"><div><div style="font-weight:600;font-size:16px;color:var(--white)">المواعيد القادمة</div><div style="font-size:12px;color:var(--muted)">الأيام السبعة القادمة</div></div><div style="text-align:left"><div class="num" style="font-size:26px;color:var(--white)">45</div><div style="font-size:11px;color:var(--gold-pale)">محجوز</div></div></div>
      <div style="display:flex;gap:16px;margin:4px 0 8px;font-size:11.5px"><span style="color:var(--muted)">مؤكد <b style="color:var(--white)">44</b></span><span style="color:var(--muted)">ملغى <b style="color:var(--red)">1</b></span></div>
      ${apptBars()}
      <div style="display:flex;gap:18px;justify-content:flex-end;margin-top:4px;font-size:11px"><span style="display:flex;align-items:center;gap:6px;color:var(--cream)"><span style="width:10px;height:10px;border-radius:3px;background:#ccab64"></span>مؤكد</span><span style="display:flex;align-items:center;gap:6px;color:var(--cream)"><span style="width:10px;height:10px;border-radius:3px;background:#c2705f"></span>ملغى</span></div>
    </div>
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px"><div><div style="font-weight:600;font-size:16px;color:var(--white)">المبيعات الأخيرة</div><div style="font-size:12px;color:var(--muted)">آخر ٧ أيام · بالألف ر.س</div></div><div style="text-align:left"><div class="num gold-fill" style="font-size:24px">128,025</div><div style="font-size:11px;color:var(--gold-pale)">إجمالي المبيعات (ر.س)</div></div></div>
      ${salesLines()}
      <div style="display:flex;gap:18px;justify-content:flex-end;margin-top:4px;font-size:11px"><span style="display:flex;align-items:center;gap:6px;color:var(--cream)"><span style="width:10px;height:3px;border-radius:3px;background:#ccab64"></span>المبيعات</span><span style="display:flex;align-items:center;gap:6px;color:var(--cream)"><span style="width:10px;height:3px;border-radius:3px;background:#6fa86a"></span>قيمة المواعيد</span></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;align-items:start">
    <div class="card"><div class="sec-label">المواعيد القادمة اليوم <span class="ln"></span><span class="more" onclick="SALON.go('board')">اللوحة الكاملة ←</span></div>${next}</div>
    <div class="card"><div class="sec-label">الطاقم اليوم <span class="ln"></span><span class="more" onclick="SALON.go('staff')">إدارة ←</span></div>${staffRows}</div>
  </div>`;
};

/* ── THE BOOKING BOARD: staff columns × time rows + agenda view ── */
SCREENS.board=()=>{
  const live=APPTS.filter(a=>a.st!=='cancelled');
  /* «الآن»: خط الوقت الحالي داخل ساعات الدوام */
  const nowMin=(()=>{const d=new Date();return (d.getHours()*60+d.getMinutes())-START_HOUR*60;})();
  const nowLine=(nowMin>0&&nowMin<SLOTS*30)?`<div class="nowline" style="top:${Math.round(nowMin/30*ROW_H)}px"></div>`:'';
  const colTracks=STAFF.map(s=>{
    const blocks=live.filter(a=>a.staff===s.id).map(a=>{
      const st=ST_STYLE[a.st];
      const top=a.start*ROW_H+2, h=a.dur*ROW_H-4;
      const paid=a.st!=='blocked'&&paidOf(a.id);
      return `<div class="appt" onclick="event.stopPropagation();SALON.apptDetail('${a.id}')" style="top:${top}px;height:${h}px;background:${st.bg};border-color:${st.bd}${a.st==='blocked'?';border-style:dashed':''}">
        <div class="ap-t">${slotLabel(a.start)} – ${slotLabel(a.start+a.dur)}${paid?' <span style="color:#9fce99">· مدفوعة ✓</span>':''}</div>
        <div class="ap-c">${a.st==='blocked'?'⛔ '+a.client:a.client}</div>
        <div class="ap-s">${a.service}</div>
      </div>`;
    }).join('');
    return `<div class="col"><div class="col-track" data-staff="${s.id}" title="اضغطي على خانة فارغة لحجز موعد" onclick="if(!event.target.closest('.appt'))SALON.newBooking({staff:this.dataset.staff,start:Math.floor(event.offsetY/${ROW_H})})" style="height:${SLOTS*ROW_H}px">${gridLines()}${nowLine}${blocks}</div></div>`;
  }).join('');
  const heads=STAFF.map(s=>{const blocked=hrOnLeaveToday(s.id)?'في إجازة — محظورة الحجز':(spOf(s.id).status!=='active'?'موقوفة — محظورة الحجز':null);
    return `<div class="col-h" ${blocked?'style="opacity:.55"':''}><span class="ch-av" style="border-color:${s.color};color:${s.color}">${s.n.charAt(0)}</span><div><div class="ch-n">${s.n}</div><div class="ch-r">${blocked?'<span style="color:#ccab64">'+blocked+'</span>':s.role}</div></div></div>`;}).join('');
  const timeCol=Array.from({length:SLOTS}).map((_,i)=>`<div class="tl" style="height:${ROW_H}px">${i%2===0?slotLabel(i):''}</div>`).join('');
  /* agenda view: compact time+client bars sorted by start (like a month-cell) */
  const agenda=live.slice().sort((a,b)=>a.start-b.start).map(a=>{
    const st=ST_STYLE[a.st];const s=STAFF.find(x=>x.id===a.staff)||{n:'—'};
    const pd=a.st!=='blocked'&&paidOf(a.id);
    return `<div class="agitem" onclick="SALON.apptDetail('${a.id}')" style="background:${st.bg};border-color:${st.bd}${a.st==='blocked'?';border-style:dashed':''}">
      <span class="ag-t">${slotLabel(a.start)}</span>
      <b>${a.st==='blocked'?'وقت محجوب — '+a.client:a.client}</b>
      <span class="ag-s">${a.service} · ${s.n}</span>
      <span class="badge ${pd?'green':a.st==='pending'?'gold':a.st==='blocked'?'soft':'green'}" style="margin-right:auto;font-size:10px">${pd?'مدفوعة ✓':st.lb}</span>
    </div>`;
  }).join('')||'<div class="card" style="text-align:center;color:var(--muted)">لا حجوزات اليوم.</div>';
  const view=SALON.boardView||'grid';
  return `
  <style>
    .bd-top{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap;}
    .date-pill{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:9px 16px;}
    .date-pill .nav{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--surface2);color:var(--gold-pale);cursor:pointer;}
    .date-pill .dt{font-size:14px;color:var(--white);font-weight:600;} .date-pill .dt span{font-size:11.5px;color:var(--muted);font-weight:300;margin-right:6px;}
    .legend{display:flex;gap:16px;flex-wrap:wrap;margin-right:auto;}
    .legend .lg{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--cream);} .legend .lg .sw{width:11px;height:11px;border-radius:3px;border:1px solid;}
    .vsw{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
    .vsw button{background:none;border:none;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--muted);padding:9px 16px;cursor:pointer;}
    .vsw button.on{background:linear-gradient(120deg,rgba(220,192,106,.18),rgba(156,124,58,.06));color:var(--gold-light);}
    .board{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
    .board-head{display:grid;grid-template-columns:66px repeat(${STAFF.length},1fr);border-bottom:1px solid var(--line);background:var(--surface2);}
    .board-head .corner{border-left:1px solid var(--line);}
    .col-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-left:1px solid var(--line);}
    .col-h:last-child{border-left:none;}
    .col-h .ch-av{width:34px;height:34px;border-radius:50%;background:var(--surface3);border:1px solid;display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:15px;}
    .col-h .ch-n{font-size:14px;color:var(--white);font-weight:600;} .col-h .ch-r{font-size:11.5px;color:var(--muted);}
    .board-body{display:grid;grid-template-columns:66px repeat(${STAFF.length},1fr);max-height:calc(100vh - 280px);overflow-y:auto;}
    .timecol{border-left:1px solid var(--line);}
    .tl{display:flex;align-items:flex-start;justify-content:center;padding-top:3px;font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--muted-deep);direction:ltr;border-bottom:1px solid var(--line-soft);}
    .col{position:relative;border-left:1px solid var(--line);} .col:last-child{border-left:none;}
    .col-track{position:relative;}
    .gl{position:absolute;left:0;right:0;border-bottom:1px solid var(--line-soft);}
    .appt{position:absolute;left:5px;right:5px;border-radius:8px;border:1px solid;border-right-width:3px;padding:7px 9px;overflow:hidden;cursor:pointer;transition:transform .15s;}
    .appt:hover{transform:scale(1.015);z-index:5;box-shadow:0 10px 26px rgba(0,0,0,.4);}
    .col-track{cursor:cell;}
    .col-track:hover .gl{border-bottom-color:var(--line);}
    .nowline{position:absolute;left:0;right:0;height:0;border-top:2px solid #c2705f;z-index:4;pointer-events:none;}
    .nowline::before{content:'الآن';position:absolute;right:4px;top:-9px;background:#c2705f;color:#fff;font-size:8.5px;padding:1px 7px;border-radius:8px;}
    .appt .ap-t{font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--gold-pale);direction:ltr;}
    .appt .ap-c{font-size:12.5px;color:var(--white);font-weight:600;margin-top:1px;} .appt .ap-s{font-size:11px;color:var(--cream);opacity:0.85;margin-top:1px;}
    .agitem{display:flex;align-items:center;gap:11px;border:1px solid;border-right-width:4px;border-radius:9px;padding:9px 13px;margin-bottom:7px;cursor:pointer;font-size:13px;color:var(--white);}
    .agitem b{font-weight:600;} .agitem .ag-t{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--gold-pale);direction:ltr;min-width:44px;}
    .agitem .ag-s{font-size:11.5px;color:var(--muted);}
  </style>
  <div class="bd-top">
    <div class="date-pill"><button class="nav">›</button><div class="dt">اليوم <span>الأحد ٢١ يونيو</span></div><button class="nav">‹</button></div>
    <button class="btn btn-gold" onclick="SALON.newBooking()">+ موعد / وقت محجوب</button>
    <div class="vsw"><button class="${view==='grid'?'on':''}" onclick="SALON.setBoardView('grid')">اللوحة</button><button class="${view==='list'?'on':''}" onclick="SALON.setBoardView('list')">الأجندة</button></div>
    <div class="legend">${Object.keys(ST_STYLE).map(k=>`<span class="lg"><span class="sw" style="background:${ST_STYLE[k].bg};border-color:${ST_STYLE[k].bd}"></span>${ST_STYLE[k].lb}</span>`).join('')}</div>
  </div>
  ${view==='list'
    ?`<div class="card" style="padding:16px">${agenda}</div>`
    :`<div class="board">
    <div class="board-head"><div class="corner"></div>${heads}</div>
    <div class="board-body"><div class="timecol">${timeCol}</div>${colTracks}</div>
  </div>`}`;
};
function gridLines(){let g='';for(let i=1;i<SLOTS;i++)g+=`<div class="gl" style="top:${i*ROW_H}px"></div>`;return g;}

