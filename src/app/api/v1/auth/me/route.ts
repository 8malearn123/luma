import { api } from '@/server/http/handler';
import { listMyTenants, isPlatformStaff } from '@/server/tenancy/context';

export const GET = api.user(async (c) => {
  const [tenants, platformRole] = await Promise.all([listMyTenants(c.user.userId), isPlatformStaff(c.user.userId)]);
  return {
    user: { id: c.user.userId, displayName: c.user.displayName, email: c.user.email, phone: c.user.phone, locale: c.user.locale },
    tenants,
    platformRole,
  };
});
