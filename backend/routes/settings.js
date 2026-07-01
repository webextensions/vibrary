import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';

import { sendErrorResponse, sendSuccessResponse } from '../utils/sendResponse.js';

// Per-project UI preferences (remembered task options, activity-start notification toggles) persisted to a single
// machine-local file in the served folder. The ".local" suffix marks it as uncommitted (see .gitignore). The server
// serves exactly one folder, so this file is inherently per-project - no client-side keying is needed.
const SETTINGS_RELATIVE_PATH = path.join('.vibrary', 'settings.local.json');

const createSettingsRouter = function ({ cwd }) {
    const router = Router();

    const settingsPath = path.resolve(cwd, SETTINGS_RELATIVE_PATH);

    // A missing or unreadable/corrupt file is treated as "no settings yet" rather than an error, so the UI always has a
    // usable (empty) object to fall back on its own defaults.
    router.get('/settings', async function (request, response) {
        try {
            const content = await readFile(settingsPath, 'utf8');
            return sendSuccessResponse(response, { settings: JSON.parse(content) });
        } catch {
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
            await writeFile(settingsPath, `${JSON.stringify(settings, null, 4)}\n`, 'utf8');
            return sendSuccessResponse(response, {});
        } catch (error) {
            console.error('Failed to save settings:', error);
            return sendErrorResponse(response, 500, 'Unable to save settings');
        }
    });

    return router;
};

export { createSettingsRouter };
