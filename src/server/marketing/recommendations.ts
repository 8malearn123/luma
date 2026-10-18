import type { Snapshot } from './snapshot';

/**
 * Rule-based recommendations (no AI required). Every recommendation carries the
 * full schema of spec §28. Numbers come only from the snapshot index; when data
 * is missing we say "unknown" and lower confidence rather than guess.
 */
export type Loc = { ar: string; en: string };
export type Category =
  | 'quiet_periods' | 'reactivation' | 'seasonal' | 'service_promotion' | 'packages' | 'cross_sell' | 'loyalty'
  | 'content' | 'pricing_review' | 'booking_experience' | 'campaign_review' | 'capacity';

export interface RecommendationContent {
  title: Loc;
  category: Category;
  horizon: 'weekly' | 'monthly' | 'ongoing';
  period: { from: string; to: string };
  evidence_refs: { type: 'metric'; key: string }[];
  measured_metrics: Record<string, number>;
  opportunity: Loc;
  suggested_action: Loc;
  target_segment_id: string | null;
  target_segment_hint: Loc | null;
  timing: Loc;
  estimated_cost: { amountMinor: number | null; assumptions: Loc };
  capacity_check: { status: 'ok' | 'insufficient' | 'unknown'; freeMinutes: number | null; note: Loc };
  margin_check: { status: 'ok' | 'negative' | 'unknown'; note: Loc };
  draft_content: { channel: string; text: Loc } | null;
  channel: string | null;
  prerequisites: Loc[];
  success_metric: Loc;
  experiment_design: Loc;
  confidence: 'low' | 'medium' | 'high';
  limitations: Loc[];
  proposed_target: Loc | null;
  forecast: null; // never forecast: a target is a goal, not a promise
  data_as_of: string;
  review_at: string;
  expires_at: string;
  provenance: { source_type: 'rules' | 'ai' | 'example'; provider: string | null; model: string | null; prompt_version: string | null; snapshot_hash: string };
}

export interface GenerationResult {
  insufficientData: boolean;
  limitations: Loc[];
  recommendations: RecommendationContent[];
}

const WEEKDAYS: Loc[] = [
  { ar: 'الأحد', en: 'Sunday' }, { ar: 'الاثنين', en: 'Monday' }, { ar: 'الثلاثاء', en: 'Tuesday' }, { ar: 'الأربعاء', en: 'Wednesday' },
  { ar: 'الخميس', en: 'Thursday' }, { ar: 'الجمعة', en: 'Friday' }, { ar: 'السبت', en: 'Saturday' },
];
const pct = (x: number) => Math.round(x * 100);
const sar = (minor: number) => Math.round(minor / 100);

export const MIN_VISITS_FOR_ANALYSIS = 20;

