#!/usr/bin/env node

import { startServer } from '../backend/server.js';

// Shortcut for `vibrary server` with default options (port 3000, auto-advance, open browser)
try {
    await startServer();
} catch (error) {
    // A startup failure (bad bind address, no listenable port) should read as one clear line, not a raw stack.
    console.error(`vibrary-server failed to start: ${error.message}`);
    process.exitCode = 1;
}
