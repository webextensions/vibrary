import { createContext, use } from 'react';

import { type JobKind } from './activityQueue.ts';
import { type FormData } from './components/taskOptions.ts';

// Context and accessor for the per-project settings store. The stateful provider lives in SettingsProvider.tsx; kept
// separate (like activityQueue.ts) so each file exports one kind of thing and React Fast Refresh stays happy.

type SettingsStore = {
    // False until the settings file has been fetched once; consumers that seed state from it (e.g. task options) wait
    // for this before applying stored values.
    loaded: boolean;
    isKindEnabled: (kind: JobKind) => boolean;
    setKindEnabled: (kind: JobKind, isEnabled: boolean) => void;
    // Remembered options for a task's options form, keyed by its formSchemaRef; null when nothing is stored yet.
    getTaskOptions: (reference: string) => FormData | null;
    setTaskOptions: (reference: string, formData: FormData) => void;
    // Drop the stored options for a task so it falls back to the schema defaults again.
    resetTaskOptions: (reference: string) => void
};

const SettingsContext = createContext<SettingsStore | null>(null);

const useSettings = function (): SettingsStore {
    const value = use(SettingsContext);
    if (value === null) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return value;
};

export { SettingsContext, type SettingsStore, useSettings };
