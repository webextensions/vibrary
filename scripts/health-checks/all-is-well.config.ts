// Committed base configuration for the all-is-well health-check suite. Loaded by
// ./allIsWellConfig/loadConfig.ts UNLESS the git-ignored all-is-well.config.local.ts exists - that
// local file imports this one and deep-merges machine-local overrides over it (start from
// all-is-well.config.local.example.ts). See ./allIsWellConfig/types.ts for all available options.

import type { AllIsWellConfig } from './allIsWellConfig/types.ts';

const allIsWellConfig: AllIsWellConfig = {
    checks: {
        // "npm audit signatures" always needs network access (it queries the npm registry for its
        // published keys), so it fails offline and can be slow/flaky locally. CI is where the
        // network is reliable and supply-chain provenance matters, so run it only there.
        'npm-audit-signatures': {
            disable: {
                disableOnLocal: true
            }
        }
    }
};

export { allIsWellConfig };
