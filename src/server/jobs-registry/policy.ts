// Job/outbox handler registrations for the policy module. Import side effects only.
import { registerJob } from '../jobs';
import { expireDecisions } from '../policy/service';

/** Periodic (e.g. hourly, key `policy.expire:<yyyy-mm-ddThh>`): expire decisions, flag reviews due. Runs in system scope. */
registerJob('policy.expire_decisions', async (_job, tx) => expireDecisions(tx));

export const POLICY_SCHEDULES = [{ kind: 'policy.expire_decisions', every: 'hour' as const }];
