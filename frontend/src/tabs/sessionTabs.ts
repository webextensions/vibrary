// Remembers which tabs were open across reloads, scoped per served folder. localStorage is per-origin but the server can
// be launched from different folders on the same origin, so one key holds a map keyed by the folder's absolute path -
// each folder restores only its own tabs. Storage access goes through the shared readStored/writeStored guard.

import { readStored, writeStored } from '../shared/storage.ts';

const SESSION_STORAGE_KEY = 'vibrary:open-tabs';

// Bound how many folders' tab sessions are remembered, so launching the server from many different project folders
// over time does not grow this map unboundedly - mirrors useOpenTabs.ts's CLOSED_TABS_LIMIT for the same reason.
const MAX_TRACKED_FOLDERS = 20;

type SessionRecord = { paths: string[]; activePath: string | null };

const isSessionRecord = function (value: unknown): value is SessionRecord {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    const hasValidPaths = Array.isArray(record.paths) && record.paths.every(function (entry) {
        return typeof entry === 'string';
    });
    const hasValidActive = record.activePath === null || typeof record.activePath === 'string';
    return hasValidPaths && hasValidActive;
};

// readStored runs the parser inside its guard, so a corrupted stored value (JSON.parse throwing) lands on the empty
// map rather than escaping to callers.
const readMap = function (): Record<string, unknown> {
    return readStored<Record<string, unknown>>(SESSION_STORAGE_KEY, function (raw) {
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    }, {});
};

const readSessionTabs = function (cwd: string): SessionRecord | null {
    const record = readMap()[cwd];
    return isSessionRecord(record) ? record : null;
};

const writeSessionTabs = function (cwd: string, record: SessionRecord): void {
    // Read-modify-write so other folders' records are preserved. Delete-then-reinsert moves this folder to the
    // most-recently-written end of the object's key order (plain string keys iterate in insertion order), so the
    // eviction below - trimming from the front once over the cap - drops the actual least-recently-used folders.
    const map = readMap();
    delete map[cwd];
    map[cwd] = record;
    const keys = Object.keys(map);
    // A negative `end` on slice() counts from the array's end, not "clamp to zero" - so this must be floored
    // explicitly, or a keys.length still under the cap would evict from the front instead of evicting nothing.
    const staleKeys = keys.slice(0, Math.max(0, keys.length - MAX_TRACKED_FOLDERS));
    for (const staleKey of staleKeys) {
        delete map[staleKey];
    }
    writeStored(SESSION_STORAGE_KEY, JSON.stringify(map));
};

export { type SessionRecord, readSessionTabs, writeSessionTabs };
