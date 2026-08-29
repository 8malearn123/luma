// ═══ لوما · اختبارات الدورة المحاسبية ═══
// تُشغَّل السيناريوهات داخل المتصفح على المحرك نفسه الذي تستخدمه اللوحة.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
});

/** يفتح لوحة الصالون (حيث يُحمَّل المحرك) وينفّذ دالة داخل الصفحة */
async function acc(page, fn, arg) {
  await page.goto('/salon.html');
  await page.waitForFunction(() => window.LumaAcc && LumaAcc.Journal, null, { timeout: 10000 });
  return page.evaluate(fn, arg);
}

test('النواة: دليل الحسابات وطبيعة الحسابات وطبقة الربط', async ({ page }) => {
  const r = await acc(page, () => {
    const { COA, Mapping } = LumaAcc;
    return {
      count: COA.all().length,
      cashType: COA.get('110101').type,
      cashNature: COA.get('110101').nature,
      revNature: COA.get('4101').nature,
      contraNature: COA.get('4190').nature,      // مردودات المبيعات: مقابل للإيراد
      accumNature: COA.get('1202').nature,       // مجمع الإهلاك: مقابل للأصل
      groupNotPostable: COA.postable('1'),
      leafPostable: COA.postable('110101'),
      mappedCash: Mapping.acc('cash'),
      parentOf1101: COA.get('110101').parent,
    };
  });
  expect(r.count).toBeGreaterThan(30);
  expect(r.cashType).toBe('asset');
  expect(r.cashNature).toBe('debit');
  expect(r.revNature).toBe('credit');
  expect(r.contraNature).toBe('debit');          // معكوسة عن نوعها
  expect(r.accumNature).toBe('credit');
  expect(r.groupNotPostable).toBe(false);        // لا ترحيل على حساب أب
  expect(r.leafPostable).toBe(true);
  expect(r.mappedCash).toBe('110101');
  expect(r.parentOf1101).toBe('1101');
});

test('المحرك: يرفض القيد غير المتوازن ولا يسمح بتعديل المرحَّل', async ({ page }) => {
  const r = await acc(page, () => {
    const { Journal } = LumaAcc;
    const out = {};
    // غير متوازن
    try { Journal.create({ desc:'خطأ', lines:[
      {account:'110101',debit:100},{account:'4101',credit:90}]}); out.unbalanced='لم يُرفض'; }
    catch(e){ out.unbalanced = e.message; }
    // سطر مدين ودائن معاً
    try { Journal.create({ desc:'خطأ', lines:[
      {account:'110101',debit:100,credit:100},{account:'4101',credit:100}]}); out.bothSides='لم يُرفض'; }
    catch(e){ out.bothSides = e.message; }
    // حساب أب
    try { Journal.create({ desc:'خطأ', lines:[
      {account:'1101',debit:100},{account:'4101',credit:100}]}); out.groupAcc='لم يُرفض'; }
    catch(e){ out.groupAcc = e.message; }
    // قيد سليم ثم محاولة تعديله بعد الترحيل
    const je = Journal.create({ desc:'سليم', lines:[
      {account:'110101',debit:100},{account:'4101',credit:100}]}, {post:true});
    out.posted = je.status;
    try { Journal.update(je.id,{desc:'تلاعب'}); out.editPosted='لم يُرفض'; }
    catch(e){ out.editPosted = e.message; }
    try { Journal.voidDraft(je.id,'محاولة'); out.voidPosted='لم يُرفض'; }
    catch(e){ out.voidPosted = e.message; }
    return out;
  });
  expect(r.unbalanced).toContain('غير متوازن');
  expect(r.bothSides).toContain('إما مدين أو دائن');
  expect(r.groupAcc).toContain('حساب أب');
  expect(r.posted).toBe('posted');
  expect(r.editPosted).toContain('لا يُعدَّل');
  expect(r.voidPosted).toContain('لا يُلغى');
});

