import { z } from 'zod';

/** Shared (client + server) validation. The server re-validates everything. */
export const money = z.number().int().min(0).max(100_000_000); // minor units
export const duration = z.number().int().min(5).max(720);
const name = z.string().trim().min(1).max(120);
const optName = z.string().trim().max(120).optional().nullable();
const uuid = z.string().uuid();

export const variantInput = z.object({
  id: uuid.optional(),
  name,
  nameEn: optName,
  priceMinor: money,
  durationMin: duration,
});

export const addonInput = z.object({
  id: uuid.optional(),
  name,
  nameEn: optName,
  priceMinor: money,
  durationMin: z.number().int().min(0).max(240),
});

export const priceRuleInput = z.object({
  variantId: uuid.nullable().optional(),
  staffId: uuid.nullable().optional(),
  priceMinor: money.nullable().optional(),
  durationMin: duration.nullable().optional(),
});

export const serviceInput = z.object({
  name,
  nameEn: optName,
  description: z.string().max(4000).optional().nullable(),
  descriptionEn: z.string().max(4000).optional().nullable(),
  categoryId: uuid.nullable().optional(),
  branchId: uuid.nullable().optional(),
  priceMinor: money,
  priceIsFrom: z.boolean().default(false),
  durationMin: duration,
  bufferBeforeMin: z.number().int().min(0).max(240).default(0),
  bufferAfterMin: z.number().int().min(0).max(240).default(0),
  imageAssetId: uuid.nullable().optional(),
  isVisible: z.boolean().default(true),
  internalBookingWhenHidden: z.boolean().default(true),
  minNoticeMin: z.number().int().min(0).max(20160).nullable().optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).nullable().optional(),
  groupCapacity: z.number().int().min(2).max(200).nullable().optional(),
  materialCostMinor: money.nullable().optional(),
  staffIds: z.array(uuid).max(100).default([]),
  variants: z.array(variantInput).max(30).default([]),
  addons: z.array(addonInput).max(30).default([]),
  priceRules: z.array(priceRuleInput).max(200).default([]),
  resourceTypeIds: z.array(uuid).max(5).default([]),
});
export type ServiceInput = z.infer<typeof serviceInput>;

export const categoryInput = z.object({
  kind: z.enum(['service', 'product']),
  name: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
});

export const packageInput = z.object({
  name,
  nameEn: optName,
  description: z.string().max(2000).optional().nullable(),
  priceMinor: money,
  items: z.array(z.object({ serviceId: uuid, quantity: z.number().int().min(1).max(50) })).min(1).max(20),
});
