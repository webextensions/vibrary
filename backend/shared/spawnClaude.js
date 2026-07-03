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
        if (signal && signal.aborted) {
            reject(new Error('Aborted by user'));
            return;
        }

        const child = spawn('claude', args, { cwd, detached: true });

        let stdout = '';
        let stderr = '';
        let wasAborted = false;
        let didTimeout = false;

        // Signal the child's whole process group; fall back to the direct child if the group is already gone.
        const killTree = function (signalName) {
            try {
                process.kill(-child.pid, signalName);
            } catch {
                child.kill(signalName);
            }
        };

        // SIGTERM first, then SIGKILL after the grace period unless 'close' fires and cleanup() disarms it - the
        // standard term-then-kill pattern (what child_process's own `timeout` option and process managers do).
        let escalationTimer = null;
        const requestKill = function () {
            killTree('SIGTERM');
            if (escalationTimer === null) {
                escalationTimer = setTimeout(function () {
                    killTree('SIGKILL');
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

export { runStreamedAgentAsync, spawnClaudeAsync };
