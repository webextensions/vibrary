import { type JobKind } from '../activity/activityQueue.ts';
import { type FormData } from '../editor/taskOptions.ts';

// Per-project UI preferences persisted to `.vibrary/settings.local.json` (read/written via the backend settings route).
// Two independent concerns share the file: which activity kinds pop start/finish notifications, and the last-used per-run
// options for each task's options form (keyed by the task's stable formSchemaRef).

type NotificationSettings = Record<JobKind, boolean>;

type AppSettings = {
    notifications: NotificationSettings;
    // Keyed by formSchemaRef (e.g. "tasks.xml.schemas.json#update-npm-packages-options"); each value is the remembered
    // form data for that task's options form.
    taskOptions: Record<string, FormData>
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
    'run-task': true,
    'apply-spec': true,
    'apply-batch': true,
    'generate': true,
    'competitions': true
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

    return { notifications, taskOptions };
};

export { type AppSettings, DEFAULT_NOTIFICATIONS, normalizeSettings, type NotificationSettings };
