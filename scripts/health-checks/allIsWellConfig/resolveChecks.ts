// Applies the loaded all-is-well config (see ./loadConfig.ts and ./types.ts) to the healthChecks
// list: validates the per-check names, filters out disabled checks, merges per-check env, and
// partitions the checks for the per-check result cache (checks with disableCache always execute;
// each remaining check may skip via its own cache entry).

import chalk from 'chalk';

import type {
    AllIsWellConfig,
    HealthCheck
} from './types.ts';

// Config keys under `checks` that match no actual check name (typos, or a config merged from a
// branch with a different check list). The caller fails the suite loudly on a non-empty result.
const getUnknownConfigCheckNames = function ({ checks, config }: { checks: HealthCheck[]; config: AllIsWellConfig }): string[] {
    const validNames = new Set(checks.map((check) => check.name));
    return Object.keys(config.checks ?? {}).filter((name) => !validNames.has(name));
};

// Drop checks disabled by config: `disable: true` everywhere, `disableOnCi` when process.env.CI is
// set, `disableOnLocal` when it is not. Logs a skip line per dropped check, mirroring the existing
// "--optimize-for-change" skip output.
const getConfigFilteredChecks = function ({ checks, config, isCi }: { checks: HealthCheck[]; config: AllIsWellConfig; isCi: boolean }): HealthCheck[] {
    return checks.filter((check) => {
        const disable = config.checks?.[check.name]?.disable;
        if (!disable) {
            return true;
        }
        if (disable === true) {
            console.log(chalk.blue(`Skipping "${check.name}" (disabled by config: disable)`));
            return false;
        }
        if (isCi && disable.disableOnCi) {
            console.log(chalk.blue(`Skipping "${check.name}" (disabled by config: disableOnCi; process.env.CI is set)`));
            return false;
        }
        if (!isCi && disable.disableOnLocal) {
            console.log(chalk.blue(`Skipping "${check.name}" (disabled by config: disableOnLocal; process.env.CI is not set)`));
            return false;
        }
        return true;
    });
};

// Merge each check's config env over its built-in env (config wins per key) so the runners spawn
// with the effective env without further changes.
const getChecksWithConfigEnv = function ({ checks, config }: { checks: HealthCheck[]; config: AllIsWellConfig }): HealthCheck[] {
    return checks.map((check) => {
        const configEnv = config.checks?.[check.name]?.env;
        if (!configEnv) {
            return check;
        }
        return {
            ...check,
            env: {
                ...check.env,
                ...configEnv
            }
        };
    });
};

// Split by per-check disableCache, preserving launch order in both halves. Global
// config.disableCache is handled by the caller (it turns the cache off entirely).
const partitionChecksByCacheability = function ({ checks, config }: { checks: HealthCheck[]; config: AllIsWellConfig }): { cacheDisabledChecks: HealthCheck[]; cacheEnabledChecks: HealthCheck[] } {
    const cacheDisabledChecks: HealthCheck[] = [];
    const cacheEnabledChecks: HealthCheck[] = [];
    for (const check of checks) {
        if (config.checks?.[check.name]?.disableCache) {
            cacheDisabledChecks.push(check);
        } else {
            cacheEnabledChecks.push(check);
        }
    }
    return { cacheDisabledChecks, cacheEnabledChecks };
};

// Deterministic per-check cache signature: the check's name, command, args, and EFFECTIVE env (call
// this after getChecksWithConfigEnv) under sorted keys; the object-literal keys are alphabetical, so
// plain JSON.stringify is deterministic. Folding the effective env in matters because the local
// config file (which can set it) is git-ignored - its changes never show up in the git content hash,
// so they must change the cache key instead. cmd/args are folded in as belt-and-braces (their source
// is tracked, so edits also change the content hash).
const buildCheckCacheSignature = function ({ check }: { check: HealthCheck }): string {
    return JSON.stringify({
        args: check.args ?? [],
        cmd: check.cmd,
        env: Object.fromEntries(
            Object.entries(check.env ?? {}).toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB))
        ),
        name: check.name
    });
};

export {
    buildCheckCacheSignature,
    getChecksWithConfigEnv,
    getConfigFilteredChecks,
    getUnknownConfigCheckNames,
    partitionChecksByCacheability
};
