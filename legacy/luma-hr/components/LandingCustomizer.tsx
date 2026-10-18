'use client';
/**
 * LandingCustomizer — "مُنشئ الرابط والصفحة الخاصة بالصالون"
 * Premium RTL dashboard component for Luma salon owners:
 *   1. Link setup    — luma.beauty/<slug> with live sanitization + copy
 *   2. Page identity — name, bio, phone/address, logo & cover URLs
 *   3. Theme picker  — three luxury presets, applied instantly
 *   4. Live preview  — a simulated smartphone rendering the real page
 * Pure Tailwind, single file, no external CSS. Lucide icons.
 */
import { useMemo, useState } from 'react';
import { Link2, Copy, Check, Image as ImageIcon, Palette, Smartphone, Star } from 'lucide-react';

/* ── The three luxury theme presets ─────────────────────────── */
const THEMES = {
  'dark-luxury':    { label: 'Dark Luxury',    ar: 'فخامة داكنة',  bg: '#09090b', card: '#141416', accent: '#e5c158', text: '#f5f1e8' },
  'rose-velvet':    { label: 'Rose Velvet',    ar: 'مخمل وردي',    bg: '#1a0e12', card: '#241318', accent: '#e08a9b', text: '#f8eef1' },
  'minimal-emerald':{ label: 'Minimal Emerald',ar: 'زمرد هادئ',    bg: '#0a1413', card: '#12201e', accent: '#8fd0c0', text: '#eef6f4' },
} as const;
type ThemeKey = keyof typeof THEMES;

/* Demo services shown inside the preview (real data comes from salon_services). */
const PREVIEW_SERVICES = [
  { n: 'مكياج سهرة', p: 350, d: 60 }, { n: 'صبغة + قص', p: 550, d: 90 }, { n: 'هيدرافيشل', p: 480, d: 75 },
];

/* Keep only what the DB trigger would keep — mirrored client-side for live UX. */
const sanitizeSlug = (v: string) =>
  v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-');

