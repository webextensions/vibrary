#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// ALLOW_DO_NOT_COMMIT

// Runs the full health-check suite and reports a single pass/fail. This is what "node --run test"
// runs. The authoritative list of checks (and the order they are declared in) is the healthChecks
// array below.
//
// Usage (from the project's root folder):
//     $ ./scripts/health-checks/all-is-well.ts [--sequentially] [--optimize-for-change] [--no-cache]
// Examples:
//     $ ./scripts/health-checks/all-is-well.ts
//     $ ./scripts/health-checks/all-is-well.ts --sequentially
//     $ ./scripts/health-checks/all-is-well.ts --optimize-for-change # Skip some checks whose "changeDependencies" have no staged changes
//     $ ./scripts/health-checks/all-is-well.ts --no-cache
//
// Configuration:
//     The suite is configurable via ./all-is-well.config.local.ts (git-ignored, machine-local; wins
//     when present) or else ./all-is-well.config.ts (committed base): disable checks (everywhere /
//     on CI / on local), per-check env overrides, per-check or global cache opt-out, a desktop-
//     notification opt-out, and a sequential-run default. See ./allIsWellConfig/types.ts for the
//     shape and ./all-is-well.config.local.example.ts for how to set up the local file.
//
// Result cache:
//     Every check's pass is cached individually, keyed on the git content state plus the check's
//     signature, so a later run skips exactly the checks that already passed for the same content.
//     Force a fresh run with HEALTHCHECKS_NO_CACHE=1 or --no-cache. Full contract and caveats:
//     .claude/rules/checks-execution-caching.md; architecture:
//     ./checksExecutionCaching/README.md.

import path from 'node:path';

import chalk from 'chalk';
import { concurrently } from 'concurrently';
import { execa } from 'execa';
import notifier from 'node-notifier';
import { quote } from 'shell-quote';

import { loadConfigAsync } from './allIsWellConfig/loadConfig.ts';
import {
    buildCheckCacheSignature,
    getChecksWithConfigEnv,
    getConfigFilteredChecks,
    getUnknownConfigCheckNames,
    partitionChecksByCacheability
} from './allIsWellConfig/resolveChecks.ts';
import type { HealthCheck } from './allIsWellConfig/types.ts';
import {
    computeCacheKey,
    isCacheDisabledByEnv,
    pruneOldCacheEntries,
    readCacheEntry,
    writeCacheEntry
} from './checksExecutionCaching/cacheStore.ts';
import { computeGitContentHashAsync } from './checksExecutionCaching/computeGitContentHash.ts';

const healthChecksDir = import.meta.dirname;
const projectRoot = path.resolve(healthChecksDir, '..', '..');

// Fails when .claude/settings.json is not normalized: its object keys must be alphabetized and the
// permissions.allow / permissions.deny arrays sorted + deduped (Claude Code appends "always allow"
// approvals to the end and edits keys over time). "--optimize-for-change" runs this only when
// .claude/settings.json is staged; the Stop hook keeps it normalized live between runs.
const CHECK_CLAUDE_SETTINGS_SORT: HealthCheck = {
    name: 'claude-settings-sort',
    changeDependencies: ['.claude/settings.json'],
    cmd: './checks/claude-settings-sort.ts',
    errorMsg: '.claude/settings.json is not normalized (unsorted keys or unsorted/duplicate permission entries). Run "node --run claude-settings-sort:fix".'
};

// Fails if any file contains the DO_NOT_COMMIT token. Add ALLOW_DO_NOT_COMMIT in a file to
// whitelist it - as this file does at the top, since the token appears in the check name below.
const CHECK_DO_NOT_COMMIT: HealthCheck = {
    name: 'DO_NOT_COMMIT',
    cmd: './checks/block-DO_NOT_COMMIT-code-lines.sh',
    errorMsg: 'We have one or more files containing unintended "DO_NOT_COMMIT" text'
};

// Lints the whole repo.
const CHECK_ESLINT: HealthCheck = {
    name: 'eslint',
    cmd: 'node',
    args: ['--run', 'eslint'],
    errorMsg: 'Failure in code linting'
};

