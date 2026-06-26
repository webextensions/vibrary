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
{ type: 'content_block_delta'; index: number; delta: { type: string; text?: string; partial_json?: string } } |
{ type: string; [key: string]: unknown };

// The events api.ts forwards to the reducer. `_exit` is the backend's own terminal line; it never reaches the reducer
// (api.ts consumes it), but it is part of the wire type.
type ClaudeStreamEvent =
| { type: 'system'; subtype?: string; model?: string; tools?: unknown[] } |
{ type: 'assistant'; message?: ClaudeMessage } |
{ type: 'user'; message?: ClaudeMessage } |
{ type: 'result'; subtype?: string; is_error?: boolean; result?: string; duration_ms?: number; total_cost_usd?: number; num_turns?: number } |
{ type: 'stream_event'; event: StreamSubEvent } |
{ type: '_exit'; code: number; error: string | null } |
{ type: string; [key: string]: unknown };

type TranscriptItem =
| { kind: 'system'; id: string; model?: string; toolCount?: number } |
{ kind: 'text'; id: string; text: string } |
{ kind: 'tool_use'; id: string; toolUseId: string; name: string; input: string } |
{ kind: 'tool_result'; id: string; toolUseId: string; content: string; isError: boolean } |
{ kind: 'result'; id: string; isError: boolean; text: string; durationMs?: number; costUsd?: number; numTurns?: number };

// items is what the tab renders; currentMessageId keys the in-flight assistant message's blocks so deltas and the later
// consolidated message land on the same items.
type TranscriptState = { items: TranscriptItem[]; currentMessageId: string };

const emptyTranscript = function (): TranscriptState {
    return { items: [], currentMessageId: '' };
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
        return state;
    }
    if (sub.type === 'content_block_delta') {
        const change = sub as { index: number; delta: { type: string; text?: string; partial_json?: string } };
        const id = blockId(state.currentMessageId, change.index);
        const items = state.items.map(function (item) {
            if (item.id !== id) {
                return item;
            }
            if (item.kind === 'text' && change.delta.type === 'text_delta') {
                return { ...item, text: item.text + (change.delta.text ?? '') };
            }
            if (item.kind === 'tool_use' && change.delta.type === 'input_json_delta') {
                return { ...item, input: item.input + (change.delta.partial_json ?? '') };
            }
            return item;
        });
        return { ...state, items };
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
            const system = event as { subtype?: string; model?: string; tools?: unknown[] };
            if (system.subtype !== undefined && system.subtype !== 'init') {
                return state;
            }
            if (state.items.some(function (item) { return item.kind === 'system'; })) {
                return state;
            }
            const toolCount = Array.isArray(system.tools) ? system.tools.length : undefined;
            return { ...state, items: [...state.items, { kind: 'system', id: 'system', model: system.model, toolCount }] };
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
            const summary = event as { is_error?: boolean; result?: string; duration_ms?: number; total_cost_usd?: number; num_turns?: number };
            const item: TranscriptItem = {
                kind: 'result',
                id: 'result',
                isError: Boolean(summary.is_error),
                text: typeof summary.result === 'string' ? summary.result : '',
                durationMs: summary.duration_ms,
                costUsd: summary.total_cost_usd,
                numTurns: summary.num_turns
            };
            return { ...state, items: [...state.items, item] };
        }
        default: {
            return state;
        }
    }
};

export { type ClaudeStreamEvent, emptyTranscript, reduceTranscript, type TranscriptItem, type TranscriptState };
