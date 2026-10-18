// Server-only module: never import from client components (secrets live here).
import { z } from 'zod';

/**
 * Server environment. Validated once at startup; secrets never leave the server
 * (it is only imported from src/server, which client components never import).
 */
const flag = z.enum(['0', '1']).default('0').transform((v) => v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Deployment kind, independent of the build mode: a production BUILD can be a private
    // 'review' deployment (sandbox payments, dev outbox, demo sign-in allowed) or real
    // 'production' (all of that refused). Production builds default to 'production'.
    LUMA_DEPLOYMENT: z.enum(['development', 'review', 'production']).optional(),
    APP_BASE_URL: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    LUMA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'LUMA_ENCRYPTION_KEY must be 32 bytes, base64'),
    // Development conveniences — refused in production below.
    LUMA_DEV_OTP: flag,
    LUMA_DEMO_MODE: flag,
    LUMA_LEGACY_PROTOTYPE: flag,
    // Storage
    STORAGE_DRIVER: z.enum(['local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    // Messaging providers (none = disconnected; nothing is sent)
    EMAIL_PROVIDER: z.enum(['none']).default('none'),
    SMS_PROVIDER: z.enum(['none']).default('none'),
    // AI — no default model is invented; both must be configured to enable.
    AI_PROVIDER: z.enum(['none', 'openai']).default('none'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
    // Optional: documented price per 1M tokens (micro-USD) to record cost; unset = cost unknown.
    AI_PRICE_IN_PER_MTOK_MICROUSD: z.coerce.number().int().positive().optional(),
    AI_PRICE_OUT_PER_MTOK_MICROUSD: z.coerce.number().int().positive().optional(),
    // Payments
    PAYMENTS_SANDBOX_ENABLED: flag,
    MOYASAR_ENABLED: flag,
    MOYASAR_API_BASE: z.string().url().default('https://api.moyasar.com/v1'),
    // Trend radar
    TRENDS_FETCH_ENABLED: flag,
  })
  .transform((v) => ({ ...v, LUMA_DEPLOYMENT: v.LUMA_DEPLOYMENT ?? (v.NODE_ENV === 'production' ? 'production' : 'development') }))
  .superRefine((v, ctx) => {
    if (v.LUMA_DEPLOYMENT === 'production') {
      for (const k of ['LUMA_DEV_OTP', 'LUMA_DEMO_MODE', 'LUMA_LEGACY_PROTOTYPE', 'PAYMENTS_SANDBOX_ENABLED'] as const) {
        if (v[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} must be 0 in production` });
      }
    }
    if (v.AI_PROVIDER === 'openai' && (!v.OPENAI_API_KEY || !v.OPENAI_MODEL)) {
      // Not fatal: AI shows an honest "not configured" state instead.
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid server environment: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** True for the real production deployment (not for a private review deployment of a production build). */
export const isProduction = () => env().LUMA_DEPLOYMENT === 'production';
/** Secure cookies whenever the app is served over HTTPS. */
export const secureCookies = () => env().APP_BASE_URL.startsWith('https://');
