/* ═══════════ لوما · العمليات المحاسبية التكميلية ═══════════
   الجهات · الصناديق والبنوك · الأرصدة الافتتاحية · التحويلات ·
   التسوية البنكية · الأصول الثابتة والإهلاك · المستحقات والمقدمات الدورية.
   كلها تمرّ بالمحرك نفسه: لا رصيد مخزّن، ولا قيد خارج Journal. */
(function(){
  if(!window.LumaAcc)throw new Error('luma-acc-core.js يجب أن يُحمَّل أولاً');
  const {Money,AccRepo,Audit,COA,Journal,Ledger,Mapping,Events,KEYS}=LumaAcc;

  const K={parties:'luma_acc_parties',cash:'luma_acc_cash',recon:'luma_acc_recon',
           assets:'luma_acc_assets',recur:'luma_acc_recurring'};
  const today=()=>new Date().toISOString().slice(0,10);

  /* ─────────── الجهات: عملاء · موردون · موظفات ─────────── */
  const Parties={
    all(kind){const l=AccRepo.get(K.parties,[]);return kind?l.filter(p=>p.kind===kind):l;},
    get(id){return Parties.all().find(p=>String(p.id)===String(id))||null;},
    add(p){
      if(!p.name)throw new Error('اسم الجهة إلزامي');
      if(['customer','supplier','staff'].indexOf(p.kind)<0)throw new Error('نوع جهة غير معروف');
      const l=AccRepo.get(K.parties,[]);
      const rec={id:p.id||(p.kind[0].toUpperCase()+'-'+AccRepo.nextNo('party')),
        kind:p.kind,name:String(p.name).trim(),phone:p.phone||'',vatNo:p.vatNo||'',
        terms:+p.terms||0,active:p.active!==false,createdAt:new Date().toISOString()};
      if(Parties.get(rec.id))throw new Error('معرّف الجهة مستخدم: '+rec.id);
      l.push(rec);AccRepo.set(K.parties,l);
      Audit.log('create','party',rec.id,null,rec);
      return rec;
    },
    /* رصيد الجهة من الدفتر — لا حقل رصيد مخزّن */
    balance(id){
      const p=Parties.get(id);if(!p)return 0;
      return Ledger.party(p.kind,id).closing;
    },
    statement(id,f){
      const p=Parties.get(id);if(!p)throw new Error('جهة غير موجودة');
      return Ledger.party(p.kind,id,f);
    },
  };

  /* ─────────── الصناديق والحسابات البنكية ───────────
     كل صندوق/بنك حساب مستقل في الدليل تحت 1101/1102، وسجلّ هنا يحمل بياناته
     غير المحاسبية (اسم البنك، الآيبان). الرصيد دائماً من الدفتر. */
  const Cash={
    /* الحسابان الافتراضيان يُسجَّلان عند أول قراءة، فلا تبدأ الشاشة فارغة */
    all(){
      let l=AccRepo.get(K.cash,null);
      if(!l){
        l=[{id:'CB-cash',kind:'cash',name:'الصندوق الرئيسي',account:'110101',bank:'',iban:'',active:true},
           {id:'CB-bank',kind:'bank',name:'الحساب البنكي الرئيسي',account:'110201',bank:'',iban:'',active:true}];
        AccRepo.set(K.cash,l);
      }
      return l;
    },
    get(id){return Cash.all().find(c=>c.id===id)||null;},
    /* إنشاء صندوق أو حساب بنكي جديد بحسابه في الدليل */
    add(c){
      if(!c.name)throw new Error('اسم الحساب إلزامي');
      const kind=c.kind==='bank'?'bank':'cash';
      const parentCode=kind==='bank'?'1102':'1101';
      const parent=COA.get(parentCode);
      if(!parent)throw new Error('حساب الأصل غير موجود');
      /* الحساب الجذر يصير أباً عند إضافة أول فرع تحته */
      const siblings=COA.all().filter(a=>a.parent===parentCode);
      const code=parentCode+String(siblings.length+1).padStart(2,'0');
      return AccRepo.tx([KEYS.coa,K.cash,KEYS.seq,KEYS.audit],()=>{
        if(!parent.group){
          /* لا يُحوَّل حساب عليه حركة إلى حساب أب — الأرصدة ستُصبح معلّقة */
          if(Ledger.account(parentCode).rows.length)
            throw new Error('حساب «'+parent.name+'» عليه حركة — أنشئي الحسابات الفرعية قبل الترحيل عليه');
          const list=COA.all();const p=list.find(a=>a.code===parentCode);
          p.group=true;AccRepo.set(KEYS.coa,list);
        }
        COA.add({code,name:c.name,type:'asset',group:false});
        const l=Cash.all();
        const rec={id:'CB-'+AccRepo.nextNo('cash'),kind,name:c.name,account:code,
          bank:c.bank||'',iban:c.iban||'',active:true,createdAt:new Date().toISOString()};
        l.push(rec);AccRepo.set(K.cash,l);
        Audit.log('create','cash_account',rec.id,null,rec);
        return rec;
      });
    },
    balance(id){const c=Cash.get(id);return c?Ledger.balance(c.account):0;},
    /* تحويل بين صندوق وبنك — قيد واحد متوازن */
    transfer(fromId,toId,amount,opts){
      opts=opts||{};
      const a=Cash.get(fromId),b=Cash.get(toId);
      if(!a||!b)throw new Error('حساب غير موجود');
      if(a.id===b.id)throw new Error('لا تحويل من الحساب لنفسه');
      if(!(amount>0))throw new Error('المبلغ يجب أن يكون موجباً');
      const fee=+opts.fee||0;
      const lines=[{account:b.account,debit:amount,desc:'وارد من '+a.name},
                   {account:a.account,credit:amount+fee,desc:'صادر إلى '+b.name}];
      if(fee)lines.push({account:Mapping.acc('exp_bankfee'),debit:fee,desc:'رسوم تحويل'});
      return Journal.create({date:opts.date||today(),
        desc:opts.desc||('تحويل من '+a.name+' إلى '+b.name),
        source:'transfer',sourceId:'TR-'+AccRepo.nextNo('transfer'),
        costCenter:opts.costCenter||'',lines},{post:true,reason:'تحويل نقدي'});
    },
  };

  /* ─────────── الأرصدة الافتتاحية ───────────
     قيد افتتاحي واحد لتاريخ واحد. الفرق يُحمَّل على رأس المال حتى يتوازن
     القيد — وهو ما يفعله المحاسب فعلاً عند ترحيل أرصدة أول المدة. */
  const Opening={
    entry(date){
      return Journal.list({source:'opening'}).find(j=>j.date===date&&j.status!=='void')||null;
    },
    /* rows: [{account, debit, credit, party}] */
    post(date,rows,opts){
      opts=opts||{};
      if(Opening.entry(date))throw new Error('يوجد قيد افتتاحي بهذا التاريخ — اعكسيه قبل إعادة الترحيل');
      const lines=(rows||[]).filter(r=>(+r.debit||0)||(+r.credit||0)).map(r=>({
        account:String(r.account),debit:+r.debit||0,credit:+r.credit||0,
        desc:r.desc||'رصيد افتتاحي',party:r.party||null}));
      if(!lines.length)throw new Error('لا أرصدة افتتاحية مُدخلة');
      const dr=lines.reduce((t,l)=>t+Money.from(l.debit),0);
      const cr=lines.reduce((t,l)=>t+Money.from(l.credit),0);
      const diff=dr-cr;
      if(diff!==0){
        /* الفرق إلى رأس المال — الجانب حسب اتجاه الفرق */
        lines.push({account:Mapping.acc('capital'),
          [diff>0?'credit':'debit']:Money.to(Math.abs(diff)),
          desc:'رأس المال الافتتاحي (الفرق)'});
      }
      return Journal.create({date,desc:opts.desc||'الأرصدة الافتتاحية',
        source:'opening',sourceId:'OB-'+date,lines},{post:true,reason:'أرصدة افتتاحية'});
    },
  };

  /* ─────────── التسوية البنكية ───────────
     تقارن رصيد الدفتر برصيد كشف البنك، وتفصل المطابق عن المعلّق.
     الرسوم والفروقات تُرحَّل كقيود لا كتعديل يدوي على الرصيد. */
  const Recon={
    all(){return AccRepo.get(K.recon,[]);},
    get(id){return Recon.all().find(r=>r.id===id)||null;},
    /* حركات الحساب حتى التاريخ مع علامة المطابقة */
    lines(cashId,to){
      const c=Cash.get(cashId);if(!c)throw new Error('حساب غير موجود');
      const done={};
      Recon.all().filter(r=>r.cash===cashId&&r.status==='closed')
        .forEach(r=>(r.matched||[]).forEach(k=>{done[k]=r.id;}));
      return Ledger.account(c.account,{to}).rows.map(row=>({
        key:row.je+'#'+row.date, je:row.je, date:row.date, desc:row.desc,
        debit:row.debit, credit:row.credit,
        amount:row.debit-row.credit, reconciled:!!done[row.je+'#'+row.date],
      }));
    },
    open(cashId,statementDate,statementBalance){
      const c=Cash.get(cashId);if(!c)throw new Error('حساب غير موجود');
      const l=Recon.all();
      if(l.some(r=>r.cash===cashId&&r.status==='open'))throw new Error('توجد تسوية مفتوحة لهذا الحساب');
      const rec={id:'BR-'+AccRepo.nextNo('recon'),cash:cashId,account:c.account,
        date:statementDate,statementBalance:Money.from(statementBalance),
        matched:[],status:'open',createdAt:new Date().toISOString()};
      l.push(rec);AccRepo.set(K.recon,l);
      Audit.log('create','reconciliation',rec.id,null,rec);
      return rec;
    },
    /* حالة التسوية: رصيد الدفتر، المطابق، المعلّق، والفرق */
    status(id){
      const r=Recon.get(id);if(!r)throw new Error('تسوية غير موجودة');
      const rows=Recon.lines(r.cash,r.date);
      const inThis=k=>(r.matched||[]).indexOf(k)>=0;
      const matched  = rows.filter(x=>inThis(x.key));
      const pending  = rows.filter(x=>!inThis(x.key)&&!x.reconciled);
      const book     = Ledger.balance(r.account,{to:r.date});
      const matchedSum=matched.reduce((t,x)=>t+x.amount,0);
      /* رصيد البنك المتوقع = المطابق فقط؛ المعلّق لم يصل كشف البنك بعد */
      const diff=r.statementBalance-matchedSum;
      return {recon:r,rows,matched,pending,book,matchedSum,
              statement:r.statementBalance,difference:diff,clean:diff===0};
    },
    toggle(id,key){
      const l=Recon.all();const r=l.find(x=>x.id===id);
      if(!r||r.status!=='open')throw new Error('تسوية غير مفتوحة');
      r.matched=r.matched||[];
      const i=r.matched.indexOf(key);
      i<0?r.matched.push(key):r.matched.splice(i,1);
      AccRepo.set(K.recon,l);return r;
    },
    /* رسوم بنكية مكتشفة أثناء التسوية → قيد، لا تعديل رصيد */
    addFee(id,amount,desc){
      const r=Recon.get(id);if(!r)throw new Error('تسوية غير موجودة');
      const je=Journal.create({date:r.date,desc:desc||'رسوم بنكية',
        source:'bank_fee',sourceId:r.id+'-FEE-'+AccRepo.nextNo('fee'),
        lines:[{account:Mapping.acc('exp_bankfee'),debit:amount,desc:desc||'رسوم بنكية'},
               {account:r.account,credit:amount,desc:'خصم من الحساب'}]},
        {post:true,reason:'رسوم بنكية من التسوية'});
      /* الرسوم مطابَقة تلقائياً — ظهرت في الكشف وفي الدفتر معاً */
      const l=Recon.all();const rr=l.find(x=>x.id===id);
      rr.matched.push(je.id+'#'+r.date);AccRepo.set(K.recon,l);
      return je;
    },
    close(id,reason){
      const st=Recon.status(id);
      if(!st.clean)throw new Error('لا تُقفل تسوية بفرق '+Money.fmt(st.difference)+' — طابقي الحركات أو سجّلي الرسوم');
      const l=Recon.all();const r=l.find(x=>x.id===id);
      const before={...r};
      r.status='closed';r.closedAt=new Date().toISOString();
      AccRepo.set(K.recon,l);Audit.log('close','reconciliation',id,before,r,reason);
      return r;
    },
  };

  /* ─────────── الأصول الثابتة والإهلاك ─────────── */
  const Assets={
    METHODS:{straight:'القسط الثابت',declining:'القسط المتناقص'},
    all(){return AccRepo.get(K.assets,[]);},
    get(id){return Assets.all().find(a=>a.id===id)||null;},
    add(a){
      if(!a.name)throw new Error('اسم الأصل إلزامي');
      if(!(+a.cost>0))throw new Error('تكلفة الأصل يجب أن تكون موجبة');
      if(!(+a.life>0))throw new Error('العمر الإنتاجي بالسنوات إلزامي');
      const rec={id:'FA-'+AccRepo.nextNo('asset'),name:a.name,
        cost:Money.from(a.cost),salvage:Money.from(a.salvage||0),
        acquiredAt:a.acquiredAt||today(),life:+a.life,
        method:a.method==='declining'?'declining':'straight',
        assetAccount:a.assetAccount||'1201',accumAccount:a.accumAccount||'1202',
        status:'active',disposedAt:'',depreciated:0,
        costCenter:a.costCenter||'',createdAt:new Date().toISOString()};
      return AccRepo.tx([K.assets,KEYS.je,KEYS.seq,KEYS.audit],()=>{
        const l=Assets.all();l.push(rec);AccRepo.set(K.assets,l);
        Audit.log('create','asset',rec.id,null,rec);
        /* اقتناء الأصل قيد: الأصل مدين، والنقد/المورد دائن */
        if(a.postAcquisition!==false){
          Journal.create({date:rec.acquiredAt,desc:'اقتناء أصل — '+rec.name,
            source:'asset',sourceId:rec.id,costCenter:rec.costCenter,
            lines:[{account:rec.assetAccount,debit:Money.to(rec.cost),desc:rec.name},
                   a.party?{account:Mapping.acc('ap'),credit:Money.to(rec.cost),desc:'ذمة مورد',party:a.party}
                          :{account:Mapping.acc(Events.payRole(a.method2||'تحويل بنكي')),credit:Money.to(rec.cost),desc:'دفع'}]},
            {post:true,reason:'اقتناء أصل'});
        }
        return rec;
      });
    },
    /* قسط الإهلاك الشهري */
    monthly(id){
      const a=Assets.get(id);if(!a)return 0;
      const base=a.cost-a.salvage;
      if(a.method==='declining'){
        const nbv=a.cost-a.depreciated;
        const rate=2/a.life/12;
        return Math.max(0,Math.min(Math.round(nbv*rate),a.cost-a.salvage-a.depreciated));
      }
      return Math.max(0,Math.min(Math.round(base/(a.life*12)),base-a.depreciated));
    },
    nbv(id){const a=Assets.get(id);return a?a.cost-a.depreciated:0;},
    /* تشغيل إهلاك الشهر لكل الأصول النشطة — قيد واحد مجمّع */
    runDepreciation(date,reason){
      const d=date||today();
      const sid='DEP-'+d.slice(0,7);
      const dup=Journal.list({source:'depreciation'}).find(j=>j.sourceId===sid&&j.status!=='void');
      if(dup)return dup;                       /* إهلاك الشهر يُرحَّل مرة واحدة */
      const active=Assets.all().filter(a=>a.status==='active');
      const items=active.map(a=>({a,amt:Assets.monthly(a.id)})).filter(x=>x.amt>0);
      if(!items.length)throw new Error('لا أصول قابلة للإهلاك هذا الشهر');
      const total=items.reduce((t,x)=>t+x.amt,0);
      const byAccum={};
      items.forEach(x=>{byAccum[x.a.accumAccount]=(byAccum[x.a.accumAccount]||0)+x.amt;});
      const lines=[{account:Mapping.acc('exp_depreciation'),debit:Money.to(total),desc:'إهلاك '+d.slice(0,7)}];
      Object.entries(byAccum).forEach(([acc,amt])=>lines.push({account:acc,credit:Money.to(amt),desc:'مجمع الإهلاك'}));
      return AccRepo.tx([K.assets,KEYS.je,KEYS.seq,KEYS.audit],()=>{
        const je=Journal.create({date:d,desc:'إهلاك شهر '+d.slice(0,7),
          source:'depreciation',sourceId:sid,lines},{post:true,reason:reason||'إهلاك دوري'});
        const l=Assets.all();
        items.forEach(x=>{const a=l.find(y=>y.id===x.a.id);a.depreciated+=x.amt;
          if(a.depreciated>=a.cost-a.salvage)a.status='fully_depreciated';});
        AccRepo.set(K.assets,l);
        return je;
      });
    },
    /* استبعاد أو بيع الأصل — الربح/الخسارة فرق القيمة الدفترية عن العائد */
    dispose(id,opts){
      opts=opts||{};
      const a=Assets.get(id);if(!a)throw new Error('أصل غير موجود');
      if(a.status==='disposed')throw new Error('الأصل مستبعد مسبقاً');
      const proceeds=Money.from(opts.proceeds||0);
      const nbv=a.cost-a.depreciated;
      const gain=proceeds-nbv;
      const lines=[];
      if(a.depreciated)lines.push({account:a.accumAccount,debit:Money.to(a.depreciated),desc:'إقفال مجمع الإهلاك'});
      if(proceeds)lines.push({account:Mapping.acc(Events.payRole(opts.method||'تحويل بنكي')),debit:Money.to(proceeds),desc:'عائد البيع'});
      lines.push({account:a.assetAccount,credit:Money.to(a.cost),desc:'استبعاد '+a.name});
      if(gain>0)lines.push({account:Mapping.acc('rev_subscription'),credit:Money.to(gain),desc:'ربح بيع أصل'});
      if(gain<0)lines.push({account:Mapping.acc('exp_other'),debit:Money.to(-gain),desc:'خسارة استبعاد أصل'});
      return AccRepo.tx([K.assets,KEYS.je,KEYS.seq,KEYS.audit],()=>{
        const je=Journal.create({date:opts.date||today(),
          desc:(proceeds?'بيع':'استبعاد')+' أصل — '+a.name,
          source:'asset_disposal',sourceId:a.id,costCenter:a.costCenter,lines},
          {post:true,reason:opts.reason||'استبعاد أصل'});
        const l=Assets.all();const x=l.find(y=>y.id===id);
        const before={...x};
        x.status='disposed';x.disposedAt=opts.date||today();x.proceeds=proceeds;
        AccRepo.set(K.assets,l);Audit.log('dispose','asset',id,before,x,opts.reason);
        return je;
      });
    },
  };

  /* ─────────── المستحقات والمقدمات والقيود الدورية ───────────
     قالب قيد يتكرر بجدول. كل تنفيذ يُرحَّل مرة واحدة بمفتاح الفترة. */
  const Recurring={
    FREQ:{monthly:'شهري',quarterly:'ربع سنوي',yearly:'سنوي'},
    all(){return AccRepo.get(K.recur,[]);},
    get(id){return Recurring.all().find(r=>r.id===id)||null;},
    add(r){
      if(!r.name)throw new Error('اسم القيد الدوري إلزامي');
      if(!r.lines||r.lines.length<2)throw new Error('القالب يحتاج سطرين على الأقل');
      const dr=r.lines.reduce((t,l)=>t+Money.from(l.debit||0),0);
      const cr=r.lines.reduce((t,l)=>t+Money.from(l.credit||0),0);
      if(dr!==cr)throw new Error('قالب غير متوازن: المدين '+Money.fmt(dr)+' ≠ الدائن '+Money.fmt(cr));
      const rec={id:'RC-'+AccRepo.nextNo('recur'),name:r.name,
        kind:r.kind||'accrual',                /* accrual | prepayment | other */
        freq:Recurring.FREQ[r.freq]?r.freq:'monthly',
        lines:r.lines,costCenter:r.costCenter||'',
        startAt:r.startAt||today(),endAt:r.endAt||'',active:true,
        createdAt:new Date().toISOString()};
      const l=Recurring.all();l.push(rec);AccRepo.set(K.recur,l);
      Audit.log('create','recurring',rec.id,null,rec);
      return rec;
    },
    setActive(id,on,reason){
      const l=Recurring.all();const r=l.find(x=>x.id===id);
      if(!r)throw new Error('قيد دوري غير موجود');
      const before={...r};r.active=!!on;AccRepo.set(K.recur,l);
      Audit.log('update','recurring',id,before,r,reason);return r;
    },
    periodKey(freq,date){
      const d=new Date(date);
      if(freq==='yearly')return String(d.getFullYear());
      if(freq==='quarterly')return d.getFullYear()+'-Q'+(Math.floor(d.getMonth()/3)+1);
      return date.slice(0,7);
    },
    /* تنفيذ قيد دوري لفترة — آمن للتكرار */
    run(id,date,reason){
      const r=Recurring.get(id);if(!r)throw new Error('قيد دوري غير موجود');
      if(!r.active)throw new Error('القيد الدوري موقوف');
      const d=date||today();
      if(r.endAt&&d>r.endAt)throw new Error('انتهت فترة هذا القيد الدوري');
      const sid=r.id+'-'+Recurring.periodKey(r.freq,d);
      const dup=Journal.list({source:'recurring'}).find(j=>j.sourceId===sid&&j.status!=='void');
      if(dup)return dup;
      return Journal.create({date:d,desc:r.name,source:'recurring',sourceId:sid,
        costCenter:r.costCenter,lines:r.lines},{post:true,reason:reason||'قيد دوري'});
    },
    /* تشغيل كل القيود المستحقة لتاريخ */
    runDue(date){
      const d=date||today();
      const out=[];
      Recurring.all().filter(r=>r.active&&r.startAt<=d&&(!r.endAt||d<=r.endAt))
        .forEach(r=>{try{out.push(Recurring.run(r.id,d));}catch(e){}});
      return out;
    },
  };

  LumaAcc.Parties=Parties; LumaAcc.Cash=Cash; LumaAcc.Opening=Opening;
  LumaAcc.Recon=Recon; LumaAcc.Assets=Assets; LumaAcc.Recurring=Recurring;
  LumaAcc.OPS_KEYS=K;
})();
