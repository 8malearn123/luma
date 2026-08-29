/* ═══════════ لوما · شاشة المحاسبة ═══════════
   تستخدم مكوّنات لوما القائمة (card / sec-label / btn / badge) بلا تصميم جديد.
   بسيطة لغير المحاسِبة (نظرة عامة وأرصدة)، ومتقدّمة للمحاسِبة (قيود وأستاذ
   وميزان وقوائم). كل رقم هنا مقروء من الدفتر — لا حساب في الواجهة. */
(function(){
  if(!window.LumaAcc||typeof SCREENS==='undefined')return;
  const {Money,COA,Journal,Ledger,Reports,Mapping,Periods,Audit}=LumaAcc;
  const F=h=>Money.fmt(h);
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const ACC={tab:'overview',account:'',from:'',to:''};
  window.ACCUI={
    go(t){ACC.tab=t;SALON.go('accounting');},
    openAccount(code){ACC.account=code;ACC.tab='ledger';SALON.go('accounting');},
    openEntry(id){
      const j=Journal.get(id);if(!j)return;
      LUX.modal('القيد '+j.id,`
        <div class="lux-lead">${esc(j.desc)}</div>
        <div class="lux-row"><span class="k">التاريخ</span><span class="v" dir="ltr">${j.date}</span></div>
        <div class="lux-row"><span class="k">الحالة</span><span class="v">${Journal.STATUS[j.status]}</span></div>
        <div class="lux-row"><span class="k">المصدر</span><span class="v" dir="ltr">${esc(j.source)}${j.sourceId?' · '+esc(j.sourceId):''}</span></div>
        ${j.costCenter?`<div class="lux-row"><span class="k">مركز التكلفة</span><span class="v">${esc(j.costCenter)}</span></div>`:''}
        <div class="lux-row"><span class="k">أنشأه</span><span class="v">${esc(j.createdBy)} · <span dir="ltr">${j.createdAt.slice(0,10)}</span></span></div>
        ${j.reversalOf?`<div class="lux-row"><span class="k">عكس للقيد</span><span class="v" dir="ltr">${j.reversalOf}</span></div>`:''}
        ${j.reversedBy?`<div class="lux-row"><span class="k">عُكس بالقيد</span><span class="v" dir="ltr">${j.reversedBy}</span></div>`:''}
        <div style="margin-top:14px;border:1px solid var(--line);border-radius:8px;overflow:hidden">
          <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr;gap:8px;padding:10px 12px;background:var(--surface2);font-size:11px;color:var(--gold)">
            <span>الحساب</span><span style="text-align:left">مدين</span><span style="text-align:left">دائن</span></div>
          ${j.lines.map(l=>{const a=COA.get(l.account)||{name:'?'};
            return `<div style="display:grid;grid-template-columns:2.2fr 1fr 1fr;gap:8px;padding:10px 12px;border-top:1px solid var(--line-soft);font-size:12.5px">
              <span><span style="color:var(--muted)" dir="ltr">${l.account}</span> ${esc(a.name)}${l.desc?`<div style="font-size:11px;color:var(--muted)">${esc(l.desc)}</div>`:''}</span>
              <span dir="ltr" style="text-align:left;color:var(--white)">${l.debit?F(l.debit):'—'}</span>
              <span dir="ltr" style="text-align:left;color:var(--white)">${l.credit?F(l.credit):'—'}</span></div>`;}).join('')}
          <div style="display:grid;grid-template-columns:2.2fr 1fr 1fr;gap:8px;padding:10px 12px;border-top:1px solid var(--line);font-size:12.5px;font-weight:600">
            <span style="color:var(--gold-light)">الإجمالي</span>
            <span dir="ltr" style="text-align:left;color:var(--gold-light)">${F(j.lines.reduce((t,l)=>t+l.debit,0))}</span>
            <span dir="ltr" style="text-align:left;color:var(--gold-light)">${F(j.lines.reduce((t,l)=>t+l.credit,0))}</span></div>
        </div>
        ${j.status==='posted'?`<button class="lux-btn lux-ghost" data-rev style="width:100%;margin-top:12px">عكس القيد</button>`:''}`,
      {onMount(ov,close){
        const b=ov.querySelector('[data-rev]');if(!b)return;
        b.onclick=()=>{close();ACCUI.reverse(id);};
      }});
    },
    reverse(id){
      LUX.modal('عكس القيد '+id,`
        <div class="lux-lead">القيد المرحَّل لا يُحذف. العكس يُنشئ قيداً مضاداً ويبقي الأصل في الدفتر بأثره الكامل.</div>
        <div class="lux-f"><label>سبب العكس <span style="color:var(--red)">*</span></label><input id="revWhy" placeholder="مثال: خطأ في مبلغ الفاتورة"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">تأكيد العكس</button>`,
      {onMount(ov,close){
        ov.querySelector('[data-ok]').onclick=()=>{
          const why=(ov.querySelector('#revWhy').value||'').trim();
          if(!why){ov.querySelector('#revWhy').style.borderColor='var(--red)';return;}
          try{const r=Journal.reverse(id,why);close();SALON.go('accounting');LUX.toast('عُكس القيد بـ'+r.id+' ✓','ok');}
          catch(e){LUX.toast(e.message,'err');}
        };
      }});
    },
    /* قيد يدوي — بسطرين على الأقل، ولا يُقبل غير المتوازن */
    newEntry(){
      const opts=COA.all().filter(a=>!a.group&&a.active)
        .map(a=>`<option value="${a.code}">${a.code} — ${esc(a.name)}</option>`).join('');
      const row=i=>`<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <select data-a="${i}">${opts}</select>
        <input data-d="${i}" type="number" step="0.01" placeholder="مدين" dir="ltr" style="text-align:right"/>
        <input data-c="${i}" type="number" step="0.01" placeholder="دائن" dir="ltr" style="text-align:right"/></div>`;
      LUX.modal('قيد يومية جديد',`
        <div class="lux-lead">لا يُرحَّل القيد إلا متوازناً: مجموع المدين = مجموع الدائن.</div>
        <div class="lux-f"><label>التاريخ</label><input id="jeDate" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
        <div class="lux-f"><label>البيان <span style="color:var(--red)">*</span></label><input id="jeDesc" placeholder="وصف العملية"/></div>
        <div class="lux-f"><label>المرجع</label><input id="jeRef" placeholder="رقم مستند (اختياري)"/></div>
        <div style="font-size:12px;color:var(--gold);margin:12px 0 6px">السطور</div>
        <div id="jeRows">${row(0)}${row(1)}</div>
        <button class="lux-btn lux-ghost" data-add style="width:100%;padding:9px">+ سطر</button>
        <div class="lux-row" style="margin-top:10px"><span class="k">التوازن</span><span class="v" id="jeBal" dir="ltr">0.00 / 0.00</span></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:10px">ترحيل القيد</button>`,
      {onMount(ov,close){
        let n=2;
        const recalc=()=>{let d=0,c=0;
          for(let i=0;i<n;i++){d+=parseFloat((ov.querySelector('[data-d="'+i+'"]')||{}).value)||0;
                               c+=parseFloat((ov.querySelector('[data-c="'+i+'"]')||{}).value)||0;}
          const el=ov.querySelector('#jeBal');
          el.textContent=d.toFixed(2)+' / '+c.toFixed(2);
          el.style.color=Math.abs(d-c)<0.005&&d>0?'var(--green)':'var(--red)';};
        ov.addEventListener('input',recalc);recalc();
        ov.querySelector('[data-add]').onclick=()=>{ov.querySelector('#jeRows').insertAdjacentHTML('beforeend',row(n++));recalc();};
        ov.querySelector('[data-ok]').onclick=()=>{
          const lines=[];
          for(let i=0;i<n;i++){
            const a=ov.querySelector('[data-a="'+i+'"]');if(!a)continue;
            const d=parseFloat((ov.querySelector('[data-d="'+i+'"]')||{}).value)||0;
            const c=parseFloat((ov.querySelector('[data-c="'+i+'"]')||{}).value)||0;
            if(!d&&!c)continue;
            lines.push({account:a.value,debit:d,credit:c});
          }
          try{
            Journal.create({date:ov.querySelector('#jeDate').value,
              desc:(ov.querySelector('#jeDesc').value||'').trim(),
              ref:(ov.querySelector('#jeRef').value||'').trim(),
              source:'manual',lines},{post:true,reason:'قيد يدوي'});
            close();SALON.go('accounting');LUX.toast('رُحّل القيد ✓','ok');
          }catch(e){LUX.toast(e.message,'err');}
        };
      }});
    },
  };

  /* ─────────── التبويبات ─────────── */
  const tabs=[['overview','نظرة عامة'],['journal','اليومية'],['ledger','الأستاذ'],
              ['trial','ميزان المراجعة'],['is','قائمة الدخل'],['bs','المركز المالي'],
              ['vat','الضريبة'],['coa','دليل الحسابات'],['audit','سجل التدقيق']];

  function money(v,cls){return `<span class="num" dir="ltr" style="font-family:var(--luma-font-display);${cls||''}">${F(v)}</span>`;}

  function tableCard(title,head,rows,foot){
    return `<div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--line)"><div class="sec-label" style="margin:0">${title} <span class="ln"></span></div></div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:560px">
        <thead><tr>${head.map((h,i)=>`<th style="text-align:${i?'left':'right'};padding:11px 20px;background:var(--surface2);color:var(--gold);font-weight:500;font-size:11px;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows||`<tr><td colspan="${head.length}" style="padding:26px;text-align:center;color:var(--muted)">لا حركة</td></tr>`}</tbody>
        ${foot?`<tfoot>${foot}</tfoot>`:''}
      </table></div></div>`;
  }
  const td=(v,i,st)=>`<td style="text-align:${i?'left':'right'};padding:11px 20px;${st||''}">${v}</td>`;

  SCREENS.accounting=()=>{
    const t=ACC.tab;
    const head=`
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
        <div><div style="font-weight:600;font-size:19px;color:var(--white)">المحاسبة</div>
        <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">دورة محاسبية مزدوجة القيد — كل رقم مشتق من دفتر الأستاذ</div></div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="ACCUI.go('coa')">دليل الحسابات</button>
          <button class="btn btn-gold" onclick="ACCUI.newEntry()">+ قيد يومية</button>
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px">
        ${tabs.map(([k,l])=>`<button onclick="ACCUI.go('${k}')" style="font-family:inherit;font-size:12px;padding:8px 15px;border-radius:30px;cursor:pointer;
          border:1px solid ${t===k?'var(--gold-deep)':'var(--line)'};background:${t===k?'rgba(201,167,94,.12)':'transparent'};
          color:${t===k?'var(--gold-light)':'var(--muted)'}">${l}</button>`).join('')}
      </div>`;

    if(t==='overview'){
      const tb=Ledger.trialBalance(), is=Reports.incomeStatement(), bs=Reports.balanceSheet();
      const integ=Reports.integrity(), m=Mapping.all();
      const kpis=[['الإيرادات',is.totRev,'var(--gold-light)'],['المصروفات',is.totCogs+is.totOpex,'var(--red)'],
                  ['صافي الربح',is.netProfit,'var(--green)'],['النقد والبنك',
                   Ledger.balance(m.cash)+Ledger.balance(m.bank)+Ledger.balance(m.card_clearing),'var(--gold-light)']];
      return head+`
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${kpis.map(k=>`<div class="card"><div style="font-size:12.5px;color:var(--gold-pale)">${k[0]}</div>
          <div class="num" style="font-family:var(--luma-font-display);font-size:30px;color:${k[2]};margin-top:8px" dir="ltr">${F(k[1])}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">ر.س</div></div>`).join('')}
      </div>
      <div class="card" style="margin-bottom:18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span class="badge ${integ.ok?'green':'gold'}">${integ.ok?'الدفتر سليم':'يحتاج مراجعة'}</span>
        <span style="font-size:12.5px;color:var(--muted)">
          ميزان المراجعة: مدين ${F(tb.debit)} / دائن ${F(tb.credit)} ${tb.balanced?'— متوازن ✓':'— غير متوازن'}
          · المركز المالي ${bs.balanced?'متوازن ✓':'غير متوازن'}</span>
        ${integ.problems.length?`<div style="flex:1 0 100%;font-size:12px;color:var(--red);line-height:1.9">${integ.problems.map(esc).join('<br>')}</div>`:''}
      </div>
      ${tableCard('آخر القيود',['رقم','التاريخ','البيان','مدين','دائن'],
        Reports.journalReport().slice(0,10).map(j=>`<tr style="cursor:pointer;border-top:1px solid var(--line-soft)" onclick="ACCUI.openEntry('${j.id}')">
          ${td('<span dir="ltr" style="color:var(--gold-light)">'+j.id+'</span>',0)}
          ${td('<span dir="ltr">'+j.date+'</span>',1)}${td(esc(j.desc),1)}
          ${td(money(j.debit),1)}${td(money(j.credit),1)}</tr>`).join(''))}`;
    }

    if(t==='journal'){
      const rows=Reports.journalReport().map(j=>`<tr style="cursor:pointer;border-top:1px solid var(--line-soft)" onclick="ACCUI.openEntry('${j.id}')">
        ${td('<span dir="ltr" style="color:var(--gold-light)">'+j.id+'</span>',0)}
        ${td('<span dir="ltr">'+j.date+'</span>',1)}${td(esc(j.desc),1)}
        ${td('<span dir="ltr" style="color:var(--muted)">'+esc(j.source)+'</span>',1)}
        ${td(money(j.debit),1)}${td(money(j.credit),1)}
        ${td('<span class="badge '+(j.status==='reversed'?'soft':'green')+'">'+Journal.STATUS[j.status]+'</span>',1)}</tr>`).join('');
      return head+tableCard('دفتر اليومية',['رقم','التاريخ','البيان','المصدر','مدين','دائن','الحالة'],rows);
    }

    if(t==='ledger'){
      const code=ACC.account||Mapping.all().cash;
      const L=Ledger.account(code);
      const sel=`<select onchange="ACCUI.openAccount(this.value)" style="background:var(--surface2);border:1px solid var(--line);border-radius:8px;color:var(--white);padding:9px 12px;font-family:inherit;font-size:12.5px">
        ${COA.all().filter(a=>!a.group).map(a=>`<option value="${a.code}" ${a.code===code?'selected':''}>${a.code} — ${esc(a.name)}</option>`).join('')}</select>`;
      const rows=L.rows.map(r=>`<tr style="cursor:pointer;border-top:1px solid var(--line-soft)" onclick="ACCUI.openEntry('${r.je}')">
        ${td('<span dir="ltr">'+r.date+'</span>',0)}
        ${td('<span dir="ltr" style="color:var(--gold-light)">'+r.je+'</span>',1)}
        ${td(esc(r.desc),1)}${td(money(r.debit),1)}${td(money(r.credit),1)}${td(money(r.balance),1,'color:var(--gold-light)')}</tr>`).join('');
      return head+`<div style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">${sel}
        <span style="font-size:13px;color:var(--muted)">الرصيد الختامي:</span> ${money(L.closing,'font-size:20px;color:var(--gold-light)')} <span style="font-size:12px;color:var(--muted)">ر.س</span></div>
        ${tableCard('دفتر الأستاذ — '+esc(L.account.name),['التاريخ','القيد','البيان','مدين','دائن','الرصيد التراكمي'],rows)}`;
    }

    if(t==='trial'){
      const tb=Ledger.trialBalance();
      const rows=tb.rows.map(r=>`<tr style="border-top:1px solid var(--line-soft);cursor:pointer" onclick="ACCUI.openAccount('${r.code}')">
        ${td('<span dir="ltr" style="color:var(--muted)">'+r.code+'</span>',0)}${td(esc(r.name),1)}
        ${td(r.debit?money(r.debit):'—',1)}${td(r.credit?money(r.credit):'—',1)}</tr>`).join('');
      const foot=`<tr><td style="padding:13px 20px;font-weight:600;color:var(--gold-light)" colspan="2">الإجمالي</td>
        <td style="padding:13px 20px;text-align:left">${money(tb.debit,'color:var(--gold-light)')}</td>
        <td style="padding:13px 20px;text-align:left">${money(tb.credit,'color:var(--gold-light)')}</td></tr>`;
      return head+`<div class="card" style="margin-bottom:14px"><span class="badge ${tb.balanced?'green':'gold'}">${tb.balanced?'متوازن ✓':'غير متوازن'}</span></div>
        ${tableCard('ميزان المراجعة',['رقم','الحساب','مدين','دائن'],rows,foot)}`;
    }

    if(t==='is'){
      const is=Reports.incomeStatement();
      const sec=(t2,arr)=>arr.length?`<tr><td colspan="2" style="padding:12px 20px;color:var(--gold);font-size:11px;letter-spacing:.2em">${t2}</td></tr>`+
        arr.map(r=>`<tr style="border-top:1px solid var(--line-soft);cursor:pointer" onclick="ACCUI.openAccount('${r.code}')">
          ${td(esc(r.name),0)}${td(money(r.amount),1)}</tr>`).join(''):'';
      const tot=(l,v,c)=>`<tr style="border-top:1px solid var(--line)"><td style="padding:12px 20px;font-weight:600;color:${c||'var(--white)'}">${l}</td>
        <td style="padding:12px 20px;text-align:left">${money(v,'color:'+(c||'var(--white)'))}</td></tr>`;
      return head+tableCard('قائمة الدخل',['البند','المبلغ'],
        sec('الإيرادات',is.revenue)+tot('إجمالي الإيرادات',is.totRev)+
        sec('تكلفة المبيعات',is.cogs)+tot('مجمل الربح',is.grossProfit,'var(--gold-light)')+
        sec('المصروفات التشغيلية',is.opex)+tot('إجمالي المصروفات',is.totOpex)+
        tot('صافي الربح',is.netProfit,is.netProfit>=0?'var(--green)':'var(--red)'));
    }

    if(t==='bs'){
      const bs=Reports.balanceSheet();
      const sec=(t2,arr)=>`<tr><td colspan="2" style="padding:12px 20px;color:var(--gold);font-size:11px;letter-spacing:.2em">${t2}</td></tr>`+
        (arr.length?arr.map(r=>`<tr style="border-top:1px solid var(--line-soft);cursor:pointer" onclick="ACCUI.openAccount('${r.code}')">
          ${td(esc(r.name),0)}${td(money(r.amount),1)}</tr>`).join(''):`<tr><td colspan="2" style="padding:12px 20px;color:var(--muted)">—</td></tr>`);
      const tot=(l,v,c)=>`<tr style="border-top:1px solid var(--line)"><td style="padding:12px 20px;font-weight:600;color:${c||'var(--white)'}">${l}</td>
        <td style="padding:12px 20px;text-align:left">${money(v,'color:'+(c||'var(--white)'))}</td></tr>`;
      return head+`<div class="card" style="margin-bottom:14px"><span class="badge ${bs.balanced?'green':'gold'}">
        ${bs.balanced?'الأصول = الالتزامات + حقوق الملكية ✓':'فرق '+F(bs.difference)}</span></div>`+
        tableCard('قائمة المركز المالي',['البند','المبلغ'],
          sec('الأصول',bs.assets)+tot('إجمالي الأصول',bs.totalAssets,'var(--gold-light)')+
          sec('الالتزامات',bs.liabilities)+tot('إجمالي الالتزامات',bs.totalLiabilities)+
          sec('حقوق الملكية',bs.equity)+tot('أرباح الفترة',bs.netProfit)+
          tot('إجمالي الالتزامات وحقوق الملكية',bs.rightSide,'var(--gold-light)'));
    }

    if(t==='vat'){
      const v=Reports.vatReturn();
      const rows=[['صافي المبيعات',v.netSales],['ضريبة المخرجات',v.outputVat],
                  ['ضريبة المدخلات',v.inputVat],['الضريبة المستحقة',v.payable]]
        .map(r=>`<tr style="border-top:1px solid var(--line-soft)">${td(r[0],0)}${td(money(r[1]),1)}</tr>`).join('');
      return head+`<div class="card" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);line-height:1.9">
        نسبة الضريبة الحالية ${(v.rate*100).toFixed(0)}٪ — تُدار من طبقة واحدة (<span dir="ltr">LumaAcc.VAT</span>) قابلة للتحديث عند تغيّر النظام.
        هذا تقرير داخلي للإقرار، وليس ملف تقديم لهيئة الزكاة والضريبة والجمارك: الفوترة الإلكترونية المعتمدة تتطلب توقيعاً وإرسالاً من خادم.</div>
        ${tableCard('إقرار ضريبة القيمة المضافة',['البند','المبلغ'],rows)}`;
    }

    if(t==='coa'){
      const rows=COA.all().map(a=>`<tr style="border-top:1px solid var(--line-soft);${a.group?'background:var(--surface2)':''}">
        ${td('<span dir="ltr" style="color:var(--muted);padding-right:'+((a.code.length-1)*10)+'px">'+a.code+'</span>',0)}
        ${td((a.group?'<b>':'')+esc(a.name)+(a.group?'</b>':'')+(a.contra?' <span class="badge soft" style="font-size:9.5px">مقابل</span>':''),1)}
        ${td(COA.TYPES[a.type].ar,1)}${td(a.nature==='debit'?'مدين':'دائن',1)}
        ${td(a.group?'—':money(Ledger.balance(a.code)),1)}
        ${td('<span class="badge '+(a.active?'green':'soft')+'">'+(a.active?'نشط':'موقوف')+'</span>',1)}</tr>`).join('');
      return head+tableCard('دليل الحسابات',['رقم','الحساب','النوع','الطبيعة','الرصيد','الحالة'],rows);
    }

    if(t==='audit'){
      const rows=Audit.all().slice(0,120).map(a=>`<tr style="border-top:1px solid var(--line-soft)">
        ${td('<span dir="ltr">'+a.at.slice(0,16).replace('T',' ')+'</span>',0)}
        ${td(esc(a.action),1)}${td(esc(a.entity)+' <span dir="ltr" style="color:var(--muted)">'+esc(a.id)+'</span>',1)}
        ${td(esc(a.user),1)}${td(esc(a.reason||'—'),1)}</tr>`).join('');
      return head+`<div class="card" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);line-height:1.9">
        سجل يُلحق فقط: لا يُعدَّل ولا يُحذف. كل إنشاء وترحيل وعكس وإقفال مسجّل بفاعله ووقته وسببه.</div>
        ${tableCard('سجل التدقيق',['الوقت','الإجراء','الكيان','المستخدم','السبب'],rows)}`;
    }
    return head;
  };
})();
