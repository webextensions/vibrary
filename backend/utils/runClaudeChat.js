import { CLAUDE_STREAM_FLAGS, spawnClaudeStreamAsync } from './spawnClaude.js';

// Give a follow-up room to read the codebase and edit files, just like a run-task; a chat reply can do real work.
const CHAT_TIMEOUT_MS = 60 * 60 * 1000;

// Continue a finished activity as a chat by resuming its claude session. `--resume <sessionId>` replays the prior
// conversation as the request prefix, so the agent keeps its full context; prompt caching is applied automatically on
// Anthropic's side for the unchanged prefix - there is nothing to configure here. Streams the reply line by line through
// `onLine` (claude's stream-json events). Resolves on a clean exit; rejects with a descriptive Error otherwise.
const runChatAsync = function ({ cwd, message, sessionId, signal, onLine }) {
    return spawnClaudeStreamAsync({
        cwd,
        args: ['-p', message, '--resume', sessionId, ...CLAUDE_STREAM_FLAGS, '--dangerously-skip-permissions'],
        timeoutMs: CHAT_TIMEOUT_MS,
        timeoutMessage: 'Chat reply timed out',
        signal,
        onLine
    });
};

export { runChatAsync };
