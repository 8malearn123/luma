/* ═══ LUMA Theme — الداكن هو الثيم الوحيد ═══
   الهوية المعتمدة (IDENTITY HANDOFF · صفحة 11) تنصّ في «غير القابل للتفاوض»:
     «Dark is the only theme. There is no light mode.»
   وقائمة «قبل أن تُطلق» تعدّ الوضع الفاتح مخالفةً صريحة.
   لذا أُزيل الوضع الفاتح وزر التبديل، وتُنظَّف قيمة luma_theme المخزّنة
   حتى لا يبقى متصفّح مستخدمة عالقاً على ثيم لم يعد له وجود.
   كل ألوان الهوية تعيش الآن في luma-core.css — لا ثيم بديل هنا. */
(function(){
  if(window.__LUMA_THEME__) return; window.__LUMA_THEME__=true;
  document.documentElement.dataset.theme='dark';
  try{
    if(window.LumaStore)LumaStore.raw.set('luma_theme','dark');
    else localStorage.setItem('luma_theme','dark');
  }catch(e){}
})();

/* ── PWA: تسجيل عامل الخدمة (يعمل على https والمعاينة المحلية فقط) ── */
(function(){
  if(!('serviceWorker' in navigator))return;
  var ok=location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname);
  if(ok)window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
})();
