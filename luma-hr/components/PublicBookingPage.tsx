'use client';
/**
 * PublicBookingPage — the mobile-first page a client lands on at
 * luma.beauty/<slug>. Four-step wizard:
 *   1. Service catalog (categorized, price + duration)
 *   2. Specialist — with the HR leave constraint: a staff member on
 *      approved leave for the chosen date cannot be booked; the page
 *      offers a same-specialty colleague or another date instead.
 *   3. Date strip (next 3 days) + hourly slots from her schedule
 *   4. Summary ticket → animated success + WhatsApp mock notification
 * Single file, Tailwind only, Lucide icons, RTL.
 */
import { useMemo, useState } from 'react';
import { Scissors, Sparkles, Hand, Droplets, ChevronRight, CalendarDays, Check, MessageCircle } from 'lucide-react';

/* ── Theme presets (picked by the salon's theme_config) ─────── */
const THEMES = {
  'dark-luxury':     { bg: '#09090b', card: '#151517', accent: '#e5c158', text: '#f5f1e8' },
  'rose-velvet':     { bg: '#1a0e12', card: '#241318', accent: '#e08a9b', text: '#f8eef1' },
  'minimal-emerald': { bg: '#0a1413', card: '#12201e', accent: '#8fd0c0', text: '#eef6f4' },
} as const;

/* ── Demo payload (production: from get_public_page(slug)) ───── */
const CATS = [
  { k: 'hair',   ar: 'شعر',   Icon: Scissors },
  { k: 'makeup', ar: 'مكياج', Icon: Sparkles },
  { k: 'nails',  ar: 'أظافر', Icon: Hand },
  { k: 'skin',   ar: 'بشرة',  Icon: Droplets },
] as const;
const SERVICES = [
  { id: 1, cat: 'makeup', name: 'مكياج سهرة', price: 350, dur: 60 },
  { id: 2, cat: 'makeup', name: 'مكياج عروس', price: 850, dur: 120 },
  { id: 3, cat: 'hair',   name: 'صبغة + قص', price: 550, dur: 90 },
  { id: 4, cat: 'hair',   name: 'تسريحة مناسبات', price: 200, dur: 60 },
  { id: 5, cat: 'skin',   name: 'هيدرافيشل', price: 480, dur: 75 },
  { id: 6, cat: 'nails',  name: 'منيكير جل', price: 160, dur: 60 },
];
const STAFF = [
  { id: 'amal', name: 'أمل',  role: 'makeup', roleAr: 'خبيرة مكياج' },
  { id: 'sara', name: 'سارة', role: 'hair',   roleAr: 'خبيرة شعر' },
  { id: 'nora', name: 'نورة', role: 'skin',   roleAr: 'أخصائية بشرة' },
  { id: 'reem', name: 'ريم',  role: 'nails',  roleAr: 'فنانة أظافر' },
];
/** Approved leaves — production reads staff_leaves; the availability RPC
 *  (get_available_booking_slots) already returns 0 rows on leave days,
 *  this mirror lets the UI explain *why* and reroute beautifully. */
const APPROVED_LEAVES = [{ staff: 'sara', from: '2026-07-14', to: '2026-07-16' }];
const onLeave = (staffId: string, iso: string) =>
  APPROVED_LEAVES.some(l => l.staff === staffId && iso >= l.from && iso <= l.to);

const HOURS = ['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00'];