// Validates that relative links/images in markdown files resolve to existing files or directories
// (ESLint + @eslint/markdown with the custom rule
// scripts/health-checks/helpers/eslint-rules/markdown-relative-links.js,
// via its own eslint.markdown.config.js; external URLs are ignored). Always runs: a check's
// "changeDependencies" matches whole paths/prefixes, so a "any *.md anywhere" condition cannot be
// expressed - and link targets can also break when a NON-markdown file moves.
const CHECK_ESLINT_MARKDOWN: HealthCheck = {
    name: 'eslint:markdown',
    cmd: 'node',
    args: ['--run', 'eslint:markdown'],
    errorMsg: 'Broken relative link(s) in markdown files. Run "node --run eslint:markdown" for details.'
};

// Lints only the staged files (fast, commit-scoped). Read-only verify - the eslint:staged-files
// script never auto-fixes / re-stages, so it is safe to run concurrently and is a no-op when nothing
// is staged (e.g. plain "node --run test" / pre-push). Cache nuance: like every check it is keyed on
// content trees only, so its pass is reused across a commit even though the staged file SET changed -
// safe because the full-repo "eslint" check is keyed on the same trees (see
// .claude/rules/checks-execution-caching.md).
const CHECK_ESLINT_STAGED: HealthCheck = {
    name: 'eslint:staged',
    cmd: 'node',
    args: ['--run', 'eslint:staged-files'],
    errorMsg: 'Failure in code linting of staged files'
};

// Fails on unresolved git merge-conflict marker lines (runs of seven "<", "|" or ">" characters,
// spelled out here in words so this comment does not trip the check itself) - handy after
// template-sync merges. Add ALLOW_GIT_CONFLICT_MARKERS in a file to whitelist it.
const CHECK_GIT_CONFLICT_MARKERS: HealthCheck = {
    name: 'git-conflict-markers',
    cmd: './checks/block-git-conflict-markers.sh',
    errorMsg: 'We have one or more files containing unresolved git conflict markers'
};

// Reports unused files / exports / dependencies. Always-run (no changeDependencies): knip analyzes
// the whole import graph (entry points from package.json main/bin/exports + scripts + husky hooks,
// plus all source/test files and deps), so almost any change is relevant and it is fast (~0.4s).
const CHECK_KNIP: HealthCheck = {
    name: 'knip',
    cmd: 'node',
    args: ['--run', 'knip'],
    errorMsg: 'knip found unused files / exports / dependencies. Run "node --run knip" for details.'
};

// Lints package-lock.json for supply-chain correctness: every dependency must resolve over HTTPS from
// the npm registry (lockfile-lint). Distinct from npm-ci-dry, which only checks lockfile<->package.json
// sync, not the resolved registry hosts / protocol. Reuses the "test:lockfile" script (flags live there).
const CHECK_LOCKFILE_LINT: HealthCheck = {
    name: 'lockfile-lint',
    // "--optimize-for-change" runs this only when package-lock.json is staged (the only file it reads).
    changeDependencies: ['package-lock.json'],
    cmd: 'node',
    args: ['--run', 'test:lockfile'],
    errorMsg: 'lockfile-lint found an issue in package-lock.json (non-HTTPS or non-npm-registry resolution). Run "node --run test:lockfile" for details.'
};

// Fails if node_modules/ contains top-level or scoped (@scope/pkg) symlinks left over from "npm link".
const CHECK_NO_NPM_LINKS: HealthCheck = {
    name: 'no-npm-links',
    cmd: './checks/ensure-no-npm-links.sh',
    errorMsg: 'We might be having some npm links under node_modules/ directory'
};

// Fails if the running Node does not satisfy .nvmrc (a bare version like "1.2.34" is matched exactly).
// Environmental, so it always runs (no changeDependencies).
const CHECK_NODE_VERSION: HealthCheck = {
    name: 'node-version',
    cmd: './checks/check-node-version.ts',
    errorMsg: 'Please run "nvm use" to use the correct node version (see .nvmrc)'
};

// Verifies file status expectations (e.g. read-only paths) per status-of-files.config.ts. The
// config list is an intentional fill-in slot - empty on this base template branch, populated by
// template branches / forks.
const CHECK_STATUS_OF_FILES: HealthCheck = {
    name: 'status-of-files',
    cmd: './checks/check-status-of-files.ts',
    args: ['--return-exit-code'],
    errorMsg: 'File status check failed. Run ./scripts/health-checks/checks/ensure-status-of-files.ts (Rules: status-of-files.config.ts)'
};

