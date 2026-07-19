import { createContext, use } from 'react';

import { type JobKind } from '../activity/activityQueue.ts';
import { type FormData } from '../editor/taskOptions.ts';
import { type PromptTemplate } from './settings.ts';

// Context and accessors for the per-project settings store. The stateful provider lives in SettingsProvider.tsx; kept
// separate (like activityQueue.ts) so each file exports one kind of thing and React Fast Refresh stays happy.
//
// Split into STATE and ACTIONS like the activity queue's context, and for the same reason: the hottest writer is
// rjsf's per-keystroke task-options onChange, and the widest consumers are per-card (every RunActionSection). The
// actions bundle is referentially stable for the provider's whole life, and the state bundle's identity deliberately
// EXCLUDES settings.taskOptions (its readers live in the actions bundle, off the provider's ref), so a keystroke in
// one card's options form re-renders no other card.

type SettingsState = {
    // False until the settings file has been fetched once; consumers that seed state from stored values (e.g. task
    // options) wait for this before applying them.
    loaded: boolean;
    isKindEnabled: (kind: JobKind) => boolean;
    // Whether any task has remembered options at all, so a "reset all" entry point can hide/disable itself when
    // there is nothing to reset.
    hasStoredTaskOptions: boolean;
    // The saved prompt-template library, in saved order. Lives in the STATE bundle (unlike taskOptions) because its
    // consumers are pickers that must re-render when the library changes - and it changes at management-UI cadence,
    // not per keystroke, so the re-render cost the taskOptions exclusion avoids does not arise here.
    promptTemplates: PromptTemplate[];
    // The debounced write-to-disk's error message, or null once a write has since succeeded (or none has failed yet).
    // Every other feature that persists user intent (SourceControlPanel's actions, ActivityQueue jobs) surfaces a
    // visible error on failure; a toggled notification preference or remembered task-options form should too, rather
    // than silently diverging from what is actually on disk.
    saveError: string | null
};

type SettingsActions = {
    setKindEnabled: (kind: JobKind, isEnabled: boolean) => void;
    // Restore every notification toggle to its DEFAULT_NOTIFICATIONS value, mirroring resetTaskOptions below.
    resetNotifications: () => void;
    // Remembered options for a task's options form, keyed by its formSchemaRef; null when nothing is stored yet.
    // Reads the provider's live ref (not React state), which is what lets it live in the stable bundle - callers use
    // it for one-time seeding gated on `loaded`, not as a subscription.
    getTaskOptions: (reference: string) => FormData | null;
    setTaskOptions: (reference: string, formData: FormData) => void;
    // Drop the stored options for a task so it falls back to the schema defaults again.
    resetTaskOptions: (reference: string) => void;
    // Drop every task's remembered options in one call, mirroring resetNotifications above.
    resetAllTaskOptions: () => void;
    // The AI competition judge's prompt template (empty = the built-in prompt). Read from the live ref like
    // getTaskOptions - callers seed a local editor from it once, gated on `loaded`, not as a subscription.
    getCompetitionPrompt: () => string;
    setCompetitionPrompt: (template: string) => void;
    // The saved prompt-template library. Save upserts by id (a fresh id appends, an existing one updates in place);
    // pickers subscribe through the STATE bundle's promptTemplates, these mutate.
    savePromptTemplate: (template: PromptTemplate) => void;
    deletePromptTemplate: (id: string) => void
};

const SettingsStateContext = createContext<SettingsState | null>(null);
const SettingsActionsContext = createContext<SettingsActions | null>(null);

const useSettingsState = function (): SettingsState {
    const value = use(SettingsStateContext);
    if (value === null) {
        throw new Error('useSettingsState must be used within a SettingsProvider');
    }
    return value;
};

const useSettingsActions = function (): SettingsActions {
    const value = use(SettingsActionsContext);
    if (value === null) {
        throw new Error('useSettingsActions must be used within a SettingsProvider');
    }
    return value;
};

export { type SettingsActions, SettingsActionsContext, type SettingsState, SettingsStateContext, useSettingsActions, useSettingsState };
