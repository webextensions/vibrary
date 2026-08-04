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
// Dependency declaration format: npm's three fields ("dependencies" / "devDependencies" /
// "peerDependencies") are too coarse for the template-branch family - the same package lands in
// different npm fields on different branches (e.g. react: "dependencies" on a web app,
// "peerDependencies" on a React component package, "devDependencies" where it only powers a demo).
// So dependencies are declared in semantic category objects (dependenciesFor*), named by the
// SUBSYSTEM that imports them - never by the npm field they land in, which is branch-relative -
// so a package's category is identical on every branch and template merges stay conflict-free;
// the branch-owned dependencyCategoriesMapping decides which npm field each category lands in.
// Each category also has a {category}_overrides object; they merge into the final "overrides".
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

import { createDependencyCollectors } from './utils/package-json-utils/package-json-utils.ts';

// Prefer the version from package.json; fall back to package-version.json if package.json cannot be
// imported (absent / not yet generated - see header). Top-level await resolves "version" before the
// default export object is built; package-cjson awaits this module, then reads its default export.
let version: string;
try {
    version = (await import('./package.json', { with: { type: 'json' } })).default.version;
} catch {
    version = (await import('./package-version.json', { with: { type: 'json' } })).default.version;
}

const core = {
    "name": "vibrary",
    version, // Owned by npm (see header); derived from package.json / package-version.json, never hard-coded
    "description": "Vibe-coding assistant",
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

    "homepage": "https://github.com/webextensions/vibrary#readme",
    "repository": {
        "type": "git",
        "url": "git+https://github.com/webextensions/vibrary.git"
    },
    "bugs": {
        "url": "https://github.com/webextensions/vibrary/issues"
    },

    "keywords": [
        "ai",
        "assistant",
        "cli",
        "vibe-coding",
        "vibrary"
    ],

    // Node floor advertised via "engines.node" (what npm shows/enforces for consumers when the
    // manifest is published). Each branch sets its own value - see the inline note on the value
    // line. The dev/tooling floor is separate and unaffected by this value: developing and
    // running the checks needs the pinned Node in .nvmrc (see also .github/workflows/ci.yml and
    // docs/init/CUSTOMIZE/CUSTOMIZE-package-json.md).
    "engines": {
        "node": ">=22.12.0" // commander@^15 needs >=22.12.0 (require(esm)); also a maintained LTS line
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
        "vibrary": "./cli.js" // CLI entry point
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
    ]
};

// Runtime dependencies of the project/package itself - what its own shipped/runnable code
// imports.
const dependenciesForPackage = {
    /* Begin: Project originated "dependenciesForPackage" */

    // No project originated "dependenciesForPackage" yet

    /* End: Project originated "dependenciesForPackage" */

    /* Begin: Template originated "dependenciesForPackage" */

    "commander": "^15.0.0" // CLI argument parsing (see cli.js); remove if your package has no CLI

    /* End: Template originated "dependenciesForPackage" */
};

const dependenciesForPackage_overrides = {
    /* Begin: Project originated "dependenciesForPackage_overrides" */

    // No project originated "dependenciesForPackage_overrides" yet

    /* End: Project originated "dependenciesForPackage_overrides" */

    /* Begin: Template originated "dependenciesForPackage_overrides" */

    // No template originated "dependenciesForPackage_overrides" yet

    /* End: Template originated "dependenciesForPackage_overrides" */
};

// Dependencies imported by the frontend app (empty on this base branch - the branches carrying a
// frontend populate it). dependencyCategoriesMapping below decides the npm field: "dependencies"
// on branches that DEPLOY the app, "devDependencies" where the app is only a development/demo
// harness - the membership stays identical either way.
const dependenciesForApp = {
    /* Begin: Project originated "dependenciesForApp" */

    // No project originated "dependenciesForApp" yet

    /* End: Project originated "dependenciesForApp" */

    /* Begin: Template originated "dependenciesForApp" */

    // No template originated "dependenciesForApp" yet

    /* End: Template originated "dependenciesForApp" */
};

const dependenciesForApp_overrides = {
    /* Begin: Project originated "dependenciesForApp_overrides" */

    // No project originated "dependenciesForApp_overrides" yet

    /* End: Project originated "dependenciesForApp_overrides" */

    /* Begin: Template originated "dependenciesForApp_overrides" */

    // No template originated "dependenciesForApp_overrides" yet

    /* End: Template originated "dependenciesForApp_overrides" */
};

