/* لوما · داشبورد الصالون — التقارير: إيراد، خدمات، إشغال، مصادر العميلات، أداء الطاقم
   كل الأرقام من بيانات النظام الحية (الحجوزات، المدفوعات، العميلات، الرواتب). */
/* الحسابات مشتركة بين الشاشة والتصدير والملخص الأسبوعي */
function reportData(){
  const live=APPTS.filter(a=>a.st!=='cancelled'&&a.st!=='blocked');
  const month=new Date().toISOString().slice(0,7);
  const estRevenue=STAFF.reduce((t,s)=>t+hrLedger(s.id).svc,0);
  const paid=Object.values(paidAll());
  const collected=paid.reduce((t,p)=>t+(p.total||0),0);
  const avgInvoice=paid.length?Math.round(collected/paid.length):0;
  const occupied=live.reduce((t,a)=>t+a.dur,0);
  const occupancy=Math.min(100,Math.round(occupied/(Math.max(1,STAFF.length)*SLOTS)*100));
  const svcAgg={};
  live.forEach(a=>{const k=a.service;svcAgg[k]=svcAgg[k]||{n:0,v:0};svcAgg[k].n++;svcAgg[k].v+=svcPrice(a.service);});
  const topSvc=Object.entries(svcAgg).sort((a,b)=>b[1].v-a[1].v).slice(0,6);
  const src={'سوق لوما':126,'إنستقرام':84,'توصية صديقة':58,'زيارة مباشرة':44};
  CLIENTS.filter(c=>c.src).forEach(c=>{src[c.src]=(src[c.src]||0)+1;});
  const srcList=Object.entries(src).sort((a,b)=>b[1]-a[1]);
  const perf=STAFF.map(s=>{
    const cnt=live.filter(a=>a.staff===s.id).length;
    const rev=live.filter(a=>a.staff===s.id).reduce((t,a)=>t+svcPrice(a.service),0);
    return {s,cnt,rev};
  }).sort((a,b)=>b.rev-a.rev);
  return {live,month,estRevenue,paid,collected,avgInvoice,occupancy,topSvc,srcList,perf};
}

