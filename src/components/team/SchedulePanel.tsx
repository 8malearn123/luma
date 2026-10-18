'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { ErrorAlert, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { tzLabel } from '@/lib/format';
import { tapi, useLoad, WEEKDAYS } from '../catalog/client';
import type { TeamRefs } from './TeamManager';

type Range = { start: string; end: string };
type Day = { ranges: Range[]; breaks: Range[] };
const blank = (): Day[] => Array.from({ length: 7 }, () => ({ ranges: [], breaks: [] }));

/** Weekly hours for the branch (opening hours) or for one specialist, with multiple ranges per day and breaks. */
export function SchedulePanel({ slug, refs, timezone }: { slug: string; refs: TeamRefs; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const staff = useLoad<{ items: { id: string; displayName: string; status: string }[] }>(tapi(slug, '/staff'));
  const [branchId, setBranchId] = useState(refs.branches[0]?.id ?? '');
  const [target, setTarget] = useState<string>(''); // '' = branch hours
  const [days, setDays] = useState<Day[]>(blank());
  const [orig, setOrig] = useState('');
  const [loadErr, setLoadErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const save = useSubmit(tapi(slug, '/schedules'), 'PUT');
  const dirty = JSON.stringify(days) !== orig;
  useUnsavedGuard(dirty);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    const u = new URLSearchParams({ branchId });
    if (target) u.set('staffId', target);
    apiFetch<{ hours: { weekday: number; startTime: string; endTime: string }[]; breaks: { weekday: number; startTime: string; endTime: string }[] }>(tapi(slug, `/schedules?${u}`))
      .then((r) => {
        const d = blank();
        for (const h of r.hours) d[h.weekday].ranges.push({ start: h.startTime, end: h.endTime });
        for (const b of r.breaks) d[b.weekday].breaks.push({ start: b.startTime, end: b.endTime });
        setDays(d);
        setOrig(JSON.stringify(d));
        setLoadErr(null);
      })
      .catch((e) => setLoadErr(e))
      .finally(() => setLoading(false));
  }, [slug, branchId, target]);

  const upd = (wd: number, fn: (d: Day) => Day) => setDays(days.map((d, i) => (i === wd ? fn(d) : d)));
  const copyToAll = (wd: number) => setDays(days.map((d, i) => (i === wd ? d : { ranges: [...days[wd].ranges], breaks: [...days[wd].breaks] })));

  const timeInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input type="time" className="input" style={{ maxWidth: 120 }} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <section aria-label={t('team.tab.schedules')}>
      <div className="toolbar">
        <select className="input" aria-label={t('ops.branch')} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {refs.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input" aria-label={t('team.schedule_for')} value={target} onChange={(e) => (!dirty || window.confirm(t('common.unsaved_changes'))) && setTarget(e.target.value)}>
          <option value="">{t('team.branch_hours')}</option>
          {(staff.data?.items ?? []).filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
        <span className="small muted">{tzLabel(timezone, locale)}</span>
      </div>
      <ErrorAlert error={loadErr ?? save.error} />
      <p className="small muted">{target ? t('team.staff_hours_note') : t('team.branch_hours_note')}</p>
      <div className="stack" aria-busy={loading}>
        {days.map((d, wd) => (
          <div key={wd} className="card" style={{ padding: '12px 14px' }}>
            <div className="row between">
              <strong>{WEEKDAYS[wd][locale === 'ar' ? 0 : 1]}</strong>
              <span className="row" style={{ gap: 4 }}>
                {d.ranges.length === 0 && <span className="badge">{t('team.day_off')}</span>}
                <button type="button" className="btn btn-sm" onClick={() => upd(wd, (x) => ({ ...x, ranges: [...x.ranges, { start: x.ranges.at(-1)?.end ?? '10:00', end: '18:00' }] }))}><Icon name="plus" size={13} /> {t('team.add_range')}</button>
                {target && d.ranges.length > 0 && <button type="button" className="btn btn-sm" onClick={() => upd(wd, (x) => ({ ...x, breaks: [...x.breaks, { start: '13:00', end: '14:00' }] }))}><Icon name="plus" size={13} /> {t('team.add_break')}</button>}
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => copyToAll(wd)}>{t('team.copy_all')}</button>
              </span>
            </div>
            {d.ranges.map((r, i) => (
              <div key={`r${i}`} className="row" style={{ marginTop: 6 }}>
                {timeInput(r.start, (v) => upd(wd, (x) => ({ ...x, ranges: x.ranges.map((y, j) => (j === i ? { ...y, start: v } : y)) })), `${WEEKDAYS[wd][1]} ${t('common.from')}`)}
                <span>–</span>
                {timeInput(r.end, (v) => upd(wd, (x) => ({ ...x, ranges: x.ranges.map((y, j) => (j === i ? { ...y, end: v } : y)) })), `${WEEKDAYS[wd][1]} ${t('common.to')}`)}
                <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => upd(wd, (x) => ({ ...x, ranges: x.ranges.filter((_, j) => j !== i) }))}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {d.breaks.map((r, i) => (
              <div key={`b${i}`} className="row" style={{ marginTop: 6 }}>
                <span className="badge amber">{t('team.break')}</span>
                {timeInput(r.start, (v) => upd(wd, (x) => ({ ...x, breaks: x.breaks.map((y, j) => (j === i ? { ...y, start: v } : y)) })), `${t('team.break')} ${t('common.from')}`)}
                <span>–</span>
                {timeInput(r.end, (v) => upd(wd, (x) => ({ ...x, breaks: x.breaks.map((y, j) => (j === i ? { ...y, end: v } : y)) })), `${t('team.break')} ${t('common.to')}`)}
                <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => upd(wd, (x) => ({ ...x, breaks: x.breaks.filter((_, j) => j !== i) }))}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-gold"
          disabled={!dirty || save.busy}
          onClick={async () => {
            const body = {
              branchId,
              staffId: target || null,
              days: days.map((d, weekday) => ({ weekday, ranges: d.ranges })),
              breaks: target ? days.flatMap((d, weekday) => d.breaks.map((b) => ({ weekday, ...b }))) : [],
            };
            if (await save.submit(body)) {
              setOrig(JSON.stringify(days));
              toast(t('common.saved'), 'ok');
            }
          }}
        >
          {save.busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </section>
  );
}