test('سيناريو بيع نقدي: 1,000 + ضريبة ١٥٪ — الإيراد والضريبة والصندوق والقائمة', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Ledger, Reports, Money } = LumaAcc;
    const je = Events.post('sale_cash', {
      source:'sale', sourceId:'T-1', date:'2026-03-01', kind:'service',
      method:'نقداً', net:1000, vat:150, tip:0, desc:'بيع نقدي',
    });
    const f={from:'2026-03-01',to:'2026-03-31'};
    const is = Reports.incomeStatement(f);
    return {
      status: je.status,
      debit: je.lines.reduce((t,l)=>t+l.debit,0),
      credit: je.lines.reduce((t,l)=>t+l.credit,0),
      cash: Ledger.balance('110101'),          // 1,150 ر.س = 115000 هللة
      revenue: Ledger.balance('4101'),         // 1,000
      vatOut: Ledger.balance('2110'),          // 150
      netProfit: is.netProfit,
      tb: Ledger.trialBalance().balanced,
      bs: Reports.balanceSheet().balanced,
    };
  });
  expect(r.status).toBe('posted');
  expect(r.debit).toBe(r.credit);
  expect(r.cash).toBe(115000);
  expect(r.revenue).toBe(100000);
  expect(r.vatOut).toBe(15000);
  expect(r.netProfit).toBe(100000);            // الضريبة ليست إيراداً
  expect(r.tb).toBe(true);
  expect(r.bs).toBe(true);
});

test('سيناريو بيع آجل ثم تحصيل: الذمم ترتفع ثم تنخفض والنقد يرتفع', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Ledger, Reports } = LumaAcc;
    const party = {kind:'customer',id:'C1',name:'نوف العتيبي'};
    Events.post('sale_credit', {source:'sale',sourceId:'T-2',date:'2026-03-02',
      kind:'service',net:2000,vat:300,party,desc:'بيع آجل'});
    const afterSale = { ar: Ledger.balance('1110'), rev: Ledger.balance('4101'), vat: Ledger.balance('2110') };
    Events.post('receipt', {source:'receipt',sourceId:'R-1',date:'2026-03-10',
      method:'mada',amount:2300,party,desc:'تحصيل'});
    return {
      afterSale,
      ar: Ledger.balance('1110'),
      clearing: Ledger.balance('1103'),        // مدى تحت التحصيل
      statement: Ledger.party('customer','C1').rows.length,
      closing: Ledger.party('customer','C1').closing,
      tb: Ledger.trialBalance().balanced,
      bs: Reports.balanceSheet().balanced,
    };
  });
  expect(r.afterSale.ar).toBe(230000);
  expect(r.afterSale.rev).toBe(200000);
  expect(r.afterSale.vat).toBe(30000);
  expect(r.ar).toBe(0);                         // سُدّدت الذمة بالكامل
  expect(r.clearing).toBe(230000);
  expect(r.statement).toBe(2);                  // كشف حساب العميلة: بيع + تحصيل
  expect(r.closing).toBe(0);
  expect(r.tb).toBe(true);
  expect(r.bs).toBe(true);
});

test('سيناريو شراء آجل ثم دفع للمورد: المخزون والضريبة والالتزام', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Ledger, Reports } = LumaAcc;
    const party = {kind:'supplier',id:'S1',name:'مورّد الجمال'};
    Events.post('purchase', {source:'purchase',sourceId:'P-1',date:'2026-03-03',
      toInventory:true,net:5000,vat:750,paid:false,party,desc:'شراء مستلزمات'});
    const after = { inv: Ledger.balance('1120'), vatIn: Ledger.balance('1130'), ap: Ledger.balance('2101') };
    Events.post('supplier_payment', {source:'payment',sourceId:'SP-1',date:'2026-03-20',
      method:'تحويل بنكي',amount:5750,party,desc:'دفع مورد'});
    return { after, ap: Ledger.balance('2101'), bank: Ledger.balance('110201'),
             supplierRows: Ledger.party('supplier','S1').rows.length,
             tb: Ledger.trialBalance().balanced, bs: Reports.balanceSheet().balanced };
  });
  expect(r.after.inv).toBe(500000);
  expect(r.after.vatIn).toBe(75000);
  expect(r.after.ap).toBe(575000);
  expect(r.ap).toBe(0);
  expect(r.bank).toBe(-575000);                 // البنك انخفض
  expect(r.supplierRows).toBe(2);
  expect(r.tb).toBe(true);
  expect(r.bs).toBe(true);
});

