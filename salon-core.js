/* لوما · داشبورد الصالون — النواة: الأيقونات، الطاقم وملفاتهم، الحجوزات والدفعات، الكتالوج */
const IC={
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  board:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18"/>',
  staff:'<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.2a3.4 3.4 0 010 6M21.5 20a6.5 6.5 0 00-4-6"/>',
  users:'<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.2a3.4 3.4 0 010 6M21.5 20a6.5 6.5 0 00-4-6"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L20 18M8.5 16L20 6"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14h2"/>',
  chart:'<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  pin:'<path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  walk:'<circle cx="13" cy="4" r="2"/><path d="M9 21l2-7-3-2 1-4 4 2 2 3M11 14l-2 7M14 13l2 4"/>',
  star:'<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
  chair:'<path d="M6 19v-7a3 3 0 013-3h6a3 3 0 013 3v7M6 14h12M8 19v2M16 19v2"/>',
  bag:'<path d="M6 7h12l1 13a1 1 0 01-1 1H6a1 1 0 01-1-1z"/><path d="M9 7a3 3 0 016 0"/>',
  ticket:'<path d="M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 4 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-4z"/><path d="M14 7v10" stroke-dasharray="1 2"/>',
  invoice:'<path d="M6 2h9l4 4v15l-2.2-1.4L14.6 21l-2.6-1.5L9.4 21 7.2 19.6 5 21V4a2 2 0 012-2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  mega:'<path d="M3 11v3a1 1 0 001 1h2l8 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M16 9a3 3 0 010 6M18.5 6.5a6 6 0 010 11"/>',
  boxes:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
};
const icon=(n,s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[n]||''}</svg>`;
window.icon=icon;

/* ── STAFF + APPOINTMENTS (booking board core) ── */
const STAFF=[
  {id:'amal',n:'أمل',role:'مكياج',color:'#ccab64'},
  {id:'sara',n:'سارة',role:'شعر',color:'#d98a93'},
  {id:'nora',n:'نورة',role:'بشرة',color:'#7d9bc0'},
  {id:'reem',n:'ريم',role:'أظافر',color:'#6fa86a'},
];
/* staff added from the UI persist across reloads */
const STAFF_KEY='luma_salon_staff';
LumaStore.get(STAFF_KEY,[]).forEach(s=>{if(s&&s.id&&!STAFF.some(x=>x.id===s.id))STAFF.push(s);});
function saveStaff(){LumaStore.set(STAFF_KEY,STAFF.filter(s=>s.custom));}
const STAFF_COLORS=['#c98ab6','#8ac9b8','#9b8ac9','#c97f6f','#6fb0c9','#b8c96f'];

/* ── staff profile overlay: photo, contact, documents, status — the full HR file ── */
const SP_KEY='luma_staff_profiles', SP_ARCH_KEY='luma_staff_archived';
const spLoad=(k,f)=>LumaStore.get(k,f);
const spSave=(k,v)=>LumaStore.set(k,v);
const spAll=()=>spLoad(SP_KEY,{});
const spOf=id=>({status:'active',docs:[],...(spAll()[id]||{})});
function spSet(id,patch){const all=spAll();all[id]={...spOf(id),...patch};spSave(SP_KEY,all);}
/* archived staff disappear everywhere; name/role overrides apply at load */
{
  const arch=spLoad(SP_ARCH_KEY,[]);
  for(let i=STAFF.length-1;i>=0;i--){
    if(arch.includes(STAFF[i].id)){STAFF.splice(i,1);continue;}
    const p=spAll()[STAFF[i].id];
    if(p&&p.n)STAFF[i].n=p.n;
    if(p&&p.role2)STAFF[i].role=p.role2;
  }
}
function spArchive(id){
  const arch=spLoad(SP_ARCH_KEY,[]);if(!arch.includes(id))arch.push(id);
  spSave(SP_ARCH_KEY,arch);
  const i=STAFF.findIndex(s=>s.id===id);if(i>-1)STAFF.splice(i,1);
  saveStaff();
}
/* compress an image file → dataURL (photo + document uploads) */
function spReadImage(file,maxPx,cb){
  const rd=new FileReader();
  rd.onload=()=>{const im=new Image();im.onload=()=>{
    const sc=Math.min(1,maxPx/Math.max(im.width,im.height));
    const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
    cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
    cb(cv.toDataURL('image/jpeg',0.72));
  };im.src=rd.result;};
  rd.readAsDataURL(file);
}
function spAvatar(s,size){
  const p=spOf(s.id);
  return p.photo
    ?`<img src="${p.photo}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid ${s.color};flex-shrink:0"/>`
    :`<span style="width:${size}px;height:${size}px;border-radius:50%;background:var(--surface3);border:1px solid ${s.color};display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:${s.color};font-size:${Math.round(size*0.42)}px;flex-shrink:0">${s.n.charAt(0)}</span>`;
}
const START_HOUR=10, SLOTS=20, ROW_H=44; /* 10:00 → 20:00, 30-min slots */
function slotLabel(i){const t=START_HOUR*60+i*30;let h=Math.floor(t/60),m=t%60;const ap=h>=12?'م':'ص';let h12=h>12?h-12:h;return `${h12}:${m===0?'00':'30'} ${ap}`;}
/* appts: {staff, start(slot index), dur(slots), client, service, st} */
const APPTS=[
  {staff:'amal',start:0,dur:2,client:'نوف العتيبي',service:'مكياج سهرة',st:'confirmed'},
  {staff:'amal',start:4,dur:4,client:'دانة السالم',service:'مكياج عروس',st:'confirmed'},
  {staff:'amal',start:10,dur:2,client:'ريم القحطاني',service:'مكياج ناعم',st:'pending'},
  {staff:'sara',start:1,dur:3,client:'لمياء الحربي',service:'صبغة + قص',st:'confirmed'},
  {staff:'sara',start:6,dur:2,client:'هند الشمري',service:'تسريحة',st:'confirmed'},
  {staff:'sara',start:12,dur:4,client:'وعد الزهراني',service:'كيراتين',st:'confirmed'},
  {staff:'nora',start:0,dur:3,client:'سارة الأحمدي',service:'هيدرافيشل',st:'confirmed'},
  {staff:'nora',start:5,dur:2,client:'منيرة الدوسري',service:'تنظيف بشرة',st:'pending'},
  {staff:'nora',start:9,dur:2,client:'أمل السبيعي',service:'تقشير',st:'confirmed'},
  {staff:'reem',start:2,dur:2,client:'جواهر الشهري',service:'منيكير جل',st:'confirmed'},
  {staff:'reem',start:5,dur:3,client:'لطيفة المطيري',service:'منيكير + بديكير',st:'confirmed'},
  {staff:'reem',start:11,dur:2,client:'عبير الغامدي',service:'تركيب أظافر',st:'walkin'},
];
/* bookings & blocked slots added from the UI persist across reloads */
const APPTS_KEY='luma_salon_appts';
LumaStore.get(APPTS_KEY,[]).forEach(a=>{if(a&&a.staff&&!APPTS.some(x=>x.id&&x.id===a.id))APPTS.push(a);});
function saveAppts(){LumaStore.set(APPTS_KEY,APPTS.filter(a=>a.custom));}
APPTS.forEach((a,i)=>{if(!a.id)a.id='s'+i;});
/* دفعات وفواتير الحجوزات */
const PAID_KEY='luma_paid', INV_SEQ_KEY='luma_inv_seq';
const paidAll=()=>LumaStore.get(PAID_KEY,{});
const paidOf=id=>paidAll()[id]||null;
function markPaid(id,rec){const all=paidAll();all[id]=rec;LumaStore.set(PAID_KEY,all);}
function nextInvNo(){let n=parseInt(LumaStore.raw.get(INV_SEQ_KEY,'1000'))+1;LumaStore.raw.set(INV_SEQ_KEY,n);return 'INV-'+n;}
const SVC_CATALOG=[['مكياج سهرة',2,350],['مكياج عروس',4,850],['مكياج ناعم',2,250],['صبغة + قص',3,550],['تسريحة',2,200],['كيراتين',4,700],['هيدرافيشل',3,480],['تنظيف بشرة',2,320],['تقشير',2,280],['منيكير جل',2,160],['منيكير + بديكير',3,240],['تركيب أظافر',3,220]];
/* الكتالوج قابل للإدارة من شاشة «الخدمات» — أي تعديل يُحفظ كاملاً وينعكس على الحجز والأسعار */
const SVC_KEY='luma_svc_catalog';
const SVC_CAT_DEFAULT={'مكياج سهرة':'مكياج','مكياج عروس':'مكياج','مكياج ناعم':'مكياج','صبغة + قص':'شعر','تسريحة':'شعر','كيراتين':'شعر','هيدرافيشل':'بشرة','تنظيف بشرة':'بشرة','تقشير':'بشرة','منيكير جل':'أظافر','منيكير + بديكير':'أظافر','تركيب أظافر':'أظافر'};
{const saved=LumaStore.get(SVC_KEY,null);if(saved&&saved.length){SVC_CATALOG.length=0;saved.forEach(s=>SVC_CATALOG.push(s));}}
SVC_CATALOG.forEach(s=>{if(!s[3])s[3]=SVC_CAT_DEFAULT[s[0]]||'أخرى';});
function saveSvcCatalog(){LumaStore.set(SVC_KEY,SVC_CATALOG);}
const svcPrice=n=>{const x=SVC_CATALOG.find(s=>s[0]===n);return x?x[2]:350;};
const ST_STYLE={confirmed:{bg:'rgba(111,168,106,0.16)',bd:'#6fa86a',lb:'مؤكد'},pending:{bg:'rgba(205,172,80,0.16)',bd:'#ccab64',lb:'بانتظار الدفع'},walkin:{bg:'rgba(125,155,192,0.16)',bd:'#7d9bc0',lb:'حضور مباشر'},blocked:{bg:'rgba(134,129,141,0.16)',bd:'#86818d',lb:'وقت محجوب'}};

const SCREENS={};

