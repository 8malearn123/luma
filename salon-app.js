/* لوما · داشبورد الصالون — بقية الشاشات، كائن SALON، الحجز والدفع والفواتير، الإقلاع */
/* ── CLIENTS ── */
const CLIENTS=[
  {n:'نوف العتيبي',v:14,sp:'9,200',last:'قبل ٣ أيام',staff:'أمل',tag:'VIP',tc:'gold'},
  {n:'سارة الأحمدي',v:9,sp:'4,100',last:'اليوم',staff:'نورة',tag:'متكررة',tc:'green'},
  {n:'لطيفة المطيري',v:11,sp:'7,600',last:'قبل يومين',staff:'ريم',tag:'VIP',tc:'gold'},
  {n:'هند الشمري',v:6,sp:'3,300',last:'قبل أسبوع',staff:'سارة',tag:'متكررة',tc:'green'},
  {n:'وعد الزهراني',v:3,sp:'1,500',last:'اليوم',staff:'سارة',tag:'جديدة',tc:'soft'},
  {n:'منيرة الدوسري',v:8,sp:'5,900',last:'غداً',staff:'نورة',tag:'متكررة',tc:'green'},
];
/* clients added from the UI persist across reloads */
const CLIENT_KEY='luma_salon_clients';
LumaStore.get(CLIENT_KEY,[]).forEach(c=>{if(c&&c.n&&!CLIENTS.some(x=>x.n===c.n))CLIENTS.unshift(c);});
function saveClients(){LumaStore.set(CLIENT_KEY,CLIENTS.filter(c=>c.custom));}
const CLIENTS_BASE_TOTAL=312-6; /* the sample table shows 6 of the base 312 */

SCREENS.clients=()=>{
  const C=CLIENTS;
  const total=CLIENTS_BASE_TOTAL+CLIENTS.length;
  return `
  <style>.ctab{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}.cth,.ctr{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 40px;gap:12px;align-items:center;padding:14px 20px}.cth{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600}.ctr{border-bottom:1px solid var(--line-soft)}.ctr:last-child{border-bottom:none}.ctr:hover{background:var(--surface2)}.cnm{display:flex;align-items:center;gap:11px}.cnm .av{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px}.cc{font-size:13px;color:var(--cream)}.cc .num{font-family:'Bodoni Moda',serif;font-size:17px;color:var(--white);direction:ltr}@media(max-width:1080px){.cth{display:none}.ctr{grid-template-columns:1fr auto}.ctr .hide{display:none}}</style>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">عملاء الصالون</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">قاعدة عملاء مشتركة بين جميع الموظفات</div></div><div style="display:flex;gap:10px"><button class="btn btn-ghost" onclick="LOY.settings()">★ برنامج الولاء</button><button class="btn btn-gold" onclick="SALON.addClient()">+ عميلة جديدة</button></div></div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div><div class="delta">▲ 8</div></div><div class="val">${total}</div><div class="k">إجمالي العملاء</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">68<span class="u">%</span></div><div class="k">عميلات متكررات</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">486<span class="u">ر.س</span></div><div class="k">متوسط إنفاق العميلة</div></div>
  </div>
  <div class="ctab"><div class="cth"><span>العميلة</span><span>الزيارات</span><span>الإنفاق</span><span>آخر زيارة</span><span>الموظفة المفضّلة</span><span></span></div>
  ${C.map(c=>`<div class="ctr"><div class="cnm"><span class="av">${c.n.charAt(0)}</span><div><div style="font-size:14px;color:var(--white);font-weight:500">${c.n}</div><span class="badge ${c.tc}" style="margin-top:3px">${c.tag}</span> <button class="badge gold loypts" onclick="LOY.redeem('${c.n.replace(/'/g,"\\'")}')" style="cursor:pointer;border:none;margin-top:3px" title="استبدال نقاط الولاء">★ ${loyPts(c.n).toLocaleString('en')}</button>${c.phone?` <span style="font-size:11px;color:var(--muted);direction:ltr;display:inline-block;margin-right:6px">${c.phone}</span>`:''}</div></div><div class="cc hide"><span class="num">${c.v}</span> زيارة</div><div class="cc hide"><span class="num">${c.sp}</span> ر.س</div><div class="cc hide">${c.last}</div><div class="cc hide">${c.staff}</div><button style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">⋯</button></div>`).join('')}
  </div>`;
};

