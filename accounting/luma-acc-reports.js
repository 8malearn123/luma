/* ═══════════ لوما · القوائم المالية والتقارير المحاسبية ═══════════
   كل رقم هنا مشتق من القيود المرحَّلة عبر Ledger — لا مصدر ثانٍ ولا أرقام
   محسوبة في الواجهة. إن اختلّ ميزان المراجعة اختلّت القوائم، وهذا مقصود:
   القائمة مرآة للدفتر لا تقرير منفصل عنه. */
(function(){
  if(!window.LumaAcc)throw new Error('luma-acc-core.js يجب أن يُحمَّل أولاً');
  const {Money,COA,Journal,Ledger,Mapping,AccRepo,KEYS}=LumaAcc;

  /* مجموع أرصدة نوع حساب — بإشارته الطبيعية */
  function sumType(type,f,filter){
    return COA.all().filter(a=>!a.group&&a.type===type&&(!filter||filter(a)))
      .reduce((t,a)=>t+Ledger.balanceTyped(a.code,f),0);
  }
  const lines=(type,f,filter)=>COA.all()
    .filter(a=>!a.group&&a.type===type&&(!filter||filter(a)))
    .map(a=>({code:a.code,name:a.name,amount:Ledger.balanceTyped(a.code,f),contra:!!a.contra}))
    .filter(r=>r.amount);

  const Reports={
    /* ── قائمة الدخل ── */
    incomeStatement(f){
      const isCogs=a=>a.code.indexOf('51')===0;
      const revenue = lines('revenue',f);
      const cogs    = lines('expense',f,isCogs);
      const opex    = lines('expense',f,a=>!isCogs(a));
      const totRev  = revenue.reduce((t,r)=>t+r.amount,0);
      const totCogs = cogs.reduce((t,r)=>t+r.amount,0);
      const totOpex = opex.reduce((t,r)=>t+r.amount,0);
      const gross   = totRev-totCogs;
      return {revenue,cogs,opex,totRev,totCogs,totOpex,
              grossProfit:gross,netProfit:gross-totOpex,period:f||{}};
    },

    /* ── قائمة المركز المالي ──
       تُختبر بالمعادلة: الأصول = الالتزامات + حقوق الملكية + صافي الربح */
    balanceSheet(f){
      const assets     = lines('asset',f);
      const liabilities= lines('liability',f);
      const equity     = lines('equity',f);
      const totA=assets.reduce((t,r)=>t+r.amount,0);
      const totL=liabilities.reduce((t,r)=>t+r.amount,0);
      const totE=equity.reduce((t,r)=>t+r.amount,0);
      /* أرباح الفترة لم تُقفل بعد على حقوق الملكية */
      const net=Reports.incomeStatement(f).netProfit;
      const rhs=totL+totE+net;
      return {assets,liabilities,equity,totalAssets:totA,totalLiabilities:totL,
              totalEquity:totE,netProfit:net,rightSide:rhs,
              balanced:totA===rhs,difference:totA-rhs};
    },

    /* ── التدفقات النقدية (مباشرة: حركة حسابات النقد) ── */
    cashFlow(f){
      const m=Mapping.all();
      const cashCodes=[m.cash,m.bank,m.card_clearing].filter(Boolean);
      const rows=[];let inflow=0,outflow=0;
      Journal.ledgerEntries({from:(f||{}).from,to:(f||{}).to})
        .slice().sort((a,b)=>a.date.localeCompare(b.date))
        .forEach(j=>j.lines.forEach(l=>{
          if(cashCodes.indexOf(l.account)<0)return;
          const net=l.debit-l.credit;
          if(net>0)inflow+=net;else outflow+=-net;
          rows.push({date:j.date,je:j.id,desc:l.desc||j.desc,account:l.account,amount:net});
        }));
      const opening=Reports._cashAt(cashCodes,(f||{}).from);
      return {rows,inflow,outflow,net:inflow-outflow,opening,closing:opening+inflow-outflow};
    },
    _cashAt(codes,from){
      if(!from)return 0;
      const before=new Date(from);before.setDate(before.getDate()-1);
      const to=before.toISOString().slice(0,10);
      return codes.reduce((t,c)=>t+Ledger.balance(c,{to}),0);
    },

    /* ── ميزان المراجعة ── */
    trialBalance(f){return Ledger.trialBalance(f);},

    /* ── أعمار الذمم ── */
    aging(kind,asOf){
      const role=kind==='customer'?'ar':'ap';
      const code=Mapping.all()[role];
      const today=asOf||new Date().toISOString().slice(0,10);
      const by={};
      Journal.ledgerEntries({to:today}).forEach(j=>j.lines.forEach(l=>{
        if(l.account!==code)return;
        const p=l.party||j.party;if(!p||p.kind!==kind)return;
        const k=String(p.id);
        by[k]=by[k]||{id:k,name:p.name||k,buckets:[0,0,0,0,0],total:0};
        /* المدين يزيد ذمة العميلة، والدائن يزيد ذمة المورد */
        const amt=kind==='customer'?(l.debit-l.credit):(l.credit-l.debit);
        const days=Math.floor((new Date(today)-new Date(j.date))/864e5);
        const b=days<=0?0:days<=30?1:days<=60?2:days<=90?3:4;
        by[k].buckets[b]+=amt;by[k].total+=amt;
      }));
      const rows=Object.values(by).filter(r=>r.total!==0);
      const totals=[0,1,2,3,4].map(i=>rows.reduce((t,r)=>t+r.buckets[i],0));
      return {kind,asOf:today,rows,totals,
              labels:['غير مستحق','1–30 يوم','31–60','61–90','أكثر من 90'],
              grand:rows.reduce((t,r)=>t+r.total,0)};
    },

    /* ── إقرار ضريبة القيمة المضافة ── */
    vatReturn(f){
      const m=Mapping.all();
      const output=Ledger.balance(m.vat_output,f);   /* دائن بطبيعته */
      const input =Ledger.balance(m.vat_input ,f);   /* مدين بطبيعته */
      const sales    =Ledger.balance(m.rev_service,f)+Ledger.balance(m.rev_product,f)+Ledger.balance(m.rev_subscription,f);
      const returns  =Ledger.balance(m.sales_returns,f);
      return {from:(f||{}).from||'',to:(f||{}).to||'',
              netSales:sales-returns, outputVat:output, inputVat:input,
              payable:output-input, rate:LumaAcc.VAT.rate()};
    },

    /* ── يوميّة القيود ── */
    journalReport(f){
      return Journal.ledgerEntries(f||{})
        .slice().sort((a,b)=>b.date.localeCompare(a.date))
        .map(j=>({...j,debit:j.lines.reduce((t,l)=>t+l.debit,0),
                        credit:j.lines.reduce((t,l)=>t+l.credit,0)}));
    },

    /* ── فحص سلامة الدفتر — يُستخدم في الاختبار وقبل الإقفال ── */
    integrity(){
      const problems=[];
      Journal.ledgerEntries().forEach(j=>{
        const d=j.lines.reduce((t,l)=>t+l.debit,0), c=j.lines.reduce((t,l)=>t+l.credit,0);
        if(d!==c)problems.push('القيد '+j.id+' غير متوازن');
        j.lines.forEach(l=>{if(!COA.postable(l.account))problems.push('القيد '+j.id+': حساب غير صالح '+l.account);});
      });
      const tb=Ledger.trialBalance();
      if(!tb.balanced)problems.push('ميزان المراجعة غير متوازن: فرق '+Money.fmt(tb.debit-tb.credit));
      const bs=Reports.balanceSheet();
      if(!bs.balanced)problems.push('المركز المالي غير متوازن: فرق '+Money.fmt(bs.difference));
      /* قيود مكررة لنفس العملية */
      const seen={};
      Journal.ledgerEntries().forEach(j=>{
        if(!j.sourceId||j.reversalOf)return;   /* العكس يشارك المرجع عمداً */
        const k=j.source+'#'+j.sourceId;
        if(seen[k])problems.push('قيد مكرر للعملية '+k+': '+seen[k]+' و '+j.id);
        else seen[k]=j.id;
      });
      return {ok:!problems.length,problems};
    },

    /* ── الإقفال: نقل الإيرادات والمصروفات لملخص الدخل ثم للأرباح المحتجزة ── */
    closePeriod(from,to,reason){
      const m=Mapping.all();
      const f={from,to};
      const is=Reports.incomeStatement(f);
      if(!is.totRev&&!is.totCogs&&!is.totOpex)throw new Error('لا حركة إيرادات أو مصروفات في الفترة');
      const L=[];
      /* إقفال الإيرادات (دائنة الطبيعة) بجعلها مدينة */
      lines('revenue',f).forEach(r=>{const a=COA.get(r.code);
        L.push({account:r.code,[a.nature==='credit'?'debit':'credit']:Money.to(Math.abs(r.amount)),desc:'إقفال '+a.name});});
      /* إقفال المصروفات (مدينة الطبيعة) بجعلها دائنة */
      lines('expense',f).forEach(r=>{const a=COA.get(r.code);
        L.push({account:r.code,[a.nature==='debit'?'credit':'debit']:Money.to(Math.abs(r.amount)),desc:'إقفال '+a.name});});
      /* الفرق إلى ملخص الدخل */
      const net=is.netProfit;
      L.push({account:m.income_summary,[net>=0?'credit':'debit']:Money.to(Math.abs(net)),desc:'نتيجة الفترة'});
      const closing=Journal.create({date:to,desc:'قيد إقفال الفترة '+from+' → '+to,
        source:'closing',sourceId:'CL-'+from+'-'+to,lines:L},{post:true,reason:reason||'إقفال'});
      /* ترحيل ملخص الدخل إلى الأرباح المحتجزة */
      const transfer=Journal.create({date:to,desc:'ترحيل نتيجة الفترة للأرباح المحتجزة',
        source:'closing',sourceId:'CLR-'+from+'-'+to,lines:[
          {account:m.income_summary,[net>=0?'debit':'credit']:Money.to(Math.abs(net)),desc:'إقفال ملخص الدخل'},
          {account:m.retained,      [net>=0?'credit':'debit']:Money.to(Math.abs(net)),desc:'الأرباح المحتجزة'},
        ]},{post:true,reason:reason||'إقفال'});
      return {closing,transfer,netProfit:net};
    },
  };

  LumaAcc.Reports=Reports;
})();