export default function LandingCustomizer() {
  const [slug, setSlug] = useState('lama-beauty');
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    title: 'صالون لمسة', bio: 'وجهتكِ الأولى للجمال في جدة — مكياج، شعر، وعناية ملكية بلمسات خبيرات.',
    phone: '0555 123 456', address: 'جدة · حي الشاطئ',
    logo: '', cover: '',
  });
  const [theme, setTheme] = useState<ThemeKey>('dark-luxury');
  const t = THEMES[theme];
  const url = useMemo(() => `luma.beauty/${slug || '…'}`, [slug]);

  const copy = async () => {
    await navigator.clipboard.writeText('https://' + url);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div dir="rtl" className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">مُنشئ الرابط والصفحة الخاصة</h1>
        <p className="mt-1 text-sm text-zinc-500">رابطك المخصص وصفحة حجز فاخرة تعكس هوية صالونك</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ═══════════ SETTINGS COLUMN ═══════════ */}
        <div className="grid gap-5">

          {/* 1 — Link setup */}
          <section className="rounded-2xl border border-zinc-800 bg-[#111113] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#e5c158]">
              <Link2 size={16} /> إعداد الرابط الخاص
            </h2>
            <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-700 bg-black/40 focus-within:border-[#a8862e]" dir="ltr">
              <span className="grid place-items-center bg-zinc-900 px-4 text-sm text-zinc-500">luma.beauty/</span>
              <input value={slug} onChange={e => setSlug(sanitizeSlug(e.target.value))}
                placeholder="lama-beauty"
                className="flex-1 bg-transparent px-3 py-3 text-sm text-[#e5c158] outline-none placeholder:text-zinc-600" />
              <button onClick={copy} aria-label="نسخ الرابط"
                className="flex items-center gap-1.5 border-r border-zinc-800 bg-zinc-900 px-4 text-xs font-bold text-zinc-300 transition hover:text-[#e5c158]">
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? 'نُسخ!' : 'نسخ'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">أحرف إنجليزية وأرقام وشرطات فقط — يُنظَّف تلقائياً أثناء الكتابة.</p>
          </section>

          {/* 2 — Page identity */}
          <section className="rounded-2xl border border-zinc-800 bg-[#111113] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#e5c158]">
              <ImageIcon size={16} /> هوية الصفحة
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">اسم الصالون
                <input value={form.title} onChange={set('title')}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 p-2.5 text-sm text-zinc-100 outline-none focus:border-[#a8862e]" />
              </label>
              <label className="text-xs text-zinc-400">رقم التواصل
                <input value={form.phone} onChange={set('phone')} dir="ltr"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 p-2.5 text-right text-sm outline-none focus:border-[#a8862e]" />
              </label>
            </div>
            <label className="mt-3 block text-xs text-zinc-400">نبذة مختصرة
              <textarea value={form.bio} onChange={set('bio')} rows={2} maxLength={200}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/40 p-2.5 text-sm outline-none focus:border-[#a8862e]" />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(['logo', 'cover'] as const).map(k => (
                <label key={k} className="text-xs text-zinc-400">{k === 'logo' ? 'رابط الشعار' : 'صورة الغلاف الفاخرة'}
                  <input value={form[k]} onChange={set(k)} dir="ltr" placeholder="https://…/image.jpg"
                    className="mt-1 w-full rounded-lg border border-dashed border-zinc-700 bg-black/40 p-2.5 text-right text-xs outline-none focus:border-[#a8862e]" />
                </label>
              ))}
            </div>
          </section>

          {/* 3 — Theme selector */}
          <section className="rounded-2xl border border-zinc-800 bg-[#111113] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#e5c158]">
              <Palette size={16} /> مظهر وتصميم الصفحة
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(THEMES) as ThemeKey[]).map(k => {
                const th = THEMES[k];
                return (
                  <button key={k} onClick={() => setTheme(k)}
                    className={`rounded-xl border p-3 text-right transition
                      ${theme === k ? 'border-[#e5c158] ring-1 ring-[#e5c158]/40' : 'border-zinc-800 hover:border-zinc-600'}`}
                    style={{ background: th.bg }}>
                    <span className="mb-2 flex gap-1.5">
                      <i className="size-4 rounded-full" style={{ background: th.accent }} />
                      <i className="size-4 rounded-full border border-white/10" style={{ background: th.card }} />
                    </span>
                    <span className="block text-xs font-bold" style={{ color: th.text }}>{th.ar}</span>
                    <span className="block text-[10px] text-zinc-500" dir="ltr">{th.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ═══════════ 4 — LIVE DEVICE PREVIEW ═══════════ */}
        <aside className="lg:sticky lg:top-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#e5c158]">
            <Smartphone size={16} /> المعاينة الفورية
          </h2>
          {/* phone frame */}
          <div className="mx-auto w-[300px] rounded-[38px] border-[6px] border-zinc-800 bg-black p-2 shadow-2xl shadow-black">
            <div className="mx-auto mb-1 h-5 w-24 rounded-b-2xl bg-zinc-900" />
            <div className="h-[540px] overflow-y-auto rounded-[26px]" style={{ background: t.bg, color: t.text }}>
              {/* cover */}
              <div className="relative h-32"
                style={{ background: form.cover ? `url(${form.cover}) center/cover` : `linear-gradient(140deg, ${t.accent}33, ${t.bg})` }}>
                <div className="absolute -bottom-7 right-4 grid size-14 place-items-center overflow-hidden rounded-2xl border text-xl font-bold"
                  style={{ borderColor: t.accent, background: t.card, color: t.accent }}>
                  {form.logo ? <img src={form.logo} alt="" className="size-full object-cover" /> : form.title.charAt(0)}
                </div>
              </div>
              {/* identity */}
              <div className="px-4 pb-4 pt-9">
                <h3 className="text-lg font-bold">{form.title || '…'}</h3>
                <p className="mt-1 text-[11px] leading-relaxed opacity-70">{form.bio}</p>
                <p className="mt-1 text-[10px] opacity-50">{form.address} · <bdo dir="ltr">{form.phone}</bdo></p>
                {/* services */}
                <div className="mt-4 grid gap-2">
                  {PREVIEW_SERVICES.map(s => (
                    <div key={s.n} className="flex items-center justify-between rounded-xl border border-white/5 p-3"
                      style={{ background: t.card }}>
                      <div><div className="text-xs font-semibold">{s.n}</div>
                        <div className="text-[10px] opacity-50">{s.d} دقيقة</div></div>
                      <span className="text-sm font-bold" style={{ color: t.accent }}>{s.p} ر.س</span>
                    </div>
                  ))}
                </div>
                <button className="mt-4 w-full rounded-xl py-3 text-sm font-bold"
                  style={{ background: t.accent, color: t.bg }}>
                  احجزي الآن
                </button>
                <p className="mt-3 flex items-center justify-center gap-1 text-[10px] opacity-50">
                  <Star size={10} /> 4.9 · 512 تقييم — <bdo dir="ltr">{url}</bdo>
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