// Dependencies imported by the build toolchain, run locally and in CI (empty on this base branch
// - the branches carrying a build populate it).
const dependenciesForBuild = {
    /* Begin: Project originated "dependenciesForBuild" */

    // No project originated "dependenciesForBuild" yet

    /* End: Project originated "dependenciesForBuild" */

    /* Begin: Template originated "dependenciesForBuild" */

    // No template originated "dependenciesForBuild" yet

    /* End: Template originated "dependenciesForBuild" */
};

const dependenciesForBuild_overrides = {
    /* Begin: Project originated "dependenciesForBuild_overrides" */

    // No project originated "dependenciesForBuild_overrides" yet

    /* End: Project originated "dependenciesForBuild_overrides" */

    /* Begin: Template originated "dependenciesForBuild_overrides" */

    // No template originated "dependenciesForBuild_overrides" yet

    /* End: Template originated "dependenciesForBuild_overrides" */
};

// Dependencies imported by the backend server (empty on this base branch - the branches carrying
// a server populate it). dependencyCategoriesMapping below decides the npm field: "dependencies"
// on branches that DEPLOY the server, "devDependencies" where it only serves development - the
// membership stays identical either way.
const dependenciesForServer = {
    /* Begin: Project originated "dependenciesForServer" */

    // No project originated "dependenciesForServer" yet

    /* End: Project originated "dependenciesForServer" */

    /* Begin: Template originated "dependenciesForServer" */

    // No template originated "dependenciesForServer" yet

    /* End: Template originated "dependenciesForServer" */
};

const dependenciesForServer_overrides = {
    /* Begin: Project originated "dependenciesForServer_overrides" */

    // No project originated "dependenciesForServer_overrides" yet

    /* End: Project originated "dependenciesForServer_overrides" */

    /* Begin: Template originated "dependenciesForServer_overrides" */

    // No template originated "dependenciesForServer_overrides" yet

    /* End: Template originated "dependenciesForServer_overrides" */
};

// Dependencies useful only in the local dev / CI setup: the lint, type-check, test, health-check,
// and release toolchain.
const dependenciesForDev = {
    /* Begin: Project originated "dependenciesForDev" */

    // No project originated "dependenciesForDev" yet

    /* End: Project originated "dependenciesForDev" */

    /* Begin: Template originated "dependenciesForDev" */

    "@eslint/js": "^10.0.1",
    "@eslint/markdown": "^8.0.3",
    "@stylistic/eslint-plugin": "^5.10.0",
    "@types/extend": "^3.0.4",
    "@types/node": "~24.13.3", // Pinned to 24.x to match the dev Node floor
    "@types/node-notifier": "^8.0.5",
    "@types/semver": "^7.7.1",
    "@webextensions/revisit": "^0.2.0", // Recurring-reminders tool run by the post-commit hook (see revisit.json)
    "auto-changelog": "^2.6.0",
    "boxen": "^8.0.1",
    "chalk": "^6.0.0",
    "concurrently": "^10.0.4",
    "del": "^8.0.1",
    "eslint": "^10.8.0",
    "eslint-config-ironplate": "^3.0.0", // The entries below marked "ironplate peer" are its required peerDependencies
    "eslint-plugin-import-newlines": "^2.0.0",
    "eslint-plugin-import-x": "^4.17.1", // ironplate peer
    "eslint-plugin-n": "^18.2.2", // ironplate peer
    "eslint-plugin-promise": "^7.3.0", // ironplate peer
    "eslint-plugin-simple-import-sort": "^14.0.0",
    "eslint-plugin-unicorn": "^72.0.0", // ironplate peer
    "execa": "^10.0.1",
    "extend": "^3.0.2",
    "globals": "^17.8.0",
    "husky": "^9.1.7",
    "knip": "^6.31.0",
    "lockfile-lint": "^5.0.0",
    "lodash-es": "^4.18.1",
    "node-notifier": "^10.0.1",
    "package-cjson": "^3.0.0",
    "publint": "^0.3.22",
    "semver": "^7.8.5",
    "shell-quote": "^1.10.0",
    "typescript": "~6.0.3", // Optional ironplate peer for its TypeScript configs
    "typescript-eslint": "^8.65.0", // Optional ironplate peer
    "vitest": "^4.1.10"

    /* End: Template originated "dependenciesForDev" */
};

const dependenciesForDev_overrides = {
    /* Begin: Project originated "dependenciesForDev_overrides" */

    // No project originated "dependenciesForDev_overrides" yet

    /* End: Project originated "dependenciesForDev_overrides" */

    /* Begin: Template originated "dependenciesForDev_overrides" */

    // No template originated "dependenciesForDev_overrides" yet

    /* End: Template originated "dependenciesForDev_overrides" */
};