export function generateRuleRecommendations(s: Snapshot, horizon: 'weekly' | 'monthly' = 'monthly', planPeriod?: { from: string; to: string }): GenerationResult {
  const now = new Date(s.dataAsOf);
  const review = new Date(+now + (horizon === 'weekly' ? 7 : 30) * 86400000).toISOString();
  const expires = new Date(+now + (horizon === 'weekly' ? 14 : 45) * 86400000).toISOString();
  const base = {
    horizon,
    period: planPeriod ?? { from: s.period.from, to: s.period.to },
    data_as_of: s.dataAsOf,
    review_at: review,
    expires_at: expires,
    forecast: null,
    target_segment_id: null,
    provenance: { source_type: 'rules' as const, provider: null, model: null, prompt_version: null, snapshot_hash: s.hash },
  };
  const limitations: Loc[] = [];
  const insufficient = s.history.completedVisits90d < MIN_VISITS_FOR_ANALYSIS;
  if (insufficient) {
    limitations.push({
      ar: `البيانات محدودة: ${s.history.completedVisits90d} زيارة مكتملة خلال 90 يوماً (الحد الأدنى للتحليل ${MIN_VISITS_FOR_ANALYSIS}). التوصيات تجريبية ولا تتضمن توقعات.`,
      en: `Limited data: ${s.history.completedVisits90d} completed visits in 90 days (analysis minimum ${MIN_VISITS_FOR_ANALYSIS}). Suggestions are experimental and contain no forecasts.`,
    });
  }
  if (!s.costs.complete) {
    limitations.push({
      ar: `التكاليف غير مكتملة (${s.costs.servicesWithCost} من ${s.costs.servicesTotal} خدمة). لا يمكن تأكيد ربحية أي خصم أو باقة.`,
      en: `Costs incomplete (${s.costs.servicesWithCost} of ${s.costs.servicesTotal} services). No discount or package can be asserted profitable.`,
    });
  }
  const recs: RecommendationContent[] = [];
  const unknownMargin = { status: 'unknown' as const, note: { ar: 'التكاليف غير متوفرة — لا يمكن تأكيد الربحية.', en: 'Costs unavailable — profitability cannot be asserted.' } };

  // 1) quiet periods: fill free capacity on low-occupancy weekdays (never promote full times)
  if (s.occupancy && s.occupancy.availableMin > 0) {
    const quiet = s.occupancy.byWeekday.filter((w) => w.occupancy !== null && w.occupancy < 0.4 && w.freeMin >= 120).sort((a, b) => (a.occupancy ?? 0) - (b.occupancy ?? 0)).slice(0, 2);
    for (const w of quiet) {
      const day = WEEKDAYS[w.weekday];
      recs.push({
        ...base,
        title: { ar: `ملء الأوقات الهادئة يوم ${day.ar}`, en: `Fill quiet time on ${day.en}` },
        category: 'quiet_periods',
        evidence_refs: [{ type: 'metric', key: `occupancy.weekday_${w.weekday}` }, { type: 'metric', key: `occupancy.weekday_${w.weekday}_free_min` }],
        measured_metrics: { [`occupancy.weekday_${w.weekday}`]: w.occupancy!, [`occupancy.weekday_${w.weekday}_free_min`]: w.freeMin },
        opportunity: { ar: `الإشغال يوم ${day.ar} ${pct(w.occupancy!)}% مع ${w.freeMin} دقيقة متاحة في الفترة.`, en: `${day.en} occupancy is ${pct(w.occupancy!)}% with ${w.freeMin} free minutes in the period.` },
        suggested_action: { ar: `روّجي لمواعيد ${day.ar} المتاحة فقط (رسالة لعميلات موافقات على التسويق أو منشور)، مع ميزة غير سعرية مثل إضافة صغيرة.`, en: `Promote only the open ${day.en} slots (message to consenting customers or a post), with a non-price perk such as a small add-on.` },
        target_segment_hint: { ar: 'عميلات زرن خلال 90 يوماً ووافقن على التسويق', en: 'Customers who visited in the last 90 days and consented to marketing' },
        timing: { ar: `قبل ${day.ar} بيومين إلى ثلاثة أيام`, en: `2–3 days before ${day.en}` },
        estimated_cost: { amountMinor: null, assumptions: { ar: 'تكلفة القناة غير معروفة؛ الرسائل لم تُربط بمزود بعد.', en: 'Channel cost unknown; no messaging provider connected yet.' } },
        capacity_check: { status: 'ok', freeMinutes: w.freeMin, note: { ar: 'السعة الحرة مقاسة من الجداول والحجوزات المؤكدة.', en: 'Free capacity measured from schedules and confirmed bookings.' } },
        margin_check: unknownMargin,
        draft_content: { channel: 'whatsapp', text: { ar: `لدينا مواعيد متاحة يوم ${day.ar} — احجزي وقتكِ المفضل.`, en: `We have openings on ${day.en} — book your preferred time.` } },
        channel: 'whatsapp',
        prerequisites: [{ ar: 'موافقة العميلات على قناة الرسائل', en: 'Customer consent for the channel' }],
        success_metric: { ar: `ارتفاع إشغال ${day.ar} مقارنة بخط الأساس ${pct(w.occupancy!)}%`, en: `${day.en} occupancy above the ${pct(w.occupancy!)}% baseline` },
        experiment_design: { ar: 'إرسال لنصف الشريحة واحتجاز النصف الآخر كمجموعة مقارنة إن سمح الحجم.', en: 'Send to half the segment, hold out the other half as a control if the sample allows.' },
        confidence: insufficient ? 'low' : 'medium',
        limitations: insufficient ? limitations.slice(0, 1) : [],
        proposed_target: { ar: `هدف مقترح (ليس وعداً): +10 نقاط إشغال ليوم ${day.ar}`, en: `Proposed goal (not a promise): +10 occupancy points on ${day.en}` },
      });
    }
  }

  // 2) reactivation by service-specific cadence
  for (const svc of s.services.filter((x) => x.cadenceDays && x.overdueConsenting >= 3).slice(0, 2)) {
    recs.push({
      ...base,
      title: { ar: `إعادة تنشيط عميلات ${svc.name}`, en: `Reactivate ${svc.name} customers` },
      category: 'reactivation',
      evidence_refs: [{ type: 'metric', key: `${svc.key}.cadence_days` }, { type: 'metric', key: `${svc.key}.overdue_consenting` }],
      measured_metrics: { [`${svc.key}.cadence_days`]: svc.cadenceDays!, [`${svc.key}.overdue_consenting`]: svc.overdueConsenting },
      opportunity: { ar: `الفاصل المعتاد بين زيارات ${svc.name} ${svc.cadenceDays} يوماً، و${svc.overdueConsenting} عميلات موافقات تجاوزن 1.5 ضعف هذا الفاصل.`, en: `Typical ${svc.name} cadence is ${svc.cadenceDays} days; ${svc.overdueConsenting} consenting customers are past 1.5× that interval.` },
      suggested_action: { ar: 'رسالة تذكير شخصية بالخدمة نفسها بدون خصم دائم، مع رابط حجز مباشر.', en: 'A personal reminder for the same service, no permanent discount, with a direct booking link.' },
      target_segment_hint: { ar: `عميلات ${svc.name} المتأخرات عن موعدهن المعتاد`, en: `${svc.name} customers overdue vs their usual cadence` },
      timing: { ar: 'خلال الأسبوع القادم في ساعات التواصل المسموحة', en: 'Next week, within allowed contact hours' },
      estimated_cost: { amountMinor: null, assumptions: { ar: 'تكلفة الرسائل غير معروفة.', en: 'Message cost unknown.' } },
      capacity_check: { status: s.occupancy && s.occupancy.total !== null && s.occupancy.total < 0.85 ? 'ok' : 'unknown', freeMinutes: s.occupancy ? s.occupancy.availableMin - s.occupancy.bookedMin : null, note: { ar: 'تحققي من توفر المختصات قبل الإرسال.', en: 'Check specialist availability before sending.' } },
      margin_check: svc.materialCostMinor == null ? unknownMargin : { status: svc.priceMinor > svc.materialCostMinor ? 'ok' : 'negative', note: { ar: 'بدون خصم؛ الهامش هو هامش الخدمة الحالي.', en: 'No discount; margin equals the current service margin.' } },
      draft_content: { channel: 'whatsapp', text: { ar: `اشتقنا لكِ! حان وقت ${svc.name} — مواعيدنا متاحة هذا الأسبوع.`, en: `We miss you! It's time for your ${svc.name} — we have openings this week.` } },
      channel: 'whatsapp',
      prerequisites: [{ ar: 'موافقة تسويقية سارية', en: 'Valid marketing consent' }],
      success_metric: { ar: 'نسبة من حجزن خلال 14 يوماً من الإرسال (مكتملة، بعد خصم الإلغاء والاسترداد)', en: 'Share booking within 14 days (completed, net of cancellations/refunds)' },
      experiment_design: { ar: 'مجموعة احتجاز 20% عند توفر 50 عميلة على الأقل؛ وإلا تُعرض النتيجة كوصف فقط.', en: '20% holdout when ≥50 customers; otherwise results are descriptive only.' },
      confidence: svc.overdueConsenting >= 20 ? 'medium' : 'low',
      limitations: [{ ar: 'الإيراد المنسوب ليس بالضرورة إيراداً إضافياً.', en: 'Attributed revenue is not necessarily incremental.' }],
      proposed_target: null,
    });
  }

  // 3) well-rated services with weak demand and available capacity
  const confirmedList = s.services.map((x) => x.demand.confirmed);
  const medConfirmed = confirmedList.length ? [...confirmedList].sort((a, b) => a - b)[Math.floor(confirmedList.length / 2)] : 0;
  for (const svc of s.services.filter((x) => (x.rating ?? 0) >= 4.3 && x.reviewCount >= 5 && x.demand.confirmed < medConfirmed && (s.occupancy?.total ?? 1) < 0.7).slice(0, 2)) {
    recs.push({
      ...base,
      title: { ar: `إبراز ${svc.name}`, en: `Feature ${svc.name}` },
      category: 'service_promotion',
      evidence_refs: [{ type: 'metric', key: `${svc.key}.rating` }, { type: 'metric', key: `${svc.key}.review_count` }, { type: 'metric', key: `${svc.key}.confirmed` }, { type: 'metric', key: 'occupancy.total' }],
      measured_metrics: { [`${svc.key}.rating`]: svc.rating!, [`${svc.key}.review_count`]: svc.reviewCount, [`${svc.key}.confirmed`]: svc.demand.confirmed, 'occupancy.total': s.occupancy!.total! },
      opportunity: { ar: `تقييم ${svc.name} ${svc.rating} من ${svc.reviewCount} تقييمات، لكن حجوزاتها ${svc.demand.confirmed} أقل من متوسط الخدمات، والإشغال الكلي ${pct(s.occupancy!.total!)}%.`, en: `${svc.name} is rated ${svc.rating} from ${svc.reviewCount} reviews, yet has ${svc.demand.confirmed} bookings, below the median; overall occupancy is ${pct(s.occupancy!.total!)}%.` },
      suggested_action: { ar: 'قدّميها أعلى صفحة الخدمات مع صور أعمال حقيقية ووصف أوضح.', en: 'Feature it at the top of the services page with real work photos and a clearer description.' },
      target_segment_hint: null,
      timing: { ar: 'هذا الشهر', en: 'This month' },
      estimated_cost: { amountMinor: 0, assumptions: { ar: 'تعديل محتوى المتجر فقط.', en: 'Storefront content change only.' } },
      capacity_check: { status: 'ok', freeMinutes: s.occupancy!.availableMin - s.occupancy!.bookedMin, note: { ar: 'السعة الحالية تسمح بحجوزات إضافية.', en: 'Current capacity allows more bookings.' } },
      margin_check: svc.materialCostMinor == null ? unknownMargin : { status: 'ok', note: { ar: 'بدون تغيير سعر.', en: 'No price change.' } },
      draft_content: null,
      channel: 'storefront',
      prerequisites: [{ ar: 'صور أعمال حقيقية', en: 'Real portfolio photos' }],
      success_metric: { ar: 'زيادة مشاهدات وحجوزات الخدمة مقارنة بالفترة السابقة', en: 'More views and bookings of the service vs the previous period' },
      experiment_design: { ar: 'مقارنة قبل/بعد وصفية فقط (لا تثبت السببية).', en: 'Descriptive before/after only (does not prove causality).' },
      confidence: 'medium',
      limitations: [],
      proposed_target: null,
    });
  }

  // 4) demand exceeds capacity → pricing review (never automatic)
  for (const svc of s.services.filter((x) => x.demand.availabilityMisses + x.demand.waitlist >= 5 && (s.occupancy?.total ?? 0) >= 0.85).slice(0, 1)) {
    recs.push({
      ...base,
      horizon: 'ongoing',
      title: { ar: `مراجعة سعر ${svc.name} أو السعة`, en: `Review price or capacity for ${svc.name}` },
      category: 'pricing_review',
      evidence_refs: [{ type: 'metric', key: `${svc.key}.availabilityMisses` }, { type: 'metric', key: `${svc.key}.waitlist` }, { type: 'metric', key: 'occupancy.total' }],
      measured_metrics: { [`${svc.key}.availabilityMisses`]: svc.demand.availabilityMisses, [`${svc.key}.waitlist`]: svc.demand.waitlist, 'occupancy.total': s.occupancy!.total! },
      opportunity: { ar: `طلب غير مُلبّى: ${svc.demand.availabilityMisses} بحث بدون موعد و${svc.demand.waitlist} في قائمة الانتظار، مع إشغال ${pct(s.occupancy!.total!)}%.`, en: `Unmet demand: ${svc.demand.availabilityMisses} searches without a slot and ${svc.demand.waitlist} waitlist entries at ${pct(s.occupancy!.total!)}% occupancy.` },
      suggested_action: { ar: 'ادرسي تعديل الورديات أو تدريب مختصة إضافية قبل أي تغيير سعر؛ أي تغيير سعر يمر بالموافقة ولا يمس الحجوزات المؤكدة.', en: 'Consider shift changes or cross-training before any price change; any price change goes through approval and never touches confirmed bookings.' },
      target_segment_hint: null,
      timing: { ar: 'مراجعة مستمرة', en: 'Ongoing review' },
      estimated_cost: { amountMinor: null, assumptions: { ar: 'يعتمد على قرار الورديات.', en: 'Depends on staffing decision.' } },
      capacity_check: { status: 'insufficient', freeMinutes: s.occupancy!.availableMin - s.occupancy!.bookedMin, note: { ar: 'السعة شبه ممتلئة.', en: 'Capacity is nearly full.' } },
      margin_check: svc.materialCostMinor == null ? unknownMargin : { status: 'ok', note: { ar: 'الهامش الحالي معروف.', en: 'Current margin known.' } },
      draft_content: null,
      channel: null,
      prerequisites: [],
      success_metric: { ar: 'انخفاض الطلب غير الملبى', en: 'Less unmet demand' },
      experiment_design: { ar: 'لا يُوصى بتجربة سعرية آلية.', en: 'No automated price experiment is recommended.' },
      confidence: 'medium',
      limitations: [],
      proposed_target: null,
    });
  }

  // 5) cross-sell/packages only when margins are known for both services
  const costed = s.services.filter((x) => x.materialCostMinor != null && x.demand.completed >= 5);
  if (costed.length >= 2) {
    const [a, b] = costed.sort((x, y) => y.demand.completed - x.demand.completed);
    const marginA = a.priceMinor - (a.materialCostMinor ?? 0);
    const marginB = b.priceMinor - (b.materialCostMinor ?? 0);
    const maxDisc = Math.floor(((a.priceMinor + b.priceMinor) * (s.preferences.maxDiscountBps ?? 0)) / 10000);
    const bundleMargin = marginA + marginB - maxDisc;
    recs.push({
      ...base,
      title: { ar: `باقة ${a.name} + ${b.name}`, en: `${a.name} + ${b.name} package` },
      category: 'packages',
      evidence_refs: [{ type: 'metric', key: `${a.key}.price_minor` }, { type: 'metric', key: `${a.key}.material_cost_minor` }, { type: 'metric', key: `${b.key}.price_minor` }, { type: 'metric', key: `${b.key}.material_cost_minor` }, { type: 'metric', key: 'preferences.max_discount_bps' }],
      measured_metrics: { [`${a.key}.price_minor`]: a.priceMinor, [`${a.key}.material_cost_minor`]: a.materialCostMinor!, [`${b.key}.price_minor`]: b.priceMinor, [`${b.key}.material_cost_minor`]: b.materialCostMinor!, 'preferences.max_discount_bps': s.preferences.maxDiscountBps },
      opportunity: { ar: `خدمتان مطلوبتان بتكاليف مواد معروفة؛ الهامش بعد أقصى خصم مسموح ${sar(bundleMargin)} ر.س (قبل العمولات والأجور).`, en: `Two popular services with known material costs; margin after your max allowed discount is ${sar(bundleMargin)} SAR (before commissions and wages).` },
      suggested_action: { ar: 'باقة اختيارية بخصم لا يتجاوز الحد الذي حددتِه، تُراجع بعد شهر.', en: 'An optional package with a discount within your limit, reviewed after a month.' },
      target_segment_hint: null,
      timing: { ar: 'الشهر القادم', en: 'Next month' },
      estimated_cost: { amountMinor: maxDisc, assumptions: { ar: 'الخصم الأقصى لكل باقة مباعة.', en: 'Maximum discount per package sold.' } },
      capacity_check: { status: s.occupancy && (s.occupancy.total ?? 1) < 0.85 ? 'ok' : 'unknown', freeMinutes: s.occupancy ? s.occupancy.availableMin - s.occupancy.bookedMin : null, note: { ar: 'تحتاج الباقة وقتاً متصلاً.', en: 'A package needs a continuous time block.' } },
      margin_check: { status: bundleMargin > 0 ? 'ok' : 'negative', note: { ar: 'تكاليف المواد فقط؛ العمولات والأجور غير مشمولة.', en: 'Material costs only; commissions and wages not included.' } },
      draft_content: null,
      channel: 'storefront',
      prerequisites: [{ ar: 'إنشاء الباقة في الكتالوج', en: 'Create the package in the catalog' }],
      success_metric: { ar: 'عدد الباقات المكتملة وصافي الهامش', en: 'Completed packages and net margin' },
      experiment_design: { ar: 'تجربة لمدة شهر ثم مراجعة.', en: 'One-month trial then review.' },
      confidence: 'low',
      limitations: [{ ar: 'هامش المواد ليس الربح الكامل.', en: 'Material margin is not full profit.' }],
      proposed_target: null,
    });
  } else if (!s.costs.complete && s.services.length > 0) {
    recs.push({
      ...base,
      horizon: 'ongoing',
      title: { ar: 'أكملي تكاليف الخدمات قبل الخصومات والباقات', en: 'Complete service costs before discounts or packages' },
      category: 'pricing_review',
      evidence_refs: [],
      measured_metrics: {},
      opportunity: { ar: 'بدون التكاليف لا يمكن الحكم على ربحية أي عرض.', en: 'Without costs no offer can be judged profitable.' },
      suggested_action: { ar: 'أدخلي تكلفة المواد لكل خدمة (وصفة المواد في المخزون).', en: 'Enter material cost per service (inventory recipes).' },
      target_segment_hint: null,
      timing: { ar: 'قبل أي حملة خصم', en: 'Before any discount campaign' },
      estimated_cost: { amountMinor: 0, assumptions: { ar: 'إدخال بيانات فقط.', en: 'Data entry only.' } },
      capacity_check: { status: 'unknown', freeMinutes: null, note: { ar: 'غير منطبق.', en: 'Not applicable.' } },
      margin_check: unknownMargin,
      draft_content: null,
      channel: null,
      prerequisites: [],
      success_metric: { ar: 'اكتمال التكاليف لكل الخدمات', en: 'Costs complete for all services' },
      experiment_design: { ar: 'غير منطبق.', en: 'Not applicable.' },
      confidence: 'high',
      limitations: [],
      proposed_target: null,
    });
  }

  // 6) loyalty instead of perpetual discounts
  if (!s.loyaltyEnabled && s.customers.active90d >= 30) {
    recs.push({
      ...base,
      horizon: 'ongoing',
      title: { ar: 'برنامج ولاء بدلاً من الخصومات الدائمة', en: 'A loyalty program instead of permanent discounts' },
      category: 'loyalty',
      evidence_refs: [{ type: 'metric', key: 'customers.active_90d' }],
      measured_metrics: { 'customers.active_90d': s.customers.active90d },
      opportunity: { ar: `${s.customers.active90d} عميلة نشطة خلال 90 يوماً ولا يوجد برنامج ولاء مفعّل.`, en: `${s.customers.active90d} active customers in 90 days and no loyalty program enabled.` },
      suggested_action: { ar: 'فعّلي نقاط الولاء بمكافآت خدمية بدلاً من خصومات عامة.', en: 'Enable loyalty points with service rewards instead of blanket discounts.' },
      target_segment_hint: null,
      timing: { ar: 'هذا الشهر', en: 'This month' },
      estimated_cost: { amountMinor: null, assumptions: { ar: 'تكلفة المكافآت تعتمد على قواعدكِ.', en: 'Reward cost depends on your rules.' } },
      capacity_check: { status: 'unknown', freeMinutes: null, note: { ar: 'غير منطبق.', en: 'Not applicable.' } },
      margin_check: s.costs.complete ? { status: 'ok', note: { ar: 'راجعي تكلفة المكافأة مقابل الهامش.', en: 'Check reward cost vs margin.' } } : unknownMargin,
      draft_content: null,
      channel: null,
      prerequisites: [],
      success_metric: { ar: 'نسبة العودة خلال 60 يوماً', en: 'Return rate within 60 days' },
      experiment_design: { ar: 'مقارنة نسبة العودة قبل وبعد (وصفية).', en: 'Descriptive before/after return-rate comparison.' },
      confidence: 'low',
      limitations: [],
      proposed_target: null,
    });
  }

  // 7) booking experience: many starts, few confirmations
  const starts = s.services.reduce((n, x) => n + x.demand.starts, 0);
  const confirmed = s.services.reduce((n, x) => n + x.demand.confirmed, 0);
  if (starts >= 20 && confirmed / starts < 0.3) {
    recs.push({
      ...base,
      title: { ar: 'مراجعة تجربة الحجز', en: 'Review the booking experience' },
      category: 'booking_experience',
      evidence_refs: s.services.map((x) => ({ type: 'metric' as const, key: `${x.key}.starts` })).slice(0, 5),
      measured_metrics: Object.fromEntries(s.services.slice(0, 5).map((x) => [`${x.key}.starts`, x.demand.starts])),
      opportunity: { ar: `${starts} بداية حجز مقابل ${confirmed} حجزاً مؤكداً في الفترة.`, en: `${starts} booking starts vs ${confirmed} confirmed bookings in the period.` },
      suggested_action: { ar: 'تحققي من وضوح الأسعار والسياسات وتوفر المواعيد القريبة وخيارات الدفع.', en: 'Check clarity of prices and policies, near-term availability and payment options.' },
      target_segment_hint: null,
      timing: { ar: 'هذا الأسبوع', en: 'This week' },
      estimated_cost: { amountMinor: 0, assumptions: { ar: 'مراجعة داخلية.', en: 'Internal review.' } },
      capacity_check: { status: 'unknown', freeMinutes: null, note: { ar: 'غير منطبق.', en: 'Not applicable.' } },
      margin_check: { status: 'unknown', note: { ar: 'غير منطبق.', en: 'Not applicable.' } },
      draft_content: null,
      channel: 'storefront',
      prerequisites: [],
      success_metric: { ar: 'نسبة الحجوزات المؤكدة إلى البدايات', en: 'Confirmed bookings per booking start' },
      experiment_design: { ar: 'مراقبة النسبة أسبوعياً.', en: 'Track the ratio weekly.' },
      confidence: 'medium',
      limitations: [],
      proposed_target: null,
    });
  }

  return { insufficientData: insufficient, limitations, recommendations: recs };
}