// Fails on typographic punctuation not on a US keyboard, based on the per-file baseline in
// .block-non-keyboard-characters.suppressions.json. Character list and workflow:
// .claude/rules/non-keyboard-characters.md
const CHECK_NON_KEYBOARD_CHARACTERS: HealthCheck = {
    name: 'non-keyboard-characters',
    cmd: './checks/block-non-keyboard-characters/block-characters.ts',
    errorMsg: 'Non-keyboard characters detected (em dash, curly quotes, ellipsis, etc.). Run "node --run block-non-keyboard-characters:fix" to auto-replace, or ":suppress" to baseline.'
};

// "npm audit signatures" verifies the registry signatures (Sigstore / PGP) of the resolved
// dependencies against the npm registry's published keys - supply-chain provenance, distinct from
// lockfile-lint (registry host / HTTPS only) and npm-ci-dry (lockfile<->package.json sync). It
// always requires network access (it queries the registry), so it fails offline (npm-ci-dry can also
// reach the network on a cold cache). The shipped base config (all-is-well.config.ts) therefore
// disables it on local runs (disable: { disableOnLocal: true }): CI is where the network is reliable
// and provenance matters.
const CHECK_NPM_AUDIT_SIGNATURES: HealthCheck = {
    name: 'npm-audit-signatures',
    // Mostly moot while the base config keeps this check CI-only (CI runs the full suite, without
    // "--optimize-for-change") - kept so the change-aware behavior applies wherever the check runs.
    changeDependencies: [
        'package-lock.json',
        'package.json'
    ],
    cmd: 'npm',
    args: ['audit', 'signatures'],
    errorMsg: "'$ npm audit signatures' failed (a dependency signature could not be verified, or the npm registry was unreachable)"
};

// "npm ci --dry-run" reports what a clean install WOULD do without touching node_modules (under
// --dry-run it neither deletes node_modules nor installs); it fails when package.json and
// package-lock.json are out of sync. That sync is coverage neither pkg-json-sync (package.json vs
// package.json.ts) nor lockfile-lint (registry hosts / HTTPS only) provides. npm walks up from this
// script's cwd to the repo-root package.json, so running from scripts/health-checks/ is fine.
const CHECK_NPM_CI_DRY: HealthCheck = {
    name: 'npm-ci-dry',
    // "--optimize-for-change" runs this only when the lockfile or package.json is staged.
    changeDependencies: [
        'package-lock.json',
        'package.json'
    ],
    cmd: 'npm',
    args: ['ci', '--dry-run'],
    env: {
        // HUSKY=0 stops the dry-run's "prepare" script (husky) from re-running on every check: it avoids
        // husky reinstalling git hooks during what should be a read-only validation.
        HUSKY: '0'
    },
    errorMsg: "'$ npm ci --dry-run' failed (package.json / package-lock.json may be out of sync)"
};

// Warns/fails when the installed top-level node_modules versions have drifted from package.json. Overlaps
// npm-ci-dry (which gates lockfile<->package.json sync); this one targets the actually-installed tree.
const CHECK_NPM_INSTALL: HealthCheck = {
    name: 'npm-install',
    cmd: './checks/check-npm-install-status.ts',
    errorMsg: 'We might need to run npm install'
};

// The checks below reuse existing package.json scripts. "node --run" resolves the repo-root package.json and
// runs the script from the repo root, so they work regardless of this orchestrator's cwd.
const CHECK_PKG_JSON_SYNC: HealthCheck = {
    name: 'pkg-json-sync',
    cmd: 'node',
    args: ['--run', 'test:compare-package-json-with-source'],
    errorMsg: 'package.json is out of sync with package.json.ts (run "node --run housekeeping:generate-package-json")'
};

// Guards that package-version.json (the version fallback that package.json.ts falls back to) has not
// drifted from package.json.ts's "version". pkg-json-sync never inspects package-version.json, so
// this is a distinct check. See the header comment in package.json.ts.
const CHECK_PKG_VERSION_SYNC: HealthCheck = {
    name: 'pkg-version-sync',
    cmd: 'node',
    args: ['--run', 'test:compare-package-version-with-source'],
    errorMsg: 'package-version.json is out of sync with package.json.ts (run "node --run housekeeping:generate-package-json")'
};

