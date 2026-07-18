import { type ReactNode, useMemo, useRef, useState } from 'react';

import { chatContinue } from '../api.ts';
import { type ActivityQueueActions, ActivityQueueActionsContext, type ActivityQueueState, ActivityQueueStateContext, type Job, type JobSpec, type JobStatus } from './activityQueue.ts';
import { appendUserMessage, type ClaudeStreamEvent, emptyTranscript, reduceTranscript, removeItem, type TranscriptItem, type TranscriptState } from './activityStream.ts';
import { randomId } from '../xml/vibraryXml.ts';

// In-memory job queue for every "claude -p" action triggered from the UI (run task, apply spec, apply a batch,
// generate, derive a title). The queue runs strictly one job at a time: an empty queue starts immediately, otherwise a
// new job waits behind the running one. It lives entirely in browser state, so it is lost on a page refresh - which
// also aborts the in-flight job, since each job's HTTP request carries an AbortSignal the backend kills the child on.

const errorMessage = function (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
};

// Stable empty transcript returned for jobs with no streamed events yet, so useSyncExternalStore sees an unchanging
// snapshot and does not loop.
const EMPTY_ITEMS: TranscriptItem[] = [];

const ActivityQueueProvider = function ({ children }: { children: ReactNode }) {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [paused, setPaused] = useState<boolean>(false);
    const [monitorOpen, setMonitorOpen] = useState<boolean>(true);

    // The queue is pumped imperatively from async callbacks, so the source of truth they read is these refs, kept in
    // lockstep with the rendered state by updateJobs and the pause/resume handlers. Reading state directly would give
    // the pump a stale snapshot.
    const jobsReference = useRef<Job[]>(jobs);
    const pausedReference = useRef<boolean>(paused);
    // The running job's controller, or null when idle. Doubles as the "a job is running" lock, claimed synchronously in
    // pump so a second job cannot start before state commits.
    const controllerReference = useRef<AbortController | null>(null);
    // Resolvers for the promise each enqueue returns, keyed by job id, so callers that consume a result (generate,
    // title) settle when their job finishes; fire-and-forget callers (run/apply) simply ignore it.
    const settlersReference = useRef(new Map<string, { resolve: (value: string) => void; reject: (reason: unknown) => void }>());
    // Per-job streamed transcript, kept in refs (not React state) and surfaced via useSyncExternalStore so the
    // high-frequency token updates re-render only the open detail tab - not every queue consumer.
    const transcriptsReference = useRef(new Map<string, TranscriptState>());
    const eventListenersReference = useRef(new Map<string, Set<() => void>>());
    // Chat messages a user sent while a reply was still streaming, per job id: drained one turn at a time as each run
    // finishes, so follow-ups auto-send in order without ever running two claude processes at once. Each entry's `id`
    // matches its optimistic transcript bubble's item id, so a still-queued one can be found and retracted (both from
    // here and from the transcript) via cancelPendingMessage before it is actually sent.
    const pendingReference = useRef(new Map<string, { id: string; text: string }[]>());
    // Unsent chat-composer drafts per job id (see ActivityQueue.getDraft): survives the detail tab's unmount on a tab
    // switch, mirroring how file tabs keep their unsaved edits.
    const draftsReference = useRef(new Map<string, string>());

    const updateJobs = function (updater: (previous: Job[]) => Job[]) {
        const next = updater(jobsReference.current);
        jobsReference.current = next;
        setJobs(next);
    };

    // Fold one streamed claude event into a job's transcript, notifying that job's subscribers only when the rendered
    // items actually changed (the reducer returns the same items reference for no-op events like message_start).
    const notifyEvents = function (jobId: string) {
        const listeners = eventListenersReference.current.get(jobId);
        if (listeners) {
            for (const listener of listeners) {
                listener();
            }
        }
    };

    const appendEvent = function (jobId: string, event: ClaudeStreamEvent) {
        const previous = transcriptsReference.current.get(jobId) ?? emptyTranscript();
        const next = reduceTranscript(previous, event);
        if (next === previous) {
            return;
        }
        transcriptsReference.current.set(jobId, next);
        // Mirror the session id onto the job as soon as it is captured (the init event, early in the run) so the chat
        // composer can appear while the run is still streaming. Fires once, when it first becomes known.
        if (next.sessionId !== previous.sessionId && next.sessionId !== '') {
            updateJobs(function (jobs) {
                return jobs.map(function (candidate) {
                    return candidate.id === jobId && candidate.sessionId !== next.sessionId ? { ...candidate, sessionId: next.sessionId } : candidate;
                });
            });
        }
        if (next.items !== previous.items) {
            notifyEvents(jobId);
        }
    };

    // Append a user message (the seeded initial prompt or a chat follow-up) to a job's transcript and notify its tab.
    const pushUserMessage = function (jobId: string, text: string, id: string) {
        const previous = transcriptsReference.current.get(jobId) ?? emptyTranscript();
        transcriptsReference.current.set(jobId, appendUserMessage(previous, text, id));
        notifyEvents(jobId);
    };

    const getEvents = function (jobId: string): TranscriptItem[] {
        return transcriptsReference.current.get(jobId)?.items ?? EMPTY_ITEMS;
    };

    const subscribeEvents = function (jobId: string, callback: () => void) {
        let set = eventListenersReference.current.get(jobId);
        if (!set) {
            set = new Set();
            eventListenersReference.current.set(jobId, set);
        }
        set.add(callback);
        return function () {
            set.delete(callback);
            if (set.size === 0) {
                eventListenersReference.current.delete(jobId);
            }
        };
    };

    const clearEvents = function (jobId: string) {
        transcriptsReference.current.delete(jobId);
        pendingReference.current.delete(jobId);
        draftsReference.current.delete(jobId);
        const listeners = eventListenersReference.current.get(jobId);
        if (listeners) {
            for (const listener of listeners) {
                listener();
            }
        }
    };

    const settle = function (id: string, outcome: 'resolve' | 'reject', value: unknown) {
        const settler = settlersReference.current.get(id);
        if (!settler) {
            return;
        }
        settlersReference.current.delete(id);
        if (outcome === 'resolve') {
            settler.resolve(value as string);
        } else {
            settler.reject(value);
        }
    };

    // Install the next queued chat turn for an activity by re-running the same job with a run thunk that resumes its
    // claude session, so the reply appends to the existing transcript (appendEvent folds onto the stored TranscriptState).
    // The message is dequeued at run time so stacked follow-ups drain in order. No-op while the job is still running or
    // queued - it gets armed again from the run's finally when the current turn finishes. A fresh no-op settler is
    // registered since the original enqueue's promise was already consumed.
    const armNextTurn = function (jobId: string) {
        const pending = pendingReference.current.get(jobId);
        if (!pending || pending.length === 0) {
            return;
        }
        const target = jobsReference.current.find(function (candidate) {
            return candidate.id === jobId;
        });
        if (!target || target.sessionId === null || target.status === 'running' || target.status === 'queued') {
            return;
        }
        const sessionId = target.sessionId;
        // The message is dequeued on the thunk's FIRST execution (not at arm time, so cancelPendingMessage can still
        // retract it while queued) and cached for any re-execution: retryJob re-runs this same thunk after a failed
        // turn, when the pending queue no longer holds the message - without the cache a retry would send '' and be
        // rejected by the backend, making every chat-turn retry fail.
        let dequeuedMessage: string | null = null;
        const run: Job['run'] = function (signal, onEvent) {
            dequeuedMessage ??= pendingReference.current.get(jobId)?.shift()?.text ?? '';
            return chatContinue({ message: dequeuedMessage, sessionId }, { signal, onEvent });
        };
        settlersReference.current.set(jobId, { resolve() {}, reject() {} });
        updateJobs(function (previous) {
            return previous.map(function (candidate) {
                return candidate.id === jobId ? { ...candidate, status: 'queued', run, endedAt: null, error: null } : candidate;
            });
        });
        pump();
    };

    // Start the next queued job when the queue is idle and not paused: claim the running slot, mark it running, run its
    // thunk, then settle and pump again. A no-op when busy or paused, so it is safe to call after every enqueue, resume
    // and completion.
    function pump() {
        if (controllerReference.current || pausedReference.current) {
            return;
        }
        const job = jobsReference.current.find(function (candidate) {
            return candidate.status === 'queued';
        });
        if (!job) {
            return;
        }

        const controller = new AbortController();
        controllerReference.current = controller;
        updateJobs(function (previous) {
            return previous.map(function (candidate) {
                return candidate.id === job.id ? { ...candidate, status: 'running', startedAt: Date.now() } : candidate;
            });
        });

        const finish = function (patch: Partial<Job>) {
            updateJobs(function (previous) {
                return previous.map(function (candidate) {
                    return candidate.id === job.id ? { ...candidate, ...patch, endedAt: Date.now() } : candidate;
                });
            });
        };

        const execute = async function () {
            try {
                const output = await job.run(controller.signal, function (event) {
                    appendEvent(job.id, event);
                });
                settle(job.id, 'resolve', output);
                finish({ status: 'success' });
            } catch (error) {
                settle(job.id, 'reject', error);
                finish({ status: controller.signal.aborted ? 'aborted' : 'error', error: errorMessage(error) });
            } finally {
                controllerReference.current = null;
                // Auto-send any chat message the user queued while this run was streaming, then pump the global queue.
                armNextTurn(job.id);
                pump();
            }
        };
        void execute();
    }

    const enqueue = function (spec: JobSpec): Promise<string> {
        const job: Job = {
            id: randomId(),
            kind: spec.kind,
            label: spec.label,
            status: 'queued',
            startedAt: null,
            endedAt: null,
            error: null,
            prompt: spec.prompt !== undefined && spec.prompt !== '' ? spec.prompt : null,
            sessionId: null,
            target: spec.target ?? null,
            run: spec.run
        };
        const promise = new Promise<string>(function (resolve, reject) {
            settlersReference.current.set(job.id, { resolve, reject });
        });
        // Seed the activity's first user bubble from the concise prompt so it shows immediately; the backend later echoes
        // the exact prompt, which folds into this same bubble as its "full" view.
        if (spec.prompt !== undefined && spec.prompt !== '') {
            pushUserMessage(job.id, spec.prompt, 'prompt');
        }
        updateJobs(function (previous) {
            return [...previous, job];
        });
        setMonitorOpen(true);
        pump();
        return promise;
    };

    const pause = function () {
        setPaused(true);
        pausedReference.current = true;
    };

    const resume = function () {
        setPaused(false);
        pausedReference.current = false;
        pump();
    };

    const abortCurrent = function () {
        controllerReference.current?.abort();
    };

    // Drop a job from the queue or from finished history (never the currently running one, which must be aborted
    // first). Rejects its promise so an awaiting caller does not hang; a no-op for an already-settled finished job
    // since settle() guards on the settler still being present.
    const removeJob = function (id: string) {
        const target = jobsReference.current.find(function (candidate) {
            return candidate.id === id;
        });
        if (!target || target.status === 'running') {
            return;
        }
        settle(id, 'reject', new Error('Removed from queue'));
        updateJobs(function (previous) {
            return previous.filter(function (candidate) {
                return candidate.id !== id;
            });
        });
        clearEvents(id);
    };

    // Swap a queued job with its queued neighbour. Guarding both ends on 'queued' keeps a job from crossing the running
    // one or reordering finished history.
    const moveJob = function (id: string, direction: 'up' | 'down') {
        updateJobs(function (previous) {
            const index = previous.findIndex(function (candidate) {
                return candidate.id === id;
            });
            if (index === -1 || previous[index].status !== 'queued') {
                return previous;
            }
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= previous.length || previous[target].status !== 'queued') {
                return previous;
            }
            const next = [...previous];
            const moved = next[index];
            next[index] = next[target];
            next[target] = moved;
            return next;
        });
    };

    // Re-run a finished failed/aborted job as a fresh queue entry. The retried job's promise is unobserved here, so it
    // is awaited in a swallowing try/catch to avoid an unhandled-rejection warning.
    const retryJob = async function (id: string) {
        const target = jobsReference.current.find(function (candidate) {
            return candidate.id === id;
        });
        if (!target || (target.status !== 'error' && target.status !== 'aborted')) {
            return;
        }
        try {
            // Pass the original prompt and entry target through so the retried row's fresh transcript seeds the same
            // initial bubble and keeps its open-the-entry link.
            await enqueue({ kind: target.kind, label: target.label, prompt: target.prompt ?? undefined, target: target.target ?? undefined, run: target.run });
        } catch {
            // The re-run's result is shown on its own row; nothing here consumes it.
        }
    };

    // Re-run every failed/aborted job, the bulk counterpart of retryJob - snapshotting the target ids up front so
    // retrying one does not affect which others are retried in this same pass. `scope`, when given, additionally
    // restricts which ids are eligible - the Activity monitor passes its currently filtered/shown job ids so "Retry
    // all" only retries what is actually visible under an active Kind/Status filter, not the whole queue.
    const retryAllFailed = function (scope?: string[]) {
        const scopeSet = scope === undefined ? null : new Set(scope);
        const targets = jobsReference.current.filter(function (candidate) {
            return (candidate.status === 'error' || candidate.status === 'aborted') &&
            (scopeSet === null || scopeSet.has(candidate.id));
        });
        for (const target of targets) {
            void retryJob(target.id);
        }
    };

    // Send a chat message to an activity: show it immediately, then send it now (if idle) or queue it to auto-send after
    // the current reply finishes. Requires a captured session id to resume; ignores empty messages.
    const sendMessage = function (id: string, message: string) {
        const text = message.trim();
        if (text === '') {
            return;
        }
        const target = jobsReference.current.find(function (candidate) {
            return candidate.id === id;
        });
        if (!target || target.sessionId === null) {
            return;
        }
        const messageId = `user:${randomId()}`;
        pushUserMessage(id, text, messageId);
        const pending = pendingReference.current.get(id) ?? [];
        pending.push({ id: messageId, text });
        pendingReference.current.set(id, pending);
        armNextTurn(id);
    };

    // Retract a chat follow-up that is still waiting behind an earlier turn (armNextTurn/pump only ever shift a
    // pending entry out at the moment they actually start sending it, synchronously within the same call stack as the
    // job's status flips to 'queued'/'running' - so by the time this can run again, a message that has already gone
    // out is no longer in `pending` and this is correctly a no-op for it). Drops both the queued send and its
    // optimistic bubble; leaves everything alone if the message was not found (already sent, or a stale id).
    const cancelPendingMessage = function (jobId: string, messageId: string) {
        const pending = pendingReference.current.get(jobId);
        const index = pending?.findIndex(function (entry) { return entry.id === messageId; }) ?? -1;
        if (pending === undefined || index === -1) {
            return;
        }
        pending.splice(index, 1);
        const previous = transcriptsReference.current.get(jobId) ?? emptyTranscript();
        const next = removeItem(previous, messageId);
        if (next !== previous) {
            transcriptsReference.current.set(jobId, next);
            notifyEvents(jobId);
        }
    };

    // Whether a chat message is still queued behind an earlier turn (as opposed to already sent/streaming), so the
    // detail view can offer a cancel affordance only on messages that are genuinely still cancelable.
    const isMessagePending = function (jobId: string, messageId: string): boolean {
        return (pendingReference.current.get(jobId) ?? []).some(function (entry) { return entry.id === messageId; });
    };

    // `scope`, when given, additionally restricts which finished jobs are cleared - see retryAllFailed above for why
    // (the Activity monitor passes its currently filtered/shown job ids).
    const clearFinished = function (scope?: string[]) {
        const finished = new Set<JobStatus>(['success', 'error', 'aborted']);
        const scopeSet = scope === undefined ? null : new Set(scope);
        const isTarget = function (candidate: Job) {
            return finished.has(candidate.status) && (scopeSet === null || scopeSet.has(candidate.id));
        };
        const removed = jobsReference.current.filter(function (candidate) {
            return isTarget(candidate);
        });
        updateJobs(function (previous) {
            return previous.filter(function (candidate) {
                return !isTarget(candidate);
            });
        });
        for (const job of removed) {
            clearEvents(job.id);
        }
    };

    const getDraft = function (jobId: string) {
        return draftsReference.current.get(jobId) ?? '';
    };

    const setDraft = function (jobId: string, text: string) {
        if (text === '') {
            draftsReference.current.delete(jobId);
        } else {
            draftsReference.current.set(jobId, text);
        }
    };

    // The actions bundle is created ONCE (useState initializer) and stays referentially stable for the provider's
    // life. Freezing the first render's closures is safe by construction: every function above reads live queue
    // state through the refs (jobsReference, pausedReference, ...), never through captured state variables - the
    // same design that lets the pump run from async callbacks. Stability is the point: action-only consumers (each
    // SpecCard's enqueue) subscribe to this context and never re-render on queue churn, and useJobEvents' memoized
    // subscribe/getSnapshot stop being invalidated by every provider render.
    const [actions] = useState<ActivityQueueActions>(function () {
        return {
            setMonitorOpen,
            enqueue,
            pause,
            resume,
            abortCurrent,
            removeJob,
            moveJob,
            retryJob,
            retryAllFailed,
            sendMessage,
            cancelPendingMessage,
            isMessagePending,
            clearFinished,
            subscribeEvents,
            getEvents,
            getDraft,
            setDraft
        };
    });

    const state = useMemo(function (): ActivityQueueState {
        return { jobs, paused, monitorOpen };
    }, [jobs, paused, monitorOpen]);

    return (
        <ActivityQueueStateContext value={state}>
            <ActivityQueueActionsContext value={actions}>
                {children}
            </ActivityQueueActionsContext>
        </ActivityQueueStateContext>
    );
};

export { ActivityQueueProvider };
