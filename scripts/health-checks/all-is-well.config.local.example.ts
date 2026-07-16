// Duplicate this file and rename the copy to all-is-well.config.local.ts to apply machine-local
// overrides to the all-is-well health-check suite. The local file is git-ignored (see the sibling
// .gitignore) and, when present, is the ONLY config file the suite loads - it layers your overrides
// over the committed base config via the deep merge below. See ./allIsWellConfig/types.ts for all
// available options.
//
// Notes:
//     - This skeleton is inert: with the empty overrides object it behaves exactly like the base
//       config. Uncomment / add only what you want to change.
//     - extend(true, ...) merges DEEPLY: an object-form `disable` override merges INTO the base's
//       object (e.g. adding disableOnCi over the base's { disableOnLocal: true } keeps both flags).
//       To fully reset a `disable`, use the scalar form (`disable: false` or `disable: true`) - a
//       scalar replaces an object.
//     - tsc and eslint do not honor .gitignore, so your local file is still type-checked and
//       linted - keep it valid.

import extend from 'extend';

import { allIsWellConfig as baseConfig } from './all-is-well.config.ts';
import type { AllIsWellConfig } from './allIsWellConfig/types.ts';

const allIsWellConfig: AllIsWellConfig = extend(true, {}, baseConfig, {
    // disableCache: true,
    // disableNotifications: true,
    // runSequentially: true,
    checks: {
        // knip: { disable: { disableOnLocal: true } },
        // 'npm-audit-signatures': { disable: false }, // Re-enable locally (scalar resets the base's object form)
        // 'npm-ci-dry': { env: { npm_config_loglevel: 'silent' } },
        // vitest: { disableCache: true }
    }
} satisfies AllIsWellConfig);

export { allIsWellConfig };
