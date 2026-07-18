import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import writeFileAtomic from 'write-file-atomic';

import { sendErrorResponse, sendSuccessResponse } from '../shared/sendResponse.js';
import { readSettingsAsync, SETTINGS_RELATIVE_PATH } from './settingsStore.js';

// Settings are a small object of UI preferences; this ceiling is far above any legitimate value but well under the
// 10 MB body limit, so a client cannot persist a huge blob that every subsequent GET then re-parses.
const MAX_SETTINGS_BYTES = 256 * 1024;

const createSettingsRouter = function ({ cwd }) {
    const router = Router();

    const settingsPath = path.resolve(cwd, SETTINGS_RELATIVE_PATH);

    // The tolerant read (missing/corrupt file -> {}) lives in settingsStore.js, shared with the competition judge's
    // template lookup, so "no settings yet" means the same thing everywhere.
    router.get('/settings', async function (request, response) {
        return sendSuccessResponse(response, { settings: await readSettingsAsync(cwd) });
    });

    router.put('/settings', async function (request, response) {
        const { settings } = request.body || {};
        if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
            return sendErrorResponse(response, 400, 'Expected a "settings" object');
        }

        // Serialize once (reused for the write) so the size check reflects exactly what lands on disk and is re-parsed
        // on every GET; reject an over-large blob before writing it.
        const serialized = JSON.stringify(settings, null, 4);
        if (Buffer.byteLength(serialized, 'utf8') > MAX_SETTINGS_BYTES) {
            return sendErrorResponse(response, 413, 'Settings are too large to save');
        }

        try {
            await mkdir(path.dirname(settingsPath), { recursive: true });
            // Atomic replace, like the file save route: a crash mid-write must not leave a truncated settings file.
            await writeFileAtomic(settingsPath, `${serialized}\n`, { encoding: 'utf8' });
            return sendSuccessResponse(response, {});
        } catch (error) {
            console.error('Failed to save settings:', error);
            return sendErrorResponse(response, 500, 'Unable to save settings');
        }
    });

    return router;
};

export { createSettingsRouter };
