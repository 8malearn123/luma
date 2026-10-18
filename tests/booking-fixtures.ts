import { withTenant, type Tx } from '@/server/db';
import { addDays, utcToWall } from '@/lib/tz';
import { makeTenant, makeUser, type TenantFixture } from './fixtures';
import { ensureTenantCustomer } from '@/server/booking/service';

export const TZ = 'Asia/Riyadh';

/** A local date ≥ `ahead` days from now that falls on `weekday` (0=Sun). */
export function futureDate(weekday = 0, ahead = 3): string {
  let d = addDays(utcToWall(new Date(), TZ).date, ahead);
  for (let i = 0; i < 7; i++) {
    const [y, m, dd] = d.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() === weekday) return d;
    d = addDays(d, 1);
  }
  return d;
}

export const at = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString();

export interface SalonFixture extends TenantFixture {
  staff: { hana: string; lama: string; sara: string };
  services: { haircut: string; nails: string; facial: string; color: string };
  roomTypeId: string;
  roomId: string;
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

/**
 * Salon open every day 09:00–21:00 (Riyadh).
 *  hana: hair, works 10:00–18:00 with a break 13:00–14:00
 *  lama: nails, works 12:00–20:00
 *  sara: hair + nails + facial, works 09:00–17:00
 *  haircut 60m (+15m cleanup), nails 45m, facial 60m needs one "room" (one room exists), color 90m hana only
 */
export async function makeSalon(): Promise<SalonFixture> {
  const t = await makeTenant({ name: 'Noura Test Salon' });
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ tenantId: t.tenantId, userId: t.owner.userId }, fn);
  return run(async (tx) => {
    await tx`update tenants set status = 'active' where id = ${t.tenantId}`;
    await tx`update booking_policies set min_notice_min = 60, slot_increment_min = 15, hold_minutes = 10, max_gap_min = 30, no_show_grace_min = 15`;
    for (let wd = 0; wd < 7; wd++) {
      await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${t.tenantId}, ${t.branchId}, null, ${wd}, '09:00', '21:00')`;
    }
    const mk = async (name: string) => {
      const [s] = await tx<{ id: string }[]>`insert into staff_profiles (tenant_id, display_name) values (${t.tenantId}, ${name}) returning id`;
      await tx`insert into staff_branch_assignments (tenant_id, staff_id, branch_id) values (${t.tenantId}, ${s.id}, ${t.branchId})`;
      return s.id;
    };
    const hana = await mk('Hana');
    const lama = await mk('Lama');
    const sara = await mk('Sara');
    const hours = async (staff: string, start: string, end: string) => {
      for (let wd = 0; wd < 7; wd++) await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${t.tenantId}, ${t.branchId}, ${staff}, ${wd}, ${start}, ${end})`;
    };
    await hours(hana, '10:00', '18:00');
    await hours(lama, '12:00', '20:00');
    await hours(sara, '09:00', '17:00');
    for (let wd = 0; wd < 7; wd++) await tx`insert into breaks (tenant_id, staff_id, weekday, start_time, end_time) values (${t.tenantId}, ${hana}, ${wd}, '13:00', '14:00')`;
    const svc = async (name: string, price: number, dur: number, after = 0) => {
      const [s] = await tx<{ id: string }[]>`insert into services (tenant_id, name, price_minor, duration_min, buffer_after_min) values (${t.tenantId}, ${name}, ${price}, ${dur}, ${after}) returning id`;
      return s.id;
    };
    const haircut = await svc('Haircut', 15000, 60, 15);
    const nails = await svc('Nails', 10000, 45);
    const facial = await svc('Facial', 20000, 60);
    const color = await svc('Color', 30000, 90);
    const qual = async (service: string, ...staff: string[]) => {
      for (const s of staff) await tx`insert into service_staff (tenant_id, service_id, staff_id) values (${t.tenantId}, ${service}, ${s})`;
    };
    await qual(haircut, hana, sara);
    await qual(nails, lama, sara);
    await qual(facial, sara);
    await qual(color, hana);
    const [rt] = await tx<{ id: string }[]>`insert into resource_types (tenant_id, name) values (${t.tenantId}, 'room') returning id`;
    const [room] = await tx<{ id: string }[]>`insert into resources (tenant_id, branch_id, resource_type_id, name) values (${t.tenantId}, ${t.branchId}, ${rt.id}, 'Room 1') returning id`;
    await tx`insert into service_resource_requirements (tenant_id, service_id, resource_type_id) values (${t.tenantId}, ${facial}, ${rt.id})`;
    return { ...t, staff: { hana, lama, sara }, services: { haircut, nails, facial, color }, roomTypeId: rt.id, roomId: room.id, run };
  });
}

export async function makeCustomer(salon: SalonFixture, name = 'Customer') {
  const u = await makeUser({ name });
  const tcId = await salon.run((tx) => ensureTenantCustomer(tx, salon.tenantId, { userId: u.userId, displayName: name }));
  return { user: u, tenantCustomerId: tcId };
}
