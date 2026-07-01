import { type ReactNode, useEffect, useRef, useState } from 'react';

import { type JobKind } from './activityQueue.ts';
import { getSettings, saveSettings } from './api.ts';
import { type FormData } from './components/taskOptions.ts';
import { type AppSettings, normalizeSettings } from './settings.ts';
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
    // Mirrors `settings` for the mutators, which fold updates off the latest snapshot without re-reading async state.
    const latestReference = useRef<AppSettings>(settings);
    const saveTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                console.error(error);
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

    useEffect(function () {
        return function () {
            if (saveTimerReference.current !== null) {
                clearTimeout(saveTimerReference.current);
            }
        };
    }, []);

    const persist = function (updater: (previous: AppSettings) => AppSettings) {
        const next = updater(latestReference.current);
        latestReference.current = next;
        setSettings(next);
        if (saveTimerReference.current !== null) {
            clearTimeout(saveTimerReference.current);
        }
        saveTimerReference.current = setTimeout(function () {
            saveTimerReference.current = null;
            void saveSettings(next).catch(function (error) {
                console.error(error);
            });
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
        }
    };

    return <SettingsContext value={store}>{children}</SettingsContext>;
};

export { SettingsProvider };