export default function PublicBookingPage({ theme = 'dark-luxury' as keyof typeof THEMES }) {
  const t = THEMES[theme];
  const [step, setStep] = useState(1);
  const [svc, setSvc] = useState<typeof SERVICES[0] | null>(null);
  const [staff, setStaff] = useState<typeof STAFF[0] | null>(null);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [done, setDone] = useState(false);

  /* next 3 days strip */
  const days = useMemo(() => Array.from({ length: 3 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return {
      iso: d.toISOString().slice(0, 10),
      label: i === 0 ? 'اليوم' : d.toLocaleDateString('ar-SA', { weekday: 'long' }),
      day: d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' }),
    };
  }), []);

  const alt = svc && staff ? STAFF.find(s => s.id !== staff.id && s.role === staff.role)
    ?? STAFF.find(s => s.id !== staff.id && !onLeave(s.id, date || days[0].iso)) : null;
  const staffBlocked = !!(staff && date && onLeave(staff.id, date));

  const chip = (on: boolean) => ({
    background: on ? t.accent : t.card,
    color: on ? t.bg : t.text,
    borderColor: on ? t.accent : '#ffffff14',
  });

  /* ── success screen ── */
  if (done) return (
    <div dir="rtl" className="grid min-h-screen place-items-center p-6" style={{ background: t.bg, color: t.text }}>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid size-20 animate-bounce place-items-center rounded-full"
          style={{ background: t.accent, color: t.bg }}><Check size={38} strokeWidth={3} /></div>
        <h1 className="mt-5 text-2xl font-bold">تم تأكيد حجزك 🎉</h1>
        <p className="mt-2 text-sm opacity-70">{svc!.name} · مع {staff!.name} · {date} · {time}</p>
        {/* WhatsApp mock notification */}
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 p-4 text-right"
          style={{ background: t.card }}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><MessageCircle size={18} /></span>
          <div className="text-xs leading-relaxed opacity-90">
            <b>واتساب · صالون لمسة</b><br />
            أهلاً 🌸 حجزك مؤكد يوم {date} الساعة {time}. نراكِ قريباً!
          </div>
        </div>
        <button onClick={() => { setDone(false); setStep(1); setSvc(null); setStaff(null); setTime(''); }}
          className="mt-6 w-full rounded-xl border border-white/15 py-3 text-sm">حجز موعد آخر</button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="mx-auto min-h-screen max-w-md p-4 pb-24" style={{ background: t.bg, color: t.text }}>
      {/* progress */}
      <div className="mb-5 flex items-center gap-1.5">
        {[1, 2, 3, 4].map(i => (
          <span key={i} className="h-1.5 flex-1 rounded-full transition-all"
            style={{ background: i <= step ? t.accent : '#ffffff1a' }} />
        ))}
      </div>

      {/* STEP 1 — services */}
      {step === 1 && <>
        <h1 className="text-xl font-bold">اختاري خدمتك ✨</h1>
        {CATS.map(({ k, ar, Icon }) => {
          const list = SERVICES.filter(s => s.cat === k); if (!list.length) return null;
          return (
            <section key={k} className="mt-5">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color: t.accent }}>
                <Icon size={14} /> {ar}
              </h2>
              <div className="grid gap-2">
                {list.map(s => (
                  <button key={s.id} onClick={() => { setSvc(s); setStep(2); }}
                    className="flex items-center justify-between rounded-2xl border border-white/5 p-4 text-right transition active:scale-[.98]"
                    style={{ background: t.card }}>
                    <span><span className="block text-sm font-semibold">{s.name}</span>
                      <span className="text-[11px] opacity-50">{s.dur} دقيقة</span></span>
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: t.accent }}>
                      {s.price} ر.س <ChevronRight size={15} className="rotate-180 opacity-40" /></span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </>}

      {/* STEP 2 — specialist (with the HR leave reroute) */}
      {step === 2 && svc && <>
        <BackBar onBack={() => setStep(1)} title="اختاري الأخصائية" />
        <div className="grid grid-cols-2 gap-3">
          {STAFF.map(s => {
            const leave = onLeave(s.id, date || days[0].iso);
            const on = staff?.id === s.id;
            return (
              <button key={s.id} onClick={() => { setStaff(s); if (!leave) setStep(3); }}
                className="rounded-2xl border p-4 text-center transition active:scale-[.97]"
                style={{ ...chip(on), opacity: leave ? .55 : 1 }}>
                <span className="mx-auto grid size-12 place-items-center rounded-full border text-lg font-bold"
                  style={{ borderColor: on ? t.bg : t.accent, color: on ? t.bg : t.accent }}>{s.name.charAt(0)}</span>
                <span className="mt-2 block text-sm font-bold">{s.name}</span>
                <span className="block text-[10px] opacity-60">{s.roleAr}</span>
                {leave && <span className="mt-1 block text-[10px] font-bold text-rose-300">في إجازة معتمدة</span>}
              </button>
            );
          })}
        </div>
        {/* the beautiful reroute when the chosen specialist is on leave */}
        {staffBlocked && staff && (
          <div className="mt-4 rounded-2xl border p-4 text-sm" style={{ background: t.card, borderColor: t.accent + '66' }}>
            <p className="leading-relaxed opacity-90">
              💛 {staff.name} في إجازة حالياً — تحبين الحجز مع
              <b style={{ color: t.accent }}> {alt?.name ?? 'زميلة أخرى'}</b> (نفس التخصص) أو اختيار تاريخ آخر؟
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {alt && <button onClick={() => { setStaff(alt); setStep(3); }}
                className="rounded-xl py-2.5 text-xs font-bold" style={{ background: t.accent, color: t.bg }}>
                الحجز مع {alt.name}</button>}
              <button onClick={() => setStep(3)}
                className="rounded-xl border border-white/15 py-2.5 text-xs">اختيار تاريخ آخر</button>
            </div>
          </div>
        )}
      </>}

      {/* STEP 3 — date & time */}
      {step === 3 && staff && <>
        <BackBar onBack={() => setStep(2)} title="التاريخ والوقت" />
        <div className="mb-4 grid grid-cols-3 gap-2">
          {days.map(d => {
            const blocked = onLeave(staff.id, d.iso);
            const on = date === d.iso;
            return (
              <button key={d.iso} disabled={blocked}
                onClick={() => { setDate(d.iso); setTime(''); }}
                className="rounded-2xl border p-3 text-center disabled:opacity-35"
                style={chip(on)}>
                <CalendarDays size={14} className="mx-auto mb-1 opacity-60" />
                <span className="block text-xs font-bold">{d.label}</span>
                <span className="text-[10px] opacity-60">{d.day}</span>
                {blocked && <span className="block text-[9px] text-rose-300">إجازة</span>}
              </button>
            );
          })}
        </div>
        {date && (
          <div className="grid grid-cols-4 gap-2">
            {HOURS.map(h => (
              <button key={h} onClick={() => setTime(h)} dir="ltr"
                className="rounded-xl border py-2.5 text-xs font-semibold" style={chip(time === h)}>{h}</button>
            ))}
          </div>
        )}
        <button disabled={!date || !time} onClick={() => setStep(4)}
          className="mt-6 w-full rounded-xl py-3.5 text-sm font-bold transition disabled:opacity-35"
          style={{ background: t.accent, color: t.bg }}>متابعة</button>
      </>}

      {/* STEP 4 — summary ticket */}
      {step === 4 && svc && staff && <>
        <BackBar onBack={() => setStep(3)} title="تأكيد الموعد" />
        <div className="overflow-hidden rounded-3xl border border-white/10" style={{ background: t.card }}>
          <div className="p-5" style={{ background: t.accent + '1a' }}>
            <p className="text-[11px]" style={{ color: t.accent }}>تذكرة الحجز · صالون لمسة</p>
            <h2 className="mt-1 text-lg font-bold">{svc.name}</h2>
          </div>
          <div className="grid gap-3 p-5 text-sm">
            <Row k="الأخصائية" v={staff.name + ' · ' + staff.roleAr} />
            <Row k="التاريخ" v={date} /><Row k="الوقت" v={time} />
            <Row k="المدة" v={svc.dur + ' دقيقة'} />
            <div className="mt-1 flex justify-between border-t border-dashed border-white/15 pt-3 font-bold">
              <span>الإجمالي</span><span style={{ color: t.accent }}>{svc.price} ر.س</span>
            </div>
          </div>
        </div>
        <button onClick={() => setDone(true)}
          className="mt-5 w-full rounded-xl py-4 text-sm font-bold" style={{ background: t.accent, color: t.bg }}>
          تأكيد الحجز ✓
        </button>
      </>}
    </div>
  );
}

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button onClick={onBack} className="grid size-8 place-items-center rounded-full border border-white/15">
        <ChevronRight size={16} /></button>
      <h1 className="text-lg font-bold">{title}</h1>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="opacity-50">{k}</span><b>{v}</b></div>;
}
