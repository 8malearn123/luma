import { z } from 'zod';

const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'errors.time_invalid');

export const staffInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  displayNameEn: z.string().trim().max(120).optional().nullable(),
  specialty: z.string().trim().max(120).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  photoAssetId: uuid.nullable().optional(),
  publicVisible: z.boolean().default(true),
  branchIds: z.array(uuid).min(1).max(20),
  serviceIds: z.array(uuid).max(200).default([]),
  allocationWeight: z.number().int().min(0).max(1000).default(100),
});

/** Fields a specialist may edit on her own profile. */
export const selfProfileInput = z.object({
  bio: z.string().max(2000).optional().nullable(),
  photoAssetId: uuid.nullable().optional(),
  displayNameEn: z.string().trim().max(120).optional().nullable(),
});

export const weeklyHoursInput = z.object({
  branchId: uuid,
  staffId: uuid.nullable(), // null = branch opening hours
  days: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), ranges: z.array(z.object({ start: hhmm, end: hhmm })).max(4) }))
    .length(7),
  breaks: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm, label: z.string().max(40).optional() })).max(20).default([]),
});

export const overrideInput = z.object({
  branchId: uuid,
  staffId: uuid.nullable(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['closed', 'custom']),
  start: hhmm.optional(),
  end: hhmm.optional(),
  note: z.string().max(200).optional(),
});

export const leaveInput = z.object({
  staffId: uuid,
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  type: z.enum(['annual', 'sick', 'emergency', 'unpaid', 'other']),
  reason: z.string().max(1000).optional(),
});

export const blockedTimeInput = z.object({
  staffId: uuid,
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().max(200).optional(),
});