test('سيناريو مصروف ومرتجع: المصروف يُحمَّل والمرتجع يعكس الإيراد والضريبة', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Ledger, Reports } = LumaAcc;
    Events.post('sale_cash', {source:'sale',sourceId:'T-3',date:'2026-03-04',
      kind:'product',method:'نقداً',net:1000,vat:150,desc:'بيع منتج'});
    Events.post('expense', {source:'expense',sourceId:'E-1',date:'2026-03-05',
      expenseRole:'exp_rent',net:3000,vat:450,method:'تحويل بنكي',desc:'إيجار'});
    const beforeReturn = Reports.incomeStatement().netProfit;
    Events.post('sales_return', {source:'return',sourceId:'RT-1',date:'2026-03-06',
      net:400,vat:60,method:'نقداً',desc:'مرتجع منتج'});
    const is = Reports.incomeStatement();
    return {
      rent: Ledger.balance('5203'), vatIn: Ledger.balance('1130'),
      returns: Ledger.balance('4190'), vatOut: Ledger.balance('2110'),
      cash: Ledger.balance('110101'),
      beforeReturn, netProfit: is.netProfit,
      tb: Ledger.trialBalance().balanced, bs: Reports.balanceSheet().balanced,
    };
  });
  expect(r.rent).toBe(300000);
  expect(r.vatIn).toBe(45000);
  expect(r.returns).toBe(40000);                // مردودات (مقابل الإيراد)
  expect(r.vatOut).toBe(15000 - 6000);          // الضريبة عُكست جزئياً
  expect(r.cash).toBe(115000 - 46000);
  expect(r.netProfit).toBe(r.beforeReturn - 40000);
  expect(r.tb).toBe(true);
  expect(r.bs).toBe(true);
});

test('العكس: قيد مرحَّل يُعكَس ولا يُحذف، والأثر يعود صفراً', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Journal, Ledger, Audit } = LumaAcc;
    const je = Events.post('sale_cash', {source:'sale',sourceId:'T-9',date:'2026-03-07',
      kind:'service',method:'نقداً',net:500,vat:75,desc:'بيع للعكس'});
    const before = Ledger.balance('4101');
    const rev = Journal.reverse(je.id, 'خطأ في المبلغ');
    const src = Journal.get(je.id);
    let noReason = '';
    try { Journal.reverse(rev.id, ''); } catch(e) { noReason = e.message; }
    return {
      before, after: Ledger.balance('4101'),
      srcStatus: src.status, srcStillExists: !!src,
      reversedBy: src.reversedBy, revIsPosted: rev.status,
      revLinesFlipped: rev.lines.some(l=>l.debit>0 && je.lines.some(o=>o.account===l.account && o.credit===l.debit)),
      noReason,
      auditActions: Audit.all({entity:'journal', id:je.id}).map(a=>a.action),
      tb: Ledger.trialBalance().balanced,
    };
  });
  expect(r.after).toBe(r.before - 50000);
  expect(r.srcStatus).toBe('reversed');
  expect(r.srcStillExists).toBe(true);           // لم يُحذف
  expect(r.reversedBy).toMatch(/^JE-/);
  expect(r.revIsPosted).toBe('posted');
  expect(r.revLinesFlipped).toBe(true);
  expect(r.noReason).toContain('سبباً');
  expect(r.auditActions).toContain('create');
  expect(r.auditActions).toContain('post');
  expect(r.auditActions).toContain('reverse');
  expect(r.tb).toBe(true);
});

