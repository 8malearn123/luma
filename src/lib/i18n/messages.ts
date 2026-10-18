import { core } from './m/core';
import { app } from './m/app';
import { builder } from './m/builder';
import { storefront } from './m/storefront';
import { booking } from './m/booking';
import { account } from './m/account';
import { dashboard } from './m/dashboard';
import { ops } from './m/ops';
import { platform } from './m/platform';
import { policy } from './m/policy';
import { marketing } from './m/marketing';
import { growth } from './m/growth';
import { commerce } from './m/commerce';

/** All message modules, merged. Each module file owns its own keys (prefix them by module). */
export const messages: Record<string, [string, string]> = {
  ...core,
  ...app,
  ...builder,
  ...storefront,
  ...booking,
  ...account,
  ...dashboard,
  ...ops,
  ...platform,
  ...policy,
  ...marketing,
  ...growth,
  ...commerce,
};
