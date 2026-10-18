import { core } from './m/core';
import { app } from './m/app';

/** All message modules, merged. Each module file owns its own keys. */
export const messages: Record<string, [string, string]> = { ...core, ...app };