test('عدم الازدواج: العملية الواحدة قيد واحد مهما تكرر النداء', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Journal, Reports } = LumaAcc;
    const a = Events.post('sale_cash', {source:'sale',sourceId:'DUP-1',date:'2026-03-08',
      kind:'service',method:'نقداً',net:100,vat:15,desc:'أولى'});
    const b = Events.post('sale_cash', {source:'sale',sourceId:'DUP-1',date:'2026-03-08',
      kind:'service',method:'نقداً',net:100,vat:15,desc:'مكررة'});
    return { same: a.id === b.id,
             count: Journal.list({source:'sale'}).filter(j=>j.sourceId==='DUP-1').length,
             integrity: Reports.integrity() };
  });
  expect(r.same).toBe(true);
  expect(r.count).toBe(1);
  expect(r.integrity.ok).toBe(true);
});

test('الفترات: لا ترحيل في فترة مقفلة، وإعادة الفتح تتطلب سبباً', async ({ page }) => {
  const r = await acc(page, () => {
    const { Journal, Periods, Events } = LumaAcc;
    const p = Periods.open('2026-01-01','2026-01-31','يناير 2026');
    Periods.close(p.id,'إقفال شهري');
    const out = { closed: Periods.isClosed('2026-01-15') };
    try { Events.post('sale_cash',{source:'sale',sourceId:'CLOSED-1',date:'2026-01-15',
      kind:'service',method:'نقداً',net:100,vat:15,desc:'في فترة مقفلة'}); out.blocked='لم يُمنع'; }
    catch(e){ out.blocked = e.message; }
    try { Periods.reopen(p.id,''); out.reopenNoReason='لم يُرفض'; }
    catch(e){ out.reopenNoReason = e.message; }
    Periods.reopen(p.id,'تصحيح قيد');
    out.afterReopen = Periods.isClosed('2026-01-15');
    return out;
  });
  expect(r.closed).toBe(true);
  expect(r.blocked).toContain('مقفلة');
  expect(r.reopenNoReason).toContain('سبباً');
  expect(r.afterReopen).toBe(false);
});

test('سيناريو الإقفال: الإيرادات والمصروفات تُصفَّر والنتيجة تذهب للأرباح المحتجزة', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Ledger, Reports } = LumaAcc;
    Events.post('sale_cash',{source:'sale',sourceId:'CL-1',date:'2026-04-01',
      kind:'service',method:'نقداً',net:10000,vat:1500,desc:'إيراد الفترة'});
    Events.post('expense',{source:'expense',sourceId:'CL-2',date:'2026-04-02',
      expenseRole:'exp_rent',net:4000,vat:0,method:'نقداً',desc:'إيجار الفترة'});
    const f={from:'2026-04-01',to:'2026-04-30'};
    const before = Reports.incomeStatement(f).netProfit;
    Reports.closePeriod('2026-04-01','2026-04-30','إقفال أبريل');
    return {
      before,
      revAfter: Ledger.balance('4101',f),
      expAfter: Ledger.balance('5203',f),
      summary : Ledger.balance('3301',f),
      retained: Ledger.balance('3201',f),
      tb: Ledger.trialBalance().balanced,
      integrity: Reports.integrity().ok,
    };
  });
  expect(r.before).toBe(600000);                 // 10,000 − 4,000
  expect(r.revAfter).toBe(0);                    // صُفّر الإيراد
  expect(r.expAfter).toBe(0);                    // صُفّر المصروف
  expect(r.summary).toBe(0);                     // ملخص الدخل أُقفل بدوره
  expect(r.retained).toBe(600000);               // النتيجة في الأرباح المحتجزة
  expect(r.tb).toBe(true);
  expect(r.integrity).toBe(true);
});

