'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '../I18n';
import { StaffPanel } from './StaffPanel';
import { SchedulePanel } from './SchedulePanel';
import { ExceptionsPanel } from './ExceptionsPanel';
import { LeavePanel } from './LeavePanel';
import { AttendancePanel } from './AttendancePanel';
import { RequestsPanel } from './RequestsPanel';
import { CommissionsPanel } from './CommissionsPanel';

export type TeamTab = 'staff' | 'schedules' | 'exceptions' | 'leave' | 'attendance' | 'requests' | 'commissions';
export interface TeamRefs {
  branches: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

export function TeamManager({ slug, timezone, refs, tabs, initialTab }: { slug: string; timezone: string; refs: TeamRefs; tabs: TeamTab[]; initialTab: TeamTab }) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<TeamTab>(initialTab);
  const select = (k: TeamTab) => {
    setTab(k);
    router.replace(`?tab=${k}`, { scroll: false });
  };
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => select(k)}>
            {t(`team.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'staff' && <StaffPanel slug={slug} refs={refs} />}
      {tab === 'schedules' && <SchedulePanel slug={slug} refs={refs} timezone={timezone} />}
      {tab === 'exceptions' && <ExceptionsPanel slug={slug} refs={refs} timezone={timezone} />}
      {tab === 'leave' && <LeavePanel slug={slug} timezone={timezone} />}
      {tab === 'attendance' && <AttendancePanel slug={slug} timezone={timezone} />}
      {tab === 'requests' && <RequestsPanel slug={slug} />}
      {tab === 'commissions' && <CommissionsPanel slug={slug} refs={refs} />}
    </>
  );
}