// Lints the generated package.json and the files it points at for publish-time correctness
// (main/exports/files resolution) - publint. This branch ships a publishable manifest, so the
// check applies unconditionally (no private-flag guard). Reuses the "publint" npm script.
const CHECK_PUBLINT: HealthCheck = {
    name: 'publint',
    // "--optimize-for-change" runs this only when the manifest or the published/ignored file set
    // changes (publint validates what "npm pack" would include, which .npmignore also affects).
    changeDependencies: [
        '.npmignore',
        'index.js',
        'lib/',
        'package.json'
    ],
    cmd: 'node',
    args: ['--run', 'publint'],
    errorMsg: 'publint found package-publishing issues (main/exports/files). Run "node --run publint" for details.'
};

// Fast parse-check (via module.stripTypeScriptTypes) of every repo JS/TS file discovered by
// `git ls-files --cached --others --exclude-standard`, run before ESLint/Vitest so parse errors surface
// here rather than as confusing downstream failures.
const CHECK_SYNTAXLINT: HealthCheck = {
    name: 'syntaxlint',
    cmd: 'node',
    args: ['--run', 'syntaxlint'],
    errorMsg: 'Failure in syntax check of repo .cjs/.cts/.js/.mjs/.mts/.ts files'
};

// Full static type check (tsc, run via the "test:types" script as "tsc --pretty"; noEmit comes from
// tsconfig.json) of the .ts tooling and the shipped .js (config in tsconfig.json). Deeper than
// syntaxlint (parse-only) and ESLint (syntactic, non-type-aware): tsc resolves types across files.
// Fast and offline, so it always runs (no changeDependencies).
const CHECK_TYPES: HealthCheck = {
    name: 'types',
    cmd: 'node',
    args: ['--run', 'test:types'],
    errorMsg: 'Type check failed (tsc). Run "node --run test:types" for details.'
};

const CHECK_VITEST: HealthCheck = {
    name: 'vitest',
    // "--optimize-for-change" skips this check unless one of these staged paths changed (entries ending
    // in "/" are prefix-matched). Other change-aware checks declare their own dependency paths above.
    // Directories holding COLOCATED tests (see .claude/rules/testing.md) must be listed here too.
    changeDependencies: [
        'test/',
        'scripts/health-checks/helpers/eslint-rules/',
        'index.js',
        'lib/',
        'vitest.config.js',
        'package.json',
        'package-lock.json'
    ],
    cmd: 'node',
    args: ['--run', 'vitest'],
    errorMsg: 'Failure in running Vitest tests'
};

// The authoritative list of which checks the suite runs, and in what order. This array is the single
// source of truth for the check list and launch order, and each check is documented by the comment
// above its const - there is no separate prose copy to keep in sync.
const healthChecks: HealthCheck[] = [
    CHECK_NO_NPM_LINKS,
    CHECK_CLAUDE_SETTINGS_SORT,
    CHECK_NON_KEYBOARD_CHARACTERS,
    CHECK_DO_NOT_COMMIT,
    CHECK_STATUS_OF_FILES,
    CHECK_NODE_VERSION,
    CHECK_SYNTAXLINT,
    CHECK_NPM_INSTALL,
    CHECK_PKG_VERSION_SYNC,
    CHECK_PKG_JSON_SYNC,
    CHECK_LOCKFILE_LINT,
    CHECK_GIT_CONFLICT_MARKERS,
    CHECK_PUBLINT,
    CHECK_ESLINT_STAGED,
    CHECK_ESLINT_MARKDOWN,
    CHECK_KNIP,
    CHECK_VITEST,
    CHECK_NPM_CI_DRY,
    CHECK_ESLINT,
    CHECK_TYPES,
    CHECK_NPM_AUDIT_SIGNATURES
];

const getStagedPathsAsync = async function (): Promise<Set<string>> {
    const result = await execa('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRU'], {
        cwd: projectRoot,
        reject: false
    });
    const paths = new Set<string>();
    const stdoutLines = (result.stdout || '').split('\n');
    for (const line of stdoutLines) {
        const trimmed = line.trim();
        if (trimmed) {
            paths.add(trimmed);
        }
    }
    return paths;
};

