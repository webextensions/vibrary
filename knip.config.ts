import type { KnipConfig } from 'knip';

// Knip discovers entry points through its package.json, npm-scripts, and husky plugins (main/bin/exports,
// package.json scripts, and .husky/* hooks), so almost no extra `entry` paths are needed.
const config: KnipConfig = {
    // Intentional fill-in slots for forks, mostly empty because knip auto-discovers entries (see the
    // comment above). Populate these only when a fork needs to add entry points, ignore files/exports,
    // or mark a dependency as intentionally unused.
    entry: [
        // package-cjson loads package.json.ts to generate package.json (knip has no plugin for it,
        // and nothing imports the file - "main"/"exports" anchor index.js, not this source file).
        'package.json.ts',
        // Never imported by anything (users copy it to the git-ignored all-is-well.config.local.ts).
        // Registering it as an entry keeps knip from flagging the file, the base config it imports
        // (otherwise reached only via a dynamic variable import knip cannot trace, in
        // scripts/health-checks/allIsWellConfig/loadConfig.ts), and the `extend` / `@types/extend`
        // dependencies as unused.
        'scripts/health-checks/all-is-well.config.local.example.ts',
        // Invoked only via its all-is-well cmd string (the "prepack-strip" check), which knip
        // cannot trace (unlike sibling checks that .husky/post-checkout also invokes directly).
        'scripts/health-checks/checks/check-prepack-strips-install-scripts.ts'
    ],

    ignore: [
        // Machine-local all-is-well config (git-ignored, usually absent): loaded only via a dynamic
        // variable import knip cannot trace, so when present it would be flagged as an unused file.
        'scripts/health-checks/all-is-well.config.local.ts',
        // Desktop-notification helper kept for later use (e.g. hooks or scripts that want to
        // notify); currently has no importer, so keep knip from flagging it.
        'utils/notifier/**'
    ],

    ignoreDependencies: [
    ]
};

// eslint-disable-next-line import-x/no-default-export
export default config;
