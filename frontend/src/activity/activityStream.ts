// Folds claude's "stream-json" events into an ordered transcript the activity tab renders. The CLI (with
// --include-partial-messages) emits, per turn: a stream_event message_start, content_block_start/delta/stop for each
// block (text token deltas, tool-input json deltas), then a consolidated assistant message; tool results arrive as
// whole "user" events; a final "result" event closes the run. We drive the live typewriter from the deltas and let the
// consolidated assistant message reconcile each block to its authoritative content.

type ContentBlock =
| { type: 'text'; text?: string } |
{ type: 'tool_use'; id: string; name: string; input?: unknown } |
{ type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean } |
{ type: string; [key: string]: unknown };

type ClaudeMessage = { id?: string; role?: string; content?: ContentBlock[] };

type StreamSubEvent =
| { type: 'message_start'; message?: ClaudeMessage } |
{ type: 'content_block_start'; index: number; content_block: ContentBlock } |
{ type: 'content_block_delta'; index: number; delta: { type: string; text?: string; partial_json?: string; thinking?: string } } |
{ type: string; [key: string]: unknown };

// The events api.ts forwards to the reducer. `_exit` is the backend's own terminal line; it never reaches the reducer
// (api.ts consumes it), but it is part of the wire type.
type ClaudeStreamEvent =
| { type: 'system'; subtype?: string; model?: string; tools?: unknown[]; session_id?: string } |
{ type: 'assistant'; message?: ClaudeMessage } |
{ type: 'user'; message?: ClaudeMessage } |
{ type: 'result'; subtype?: string; is_error?: boolean; result?: string; duration_ms?: number; total_cost_usd?: number; num_turns?: number; session_id?: string; usage?: { input_tokens?: number; output_tokens?: number } } |
{ type: 'stream_event'; event: StreamSubEvent } |
{ type: 'user_prompt'; text?: string } |
{ type: 'competition_start'; index?: number; count?: number; firstTitle?: string; secondTitle?: string; prompt?: string } |
{ type: 'competition_result'; index?: number; count?: number; match?: { firstTitle?: string; secondTitle?: string; winnerTitle?: string; rationale?: string } } |
{ type: '_exit'; code: number; error: string | null } |
{ type: string; [key: string]: unknown };

type TranscriptItem =
| { kind: 'system'; id: string; model?: string; toolCount?: number } |
{ kind: 'user'; id: string; text: string; fullText?: string } |
{ kind: 'text'; id: string; text: string } |
{ kind: 'thinking'; id: string; text: string } |
{ kind: 'tool_use'; id: string; toolUseId: string; name: string; input: string } |
{ kind: 'tool_result'; id: string; toolUseId: string; content: string; isError: boolean } |
{ kind: 'result'; id: string; isError: boolean; text: string; durationMs?: number; costUsd?: number; numTurns?: number; inputTokens?: number; outputTokens?: number };

// items is what the tab renders; currentMessageId keys the in-flight assistant message's blocks so deltas and the later
// consolidated message land on the same items. sessionId is claude's session id captured from the stream, used to resume
// the conversation when the finished activity is continued as a chat.
type TranscriptState = { items: TranscriptItem[]; currentMessageId: string; sessionId: string };

const emptyTranscript = function (): TranscriptState {
    return { items: [], currentMessageId: '', sessionId: '' };
};

// Append a user message (the initial prompt, or a chat follow-up) as a right-aligned bubble. Driven imperatively by the
// queue provider - the user's own turns are not part of claude's event stream.
const appendUserMessage = function (state: TranscriptState, text: string, id: string): TranscriptState {
    return { ...state, items: [...state.items, { kind: 'user', id, text }] };
};

// Drop one item by id (used to retract a queued chat follow-up before it is sent). Pure, like the rest of this file:
// returns the same state when the id is not present, so the caller can skip notifying subscribers.
const removeItem = function (state: TranscriptState, itemId: string): TranscriptState {
    const items = state.items.filter(function (item) { return item.id !== itemId; });
    return items.length === state.items.length ? state : { ...state, items };
};