/* ── SERVICES (كتالوج حي — يغذي الحجز والأسعار والتقارير) ── */
SCREENS.services=()=>{
  const cats=[...new Set(SVC_CATALOG.map(s=>s[3]||'أخرى'))];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">خدمات الصالون</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">${SVC_CATALOG.length} خدمة عبر ${cats.length} أقسام — كل تعديل ينعكس فوراً على الحجز والفواتير والتقارير</div></div><button class="btn btn-gold" onclick="SALON.svcForm()">+ خدمة جديدة</button></div>
  ${cats.map(cat=>{
    const items=SVC_CATALOG.filter(s=>(s[3]||'أخرى')===cat);
    const by=(STAFF.find(x=>x.role===cat)||{}).n;
    return `<div class="sec-label">${cat} <span class="ln"></span></div><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">${items.map(s=>`<div class="card" style="display:flex;align-items:center;gap:16px;padding:15px 18px"><div style="width:42px;height:42px;border-radius:11px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('scissors',19)}</div><div style="flex:1"><div style="font-size:15px;color:var(--white);font-weight:600">${s[0]}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">◷ ${s[1]*30} دقيقة${by?` · تُقدّم بواسطة ${by}`:''}</div></div><div class="num" style="font-size:24px;color:var(--gold-light)">${s[2]} <span style="font-family:'IBM Plex Sans Arabic',Cairo;font-size:11px;color:var(--muted)">ر.س</span></div><button class="btn btn-ghost" style="padding:8px 14px" onclick="SALON.svcForm('${s[0].replace(/'/g,"\\'")}')">تحرير</button></div>`).join('')}</div>`;
  }).join('')}`;
};

/* ── PRODUCTS (retail — products being sold) ── */
/* صور المنتجات — بالنقر على أيقونة المنتج تُرفع صورة تُحفظ مع المنتج */
const SPIMG_KEY='luma_salon_prod_img';
const salonProdImgs=()=>LumaStore.get(SPIMG_KEY,{});
const SALONPIMG={
  pick(name){
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.onchange=()=>{
      const f=inp.files&&inp.files[0];if(!f)return;
      const rd=new FileReader();
      rd.onload=()=>{const im=new Image();im.onload=()=>{
        const MAX=700,sc=Math.min(1,MAX/Math.max(im.width,im.height));
        const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
        cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
        LumaStore.update(SPIMG_KEY,m=>{m[name]=cv.toDataURL('image/jpeg',0.78);return m;},{});
        SALON.go('products');LUX.toast('حُفظت صورة «'+name+'» ✓','ok');
      };im.src=rd.result;};
      rd.readAsDataURL(f);
    };
    inp.click();
  },
  clear(name){LumaStore.update(SPIMG_KEY,m=>{delete m[name];return m;},{});SALON.go('products');},
};

SCREENS.products=()=>{
  const P=[
    {n:'سيروم ترطيب',c:'عناية',price:180,sold:42,q:24,sc:'green'},
    {n:'طلاء أظافر — مجموعة',c:'أظافر',price:210,sold:38,q:15,sc:'green'},
    {n:'زيت شعر مغذّي',c:'شعر',price:120,sold:31,q:30,sc:'green'},
    {n:'مثبّت مكياج',c:'مكياج',price:130,sold:27,q:18,sc:'green'},
    {n:'كريم أساس',c:'مكياج',price:150,sold:19,q:8,sc:'gold'},
    {n:'ماسك بشرة',c:'عناية',price:95,sold:14,q:3,sc:'gold'},
  ];
  const totUnits=P.reduce((s,p)=>s+p.sold,0);
  const totRev=P.reduce((s,p)=>s+p.sold*p.price,0);
  const best=P.slice().sort((a,b)=>b.sold-a.sold)[0];
  const maxSold=Math.max(...P.map(p=>p.sold));
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">المنتجات المُباعة</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">بيع التجزئة للعميلات · أداء المبيعات هذا الشهر</div></div><button class="btn btn-gold">+ منتج جديد</button></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('bag',19)}</div></div><div class="val">38</div><div class="k">منتج معروض</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('board',19)}</div><div class="delta">▲ 9%</div></div><div class="val">${totUnits}</div><div class="k">وحدة مباعة هذا الشهر</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div><div class="delta">▲ 14%</div></div><div class="val">${totRev.toLocaleString('en')}<span class="u">ر.س</span></div><div class="k">إيراد المنتجات</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val" style="font-size:24px">${best.n}</div><div class="k">الأكثر مبيعاً (${best.sold} وحدة)</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start">
    <div>
      <div class="sec-label">المنتجات <span class="ln"></span></div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">${P.map(p=>{const pim=salonProdImgs()[p.n];return `<div class="card"><div style="display:flex;align-items:flex-start;justify-content:space-between"><div style="position:relative"><div onclick="SALONPIMG.pick('${p.n.replace(/'/g,"\\'")}')" title="${pim?'تغيير صورة المنتج':'إضافة صورة للمنتج'}" style="width:46px;height:46px;border-radius:12px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light);cursor:pointer;overflow:hidden">${pim?`<img src="${pim}" alt="" style="width:100%;height:100%;object-fit:cover"/>`:icon('bag',22)}</div>${pim?`<button onclick="SALONPIMG.clear('${p.n.replace(/'/g,"\\'")}')" title="إزالة الصورة" style="position:absolute;top:-6px;left:-6px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,.7);color:#e29aa6;cursor:pointer;font-size:10px;line-height:1">✕</button>`:`<span style="position:absolute;bottom:-5px;left:-5px;width:17px;height:17px;border-radius:50%;background:var(--gold-deep);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;pointer-events:none">📷</span>`}</div><div style="text-align:left"><div class="num" style="font-size:22px;color:var(--gold-light)">${p.price} <span style="font-family:'IBM Plex Sans Arabic',Cairo;font-size:11px;color:var(--muted)">ر.س</span></div></div></div><div style="font-size:15px;color:var(--white);font-weight:600;margin-top:14px">${p.n}</div><div style="font-size:12px;color:var(--muted)">${p.c}</div><div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft)"><div style="font-size:12px;color:var(--cream)">مباع: <b style="color:var(--white);font-family:'Bodoni Moda',serif;font-size:17px">${p.sold}</b></div><div style="font-size:12px;color:var(--gold-pale)">${(p.sold*p.price).toLocaleString('en')} ر.س</div></div></div>`;}).join('')}</div>
    </div>
    <div class="card"><div class="sec-label">الأكثر مبيعاً <span class="ln"></span></div>${P.slice().sort((a,b)=>b.sold-a.sold).map((p,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:11px 0;${i<P.length-1?'border-bottom:1px solid var(--line-soft)':''}"><span style="font-family:'Bodoni Moda',serif;font-size:18px;color:var(--gold-deep);width:20px;direction:ltr">${i+1}</span><div style="flex:1;min-width:0"><div style="font-size:13.5px;color:var(--white);font-weight:500">${p.n}</div><div class="bar" style="height:6px;background:var(--surface3);border-radius:10px;overflow:hidden;margin-top:5px"><span style="display:block;height:100%;width:${p.sold/maxSold*100}%;background:linear-gradient(90deg,#9c8047,#dbbd81);border-radius:10px"></span></div></div><span class="num" style="font-family:'Bodoni Moda',serif;font-size:17px;color:var(--gold-light);direction:ltr">${p.sold}</span></div>`).join('')}</div>
  </div>`;
};

/* ── SUBSCRIPTIONS ── */
SCREENS.subscriptions=()=>{
  const PK=[
    {n:'باقة الجمال الشهرية',p:'600',per:'شهرياً',subs:24,benefits:['جلستان شهرياً','خصم ١٥٪ على المنتجات','أولوية الحجز']},
    {n:'باقة العناية الفصلية',p:'1,500',per:'كل ٣ أشهر',subs:12,benefits:['٦ جلسات','خصم ٢٠٪','هدية فصلية']},
    {n:'باقة العروس',p:'2,200',per:'لمرة واحدة',subs:7,benefits:['تجربة + يوم العرس','جلسة عناية','تصوير']},
  ];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">اشتراكات العملاء</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">٤٣ مشتركة · إيراد متكرر ٢١٬٤٠٠ ر.س شهرياً</div></div><button class="btn btn-gold">+ باقة اشتراك</button></div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">${PK.map(p=>`<div class="card" style="display:flex;flex-direction:column"><div style="display:flex;align-items:flex-start;justify-content:space-between"><div><div style="font-size:16px;color:var(--white);font-weight:600">${p.n}</div><div style="font-size:12px;color:var(--gold-pale);margin-top:2px">${p.subs} مشتركة نشطة</div></div><div style="width:46px;height:27px;border-radius:20px;background:linear-gradient(120deg,#dbbd81,#9c8047);position:relative"><span style="position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff"></span></div></div><div style="display:flex;align-items:baseline;gap:6px;margin:14px 0"><span class="num" style="font-size:36px;color:var(--gold-light)">${p.p}</span><span style="font-size:12px;color:var(--muted)">ر.س / ${p.per}</span></div><ul style="list-style:none;display:flex;flex-direction:column;gap:9px;padding-top:14px;border-top:1px solid var(--line-soft)">${p.benefits.map(b=>`<li style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--cream)"><span style="color:var(--gold);font-size:8px">◆</span>${b}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="card" style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;border-color:var(--gold-deep)"><div style="font-size:14px;color:var(--gold-pale)">إجمالي الإيراد المتكرر الشهري من الاشتراكات</div><div class="num gold-fill" style="font-size:28px">21,400 ر.س</div></div>`;
};

/* ── FINANCE ── */
SCREENS.finance=()=>{
  const BYSTAFF=[['أمل',38,'#ccab64'],['سارة',30,'#d98a93'],['نورة',20,'#7d9bc0'],['ريم',12,'#6fa86a']];
  const TX=[['دخل خدمات اليوم','+6,840','in'],['مبيعات منتجات','+1,200','in'],['اشتراكات','+2,400','in'],['رواتب وعمولات','−4,800','out'],['إيجار ومصاريف','−1,900','out']];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">مالية الصالون</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">صورة شاملة للإيرادات والمصاريف وصافي الربح</div></div><button class="btn btn-ghost">${icon('wallet',15)} تقرير شهري</button></div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center;margin-bottom:22px">
    <div class="card" style="text-align:center"><div style="font-size:13px;color:var(--gold-pale)">الإيرادات</div><div class="num gold-fill" style="font-size:38px;margin:6px 0">52,400</div><div style="font-size:11px;color:var(--muted)">ر.س هذا الشهر</div></div>
    <div style="font-family:'Bodoni Moda',serif;font-size:24px;color:var(--gold-deep);text-align:center">−</div>
    <div class="card" style="text-align:center"><div style="font-size:13px;color:var(--gold-pale)">المصاريف</div><div class="num" style="font-size:38px;color:var(--red);margin:6px 0">21,300</div><div style="font-size:11px;color:var(--muted)">ر.س هذا الشهر</div></div>
    <div style="font-family:'Bodoni Moda',serif;font-size:24px;color:var(--gold-deep);text-align:center">=</div>
    <div class="card" style="text-align:center;border-color:var(--gold-deep)"><div style="font-size:13px;color:var(--gold-pale)">صافي الربح</div><div class="num gold-fill" style="font-size:38px;margin:6px 0">31,100</div><div style="font-size:11px;color:var(--muted)">ر.س</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start">
    <div class="card"><div class="sec-label">الإيراد حسب الموظفة <span class="ln"></span></div>${BYSTAFF.map(s=>`<div style="display:flex;align-items:center;gap:12px;padding:10px 0"><span style="font-size:13.5px;color:var(--cream);width:60px">${s[0]}</span><div style="flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${s[1]/38*100}%;background:${s[2]};border-radius:10px"></span></div><span class="mono" style="font-size:12px;color:var(--gold-pale);width:34px;text-align:left">${s[1]}%</span></div>`).join('')}</div>
    <div class="card"><div class="sec-label">حركة اليوم <span class="ln"></span></div>${TX.map((t,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;${i<TX.length-1?'border-bottom:1px solid var(--line-soft)':''}"><span style="font-size:13.5px;color:var(--white)">${t[0]}</span><span class="num" style="font-size:17px;color:${t[2]==='in'?'var(--green)':'var(--red)'}">${t[1]} ر.س</span></div>`).join('')}</div>
  </div>`;
};

/* ── BRANCHES ── */
SCREENS.branches=()=>{
  const B=[
    {id:'shatee',n:'فرع الشاطئ',c:'جدة · حي الشاطئ',staff:4,chairs:6,st:'رئيسي',sc:'gold',rev:'52,400'},
    {id:'rawdah',n:'فرع الروضة',c:'جدة · حي الروضة',staff:4,chairs:4,st:'نشط',sc:'green',rev:'34,100'},
  ];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">فروع الصالون</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">فرعان · إدارة موحّدة</div></div><button class="btn btn-gold">+ إضافة فرع</button></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${B.map(b=>`<div class="card"><div style="display:flex;align-items:flex-start;justify-content:space-between"><div style="display:flex;align-items:center;gap:13px"><div style="width:48px;height:48px;border-radius:13px;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('pin',22)}</div><div><div style="font-size:16px;color:var(--white);font-weight:600">${b.n}</div><div style="font-size:12.5px;color:var(--muted)">${b.c}</div></div></div><span class="badge ${b.sc}">${b.st}</span></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line-soft);text-align:center"><div><div class="num" style="font-size:22px;color:var(--white)">${b.staff}</div><div style="font-size:11px;color:var(--muted)">موظفات</div></div><div><div class="num" style="font-size:22px;color:var(--white)">${b.chairs}</div><div style="font-size:11px;color:var(--muted)">كراسي</div></div><div><div class="num" style="font-size:22px;color:var(--gold-light)">${b.rev}</div><div style="font-size:11px;color:var(--muted)">دخل شهري</div></div></div><button class="btn ${typeof CUR_BRANCH!=='undefined'&&CUR_BRANCH===b.id?'btn-gold':'btn-ghost'}" style="width:100%;justify-content:center;margin-top:16px" onclick="BR.go('${b.id}')">${typeof CUR_BRANCH!=='undefined'&&CUR_BRANCH===b.id?'الفرع النشط الآن ✓':'التبديل لهذا الفرع'}</button></div>`).join('')}</div>
  <div class="card" style="margin-top:18px;font-size:13px;color:var(--gold-pale);line-height:2">بيانات كل فرع معزولة تماماً: الحجوزات، المدفوعات، الموارد البشرية، المخزون، والعميلات — بدّلي الفرع من هنا أو من الشريط الجانبي.</div>`;
};

/* ── SETTINGS ── */
SCREENS.settings=()=>{
  const HOURS=[['السبت — الخميس','10:00 ص — 10:00 م'],['الجمعة','2:00 م — 11:00 م']];
  const TOG=[['الحجز الإلكتروني','السماح للعميلات بالحجز عبر لوما',true],['الدفع المسبق','طلب عربون لتأكيد الموعد',true],['الحضور المباشر','إتاحة إضافة حجوزات فورية',true],['تذكير واتساب','تذكير تلقائي قبل الموعد',true]];
  return `
  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:start">
    <div>
      <div class="card" style="margin-bottom:18px"><div class="sec-label">إعدادات الحجز <span class="ln"></span></div>${TOG.map((t,i)=>`<div style="display:flex;align-items:center;gap:14px;padding:14px 0;${i<TOG.length-1?'border-bottom:1px solid var(--line-soft)':''}"><div style="flex:1"><div style="font-size:14.5px;color:var(--white);font-weight:500">${t[0]}</div><div style="font-size:12.5px;color:var(--muted)">${t[1]}</div></div><div style="width:46px;height:27px;border-radius:20px;background:linear-gradient(120deg,#dbbd81,#9c8047);position:relative"><span style="position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff"></span></div></div>`).join('')}</div>
      <div class="card"><div class="sec-label">ساعات العمل <span class="ln"></span></div>${HOURS.map((h,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;${i<HOURS.length-1?'border-bottom:1px solid var(--line-soft)':''}"><span style="font-size:14px;color:var(--white)">${h[0]}</span><span class="mono" style="font-size:12.5px;color:var(--gold-pale)">${h[1]}</span></div>`).join('')}</div>
    </div>
    <div class="card"><div class="sec-label">معلومات الصالون <span class="ln"></span></div>
      ${[['اسم الصالون','صالون لمسة'],['الفرع الرئيسي','جدة · حي الشاطئ'],['عدد الكراسي','٦ كراسي'],['بوابة الدفع','mada + Apple Pay']].map(r=>`<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px"><label style="font-size:12.5px;color:var(--gold-pale)">${r[0]}</label><input value="${r[1]}" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--white);font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:14px;outline:none"/></div>`).join('')}
      <button class="btn btn-gold" style="margin-top:4px">حفظ الإعدادات</button>
    </div>
  </div>`;
};

/* ── INVOICES (POS / sales bills) ── */
SCREENS.invoices=()=>{
  const INV=[
    {id:'INV-2041',cl:'نوف العتيبي',items:'مكياج سهرة + سيروم',staff:'أمل',total:530,pay:'mada',st:'مدفوعة',sc:'green',when:'اليوم · 2:14 م'},
    {id:'INV-2040',cl:'سارة الأحمدي',items:'هيدرافيشل',staff:'نورة',total:480,pay:'Apple Pay',st:'مدفوعة',sc:'green',when:'اليوم · 12:30 م'},
    {id:'INV-2039',cl:'ريم الزهراني',items:'مكياج ناعم',staff:'أمل',total:250,pay:'—',st:'غير مدفوعة',sc:'gold',when:'اليوم · 11:00 ص'},
    {id:'INV-2038',cl:'جواهر الشهري',items:'منيكير جل + طلاء',staff:'ريم',total:370,pay:'نقدًا',st:'مدفوعة',sc:'green',when:'أمس'},
    {id:'INV-2037',cl:'لمياء الحربي',items:'صبغة + قص',staff:'سارة',total:750,pay:'mada',st:'مدفوعة',sc:'green',when:'أمس'},
    {id:'INV-2036',cl:'منيرة الدوسري',items:'تنظيف بشرة',staff:'نورة',total:320,pay:'مستردّة',st:'مستردّة',sc:'soft',when:'قبل يومين'},
  ];
  return `
  <style>.itab{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}.ith,.itr{display:grid;grid-template-columns:0.9fr 1.4fr 1.4fr 0.8fr 0.9fr 1fr 0.9fr;gap:12px;align-items:center;padding:14px 20px}.ith{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600}.itr{border-bottom:1px solid var(--line-soft);transition:background .2s;cursor:pointer}.itr:last-child{border-bottom:none}.itr:hover{background:var(--surface2)}.itr .id{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-light);direction:ltr}.itr .c{font-size:13.5px;color:var(--white);font-weight:500}.itr .m{font-size:12.5px;color:var(--cream)}.itr .tot{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--white);direction:ltr}.itr .when{font-size:11.5px;color:var(--muted)}@media(max-width:1080px){.ith{display:none}.itr{grid-template-columns:1fr auto}.itr .hide{display:none}}</style>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">الفواتير البيعية</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">فواتير الخدمات والمنتجات والمدفوعات</div></div><button class="btn btn-gold">+ فاتورة جديدة</button></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('invoice',19)}</div><div class="delta">▲ 18</div></div><div class="val">142</div><div class="k">فواتير الشهر</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div><div class="delta">▲ 12%</div></div><div class="val">52,400<span class="u">ر.س</span></div><div class="k">إجمالي المفوتر</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('clock',19)}</div></div><div class="val">3</div><div class="k">فواتير غير مدفوعة</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">369<span class="u">ر.س</span></div><div class="k">متوسط قيمة الفاتورة</div></div>
  </div>
  <div class="itab"><div class="ith"><span>رقم الفاتورة</span><span>العميلة</span><span>البنود</span><span>الموظفة</span><span>الطريقة</span><span>الحالة</span><span>الإجمالي</span></div>
  ${INV.map(v=>`<div class="itr"><span class="id">${v.id}</span><span class="c">${v.cl}</span><span class="m hide">${v.items}</span><span class="m hide">${v.staff}</span><span class="m hide">${v.pay}</span><span class="hide"><span class="badge ${v.sc}">${v.st}</span></span><span class="tot">${v.total} ر.س</span></div>`).join('')}
  </div>`;
};

/* ── MARKETING ── */
SCREENS.marketing=()=>{
  const CAMP=[
    {n:'خصم الصيف ٢٠٪',type:'كوبون',code:'SUMMER20',used:48,rev:'12,400',st:'نشط',sc:'green'},
    {n:'عرض العروس',type:'باقة',code:'BRIDE',used:14,rev:'29,800',st:'نشط',sc:'green'},
    {n:'جمعة بيضاء',type:'خصم فلاش',code:'FRIDAY',used:32,rev:'8,600',st:'منتهٍ',sc:'soft'},
  ];
  const CH=[['المتجر (لوما)',44,'#ccab64'],['انستقرام',30,'#d98a93'],['واتساب',16,'#6fa86a'],['إحالات',10,'#7d9bc0']];
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">تسويق الصالون</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">الحملات والعروض وقنوات الوصول</div></div><button class="btn btn-gold">+ حملة جديدة</button></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('mega',19)}</div></div><div class="val">3</div><div class="k">حملات نشطة</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div><div class="delta">▲ 22%</div></div><div class="val">94</div><div class="k">عميلات جدد هذا الشهر</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">50,800<span class="u">ر.س</span></div><div class="k">إيراد من الحملات</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">4.9<span class="u">/5</span></div><div class="k">سمعة الصالون</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:18px;align-items:start">
    <div>
      <div class="sec-label">الحملات والعروض <span class="ln"></span></div>
      ${CAMP.map(c=>`<div class="card" style="display:flex;align-items:center;gap:15px;margin-bottom:11px;padding:16px 18px"><div style="width:44px;height:44px;border-radius:11px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('mega',20)}</div><div style="flex:1"><div style="font-size:15px;color:var(--white);font-weight:600">${c.n}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${c.type} · <span style="font-family:'IBM Plex Mono',monospace;color:var(--gold-pale);direction:ltr">${c.code}</span></div></div><div style="text-align:center"><div class="num" style="font-size:18px;color:var(--white)">${c.used}</div><div style="font-size:10.5px;color:var(--muted)">استخدام</div></div><div style="text-align:center"><div class="num" style="font-size:18px;color:var(--gold-light)">${c.rev}</div><div style="font-size:10.5px;color:var(--muted)">ر.س إيراد</div></div><span class="badge ${c.sc}">${c.st}</span></div>`).join('')}
    </div>
    <div class="card"><div class="sec-label">قنوات الوصول <span class="ln"></span></div>${CH.map(c=>`<div style="display:flex;align-items:center;gap:12px;padding:11px 0"><span style="font-size:13px;color:var(--cream);width:108px">${c[0]}</span><div style="flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${c[1]/44*100}%;background:${c[2]};border-radius:10px"></span></div><span class="mono" style="font-size:12px;color:var(--gold-pale);width:34px;text-align:left">${c[1]}%</span></div>`).join('')}
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line-soft);display:flex;align-items:center;gap:12px"><div style="width:40px;height:40px;border-radius:11px;background:rgba(156,124,58,0.16);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('users',19)}</div><div><div style="font-size:13.5px;color:var(--white);font-weight:600">برنامج الإحالة</div><div style="font-size:12px;color:var(--muted)">٢٨ عميلة دعت 39 صديقة</div></div></div>
    </div>
  </div>`;
};

/* ── INVENTORY (المخزون + إضافة) ── */
window.INVENTORY=[
  {n:'كريم أساس — درجات',cat:'مكياج',q:8,min:10,cost:90,sup:'مورّد الجمال'},
  {n:'رموش صناعية',cat:'مكياج',q:6,min:10,cost:25,sup:'لاش برو'},
  {n:'صبغة شعر — بنّي',cat:'شعر',q:18,min:8,cost:55,sup:'كلر لاين'},
  {n:'زيت كيراتين',cat:'شعر',q:4,min:6,cost:120,sup:'كلر لاين'},
  {n:'محلول هيدرافيشل',cat:'بشرة',q:22,min:8,cost:140,sup:'سكن كير'},
  {n:'جل أظافر — ألوان',cat:'أظافر',q:30,min:12,cost:18,sup:'نيل بار'},
  {n:'مثبّت مكياج (سبراي)',cat:'مكياج',q:3,min:8,cost:60,sup:'مورّد الجمال'},
];
/* الكميات المخصومة تلقائياً (وصفات الخدمات) تبقى بعد التحديث */
{const iq=LumaStore.get(INVQ_KEY,null);if(iq)window.INVENTORY.forEach(it=>{if(iq[it.n]!=null)it.q=iq[it.n];});}
function invStatus(it){if(it.q<=Math.ceil(it.min*0.4))return['يحتاج طلب','gold'];if(it.q<it.min)return['منخفض','gold'];return['متوفر','green'];}
window.SALON_INV={
  open(){document.getElementById('inv-modal').style.display='flex';},
  close(){document.getElementById('inv-modal').style.display='none';},
  add(){
    const g=id=>document.getElementById(id).value.trim();
    const n=g('iv-n');if(!n){document.getElementById('iv-n').focus();return;}
    window.INVENTORY.unshift({n,cat:g('iv-cat')||'عام',q:+g('iv-q')||0,min:+g('iv-min')||5,cost:+g('iv-cost')||0,sup:g('iv-sup')||'—'});
    this.close();SALON.go('inventory');
  }
};
SCREENS.inventory=()=>{
  const items=window.INVENTORY;
  const low=items.filter(i=>i.q<i.min).length;
  const value=items.reduce((s,i)=>s+i.q*i.cost,0);
  return `
  <style>.ivtab{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden}.ivh,.ivr{display:grid;grid-template-columns:2fr 1fr 0.9fr 0.9fr 1fr 1.1fr;gap:12px;align-items:center;padding:14px 20px}.ivh{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600}.ivr{border-bottom:1px solid var(--line-soft)}.ivr:last-child{border-bottom:none}.ivr:hover{background:var(--surface2)}.ivr .nm{font-size:14px;color:var(--white);font-weight:500}.ivr .num{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--white);direction:ltr}.ivr .num.warn{color:var(--gold-light)}.ivr .mut{font-size:13px;color:var(--cream)}.bar{height:6px;background:var(--surface3);border-radius:10px;overflow:hidden;margin-top:5px}.bar span{display:block;height:100%;border-radius:10px}@media(max-width:1080px){.ivh{display:none}.ivr{grid-template-columns:1fr auto}.ivr .hide{display:none}}
  .modal{display:none;position:fixed;inset:0;z-index:90;background:rgba(8,6,4,0.7);backdrop-filter:blur(6px);align-items:center;justify-content:center}
  .sheet{width:480px;max-width:92vw;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 30px 80px rgba(0,0,0,0.6)}
  .sheet h3{font-size:18px;color:var(--white);font-weight:600;margin-bottom:4px}.sheet .sub{font-size:12.5px;color:var(--muted);margin-bottom:18px}
  .frow{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}.frow label{font-size:12.5px;color:var(--gold-pale)}.fin{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--white);font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:14px;outline:none}.fin:focus{border-color:var(--gold-deep)}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}</style>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px"><div><div style="font-weight:600;font-size:19px;color:var(--white)">مخزون الصالون</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">المستلزمات وتنبيهات النفاد — تُخصم تلقائياً مع كل خدمة مدفوعة</div></div><div style="display:flex;gap:10px"><button class="btn btn-ghost" onclick="STOCK.recipesModal()">وصفات الخدمات</button><button class="btn btn-gold" onclick="SALON_INV.open()">${icon('plus',16)} إضافة للمخزون</button></div></div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('boxes',19)}</div></div><div class="val">${items.length}</div><div class="k">أصناف في المخزون</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('clock',19)}</div>${low?`<div class="delta" style="color:var(--gold-light);background:rgba(156,124,58,0.16)">⚠ ${low}</div>`:''}</div><div class="val">${low}</div><div class="k">أصناف تحت الحد الأدنى</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">${value.toLocaleString('en')}<span class="u">ر.س</span></div><div class="k">قيمة المخزون</div></div>
  </div>
  <div class="ivtab"><div class="ivh"><span>الصنف</span><span>القسم</span><span>المتوفر</span><span>الحد الأدنى</span><span>المورّد</span><span>الحالة</span></div>
  ${items.map(it=>{const[lb,sc]=invStatus(it);const pct=Math.min(100,it.q/(it.min*1.6)*100);const col=sc==='green'?'#6fa86a':'#ccab64';const uses=typeof STOCK!=='undefined'?STOCK.usesOf(it.n):0;return `<div class="ivr"><div><div class="nm">${it.n}</div>${uses?`<div style="font-size:11px;color:var(--muted);margin-top:2px">يُستهلك في ${uses} ${uses>2?'خدمات':'خدمة'}</div>`:''}<div class="bar hide"><span style="width:${pct}%;background:${col}"></span></div></div><span class="mut hide">${it.cat}</span><span class="num ${it.q<it.min?'warn':''}">${it.q}</span><span class="num mut hide" style="color:var(--muted)">${it.min}</span><span class="mut hide">${it.sup}</span><span><span class="badge ${sc}">${lb}</span></span></div>`;}).join('')}
  </div>
  <div class="modal" id="inv-modal" onclick="if(event.target===this)SALON_INV.close()">
    <div class="sheet">
      <h3>إضافة صنف للمخزون</h3><div class="sub">املأي بيانات الصنف الجديد</div>
      <div class="frow"><label>اسم الصنف</label><input class="fin" id="iv-n" placeholder="مثالًا: كريم أساس"/></div>
      <div class="two"><div class="frow"><label>القسم</label><input class="fin" id="iv-cat" placeholder="مكياج / شعر..."/></div><div class="frow"><label>المورّد</label><input class="fin" id="iv-sup" placeholder="اسم المورّد"/></div></div>
      <div class="two"><div class="frow"><label>الكمية المتوفرة</label><input class="fin" id="iv-q" type="number" placeholder="0"/></div><div class="frow"><label>الحد الأدنى</label><input class="fin" id="iv-min" type="number" placeholder="5"/></div></div>
      <div class="frow"><label>تكلفة الوحدة (ر.س)</label><input class="fin" id="iv-cost" type="number" placeholder="0"/></div>
      <div style="display:flex;gap:12px;margin-top:8px"><button class="btn btn-gold" style="flex:1;justify-content:center" onclick="SALON_INV.add()">إضافة</button><button class="btn btn-ghost" onclick="SALON_INV.close()">إلغاء</button></div>
    </div>
  </div>`;
};


/* ── فاتورة ZATCA (المرحلة الأولى): TLV بالحقول الخمسة → Base64 → QR ── */
function zatcaQR(seller,vatno,p){
  try{
    const enc=new TextEncoder();
    const tlv=(tag,str)=>{const b=enc.encode(str);const out=new Uint8Array(2+b.length);out[0]=tag;out[1]=b.length;out.set(b,2);return out;};
    const parts=[tlv(1,seller),tlv(2,vatno),tlv(3,p.date+'T12:00:00Z'),tlv(4,p.total.toFixed(2)),tlv(5,p.vat.toFixed(2))];
    const all=new Uint8Array(parts.reduce((t,x)=>t+x.length,0));
    let o=0;parts.forEach(x=>{all.set(x,o);o+=x.length;});
    const b64=btoa(String.fromCharCode(...all));
    const qr=window.qrcode(0,'M');qr.addData(b64);qr.make();
    return `<img src="${qr.createDataURL(3,2)}" alt="ZATCA QR" style="width:88px;height:88px;border-radius:8px;border:1px solid #e4daca"/>`;
  }catch(e){return '';}
}

const NAV=[
  {id:'overview',label:'نظرة عامة',icon:'grid',crumb:'SALON'},
  {id:'board',label:'لوحة الحجوزات',icon:'board',crumb:'SALON'},
  {id:'hr',label:'الطاقم والموارد البشرية',icon:'staff',crumb:'SALON'},
  {id:'page',label:'صفحتي والرابط',icon:'pin',crumb:'GROWTH'},
  {id:'clients',label:'العملاء',icon:'users',crumb:'SALON'},
  {id:'services',label:'الخدمات',icon:'scissors',crumb:'SALON'},
  {id:'products',label:'المنتجات',icon:'bag',crumb:'SALON'},
  {id:'inventory',label:'المخزون',icon:'boxes',crumb:'SALON'},
  {id:'subscriptions',label:'الاشتراكات',icon:'ticket',crumb:'SALON'},
  {id:'invoices',label:'الفواتير البيعية',icon:'invoice',crumb:'FINANCE'},
  {id:'marketing',label:'التسويق',icon:'mega',crumb:'GROWTH'},
  {id:'finance',label:'المالية',icon:'wallet',crumb:'FINANCE'},
  {id:'reports',label:'التقارير',icon:'chart',crumb:'FINANCE'},
  {id:'branches',label:'الفروع',icon:'pin',crumb:'SALON'},
  {id:'settings',label:'الإعدادات',icon:'gear',crumb:'SYSTEM'},
];
const NAV_FLAT={};NAV.forEach(n=>NAV_FLAT[n.id]=n);
document.getElementById('sb-nav').innerHTML=NAV.map(it=>`<div class="nav-item" data-id="${it.id}" onclick="SALON.go('${it.id}')"><span class="ico">${icon(it.icon,20)}</span><span class="lbl">${it.label}</span><span class="dot"></span></div>`).join('');

const SALON={
  go(id){
    if(id==='staff'){HR.tab='staff';id='hr';}
    const it=NAV_FLAT[id];if(!it)return;location.hash=id;
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.id===id));
    document.getElementById('tb-crumb').textContent=it.crumb;document.getElementById('tb-title').textContent=it.label;
    const host=document.getElementById('screen');host.classList.remove('fade-in');void host.offsetWidth;host.classList.add('fade-in');
    if(SCREENS[id])host.innerHTML=SCREENS[id]();
    else host.innerHTML=`<div class="empty-screen"><div class="ico">${icon(it.icon,30)}</div><h3>${it.label}</h3><p>هذه الشاشة ضمن المراحل القادمة. القائمة ولوحة الحجوزات تعمل بالكامل.</p></div>`;
    window.scrollTo({top:0});
  },
  boardView:'grid',
  setBoardView(v){this.boardView=v;this.go('board');},
  /* ─── unified booking / blocked-time modal (live availability) ─── */
  newBooking(pre){SALON.bookingForm((pre&&pre.kind)||'appt',pre||{});},
  bookingForm(kind,pre){
    pre=pre||{};
    const SVC=SVC_CATALOG;
    const reasons=['بريك / استراحة','اجتماع','حجز خارجي','تدريب','مشغولة — أخرى'];
    const durs=[[1,'30 دقيقة'],[2,'ساعة'],[3,'ساعة ونصف'],[4,'ساعتان']];
    const preStaff=pre.staff?STAFF.find(s=>s.id===pre.staff):null;
    const body=`
      <div class="lux-seg">
        <button type="button" data-k="appt" class="${kind!=='block'?'on':''}">${icon('calendar',15)} موعد عميلة</button>
        <button type="button" data-k="block" class="${kind==='block'?'on':''}">${icon('ban',15)} وقت محجوب</button>
      </div>
      <div id="bkAppt" style="${kind==='block'?'display:none':''}">
        <div class="lux-f"><label>اسم العميلة</label><input name="client" list="bkClients" placeholder="اكتبي الاسم أو اختاري من عميلاتك…"/>
          <datalist id="bkClients">${CLIENTS.map(c=>`<option value="${c.n}">`).join('')}</datalist></div>
        <div class="lux-f"><label>الخدمة <span style="font-size:10px;color:var(--muted)">— كل خدمات الصالون</span></label>
          <select name="service">${SVC.map(([n,d,p],i)=>`<option value="${n}" ${i===0?'selected':''}>${n} — ${p} ر.س · ${d*30} دقيقة</option>`).join('')}</select></div>
      </div>
      <div id="bkBlock" style="${kind==='block'?'':'display:none'}">
        <div class="lux-f"><label>السبب</label><select name="reason">${reasons.map(r=>`<option>${r}</option>`).join('')}</select></div>
      </div>
      <div class="lux-f"><label>الموظفة / الفنانة <span style="font-size:10px;color:var(--muted)">— كل الخبيرات</span></label>
        <select name="staffq">${STAFF.map(s=>{
          const off=hrOnLeaveToday(s.id)?' — في إجازة':(spOf(s.id).status!=='active'?' — موقوفة':'');
          const sel=(preStaff?preStaff.id===s.id:s===STAFF[0])?'selected':'';
          return `<option value="${s.n}" ${sel}>${s.n} — ${s.role}${off}</option>`;}).join('')}</select></div>
      <div class="lux-two">
        <div class="lux-f"><label>الوقت</label><select name="start"></select></div>
        <div class="lux-f"><label>المدة</label><select name="dur">${durs.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
      <div id="bkAvail" style="font-size:12.5px;margin:-4px 0 12px"></div>
      <div id="bkSum" style="background:#0e0d11;border:1px solid var(--line,#26242d);border-radius:9px;padding:11px 14px;font-size:13px;color:var(--gold-pale,#e6ce95);margin-bottom:14px"></div>
      <button class="lux-btn lux-gold" data-ok style="width:100%"></button>`;
    LUX.modal('إضافة إلى لوحة اليوم',body,{onMount(ov,close){
      let k=kind==='block'?'block':'appt';
      const q=n=>ov.querySelector('[name='+n+']');
      const seg=ov.querySelectorAll('.lux-seg button');
      const okBtn=ov.querySelector('[data-ok]');
      /* البحث بالاسم: نحوّل نص الحقل إلى سجل فعلي */
      const staffOf=()=>{const v=q('staffq').value.trim();return STAFF.find(s=>s.n===v)||STAFF.find(s=>v&&s.n.startsWith(v))||null;};
      const svcOf=()=>{const v=q('service').value.trim();return SVC.find(s=>s[0]===v)||SVC.find(s=>v&&s[0].startsWith(v))||null;};
      const clash=(staff,start,dur)=>APPTS.some(b=>b.staff===staff&&b.st!=='cancelled'&&b.start<start+dur&&start<b.start+b.dur);
      function refreshTimes(){
        const st=staffOf();const dur=+q('dur').value;const cur=q('start').value;
        if(!st){q('start').innerHTML='';refreshSummary();return;}
        q('start').innerHTML=Array.from({length:SLOTS}).map((_,i)=>{
          const busy=i+dur>SLOTS||clash(st.id,i,dur);
          return `<option value="${i}" ${busy?'disabled':''}>${slotLabel(i)}${busy?' — مشغول':''}</option>`;
        }).join('');
        const want=pre.start!=null&&q('start').dataset.init!=='1'?String(pre.start):cur;
        q('start').dataset.init='1';
        const opt=[...q('start').options].find(o=>o.value===want&&!o.disabled)||[...q('start').options].find(o=>!o.disabled);
        if(opt)q('start').value=opt.value;
        refreshSummary();
      }
      function refreshSummary(){
        const st=staffOf();const sv=svcOf();const start=+q('start').value;const dur=+q('dur').value;
        const av=ov.querySelector('#bkAvail');
        const offToday=st?(hrOnLeaveToday(st.id)||spOf(st.id).status!=='active'):false;
        const ok=st&&(k==='block'||sv)&&!isNaN(start)&&!clash(st.id,start,dur)&&start+dur<=SLOTS&&(k==='block'||!offToday);
        av.innerHTML=!st?'<span style="color:#e29aa6">✗ اكتبي اسم فنانة من القائمة</span>'
          :k!=='block'&&!sv?'<span style="color:#e29aa6">✗ اكتبي اسم خدمة من القائمة</span>'
          :k!=='block'&&offToday?'<span style="color:#e29aa6">✗ '+st.n+' محظورة الحجز اليوم (إجازة أو موقوفة)</span>'
          :isNaN(start)?'<span style="color:#e29aa6">✗ لا يوجد وقت متاح بهذه المدة</span>'
          :'<span style="color:#9fce99">✓ الوقت متاح</span>';
        const range=isNaN(start)?'—':slotLabel(start)+' – '+slotLabel(start+dur);
        if(k==='block'){
          ov.querySelector('#bkSum').innerHTML=`<span style="display:inline-flex;vertical-align:-3px;color:#e29aa6">${icon('ban',14)}</span> حجب <b style="color:var(--white,#f6f2ec)">${q('reason').value}</b> · ${st?st.n:'—'} · <bdo dir="ltr">${range}</bdo>`;
          okBtn.textContent='حجب الوقت';
        }else{
          ov.querySelector('#bkSum').innerHTML=`<span style="display:inline-flex;vertical-align:-3px;color:var(--gold-light,#ccab64)">${icon('calendar',14)}</span> <b style="color:var(--white,#f6f2ec)">${q('client').value.trim()||'…'}</b> · ${sv?sv[0]:'—'} · ${st?st.n:'—'} · <bdo dir="ltr">${range}</bdo> · <b style="color:var(--gold-light,#ccab64)">${sv?sv[2]:'—'} ر.س</b>`;
          okBtn.textContent='تأكيد الحجز';
        }
        okBtn.style.opacity=ok?'1':'0.45';okBtn.dataset.ok2=ok?'1':'';
      }
      seg.forEach(b=>b.onclick=()=>{
        k=b.dataset.k;seg.forEach(x=>x.classList.toggle('on',x===b));
        ov.querySelector('#bkAppt').style.display=k==='appt'?'':'none';
        ov.querySelector('#bkBlock').style.display=k==='block'?'':'none';
        refreshSummary();
      });
      q('staffq').onchange=refreshTimes;q('dur').onchange=refreshTimes;
      q('start').onchange=refreshSummary;q('reason').onchange=refreshSummary;
      q('client').oninput=refreshSummary;
      q('service').onchange=()=>{const sv=svcOf();if(sv)q('dur').value=sv[1];refreshTimes();};
      /* مزامنة المدة مع الخدمة المختارة عند الفتح */
      if(k!=='block'){const sv0=svcOf();if(sv0)q('dur').value=sv0[1];}
      refreshTimes();
      okBtn.onclick=()=>{
        const st=staffOf();const sv=svcOf();
        if(!okBtn.dataset.ok2){LUX.toast(!st?'اختاري فنانة من القائمة':k==='appt'&&!sv?'اختاري خدمة من القائمة':'اختاري وقتاً متاحاً أولاً','err');return;}
        const start=+q('start').value, dur=+q('dur').value;
        if(k==='appt'&&!q('client').value.trim()){q('client').style.borderColor='#c0566a';q('client').focus();return;}
        APPTS.push(k==='block'
          ?{id:Date.now(),staff:st.id,start,dur,client:q('reason').value,service:'وقت محجوب',st:'blocked',custom:true}
          :{id:Date.now(),staff:st.id,start,dur,client:q('client').value.trim(),service:sv[0],st:'confirmed',custom:true});
        saveAppts();close();SALON.go('board');
        try{window.LumaEvents&&LumaEvents.push(k==='block'?'block':'booking',k==='block'
          ?'وقت محجوب بلوحة صالون لمسة: '+st.n+' — '+q('reason').value+' ('+slotLabel(start)+')'
          :'حجز من لوحة صالون لمسة: '+q('client').value.trim()+' · '+sv[0]+' مع '+st.n+' ('+slotLabel(start)+')','salon.html#board');}catch(e){}
        LUX.toast(k==='block'
          ?'حُجب وقت '+st.n+' <bdo dir="ltr">'+slotLabel(start)+'</bdo> ✓'
          :'تم حجز '+q('client').value.trim()+' مع '+st.n+' الساعة '+slotLabel(start)+' ✓','ok');
      };
    }});
  },
  apptDetail(id){
    const a=APPTS.find(x=>String(x.id)===String(id));if(!a)return;
    const s=STAFF.find(x=>x.id===a.staff)||{n:'—'};
    const block=a.st==='blocked';
    const paid=block?null:paidOf(a.id);
    const price=block?0:svcPrice(a.service);
    LUX.modal(block?'وقت محجوب':'تفاصيل الموعد',`
      <div class="lux-row"><span class="k">${block?'السبب':'العميلة'}</span><span class="v">${a.client}</span></div>
      ${block?'':`<div class="lux-row"><span class="k">الخدمة</span><span class="v">${a.service}</span></div>`}
      <div class="lux-row"><span class="k">الموظفة</span><span class="v">${s.n}</span></div>
      <div class="lux-row"><span class="k">الوقت</span><span class="v" dir="ltr">${slotLabel(a.start)} – ${slotLabel(a.start+a.dur)}</span></div>
      ${block?'':`<div class="lux-row"><span class="k">قيمة الخدمة</span><span class="v" style="color:var(--gold-light,#ccab64)">${price} ر.س</span></div>`}
      ${paid?`<div class="lux-row"><span class="k">حالة الدفع</span><span class="v" style="color:#9fce99">مدفوعة ✓ · ${paid.method} · فاتورة ${paid.no}</span></div>`:''}
      <div class="lux-foot" style="margin-top:16px;flex-wrap:wrap">
        <button class="lux-btn lux-ghost" data-c style="flex:1">إغلاق</button>
        ${block?`<button class="lux-btn" data-del style="flex:1;background:#b14a5c22;border:1px solid #b14a5c;color:#e29aa6">إزالة الحجب</button>`
          :paid?`<button class="lux-btn lux-gold" data-inv style="flex:1.4">🖨 عرض / طباعة الفاتورة</button>`
          :`<button class="lux-btn lux-ghost" data-del style="flex:1;border-color:#7c4a55;color:#e29aa6">إلغاء الحجز</button>
             <button class="lux-btn lux-gold" data-pay style="flex:1.6">💳 الدفع وإصدار الفاتورة</button>`}
      </div>`,{onMount(ov,close){
      ov.querySelector('[data-c]').onclick=close;
      const del=ov.querySelector('[data-del]');
      if(del)del.onclick=()=>{
        const i=APPTS.findIndex(x=>String(x.id)===String(id));if(i>-1)APPTS.splice(i,1);
        saveAppts();close();SALON.go('board');
        LUX.toast(block?'أُزيل الوقت المحجوب ✓':'أُلغي الحجز','ok');
      };
      const pay=ov.querySelector('[data-pay]');
      if(pay)pay.onclick=()=>{close();SALON.payFlow(a.id);};
      const inv=ov.querySelector('[data-inv]');
      if(inv)inv.onclick=()=>{close();SALON.showInvoice(a.id);};
    }});
  },
  payFlow(id){
    const a=APPTS.find(x=>String(x.id)===String(id));if(!a)return;
    const price=svcPrice(a.service);
    const METHODS=[['mada','مدى'],['apple','Apple Pay'],['card','بطاقة ائتمانية'],['tabby','تابي · تقسيط'],['tamara','تمارا · تقسيط'],['cash','نقداً']];
    LUX.modal('إتمام الدفع',`
      <div class="lux-lead">${a.client} · ${a.service} · <b style="color:var(--gold-light,#ccab64)">${price} ر.س</b></div>
      <div class="lux-f"><label>طريقة الدفع</label>
        <div class="lux-chips" id="payM">${METHODS.map(([v,l],i)=>`<button type="button" class="lux-chip ${i===0?'on':''}" data-v="${l}">${l}</button>`).join('')}</div></div>
      <div class="lux-f"><label>بقشيش إلكتروني للموظفة (اختياري)</label><input name="tip" dir="ltr" style="text-align:right" placeholder="0"/></div>
      <div class="lux-row"><span class="k">قيمة الخدمة</span><span class="v" dir="ltr">${price.toFixed(2)} SAR</span></div>
      <div class="lux-row"><span class="k">ضريبة القيمة المضافة 15٪</span><span class="v" dir="ltr">${(price*0.15).toFixed(2)} SAR</span></div>
      <div class="lux-row"><span class="k" style="color:var(--gold-light,#ccab64);font-weight:700">الإجمالي</span><span class="v" id="payT" style="color:var(--gold-light,#ccab64);font-weight:700" dir="ltr">${(price*1.15).toFixed(2)} SAR</span></div>
      <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:12px">تأكيد الدفع</button>`,{onMount(ov,close){
      ov.querySelectorAll('#payM .lux-chip').forEach(c=>c.onclick=()=>{ov.querySelectorAll('#payM .lux-chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');});
      const tipEl=ov.querySelector('[name=tip]');
      tipEl.oninput=()=>{const t=parseFloat(tipEl.value)||0;ov.querySelector('#payT').textContent=(price*1.15+t).toFixed(2)+' SAR';};
      ov.querySelector('[data-ok]').onclick=()=>{
        const method=ov.querySelector('#payM .lux-chip.on').dataset.v;
        const tip=Math.max(0,parseFloat(tipEl.value)||0);
        const btn=ov.querySelector('[data-ok]');btn.disabled=true;btn.innerHTML='<span class="lux-spin" style="width:18px;height:18px;border-width:2px;margin:0 auto;display:block"></span>';
        setTimeout(()=>{
          a.st='confirmed';saveAppts();
          const total=+(price*1.15+tip).toFixed(2);
          markPaid(a.id,{no:nextInvNo(),method,tip,amount:price,vat:+(price*0.15).toFixed(2),total,date:new Date().toISOString().slice(0,10)});
          const pts=typeof loyAward==='function'?loyAward(a.client,total):0;
          const stk=typeof stockConsume==='function'?stockConsume(a.service):{alerts:[]};
          /* طلب تقييم ما بعد الزيارة — يفتح في review.html ويُنشر موثقاً في المتجر */
          try{LumaStore.update('luma_review_reqs',l=>{l.push({id:'rv'+a.id+'_'+Date.now(),client:a.client,service:a.service,staff:(STAFF.find(x=>x.id===a.staff)||{n:''}).n,salon:'صالون لمسة',date:new Date().toISOString().slice(0,10),st:'sent'});return l;},[]);}catch(e){}
          setTimeout(()=>LUX.toast('📱 أُرسل للعميلة رابط تقييم الزيارة عبر واتساب (محاكاة)','ok'),2800);
          close();SALON.go('board');
          try{window.LumaEvents&&LumaEvents.push('pay','دفعة مستلمة بصالون لمسة: '+a.client+' · '+a.service+' — '+total.toLocaleString('en')+' ر.س ('+method+')','salon.html#invoices');}catch(e){}
          LUX.toast('تم الدفع بنجاح عبر '+method+' ✓'+(pts?' — أُضيفت '+pts+' نقطة ولاء لرصيد '+a.client:''),'ok');
          if(stk.alerts.length)setTimeout(()=>LUX.toast('⚠ اقترب النفاد: '+stk.alerts.join('، ')+' — اطلبي من المورّد','warn'),1500);
          setTimeout(()=>SALON.showInvoice(a.id),650);
        },900);
      };
    }});
  },
  invoiceHTML(id){
    const a=APPTS.find(x=>String(x.id)===String(id));const p=paidOf(id);if(!a||!p)return '';
    const s=STAFF.find(x=>x.id===a.staff)||{n:'—'};
    /* هوية الفاتورة تُقرأ من «صفحتي والرابط»: الاسم، الشعار، العنوان، الرقم الضريبي، ولون الثيم */
    const c=pageCfg();
    const ac=pageThemeOf(c).ac;   /* يشمل الثيم المخصص من محرر المظهر */
    return `
    <div id="lumaInv" style="background:#fdfbf7;color:#2e241b;border-radius:14px;padding:28px 26px;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${ac};padding-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          ${c.logo?`<img src="${c.logo}" alt="" style="width:46px;height:46px;border-radius:12px;object-fit:cover;border:1px solid ${ac}"/>`
            :`<span style="width:46px;height:46px;border-radius:12px;border:1px solid ${ac};color:${ac};display:inline-flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:21px">${(c.title||'L').charAt(0)}</span>`}
          <div><div style="font-weight:700;font-size:17px;color:#2e241b">${c.title||'LUMA'}</div>
            <div style="font-size:10.5px;color:#8d8172;margin-top:2px">${c.address||''}${c.phone?` · <bdo dir="ltr">${c.phone}</bdo>`:''}</div>
            <div style="font-family:'Bodoni Moda',serif;font-size:10px;letter-spacing:.24em;color:${ac};margin-top:3px">LUMA BEAUTY SYSTEMS</div></div>
        </div>
        <div style="text-align:left;font-size:11.5px;color:#54473a"><div style="font-weight:700;font-size:13px;color:#2e241b">فاتورة ضريبية مبسطة</div>
          <div dir="ltr">${p.no}</div><div dir="ltr">${p.date}</div>
          ${c.vatno?`<div style="font-size:10px;color:#8d8172;margin-top:2px">الرقم الضريبي: <bdo dir="ltr">${c.vatno}</bdo></div>`:''}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:12px 0;border-bottom:1px solid #e4daca">
        <span>العميلة: <b>${a.client}</b></span><span>الموظفة: <b>${s.n}</b></span><span dir="ltr">${slotLabel(a.start)}</span>
      </div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:6px">
        <tr style="color:${ac};font-size:11.5px"><td style="padding:9px 0">الخدمة</td><td style="text-align:left">المبلغ</td></tr>
        <tr style="border-top:1px solid #efe8db"><td style="padding:9px 0">${a.service}</td><td style="text-align:left" dir="ltr">${p.amount.toFixed(2)} SAR</td></tr>
        <tr style="border-top:1px solid #efe8db;color:#54473a;font-size:12px"><td style="padding:8px 0">ضريبة القيمة المضافة (15٪)</td><td style="text-align:left" dir="ltr">${p.vat.toFixed(2)} SAR</td></tr>
        ${p.tip?`<tr style="color:#54473a;font-size:12px"><td style="padding:8px 0">بقشيش الموظفة</td><td style="text-align:left" dir="ltr">${p.tip.toFixed(2)} SAR</td></tr>`:''}
        <tr style="border-top:2px solid ${ac};font-weight:700;font-size:15px"><td style="padding:11px 0">الإجمالي المدفوع · ${p.method}</td><td style="text-align:left;color:${ac}" dir="ltr">${p.total.toFixed(2)} SAR</td></tr>
      </table>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;border-top:1px dashed #e4daca;padding-top:12px">
        <div style="font-size:10.5px;color:#8d8172;line-height:1.9">رمز الفاتورة الإلكترونية<br><span style="color:#b3a794">متوافق مع «فاتورة» — المرحلة الأولى (ZATCA)</span></div>
        ${zatcaQR(c.title||'LUMA',c.vatno||'000000000000000',p)}
      </div>
      <div style="text-align:center;font-size:11px;color:#8d8172;margin-top:12px">شكراً لكِ 🌸 نسعد بزيارتك دائماً${c.slug?` · luma.beauty/${c.slug}`:''}</div>
    </div>`;
  },
  showInvoice(id){
    const html=SALON.invoiceHTML(id);if(!html)return;
    LUX.modal('الفاتورة',html+`
      <div class="lux-foot" style="margin-top:14px">
        <button class="lux-btn lux-ghost" data-c style="flex:1">إغلاق</button>
        <button class="lux-btn lux-gold" data-pr style="flex:1.4">🖨 طباعة الفاتورة</button>
      </div>`,{onMount(ov,close){
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-pr]').onclick=()=>SALON.printInvoice(id);
    }});
  },
  /* إضافة / تحرير / حذف خدمة من الكتالوج */
  svcForm(editName){
    const s=editName?SVC_CATALOG.find(x=>x[0]===editName):null;
    const cats=[...new Set(SVC_CATALOG.map(x=>x[3]||'أخرى'))];
    const DURS=[[1,'30 دقيقة'],[2,'60 دقيقة'],[3,'90 دقيقة'],[4,'120 دقيقة'],[5,'150 دقيقة'],[6,'180 دقيقة']];
    LUX.modal(s?'تحرير خدمة':'خدمة جديدة',`
      <div class="lux-f"><label>اسم الخدمة</label><input id="svN" value="${s?s[0]:''}" placeholder="مثال: باديكير سبا"/></div>
      <div style="display:flex;gap:10px">
        <div class="lux-f" style="flex:1"><label>السعر (ر.س)</label><input id="svP" type="number" min="0" value="${s?s[2]:''}" dir="ltr" style="text-align:right"/></div>
        <div class="lux-f" style="flex:1"><label>المدة</label><select id="svD">${DURS.map(([v,l])=>`<option value="${v}" ${s&&s[1]===v?'selected':''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="lux-f"><label>القسم</label>
        <div class="lux-chips" id="svC">${cats.map((c,i)=>`<button type="button" class="lux-chip ${s?(s[3]===c?'on':''):(i===0?'on':'')}" data-v="${c}">${c}</button>`).join('')}</div>
        <input id="svCX" placeholder="أو قسم جديد…" style="margin-top:7px"/></div>
      <div class="lux-foot" style="margin-top:14px">
        ${s?'<button class="lux-btn lux-ghost" data-del style="flex:1;border-color:#7c4a55;color:#e29aa6">حذف الخدمة</button>':''}
        <button class="lux-btn lux-gold" data-ok style="flex:1.6">${s?'حفظ التعديلات':'إضافة الخدمة'}</button>
      </div>`,{onMount(ov,close){
      ov.querySelectorAll('#svC .lux-chip').forEach(c=>c.onclick=()=>{ov.querySelectorAll('#svC .lux-chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');ov.querySelector('#svCX').value='';});
      const del=ov.querySelector('[data-del]');
      if(del)del.onclick=()=>{
        const i=SVC_CATALOG.findIndex(x=>x[0]===editName);
        if(i>-1){SVC_CATALOG.splice(i,1);saveSvcCatalog();}
        close();SALON.go('services');LUX.toast('حُذفت خدمة «'+editName+'»','ok');};
      ov.querySelector('[data-ok]').onclick=()=>{
        const n=ov.querySelector('#svN').value.trim();
        const p=parseFloat(ov.querySelector('#svP').value);
        if(!n){ov.querySelector('#svN').focus();return;}
        if(!(p>0)){ov.querySelector('#svP').focus();return;}
        const dur=parseInt(ov.querySelector('#svD').value)||2;
        const cat=ov.querySelector('#svCX').value.trim()||(ov.querySelector('#svC .lux-chip.on')||{dataset:{}}).dataset.v||'أخرى';
        if(!s&&SVC_CATALOG.some(x=>x[0]===n)){LUX.toast('توجد خدمة بهذا الاسم','warn');return;}
        if(s){s[0]=n;s[1]=dur;s[2]=p;s[3]=cat;}
        else SVC_CATALOG.push([n,dur,p,cat]);
        saveSvcCatalog();close();SALON.go('services');
        LUX.toast(s?'حُدّثت الخدمة ✓':'أُضيفت خدمة «'+n+'» ✓ — أصبحت متاحة في الحجز','ok');};
    }});
  },
  printInvoice(id){
    const w=window.open('','_blank','width=430,height=640');
    if(!w){LUX.toast('اسمحي بالنوافذ المنبثقة للطباعة','err');return;}
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>فاتورة LUMA</title><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;700&family=Bodoni+Moda&display=swap" rel="stylesheet"><style>body{margin:0;padding:18px;background:#fff}</style></head><body>'+SALON.invoiceHTML(id)+'</body></html>');
    w.document.close();
    w.onload=()=>setTimeout(()=>{w.focus();w.print();},350);
  },
  addStaff(editId){
    const roles=['مكياج','شعر','بشرة','أظافر','رموش','سبا'];
    const NATS=['سعودية','مصرية','مغربية','لبنانية','سورية','أردنية','فلبينية','إندونيسية','هندية','باكستانية','أخرى'];
    const s=editId?STAFF.find(x=>x.id===editId):null;
    const p=editId?spOf(editId):{};
    const g=v=>v||'';
    /* مُعرف الموظف: تسلسلي تلقائي (8001، 8002…) */
    const nextEmpId=()=>{const ids=STAFF.map(x=>parseInt(spOf(x.id).empId)||0);return Math.max(8000,...ids)+1;};
    const sect=t=>`<div style="font-size:12.5px;color:var(--gold,#9c8047);font-weight:700;margin:16px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--line,#26242d)">${t}</div>`;
    const body=`
      <div class="lux-lead">لبداية دقيقة 💪 تأكدي من دقة جميع بيانات الموظفة لتفادي أي مشكلات في الوصول أو الرواتب.</div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px">
        <span id="spPhotoPrev">${s?spAvatar(s,58):'<span style="width:58px;height:58px;border-radius:50%;background:#0e0d11;border:1px dashed var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light);font-size:22px">📷</span>'}</span>
        <input type="file" id="spPhotoFile" accept="image/*" style="display:none"/>
        <button type="button" class="lux-btn lux-ghost" style="padding:9px 16px;font-size:12.5px" onclick="document.getElementById('spPhotoFile').click()">${p.photo?'تغيير الصورة':'رفع صورة شخصية'}</button>
      </div>
      ${sect('بيانات الموظف')}
      <div class="lux-f"><label>الاسم الكامل (عربي) <span style="color:#c0566a">*</span></label><input name="name" value="${g(s&&s.n)}" placeholder="أدخل الاسم كاملًا بالعربية"/></div>
      <div class="lux-f"><label>الاسم الكامل (إنجليزي) <span style="color:#c0566a">*</span></label><input name="nameEn" dir="ltr" style="text-align:right" value="${g(p.nameEn)}" placeholder="Full name in English"/></div>
      <div class="lux-two">
        <div class="lux-f"><label>مُعرف الموظف <span style="color:#c0566a">*</span></label><input name="empId" dir="ltr" style="text-align:right" value="${g(p.empId)||nextEmpId()}"/></div>
        <div class="lux-f"><label>الجنسية <span style="color:#c0566a">*</span></label><select name="nat"><option value="">اختار…</option>${NATS.map(n=>`<option ${p.nat===n?'selected':''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>البريد الإلكتروني</label><input name="email" dir="ltr" style="text-align:right" value="${g(p.email)}" placeholder="name@mail.com"/></div>
        <div class="lux-f"><label>رقم الهاتف</label><input name="phone" dir="ltr" style="text-align:right" value="${g(p.phone)}" placeholder="05xxxxxxxx"/></div>
      </div>
      <div class="lux-f"><label>محل الإقامة <span style="color:#c0566a">*</span></label>
        <div style="display:flex;gap:18px;padding:6px 2px">
          <label style="display:flex;align-items:center;gap:7px;font-size:13.5px;color:var(--cream,#ece6da);cursor:pointer"><input type="radio" name="res" value="داخل السعودية" ${p.res!=='خارج السعودية'?'checked':''}/> داخل السعودية</label>
          <label style="display:flex;align-items:center;gap:7px;font-size:13.5px;color:var(--cream,#ece6da);cursor:pointer"><input type="radio" name="res" value="خارج السعودية" ${p.res==='خارج السعودية'?'checked':''}/> خارج السعودية</label>
        </div></div>
      <div class="lux-f"><label>الهوية الوطنية أو الإقامة أو رقم الحدود <span style="color:#c0566a">*</span></label><input name="nid" dir="ltr" style="text-align:right" value="${g(p.nid)}" placeholder="أدخل 9 أرقام على الأقل"/></div>
      ${sect('البيانات الوظيفية')}
      <div class="lux-two">
        <div class="lux-f"><label>نوع الوظيفة <span style="color:#c0566a">*</span></label><select name="shift"><option ${s&&s.shift==='دوام كامل'?'selected':''}>دوام كامل</option><option ${s&&s.shift==='دوام جزئي'?'selected':''}>دوام جزئي</option></select></div>
        <div class="lux-f"><label>المسمى الوظيفي / التخصص <span style="color:#c0566a">*</span></label><select name="role">${roles.map(r=>`<option ${s&&s.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>تاريخ الالتحاق</label><input type="date" name="hired" value="${g(p.hired)}"/></div>
        <div class="lux-f"><label>ملاحظات إدارية</label><input name="notes" value="${g(p.notes)}" placeholder="شهادات، مهارات…"/></div>
      </div>
      <div class="lux-foot"><button class="lux-btn lux-ghost" data-c style="flex:1">إغلاق</button><button class="lux-btn lux-gold" data-ok style="flex:1.4">${editId?'حفظ التعديلات':'إضافة الموظف'}</button></div>`;
    LUX.modal(editId?'تعديل ملف '+s.n:'إضافة ملف موظف',body,{onMount(ov,close){
      let photo=p.photo||null;
      ov.querySelector('#spPhotoFile').onchange=e=>{
        const f=e.target.files&&e.target.files[0];if(!f)return;
        spReadImage(f,400,url=>{photo=url;ov.querySelector('#spPhotoPrev').innerHTML=`<img src="${url}" style="width:58px;height:58px;border-radius:50%;object-fit:cover;border:1px solid var(--gold-light)"/>`;});
      };
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-ok]').onclick=()=>{
        const q=n=>ov.querySelector('[name='+n+']');
        const bad=el=>{el.style.borderColor='#c0566a';el.focus();};
        if(!q('name').value.trim())return bad(q('name'));
        if(!q('nameEn').value.trim())return bad(q('nameEn'));
        if(!q('nat').value)return bad(q('nat'));
        const nid=q('nid').value.replace(/\s/g,'');
        if(!/^\d{9,}$/.test(nid)){bad(q('nid'));LUX.toast('الهوية/الإقامة: 9 أرقام على الأقل','err');return;}
        const ph=q('phone').value.trim();
        if(ph&&!/^0?5\d{8}$/.test(ph.replace(/[\s-]/g,''))){bad(q('phone'));LUX.toast('رقم الجوال غير صحيح — مثال: 0551234567','err');return;}
        const prof={photo,nameEn:q('nameEn').value.trim(),empId:q('empId').value.trim(),nat:q('nat').value,
          res:ov.querySelector('[name=res]:checked').value,phone:ph,email:q('email').value.trim(),
          nid,hired:q('hired').value,notes:q('notes').value.trim()};
        if(editId){
          s.n=q('name').value.trim();s.role=q('role').value;s.shift=q('shift').value;
          if(s.custom)saveStaff();else spSet(editId,{n:s.n,role2:s.role});
          spSet(editId,prof);
          close();SALON.go('staff');LUX.toast('تم حفظ التعديلات ✓','ok');
        }else{
          const color=STAFF_COLORS[STAFF.filter(x=>x.custom).length%STAFF_COLORS.length];
          const id='s'+Date.now();
          STAFF.push({id,n:q('name').value.trim(),role:q('role').value,shift:q('shift').value,color,custom:true});
          saveStaff();spSet(id,prof);
          close();SALON.go('staff');LUX.toast('أُنشئ ملف '+q('name').value.trim()+' — مُعرف الموظف '+prof.empId+' ✓','ok');
        }
      };
    }});
  },
  viewStaff(id){
    const s=STAFF.find(x=>x.id===id);if(!s)return;
    const p=spOf(id);
    const susp=p.status!=='active';
    const cnt=APPTS.filter(a=>a.staff===id).length;
    const L=hrLedger(id);
    const row=(k,v)=>v?`<div class="lux-row"><span class="k">${k}</span><span class="v">${v}</span></div>`:'';
    const docs=p.docs.map((d,i)=>`
      <div style="display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        ${d.img?`<img src="${d.img}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--gold-deep,#7c6335);cursor:zoom-in" onclick="SALON.zoomDoc(${i},'${id}')"/>`:`<span style="width:44px;height:44px;border-radius:8px;background:#0e0d11;border:1px solid #26242d;display:flex;align-items:center;justify-content:center">📄</span>`}
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:#f6f2ec;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div><div style="font-size:10.5px;color:#86818d">${d.date}</div></div>
        <button style="background:none;border:none;color:#c0566a;cursor:pointer;font-size:15px" title="حذف المستند" onclick="SALON.delDoc('${id}',${i})">🗑</button>
      </div>`).join('')||'<div style="color:#86818d;font-size:12.5px;padding:10px 0">لا مستندات بعد — ارفعي الهوية، العقد، أو الشهادات.</div>';
    LUX.modal('ملف '+s.n,`
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        ${spAvatar(s,64)}
        <div style="flex:1"><div style="font-size:17px;color:#f6f2ec;font-weight:700">${s.n} ${susp?'<span style="font-size:11px;color:#e29aa6">· موقوفة</span>':'<span style="font-size:11px;color:#9fce99">· نشطة</span>'}</div>
        <div style="font-size:12.5px;color:#e6ce95">${s.role} · ${s.shift||'دوام كامل'}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;text-align:center">
        <div style="background:#0e0d11;border-radius:9px;padding:9px"><div style="color:#ccab64;font-size:16px;font-weight:700">${cnt}</div><div style="font-size:10px;color:#86818d">مواعيد اليوم</div></div>
        <div style="background:#0e0d11;border-radius:9px;padding:9px"><div style="color:#ccab64;font-size:16px;font-weight:700">${L.net.toLocaleString('en')}</div><div style="font-size:10px;color:#86818d">صافي الشهر (ر.س)</div></div>
        <div style="background:#0e0d11;border-radius:9px;padding:9px"><div style="color:${L.late||L.abs?'#e29aa6':'#9fce99'};font-size:16px;font-weight:700">${L.late||L.abs?L.late+' د':'✓'}</div><div style="font-size:10px;color:#86818d">${L.abs?L.abs+' غياب':'الانضباط'}</div></div>
      </div>
      <div style="font-size:12px;color:#9c8047;font-weight:700;margin:6px 0 2px">بيانات الموظف</div>
      ${row('الاسم (إنجليزي)',p.nameEn?`<bdo dir="ltr">${p.nameEn}</bdo>`:'')}
      ${row('مُعرف الموظف',p.empId?`<bdo dir="ltr">${p.empId}</bdo>`:'')}
      ${row('الجنسية',p.nat)}
      ${row('رقم الهاتف',p.phone?`<bdo dir="ltr">${p.phone}</bdo>`:'')}
      ${row('البريد الإلكتروني',p.email?`<bdo dir="ltr">${p.email}</bdo>`:'')}
      ${row('محل الإقامة',p.res)}
      ${row('الهوية / الإقامة / رقم الحدود',p.nid?`<bdo dir="ltr">${p.nid}</bdo>`:'')}
      <div style="font-size:12px;color:#9c8047;font-weight:700;margin:12px 0 2px">البيانات الوظيفية</div>
      ${row('نوع الوظيفة',s.shift||'دوام كامل')}
      ${row('المسمى الوظيفي',s.role)}
      ${row('تاريخ الالتحاق',p.hired?`<bdo dir="ltr">${p.hired}</bdo>`:'')}
      ${row('رصيد الإجازات',hrBalance(id)+' يوماً')}
      ${row('ملاحظات',p.notes)}
      <div style="font-size:12px;color:#9c8047;font-weight:700;margin:14px 0 4px">المستندات (هوية، عقد، شهادات…)</div>
      ${docs}
      <input type="file" id="spDocFile" accept="image/*,.pdf" style="display:none"/>
      <button class="lux-btn lux-ghost" style="width:100%;margin-top:10px" onclick="document.getElementById('spDocFile').click()">📎 رفع مستند جديد</button>
      <div class="lux-foot" style="margin-top:12px">
        <button class="lux-btn lux-ghost" data-edit style="flex:1">تعديل البيانات</button>
        <button class="lux-btn lux-ghost" data-tgl style="flex:1;${susp?'':'border-color:#7c6335;color:#e6ce95'}">${susp?'إعادة تفعيل':'إيقاف مؤقت'}</button>
        <button class="lux-btn" data-del style="flex:1;background:#b14a5c22;border:1px solid #b14a5c;color:#e29aa6">حذف الملف</button>
      </div>`,{onMount(ov,close){
      ov.querySelector('#spDocFile').onchange=e=>{
        const f=e.target.files&&e.target.files[0];if(!f)return;
        const add=img=>{
          const docs2=spOf(id).docs;docs2.push({name:f.name,img,date:new Date().toISOString().slice(0,10)});
          spSet(id,{docs:docs2});close();SALON.viewStaff(id);LUX.toast('رُفع المستند وحُفظ في ملف '+s.n+' ✓','ok');
        };
        if(f.type.startsWith('image/'))spReadImage(f,900,add);else add(null);
      };
      ov.querySelector('[data-edit]').onclick=()=>{close();SALON.addStaff(id);};
      ov.querySelector('[data-tgl]').onclick=()=>{
        spSet(id,{status:susp?'active':'suspended'});close();SALON.go('staff');
        LUX.toast(susp?'أُعيد تفعيل '+s.n+' ✓':'أُوقفت '+s.n+' مؤقتاً — لن تستقبل حجوزات جديدة','ok');
      };
      ov.querySelector('[data-del]').onclick=()=>{
        close();
        LUX.confirm('حذف ملف '+s.n+' نهائياً من الطاقم؟ ستُزال من لوحة الحجوزات وكل الشاشات.',()=>{
          spArchive(id);SALON.go('staff');LUX.toast('حُذف ملف '+s.n,'err');
        },true);
      };
    }});
  },
  zoomDoc(i,id){
    const d=spOf(id).docs[i];if(!d||!d.img)return;
    const z=document.createElement('div');
    z.style.cssText='position:fixed;inset:0;z-index:9300;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:26px;cursor:zoom-out';
    z.innerHTML=`<img src="${d.img}" style="max-width:92vw;max-height:88vh;border-radius:12px"/>`;
    z.onclick=()=>z.remove();document.body.appendChild(z);
  },
  delDoc(id,i){
    const docs=spOf(id).docs;docs.splice(i,1);spSet(id,{docs});
    document.querySelectorAll('.lux-ov').forEach(o=>o.remove());
    SALON.viewStaff(id);LUX.toast('حُذف المستند','ok');
  },
  addClient(){
    const body=`
      <div class="lux-lead">أدخلي بيانات العميلة الجديدة — ستظهر مباشرة في قاعدة عملاء الصالون.</div>
      <div class="lux-f"><label>اسم العميلة</label><input name="name" placeholder="مثال: جوري السالم"/></div>
      <div class="lux-f"><label>رقم الجوال</label><input name="phone" dir="ltr" style="text-align:right" placeholder="05xxxxxxxx"/></div>
      <div class="lux-two">
        <div class="lux-f"><label>الموظفة المفضّلة</label><select name="staff"><option>بدون تفضيل</option>${STAFF.map(s=>`<option>${s.n}</option>`).join('')}</select></div>
        <div class="lux-f"><label>كيف عرفت الصالون؟</label><select name="src"><option>زيارة مباشرة</option><option>سوق لوما</option><option>توصية صديقة</option><option>إنستقرام</option><option>أخرى</option></select></div>
      </div>
      <div class="lux-f"><label>ملاحظات (اختياري)</label><textarea name="notes" rows="2" placeholder="حساسية، تفضيلات، مناسبة قادمة…"></textarea></div>
      <div class="lux-foot"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-ok style="flex:1.4">إضافة العميلة</button></div>`;
    LUX.modal('إضافة عميلة جديدة',body,{onMount(ov,close){
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-ok]').onclick=()=>{
        const name=ov.querySelector('[name=name]');
        if(!name.value.trim()){name.style.borderColor='#c0566a';name.focus();return;}
        const phone=ov.querySelector('[name=phone]').value.trim();
        if(phone&&!/^0?5\d{8}$/.test(phone.replace(/[\s-]/g,''))){const p=ov.querySelector('[name=phone]');p.style.borderColor='#c0566a';p.focus();LUX.toast('رقم الجوال غير صحيح — مثال: 0551234567','err');return;}
        const staff=ov.querySelector('[name=staff]').value;
        CLIENTS.unshift({n:name.value.trim(),v:0,sp:'0',last:'—',staff:staff==='بدون تفضيل'?'—':staff,
          tag:'جديدة',tc:'soft',phone,src:ov.querySelector('[name=src]').value,
          notes:ov.querySelector('[name=notes]').value.trim(),custom:true});
        saveClients();close();SALON.go('clients');
        LUX.toast('تمت إضافة '+name.value.trim()+' إلى قاعدة العملاء ✓','ok');
      };
    }});
  }
};
window.SALON=SALON;
const start=(location.hash||'').replace('#','')||'overview';SALON.go((NAV_FLAT[start]||start==='staff')?start:'overview');