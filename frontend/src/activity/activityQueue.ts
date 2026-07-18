import { createContext, use, useCallback, useSyncExternalStore } from 'react';

import { type ClaudeStreamEvent, type TranscriptItem } from './activityStream.ts';

// Context, types and accessors for the in-memory job queue. The stateful provider lives in ActivityQueueProvider.tsx;
// kept separate so each file exports only one kind of thing (hooks/context here, a component there) and React Fast
// Refresh stays happy.

type JobKind = 'run-task' | 'apply-spec' | 'apply-batch' | 'generate';
type JobStatus = 'queued' | 'running' | 'success' | 'error' | 'aborted';

// The entry a job ran on, so the activity view can navigate back to it. Recording the FILE as well as the title is
// what makes the link robust: titles resolve folder-wide but are not immortal (a rename or move would otherwise
// orphan the link, and a duplicate title would resolve to the wrong file's first occurrence).
type JobTarget = { filePath: string; entryTitle: string };

// A job's worker thunk: performs the api call with the queue's abort signal, forwarding each streamed claude event to
// `onEvent` (the queue folds these into the job's transcript). Non-streaming jobs (title) simply ignore onEvent.
type JobRun = (signal: AbortSignal, onEvent: (event: ClaudeStreamEvent) => void) => Promise<string>;

// What a caller hands to enqueue: the kind drives the row's icon/label, `label` is the human title shown. `prompt` is
// the concise human-readable request seeded as the activity's first user bubble (omitted for kinds with nothing to show).
type JobSpec = {
    kind: JobKind;
    label: string;
    prompt?: string;
    target?: JobTarget;
    run: JobRun
};

type Job = {
    id: string;
    kind: JobKind;
    label: string;
    status: JobStatus;
    startedAt: number | null;
    endedAt: number | null;
    error: string | null;
    // The concise prompt seeded as the activity's first user bubble at enqueue time; kept on the job so a retry
    // (a fresh row with a fresh, empty transcript) can seed the same bubble again. Null for kinds with none.
    prompt: string | null;
    // Claude's session id, captured from the run's stream (early, at the init event). Present enables continuing the
    // activity as a chat (via sendMessage); null when the run ended before emitting an init event.
    sessionId: string | null;
    // The entry this job ran on, so its row can offer "open the entry" - null for jobs with no single entry (a batch
    // apply, a generate into a file), which render no such affordance rather than a dead one.
    target: JobTarget | null;
    run: JobRun
};

// The queue's context is split in two so consumers subscribe to only what they use: STATE changes on every queue
// transition and re-renders its consumers, while the ACTIONS bundle is referentially stable for the provider's whole
// life - a card that only enqueues (every SpecCard) never re-renders because some other job started or finished.
type ActivityQueueState = {
    jobs: Job[];
    paused: boolean;
    monitorOpen: boolean
};

type ActivityQueueActions = {
    setMonitorOpen: (isOpen: boolean) => void;
    enqueue: (spec: JobSpec) => Promise<string>;
    pause: () => void;
    resume: () => void;
    abortCurrent: () => void;
    removeJob: (id: string) => void;
    moveJob: (id: string, direction: 'up' | 'down') => void;
    retryJob: (id: string) => void;
    // Re-enqueue every failed/aborted job, the bulk counterpart of retryJob - mirrors clearFinished acting on the whole
    // finished-job set instead of one row at a time. `scope`, when given, restricts this to just those job ids (the
    // Activity monitor passes its currently filtered/shown ids so this respects an active Kind/Status filter).
    retryAllFailed: (scope?: string[]) => void;
    // Send a chat message to an activity that resumes its claude session, showing the message immediately and appending
    // the reply to the existing transcript. If a reply is already streaming, the message is queued and auto-sent as the
    // next turn. A no-op if the job has no session id yet or the message is empty.
    sendMessage: (id: string, message: string) => void;
    // Retract a chat follow-up that is still queued behind an earlier turn, dropping both the pending send and its
    // optimistic transcript bubble. A no-op once the message has actually started sending.
    cancelPendingMessage: (jobId: string, messageId: string) => void;
    // Whether a given transcript item id is a chat message still waiting to be sent (as opposed to already sent).
    isMessagePending: (jobId: string, messageId: string) => boolean;
    // Clears every finished (success/error/aborted) job, or just those in `scope` when given - see retryAllFailed.
    clearFinished: (scope?: string[]) => void;
    // Per-job streamed transcript, kept off the `jobs` array so high-frequency token updates only re-render the open
    // detail tab (via useJobEvents) rather than every queue consumer.
    subscribeEvents: (jobId: string, callback: () => void) => () => void;
    getEvents: (jobId: string) => TranscriptItem[];
    // The chat composer's unsent draft, keyed per job: only the active tab is mounted, so the detail component's local
    // state dies on every tab switch - the queue provider outlives it, exactly like the transcripts above. Cleared
    // together with the job's transcript.
    getDraft: (jobId: string) => string;
    setDraft: (jobId: string, text: string) => void
};

const ActivityQueueStateContext = createContext<ActivityQueueState | null>(null);
const ActivityQueueActionsContext = createContext<ActivityQueueActions | null>(null);

const useActivityQueueState = function (): ActivityQueueState {
    const value = use(ActivityQueueStateContext);
    if (value === null) {
        throw new Error('useActivityQueueState must be used within an ActivityQueueProvider');
    }
    return value;
};

const useActivityQueueActions = function (): ActivityQueueActions {
    const value = use(ActivityQueueActionsContext);
    if (value === null) {
        throw new Error('useActivityQueueActions must be used within an ActivityQueueProvider');
    }
    return value;
};

// Subscribe to one job's live transcript. Backed by useSyncExternalStore so only the activity tab re-renders as tokens
// arrive; the store returns a stable array reference until that job's transcript actually changes.
const useJobEvents = function (jobId: string): TranscriptItem[] {
    const { subscribeEvents, getEvents } = useActivityQueueActions();
    const subscribe = useCallback(function (callback: () => void) {
        return subscribeEvents(jobId, callback);
    }, [subscribeEvents, jobId]);
    const getSnapshot = useCallback(function () {
        return getEvents(jobId);
    }, [getEvents, jobId]);
    return useSyncExternalStore(subscribe, getSnapshot);
};

export { type ActivityQueueActions, ActivityQueueActionsContext, type ActivityQueueState, ActivityQueueStateContext, type Job, type JobKind, type JobSpec, type JobStatus, type JobTarget, useActivityQueueActions, useActivityQueueState, useJobEvents };