// A tool_result's content is either a string or an array of content blocks; flatten it to readable text.
const stringifyToolResult = function (content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content.map(function (part) {
            if (part !== null && typeof part === 'object' && 'text' in part) {
                return String((part as { text: unknown }).text);
            }
            return JSON.stringify(part);
        }).join('\n');
    }
    return JSON.stringify(content);
};

const blockId = function (messageId: string, index: number): string {
    return `${messageId}:${index}`;
};

const reduceStreamEvent = function (state: TranscriptState, sub: StreamSubEvent): TranscriptState {
    if (sub.type === 'message_start') {
        const start = sub as { message?: ClaudeMessage };
        const messageId = start.message?.id ?? state.currentMessageId;
        return { ...state, currentMessageId: messageId };
    }
    if (sub.type === 'content_block_start') {
        const start = sub as { index: number; content_block: ContentBlock };
        const id = blockId(state.currentMessageId, start.index);
        if (state.items.some(function (item) { return item.id === id; })) {
            return state;
        }
        const block = start.content_block;
        if (block.type === 'text') {
            return { ...state, items: [...state.items, { kind: 'text', id, text: typeof block.text === 'string' ? block.text : '' }] };
        }
        if (block.type === 'tool_use') {
            const toolBlock = block as { id: string; name: string };
            return { ...state, items: [...state.items, { kind: 'tool_use', id, toolUseId: toolBlock.id, name: toolBlock.name, input: '' }] };
        }
        // Extended-thinking blocks (present when the CLI/model config enables thinking - outside vibrary's control)
        // get their own item rather than silently vanishing: without one, the visible symptom is a long silent pause
        // in the typewriter view while tokens are in fact streaming.
        if (block.type === 'thinking') {
            const thinkingBlock = block as { thinking?: string };
            return { ...state, items: [...state.items, { kind: 'thinking', id, text: typeof thinkingBlock.thinking === 'string' ? thinkingBlock.thinking : '' }] };
        }
        return state;
    }
    if (sub.type === 'content_block_delta') {
        const change = sub as { index: number; delta: { type: string; text?: string; partial_json?: string; thinking?: string } };
        const id = blockId(state.currentMessageId, change.index);
        const patch = function (item: TranscriptItem): TranscriptItem | null {
            if (item.kind === 'text' && change.delta.type === 'text_delta') {
                return { ...item, text: item.text + (change.delta.text ?? '') };
            }
            if (item.kind === 'tool_use' && change.delta.type === 'input_json_delta') {
                return { ...item, input: item.input + (change.delta.partial_json ?? '') };
            }
            if (item.kind === 'thinking' && change.delta.type === 'thinking_delta') {
                return { ...item, text: item.text + (change.delta.thinking ?? '') };
            }
            return null;
        };
        // One delta arrives per streamed TOKEN and virtually always targets the block most recently started - the
        // last item. Checking it first makes the common case O(1) instead of an O(items) map, which matters for the
        // multi-thousand-item transcripts an hour-long run accumulates (measured linear: ~2.8us/delta at 200 items,
        // ~24.8us at 2000). The fallback scan keeps pathological orderings correct, and a delta matching no item
        // (e.g. an unrendered block type) returns the SAME state so subscribers are not notified for a no-op.
        const last = state.items.at(-1);
        if (last?.id === id) {
            const updated = patch(last);
            return updated === null ? state : { ...state, items: [...state.items.slice(0, -1), updated] };
        }
        const index = state.items.findIndex(function (item) { return item.id === id; });
        if (index === -1) {
            return state;
        }
        const updated = patch(state.items[index]);
        return updated === null ? state : { ...state, items: state.items.map(function (item, position) { return position === index ? updated : item; }) };
    }
    return state;
};

