/* لوما · ربط المخزون بالخدمات
   وصفة مواد لكل خدمة → خصم تلقائي من المخزون مع كل دفعة + تنبيه نفاد.
   يُحمَّل قبل salon-app.js — يقرأ window.INVENTORY وقت الاستدعاء لا وقت التحميل. */

const RECIPE_KEY='luma_svc_recipes';
const INVQ_KEY='luma_inv_q';

/* الوصفات الافتراضية — أسماء المواد مطابقة لأصناف المخزون */
const RECIPE_DEFAULTS={
  'مكياج سهرة':[{n:'كريم أساس — درجات',q:1},{n:'رموش صناعية',q:1},{n:'مثبّت مكياج (سبراي)',q:1}],
  'مكياج عروس':[{n:'كريم أساس — درجات',q:2},{n:'رموش صناعية',q:2},{n:'مثبّت مكياج (سبراي)',q:1}],
  'مكياج ناعم':[{n:'كريم أساس — درجات',q:1},{n:'مثبّت مكياج (سبراي)',q:1}],
  'صبغة + قص':[{n:'صبغة شعر — بنّي',q:2}],
  'كيراتين':[{n:'زيت كيراتين',q:2}],
  'هيدرافيشل':[{n:'محلول هيدرافيشل',q:1}],
  'تنظيف بشرة':[{n:'محلول هيدرافيشل',q:1}],
  'منيكير جل':[{n:'جل أظافر — ألوان',q:1}],
  'منيكير + بديكير':[{n:'جل أظافر — ألوان',q:2}],
  'تركيب أظافر':[{n:'جل أظافر — ألوان',q:2}],
};
function recipes(){return Object.assign({},RECIPE_DEFAULTS,LumaStore.get(RECIPE_KEY,{}));}
function saveInvQ(){const m={};window.INVENTORY.forEach(it=>{m[it.n]=it.q;});LumaStore.set(INVQ_KEY,m);}

/* تُستدعى بعد كل دفعة — تخصم مواد الخدمة وتُرجع تنبيهات النفاد */
function stockConsume(service){
  const rec=recipes()[service];
  if(!rec||!window.INVENTORY)return {consumed:[],alerts:[]};
  const consumed=[],alerts=[];
  rec.forEach(r=>{
    const it=window.INVENTORY.find(x=>x.n===r.n);if(!it)return;
    it.q=Math.max(0,it.q-r.q);consumed.push(r.n+' ×'+r.q);
    if(it.q<it.min)alerts.push(it.n+' (متبقٍّ '+it.q+')');
  });
  if(consumed.length)saveInvQ();
  return {consumed,alerts};
}

const STOCK={
  /* محرر وصفات الخدمات */
  recipesModal(svcName){
    const all=recipes();
    const svc=svcName||SVC_CATALOG[0][0];
    const rec=all[svc]||[];
    const items=window.INVENTORY.map(i=>i.n);
    const row=(r,i)=>`
      <div class="rcRow" style="display:flex;gap:8px;margin-bottom:7px;align-items:center">
        <select class="rcItem" style="flex:1.6">${items.map(n=>`<option ${r&&r.n===n?'selected':''}>${n}</option>`).join('')}</select>
        <input class="rcQty" type="number" min="1" value="${r?r.q:1}" dir="ltr" style="flex:.5;text-align:right" placeholder="كمية"/>
        <button type="button" class="lux-chip rcDel" style="color:#e29aa6">✕</button>
      </div>`;
    LUX.modal('وصفات الخدمات — استهلاك المواد',`
      <div class="lux-lead">حدّدي المواد التي تُستهلك مع كل خدمة — تُخصم من المخزون تلقائياً عند الدفع.</div>
      <div class="lux-f"><label>الخدمة</label>
        <select id="rcSvc">${SVC_CATALOG.map(s=>`<option ${s[0]===svc?'selected':''}>${s[0]}</option>`).join('')}</select></div>
      <div class="lux-f"><label>المواد المستهلكة</label>
        <div id="rcRows">${rec.map(row).join('')||''}</div>
        <button type="button" class="lux-btn lux-ghost" id="rcAdd" style="width:100%;padding:9px">+ مادة</button></div>
      <button class="lux-btn lux-gold" data-save style="width:100%;margin-top:10px">حفظ وصفة «${svc}»</button>`,{onMount(ov,close){
      const wire=()=>ov.querySelectorAll('.rcDel').forEach(b=>b.onclick=()=>{b.closest('.rcRow').remove();});
      wire();
      ov.querySelector('#rcSvc').onchange=e=>{close();STOCK.recipesModal(e.target.value);};
      ov.querySelector('#rcAdd').onclick=()=>{
        ov.querySelector('#rcRows').insertAdjacentHTML('beforeend',row(null));wire();};
      ov.querySelector('[data-save]').onclick=()=>{
        const list=[...ov.querySelectorAll('.rcRow')].map(r=>({
          n:r.querySelector('.rcItem').value,q:Math.max(1,parseInt(r.querySelector('.rcQty').value)||1),
        }));
        LumaStore.update(RECIPE_KEY,m=>{m[svc]=list;return m;},{});
        close();LUX.toast('حُفظت وصفة «'+svc+'» ✓','ok');
        if(location.hash==='#inventory')SALON.go('inventory');};
    }});
  },
  /* كم خدمة تستهلك هذا الصنف؟ */
  usesOf(itemName){
    const all=recipes();
    return Object.keys(all).filter(s=>all[s].some(r=>r.n===itemName)).length;
  },
};
