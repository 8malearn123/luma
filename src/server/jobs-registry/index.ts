/**
 * Importing this module registers every job & outbox handler and periodic
 * schedule. The worker (scripts/worker.ts) imports it; each module owns its file.
 */
import { registerSchedule } from '../jobs';
import './booking';
import './payments';
import './commerce';
import './marketing';
import './growth';
import { POLICY_SCHEDULES } from './policy';
import './storefront';
import './platform';

for (const s of POLICY_SCHEDULES) registerSchedule(s);