// Peer dependencies - supplied by the consuming project, not installed for it (empty on this base
// branch, which publishes nothing - publishing branches declare their peer contracts here).
const dependenciesForPeer = {
    /* Begin: Project originated "dependenciesForPeer" */

    // No project originated "dependenciesForPeer" yet

    /* End: Project originated "dependenciesForPeer" */

    /* Begin: Template originated "dependenciesForPeer" */

    // No template originated "dependenciesForPeer" yet

    /* End: Template originated "dependenciesForPeer" */
};

const dependenciesForPeer_overrides = {
    /* Begin: Project originated "dependenciesForPeer_overrides" */

    // No project originated "dependenciesForPeer_overrides" yet

    /* End: Project originated "dependenciesForPeer_overrides" */

    /* Begin: Template originated "dependenciesForPeer_overrides" */

    // No template originated "dependenciesForPeer_overrides" yet

    /* End: Template originated "dependenciesForPeer_overrides" */
};

// Per-peer metadata ("peerDependenciesMeta") - only meaningful for packages listed in
// dependenciesForPeer. Emitted into the manifest only when non-empty. The main use case is
// marking a peer as optional so npm does not warn/install when the consumer omits it, e.g. on a
// widget branch whose script-tag/IIFE consumers do not need react:
//     "react": { "optional": true }
const dependenciesForPeer_meta = {
    /* Begin: Project originated "dependenciesForPeer_meta" */

    // No project originated "dependenciesForPeer_meta" yet

    /* End: Project originated "dependenciesForPeer_meta" */

    /* Begin: Template originated "dependenciesForPeer_meta" */

    // No template originated "dependenciesForPeer_meta" yet

    /* End: Template originated "dependenciesForPeer_meta" */
};

// The category order (here and throughout this file) is deliberate, not alphabetical:
// package -> app -> build -> server -> dev -> peer.
const dependencyCategories = {
    dependenciesForPackage,
    dependenciesForApp,
    dependenciesForBuild,
    dependenciesForServer,
    dependenciesForDev,
    dependenciesForPeer
};

// Category -> npm field mapping for THIS branch. This is the branch-owned knob: the categories are
// named by the subsystem that imports them, so other template branches keep the exact same
// category membership and change only this object (e.g. a web-app branch maps dependenciesForApp /
// dependenciesForServer to "dependencies" because it deploys the app).
const dependencyCategoriesMapping = {
    dependenciesForPackage: "dependencies",
    dependenciesForApp:     "devDependencies",
    dependenciesForBuild:   "devDependencies",
    dependenciesForServer:  "devDependencies",
    dependenciesForDev:     "devDependencies",
    dependenciesForPeer:    "peerDependencies"
} as const;

// The per-category override objects, in the same deliberate order as dependencyCategories.
const dependencyCategoriesOverrides = {
    dependenciesForPackage: dependenciesForPackage_overrides,
    dependenciesForApp: dependenciesForApp_overrides,
    dependenciesForBuild: dependenciesForBuild_overrides,
    dependenciesForServer: dependenciesForServer_overrides,
    dependenciesForDev: dependenciesForDev_overrides,
    dependenciesForPeer: dependenciesForPeer_overrides
};

// Validates the category declarations above (same category names across the three objects; every
// mapping value a real npm field; no conflicting duplicate package specs across categories; a
// package in only one {category}_overrides object) and returns the merge helpers - a violation
// throws here and fails the module load. See utils/package-json-utils/package-json-utils.ts for the
// exact rules.
const { collectDependenciesFor, collectOverrides } = createDependencyCollectors({
    dependencyCategories,
    dependencyCategoriesMapping,
    dependencyCategoriesOverrides
});

// Merged once each, so the "omitted while empty" spreads below can test them before emitting.
const mergedPeerDependencies = collectDependenciesFor('peerDependencies');
const mergedOverrides = collectOverrides();