// For "--optimize-for-change": drop any check whose "changeDependencies" match none of the staged
// paths. Checks without "changeDependencies" always run.
const getOptimizedHealthChecksAsync = async function (checks: HealthCheck[]): Promise<HealthCheck[]> {
    const stagedPaths = await getStagedPathsAsync();

    return checks.filter((check) => {
        if (!check.changeDependencies) {
            return true;
        }

        const flagHasRelevantChanges = check.changeDependencies.some((dep) => {
            if (dep.endsWith('/')) {
                return [...stagedPaths].some((p) => p.startsWith(dep));
            }
            return stagedPaths.has(dep);
        });

        if (!flagHasRelevantChanges) {
            console.log(chalk.yellow(`Skipping "${check.name}" (no staged changes matching: ${check.changeDependencies.join(', ')})`));
            return false;
        }
        return true;
    });
};

const notifyFailure = function () {
    notifier.notify({
        title: 'Something is wrong',
        message: '\n \n:-(\n \nPlease check'
    });
};

// Format an ISO timestamp (as stored in cache entries) as a simplified LOCAL date-time, e.g.
// "2026-06-13 05:26:36", for human-friendly cache-hit logging.
const formatLocalTimestamp = function (isoTimestamp: string): string {
    const date = new Date(isoTimestamp);
    const pad = function (value: number): string {
        return String(value).padStart(2, '0');
    };
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// The runners report the overall result AND which checks passed (the per-check cache records every
// individual pass, even on a failing run). Exit / notification / cache handling is done by the caller.
interface RunResult {
    flagAllPassed: boolean;
    passedChecks: HealthCheck[]
}

const runSequentiallyAsync = async function (checks: HealthCheck[]): Promise<RunResult> {
    console.log('Running health checks sequentially ...');

    const results: { check: HealthCheck; exitCode: number }[] = [];

    for (const check of checks) {
        const label = [check.cmd, ...(check.args ?? [])].join(' ');
        console.log(chalk.blue(`\n$ ${label}`));

        const result = await execa(check.cmd, check.args, {
            cwd: healthChecksDir,
            env: check.env,
            reject: false,
            stdio: 'inherit'
        });
        results.push({ check, exitCode: result.exitCode ?? 1 });
    }

    const passedChecks = results.filter((r) => r.exitCode === 0).map((r) => r.check);
    const flagAllPassed = passedChecks.length === results.length;
    if (flagAllPassed) {
        console.log(chalk.green('\nSuccess: All is well :-)'));
    } else {
        for (const r of results) {
            if (r.exitCode !== 0) {
                console.log(chalk.red(`\nError: ${r.check.errorMsg}`));
            }
        }
        console.log('');
    }
    return { flagAllPassed, passedChecks };
};

// concurrently spawns each command via "/bin/sh -c", so collapse the structured cmd/args into one
// shell line. quote() escapes spaces and shell metacharacters so the tokens survive the shell intact.
// (Keep args shell-safe; do not pass untrusted input here.)
const toShellCommand = function (check: HealthCheck): string {
    return quote([check.cmd, ...(check.args ?? [])]);
};

// concurrently emits the {name} prefix token verbatim (its built-in prefixLength shortening applies
// only to the {command} token), so cap the displayed name ourselves to keep the prefix column compact.
// Names longer than the cap are end-truncated with "..." (kept within the cap) to signal truncation.
// Names are then right-padded to the cap so the closing "]" aligns into a fixed-width column (the
// padding lands inside the brackets; concurrently's own padPrefix would instead pad after the "]").
const MAX_PREFIX_NAME_LENGTH = 16;
const shortenPrefixName = function (name: string): string {
    const capped = name.length <= MAX_PREFIX_NAME_LENGTH ? name : name.slice(0, MAX_PREFIX_NAME_LENGTH - 3) + '...';
    return capped.padEnd(MAX_PREFIX_NAME_LENGTH);
};

const runConcurrentlyAsync = async function (checks: HealthCheck[]): Promise<RunResult> {
    console.log('Running health checks concurrently ...');

    // NOTE: concurrently expands `npm:`/`node:`-style shortcut commands (and wildcards) into multiple
    // entries, which would break the close-event index <-> checks mapping below. toShellCommand never
    // emits that syntax (a space always follows the binary), so the indices stay 1:1 with `checks`.
    const commands = checks.map((check) => ({
        command: toShellCommand(check),
        env: check.env,
        name: shortenPrefixName(check.name)
    }));

    const { result } = concurrently(commands, {
        cwd: healthChecksDir,
        group: true,
        // We pad the {name} token ourselves (shortenPrefixName) so the padding stays inside the
        // brackets; concurrently's padPrefix would instead pad the whole prefix after the "]".
        padPrefix: false,
        // Timestamped log view: prefix each line with the time and the check name. We use the
        // readable check name ({name}) rather than the default {index}, since every check is named.
        prefix: '[{time}] [{name}]',
        timestampFormat: 'HH:mm:ss.SSS'
    });

    try {
        await result;
        console.log(chalk.green('\nSuccess: All is well :-)'));
        return { flagAllPassed: true, passedChecks: checks };
    } catch (closeEvents: unknown) {
        // concurrently rejects with an array of close events (for ALL spawned commands) on a failed
        // run. The events arrive sorted by exit time and carry the truncated prefix name, so the only
        // safe mapping back to a check is evt.index (assigned in input order). Guard against a
        // non-array rejection (e.g. an internal error / spawn-setup failure) so we surface it
        // instead of throwing "events is not iterable" and masking the real failure.
        const passedChecks: HealthCheck[] = [];
        if (Array.isArray(closeEvents)) {
            const events = closeEvents as { exitCode: number | string; index: number }[];
            for (const evt of events) {
                if (evt.exitCode === 0) {
                    // Defensive index guard (out of range would yield undefined).
                    const check = checks[evt.index];
                    if (check) {
                        passedChecks.push(check);
                    }
                } else {
                    // Fall back to the index if a check cannot be resolved (defensive: index out of range).
                    console.log(chalk.red(`Error: ${checks[evt.index]?.errorMsg ?? `check #${evt.index} failed`}`));
                }
            }
        } else {
            console.log(chalk.red('Error: the concurrent health-check run failed unexpectedly:'));
            console.log(closeEvents);
        }
        console.log('');
        return { flagAllPassed: false, passedChecks };
    }
};

// concurrently registers its own SIGINT handling; without our own handler Ctrl+C can leave the
// parent reporting success with exit 0 even when child commands were killed mid-flight.
process.on('SIGINT', function () {
    console.log(chalk.red('\nInterrupted (SIGINT)'));
    process.exit(130);
});

const args = new Set(process.argv.slice(2));
const flagNoCache = args.has('--no-cache');
const flagOptimizeForChange = args.has('--optimize-for-change');
const flagSequentially = args.has('--sequentially');

// Layered config (see the "Configuration" note in the header comment): the git-ignored local file
// wins over the committed base; with neither present an empty config applies.
const config = await loadConfigAsync();

// Fail loudly on config keys that match no check: a typo (e.g. "vittest") must not silently disable
// nothing. Validated against the FULL check list and before any cache logic, so a typo'd config can
// never no-op via a cached exit.
const unknownConfigCheckNames = getUnknownConfigCheckNames({ checks: healthChecks, config });
if (unknownConfigCheckNames.length > 0) {
    console.log(chalk.red(`Error: the all-is-well config names unknown check(s): ${unknownConfigCheckNames.join(', ')}`));
    console.log(chalk.red(`Valid check names: ${healthChecks.map((check) => check.name).join(', ')}`));
    process.exit(1);
}

const flagRunSequentially = flagSequentially || Boolean(config.runSequentially);

const configFilteredChecks = getConfigFilteredChecks({
    checks: healthChecks,
    config,
    isCi: Boolean(process.env.CI)
});

const optimizedChecks = flagOptimizeForChange ?
    await getOptimizedHealthChecksAsync(configFilteredChecks) :
    configFilteredChecks;

const checks = getChecksWithConfigEnv({ checks: optimizedChecks, config });

// Edge: everything got disabled/skipped. Exit before the runners (concurrently([]) is an error
// path, and a vacuous "pass" must not write a cache entry).
if (checks.length === 0) {
    console.log(chalk.yellow('No health checks left to run (all disabled by config or skipped); nothing to do.'));
    process.exit(0);
}

// Result cache (see the "Result cache" note in the header comment, and ./checksExecutionCaching/).
// One entry per check x git content state (namespace 'checks'): each cache-enabled check is looked
// up - and later written - individually, so partial runs seed the cache and later runs skip exactly
// what already passed.
const CACHE_NAMESPACE = 'checks';
const flagCacheEnabled = !flagNoCache && !isCacheDisabledByEnv() && !config.disableCache;

let checksToRun = checks;
let cacheGitContentHash: string | null = null;
let cacheHeadSha: string | null = null;
// Keys of the cache-enabled checks that MISSED, kept to record their passes after the run.
// (Config-cache-disabled checks never appear here, so they are never looked up or written.)
const pendingCacheKeyByCheckName = new Map<string, string>();
if (flagCacheEnabled) {
    const { cacheEnabledChecks } = partitionChecksByCacheability({ checks, config });
    // With an empty cache-enabled subset there is nothing to look up or record - skip the git
    // hashing work entirely.
    if (cacheEnabledChecks.length > 0) {
        const gitContentState = await computeGitContentHashAsync({ projectRoot });
        if (gitContentState) {
            cacheGitContentHash = gitContentState.gitContentHash;
            cacheHeadSha = gitContentState.headSha;
            // Short prefix of the content hash, which is also the cache folder name
            // (.cache/checks-executions/checks/<gitContentHash>/), so the log points at the folder.
            const shortContentHash = cacheGitContentHash.slice(0, 12);
            const cachedCheckNames = new Set<string>();
            for (const check of cacheEnabledChecks) {
                const cacheKey = computeCacheKey({ name: check.name, signature: buildCheckCacheSignature({ check }) });
                const cachedEntry = readCacheEntry({ cacheKey, namespace: CACHE_NAMESPACE, partition: cacheGitContentHash, projectRoot });
                if (cachedEntry) {
                    cachedCheckNames.add(check.name);
                    console.log(chalk.yellow(`Cached: Check passed for this git content state (${shortContentHash}) at ${formatLocalTimestamp(cachedEntry.passedAt)}: Skipping "${check.name}"`));
                } else {
                    pendingCacheKeyByCheckName.set(check.name, cacheKey);
                }
            }
            if (cachedCheckNames.size > 0) {
                console.log(chalk.yellow('To force a full run: HEALTHCHECKS_NO_CACHE=1 node --run test (or: node --run all-is-well -- --no-cache).'));
                // Filter the original list so the launch order is preserved (config-cache-disabled
                // checks and cache misses run; cache hits are skipped).
                checksToRun = checks.filter((check) => !cachedCheckNames.has(check.name));
            }
        } else {
            console.log(chalk.yellow('Note: could not compute git content hash; running health checks without cache.'));
        }
    }
}

// Everything was served from the cache (only possible when no check is config-cache-disabled).
if (checksToRun.length === 0) {
    console.log(chalk.green('\nSuccess: All is well :-) (cached)\n'));
    process.exit(0);
}

const { flagAllPassed, passedChecks } = flagRunSequentially ?
    await runSequentiallyAsync(checksToRun) :
    await runConcurrentlyAsync(checksToRun);

// Record every check that passed THIS run - even when the suite overall failed, each individual
// pass is valid for this content state (failed checks are never written, so they always re-run).
// Prune old entries once per run afterwards, not per write.
if (cacheGitContentHash && cacheHeadSha) {
    let flagWroteCacheEntries = false;
    for (const check of passedChecks) {
        const cacheKey = pendingCacheKeyByCheckName.get(check.name);
        if (!cacheKey) {
            continue;
        }
        writeCacheEntry({
            cacheKey,
            entry: {
                checkName: check.name,
                gitContentHash: cacheGitContentHash,
                headSha: cacheHeadSha,
                passedAt: new Date().toISOString()
            },
            namespace: CACHE_NAMESPACE,
            partition: cacheGitContentHash,
            projectRoot
        });
        flagWroteCacheEntries = true;
    }
    if (flagWroteCacheEntries) {
        pruneOldCacheEntries({ projectRoot });
    }
}

if (flagAllPassed) {
    process.exit(0);
} else {
    if (!config.disableNotifications) {
        notifyFailure();
    }
    process.exit(1);
}
