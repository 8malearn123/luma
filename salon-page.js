/* لوما · داشبورد الصالون — مُنشئ الرابط والصفحة الخاصة */
/* ══════════ مُنشئ الرابط والصفحة الخاصة (Landing & Booking Link) ══════════ */
const PAGE_KEY='luma_page_cfg';
/* القوالب الجاهزة — نقاط بداية لمحرر الثيم المخصص */
const PAGE_PRESETS=[
  {k:'dark-luxury',ar:'فخامة داكنة',bg:'#09090b',card:'#151517',ac:'#e5c158',tx:'#f5f1e8',rad:18},
  {k:'rose-velvet',ar:'مخمل وردي',bg:'#1a0e12',card:'#241318',ac:'#e08a9b',tx:'#f8eef1',rad:18},
  {k:'minimal-emerald',ar:'زمرد هادئ',bg:'#0a1413',card:'#12201e',ac:'#8fd0c0',tx:'#eef6f4',rad:18},
  {k:'pearl-light',ar:'لؤلؤ فاتح',bg:'#f7f3ec',card:'#ffffff',ac:'#9c8047',tx:'#2e241b',rad:18},
];
/* توافق خلفي مع أي كود قديم يقرأ الشكل المصفوفي */
const PAGE_THEMES=PAGE_PRESETS.map(p=>[p.k,p.ar,p.bg,p.ac]);
/* الثيم المحلول للإعدادات الحالية: قالب جاهز أو ثيم مخصص بالكامل */
function pageThemeOf(c){
  c=c||pageCfg();
  if(c.theme==='custom'&&c.themeCustom)return {...PAGE_PRESETS[0],k:'custom',ar:'ثيم مخصص',...c.themeCustom};
  return PAGE_PRESETS.find(p=>p.k===c.theme)||PAGE_PRESETS[0];
}
const pageCfg=()=>({slug:'lama-beauty',title:'صالون لمسة',bio:'وجهتكِ الأولى للجمال في جدة — مكياج، شعر، وعناية ملكية بلمسات خبيرات.',phone:'0555 123 456',address:'جدة · حي الشاطئ',logo:'',cover:'',theme:'dark-luxury',themeCustom:null,...hrLoad(PAGE_KEY,{})});
const slugClean=v=>v.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-');
const PAGE={
  save(patch,silent){const c={...pageCfg(),...patch};hrSave(PAGE_KEY,c);
    const fr=document.getElementById('pagePrev');if(fr)fr.contentWindow.location.reload();
    if(!silent)LUX.toast('حُفظت التغييرات وانعكست على المعاينة ✓','ok');},
  copy(){const c=pageCfg();navigator.clipboard.writeText(location.origin+location.pathname.replace(/[^/]*$/,'')+'booking.html?s='+c.slug).then(()=>{
    const b=document.getElementById('cpBtn');if(b){b.textContent='✓ نُسخ!';setTimeout(()=>b.textContent='نسخ الرابط',1600);}});},
  field(k,el){const v=k==='slug'?slugClean(el.value):el.value;if(k==='slug')el.value=v;PAGE.save({[k]:v},true);},
  /* ── محرر الثيم المخصص ── */
  hex(v){v=String(v||'').trim().replace(/^#?/,'#');return /^#[0-9a-fA-F]{6}$/.test(v)?v.toLowerCase():null;},
  customBase(){const t={...pageThemeOf()};delete t.k;delete t.ar;return t;},
  setColor(key,val){
    const hx=PAGE.hex(val);if(!hx)return;
    const t=PAGE.customBase();t[key]=hx;
    PAGE.save({theme:'custom',themeCustom:t},true);
    const cp=document.getElementById('thc-'+key);if(cp&&cp.value!==hx)cp.value=hx;
    const tx=document.getElementById('thx-'+key);if(tx&&tx.value!==hx)tx.value=hx;
    const badge=document.getElementById('thBadge');if(badge)badge.style.display='inline-block';
  },
  setRad(v){
    const t=PAGE.customBase();t.rad=Math.max(0,Math.min(28,parseInt(v)||0));
    PAGE.save({theme:'custom',themeCustom:t},true);
    const l=document.getElementById('radV');if(l)l.textContent=t.rad+'px';
    const badge=document.getElementById('thBadge');if(badge)badge.style.display='inline-block';
  },
  preset(k){PAGE.save({theme:k,themeCustom:null},true);SALON.go('page');LUX.toast('طُبّق قالب البداية — عدّلي ألوانه كما تحبين','ok');},
  resetTheme(){PAGE.save({theme:'dark-luxury',themeCustom:null},true);SALON.go('page');LUX.toast('عاد المظهر للافتراضي','ok');},
};
window.PAGE=PAGE;

SCREENS.page=()=>{
  const c=pageCfg();
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">مُنشئ الرابط والصفحة الخاصة</div>
    <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">رابطك المخصص وصفحة حجز فاخرة — وهذه الهوية نفسها تظهر على فواتيرك المطبوعة</div></div>
    <a class="btn btn-gold" href="booking.html" target="_blank" style="text-decoration:none">فتح صفحتي ↗</a>
  </div>
  <div style="display:grid;grid-template-columns:1fr 330px;gap:20px;align-items:start">
    <div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">إعداد الرابط الخاص <span class="ln"></span></div>
        <div style="display:flex;align-items:stretch;border:1px solid var(--line);border-radius:11px;overflow:hidden" dir="ltr">
          <span style="background:var(--surface2);padding:12px 14px;font-size:13px;color:var(--muted);font-family:'IBM Plex Mono',monospace">luma.beauty/</span>
          <input value="${c.slug}" oninput="PAGE.field('slug',this)" style="flex:1;background:var(--bg);border:none;outline:none;color:var(--gold-light);padding:12px;font-size:13.5px;font-family:'IBM Plex Mono',monospace"/>
          <button id="cpBtn" class="btn btn-ghost" style="border-radius:0;border:none;border-right:1px solid var(--line)" onclick="PAGE.copy()">نسخ الرابط</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">أحرف إنجليزية وأرقام وشرطات فقط — يُنظَّف تلقائياً أثناء الكتابة.</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">هوية الصفحة <span class="ln"></span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="lux-f"><label>اسم الصالون</label><input value="${c.title}" oninput="PAGE.field('title',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none"/></div>
          <div class="lux-f"><label>رقم التواصل</label><input value="${c.phone}" oninput="PAGE.field('phone',this)" dir="ltr" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none;text-align:right"/></div>
          <div class="lux-f"><label>العنوان</label><input value="${c.address||''}" oninput="PAGE.field('address',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none"/></div>
          <div class="lux-f"><label>الرقم الضريبي <span style="font-size:10px;color:var(--muted)">— يظهر في الفاتورة</span></label><input value="${c.vatno||''}" oninput="PAGE.field('vatno',this)" dir="ltr" placeholder="310123456700003" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none;text-align:right"/></div>
        </div>
        <div class="lux-f"><label>نبذة مختصرة</label><textarea rows="2" oninput="PAGE.field('bio',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none;resize:vertical">${c.bio}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="lux-f"><label>رابط الشعار</label><input value="${c.logo}" oninput="PAGE.field('logo',this)" dir="ltr" placeholder="https://…/logo.png" style="width:100%;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/></div>
          <div class="lux-f"><label>صورة الغلاف الفاخرة</label><input value="${c.cover}" oninput="PAGE.field('cover',this)" dir="ltr" placeholder="https://…/cover.jpg" style="width:100%;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/></div>
        </div>
      </div>
      <div class="card">
        <div class="sec-label">مظهر وتصميم الصفحة <span class="ln"></span>
          <span id="thBadge" style="display:${c.theme==='custom'?'inline-block':'none'};font-size:10.5px;color:var(--gold-light);border:1px solid var(--gold-deep);border-radius:20px;padding:2px 10px">ثيم مخصص ✓</span></div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:9px">قوالب كنقطة بداية — ثم عدّلي كل لون بنفسك:</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
          ${PAGE_PRESETS.map(p=>`
          <button onclick="PAGE.preset('${p.k}')" style="background:${p.bg};border:2px solid ${c.theme===p.k?p.ac:'var(--line)'};border-radius:12px;padding:11px;text-align:right;cursor:pointer;font-family:inherit">
            <span style="display:flex;gap:5px;margin-bottom:8px"><i style="width:14px;height:14px;border-radius:50%;background:${p.ac}"></i><i style="width:14px;height:14px;border-radius:50%;background:${p.card};border:1px solid rgba(128,128,128,.35)"></i></span>
            <span style="display:block;font-size:12px;font-weight:700;color:${p.tx}">${p.ar}</span>
            <span style="display:block;font-size:9px;color:${p.tx};opacity:.5" dir="ltr">${p.k}</span>
          </button>`).join('')}
        </div>
        ${(()=>{const t=pageThemeOf(c);const FIELDS=[['bg','خلفية الصفحة'],['card','لون البطاقات'],['ac','اللون المميز — الأزرار والعناوين'],['tx','لون النصوص']];
        return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
          ${FIELDS.map(([k,lb])=>`
          <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:11px;padding:9px 12px">
            <input type="color" id="thc-${k}" value="${t[k]}" onchange="PAGE.setColor('${k}',this.value)"
              style="width:34px;height:34px;border:none;border-radius:9px;background:none;cursor:pointer;padding:0"/>
            <div style="flex:1"><div style="font-size:12px;color:var(--white)">${lb}</div>
              <input id="thx-${k}" value="${t[k]}" onchange="PAGE.setColor('${k}',this.value)" dir="ltr"
                style="width:100%;background:none;border:none;outline:none;color:var(--gold-pale);font-family:'IBM Plex Mono',monospace;font-size:11.5px;padding:2px 0"/></div>
          </div>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:14px;border:1px solid var(--line);border-radius:11px;padding:10px 14px">
          <span style="font-size:12px;color:var(--white);white-space:nowrap">استدارة الزوايا</span>
          <input type="range" min="0" max="28" value="${t.rad!=null?t.rad:18}" onchange="PAGE.setRad(this.value)" style="flex:1;accent-color:var(--gold-light)"/>
          <span id="radV" class="num" style="font-size:13px;color:var(--gold-light);width:44px;text-align:left" dir="ltr">${t.rad!=null?t.rad:18}px</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
          <span style="font-size:11px;color:var(--muted)">كل تغيير يُحفظ فوراً وينعكس على المعاينة والفاتورة</span>
          <button class="btn btn-ghost" style="padding:8px 14px;font-size:12px" onclick="PAGE.resetTheme()">استعادة الافتراضي</button>
        </div>`;})()}
      </div>
    </div>
    <div style="position:sticky;top:90px">
      <div class="sec-label">المعاينة الفورية <span class="ln"></span></div>
      <div style="width:300px;margin:0 auto;border:6px solid #26242d;border-radius:38px;background:#000;padding:7px;box-shadow:0 30px 60px rgba(0,0,0,.5)">
        <div style="width:92px;height:18px;background:#17161c;border-radius:0 0 14px 14px;margin:0 auto 5px"></div>
        <iframe id="pagePrev" src="booking.html" style="width:100%;height:520px;border:none;border-radius:26px;background:#000"></iframe>
      </div>
    </div>
  </div>`;
};