// Reconcile the just-streamed assistant message: replace each block's accumulated content with the authoritative value
// (fixing any delta gaps and turning a tool's partial json into pretty-printed input), creating items if deltas were
// absent.
const reduceAssistant = function (state: TranscriptState, message: ClaudeMessage | undefined): TranscriptState {
    if (!message || !Array.isArray(message.content)) {
        return state;
    }
    const messageId = message.id ?? state.currentMessageId;
    let items = state.items;
    let isChanged = false;
    for (const [index, block] of message.content.entries()) {
        const id = blockId(messageId, index);
        const existing = items.findIndex(function (item) { return item.id === id; });
        if (block.type === 'text') {
            const text = typeof block.text === 'string' ? block.text : '';
            if (existing === -1) {
                items = [...items, { kind: 'text', id, text }];
                isChanged = true;
            } else if (items[existing].kind === 'text' && (items[existing] as { text: string }).text !== text) {
                items = items.map(function (item, position) { return position === existing ? { ...item, text } : item; });
                isChanged = true;
            }
        } else if (block.type === 'tool_use') {
            const toolBlock = block as { id: string; name: string; input?: unknown };
            const input = JSON.stringify(toolBlock.input ?? {}, null, 2);
            const next: TranscriptItem = { kind: 'tool_use', id, toolUseId: toolBlock.id, name: toolBlock.name, input };
            items = existing === -1 ?
                [...items, next] :
                items.map(function (item, position) { return position === existing ? next : item; });
            isChanged = true;
        } else if (block.type === 'thinking') {
            const thinkingBlock = block as { thinking?: string };
            const text = typeof thinkingBlock.thinking === 'string' ? thinkingBlock.thinking : '';
            if (existing === -1) {
                items = [...items, { kind: 'thinking', id, text }];
                isChanged = true;
            } else if (items[existing].kind === 'thinking' && (items[existing] as { text: string }).text !== text) {
                items = items.map(function (item, position) { return position === existing ? { ...item, text } : item; });
                isChanged = true;
            }
        }
    }
    return isChanged ? { ...state, items } : state;
};

// Append tool results carried by a "user" event, keyed by the originating tool_use id so each lands once.
const reduceUser = function (state: TranscriptState, message: ClaudeMessage | undefined): TranscriptState {
    if (!message || !Array.isArray(message.content)) {
        return state;
    }
    let items = state.items;
    let isChanged = false;
    for (const block of message.content) {
        if (block.type !== 'tool_result') {
            continue;
        }
        const toolBlock = block as { tool_use_id: string; content?: unknown; is_error?: boolean };
        const id = `result:${toolBlock.tool_use_id}`;
        if (items.some(function (item) { return item.id === id; })) {
            continue;
        }
        items = [...items, { kind: 'tool_result', id, toolUseId: toolBlock.tool_use_id, content: stringifyToolResult(toolBlock.content), isError: Boolean(toolBlock.is_error) }];
        isChanged = true;
    }
    return isChanged ? { ...state, items } : state;
};

