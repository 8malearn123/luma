/* ===== ترحيل بيانات المتصفح إلى المشروع السحابي =====

   المالكة تكون قد بنت شهوراً من العمل داخل متصفحها: طاقم وعميلات
   وخدمات ومخزون وهوية متجر وحجوزات. عند ربط المشروع لأول مرة يجب
   ألّا تفقد شيئاً، وألّا يُرحَّل شيء مرتين إن أعادت المحاولة.

   الاستخدام: LumaMigrate.preview() لعرض ما سيُرحَّل قبل أي كتابة،
   ثم LumaMigrate.run({salonId}) للتنفيذ. كلاهما يعيد تقريراً مفصّلاً.

   المبادئ:
   • قراءة فقط من المصدر — لا يُحذف من المتصفح شيء إطلاقاً، فالتراجع ممكن.
   • علامة إتمام (luma_migrated_at) تمنع التكرار، ويمكن تجاوزها بـ force.
   • كل عنصر يُبلَّغ عنه: رُحّل / تُخطّي (موجود) / فشل ولماذا.  */
(function(){
  if(window.LumaMigrate)return;

  const DONE_KEY='luma_migrated_at';
  const g=(k,f)=>{try{return LumaStore.get(k,f);}catch(e){return f;}};

  /* ما نعرف كيف نرحّله، ومن أين نقرؤه */
  const SOURCES=[
    {key:'luma_salon_staff',    label:'الطاقم',            table:'staff_profiles'},
    {key:'luma_salon_clients',  label:'العميلات',          table:null},
    {key:'luma_svc_catalog',    label:'كتالوج الخدمات',    table:'salon_services'},
    {key:'luma_public_bookings',label:'حجوزات المتجر',     table:'bookings'},
    {key:'luma_hr_shifts',      label:'جداول الدوام',      table:'staff_schedules'},
    {key:'luma_hr_leaves',      label:'الإجازات',          table:'staff_leaves'},
    {key:'luma_page_cfg',       label:'هوية المتجر',       table:'salons'},
    {key:'luma_shop_products',  label:'منتجات المتجر',     table:null},
    {key:'luma_paid',           label:'الفواتير المدفوعة', table:null},
  ];

  const count=v=>Array.isArray(v)?v.length:(v&&typeof v==='object'?Object.keys(v).length:(v?1:0));

  /* ── ما الذي سيُرحَّل؟ بلا أي كتابة ── */
  function preview(){
    const items=SOURCES.map(s=>{
      const v=g(s.key,null);
      return {key:s.key,label:s.label,table:s.table,count:count(v),
              supported:!!s.table,
              note:s.table?'':'لا جدول له بعد — ينتظر إكمال المخطط (المرحلة ج)'};
    });
    return {
      mode:(window.LumaDB&&LumaDB.mode)||'local',
      alreadyMigrated:!!localStorage.getItem(DONE_KEY),
      migratedAt:localStorage.getItem(DONE_KEY)||null,
      totalRows:items.reduce((t,i)=>t+(i.supported?i.count:0),0),
      pending:items.filter(i=>i.supported&&i.count>0),
      unsupported:items.filter(i=>!i.supported&&i.count>0),
      items,
    };
  }

  /* ── محوّلات: من شكل المتصفح إلى شكل الجدول ── */
  const ROLE_MAP={'مكياج':'makeup_artist','شعر':'hair_stylist','بشرة':'esthetician',
                  'أظافر':'nail_artist','رموش':'lash_artist','تصوير':'photographer',
                  'استقبال':'receptionist','إدارة':'manager'};
  const staffRow=(s,salonId)=>({
    salon_id:salonId, full_name:s.n||s.name||'—',
    role:ROLE_MAP[s.role]||'manager',
    phone:s.phone||null, status:'active',
  });
  const serviceRow=(row,salonId)=>({
    salon_id:salonId, name:row[0], duration_min:(row[1]||2)*30, price:row[2]||0,
  });
  /* فارق منطقة الصالون عند لحظة معيّنة — بلا مكتبات */
  function tzOffsetMs(date,tz){
    const f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const p={};f.formatToParts(date).forEach(x=>{p[x.type]=x.value;});
    const asUTC=Date.UTC(+p.year,+p.month-1,+p.day,p.hour==='24'?0:+p.hour,+p.minute,+p.second);
    return asUTC-date.getTime();
  }
  /* الوقت المخزَّن في المتصفح ساعةُ حائطٍ بتوقيت الصالون. بناؤه بـ
     new Date('...T17:00') يفسّره بتوقيت *جهاز المالكة*، فلو رحّلت من
     جهاز بمنطقة أخرى انزاحت كل مواعيدها. نحوّل صراحةً من منطقة الصالون. */
  function zonedToUTC(dateStr,timeStr,tz){
    const m=/^(\d{1,2}):(\d{2})/.exec(String(timeStr||''));
    if(!m||!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr||'')))return null;
    const naive=new Date(dateStr+'T'+String(m[1]).padStart(2,'0')+':'+m[2]+':00Z');
    if(isNaN(naive))return null;
    return new Date(naive.getTime()-tzOffsetMs(naive,tz));
  }
  const bookingRow=(b,salonId,staffIdBy)=>{
    const tz=(window.LUMA_CONFIG&&LUMA_CONFIG.salonTz)||'Asia/Riyadh';
    const start=zonedToUTC(b.date,b.time,tz);
    if(!start||isNaN(start))return null;
    const dur=b.dur||60;
    return {salon_id:salonId, staff_id:staffIdBy(b.staff), client_name:b.client||'حجز أونلاين',
            client_phone:b.phone||null, service_name:b.service||'—', price:b.price||0,
            starts_at:start.toISOString(), ends_at:new Date(start.getTime()+dur*60000).toISOString(),
            status:'confirmed'};
  };

  /* ── التنفيذ ── */
  async function run(opts){
    opts=opts||{};
    const report={started:new Date().toISOString(),mode:(window.LumaDB&&LumaDB.mode)||'local',
                  migrated:[],skipped:[],failed:[],salonId:opts.salonId||null};

    if(!window.LumaDB||!LumaDB.isCloud){
      report.failed.push({what:'الاتصال',why:'لم يُربط مشروع سحابي — املئي luma-config.js أولاً'});
      return report;
    }
    if(localStorage.getItem(DONE_KEY)&&!opts.force){
      report.skipped.push({what:'كل شيء',why:'رُحّلت البيانات مسبقاً في '+localStorage.getItem(DONE_KEY)+' — مرّري {force:true} للإعادة'});
      return report;
    }

    /* الصالون أولاً: كل شيء آخر يشير إليه */
    let salonId=opts.salonId;
    try{
      if(!salonId){
        const cfg=g('luma_page_cfg',{})||{};
        const existing=await LumaDB.select('salons',{limit:1});
        if(existing&&existing.length)salonId=existing[0].id;
        else{
          const s=await LumaDB.insert('salons',{name:cfg.title||'صالوني',city:cfg.city||null});
          salonId=s&&s.id;
        }
      }
      report.salonId=salonId;
      if(!salonId)throw new Error('تعذّر تحديد الصالون');
    }catch(e){
      report.failed.push({what:'الصالون',why:e.message});
      return report;
    }

    /* الطاقم — ونحتفظ بخريطة المعرّفات لربط الحجوزات بها */
    const staffMap={};
    const localStaff=g('luma_salon_staff',[])||[];
    for(const s of localStaff){
      try{
        const row=await LumaDB.insert('staff_profiles',staffRow(s,salonId));
        staffMap[s.id]=row.id;
        report.migrated.push({what:'موظفة',name:s.n||s.name});
      }catch(e){report.failed.push({what:'موظفة',name:s.n||s.name,why:e.message});}
    }

    /* الخدمات */
    for(const row of (g('luma_svc_catalog',[])||[])){
      try{
        await LumaDB.insert('salon_services',serviceRow(row,salonId));
        report.migrated.push({what:'خدمة',name:row[0]});
      }catch(e){report.failed.push({what:'خدمة',name:row[0],why:e.message});}
    }

    /* الحجوزات — قد يرفضها حارس الخادم (خارج الدوام أو متعارضة)،
       وهذا رفضٌ صحيح لا خطأ في الترحيل، فنبلّغ عنه كما هو */
    const byLocal=id=>staffMap[id]||null;
    for(const b of (g('luma_public_bookings',[])||[])){
      const row=bookingRow(b,salonId,byLocal);
      if(!row||!row.staff_id){
        report.skipped.push({what:'حجز',name:(b.client||'')+' '+(b.date||''),why:'لا يمكن ربطه بموظفة أو تاريخه ناقص'});
        continue;
      }
      try{
        await LumaDB.insert('bookings',row);
        report.migrated.push({what:'حجز',name:(b.client||'')+' '+(b.date||'')});
      }catch(e){
        report.failed.push({what:'حجز',name:(b.client||'')+' '+(b.date||''),
          why:/STAFF_UNAVAILABLE|no_double_booking/.test(e.message)
              ?'رفضه الخادم: خارج الدوام أو متعارض مع حجز آخر':e.message});
      }
    }

    try{localStorage.setItem(DONE_KEY,new Date().toISOString());}catch(e){}
    report.finished=new Date().toISOString();
    report.summary=report.migrated.length+' رُحّل · '+report.skipped.length+' تُخطّي · '+report.failed.length+' فشل';
    return report;
  }

  window.LumaMigrate={preview,run,DONE_KEY,
    reset(){try{localStorage.removeItem(DONE_KEY);}catch(e){}}};
})();
