// This file (package.json.ts) is the source of truth for package.json - with one exception: the
// package "version" is owned by npm. "npm version <patch|minor|major>" writes the new version into
// package.json, and we derive it back here so regenerating package.json preserves it. Do not
// hard-code "version" below.
//
// Version derivation (see the try/catch below): prefer ./package.json (the generated, npm-owned
// file). If it cannot be imported - e.g. it has not been generated yet, or is absent - fall back to
// ./package-version.json, a tiny committed (but never published) file that mirrors the version and is
// regenerated alongside package.json (by package-cjson's "generate-package-version-json" mode, wired
// into housekeeping:generate-package-json and the "npm version" release flow); the pkg-version-sync
// health check guards it against drift.
//
// Scope of the fallback: it covers an ABSENT / unimportable package.json, NOT a present-but-malformed
// one (e.g. carrying git conflict markers). Node reads the adjacent package.json to load THIS module
// in the first place, so a malformed package.json makes package.json.ts itself fail to load
// (ERR_INVALID_PACKAGE_CONFIG) before the try/catch can run.
//
// "package-cjson" detects this file and treats the default export below as the contents of "package.json".
// Loading requires Node.js >= 24.2.0 (for package-cjson@^3.0.0).
//
// Regenerate package.json after editing this file:
//     $ node --run housekeeping:generate-package-json
//
// Never hand-edit package.json directly; it is overwritten from this file.

/* eslint-disable @stylistic/no-multi-spaces */
/* eslint-disable @stylistic/quote-props */
/* eslint-disable @stylistic/quotes -- double-quoted strings below, to stay visually aligned with the generated package.json */
/* eslint-disable import-x/no-default-export */

// Prefer the version from package.json; fall back to package-version.json if package.json cannot be
// imported (absent / not yet generated - see header). Top-level await resolves "version" before the
// default export object is built; package-cjson awaits this module, then reads its default export.
let version: string;
try {
    version = (await import('./package.json', { with: { type: 'json' } })).default.version;
} catch {
    version = (await import('./package-version.json', { with: { type: 'json' } })).default.version;
}