test('أعمار الذمم وإقرار الضريبة يُشتقّان من الدفتر', async ({ page }) => {
  const r = await acc(page, () => {
    const { Events, Reports } = LumaAcc;
    const today = new Date();
    const iso = d => new Date(today.getTime() - d*864e5).toISOString().slice(0,10);
    const p1={kind:'customer',id:'C-A',name:'عميلة قديمة'};
    const p2={kind:'customer',id:'C-B',name:'عميلة حديثة'};
    Events.post('sale_credit',{source:'sale',sourceId:'AG-1',date:iso(100),kind:'service',net:1000,vat:150,party:p1});
    Events.post('sale_credit',{source:'sale',sourceId:'AG-2',date:iso(10 ),kind:'service',net:2000,vat:300,party:p2});
    const ag = Reports.aging('customer');
    const vat = Reports.vatReturn();
    return {
      rows: ag.rows.length,
      old:  (ag.rows.find(x=>x.id==='C-A')||{}).buckets,
      recent:(ag.rows.find(x=>x.id==='C-B')||{}).buckets,
      grand: ag.grand,
      outputVat: vat.outputVat, payable: vat.payable, rate: vat.rate,
    };
  });
  expect(r.rows).toBe(2);
  expect(r.old[4]).toBe(115000);                 // أكثر من ٩٠ يوماً
  expect(r.recent[1]).toBe(230000);              // 1–30 يوم
  expect(r.grand).toBe(345000);
  expect(r.outputVat).toBe(45000);
  expect(r.payable).toBe(45000);                 // لا ضريبة مدخلات
  expect(r.rate).toBe(0.15);
});

test('التكامل الحي: دفع موعد في اللوحة يُنتج قيداً متوازناً بلا تدخل', async ({ page }) => {
  await page.goto('/salon.html#board');
  await page.waitForFunction(() => window.LumaAcc && window.SALON, null, { timeout: 10000 });
  await page.waitForTimeout(600);

  // ادفعي أول موعد غير مدفوع من لوحة الحجوزات
  const before = await page.evaluate(() => LumaAcc.Journal.list({source:'sale'}).length);
  await page.evaluate(() => {
    const a = APPTS.find(x => x.st !== 'cancelled' && x.st !== 'blocked' && !paidOf(x.id));
    SALON.payFlow(a.id);
  });
  await page.waitForTimeout(300);
  await page.click('[data-ok]');
  await page.waitForTimeout(1600);

  const r = await page.evaluate(() => {
    const { Journal, Ledger, Reports } = LumaAcc;
    const je = Journal.list({ source:'sale' })[0];
    return {
      count: Journal.list({source:'sale'}).length,
      status: je && je.status,
      balanced: je && je.lines.reduce((t,l)=>t+l.debit,0) === je.lines.reduce((t,l)=>t+l.credit,0),
      hasRevenue: je && je.lines.some(l=>l.account==='4101' && l.credit>0),
      hasVat: je && je.lines.some(l=>l.account==='2110' && l.credit>0),
      costCenter: je && je.costCenter,
      tb: Ledger.trialBalance().balanced,
      integrity: Reports.integrity(),
    };
  });
  expect(r.count).toBe(before + 1);
  expect(r.status).toBe('posted');
  expect(r.balanced).toBe(true);
  expect(r.hasRevenue).toBe(true);
  expect(r.hasVat).toBe(true);
  expect(r.costCenter).toBeTruthy();             // مركز التكلفة = الفرع
  expect(r.tb).toBe(true);
  expect(r.integrity.ok).toBe(true);
});

// ═══ الوحدات التكميلية ═══

