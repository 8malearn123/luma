/* لوما · الفروع المتعددة
   يعمل بعد salon-core.js: يبدّل طاقم وحجوزات الفرع النشط، ويضيف مبدّل الفرع
   في الشريط الجانبي. البيانات المحفوظة معزولة لكل فرع (انظر رأس salon.html). */

const BRANCHES_META=[
  {id:'shatee',n:'فرع الشاطئ',c:'جدة · حي الشاطئ',main:true},
  {id:'rawdah',n:'فرع الروضة',c:'جدة · حي الروضة'},
];
const CUR_BRANCH=window.LUMA_BRANCH||'shatee';
const CUR_BRANCH_META=BRANCHES_META.find(b=>b.id===CUR_BRANCH)||BRANCHES_META[0];

if(CUR_BRANCH==='rawdah'){
  /* نفس معرفات الطاقم عبر الفروع حتى تعمل بذور الموارد البشرية — الأسماء تختلف */
  const savedStaff=STAFF.filter(s=>!['amal','sara','nora','reem'].includes(s.id));
  STAFF.length=0;
  STAFF.push(
    {id:'amal',n:'شهد',role:'مكياج',color:'#ccab64'},
    {id:'sara',n:'عهود',role:'شعر',color:'#d98a93'},
    {id:'nora',n:'لين',role:'بشرة',color:'#7d9bc0'},
    {id:'reem',n:'غلا',role:'أظافر',color:'#6fa86a'},
    ...savedStaff);
  const savedAppts=APPTS.filter(a=>a.custom);
  APPTS.length=0;
  APPTS.push(
    {staff:'amal',start:1,dur:2,client:'أفنان الحربي',service:'مكياج سهرة',st:'confirmed'},
    {staff:'amal',start:6,dur:2,client:'رزان العوفي',service:'مكياج ناعم',st:'pending'},
    {staff:'sara',start:2,dur:3,client:'مها الجهني',service:'صبغة + قص',st:'confirmed'},
    {staff:'sara',start:9,dur:2,client:'ديمة الصاعدي',service:'تسريحة',st:'confirmed'},
    {staff:'nora',start:4,dur:3,client:'أروى السلمي',service:'هيدرافيشل',st:'confirmed'},
    {staff:'reem',start:3,dur:2,client:'رغد المالكي',service:'منيكير جل',st:'confirmed'},
    {staff:'reem',start:8,dur:3,client:'شذى البلادي',service:'منيكير + بديكير',st:'walkin'},
    ...savedAppts);
  APPTS.forEach((a,i)=>{if(!a.id)a.id='r'+i;});
}

const BR={
  go(id){
    if(id===CUR_BRANCH)return;
    try{localStorage.setItem('luma_branch',id);}catch(e){}
    location.reload();
  },
};

/* مبدّل الفرع في الشريط الجانبي + تحديث بطاقة الصالون */
(function(){
  const nm=document.querySelector('.salon .nm');
  if(nm)nm.innerHTML=`<b>صالون لمسة</b><span>${CUR_BRANCH_META.n} · ${CUR_BRANCH_META.c.split('· ')[1]||''}</span>`;
  const card=document.querySelector('.salon');
  if(!card)return;
  const sw=document.createElement('div');
  sw.className='br-switch';
  sw.style.cssText='display:flex;gap:7px;margin:10px 14px 0';
  sw.innerHTML=BRANCHES_META.map(b=>`
    <button onclick="BR.go('${b.id}')" style="flex:1;padding:7px 4px;border-radius:9px;cursor:pointer;font-family:inherit;font-size:11.5px;
      border:1px solid ${b.id===CUR_BRANCH?'var(--gold-deep)':'var(--line)'};
      background:${b.id===CUR_BRANCH?'rgba(156,128,71,0.16)':'transparent'};
      color:${b.id===CUR_BRANCH?'var(--gold-pale)':'var(--muted)'}">${b.n.replace('فرع ','')}${b.id===CUR_BRANCH?' ●':''}</button>`).join('');
  card.insertAdjacentElement('afterend',sw);
})();
