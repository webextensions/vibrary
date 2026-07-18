import { spawn } from 'node:child_process';

// Flags that make "claude -p" emit its activity as newline-delimited JSON, token by token, so a run can be streamed to
// the UI as it happens. --verbose is required alongside stream-json in print mode; --include-partial-messages adds the
// per-token content_block_delta events that drive the typewriter rendering.
const CLAUDE_STREAM_FLAGS = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'];

// How long a kill request waits for the SIGTERM'd process group to actually exit before escalating to SIGKILL. Without
// the escalation, a child that ignores SIGTERM (wedged worker, uninterruptible I/O) would leave the promise pending
// forever: the timed-out route would hang past its own timeoutMs, the UI's activity would stay "Running" after a
// cancel, and an aborted worker would keep editing files - exactly what the kill exists to stop.
const KILL_ESCALATION_GRACE_MS = 5 * 1000;

// Every live child, registered so a server shutdown can kill the whole fleet: the children are detached process-group
// leaders (see runClaudeProcess), so they would survive this process's death and keep editing files with nobody
// watching. Entries are removed by each run's own cleanup as it closes.
const activeChildren = new Set();

// Set by beginShutdown() when the server takes a termination signal. Once set, runClaudeProcess refuses to start a new
// run: without this, a request that raced past its validation (e.g. was awaiting the .vibraryinclude read when the
// signal fired) could spawn a fresh detached child AFTER terminateActiveClaudeRunsAsync already swept the fleet - an
// orphan process group nobody signals, left editing files after the server is gone.
const shutdownState = { begun: false };
const beginShutdown = function () {
    shutdownState.begun = true;
};

// Signal a child's whole process group (negative pid); fall back to the direct child if the group is already gone.
const signalProcessGroup = function (child, signalName) {
    try {
        process.kill(-child.pid, signalName);
    } catch {
        child.kill(signalName);
    }
};

// Kill every live run's process group and wait (bounded) for them to exit: SIGTERM first, then SIGKILL for whatever
// is still alive after the same grace period a single-run kill uses. Called by the server's signal handlers so that
// Ctrl+C cannot orphan detached agents mid-edit.
const terminateActiveClaudeRunsAsync = async function () {
    if (activeChildren.size === 0) {
        return;
    }
    const children = [...activeChildren];
    const allClosed = Promise.all(children.map(function (child) {
        return new Promise(function (resolve) {
            if (child.exitCode !== null || child.signalCode !== null) {
                resolve(undefined);
                return;
            }
            child.once('close', resolve);
        });
    }));
    for (const child of children) {
        signalProcessGroup(child, 'SIGTERM');
    }
    await Promise.race([
        allClosed,
        new Promise(function (resolve) {
            setTimeout(resolve, KILL_ESCALATION_GRACE_MS).unref();
        })
    ]);
    // Whatever survived the grace period gets the non-ignorable signal; already-closed children left the set via cleanup.
    for (const child of activeChildren) {
        signalProcessGroup(child, 'SIGKILL');
    }
};

