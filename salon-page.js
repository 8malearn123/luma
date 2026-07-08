/* لوما · داشبورد الصالون — مُنشئ الرابط والصفحة الخاصة */
/* ══════════ مُنشئ الرابط والصفحة الخاصة (Landing & Booking Link) ══════════ */
const PAGE_KEY='luma_page_cfg';
const PAGE_THEMES=[['dark-luxury','فخامة داكنة','#09090b','#e5c158'],['rose-velvet','مخمل وردي','#1a0e12','#e08a9b'],['minimal-emerald','زمرد هادئ','#0a1413','#8fd0c0']];
const pageCfg=()=>({slug:'lama-beauty',title:'صالون لمسة',bio:'وجهتكِ الأولى للجمال في جدة — مكياج، شعر، وعناية ملكية بلمسات خبيرات.',phone:'0555 123 456',address:'جدة · حي الشاطئ',logo:'',cover:'',theme:'dark-luxury',...hrLoad(PAGE_KEY,{})});
const slugClean=v=>v.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-');
const PAGE={
  save(patch,silent){const c={...pageCfg(),...patch};hrSave(PAGE_KEY,c);
    const fr=document.getElementById('pagePrev');if(fr)fr.contentWindow.location.reload();
    if(!silent)LUX.toast('حُفظت التغييرات وانعكست على المعاينة ✓','ok');},
  copy(){const c=pageCfg();navigator.clipboard.writeText(location.origin+location.pathname.replace(/[^/]*$/,'')+'booking.html?s='+c.slug).then(()=>{
    const b=document.getElementById('cpBtn');if(b){b.textContent='✓ نُسخ!';setTimeout(()=>b.textContent='نسخ الرابط',1600);}});},
  field(k,el){const v=k==='slug'?slugClean(el.value):el.value;if(k==='slug')el.value=v;PAGE.save({[k]:v},true);},
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
        <div class="sec-label">مظهر وتصميم الصفحة <span class="ln"></span></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          ${PAGE_THEMES.map(([k,ar,bg,ac])=>`
          <button onclick="PAGE.save({theme:'${k}'})" style="background:${bg};border:2px solid ${c.theme===k?ac:'var(--line)'};border-radius:13px;padding:14px;text-align:right;cursor:pointer;font-family:inherit">
            <span style="display:flex;gap:6px;margin-bottom:9px"><i style="width:16px;height:16px;border-radius:50%;background:${ac}"></i><i style="width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.12)"></i></span>
            <span style="display:block;font-size:12.5px;font-weight:700;color:#f5f1e8">${ar}</span>
            <span style="display:block;font-size:9.5px;color:#8a8a8a" dir="ltr">${k}</span>
          </button>`).join('')}
        </div>
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

