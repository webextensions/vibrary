import { type ReactNode, useRef, useState } from 'react';

import { type ActivityQueue, ActivityQueueContext, type Job, type JobSpec, type JobStatus } from './activityQueue.ts';
import { type ClaudeStreamEvent, emptyTranscript, reduceTranscript, type TranscriptItem, type TranscriptState } from './activityStream.ts';

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

    const updateJobs = function (updater: (previous: Job[]) => Job[]) {
        const next = updater(jobsReference.current);
        jobsReference.current = next;
        setJobs(next);
    };

    // Fold one streamed claude event into a job's transcript, notifying that job's subscribers only when the rendered
    // items actually changed (the reducer returns the same items reference for no-op events like message_start).
    const appendEvent = function (jobId: string, event: ClaudeStreamEvent) {
        const previous = transcriptsReference.current.get(jobId) ?? emptyTranscript();
        const next = reduceTranscript(previous, event);
        if (next === previous) {
            return;
        }
        transcriptsReference.current.set(jobId, next);
        if (next.items !== previous.items) {
            const listeners = eventListenersReference.current.get(jobId);
            if (listeners) {
                for (const listener of listeners) {
                    listener();
                }
            }
        }
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
                finish({ status: 'success', output });
            } catch (error) {
                settle(job.id, 'reject', error);
                finish({ status: controller.signal.aborted ? 'aborted' : 'error', error: errorMessage(error) });
            } finally {
                controllerReference.current = null;
                pump();
            }
        };
        void execute();
    }

    const enqueue = function (spec: JobSpec): Promise<string> {
        const job: Job = {
            id: crypto.randomUUID(),
            kind: spec.kind,
            label: spec.label,
            status: 'queued',
            createdAt: Date.now(),
            startedAt: null,
            endedAt: null,
            output: null,
            error: null,
            run: spec.run
        };
        const promise = new Promise<string>(function (resolve, reject) {
            settlersReference.current.set(job.id, { resolve, reject });
        });
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

    // Drop a not-yet-started job and reject its promise so any awaiting caller does not hang.
    const removeJob = function (id: string) {
        const target = jobsReference.current.find(function (candidate) {
            return candidate.id === id;
        });
        if (!target || target.status !== 'queued') {
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
            await enqueue({ kind: target.kind, label: target.label, run: target.run });
        } catch {
            // The re-run's result is shown on its own row; nothing here consumes it.
        }
    };

    const clearFinished = function () {
        const finished = new Set<JobStatus>(['success', 'error', 'aborted']);
        const removed = jobsReference.current.filter(function (candidate) {
            return finished.has(candidate.status);
        });
        updateJobs(function (previous) {
            return previous.filter(function (candidate) {
                return candidate.status === 'queued' || candidate.status === 'running';
            });
        });
        for (const job of removed) {
            clearEvents(job.id);
        }
    };

    const value: ActivityQueue = {
        jobs,
        paused,
        monitorOpen,
        setMonitorOpen,
        enqueue,
        pause,
        resume,
        abortCurrent,
        removeJob,
        moveJob,
        retryJob,
        clearFinished,
        subscribeEvents,
        getEvents
    };

    return <ActivityQueueContext value={value}>{children}</ActivityQueueContext>;
};

export { ActivityQueueProvider };
