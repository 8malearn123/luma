import { api } from '@/server/http/handler';
import { auditQuery, platformAudit } from '@/server/platform/service';

export const GET = api.platform('platform.audit.view', async (c) => platformAudit(c.p, c.query(auditQuery)));
