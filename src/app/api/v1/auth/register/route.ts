import { api } from '@/server/http/handler';
import { register, registerSchema } from '@/server/auth/service';

export const POST = api.public(async (c) => {
  const body = await c.json(registerSchema);
  const r = await register(body, c.ip);
  return { verificationRequired: true, destination: r.destination, devOutbox: r.deliveryMode === 'dev_outbox' };
});
