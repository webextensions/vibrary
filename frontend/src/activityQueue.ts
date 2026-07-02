import { createContext, use, useCallback, useSyncExternalStore } from 'react';

import { type ClaudeStreamEvent, type TranscriptItem } from './activityStream.ts';

// Context, types and accessors for the in-memory job queue. The stateful provider lives in ActivityQueueProvider.tsx;
// kept separate so each file exports only one kind of thing (hooks/context here, a component there) and React Fast
// Refresh stays happy.

type JobKind = 'run-task' | 'apply-spec' | 'apply-batch' | 'generate' | 'title';
type JobStatus = 'queued' | 'running' | 'success' | 'error' | 'aborted';

// A job's worker thunk: performs the api call with the queue's abort signal, forwarding each streamed claude event to
// `onEvent` (the queue folds these into the job's transcript). Non-streaming jobs (title) simply ignore onEvent.
type JobRun = (signal: AbortSignal, onEvent: (event: ClaudeStreamEvent) => void) => Promise<string>;

// What a caller hands to enqueue: the kind drives the row's icon/label, `label` is the human title shown. `prompt` is
// the concise human-readable request seeded as the activity's first user bubble (omitted for kinds with nothing to show).
type JobSpec = {
    kind: JobKind;
    label: string;
    prompt?: string;
    run: JobRun
};

type Job = {
    id: string;
    kind: JobKind;
    label: string;
    status: JobStatus;
    createdAt: number;
    startedAt: number | null;
    endedAt: number | null;
    output: string | null;
    error: string | null;
    // Claude's session id, captured from the run's stream (early, at the init event). Present enables continuing the
    // activity as a chat (via sendMessage); null when the run ended before emitting an init event.
    sessionId: string | null;
    run: JobRun
};

type ActivityQueue = {
    jobs: Job[];
    paused: boolean;
    monitorOpen: boolean;
    setMonitorOpen: (isOpen: boolean) => void;
    enqueue: (spec: JobSpec) => Promise<string>;
    pause: () => void;
    resume: () => void;
    abortCurrent: () => void;
    removeJob: (id: string) => void;
    moveJob: (id: string, direction: 'up' | 'down') => void;
    retryJob: (id: string) => void;
    // Re-enqueue every failed/aborted job, the bulk counterpart of retryJob - mirrors clearFinished acting on the whole
    // finished-job set instead of one row at a time.
    retryAllFailed: () => void;
    // Send a chat message to an activity that resumes its claude session, showing the message immediately and appending
    // the reply to the existing transcript. If a reply is already streaming, the message is queued and auto-sent as the
    // next turn. A no-op if the job has no session id yet or the message is empty.
    sendMessage: (id: string, message: string) => void;
    // Retract a chat follow-up that is still queued behind an earlier turn, dropping both the pending send and its
    // optimistic transcript bubble. A no-op once the message has actually started sending.
    cancelPendingMessage: (jobId: string, messageId: string) => void;
    // Whether a given transcript item id is a chat message still waiting to be sent (as opposed to already sent).
    isMessagePending: (jobId: string, messageId: string) => boolean;
    clearFinished: () => void;
    // Per-job streamed transcript, kept off the `jobs` array so high-frequency token updates only re-render the open
    // detail tab (via useJobEvents) rather than every queue consumer.
    subscribeEvents: (jobId: string, callback: () => void) => () => void;
    getEvents: (jobId: string) => TranscriptItem[]
};

const ActivityQueueContext = createContext<ActivityQueue | null>(null);

const useActivityQueue = function (): ActivityQueue {
    const value = use(ActivityQueueContext);
    if (value === null) {
        throw new Error('useActivityQueue must be used within an ActivityQueueProvider');
    }
    return value;
};

// Subscribe to one job's live transcript. Backed by useSyncExternalStore so only the activity tab re-renders as tokens
// arrive; the store returns a stable array reference until that job's transcript actually changes.
const useJobEvents = function (jobId: string): TranscriptItem[] {
    const { subscribeEvents, getEvents } = useActivityQueue();
    const subscribe = useCallback(function (callback: () => void) {
        return subscribeEvents(jobId, callback);
    }, [subscribeEvents, jobId]);
    const getSnapshot = useCallback(function () {
        return getEvents(jobId);
    }, [getEvents, jobId]);
    return useSyncExternalStore(subscribe, getSnapshot);
};

export { type ActivityQueue, ActivityQueueContext, type Job, type JobKind, type JobSpec, type JobStatus, useActivityQueue, useJobEvents };
