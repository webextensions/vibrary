// Shared types for the all-is-well orchestrator and its layered config files. The config layering
// (committed scripts/health-checks/all-is-well.config.ts, optionally overridden by the git-ignored
// all-is-well.config.local.ts) is loaded by ./loadConfig.ts and applied by ./resolveChecks.ts; the
// HealthCheck shape lives here too so those modules and all-is-well.ts share one definition without
// circular imports.

interface HealthCheck {
    args?: string[];
    changeDependencies?: string[];
    cmd: string;
    env?: Record<string, string>; // Extra env merged onto process.env for this check's subprocess
    errorMsg: string;
    name: string
}

// Per-check settings, keyed by HealthCheck.name in AllIsWellConfig.checks.
interface AllIsWellCheckConfig {
    // `true` disables the check everywhere; the object form disables it only on CI (process.env.CI
    // set) and/or only on a local machine (process.env.CI not set).
    disable?: boolean | {
        disableOnCi?: boolean;
        disableOnLocal?: boolean
    };
    // This check always executes (its cache entries are never read or written); the other checks
    // may still skip via their own per-check cache entries.
    disableCache?: boolean;
    // Merged over the check's built-in `env` (config wins per key).
    env?: Record<string, string>
}

interface AllIsWellConfig {
    checks?: Record<string, AllIsWellCheckConfig>;
    // Like --no-cache / HEALTHCHECKS_NO_CACHE (which still win): no cache reads or writes at all.
    disableCache?: boolean;
    // Skip the node-notifier desktop popup on a failed run.
    disableNotifications?: boolean;
    // Run the checks sequentially by default; the --sequentially CLI flag ORs with this.
    runSequentially?: boolean
}

export type {
    AllIsWellConfig,
    HealthCheck
};