const packageJson = {
    ...core,

    // The three npm fields are computed from the dependenciesFor* categories via
    // dependencyCategoriesMapping (see the declarations above). "dependencies" /
    // "devDependencies" are emitted even while empty (they are the slots a fork fills - see
    // docs/init/CUSTOMIZE/CUSTOMIZE-package-json.md); the peer / overrides fields below are
    // omitted instead, so a branch that declares none keeps them out of its manifest entirely.
    "dependencies": collectDependenciesFor('dependencies'),
    "devDependencies": collectDependenciesFor('devDependencies'),
    ...(Object.keys(mergedPeerDependencies).length > 0 && { "peerDependencies": mergedPeerDependencies }),
    // Peer metadata (see dependenciesForPeer_meta above)
    ...(Object.keys(dependenciesForPeer_meta).length > 0 && { "peerDependenciesMeta": dependenciesForPeer_meta }),

    // npm dependency overrides (applied to the whole install tree; root-only - they never affect
    // consumers of the published package). Merged from the per-category {category}_overrides
    // objects above; a package may appear in only one of them (enforced by
    // assertDependencyDeclarationsConsistent).
    ...(Object.keys(mergedOverrides).length > 0 && { "overrides": mergedOverrides }),

    "scripts": {
        // Fails any "npm install" early when the active Node does not satisfy .nvmrc.
        "preinstall": "./scripts/npm-run-scripts/preinstall.sh",

        // Installs the Git hooks in .husky/ on "npm install". "|| true" keeps installs working in
        // environments where husky is unavailable (e.g. CI with --omit=dev).
        "prepare": "husky || true",

        // One-shot workstation setup. "setup" is the umbrella - template branches / forks append
        // their own steps to it (database, certificates, ...). "setup:editor" (re)creates the
        // .vscode/soft-links/node symlink that .vscode/settings.json points "eslint.runtime" and the
        // integrated-terminal PATH at; re-run it after switching Node versions ("nvm use").
        // "setup:git-exclude" seeds this clone's .git/info/exclude (the secondary home, for
        // machine-local personal ignore patterns only - shared patterns live in the committed
        // .gitignore) from docs/template-project/git-info-exclude.example (idempotent, append-only).
        "setup": [
            "node --run setup:editor",
            "node --run setup:git-exclude"
        ].join(" && "),
        "setup:editor":      "./.vscode/soft-links/setup.sh",
        "setup:git-exclude": "./scripts/housekeeping/setup-git-info-exclude.sh",

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
        // scripts/health-checks/checks/status-of-files.config.ts (a fill-in slot, empty by default);
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

        // Deletes git-ignored build/tooling artifacts (dry-lists them first, then a 5 second
        // countdown). Exits 1 without deleting anything when it meets a git-ignored path that is
        // neither marked for keeping nor for deleting - see the file's header.
        "housekeeping:clean":                            "./scripts/housekeeping/clean.ts",

        // (Re)generates package.json (and package-version.json) from package.json.ts
        "housekeeping:generate-package-json":            "./scripts/housekeeping/generate-package-json.sh",

        // Bumps dependency versions in package.json.ts, then (re)generates package.json (and package-version.json)
        "housekeeping:update-and-generate-package-json": "./scripts/housekeeping/update-and-generate-package-json.sh",

        // (Re)creates node_modules + package-lock.json from scratch
        "housekeeping:update-package-lock-json":         "./scripts/housekeeping/update-package-lock-json.sh",

        // Read-only verify that every local "<branch>-flat" mirror branch still matches its source
        // branch (same tree, trailer at the source tip). See docs/template-project/flat-branches.md
        "branching:check-flat-branches": "./scripts/branching/check-flat-branches.ts",

        // Appends the source branch's new first-parent commits onto its append-only, tree-identical
        // "<source>-flat" mirror branch (local refs only - never fetches or pushes).
        // See docs/template-project/flat-branches.md
        "branching:flatten": "./scripts/branching/flatten-branch.sh",

        // Template-sync workflow (see docs/template-project/template-sync.md)

        // Merges the template branch into main, auto-resolving the expected package.json / package-lock.json
        // conflicts, then pushes. An AI run composed via extra args must bring its own consent flags, e.g.
        // `node --run template:merge-to-main -- --resolve-conflict-with-ai --allow-ai-commit --allow-ai-push`
        "template:merge-to-main":          "./scripts/branching/merge-source-to-target.sh --source template --target main --push",
        // Finds the newest template commit that merges cleanly and passes tests (local refs only - never fetches or pushes)
        "template:find-safe-merge-commit": "./scripts/branching/find-safe-template-merge-commit.sh",
        // Flattens every local template-* branch onto its existing "<branch>-flat" mirror via branching:flatten,
        // then verifies them; pass -- --create-branches to also create missing mirrors (local refs only -
        // never fetches or pushes)
        "template:flatten-branches":       "./scripts/branching/flatten-template-prefixed-branches.sh"
    }
};

export default packageJson;
