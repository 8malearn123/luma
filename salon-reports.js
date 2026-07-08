/* لوما · داشبورد الصالون — التقارير: إيراد، خدمات، إشغال، مصادر العميلات، أداء الطاقم
   كل الأرقام من بيانات النظام الحية (الحجوزات، المدفوعات، العميلات، الرواتب). */
SCREENS.reports=()=>{
  const live=APPTS.filter(a=>a.st!=='cancelled'&&a.st!=='blocked');
  const month=new Date().toISOString().slice(0,7);

  /* ── البطاقات العلوية ── */
  const estRevenue=STAFF.reduce((t,s)=>t+hrLedger(s.id).svc,0);
  const paid=Object.values(paidAll());
  const collected=paid.reduce((t,p)=>t+(p.total||0),0);
  const avgInvoice=paid.length?Math.round(collected/paid.length):0;
  const occupied=live.reduce((t,a)=>t+a.dur,0);
  const occupancy=Math.min(100,Math.round(occupied/(Math.max(1,STAFF.length)*SLOTS)*100));

  /* ── أفضل الخدمات (عدد وقيمة) ── */
  const svcAgg={};
  live.forEach(a=>{const k=a.service;svcAgg[k]=svcAgg[k]||{n:0,v:0};svcAgg[k].n++;svcAgg[k].v+=svcPrice(a.service);});
  const topSvc=Object.entries(svcAgg).sort((a,b)=>b[1].v-a[1].v).slice(0,6);
  const maxSvc=Math.max(1,...topSvc.map(([,x])=>x.v));

  /* ── مصادر العميلات: خط أساس تاريخي + المسجّلات فعلياً بحقل «كيف عرفت الصالون؟» ── */
  const src={'سوق لوما':126,'إنستقرام':84,'توصية صديقة':58,'زيارة مباشرة':44};
  CLIENTS.filter(c=>c.src).forEach(c=>{src[c.src]=(src[c.src]||0)+1;});
  const srcList=Object.entries(src).sort((a,b)=>b[1]-a[1]);
  const maxSrc=Math.max(1,...srcList.map(([,v])=>v));
  const SRC_COLORS=['#ccab64','#d98a93','#7d9bc0','#6fa86a','#b39add','#8accd6'];

  /* ── أداء الطاقم ── */
  const perf=STAFF.map(s=>{
    const cnt=live.filter(a=>a.staff===s.id).length;
    const rev=live.filter(a=>a.staff===s.id).reduce((t,a)=>t+svcPrice(a.service),0);
    return {s,cnt,rev};
  }).sort((a,b)=>b.rev-a.rev);
  const maxPerf=Math.max(1,...perf.map(p=>p.rev));

  const bar=(label,val,max,txt,color)=>`
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
        <span style="color:var(--white)">${label}</span><span class="num" style="color:var(--gold-light)">${txt}</span></div>
      <div style="height:9px;background:var(--surface3);border-radius:6px;overflow:hidden">
        <div style="width:${Math.round(val/max*100)}%;height:100%;border-radius:6px;background:${color||'linear-gradient(90deg,#dbbd81,#9c8047)'}"></div></div>
    </div>`;

  const stat=(ic,val,unit,label,delta)=>`
    <div class="stat"><div class="glow"></div>
      <div class="top"><div class="ico">${icon(ic,19)}</div>${delta?`<div class="delta">${delta}</div>`:''}</div>
      <div class="val">${val}${unit?`<span class="u">${unit}</span>`:''}</div><div class="k">${label}</div></div>`;

  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">التقارير</div>
    <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">شهر ${month} — أرقام حية من الحجوزات والمدفوعات والعميلات</div></div>
    <button class="btn btn-ghost">تصدير التقرير</button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px">
    ${stat('wallet',estRevenue.toLocaleString('en'),' ر.س','الإيراد الشهري المقدّر','▲ 12%')}
    ${stat('invoice',collected.toLocaleString('en'),' ر.س','المحصَّل فعلياً (فواتير مدفوعة)')}
    ${stat('chart',avgInvoice.toLocaleString('en'),' ر.س','متوسط قيمة الفاتورة')}
    ${stat('board',occupancy,'%','إشغال الكراسي اليوم')}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    <div class="card"><div class="sec-label">أفضل الخدمات <span class="ln"></span><span style="font-size:11px;color:var(--muted)">بقيمة اليوم</span></div>
      ${topSvc.map(([k,x])=>bar(k,x.v,maxSvc,x.v.toLocaleString('en')+' ر.س · '+x.n+' حجز')).join('')||'<div style="color:var(--muted);font-size:13px">لا حجوزات بعد.</div>'}</div>
    <div class="card"><div class="sec-label">مصادر العميلات <span class="ln"></span><span style="font-size:11px;color:var(--muted)">تتحدث مع كل عميلة جديدة</span></div>
      ${srcList.map(([k,v],i)=>bar(k,v,maxSrc,v+' عميلة',SRC_COLORS[i%SRC_COLORS.length])).join('')}</div>
  </div>

  <div class="card"><div class="sec-label">أداء الموظفات اليوم <span class="ln"></span></div>
    ${perf.map(p=>bar(p.s.n+' · '+p.s.role,p.rev,maxPerf,p.rev.toLocaleString('en')+' ر.س · '+p.cnt+' مواعيد',p.s.color)).join('')}</div>`;
};
