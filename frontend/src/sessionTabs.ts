// Remembers which tabs were open across reloads, scoped per served folder. localStorage is per-origin but the server can
// be launched from different folders on the same origin, so one key holds a map keyed by the folder's absolute path -
// each folder restores only its own tabs. All access is wrapped in try/catch since localStorage can be blocked.

const SESSION_STORAGE_KEY = 'truths:open-tabs';

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

const readMap = function (): Record<string, unknown> {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) {
        return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
};

const readSessionTabs = function (cwd: string): SessionRecord | null {
    try {
        const record = readMap()[cwd];
        return isSessionRecord(record) ? record : null;
    } catch {
        return null;
    }
};

const writeSessionTabs = function (cwd: string, record: SessionRecord): void {
    try {
        // Read-modify-write so other folders' records are preserved.
        const map = readMap();
        map[cwd] = record;
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Ignore: storage blocked or full means we just do not persist this session.
    }
};

export { type SessionRecord, readSessionTabs, writeSessionTabs };