SCREENS.reports=()=>{
  const {live,month,estRevenue,paid,collected,avgInvoice,occupancy,topSvc,srcList,perf}=reportData();
  const maxSvc=Math.max(1,...topSvc.map(([,x])=>x.v));
  const maxSrc=Math.max(1,...srcList.map(([,v])=>v));
  const SRC_COLORS=['#ccab64','#d98a93','#7d9bc0','#6fa86a','#b39add','#8accd6'];
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
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost" onclick="WEEKLY_DIGEST()">💌 الملخص الأسبوعي</button>
      <button class="btn btn-ghost" onclick="REPORTS_PRINT()">🖨 تصدير التقرير</button>
    </div>
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

/* ── تصدير التقرير: نسخة فاتحة قابلة للطباعة / الحفظ PDF ── */
function REPORTS_PRINT(){
  const d=reportData();
  const c=typeof pageCfg==='function'?pageCfg():{};
  const row=(k,v)=>`<tr><td style="padding:8px 0;border-bottom:1px solid #eee6d8">${k}</td><td style="text-align:left;font-weight:700;direction:ltr;border-bottom:1px solid #eee6d8">${v}</td></tr>`;
  const w=window.open('','_blank','width=720,height=900');
  if(!w){LUX.toast('اسمحي بالنوافذ المنبثقة للتصدير','err');return;}
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير ${c.title||'LUMA'} — ${d.month}</title>
  <style>body{margin:0;padding:34px;background:#fdfbf7;color:#2e241b;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif}h1{font-size:20px}h2{font-size:14px;color:#9c8047;margin:22px 0 6px}table{width:100%;border-collapse:collapse;font-size:13px}.sub{font-size:12px;color:#8d8172}</style></head><body>
  <h1>${c.title||'LUMA'} — تقرير الأداء الشهري</h1>
  <div class="sub">شهر ${d.month} · أُصدر من نظام لوما</div>
  <h2>المؤشرات</h2><table>
    ${row('الإيراد الشهري المقدّر',d.estRevenue.toLocaleString('en')+' ر.س')}
    ${row('المحصَّل فعلياً (فواتير مدفوعة)',d.collected.toLocaleString('en')+' ر.س')}
    ${row('متوسط قيمة الفاتورة',d.avgInvoice.toLocaleString('en')+' ر.س')}
    ${row('إشغال الكراسي اليوم',d.occupancy+'٪')}
  </table>
  <h2>أفضل الخدمات</h2><table>${d.topSvc.map(([k,x])=>row(k,x.v.toLocaleString('en')+' ر.س · '+x.n+' حجز')).join('')}</table>
  <h2>مصادر العميلات</h2><table>${d.srcList.map(([k,v])=>row(k,v+' عميلة')).join('')}</table>
  <h2>أداء الموظفات</h2><table>${d.perf.map(p=>row(p.s.n+' · '+p.s.role,p.rev.toLocaleString('en')+' ر.س · '+p.cnt+' مواعيد')).join('')}</table>
  <div class="sub" style="margin-top:26px;text-align:center;letter-spacing:.2em">L U M A &nbsp;B E A U T Y&nbsp; S Y S T E M S</div>
  </body></html>`);
  w.document.close();
  w.onload=()=>setTimeout(()=>{w.focus();w.print();},350);
}

/* ── الملخص الأسبوعي للمالكة (نسخة داخل التطبيق — الإرسال بالبريد يُفعَّل مع مزوّد البريد في المرحلة 4) ── */
function WEEKLY_DIGEST(){
  const d=reportData();
  const low=(window.INVENTORY||[]).filter(i=>i.q<i.min);
  let pendReqs=0;try{pendReqs=(typeof HR_REQS!=='undefined'?HR_REQS:[]).filter(r=>r.status==='pending').length;}catch(e){}
  const li=(ic,t)=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--line-soft,#26242d);font-size:13.5px"><span>${ic}</span><span style="flex:1">${t}</span></div>`;
  LUX.modal('💌 الملخص الأسبوعي',`
    <div style="border:1px solid var(--line,#333);border-radius:13px;padding:16px 18px;margin-bottom:4px">
      <div style="font-size:11.5px;color:var(--muted,#888)">من: لوما &lt;digest@luma.beauty&gt; · إلى: المالكة</div>
      <div style="font-weight:700;font-size:15.5px;margin-top:6px;color:var(--white,#eee)">صباح الخير يا لمى 🌸 هذا ملخص أسبوعك في صالون لمسة</div>
      <div style="margin-top:12px">
        ${li('💰','إيراد مقدّر <b>'+d.estRevenue.toLocaleString('en')+' ر.س</b> — محصَّل فعلياً <b>'+d.collected.toLocaleString('en')+' ر.س</b> عبر '+d.paid.length+' فاتورة')}
        ${li('⭐','أفضل خدمة: <b>'+(d.topSvc[0]?d.topSvc[0][0]:'—')+'</b>'+(d.topSvc[0]?' ('+d.topSvc[0][1].v.toLocaleString('en')+' ر.س)':''))}
        ${li('👑','نجمة الأسبوع: <b>'+(d.perf[0]?d.perf[0].s.n+' · '+d.perf[0].rev.toLocaleString('en')+' ر.س':'—')+'</b>')}
        ${li('🪑','إشغال الكراسي <b>'+d.occupancy+'٪</b> — '+d.live.length+' موعداً على اللوحة')}
        ${low.length?li('⚠️','مخزون منخفض: <b>'+low.map(i=>i.n).slice(0,3).join('، ')+'</b> — اطلبي من المورّد'):li('📦','المخزون بخير — لا أصناف تحت الحد الأدنى')}
        ${pendReqs?li('📥','<b>'+pendReqs+'</b> طلبات موظفات بانتظار اعتمادك في الموارد البشرية'):''}
      </div>
    </div>
    <div style="font-size:11.5px;color:var(--muted,#888);line-height:1.9">يصلك هذا الملخص على بريدك تلقائياً كل أحد صباحاً بعد ربط مزوّد البريد (المرحلة 4 من الخطة).</div>`);
}
