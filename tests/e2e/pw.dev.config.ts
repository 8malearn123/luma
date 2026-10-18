// Local iteration config: reuses an already-running review server on :3100 (no webServer, no DB reset).
import base from './playwright.config';
export default { ...base, webServer: undefined, projects: [base.projects![0]] };
