/** LUMA HR module — shared domain types (mirror of the SQL enums/tables). */

export type StaffRole =
  | 'hair_stylist' | 'makeup_artist' | 'esthetician' | 'nail_artist'
  | 'lash_artist' | 'photographer' | 'receptionist' | 'manager';

export type StaffStatus = 'active' | 'suspended' | 'archived';
export type LeaveType = 'annual' | 'sick' | 'emergency' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type CommissionType = 'percentage' | 'fixed_rate';
export type BookingStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface StaffProfile {
  id: string;
  salon_id: string;
  user_id: string | null;
  full_name: string;
  role: StaffRole;
  specialties: string[];
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  status: StaffStatus;
  hired_at: string;
}

export interface StaffSchedule {
  id: string;
  staff_id: string;
  weekday: number;          // 0 = Sunday … 6 = Saturday
  is_day_off: boolean;
  shift_start: string | null; // 'HH:MM:SS'
  shift_end: string | null;
  break_start: string | null;
  break_end: string | null;
}

export interface StaffLeave {
  id: string;
  staff_id: string;
  start_date: string;       // 'YYYY-MM-DD' inclusive
  end_date: string;
  type: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface StaffCommission {
  staff_id: string;
  base_salary: number;
  commission_type: CommissionType;
  commission_value: number;
  effective_from: string;
}

export interface PayrollRow {
  staff_id: string;
  full_name: string;
  role: StaffRole;
  base_salary: number;
  commission_type: CommissionType;
  commission_value: number;
  bookings_count: number;
  gross_sales: number;
  commission: number;
  total_payout: number;
}

export interface Slot { slot_start: string; slot_end: string }

/** Arabic labels used across both dashboards. */
export const ROLE_LABELS: Record<StaffRole, string> = {
  hair_stylist: 'مصففة شعر', makeup_artist: 'خبيرة مكياج',
  esthetician: 'أخصائية بشرة', nail_artist: 'فنانة أظافر',
  lash_artist: 'فنية رموش', photographer: 'مصورة',
  receptionist: 'موظفة استقبال', manager: 'مديرة',
};

export const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: 'سنوية', sick: 'مرضية', emergency: 'طارئة', unpaid: 'بدون راتب',
};

export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