// Spawn "claude <args>" in `cwd` with the full lifecycle the callers rely on: clean-exit resolve, descriptive rejects
// (missing CLI, non-zero exit, timeout, external abort), and a tree-kill on abort/timeout.
//
// The child is started detached, as its own process-group leader, so a timeout or an abort can SIGTERM the whole group
// (negative pid) rather than only the direct child. The "claude" binary launches a worker subprocess; signalling just
// the launcher leaves that worker orphaned and still editing files, which is exactly what an abort must stop. We never
// unref the child, so the parent still waits for it and collects its output. `onStdoutChunk` (optional) receives each
// raw stdout chunk for callers that stream; the resolved value is always the full accumulated stdout.
const runClaudeProcess = function ({ cwd, args, timeoutMs, timeoutMessage, signal, onStdoutChunk }) {
    return new Promise(function (resolve, reject) {
        if (shutdownState.begun) {
            // Refuse to spawn during shutdown so a signal-racing request cannot leave an orphaned detached child.
            reject(new Error('Server is shutting down'));
            return;
        }
        if (signal && signal.aborted) {
            reject(new Error('Aborted by user'));
            return;
        }

        const child = spawn('claude', args, { cwd, detached: true });
        // Decode through Node's StringDecoder so a multi-byte UTF-8 character split across two chunks arrives intact;
        // per-chunk Buffer.toString() would turn each half into replacement characters (U+FFFD).
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        activeChildren.add(child);

        let stdout = '';
        let stderr = '';
        let wasAborted = false;
        let didTimeout = false;

        // SIGTERM first, then SIGKILL after the grace period unless 'close' fires and cleanup() disarms it - the
        // standard term-then-kill pattern (what child_process's own `timeout` option and process managers do).
        let escalationTimer = null;
        const requestKill = function () {
            signalProcessGroup(child, 'SIGTERM');
            if (escalationTimer === null) {
                escalationTimer = setTimeout(function () {
                    signalProcessGroup(child, 'SIGKILL');
                }, KILL_ESCALATION_GRACE_MS);
            }
        };

        const timer = setTimeout(function () {
            didTimeout = true;
            requestKill();
        }, timeoutMs);

        const onAbort = function () {
            wasAborted = true;
            requestKill();
        };
        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        const cleanup = function () {
            activeChildren.delete(child);
            clearTimeout(timer);
            if (escalationTimer !== null) {
                clearTimeout(escalationTimer);
            }
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
        };

        child.stdout.on('data', function (chunk) {
            const text = chunk.toString();
            stdout += text;
            if (onStdoutChunk) {
                onStdoutChunk(text);
            }
        });
        child.stderr.on('data', function (chunk) {
            stderr += chunk.toString();
        });

        child.on('error', function (/** @type {NodeJS.ErrnoException} */ error) {
            cleanup();
            if (wasAborted) {
                reject(new Error('Aborted by user'));
                return;
            }
            if (error.code === 'ENOENT') {
                reject(new Error('Claude CLI not found on PATH'));
                return;
            }
            reject(error);
        });

        child.on('close', function (code) {
            cleanup();
            if (wasAborted) {
                reject(new Error('Aborted by user'));
                return;
            }
            if (didTimeout) {
                reject(new Error(timeoutMessage));
                return;
            }
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
        });
    });
};

// Buffered run: resolve with the CLI's full stdout once it exits cleanly. Used by the quick title call.
const spawnClaudeAsync = function (options) {
    return runClaudeProcess(options);
};

// Streamed run: call `onLine` with each complete newline-delimited stdout line as it arrives (claude's stream-json
// emits one JSON object per line), flushing any trailing partial line on exit. Resolves when the process exits cleanly;
// the caller already has every line via `onLine`.
const spawnClaudeStreamAsync = async function ({ cwd, args, timeoutMs, timeoutMessage, signal, onLine }) {
    let buffer = '';
    const handleChunk = function (text) {
        buffer += text;
        let index = buffer.indexOf('\n');
        while (index !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (line.trim() !== '') {
                onLine(line);
            }
            index = buffer.indexOf('\n');
        }
    };
    const stdout = await runClaudeProcess({ cwd, args, timeoutMs, timeoutMessage, signal, onStdoutChunk: handleChunk });
    const rest = buffer.trim();
    if (rest !== '') {
        onLine(rest);
    }
    return stdout;
};

// Echo the exact prompt we are about to hand claude as a synthetic stream line, so the frontend can show it as the
// activity's initial user message (its "full" view). Shaped like claude's own stream-json events; the frontend reducer
// folds a `user_prompt` event into the seeded bubble.
const emitUserPrompt = function (onLine, prompt) {
    onLine(JSON.stringify({ type: 'user_prompt', text: prompt }));
};

// The one recipe every streamed agent action runs on: echo the prompt as the activity's first bubble (unless the
// caller seeds the transcript itself, e.g. a chat resume where the message is already shown optimistically), then
// stream "claude -p <prompt> [extraArguments]" with the stream-json flags. All UI-triggered runs execute with
// --dangerously-skip-permissions ON PURPOSE: a headless run has no way to surface a permission prompt to the browser,
// so a gated run would simply hang - the trade-off is that prompt text is effectively code, and the docs disclose it.
// Centralized here so the flag, its rationale, and any future run-recipe change (flags, env, kill policy) live once.
const runStreamedAgentAsync = function ({ cwd, prompt, extraArguments = [], timeoutMs, timeoutMessage, signal, onLine, echoPrompt = true }) {
    if (echoPrompt) {
        emitUserPrompt(onLine, prompt);
    }
    return spawnClaudeStreamAsync({
        cwd,
        args: ['-p', prompt, ...extraArguments, ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions'],
        timeoutMs,
        timeoutMessage,
        signal,
        onLine
    });
};

export { beginShutdown, runStreamedAgentAsync, spawnClaudeAsync, terminateActiveClaudeRunsAsync };
