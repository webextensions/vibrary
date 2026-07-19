import { type JobKind } from '../activity/activityQueue.ts';
import { type FormData } from '../editor/taskOptions.ts';

// Per-project UI preferences persisted to `.vibrary/settings.local.json` (read/written via the backend settings route).
// Two independent concerns share the file: which activity kinds pop start/finish notifications, and the last-used per-run
// options for each task's options form (keyed by the task's stable formSchemaRef).

type NotificationSettings = Record<JobKind, boolean>;

// One saved, named prompt template for the agent actions' instruction fields (the "Create entries with AI" dialog
// and the per-run custom instructions). Plain text - templates are inserted client-side into the instructions box,
// still editable per run, so there is no placeholder vocabulary to enforce here.
type PromptTemplate = { id: string; name: string; text: string };

type AppSettings = {
    notifications: NotificationSettings;
    // Keyed by formSchemaRef (e.g. "tasks.xml.schemas.json#update-npm-packages-options"); each value is the remembered
    // form data for that task's options form.
    taskOptions: Record<string, FormData>;
    // The AI competition judge's prompt template ({{entryA}}/{{entryB}}/{{instructions}} placeholders, consumed by
    // the backend's competitions route). Empty means the built-in judge prompt.
    competitionPrompt: string;
    // The saved prompt-template library, in the user's saved order.
    promptTemplates: PromptTemplate[]
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
    'run-task': true,
    'apply-spec': true,
    'apply-batch': true,
    'generate': true,
    'competitions': true,
    'plan-spec': true,
    'quick-run': true
};

const isRecord = function (value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

// Coerce whatever the backend returned (possibly `{}` for a missing file, or a file missing newly-added keys) into a
// complete AppSettings, so callers never have to guard for absent fields. Unknown notification keys are dropped and
// missing ones fall back to their default.
const normalizeSettings = function (raw: unknown): AppSettings {
    const source = isRecord(raw) ? raw : {};

    const storedNotifications = isRecord(source.notifications) ? source.notifications : {};
    const notifications = {} as NotificationSettings;
    for (const kind of Object.keys(DEFAULT_NOTIFICATIONS) as JobKind[]) {
        const stored = storedNotifications[kind];
        notifications[kind] = typeof stored === 'boolean' ? stored : DEFAULT_NOTIFICATIONS[kind];
    }

    const storedTaskOptions = isRecord(source.taskOptions) ? source.taskOptions : {};
    const taskOptions: Record<string, FormData> = {};
    for (const [reference, value] of Object.entries(storedTaskOptions)) {
        if (isRecord(value)) {
            taskOptions[reference] = value;
        }
    }

    const competitionPrompt = typeof source.competitionPrompt === 'string' ? source.competitionPrompt : '';

    // Templates keep only fully-valid records (non-empty string id and name, string text): the file is hand-editable,
    // and a half-record would render as a broken row in the picker or, worse, insert `undefined` into a prompt.
    const storedTemplates = Array.isArray(source.promptTemplates) ? source.promptTemplates : [];
    const promptTemplates: PromptTemplate[] = [];
    for (const record of storedTemplates) {
        if (isRecord(record) && typeof record.id === 'string' && record.id !== '' &&
        typeof record.name === 'string' && record.name !== '' && typeof record.text === 'string') {
            promptTemplates.push({ id: record.id, name: record.name, text: record.text });
        }
    }

    return { notifications, taskOptions, competitionPrompt, promptTemplates };
};

export { type AppSettings, DEFAULT_NOTIFICATIONS, normalizeSettings, type NotificationSettings, type PromptTemplate };
