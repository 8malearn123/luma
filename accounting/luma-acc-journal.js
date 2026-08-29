/* ═══════════ لوما · محرك القيود ودفتر الأستاذ وميزان المراجعة ═══════════
   القواعد غير القابلة للخرق (تُفرض هنا، ولها نظير كـ CHECK/TRIGGER في SQL):
     • لا يُرحَّل قيد غير متوازن: مجموع المدين = مجموع الدائن، بالهللة.
     • القيد المرحَّل لا يُعدَّل ولا يُحذف — يُعكَس بقيد مضاد فقط.
     • لا ترحيل على حساب أب أو حساب موقوف.
     • لا ترحيل في فترة مقفلة.
     • السطر إما مدين أو دائن، لا الاثنان ولا صفر. */
(function(){
  if(!window.LumaAcc)throw new Error('luma-acc-core.js يجب أن يُحمَّل أولاً');
  const {Money,AccRepo,Audit,COA,KEYS}=LumaAcc;

  const STATUS={draft:'مسودة',posted:'مُرحَّل',reversed:'معكوس',void:'ملغى'};

  /* الحالتان اللتان تدخلان دفتر الأستاذ. العكس لا يمحو الأصل: يبقى الأصل
     في الدفتر ويُضاف إليه قيد مضاد، فيصير صافي الأثر صفراً مع بقاء الأثر
     التاريخي كاملاً. إسقاط الأصل من الدفتر يجعل الرصيد سالباً خطأً. */
  const LEDGER_STATES=['posted','reversed'];

  const load=()=>AccRepo.get(KEYS.je,[]);
  const save=v=>AccRepo.set(KEYS.je,v);

  /* ─────────── الفترات المالية ─────────── */
  const Periods={
    all(){return AccRepo.get(KEYS.periods,[]);},
    /* الفترة مقفلة إن وُجدت فترة تغطي التاريخ وحالتها closed */
    isClosed(date){
      return Periods.all().some(p=>p.status==='closed'&&date>=p.from&&date<=p.to);
    },
    open(from,to,name){
      const l=Periods.all();
      if(l.some(p=>p.from===from&&p.to===to))throw new Error('الفترة معرّفة مسبقاً');
      const p={id:'P-'+AccRepo.nextNo('period'),name:name||from+' → '+to,from,to,status:'open'};
      l.push(p);AccRepo.set(KEYS.periods,l);Audit.log('create','period',p.id,null,p);
      return p;
    },
    close(id,reason){
      const l=Periods.all();const p=l.find(x=>x.id===id);
      if(!p)throw new Error('فترة غير موجودة');
      if(Journal.list({status:'draft'}).some(j=>j.date>=p.from&&j.date<=p.to))
        throw new Error('لا يمكن إقفال فترة فيها قيود مسودة — رحّليها أو ألغيها أولاً');
      const before={...p};p.status='closed';p.closedAt=new Date().toISOString();
      AccRepo.set(KEYS.periods,l);Audit.log('close','period',id,before,p,reason);
      return p;
    },
    reopen(id,reason){
      if(!reason)throw new Error('إعادة فتح فترة مقفلة تتطلب سبباً موثّقاً');
      const l=Periods.all();const p=l.find(x=>x.id===id);
      if(!p)throw new Error('فترة غير موجودة');
      const before={...p};p.status='open';p.reopenedAt=new Date().toISOString();
      AccRepo.set(KEYS.periods,l);Audit.log('reopen','period',id,before,p,reason);
      return p;
    },
  };

  /* ─────────── التحقق من القيد ─────────── */
  function validate(entry){
    const errs=[];
    if(!entry.date||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date))errs.push('تاريخ القيد غير صحيح');
    if(!entry.lines||entry.lines.length<2)errs.push('القيد يحتاج سطرين على الأقل');
    let dr=0,cr=0;
    (entry.lines||[]).forEach((l,i)=>{
      const n=i+1;
      if(!COA.get(l.account))errs.push('سطر '+n+': حساب غير موجود ('+l.account+')');
      else if(!COA.postable(l.account))errs.push('سطر '+n+': لا يُرحَّل على حساب أب أو موقوف ('+l.account+')');
      const d=l.debit|0,c=l.credit|0;
      if(d<0||c<0)errs.push('سطر '+n+': لا تُقبل المبالغ السالبة — استخدمي الجانب المقابل');
      if(d&&c)errs.push('سطر '+n+': السطر إما مدين أو دائن، لا الاثنان');
      if(!d&&!c)errs.push('سطر '+n+': سطر بلا مبلغ');
      dr+=d;cr+=c;
    });
    /* القاعدة الأولى في المحاسبة المزدوجة */
    if(dr!==cr)errs.push('القيد غير متوازن: المدين '+Money.fmt(dr)+' ≠ الدائن '+Money.fmt(cr));
    if(entry.date&&Periods.isClosed(entry.date))errs.push('الفترة المحاسبية لهذا التاريخ مقفلة');
    return {ok:!errs.length,errors:errs,debit:dr,credit:cr};
  }

  const Journal={
    STATUS,Periods,validate,

    /* إنشاء قيد — مسودة افتراضياً، أو مُرحَّل مباشرة للقيود الآلية */
    create(e,opts){
      opts=opts||{};
      const entry={
        id:'JE-'+String(AccRepo.nextNo('je')).padStart(5,'0'),
        date:e.date||new Date().toISOString().slice(0,10),
        desc:String(e.desc||'').trim(),
        ref:String(e.ref||'').trim(),                 /* مرجع العملية الأصلية */
        source:e.source||'manual',                    /* manual | sale | payment | payroll … */
        sourceId:e.sourceId==null?'':String(e.sourceId),
        costCenter:e.costCenter||'',
        party:e.party||null,                          /* {kind:'customer'|'supplier'|'staff', id, name} */
        attachments:e.attachments||[],
        lines:(e.lines||[]).map(l=>({
          account:String(l.account),
          debit:Money.from(l.debit||0),
          credit:Money.from(l.credit||0),
          desc:l.desc||'',
          costCenter:l.costCenter||e.costCenter||'',
          party:l.party||null,
        })),
        status:'draft',
        createdBy:Audit.user(),createdAt:new Date().toISOString(),
        postedBy:'',postedAt:'',
        reversalOf:e.reversalOf||'',reversedBy:'',
      };
      const v=validate(entry);
      if(!v.ok)throw new Error(v.errors.join(' · '));

      return AccRepo.tx([KEYS.je,KEYS.seq],()=>{
        const l=load();l.unshift(entry);save(l);
        Audit.log('create','journal',entry.id,null,entry);
        if(opts.post)Journal.post(entry.id,opts.reason);
        return Journal.get(entry.id);
      });
    },

    get(id){return load().find(j=>j.id===id)||null;},

    /* قيود الدفتر — المرحَّلة والمعكوسة، وهي وحدها ما تبني الأرصدة */
    ledgerEntries(f){
      f=f||{};
      return load().filter(j=>
        LEDGER_STATES.indexOf(j.status)>=0&&
        (!f.from||j.date>=f.from)&&(!f.to||j.date<=f.to)&&
        (!f.source||j.source===f.source)&&
        (!f.costCenter||j.lines.some(l=>l.costCenter===f.costCenter)));
    },

    list(f){
      f=f||{};
      return load().filter(j=>
        (!f.status||j.status===f.status)&&
        (!f.from||j.date>=f.from)&&(!f.to||j.date<=f.to)&&
        (!f.source||j.source===f.source)&&
        (!f.account||j.lines.some(l=>l.account===f.account))&&
        (!f.costCenter||j.lines.some(l=>l.costCenter===f.costCenter)));
    },

    /* تعديل مسموح قبل الترحيل فقط */
    update(id,patch,reason){
      const l=load();const j=l.find(x=>x.id===id);
      if(!j)throw new Error('قيد غير موجود: '+id);
      if(j.status!=='draft')throw new Error('القيد '+id+' مُرحَّل — لا يُعدَّل، استخدمي العكس');
      const before=JSON.parse(JSON.stringify(j));
      Object.assign(j,{
        date:patch.date||j.date, desc:patch.desc!=null?patch.desc:j.desc,
        ref:patch.ref!=null?patch.ref:j.ref, costCenter:patch.costCenter!=null?patch.costCenter:j.costCenter,
        lines:patch.lines?patch.lines.map(x=>({account:String(x.account),
          debit:Money.from(x.debit||0),credit:Money.from(x.credit||0),
          desc:x.desc||'',costCenter:x.costCenter||patch.costCenter||j.costCenter||'',party:x.party||null})):j.lines,
      });
      const v=validate(j);
      if(!v.ok){Object.assign(j,before);throw new Error(v.errors.join(' · '));}
      save(l);Audit.log('update','journal',id,before,j,reason);
      return j;
    },

    post(id,reason){
      const l=load();const j=l.find(x=>x.id===id);
      if(!j)throw new Error('قيد غير موجود: '+id);
      if(j.status!=='draft')throw new Error('القيد '+id+' ليس مسودة (حالته: '+STATUS[j.status]+')');
      const v=validate(j);
      if(!v.ok)throw new Error(v.errors.join(' · '));
      const before={...j};
      j.status='posted';j.postedBy=Audit.user();j.postedAt=new Date().toISOString();
      save(l);Audit.log('post','journal',id,before,j,reason);
      return j;
    },

    /* إلغاء — للمسودات فقط. المرحَّل يُعكَس ولا يُلغى */
    voidDraft(id,reason){
      if(!reason)throw new Error('الإلغاء يتطلب سبباً');
      const l=load();const j=l.find(x=>x.id===id);
      if(!j)throw new Error('قيد غير موجود: '+id);
      if(j.status!=='draft')throw new Error('لا يُلغى قيد مُرحَّل — استخدمي العكس');
      const before={...j};j.status='void';j.voidReason=reason;j.voidBy=Audit.user();
      save(l);Audit.log('void','journal',id,before,j,reason);
      return j;
    },

    /* العكس — الطريق الوحيد لإبطال أثر قيد مرحَّل، مع بقاء الأصل كما هو */
    reverse(id,reason,date){
      if(!reason)throw new Error('عكس القيد يتطلب سبباً');
      const src=Journal.get(id);
      if(!src)throw new Error('قيد غير موجود: '+id);
      if(src.status!=='posted')throw new Error('لا يُعكَس إلا قيد مُرحَّل');
      if(src.reversedBy)throw new Error('القيد معكوس مسبقاً بالقيد '+src.reversedBy);
      const rev=Journal.create({
        date:date||new Date().toISOString().slice(0,10),
        desc:'عكس القيد '+src.id+' — '+reason,
        ref:src.ref,source:src.source,sourceId:src.sourceId,
        costCenter:src.costCenter,party:src.party,reversalOf:src.id,
        lines:src.lines.map(l=>({account:l.account,
          debit:Money.to(l.credit),credit:Money.to(l.debit),   /* الجانبان مقلوبان */
          desc:l.desc,costCenter:l.costCenter,party:l.party})),
      },{post:true,reason});
      const l=load();const j=l.find(x=>x.id===id);
      const before={...j};j.status='reversed';j.reversedBy=rev.id;
      save(l);Audit.log('reverse','journal',id,before,j,reason);
      return rev;
    },
  };

  /* ─────────── دفتر الأستاذ العام ───────────
     كل الأرصدة تُشتق من القيود المرحَّلة وحدها — لا رصيد مخزّن يمكن أن يتباعد. */
  const Ledger={
    /* حركة حساب مرتبة بالتاريخ مع الرصيد التراكمي */
    account(code,f){
      f=f||{};
      const acc=COA.get(code);
      if(!acc)throw new Error('حساب غير موجود: '+code);
      const sign=acc.nature==='debit'?1:-1;
      const rows=[];let running=0;
      Journal.ledgerEntries({from:f.from,to:f.to,costCenter:f.costCenter})
        .slice().sort((a,b)=>a.date===b.date?a.id.localeCompare(b.id):a.date.localeCompare(b.date))
        .forEach(j=>j.lines.forEach(l=>{
          if(l.account!==String(code))return;
          if(f.costCenter&&l.costCenter!==f.costCenter)return;
          running+=sign*(l.debit-l.credit);
          rows.push({date:j.date,je:j.id,desc:l.desc||j.desc,ref:j.ref,
                     debit:l.debit,credit:l.credit,balance:running,
                     costCenter:l.costCenter,party:l.party,source:j.source,sourceId:j.sourceId});
        }));
      return {account:acc,rows,closing:running};
    },

    /* رصيد حساب بطبيعته هو (المقابل موجب أيضاً بطبيعته المعكوسة) */
    balance(code,f){return Ledger.account(code,f).closing;},

    /* رصيد بإشارة نوع الحساب — الحساب المقابل يعود سالباً ليُطرح من مجموع
       نوعه. بدونه تُجمع مردودات المبيعات مع الإيراد بدل أن تُطرح منه،
       ومجمع الإهلاك يُضاف للأصول بدل أن يُنقص منها. */
    balanceTyped(code,f){
      const a=COA.get(code);if(!a)return 0;
      const b=Ledger.balance(code,f);
      return a.contra?-b:b;
    },

    /* رصيد شامل الفروع (حساب أب = مجموع أبنائه) */
    balanceDeep(code,f){
      const kids=COA.children(code);
      if(!kids.length)return Ledger.balance(code,f);
      return kids.reduce((t,k)=>t+Ledger.balanceDeep(k.code,f),0);
    },

    /* ميزان المراجعة — يجب أن يتوازن دائماً وإلا فالبيانات تالفة */
    trialBalance(f){
      const rows=COA.all().filter(a=>!a.group).map(a=>{
        const b=Ledger.balance(a.code,f);
        const isDr=a.nature==='debit';
        return {code:a.code,name:a.name,type:a.type,
                debit :isDr? Math.max(0,b):Math.max(0,-b),
                credit:isDr? Math.max(0,-b):Math.max(0,b)};
      }).filter(r=>r.debit||r.credit);
      const debit =rows.reduce((t,r)=>t+r.debit ,0);
      const credit=rows.reduce((t,r)=>t+r.credit,0);
      return {rows,debit,credit,balanced:debit===credit};
    },

    /* أستاذ مساعد لجهة (عميلة/مورد/موظفة) */
    party(kind,id,f){
      const rows=[];let running=0;
      Journal.ledgerEntries({from:(f||{}).from,to:(f||{}).to})
        .slice().sort((a,b)=>a.date===b.date?a.id.localeCompare(b.id):a.date.localeCompare(b.date))
        .forEach(j=>j.lines.forEach(l=>{
          /* الجهة تُقرأ من السطر وحده: سطر الذمم هو سطر العميلة، أما سطرا
             الإيراد والضريبة فليسا حركةً على حسابها. الاعتماد على جهة القيد
             كان يُظهر ثلاثة أسطر لعملية واحدة في كشف الحساب. */
          const p=l.party;
          if(!p||p.kind!==kind||String(p.id)!==String(id))return;
          const acc=COA.get(l.account);
          const sign=acc&&acc.nature==='debit'?1:-1;
          running+=sign*(l.debit-l.credit);
          rows.push({date:j.date,je:j.id,desc:l.desc||j.desc,ref:j.ref,account:l.account,
                     debit:l.debit,credit:l.credit,balance:running});
        }));
      return {kind,id,rows,closing:running};
    },
  };

  LumaAcc.Journal=Journal;
  LumaAcc.Ledger=Ledger;
  LumaAcc.Periods=Periods;
})();
