// Job/outbox handler registrations for the marketing module. Import side effects only.
import { registerJob } from '../jobs';
import { isProduction } from '../env';
import '../marketing/analysis'; // registers marketing.analysis
import { dispatchDueCampaigns } from '../marketing/campaigns';

// periodic: enqueued by the worker scheduler (system scope; each campaign is tenant-scoped by its row)
registerJob('campaign.dispatch', async (_job, tx) => ({ results: await dispatchDueCampaigns(tx, isProduction()) }));
export {};
