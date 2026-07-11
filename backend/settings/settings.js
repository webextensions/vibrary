import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import writeFileAtomic from 'write-file-atomic';

import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';

// Per-project UI preferences (remembered task options, activity-start notification toggles) persisted to a single
// machine-local file in the served folder. The ".local" suffix marks it as uncommitted (see .gitignore). The server
// serves exactly one folder, so this file is inherently per-project - no client-side keying is needed.
const SETTINGS_RELATIVE_PATH = path.join('.vibrary', 'settings.local.json');

const createSettingsRouter = function ({ cwd }) {
    const router = Router();

    const settingsPath = path.resolve(cwd, SETTINGS_RELATIVE_PATH);

    // A missing or unreadable/corrupt file is treated as "no settings yet" rather than an error, so the UI always has a
    // usable (empty) object to fall back on its own defaults. Only a missing file (first run) is silent, though: a
    // corrupt or permission-blocked file is logged, because the next save overwrites it - without a trace here, "my
    // settings keep resetting" is undiagnosable from the server output.
    router.get('/settings', async function (request, response) {
        try {
            const content = await readFile(settingsPath, 'utf8');
            return sendSuccessResponse(response, { settings: JSON.parse(content) });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Failed to read settings from ${settingsPath}:`, error);
            }
            return sendSuccessResponse(response, { settings: {} });
        }
    });

    router.put('/settings', async function (request, response) {
        const { settings } = request.body || {};
        if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
            return sendErrorResponse(response, 400, 'Expected a "settings" object');
        }

        try {
            await mkdir(path.dirname(settingsPath), { recursive: true });
            // Atomic replace, like the file save route: a crash mid-write must not leave a truncated settings file.
            await writeFileAtomic(settingsPath, `${JSON.stringify(settings, null, 4)}\n`, { encoding: 'utf8' });
            return sendSuccessResponse(response, {});
        } catch (error) {
            console.error('Failed to save settings:', error);
            return sendErrorResponse(response, 500, 'Unable to save settings');
        }
    });

    return router;
};

export { createSettingsRouter };
