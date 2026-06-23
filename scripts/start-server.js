import { existsSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../backend/server.js';

import { notify } from './notifier.js';

// Under `node --watch` the process restarts on file changes with a stable parent pid (the watch supervisor). Use a
// per-session marker keyed by that parent pid so the browser opens and the notification fire only on the first run,
// not on every watch restart.
const isFirstRunOfSession = function () {
    const marker = path.join(tmpdir(), `truths-start-${process.ppid}.marker`);
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

// The server serves the built frontend from dist/. Under `npm start` the build runs concurrently, so wait for its
// output before listening (and opening the browser) to avoid serving a half-built dist/.
const waitForBuild = async function () {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            await access('dist/index.html');
            return;
        } catch {
            await delay(100);
        }
    }
};

await waitForBuild();

const firstRun = isFirstRunOfSession();

// startServer resolves once the server is listening (and the browser has been opened, when requested)
const { url } = await startServer({ open: firstRun });

if (firstRun) {
    notify('truths-server', `Running at ${url}`);
}