const packageJson = {
    "name": "@webextensions/template-javascript-project",
    version, // Owned by npm (see header); derived from package.json / package-version.json, never hard-coded
    "description": "A template for creating npm packages (ESM exports + CLI) - ESLint, Vitest, health checks, publint, and a template-sync git branching workflow built in",
    "author": "webextensions.org",
    "license": "MIT",

    // This branch carries the publishable-manifest baseline for the npm-package template family:
    // no "private" flag, plus the publish fields ("publishConfig" here; "main" / "exports" /
    // "files" below). Non-published forks add "private": true back (see
    // docs/init/CUSTOMIZE/CUSTOMIZE-package-json.md). The "npm version" version/tag lifecycle
    // (see the scripts below) stays wired regardless.
    //
    // "access": "public" ensures scoped packages (e.g. "@webextensions/...") publish publicly.
    // Harmless for unscoped packages.
    "publishConfig": {
        "access": "public"
    },

    "homepage": "https://github.com/webextensions/template-javascript-project#readme",
    "repository": {
        "type": "git",
        "url": "git+https://github.com/webextensions/template-javascript-project.git"
    },
    "bugs": {
        "url": "https://github.com/webextensions/template-javascript-project/issues"
    },

    "keywords": [
        "boilerplate",
        "cli",
        "javascript",
        "npm",
        "package",
        "starter",
        "template"
    ],

    // Consumer-facing runtime floor: this branch publishes a manifest, so "engines.node" is what
    // npm shows/enforces for CONSUMERS of the package. On this abstract branch it stays at the
    // repo's own dev/tooling floor (>=24.2.0 - what package-cjson and the health-check scripts
    // need; see .nvmrc and .github/workflows/ci.yml). Publishing template branches / forks usually
    // LOWER it to their real consumer floor - but lowering it does not lower the tooling floor:
    // development and the checks still run on the dev floor. See
    // docs/init/CUSTOMIZE/CUSTOMIZE-package-json.md.
    "engines": {
        "node": ">=24.2.0"
    },

    "type": "module",

    // Publish fields for an ESM-exports library with a CLI: "bin" maps the command name to
    // cli.js (this branch's layer on top of -for-exports), and no "types" / "module" /
    // "sideEffects" (plain ESM package; add those only when a fork actually ships types / dual
    // builds / tree-shaking hints).
    "main": "index.js", // Library entry point (for tooling without "exports" support)
    "exports": {
        ".": "./index.js",
        "./lib/*": "./lib/*", // Lets consumers deep-import lib modules (e.g. ".../lib/template.js")
        "./package.json": "./package.json"
    },
    "bin": {
        "template-npm-package-for-exports-cli": "./cli.js" // CLI entry point (rename the key to your command name)
    },

    // Allowlist of files to publish (default-deny). "lib/" ships the core logic ("index.js" /
    // "cli.js" are the entry points - thin wrappers over it); the "!**/*.test.*" negation keeps
    // the colocated tests (any depth, any test extension) out of the tarball. npm always also includes package.json, README and LICENSE;
    // CHANGELOG.md is listed explicitly because npm does NOT auto-include it. If your package has
    // no CLI, drop "cli.js" here too. .npmignore is kept
    // as a redundant denylist; this allowlist is the primary control over the tarball contents.
    "files": [
        "index.js",
        "cli.js",
        "lib/",
        "!**/*.test.*",
        "CHANGELOG.md"
    ],

    "dependencies": {
        "commander": "^15.0.0" // CLI argument parsing (see cli.js); remove if your package has no CLI

        /* Begin: package specific "dependencies" */

        // TODO: Add package specific "dependencies" here

        /* End: package specific "dependencies" */
    },

    "devDependencies": {
        "@eslint/js": "^10.0.1",
        "@eslint/markdown": "^8.0.3", // Markdown language support for ESLint; used by eslint.markdown.config.js (the "eslint:markdown" script)
        "@stylistic/eslint-plugin": "^5.10.0", // TypeScript-aware formatting rules (indent/semi/quote-props/...) for eslint.config.js
        "@types/extend": "^3.0.4", // Types for extend (ships none)
        "@types/node": "~24.12.4", // Node ambient types for the tsc type check (import.meta.dirname, process, node:*, NodeJS.*); pinned to 24.x to match the dev Node floor
        "@types/node-notifier": "^8.0.5", // Types for node-notifier (ships none)
        "@types/semver": "^7.7.1", // Types for semver (ships none)
        "@webextensions/revisit": "^0.2.0", // Recurring-reminders tool run by the post-commit hook (see revisit.json)
        "auto-changelog": "^2.6.0", // Generates CHANGELOG.md from git history (see .auto-changelog); wired into "npm version"
        "boxen": "^8.0.1", // Boxes terminal output
        "chalk": "^5.6.2", // Terminal string styling (used by the health-check orchestrator)
        "concurrently": "^10.0.3", // Runs tasks in parallel
        "eslint": "^10.7.0",
        "eslint-config-ironplate": "^3.0.0", // Shared ESLint base config (see eslint.config.js); the eslint-plugin-* entries below marked "ironplate peer" are its required peerDependencies
        "eslint-plugin-import-newlines": "^2.0.0",
        "eslint-plugin-import-x": "^4.17.1", // ironplate peer: import-x/* rules (no-unresolved, extensions, exports-last, no-default-export, ...)
        "eslint-plugin-n": "^18.2.2", // ironplate peer: Node.js rules (n/*)
        "eslint-plugin-promise": "^7.3.0", // ironplate peer: Promise rules (promise/*)
        "eslint-plugin-simple-import-sort": "^13.0.0", // simple-import-sort/imports + /exports: deterministic import/export sorting
        "eslint-plugin-unicorn": "^71.1.0", // ironplate peer: unicorn/* rules
        "execa": "^9.6.1", // Spawns child processes for the sequential health-check run
        "extend": "^3.0.2", // Deep merge used by all-is-well.config.local.ts to layer overrides on the base health-check config
        "globals": "^17.7.0",
        "husky": "^9.1.7", // Git hooks (see .husky/); wired via the "prepare" script
        "knip": "^6.26.0", // Finds unused files / exports / dependencies (see knip.config.ts)
        "lockfile-lint": "^5.0.0", // Validates package-lock.json (registry hosts + HTTPS)
        "node-notifier": "^10.0.1", // Desktop notification when a health check fails
        "package-cjson": "^3.0.0", // Generates package.json from package.json.ts (see scripts "housekeeping:*")
        "publint": "^0.3.21", // Lints the package for publish-time correctness (main/exports/files resolution); wired as the "publint" health check
        "semver": "^7.8.5", // Semantic-version comparison used by the node-version and npm-install health checks
        "shell-quote": "^1.10.0", // Shell-safe quoting of some commands
        "typescript": "~6.0.3", // Powers the tsc type check (test:types); optional ironplate peer for its TypeScript configs
        "typescript-eslint": "^8.61.0", // Optional ironplate peer: bundles the TypeScript parser + plugin used by eslint-config-ironplate/node-typescript.js
        "vitest": "^4.1.10"
    },

    "scripts": {
        // Fails any "npm install" early when the active Node does not satisfy .nvmrc.
        "preinstall": "./scripts/npm-run-scripts/preinstall.sh",

        // Installs the Git hooks in .husky/ on "npm install". "|| true" keeps installs working in
        // environments where husky is unavailable (e.g. CI with --omit=dev).
        "prepare": "husky || true",

        // Runs the CLI (cli.js)
        "start": "node cli.js",

        "eslint": "eslint .",
        "eslint:fix": "eslint . --fix",

        // Lints only the staged files. Read-only verify - never auto-fixes / re-stages.
        // Delegates to a portable wrapper (scripts/health-checks/checks/eslint-staged-files.sh): it reads the
        // staged paths NUL-delimited and skips eslint when nothing is staged, replacing the GNU-only
        // "xargs -r" (which fails on macOS/BSD). The wrapper passes "--quiet" to hide the "File
        // ignored ..." warning ESLint emits for staged non-code files (README, JSON, etc.); ":fix"
        // is the manual auto-fix companion.
        "eslint:staged-files":     "./scripts/health-checks/checks/eslint-staged-files.sh",
        "eslint:staged-files:fix": "./scripts/health-checks/checks/eslint-staged-files.sh --fix",

        // Lints only the files changed in the working tree (staged + unstaged + untracked union),
        // via the sibling portable wrapper. The ":fix" variant is what the Stop hook
        // .claude/hooks/Stop/fix-lint-on-changed-files.sh runs at the end of every agent turn.
        "eslint:changed-files":     "./scripts/health-checks/checks/eslint-changed-files.sh",
        "eslint:changed-files:fix": "./scripts/health-checks/checks/eslint-changed-files.sh --fix",

        // Faster local re-runs via an on-disk cache. Prefer the plain "eslint" script for
        // authoritative checks: caching can hide issues from rules/plugins that do cross-file
        // analysis (e.g. verifying imported files/variables exist).
        "eslint:with-cache": "eslint . --cache --cache-location .cache/.eslintcache",

        // Validates that relative links/images in markdown files resolve to existing files or
        // directories (custom rule scripts/health-checks/helpers/eslint-rules/markdown-relative-links.js;
        // external URLs are ignored). Uses its own config so the main "eslint" run stays markdown-free.
        "eslint:markdown": "eslint --config eslint.markdown.config.js \"**/*.md\"",

        // Runs the test suite
        "vitest": "vitest run",

        // Fast parse-check (module.stripTypeScriptTypes) of every repo JS/TS file discovered by
        // `git ls-files --cached --others --exclude-standard` - catches syntax errors before ESLint/Vitest.
        "syntaxlint": "./scripts/health-checks/checks/check-syntax.ts",

        // Runs the full check suite via the all-is-well orchestrator (concurrently by default)
        "test": "node --run all-is-well",
        // Change-aware run for fast local iterations: skips Vitest, publint, npm-ci-dry, lockfile-lint,
        // npm-audit-signatures, and claude-settings-sort when none of each check's staged paths changed
        // (see changeDependencies in all-is-well.ts). npm-audit-signatures is also disabled on local runs by
        // all-is-well.config.ts, so locally it is skipped regardless. The match is over STAGED paths
        // (git diff --cached), so with an unstaged working tree all six are skipped - "git add" your
        // changes first. Not wired into any git hook - the hooks run the full "test".
        "test:optimize-for-change": "node --run all-is-well -- --optimize-for-change",
        "test:compare-package-json-with-source": "package-cjson --mode compare",
        // Guards that package-version.json (the version fallback) has not drifted from package.json.ts
        // (which derives "version" from package.json)
        "test:compare-package-version-with-source": "package-cjson --mode compare-package-version",
        // Validates package-lock.json (registry hosts + HTTPS)
        "test:lockfile": "lockfile-lint --path package-lock.json --type npm --validate-https --allowed-hosts npm --validate-package-names",

        // Full static type check of the .ts tooling and the shipped .js (config in tsconfig.json). Complements
        // "syntaxlint" (fast parse-only) and ESLint (syntactic, non-type-aware).
        "test:types": "tsc --pretty",

        // Lints the package for publish-time correctness (main/exports/files resolution); also run
        // as the "publint" check in all-is-well
        "publint": "publint",

        // Reports unused files / exports / dependencies
        "knip": "knip",

        // Full check suite
        "all-is-well": "./scripts/health-checks/all-is-well.ts", // Run the checks concurrently
        "all-is-well:sequentially": "node --run all-is-well -- --sequentially", // Run the checks sequentially (one at a time)

        // Ref: .claude/rules/non-keyboard-characters.md
        // Non-keyboard character guard (em dash, curly quotes, ellipsis, tick marks, etc.). Counts are
        // baselined per file in the "baseline" section of .block-non-keyboard-characters.suppressions.json
        // (project root); the same file's "exemptions" section lists files the tooling skips entirely

        // The plain form exits 1 on drift from that baseline
        "block-non-keyboard-characters":            "./scripts/health-checks/checks/block-non-keyboard-characters/block-characters.ts",
        // ":fix" auto-replaces the common characters in non-suppressed files
        "block-non-keyboard-characters:fix":        "./scripts/health-checks/checks/block-non-keyboard-characters/block-characters.ts --fix",
        // ":suppress" re-baselines (whole repo)
        "block-non-keyboard-characters:suppress":   "./scripts/health-checks/checks/block-non-keyboard-characters/block-characters.ts --suppress",

        // Read-only diagnostic: list every distinct character across the repo (with counts) so suspicious
        // chars that slip past the DETECTORS table can be spotted for manual review.
        // Skips the census-exempt files by default (e.g. characters.ts, which intentionally holds every
        // blocked glyph); pass --include-exempt to count everything.
        "block-non-keyboard-characters:detect-all": "./scripts/health-checks/checks/block-non-keyboard-characters/detect-all-characters.ts",

        // Verifies file status expectations (e.g. read-only paths) declared in
        // scripts/health-checks/checks/status-of-files.config.ts (empty fill-in slot on this base branch);
        // ":ensure" applies the remediations (chmod a-w).
        "status-of-files":        "./scripts/health-checks/checks/check-status-of-files.ts --return-exit-code",
        "status-of-files:ensure": "./scripts/health-checks/checks/ensure-status-of-files.ts",

        // Normalizes .claude/settings.json (and .claude/settings.local.json): recursively sorts every
        // object key (case-insensitive) and sorts + de-duplicates the permissions.allow / permissions.deny
        // arrays. ":fix" normalizes in place and is also run by the Stop hook
        // .claude/hooks/Stop/claude-settings-sort.sh.
        "claude-settings-sort":     "./scripts/health-checks/checks/claude-settings-sort.ts",
        "claude-settings-sort:fix": "./scripts/health-checks/checks/claude-settings-sort.ts --fix",

        // Runs only on "npm publish" (not on "npm pack" or "npm install"). Catches publishes that
        // skip "npm version" and its preversion hook.
        "prepublishOnly": "node --run test",

        // "npm version <patch|minor|major>" lifecycle. package.json.ts is the source of truth, so the
        // "version" step propagates the new version back into it and regenerates package.json.
        "preversion": "node --run test",
        "version": "./scripts/build-and-release/prepare-version.sh",

        // Runs after npm creates the version commit and tag: pushes both to the remote
        // ("--follow-tags"). NOTE: this is a network side effect - it fails offline / in sandboxed
        // CI and pushes before you get a chance to review the version commit. Remove this script to
        // keep releases local (see docs/development/releasing.md).
        "postversion": "git push --follow-tags",

        // Changelog generation (auto-changelog; config in .auto-changelog). CHANGELOG.md is regenerated
        // from git history automatically during "npm version" (by prepare-version.sh); these scripts are
        // for manual runs. "changelog" rewrites the file; "changelog:preview" prints pending commits.
        "changelog":         "auto-changelog",
        "changelog:preview": "auto-changelog --unreleased --stdout",

        // (Re)generates package.json (and package-version.json) from package.json.ts
        "housekeeping:generate-package-json":            "./scripts/housekeeping/generate-package-json.sh",

        // Bumps dependency versions in package.json.ts, then (re)generates package.json (and package-version.json)
        "housekeeping:update-and-generate-package-json": "./scripts/housekeeping/update-and-generate-package-json.sh",

        // (Re)creates node_modules + package-lock.json from scratch
        "housekeeping:update-package-lock-json":         "./scripts/housekeeping/update-package-lock-json.sh",

        // Template-sync workflow (see docs/template-project/template-sync.md)

        // Merges the template branch into main, auto-resolving the expected package.json / package-lock.json conflicts
        "template:merge-to-main":          "./scripts/branching/merge-template-to-main.sh",
        // Finds the newest template commit that merges cleanly and passes tests (local refs only - never fetches or pushes)
        "template:find-safe-merge-commit": "./scripts/branching/find-safe-template-merge-commit.sh"
    }
};

export default packageJson;