// Fold one claude stream event into the transcript. Pure: returns the same state object when nothing changed, so the
// store can skip notifying subscribers.
const reduceTranscript = function (state: TranscriptState, event: ClaudeStreamEvent): TranscriptState {
    switch (event.type) {
        case 'system': {
            const system = event as { subtype?: string; model?: string; tools?: unknown[]; session_id?: string };
            if (system.subtype !== undefined && system.subtype !== 'init') {
                return state;
            }
            // Capture the session id so a finished activity can be resumed as a chat. A resumed run re-emits init with the
            // same id, so this is a no-op after the first turn (and the banner guard below skips the duplicate item).
            const sessionId = typeof system.session_id === 'string' && system.session_id !== '' ? system.session_id : state.sessionId;
            if (state.items.some(function (item) { return item.kind === 'system'; })) {
                return sessionId === state.sessionId ? state : { ...state, sessionId };
            }
            const toolCount = Array.isArray(system.tools) ? system.tools.length : undefined;
            return { ...state, sessionId, items: [...state.items, { kind: 'system', id: 'system', model: system.model, toolCount }] };
        }
        case 'stream_event': {
            return reduceStreamEvent(state, (event as { event: StreamSubEvent }).event);
        }
        case 'assistant': {
            return reduceAssistant(state, (event as { message?: ClaudeMessage }).message);
        }
        case 'user': {
            return reduceUser(state, (event as { message?: ClaudeMessage }).message);
        }
        case 'result': {
            const summary = event as { is_error?: boolean; result?: string; duration_ms?: number; total_cost_usd?: number; num_turns?: number; session_id?: string; usage?: { input_tokens?: number; output_tokens?: number } };
            // Key the result per turn (off the turn's message id) so a chat continuation's later result appends as its own
            // item rather than colliding with the prior turn's on the fixed 'result' key.
            const item: TranscriptItem = {
                kind: 'result',
                id: `result:${state.currentMessageId}`,
                isError: Boolean(summary.is_error),
                text: typeof summary.result === 'string' ? summary.result : '',
                durationMs: summary.duration_ms,
                costUsd: summary.total_cost_usd,
                numTurns: summary.num_turns,
                // The CLI's result event carries the run's token usage; kept per result item (not aggregated) so a
                // chat continuation's turns each report their own figures.
                inputTokens: typeof summary.usage?.input_tokens === 'number' ? summary.usage.input_tokens : undefined,
                outputTokens: typeof summary.usage?.output_tokens === 'number' ? summary.usage.output_tokens : undefined
            };
            const sessionId = typeof summary.session_id === 'string' && summary.session_id !== '' ? summary.session_id : state.sessionId;
            return { ...state, sessionId, items: [...state.items, item] };
        }
        case 'user_prompt': {
            // The backend echoes the exact prompt it sent to claude; fold it into the seeded initial bubble (id 'prompt')
            // as its "full" view alongside the concise text. Create the bubble if it was not seeded (defensive).
            const text = typeof (event as { text?: string }).text === 'string' ? (event as { text: string }).text : '';
            if (text === '') {
                return state;
            }
            const index = state.items.findIndex(function (item) { return item.id === 'prompt'; });
            if (index === -1) {
                return { ...state, items: [...state.items, { kind: 'user', id: 'prompt', text }] };
            }
            const existing = state.items[index];
            if (existing.kind !== 'user' || existing.fullText === text) {
                return state;
            }
            const items = state.items.map(function (item, position) {
                return position === index ? { ...item, fullText: text } : item;
            });
            return { ...state, items };
        }
        // The rankings' competitions run is a batch of buffered judge calls, so it emits no per-token stream; these
        // two synthetic lines are its whole progress story. The start line renders as a user bubble because it IS the
        // prompt sent for that pairing (its full text inspectable exactly like the initial prompt's Full view), and
        // the result line as plain text carrying the verdict and its rationale.
        case 'competition_start': {
            const start = event as { index?: number; count?: number; firstTitle?: string; secondTitle?: string; prompt?: string };
            const id = `competition:${start.index ?? state.items.length}`;
            if (state.items.some(function (item) { return item.id === id; })) {
                return state;
            }
            const text = `Match ${start.index}/${start.count}: ${start.firstTitle} vs ${start.secondTitle}`;
            const fullText = typeof start.prompt === 'string' && start.prompt !== '' ? start.prompt : undefined;
            return { ...state, items: [...state.items, { kind: 'user', id, text, fullText }] };
        }
        case 'competition_result': {
            const settled = event as { index?: number; match?: { winnerTitle?: string; rationale?: string } };
            const id = `competition-result:${settled.index ?? state.items.length}`;
            if (state.items.some(function (item) { return item.id === id; })) {
                return state;
            }
            const winner = settled.match?.winnerTitle ?? '';
            const rationale = settled.match?.rationale ?? '';
            const text = rationale === '' ? `Winner: ${winner}` : `Winner: ${winner}\n\n${rationale}`;
            return { ...state, items: [...state.items, { kind: 'text', id, text }] };
        }
        default: {
            return state;
        }
    }
};

export { appendUserMessage, type ClaudeStreamEvent, emptyTranscript, reduceTranscript, removeItem, type TranscriptItem, type TranscriptState };
