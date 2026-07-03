import { type ReactNode, useEffect, useRef, useState } from 'react';

import { type JobKind } from './activityQueue.ts';
import { getSettings, saveSettings } from './api.ts';
import { type FormData } from './components/taskOptions.ts';
import { type AppSettings, DEFAULT_NOTIFICATIONS, normalizeSettings } from './settings.ts';
import { SettingsContext } from './settingsContext.ts';

// Holds the per-project settings (activity-start notification toggles, remembered task options) loaded once from
// `.vibrary/settings.local.json` and written back on change. Writes are debounced so rjsf's per-keystroke onChange
// does not spam the endpoint; only the latest snapshot is ever sent.
const SAVE_DEBOUNCE_MS = 400;

const SettingsProvider = function ({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(function () {
        return normalizeSettings({});
    });
    const [loaded, setLoaded] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Mirrors `settings` for the mutators, which fold updates off the latest snapshot without re-reading async state.
    const latestReference = useRef<AppSettings>(settings);
    const saveTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The snapshot an armed debounce timer would save, so a pagehide/unmount can FLUSH it rather than discard it - a
    // toggle followed by a quick reload otherwise silently reverted despite the UI having shown it as applied.
    const pendingSaveReference = useRef<AppSettings | null>(null);

    useEffect(function () {
        let isCancelled = false;
        void (async function () {
            try {
                const normalized = normalizeSettings(await getSettings());
                if (!isCancelled) {
                    latestReference.current = normalized;
                    setSettings(normalized);
                }
            } catch (error) {
                console.error('[vibrary] failed to load settings; using defaults:', error);
            } finally {
                if (!isCancelled) {
                    setLoaded(true);
                }
            }
        })();
        return function () {
            isCancelled = true;
        };
    }, []);

    // Flush any pending debounced save at pagehide (reload/close - keepalive lets the request outlive the page) and
    // on unmount, instead of dropping it with the timer. Failures are swallowed: the page is going away, so there is
    // nowhere left to surface them.
    useEffect(function () {
        const flushPendingSave = function () {
            const snapshot = pendingSaveReference.current;
            if (snapshot === null) {
                return;
            }
            pendingSaveReference.current = null;
            if (saveTimerReference.current !== null) {
                clearTimeout(saveTimerReference.current);
                saveTimerReference.current = null;
            }
            void (async function () {
                try {
                    await saveSettings(snapshot, { keepalive: true });
                } catch {
                    // Intentionally ignored; see above.
                }
            })();
        };
        window.addEventListener('pagehide', flushPendingSave);
        return function () {
            window.removeEventListener('pagehide', flushPendingSave);
            flushPendingSave();
        };
    }, []);

    const persist = function (updater: (previous: AppSettings) => AppSettings) {
        const next = updater(latestReference.current);
        latestReference.current = next;
        setSettings(next);
        pendingSaveReference.current = next;
        if (saveTimerReference.current !== null) {
            clearTimeout(saveTimerReference.current);
        }
        saveTimerReference.current = setTimeout(function () {
            saveTimerReference.current = null;
            pendingSaveReference.current = null;
            void (async function () {
                try {
                    await saveSettings(next);
                    setSaveError(null);
                } catch (error) {
                    console.error('[vibrary] failed to save settings:', error);
                    setSaveError((error as Error).message);
                }
            })();
        }, SAVE_DEBOUNCE_MS);
    };

    const store = {
        loaded,
        isKindEnabled: function (kind: JobKind): boolean {
            return settings.notifications[kind];
        },
        setKindEnabled: function (kind: JobKind, isEnabled: boolean): void {
            persist(function (previous) {
                return { ...previous, notifications: { ...previous.notifications, [kind]: isEnabled } };
            });
        },
        resetNotifications: function (): void {
            persist(function (previous) {
                return { ...previous, notifications: { ...DEFAULT_NOTIFICATIONS } };
            });
        },
        getTaskOptions: function (reference: string): FormData | null {
            return settings.taskOptions[reference] ?? null;
        },
        setTaskOptions: function (reference: string, formData: FormData): void {
            persist(function (previous) {
                return { ...previous, taskOptions: { ...previous.taskOptions, [reference]: formData } };
            });
        },
        resetTaskOptions: function (reference: string): void {
            persist(function (previous) {
                const nextTaskOptions = { ...previous.taskOptions };
                delete nextTaskOptions[reference];
                return { ...previous, taskOptions: nextTaskOptions };
            });
        },
        hasStoredTaskOptions: Object.keys(settings.taskOptions).length > 0,
        resetAllTaskOptions: function (): void {
            persist(function (previous) {
                return { ...previous, taskOptions: {} };
            });
        },
        saveError
    };

    return <SettingsContext value={store}>{children}</SettingsContext>;
};

export { SettingsProvider };
