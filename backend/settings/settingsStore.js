import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Per-project UI preferences (remembered task options, notification toggles, the competition judge's prompt
// template) persisted to a single machine-local file in the served folder. The ".local" suffix marks it as
// uncommitted (see .gitignore). The server serves exactly one folder, so this file is inherently per-project - no
// client-side keying is needed.
const SETTINGS_RELATIVE_PATH = path.join('.vibrary', 'settings.local.json');

// Read the settings object. A missing or unreadable/corrupt file is treated as "no settings yet" rather than an
// error, so every consumer (the GET route, the competition judge's template lookup) always has a usable object to
// fall back on its own defaults. Only a missing file (first run) is silent, though: a corrupt or permission-blocked
// file is logged, because the next save overwrites it - without a trace here, "my settings keep resetting" is
// undiagnosable from the server output.
const readSettingsAsync = async function (cwd) {
    const settingsPath = path.resolve(cwd, SETTINGS_RELATIVE_PATH);
    try {
        return JSON.parse(await readFile(settingsPath, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Failed to read settings from ${settingsPath}:`, error);
        }
        return {};
    }
};

export { readSettingsAsync, SETTINGS_RELATIVE_PATH };
