#!/usr/bin/env node

import { isSupportedNodeVersion } from '../backend/shared/assertNodeVersion.js';

// Gate on the Node version BEFORE importing the CLI, so an unsupported runtime gets one clear line rather than a
// cryptic crash from a missing API deep in a command. The rest of the app loads only once the check passes.
if (isSupportedNodeVersion()) {
    const { run } = await import('../backend/cli.js');
    run();
} else {
    process.exitCode = 1;
}
