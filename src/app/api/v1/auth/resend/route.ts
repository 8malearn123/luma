import { z } from 'zod';
import { api } from '@/server/http/handler';
import { parseContact, sendCode } from '@/server/auth/service';
import { sql } from '@/server/db';

export const POST = api.public(async (c) => {
  const body = await c.json(z.object({ identifier: z.string().min(5).max(254) }));
  const contact = parseContact(body.identifier);
  const dest = contact.kind === 'email' ? contact.email : contact.phone;
  const [u] = await sql()<{ id: string; locale: 'ar' | 'en'; verified: boolean }[]>`
    select id, locale, (case when ${contact.kind} = 'email' then email_verified_at else phone_verified_at end) is not null as verified
    from users where email = ${contact.kind === 'email' ? dest : null} or phone = ${contact.kind === 'phone' ? dest : null}`;
  // only unverified accounts can request a verification code; response is uniform
  if (u && !u.verified) {
    const r = await sendCode(contact, 'verify_contact', u.id, u.locale);
    return { destination: r.destination, devOutbox: r.deliveryMode === 'dev_outbox' };
  }
  return { destination: null, devOutbox: false };
});