test('الأرصدة الافتتاحية: الفرق يذهب لرأس المال والقيد يتوازن', async ({ page }) => {
  const r = await acc(page, () => {
    const { Opening, Ledger, Reports } = LumaAcc;
    const je = Opening.post('2026-01-01', [
      {account:'110101',debit:50000},        // صندوق
      {account:'1120',debit:20000},          // مخزون
      {account:'2101',credit:15000},         // موردون
    ]);
    let dup='';
    try { Opening.post('2026-01-01',[{account:'110101',debit:1}]); } catch(e){ dup=e.message; }
    return {
      balanced: je.lines.reduce((t,l)=>t+l.debit,0) === je.lines.reduce((t,l)=>t+l.credit,0),
      cash: Ledger.balance('110101'), inv: Ledger.balance('1120'),
      ap: Ledger.balance('2101'), capital: Ledger.balance('3101'),
      dup, tb: Ledger.trialBalance().balanced, bs: Reports.balanceSheet().balanced,
    };
  });
  expect(r.balanced).toBe(true);
  expect(r.cash).toBe(5000000);
  expect(r.inv).toBe(2000000);
  expect(r.ap).toBe(1500000);
  expect(r.capital).toBe(5500000);             // 70,000 − 15,000
  expect(r.dup).toContain('يوجد قيد افتتاحي');
  expect(r.tb).toBe(true);
  expect(r.bs).toBe(true);
});

test('الصناديق والبنوك: إنشاء حساب وتحويل برسوم', async ({ page }) => {
  const r = await acc(page, () => {
    const { Cash, Ledger, Reports } = LumaAcc;
    const safe = Cash.add({kind:'cash', name:'صندوق الروضة'});
    const bank = Cash.add({kind:'bank', name:'الراجحي — الرئيسي', bank:'الراجحي'});
    // موّلي الصندوق برصيد افتتاحي حتى يكون التحويل واقعياً
    LumaAcc.Opening.post('2026-02-01',[{account:safe.account,debit:10000}]);
    const je = Cash.transfer(safe.id, bank.id, 3000, {fee:15, date:'2026-02-05'});
    return {
      safeCode: safe.account, bankCode: bank.account,
      safeBal: Cash.balance(safe.id), bankBal: Cash.balance(bank.id),
      fee: Ledger.balance('5206'),
      balanced: je.lines.reduce((t,l)=>t+l.debit,0)===je.lines.reduce((t,l)=>t+l.credit,0),
      tb: Ledger.trialBalance().balanced, bs: Reports.balanceSheet().balanced,
    };
  });
  expect(r.safeCode).toMatch(/^1101\d\d$/);     // حساب فرعي تحت الصندوق
  expect(r.bankCode).toMatch(/^1102\d\d$/);
  expect(r.safeBal).toBe(1000000 - 301500);     // 3,000 + 15 رسوم
  expect(r.bankBal).toBe(300000);
  expect(r.fee).toBe(1500);
  expect(r.balanced).toBe(true);
  expect(r.tb).toBe(true);
  expect(r.bs).toBe(true);
});

test('الجهات: كشف حساب المورد ورصيده من الدفتر', async ({ page }) => {
  const r = await acc(page, () => {
    const { Parties, Events } = LumaAcc;
    const s = Parties.add({kind:'supplier', name:'كلر لاين', phone:'0551112222'});
    const party = {kind:'supplier', id:s.id, name:s.name};
    Events.post('purchase',{source:'purchase',sourceId:'PP-1',date:'2026-02-10',
      toInventory:true,net:4000,vat:600,paid:false,party,desc:'صبغات'});
    Events.post('supplier_payment',{source:'payment',sourceId:'SP-9',date:'2026-02-20',
      method:'تحويل بنكي',amount:2000,party,desc:'دفعة'});
    const st = Parties.statement(s.id);
    return { id:s.id, balance: Parties.balance(s.id), rows: st.rows.length, closing: st.closing };
  });
  expect(r.id).toMatch(/^S-\d+$/);
  expect(r.rows).toBe(2);
  expect(r.balance).toBe(260000);               // 4,600 − 2,000
  expect(r.closing).toBe(260000);
});

