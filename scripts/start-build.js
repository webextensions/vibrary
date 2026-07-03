import { rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { build } from 'vite';

import { notify } from './notifier.js';

const { values } = parseArgs({ options: { watch: { type: 'boolean', default: false } } });

const configFile = 'frontend/vite.config.ts';

// The readiness signal scripts/start-server.js waits for. dist/index.html alone is not one: it can be a LEFTOVER of
// the previous build, so any second `npm start` would pass that check instantly while the fresh build still runs.
// The marker is cleared when a build starts and touched only when one completes.
const BUILD_MARKER = 'dist/.build-complete';

const clearMarker = function () {
    rmSync(BUILD_MARKER, { force: true });
};

const announce = function () {
    writeFileSync(BUILD_MARKER, String(Date.now()));
    console.log('Build complete');
    notify('vibrary', 'Build complete');
};

if (values.watch) {
    // In watch mode, build() resolves with a watcher; announce on each completed rebuild (and clear the marker while
    // one is in progress, so the server side never mistakes a mid-rebuild dist for a finished one)
    const watcher = await build({ configFile, build: { watch: {} } });
    watcher.on('event', function (watchEvent) {
        if (watchEvent.code === 'START') {
            clearMarker();
        } else if (watchEvent.code === 'END') {
            announce();
        }
    });
} else {
    clearMarker();
    await build({ configFile });
    announce();
}
