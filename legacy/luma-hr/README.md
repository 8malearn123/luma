# LUMA · HR & Staff Management Module

وحدة الموارد البشرية وإدارة الطاقم لمنصة لوما — مصممة لنموذج عمل الصوالين ومزوّدات خدمات الجمال.

## Stack
- **Database:** PostgreSQL 15+ / Supabase (RLS, triggers, `EXCLUDE` constraints)
- **API:** Next.js App Router route handlers (`@supabase/ssr`)
- **UI:** React + Tailwind CSS (no UI kit), RTL, LUMA Eclipse identity

## Layout
```
luma-hr/
├── supabase/migrations/
│   ├── 0001_hr_schema.sql   # tables, enums, constraints, RLS
│   └── 0002_hr_logic.sql    # availability engine, guards, payroll functions
├── lib/
│   ├── types.ts             # shared domain types + Arabic labels
│   └── supabase-server.ts   # SSR client + DB-error translation
├── app/api/hr/
│   ├── staff/route.ts        # GET list · POST create (+defaults)
│   ├── leaves/route.ts       # GET list · POST submit (staff)
│   ├── leaves/[id]/route.ts  # PATCH approve/reject/cancel
│   ├── schedules/route.ts    # GET · PUT weekly shifts
│   ├── payroll/route.ts      # GET monthly payroll report
│   └── availability/route.ts # GET public booking slots
└── components/
    ├── OwnerHRDashboard.tsx  # owner: staff · leaves · calendar · payroll
    └── StaffPortal.tsx       # employee: agenda · earnings · leave requests
```

## Setup
1. `supabase db push` (or run the two migration files in order via the SQL editor).
2. Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Mount the components:
   ```tsx
   <OwnerHRDashboard salonId={salon.id} />   // owner dashboard page
   <StaffPortal />                            // employee portal page
   ```

## How the core rules are enforced

### Real-time booking sync
`staff_is_available()` is the single source of truth. The public page calls
`get_available_slots(staff, date)` which **only emits bookable slots** —
approved leaves, off-days, breaks and existing bookings never appear.
The `booking_guard` trigger re-checks on every `INSERT`/reschedule, and the
`no_double_booking EXCLUDE` constraint makes overlaps impossible even under
concurrent requests. Approving a leave auto-cancels conflicting confirmed
bookings (see `leave_transition_guard`).

### Commission calculator
`calculate_monthly_payout(staff, month)` → base salary + commission over
**completed** bookings only (percentage of gross, or fixed rate × count).
`salon_monthly_payroll(salon, month)` aggregates it per employee for the
owner's payroll tab, so UI numbers and exports always match.

### Edge cases covered
- Overlapping leave requests → blocked by `EXCLUDE` constraint (race-proof).
- Pending (unapproved) leave → does **not** block booking; approval does.
- Leave approved after a client already booked → those bookings are
  auto-cancelled inside the same transaction.
- Employees can only file leaves for themselves and only cancel while pending
  (RLS + state-machine trigger).
- Cancelled / no-show bookings never generate commission.
- Staff with no commission config default to salary-only, never `NULL` math.