test('التسوية البنكية: مطابقة ورسوم ولا إقفال مع فرق', async ({ page }) => {
  const r = await acc(page, () => {
    const { Cash, Recon, Ledger } = LumaAcc;
    const bank = Cash.add({kind:'bank', name:'الأهلي'});
    LumaAcc.Opening.post('2026-03-01',[{account:bank.account,debit:10000}]);
    Cash.transfer(bank.id, Cash.add({kind:'cash',name:'صندوق'}).id, 1000, {date:'2026-03-05'});
    // كشف البنك يُظهر الرصيد الافتتاحي فقط (التحويل لم يصل بعد)
    const rc = Recon.open(bank.id, '2026-03-31', 10000);
    const st0 = Recon.status(rc.id);
    let closeErr='';
    try { Recon.close(rc.id,'محاولة'); } catch(e){ closeErr = e.message; }
    // طابقي الحركة الافتتاحية فقط
    Recon.toggle(rc.id, st0.pending.find(x=>x.amount>0).key);
    const st1 = Recon.status(rc.id);
    const closed = Recon.close(rc.id, 'تسوية مارس');
    return { pending0: st0.pending.length, closeErr,
             matched: st1.matched.length, diff: st1.difference, clean: st1.clean,
             status: closed.status, tb: Ledger.trialBalance().balanced };
  });
  expect(r.pending0).toBe(2);                   // الافتتاحي + التحويل
  expect(r.closeErr).toContain('فرق');
  expect(r.matched).toBe(1);
  expect(r.diff).toBe(0);
  expect(r.clean).toBe(true);
  expect(r.status).toBe('closed');
  expect(r.tb).toBe(true);
});

test('الأصول الثابتة: اقتناء وإهلاك شهري لا يتكرر واستبعاد بربح', async ({ page }) => {
  const r = await acc(page, () => {
    const { Assets, Ledger, Reports } = LumaAcc;
    const a = Assets.add({name:'كراسي تصفيف', cost:12000, life:5, acquiredAt:'2026-01-01'});
    const afterBuy = { asset: Ledger.balance('1201'), monthly: Assets.monthly(a.id) };
    const d1 = Assets.runDepreciation('2026-02-28');
    const d2 = Assets.runDepreciation('2026-02-28');   // نفس الشهر — لا يتكرر
    const afterDep = { accum: Ledger.balance('1202'), exp: Ledger.balance('5290'), nbv: Assets.nbv(a.id) };
    const disp = Assets.dispose(a.id, {proceeds:12000, date:'2026-03-01', reason:'بيع'});
    return { afterBuy, sameEntry: d1.id===d2.id, afterDep,
             assetAfter: Ledger.balance('1201'), accumAfter: Ledger.balance('1202'),
             status: Assets.get(a.id).status,
             dispBalanced: disp.lines.reduce((t,l)=>t+l.debit,0)===disp.lines.reduce((t,l)=>t+l.credit,0),
             tb: Ledger.trialBalance().balanced, integ: Reports.integrity().ok };
  });
  expect(r.afterBuy.asset).toBe(1200000);
  expect(r.afterBuy.monthly).toBe(20000);       // 12,000 ÷ 60 شهراً = 200 ر.س
  expect(r.sameEntry).toBe(true);               // إهلاك الشهر مرة واحدة
  expect(r.afterDep.accum).toBe(20000);
  expect(r.afterDep.exp).toBe(20000);
  expect(r.afterDep.nbv).toBe(1180000);
  expect(r.assetAfter).toBe(0);                 // خرج الأصل من الدفاتر
  expect(r.accumAfter).toBe(0);                 // وأُقفل مجمع إهلاكه
  expect(r.status).toBe('disposed');
  expect(r.dispBalanced).toBe(true);
  expect(r.tb).toBe(true);
  expect(r.integ).toBe(true);
});

