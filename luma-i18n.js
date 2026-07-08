/* لوما · الترجمة العربية ↔ الإنجليزية
   قاموس نصوص + زر تبديل عائم يعمل في كل الصفحات. الاختيار محفوظ ويتبع الزائرة
   بين الصفحات. المحتوى المولّد ديناميكياً يُترجم عبر MutationObserver. */
(function(){
  const KEY='luma_lang';
  const get=()=>{try{return localStorage.getItem(KEY)||'ar';}catch(e){return 'ar';}};
  const set=v=>{try{localStorage.setItem(KEY,v);}catch(e){}};
  const LANG=get();

  /* ── القاموس: عربي ← إنجليزي ── */
  const DICT={
    /* أجزاء عناوين تحتوي عناصر تنسيق داخلية */
    'أنتِ':'You are','أكبر':'bigger','من واتساب.':'than WhatsApp.',
    'دخول واحد إلى':'One sign-in to','لوما':'LUMA',
    'LUMA — أنتِ أكبر من واتساب':'LUMA — You are bigger than WhatsApp',
    'LUMA — المتجر · اكتشفي خبيرتكِ':'LUMA — Marketplace · Discover your expert',
    /* عام / تنقل */
    'للعميلة':'For Clients','للخبيرة':'For Experts','المنصة':'The Platform','الباقات':'Plans','المتجر':'Marketplace',
    'تسجيل الدخول':'Sign in','انضمي كخبيرة':'Join as an Expert','الرئيسية':'Home','→ العودة للرئيسية':'→ Back to Home',
    '← العودة للمتجر':'← Back to Marketplace','جميع الحقوق محفوظة لشركة قمة كود':'All rights reserved — Qimmah Code',
    'جميع الحقوق محفوظة لشركة قمة كود · LUMA':'All rights reserved — Qimmah Code · LUMA',
    'المميزات':'Features','كيف أحجز':'How to Book','حسابي':'My Account','انضمي إلينا':'Join Us','الأسعار':'Pricing',
    'تسجيل الخروج':'Log out','إغلاق':'Close','حفظ':'Save','إلغاء':'Cancel','تأكيد':'Confirm','إضافة':'Add','تحرير':'Edit','حذف':'Delete',

    /* الصفحة الرئيسية */
    'منصة الخبيرات المحترفات':'The Professional Experts Platform',
    'أنتِ أكبر من واتساب.':'You are bigger than WhatsApp.',
    'منصة واحدة تتحول فيها الخبيرة من رقمٍ في المحادثات إلى علامةٍ مستقلة لها حضور وهوية وعملاء أوفياء — وتجد فيها العميلة خبيرتها المثالية وتحجز بثقة.':'One platform where an expert grows from a number in a chat into an independent brand with presence, identity, and loyal clients — and where every client finds her perfect expert and books with confidence.',
    'ابدئي الحجز الآن':'Start Booking Now','أنشئي استوديوكِ':'Create Your Studio',
    'دفع آمن — mada و Apple Pay':'Secure payments — mada & Apple Pay','خبيرات موثّقات':'Verified experts','حجز فوري بلا تعارض':'Instant conflict-free booking',
    'لكِ — أياً كنتِ':'For you — whoever you are','طرفان، تجربةٌ واحدة بمستوى واحد.':'Two sides. One experience, one standard.',
    'لوما تجمع العميلة الباحثة عن الأفضل، والخبيرة التي تستحق أدواتٍ بمستوى عملها — في منظومةٍ أنيقة واحدة.':'LUMA brings together clients who seek the best and experts who deserve tools worthy of their craft — in one elegant system.',
    'احجزي خبيرتكِ بثقة':'Book your expert with confidence',
    'اكتشفي خبيرات موثّقات، شاهدي أعمالهن الحقيقية، واحجزي موعدكِ في دقائق.':'Discover verified experts, browse their real work, and book your appointment in minutes.',
    'تصفّحي حسب التخصص والموقع والتقييم':'Browse by specialty, location, and rating',
    'معرض أعمال حقيقي قبل الحجز':'A real portfolio before you book',
    'حجز ودفع مسبق آمن في خطوات بسيطة':'Secure booking and prepayment in simple steps',
    'تذكير تلقائي وتقييم بعد الخدمة':'Automatic reminders and post-visit reviews',
    'تصفّحي المتجر':'Browse the Marketplace',
    'حوّلي شغفكِ إلى علامة':'Turn your passion into a brand',
    'صفحة استوديو احترافية، نظام حجز ذكي، ومدفوعات مضمونة — كل ما تحتاجينه لإدارة عملك باحتراف.':'A professional studio page, smart booking, and guaranteed payments — everything you need to run your business professionally.',
    'صفحة استوديو برابطكِ الخاص':'A studio page with your own link',
    'نظام حجز وتقويم يمنع التعارض':'Booking & calendar that prevent conflicts',
    'دفع مسبق يحميكِ من الإلغاء':'Prepayment that protects you from no-shows',
    'تقارير مالية وتحليلات تنمو معكِ':'Financial reports & analytics that grow with you',
    'ابدئي مجاناً 14 يوماً':'Start free for 14 days',
    'كل ما تحتاجينه. بلا ضجيج.':'Everything you need. No noise.',
    'منظومة متكاملة مبنية حصراً للأعمال الإبداعية المحترفة — حجزٌ، دفعٌ، تسويقٌ، وتحليلاتٌ في مكانٍ واحد.':'A complete system built exclusively for professional creative businesses — booking, payments, marketing, and analytics in one place.',
    'حجز ذكي':'Smart Booking','تقويم متكامل يمنع التعارض ويتيح الحجز الفوري على مدار الساعة.':'An integrated calendar that prevents conflicts and enables instant booking around the clock.',
    'دفع مسبق آمن':'Secure Prepayment','mada و Apple Pay — يحمي وقتكِ من الإلغاء ويضمن الجدية.':'mada & Apple Pay — protects your time from cancellations and ensures commitment.',
    'معرض أعمال':'Portfolio','اعرضي أعمالكِ الحقيقية بمقارنات قبل/بعد تُبهر عميلاتك.':'Showcase your real work with before/after comparisons that wow your clients.',
    'واتساب تلقائي':'Automatic WhatsApp','تأكيدات وتذكيرات تُرسل تلقائياً — بلا متابعة يدوية.':'Confirmations and reminders sent automatically — no manual follow-up.',
    'تحليلات ونمو':'Analytics & Growth','تقارير مالية، أداء الخدمات، وسلوك العميلات في لوحة واحدة.':'Financial reports, service performance, and client behavior in one dashboard.',
    'مساعد ذكاء اصطناعي':'AI Assistant','يكتب وصف خدماتكِ ويقترح أوقاتكِ الأمثل تلقائياً.':'Writes your service descriptions and suggests your optimal hours automatically.',
    'من البحث إلى الموعد، في أربع خطوات.':'From search to appointment, in four steps.',
    'اكتشفي':'Discover','تصفّحي الخبيرات حسب التخصص والموقع والتقييم.':'Browse experts by specialty, location, and rating.',
    'اختاري':'Choose','شاهدي معرض الأعمال واختاري الخدمة والموعد المناسب.':'View the portfolio and pick your service and time.',
    'ادفعي':'Pay','دفع مسبق آمن عبر mada أو Apple Pay في ثوانٍ.':'Secure prepayment via mada or Apple Pay in seconds.',
    'استمتعي':'Enjoy','تأكيد فوري، تذكير تلقائي، وتقييم بعد الخدمة.':'Instant confirmation, automatic reminders, and a post-visit review.',
    'ثلاث باقات ترافق نموّكِ.':'Three plans that grow with you.',
    'من الشرارة الأولى إلى الاستوديو المتكامل — اختاري ما يناسب مرحلتكِ، ورقّي متى شئتِ.':'From the first spark to a complete studio — pick what fits your stage and upgrade anytime.',
    'سَناء':'Sanaa','الرفعة في البدايات':'Grace from the start','ر.س / شهر':'SAR / month',
    'أدوات احترافية حقيقية من اليوم الأول.':'Real professional tools from day one.',
    'الأكثر طلباً ◆':'Most Popular ◆','الأكثر طلباً':'Most Popular',
    'وَهَج':'Wahaj','الضوء الذي يملأ الفضاء':'The light that fills the room','منظومة متكاملة تعمل عنكِ.':'A complete system working for you.',
    'فَرِيد':'Fareed','لا مثيل له في صنعته':'One of a kind','نظام استوديو متكامل بذكاء اصطناعي.':'A complete AI-powered studio system.',
    'عرض تفاصيل الباقات الكاملة ←':'View full plan details ←',
    'خبيراتٌ موثّقات، في انتظاركِ.':'Verified experts, waiting for you.',
    'مكياج، عناية بالبشرة، شعر، تصوير، وأكثر — اكتشفي نخبة الخبيرات في مدينتكِ، قارني أعمالهن وتقييماتهن، واحجزي بثقة.':'Makeup, skincare, hair, photography, and more — discover the finest experts in your city, compare their work and reviews, and book with confidence.',
    'ادخلي المتجر':'Enter the Marketplace',
    'خبيرة مكياج · جدة':'Makeup Artist · Jeddah','عناية بالبشرة · الرياض':'Skincare · Riyadh','تصفيف شعر · جازان':'Hair Styling · Jazan',
    'حيث تبدأ المهنية الحقيقية.':'Where true professionalism begins.',
    'سواء كنتِ تبحثين عن خبيرتكِ المثالية، أو تبنين علامتكِ — لوما هي البداية.':'Whether you are looking for your perfect expert or building your brand — LUMA is where it starts.',
    'تصفّحي الخبيرات':'Browse Experts',
    'منصة متخصصة لإدارة الأعمال الإبداعية المحترفة في المملكة والخليج.':'A specialized platform for professional creative businesses in Saudi Arabia and the Gulf.',

    /* تسجيل الدخول */
    'دخول واحد إلى لوما':'One sign-in to LUMA',
    'سجّلي دخولكِ ببياناتكِ، والنظام يتعرّف تلقائيًا على نوع حسابكِ ويوجّهكِ إلى لوحتكِ الصحيحة — عميلة، خبيرة، صالون، أو إدارة.':'Sign in with your credentials and the system detects your account type automatically — client, expert, salon, or admin.',
    'دخول موحّد بلا اختيار نوع الحساب':'Unified sign-in, no account-type selection',
    'توجيه ذكي إلى اللوحة المناسبة':'Smart routing to the right dashboard',
    'دخول آمن وموثّق':'Secure, verified access',
    'دخول موحّد — النظام يكتشف نوع حسابكِ تلقائيًا.':'Unified sign-in — your account type is detected automatically.',
    'البريد الإلكتروني أو الجوال':'Email or mobile','كلمة المرور':'Password','تذكّرني':'Remember me','نسيتِ كلمة المرور؟':'Forgot password?','دخول':'Sign in',
    '◆ حسابات تجريبية (ديمو)':'◆ Demo accounts',
    'اضغطي على أي حساب للدخول مباشرة إلى لوحته. كلمة المرور للجميع: 123456':'Tap any account to enter its dashboard directly. Password for all: 123456',
    'عميلة':'Client','خبيرة':'Expert','صالون':'Salon','الإدارة':'Admin','موظفة صالون':'Salon Staff',
    'دخول لوحة العميلة ←':'Enter client dashboard ←','دخول لوحة الخبيرة ←':'Enter expert dashboard ←',
    'دخول لوحة الصالون ←':'Enter salon dashboard ←','دخول لوحة الأدمن ←':'Enter admin dashboard ←','دخول بوابة الموظفة ←':'Enter staff portal ←',
    'بوابة الموظفة — جدولي · أرباحي · طلباتي · حضوري':'Staff portal — my schedule · earnings · requests · attendance',
    'ليس لديكِ حساب؟ أنشئي حسابكِ':"Don't have an account? Create one",

    /* المتجر */
    'اكتشفي خبيرتكِ أو صالونكِ':'Discover your expert or salon','الفلترة':'Filters','مسح الكل':'Clear all','نوع المزوّدة':'Provider type',
    'الكل':'All','خبيرات مستقلات':'Independent experts','صوالين':'Salons','التخصّص':'Specialty','المدينة':'City','نتيجة':'results',
    'الأكثر ملاءمة':'Best match','الأعلى تقييماً':'Top rated','الأكثر طلباً':'Most booked','السعر: من الأقل':'Price: low to high','أقرب فرع':'Nearest branch',
    'احجزي الآن ←':'Book now ←','التعليقات':'Reviews','استفسارات':'Inquiries','كوني أول من يقيّم!':'Be the first to review!',
    'زيارة موثقة ✓':'Verified visit ✓',

    /* صفحة الحجز العامة */
    'اختاري خدمتك':'Choose your service','اختاري الأخصائية':'Choose your specialist','التاريخ والوقت':'Date & time','تأكيد الموعد':'Confirm appointment',
    'متابعة':'Continue','تأكيد الحجز ✓':'Confirm booking ✓','تم تأكيد حجزك 🎉':'Your booking is confirmed 🎉','حجز موعد آخر':'Book another appointment',
    'تذكرة الحجز':'Booking ticket','الأخصائية':'Specialist','التاريخ':'Date','الوقت':'Time','المدة':'Duration','الإجمالي':'Total',
    'سياسة الحجز 📋':'Booking policy 📋','كود خصم؟ (اختياري)':'Discount code? (optional)','تطبيق':'Apply','تم تطبيق الخصم ✓':'Discount applied ✓',
    'الكود غير صحيح أو منتهي':'Invalid or expired code','في إجازة معتمدة':'On approved leave','إجازة':'Leave','لا أوقات متاحة هذا اليوم':'No slots available this day',
    'الحضور قبل الموعد بـ10 دقائق يضمن اكتمال جلستك كاملة.':'Arriving 10 minutes early ensures your full session.',
    'يمكن إلغاء أو تعديل الحجز مجاناً قبل 24 ساعة من الموعد.':'Free cancellation or rescheduling up to 24 hours before your appointment.',
    'التأخر أكثر من 15 دقيقة قد يتطلب إعادة جدولة الموعد.':'Arriving more than 15 minutes late may require rescheduling.',
    'قيمة العربون (إن وُجد) تُخصم من الفاتورة النهائية.':'Any deposit paid is deducted from your final invoice.',
    'جديدة':'New','عرض خاص':'Special Offer','اختيار الخبيرات':"Experts' Pick",
    '⭐ الأكثر طلباً':'⭐ Most Popular','⭐ جديدة':'⭐ New','⭐ عرض خاص':'⭐ Special Offer','⭐ اختيار الخبيرات':"⭐ Experts' Pick",
    'مكياج ✨':'Makeup ✨','شعر 💇‍♀️':'Hair 💇‍♀️','أظافر 💅':'Nails 💅','بشرة 🧖‍♀️':'Skin 🧖‍♀️','أخرى 🌸':'Other 🌸',
    'مكياج سهرة':'Evening Makeup','مكياج عروس':'Bridal Makeup','مكياج ناعم':'Soft Makeup','صبغة + قص':'Color + Cut','تسريحة':'Hairstyle',
    'كيراتين':'Keratin','هيدرافيشل':'HydraFacial','تنظيف بشرة':'Deep Cleansing','تقشير':'Peeling','منيكير جل':'Gel Manicure',
    'منيكير + بديكير':'Mani + Pedi','تركيب أظافر':'Nail Extensions',

    /* صفحة الخبيرة */
    'احجزي موعدًا':'Book an Appointment','منتجاتها':'Her Products','التقييمات':'Reviews','نبذة عنها':'About her','نبذة عن الصالون':'About the salon',
    '🔗 شاهدي أعمالها':'🔗 View her work','تقييمات عميلاتها':'Client reviews','شاركي تجربتك ✍️':'Share your experience ✍️',
    'اسمك':'Your name','نشر التقييم':'Publish review','حجز فوري · تأكيد لحظي':'Instant booking · Immediate confirmation',
    '◆ خبيرة موثّقة':'◆ Verified expert','⬢ صالون معتمد':'⬢ Certified salon','الخدمة':'Service','الموعد':'Appointment','التأكيد':'Confirmation','تم':'Done',
    'اختاري الخدمة':'Choose a service',

    /* لوحة الصالون — التنقل الرئيسي (تغطية أساسية) */
    'نظرة عامة':'Overview','لوحة الحجوزات':'Booking Board','الطاقم والموارد البشرية':'Staff & HR','صفحتي والرابط':'My Page & Link',
    'العملاء':'Clients','الخدمات':'Services','المنتجات':'Products','المخزون':'Inventory','الاشتراكات':'Subscriptions',
    'الفواتير البيعية':'Sales Invoices','التسويق':'Marketing','المالية':'Finance','التقارير':'Reports','الفروع':'Branches','الإعدادات':'Settings',
    '+ حجز جديد':'+ New Booking','مديرة الصالون':'Salon Manager',
  };

  /* أنماط رقمية شائعة */
  const RX=[
    [/(\d[\d,\.]*)\s*ر\.س/g,'SAR $1'],
    [/\(?(\d+)\s*حجز\)?/g,'$1 bookings'],
    [/(\d+)\s*دقيقة/g,'$1 min'],
    [/(\d+)\s*تقييم/g,'$1 reviews'],
  ];

  function trText(raw){
    const k=raw.trim();if(!k||!/[؀-ۿ]/.test(k))return null;
    if(DICT[k])return raw.replace(k,DICT[k]);
    let v=k,hit=false;
    for(const [re,rep] of RX){re.lastIndex=0;if(re.test(v)){re.lastIndex=0;v=v.replace(re,rep);hit=true;}}
    return hit&&v!==k?raw.replace(k,v):null;
  }
  function walk(root){
    if(!root)return;
    if(root.nodeType===3){const t=trText(root.nodeValue);if(t)root.nodeValue=t;return;}
    if(root.nodeType!==1&&root.nodeType!==9)return;
    const it=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
    let n;while((n=it.nextNode())){const t=trText(n.nodeValue);if(t)n.nodeValue=t;}
    const host=root.querySelectorAll?root:document;
    host.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{
      ['placeholder','title','aria-label'].forEach(a=>{
        const v=el.getAttribute(a);if(!v)return;const t=trText(v);if(t)el.setAttribute(a,t);
      });
    });
  }

  function applyEN(){
    document.documentElement.setAttribute('lang','en');
    document.documentElement.setAttribute('dir','ltr');
    walk(document.body);
    const t=trText(document.title);if(t)document.title=t;
    new MutationObserver(muts=>{
      muts.forEach(m=>{
        if(m.type==='characterData'){const t=trText(m.target.nodeValue);if(t)m.target.nodeValue=t;}
        m.addedNodes&&m.addedNodes.forEach(walk);
      });
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
  }

  /* زر التبديل — بجانب زر الثيم */
  function btn(){
    const b=document.createElement('button');
    b.className='luma-lang-btn';
    b.textContent=LANG==='en'?'ع':'EN';
    b.title=LANG==='en'?'التبديل إلى العربية':'Switch to English';
    b.setAttribute('aria-label',b.title);
    b.style.cssText='position:fixed;bottom:14px;left:68px;z-index:80;width:44px;height:44px;border-radius:50%;border:1px solid rgba(160,132,80,.5);background:rgba(20,19,24,.82);color:#dbbd81;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.3)';
    b.onclick=()=>{set(LANG==='en'?'ar':'en');location.reload();};
    document.body.appendChild(b);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{if(LANG==='en')applyEN();btn();});
  }else{
    if(LANG==='en')applyEN();btn();
  }
})();
