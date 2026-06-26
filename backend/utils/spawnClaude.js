import { spawn } from 'node:child_process';

// Flags that make "claude -p" emit its activity as newline-delimited JSON, token by token, so a run can be streamed to
// the UI as it happens. --verbose is required alongside stream-json in print mode; --include-partial-messages adds the
// per-token content_block_delta events that drive the typewriter rendering.
const CLAUDE_STREAM_FLAGS = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'];

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

        // SIGTERM the child's whole process group; fall back to the direct child if the group is already gone.
        const killTree = function () {
            try {
                process.kill(-child.pid, 'SIGTERM');
            } catch {
                child.kill('SIGTERM');
            }
        };

        const timer = setTimeout(function () {
            didTimeout = true;
            killTree();
        }, timeoutMs);

        const onAbort = function () {
            wasAborted = true;
            killTree();
        };
        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        const cleanup = function () {
            clearTimeout(timer);
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

        child.on('error', function (error) {
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

export { CLAUDE_STREAM_FLAGS, spawnClaudeAsync, spawnClaudeStreamAsync };
