import { z } from 'zod';
import { api } from '@/server/http/handler';
import { slugAvailable } from '@/server/services/tenants';

export const GET = api.user(
  async (c) => {
    const { slug } = c.query(z.object({ slug: z.string().trim().toLowerCase().max(60) }));
    const valid = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug);
    return { slug, valid, available: valid && (await slugAvailable(slug)) };
  },
  { rateLimit: [120, 600] },
);
