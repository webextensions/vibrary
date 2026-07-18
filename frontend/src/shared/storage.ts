// The one home for the guarded-localStorage idiom (previously re-derived per file): localStorage can throw when
// blocked (private mode, storage policies), so every access is guarded - a failed or absent read yields the fallback
// and a failed write is ignored, meaning the preference simply does not persist in that session. Keys use the
// 'vibrary:' namespace by convention. `parse` runs inside the guard, so a parser that throws (e.g. JSON.parse on a
// corrupted value) or returns null also lands on the fallback.
const readStored = function <T>(key: string, parse: (raw: string) => T | null, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) {
            return fallback;
        }
        return parse(raw) ?? fallback;
    } catch {
        return fallback;
    }
};

const writeStored = function (key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore: storage blocked or full means we just do not persist this preference.
    }
};

// The shared boolean encoding (String(flag) on write), so each new preference does not re-derive it: pair with a
// `true` fallback for default-on preferences and `false` for default-off ones.
const isStoredTrue = function (raw: string): boolean {
    return raw === 'true';
};

export { isStoredTrue, readStored, writeStored };