test('القيود الدورية: قالب متوازن، ترحيل مرة واحدة لكل فترة', async ({ page }) => {
  const r = await acc(page, () => {
    const { Recurring, Ledger, Reports } = LumaAcc;
    let bad='';
    try { Recurring.add({name:'غير متوازن', lines:[{account:'5203',debit:100},{account:'2140',credit:90}]}); }
    catch(e){ bad = e.message; }
    const rc = Recurring.add({name:'استحقاق إيجار', kind:'accrual', freq:'monthly',
      lines:[{account:'5203',debit:2000},{account:'2140',credit:2000}]});
    const a = Recurring.run(rc.id,'2026-05-31');
    const b = Recurring.run(rc.id,'2026-05-31');   // نفس الشهر
    const c = Recurring.run(rc.id,'2026-06-30');   // شهر تالٍ
    return { bad, same: a.id===b.id, different: a.id!==c.id,
             rent: Ledger.balance('5203'), accrued: Ledger.balance('2140'),
             tb: Ledger.trialBalance().balanced, integ: Reports.integrity().ok };
  });
  expect(r.bad).toContain('غير متوازن');
  expect(r.same).toBe(true);
  expect(r.different).toBe(true);
  expect(r.rent).toBe(400000);                  // شهران × 2,000
  expect(r.accrued).toBe(400000);
  expect(r.tb).toBe(true);
  expect(r.integ).toBe(true);
});

test('الصلاحيات: مفروضة عند حدود النطاق لا في الواجهة فقط', async ({ page }) => {
  const r = await acc(page, () => {
    const { Perm, Journal, Periods, COA } = LumaAcc;
    const out = { asOwner: Perm.can('acc.period.reopen') };
    // مراجعة: عرض فقط
    Perm.setRole('viewer');
    out.viewerPerms = Perm.list().length;
    try { Journal.create({desc:'محاولة', lines:[{account:'110101',debit:10},{account:'4101',credit:10}]}); out.create='لم يُمنع'; }
    catch(e){ out.create = e.message; }
    try { COA.add({code:'9999',name:'حساب',type:'asset'}); out.coa='لم يُمنع'; }
    catch(e){ out.coa = e.message; }
    // مُدخِلة قيود: تنشئ ولا تُرحّل
    Perm.setRole('bookkeeper');
    const je = Journal.create({desc:'مسودة', lines:[{account:'110101',debit:10},{account:'4101',credit:10}]});
    out.draftStatus = je.status;
    try { Journal.post(je.id); out.post='لم يُمنع'; }
    catch(e){ out.post = e.message; }
    // محاسِبة: تُرحّل ولا تُعيد فتح فترة مقفلة
    Perm.setRole('accountant');
    out.postedStatus = Journal.post(je.id).status;
    const p = Periods.open('2026-09-01','2026-09-30','سبتمبر');
    Periods.close(p.id,'إقفال');
    try { Periods.reopen(p.id,'سبب'); out.reopen='لم يُمنع'; }
    catch(e){ out.reopen = e.message; }
    Perm.setRole('owner');
    out.ownerReopen = Periods.reopen(p.id,'تصحيح').status;
    return out;
  });
  expect(r.asOwner).toBe(true);
  expect(r.viewerPerms).toBe(3);
  expect(r.create).toContain('لا تملكين صلاحية');
  expect(r.coa).toContain('لا تملكين صلاحية');
  expect(r.draftStatus).toBe('draft');
  expect(r.post).toContain('لا تملكين صلاحية');
  expect(r.postedStatus).toBe('posted');
  expect(r.reopen).toContain('لا تملكين صلاحية');   // المحاسِبة لا تعيد الفتح
  expect(r.ownerReopen).toBe('open');               // المالكة تستطيع
});

test('محاولة بلا صلاحية تُسجَّل في سجل التدقيق', async ({ page }) => {
  const r = await acc(page, () => {
    const { Perm, Journal, Audit } = LumaAcc;
    Perm.setRole('viewer');
    try { Journal.create({desc:'x', lines:[{account:'110101',debit:1},{account:'4101',credit:1}]}); } catch(e){}
    Perm.setRole('owner');
    const denied = Audit.all({entity:'permission'});
    return { count: denied.length, action: denied[0] && denied[0].action, role: denied[0] && denied[0].after.role };
  });
  expect(r.count).toBeGreaterThan(0);
  expect(r.action).toBe('denied');
  expect(r.role).toBe('viewer');
});
