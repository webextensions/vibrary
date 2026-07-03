import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { startServer } from '../backend/server.js';

import { notify } from './notifier.js';

// Under `node --watch` the process restarts on file changes with a stable parent pid (the watch supervisor). Use a
// per-session marker keyed by that parent pid so the browser opens and the notification fire only on the first run,
// not on every watch restart.
const isFirstRunOfSession = function () {
    const marker = path.join(tmpdir(), `vibrary-start-${process.ppid}.marker`);
    if (existsSync(marker)) {
        return false;
    }
    try {
        writeFileSync(marker, String(Date.now()));
    } catch {
        // If the marker cannot be written, treat this as a first run
    }
    return true;
};

// Session markers accumulate in the tmpdir (one per `node --watch` supervisor pid, and nothing else deletes them);
// sweep any older than a day on startup. Best-effort - a sweep failure must never block the server.
const sweepStaleMarkers = function () {
    try {
        for (const entry of readdirSync(tmpdir())) {
            if (!entry.startsWith('vibrary-start-') || !entry.endsWith('.marker')) {
                continue;
            }
            const markerPath = path.join(tmpdir(), entry);
            if (Date.now() - statSync(markerPath).mtimeMs > 24 * 60 * 60 * 1000) {
                rmSync(markerPath, { force: true });
            }
        }
    } catch {
        // Ignore: the sweep is housekeeping, not a precondition.
    }
};

// The server serves the built frontend from dist/. Under `npm start` the build runs concurrently, so wait for its
// completion marker before listening (and opening the browser): dist/index.html alone can be a leftover of the
// PREVIOUS build, so scripts/start-build.js touches dist/.build-complete only when a build finishes and clears it
// while one runs. Waiting cannot be unbounded (the build half may not be running at all), so after the deadline say
// so loudly instead of silently serving whatever dist/ holds - a blank page with a quiet terminal is undebuggable.
const waitForBuild = async function () {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            await access('dist/.build-complete');
            return;
        } catch {
            await delay(100);
        }
    }
    console.warn('dist/.build-complete not found after 10s; starting anyway (is "start:build" running?)');
};

const { values } = parseArgs({ options: { hmr: { type: 'boolean', default: false } } });

// With HMR, Vite serves the frontend in middleware mode, so there is no prebuilt dist/ to wait for
if (!values.hmr) {
    await waitForBuild();
}

const firstRun = isFirstRunOfSession();
sweepStaleMarkers();

// startServer resolves once the server is listening (and the browser has been opened, when requested)
const { url } = await startServer({ open: firstRun, hmr: values.hmr });

if (firstRun) {
    notify('vibrary-server', `Running at ${url}`);
}
