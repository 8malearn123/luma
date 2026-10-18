/**
 * Importing this module registers every job & outbox handler. The worker
 * (scripts/worker.ts) imports it; each module owns its own file here.
 */
import './booking';
import './payments';
import './commerce';
import './marketing';
import './growth';
import './policy';
import './storefront';
import './platform';
