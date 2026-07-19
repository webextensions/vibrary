import { type ClaudeStreamEvent } from './activity/activityStream.ts';
import { type AppSettings } from './settings/settings.ts';
import { type EntryType } from './xml/vibraryXml.ts';

type ApiResponse<T> = { status: 'success'; output: T } | { status: 'error'; errorMessage: string };

// Error envelope failures carry the HTTP status so callers can branch on semantically meaningful codes (the save
// flow's 409 conflict) instead of string-matching the message.
class ApiError extends Error {
    status: number;

    constructor(message: string, options: ErrorOptions & { status: number }) {
        super(message, options);
        this.name = 'ApiError';
        this.status = options.status;
    }
}

// Options for the streaming agent calls: an abort signal (for the queue's abort/refresh) and an onEvent callback that
// receives each parsed claude stream-json event as it arrives.
type StreamOptions = { signal?: AbortSignal; onEvent?: (event: ClaudeStreamEvent) => void };

const request = async function <T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    let body: ApiResponse<T>;
    try {
        body = (await response.json()) as ApiResponse<T>;
    } catch {
        // Non-JSON body (an HTML error page from Express or a proxy, or a connection cut mid-response): surface the
        // HTTP status instead of letting the JSON parser's SyntaxError reach the UI. Mirrors streamClaude below.
        throw new ApiError(`Request failed (${response.status})`, { status: response.status });
    }
    if (body.status !== 'success') {
        throw new ApiError(body.errorMessage || `Request failed (${response.status})`, { status: response.status });
    }
    return body.output;
};

// Send a JSON payload and parse the JSON envelope back - the shape shared by every non-streaming mutation. `init`
// carries the rare per-call extras (an abort signal, keepalive for the pagehide flush).
const requestJson = function <T>(url: string, method: 'POST' | 'PUT' | 'DELETE', payload: unknown, init?: Pick<RequestInit, 'signal' | 'keepalive'>): Promise<T> {
    return request<T>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        ...init
    });
};

// POST `body` and consume the backend's newline-delimited JSON stream (claude's own stream-json lines plus a terminal
// {"type":"_exit"} line). Each parsed claude event is handed to onEvent; the final "result" event's text is returned.
// A validation failure comes back as the JSON error envelope (not a stream), surfaced as a thrown Error.
const streamClaude = async function (url: string, body: unknown, options: StreamOptions): Promise<string> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal
    });

    const contentType = response.headers.get('Content-Type') ?? '';
    if (!response.ok || contentType.includes('application/json')) {
        let message = `Request failed (${response.status})`;
        try {
            const envelope = (await response.json()) as ApiResponse<unknown>;
            if (envelope.status === 'error') {
                message = envelope.errorMessage;
            }
        } catch {
            // Non-JSON body: keep the generic status message.
        }
        throw new Error(message);
    }
    if (response.body === null) {
        throw new Error('Streaming response had no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let resultText = '';
    let wasExitSeen = false;

    const handleLine = function (line: string) {
        const trimmed = line.trim();
        if (trimmed === '') {
            return;
        }
        let event: ClaudeStreamEvent;
        try {
            event = JSON.parse(trimmed) as ClaudeStreamEvent;
        } catch {
            return; // Ignore a malformed line rather than failing the whole run.
        }
        if (event.type === '_exit') {
            wasExitSeen = true;
            const exit = event as { error: string | null };
            if (exit.error !== null) {
                throw new Error(exit.error);
            }
            return;
        }
        if (event.type === 'result' && typeof (event as { result?: unknown }).result === 'string') {
            resultText = (event as { result: string }).result;
        }
        options.onEvent?.(event);
    };

    try {
        let isDone = false;
        while (!isDone) {
            const chunk = await reader.read();
            isDone = chunk.done;
            if (chunk.value !== undefined) {
                buffer += decoder.decode(chunk.value, { stream: true });
                let index = buffer.indexOf('\n');
                while (index !== -1) {
                    handleLine(buffer.slice(0, index));
                    buffer = buffer.slice(index + 1);
                    index = buffer.indexOf('\n');
                }
            }
        }
        handleLine(buffer);
        // The backend terminates every real outcome (success, error, timeout) with an _exit line. A stream that ends
        // cleanly without one means the connection died mid-run (backend restart, crash, dropped proxy upstream) -
        // report that as a failure instead of settling the job as a success with an empty result.
        if (!wasExitSeen) {
            throw new Error('The connection to the server was lost while the agent was running');
        }
    } catch (error) {
        try {
            await reader.cancel();
        } catch {
            // The reader may already be errored/closed; the original error is what matters.
        }
        throw error;
    }
    return resultText;
};

// The listing plus whether a ".vibraryinclude" file exists at all, so the explorer's empty state can tell "nothing
// included yet because no .vibraryinclude exists" apart from "a .vibraryinclude exists but matches nothing".
type FileListing = { files: string[]; hasVibraryInclude: boolean };

const listFiles = function (): Promise<FileListing> {
    return request<FileListing>('/api/files');
};

const getWorkspace = async function (): Promise<string> {
    const output = await request<{ cwd: string }>('/api/workspace');
    return output.cwd;
};

// The running server's package version, shown in the help dialog footer.
const getVersion = async function (): Promise<string> {
    const output = await request<{ version: string }>('/api/version');
    return output.version;
};

// One shipped manual page as raw markdown, from the installed package (not the served folder) - `name` is one of the
// backend's small allowlist (backend/documentation/documentation.js), offered by the Help dialog's Guide tab.
const getManualPage = async function (name: string): Promise<string> {
    const output = await request<{ content: string }>(`/api/docs/${encodeURIComponent(name)}`);
    return output.content;
};

// The file's content plus its opaque version token (fileHash), which saveFile echoes back so the server can detect
// that the file changed on disk after this read.
const getFile = async function (name: string): Promise<{ content: string; fileHash: string }> {
    const output = await request<{ name: string; content: string; fileHash: string }>(`/api/files/${encodeURIComponent(name)}`);
    return { content: output.content, fileHash: output.fileHash };
};

// Read a form-schemas sidecar (e.g. "docs/tasks/tasks.xml.schemas.json") referenced by an entry's formSchemaRef. Served
// by a dedicated read-only endpoint, separate from the vibrary file listing. Rejects (e.g. 404) when the sidecar is
// absent; callers resolving an entry's schema treat that as "no form".
const getSchemaFile = async function (name: string): Promise<string> {
    const output = await request<{ name: string; content: string }>(`/api/schema-file/${encodeURIComponent(name)}`);
    return output.content;
};

// Write the starter .vibraryinclude (create-only on the server; 409 if one exists). Backs the explorer empty state's
// one-click bootstrap for a folder that has no include file yet.
const createVibraryInclude = async function (): Promise<void> {
    await request<Record<string, never>>('/api/vibrary-include', { method: 'POST' });
};

// Create a new, empty specs file (create-only on the server: it refuses to overwrite an existing file). The caller
// refreshes the file list and opens the new file once this resolves.
const createFile = async function (name: string): Promise<void> {
    await requestJson<{ name: string }>('/api/files', 'POST', { name });
};

// Save a file, echoing the version token from the load (getFile's fileHash) so the server rejects with a 409 when the
// file changed on disk in between - the caller then asks the user before force-saving (no baseFileHash = blind write).
// Resolves with the saved content's new token, which becomes the tab's base for the next save.
const saveFile = async function (name: string, content: string, baseFileHash?: string): Promise<string> {
    const payload = baseFileHash === undefined ? { content } : { content, baseFileHash };
    const output = await requestJson<{ name: string; fileHash: string }>(`/api/files/${encodeURIComponent(name)}`, 'PUT', payload);
    return output.fileHash;
};

// Delete a specs file. The caller (the explorer's "More" menu) confirms with the user first, then refreshes the file
// list and closes any open tab for the file once this resolves.
const deleteFile = async function (name: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
};

// Rename (or move - the new name may live in another folder) a specs file. The server refuses to overwrite an
// existing target; the caller refreshes the file list and reopens the file under its new name once this resolves.
const renameFile = async function (name: string, newName: string): Promise<void> {
    await requestJson<{ name: string }>(`/api/files/${encodeURIComponent(name)}/rename`, 'POST', { newName });
};

// Duplicate a specs file under a new name (a copy - the source is untouched). The server refuses to overwrite an
// existing target; the caller refreshes the file list and opens the copy once this resolves.
const duplicateFile = async function (name: string, newName: string): Promise<void> {
    await requestJson<{ name: string }>(`/api/files/${encodeURIComponent(name)}/duplicate`, 'POST', { newName });
};

// Move the entries at `indexes` out of `name` and into `targetName`, both on disk. The server writes the target first
// (a failure duplicates rather than loses) and guards the source with baseFileHash; the caller must have the source
// saved so the indexes line up, and reloads both files afterward. Resolves with how many entries moved.
const moveEntries = async function (name: string, targetName: string, indexes: number[], baseFileHash?: string): Promise<number> {
    const output = await requestJson<{ movedCount: number }>(`/api/files/${encodeURIComponent(name)}/move-entries`, 'POST', { targetName, indexes, baseFileHash });
    return output.movedCount;
};

// Runs the backend's headless AI agent to append `count` new specs to the file, streaming its activity through
// `options.onEvent`. Resolves with the run's final result text once the file has been updated on disk; the caller
// reloads it to pick up the additions. `instructions` carries optional custom one-time guidance, the same field every
// other run/apply call accepts; folded into the agent's prompt when non-empty.
const generateSpecs = function (name: string, type: EntryType, count: number, instructions: string, options: StreamOptions): Promise<string> {
    return streamClaude(`/api/files/${encodeURIComponent(name)}/generate`, { type, count, instructions }, options);
};

// Runs the backend's headless AI agent to carry out a single task, editing files directly and streaming its activity
// through `options.onEvent`. Resolves with the run's final result text once the agent finishes. `instructions` carries
// optional custom one-time guidance; `task.options` carries the directive block derived from the task's per-run options
// form. Both are folded into the agent's prompt when non-empty. `useRalphLoop` is the structured per-run opt-in
// derived from the options form's `useRalphLoop` property key (the backend keys its loop behavior on this flag, never
// on the rendered options text).
const runTask = function (task: { title: string; content: string; notes: string; instructions: string; options: string; useRalphLoop: boolean }, options: StreamOptions): Promise<string> {
    return streamClaude('/api/run-task', { title: task.title, content: task.content, notes: task.notes, instructions: task.instructions, options: task.options, useRalphLoop: task.useRalphLoop }, options);
};

// Runs the backend's headless AI agent to make the codebase conform to the selected specs in a single run, editing
// files directly and streaming its activity through `options.onEvent`. Resolves with the run's final result text once
// the agent finishes. The single-card Apply is a batch of one - there is no separate single-spec route. `instructions`
// carries optional custom one-time guidance for the whole run; folded into the agent's prompt when non-empty.
const applySpecs = function (entries: { title: string; content: string; notes: string }[], instructions: string, options: StreamOptions): Promise<string> {
    return streamClaude('/api/apply-batch', { entries, instructions }, options);
};

// Runs the backend's plan-only agent for a single spec: it researches the codebase WITHOUT editing files and answers
// with a concise implementation plan, which resolves as the final result text - the caller places it into the
// entry's notes for review. Streams its research activity through `options.onEvent` like every agent run.
const planSpec = function (entry: { title: string; content: string; notes: string; instructions: string }, options: StreamOptions): Promise<string> {
    return streamClaude('/api/plan-spec', entry, options);
};

// Runs a free-prompt one-off agent job - the text goes to the agent verbatim, for changes too small to deserve a
// spec - streaming its activity through `options.onEvent` like every other run.
const runQuick = function (prompt: string, options: StreamOptions): Promise<string> {
    return streamClaude('/api/quick-run', { prompt }, options);
};

// Continues a finished activity as a chat by resuming its claude session with a follow-up message, streaming the reply
// through `options.onEvent`. `sessionId` is the id captured from the original run's stream. Resolves with the reply's
// final result text.
const chatContinue = function (body: { message: string; sessionId: string }, options: StreamOptions): Promise<string> {
    return streamClaude('/api/chat', body, options);
};

// One proposed part of a split entry, as validated by the backend (normalized non-empty title, non-empty content).
type SplitPart = { title: string; content: string; notes: string };

// Runs the backend's buffered agent to propose 2-4 focused entries out of one oversized spec/task. Nothing is
// written; the caller previews the parts and inserts only what the user confirms.
const splitSpec = async function (entry: { title: string; content: string; notes: string }, signal?: AbortSignal): Promise<SplitPart[]> {
    const output = await requestJson<{ parts: SplitPart[] }>('/api/split-spec', 'POST', entry, { signal });
    return output.parts;
};

// Runs the backend's headless AI agent to derive a hyphenated title from a spec's content, backing the editor's
// "Populate" button. Resolves with the slugified title the agent produced.
const populateTitle = async function (content: string, signal?: AbortSignal): Promise<string> {
    const output = await requestJson<{ title: string }>('/api/title', 'POST', { content }, { signal });
    return output.title;
};

// Read the per-project UI preferences from `.vibrary/settings.local.json`. A missing/corrupt file comes back as `{}`
// from the backend, which the caller normalizes against the defaults.
const getSettings = async function (): Promise<unknown> {
    const output = await request<{ settings: unknown }>('/api/settings');
    return output.settings;
};

// Persist the per-project UI preferences, writing the whole settings object to `.vibrary/settings.local.json`.
// `keepalive` lets a flush at pagehide outlive the page (the payload is a small settings object, well under the
// browser's ~64 KiB keepalive budget).
const saveSettings = async function (settings: AppSettings, options?: { keepalive?: boolean }): Promise<void> {
    await requestJson<Record<string, never>>('/api/settings', 'PUT', { settings }, { keepalive: options?.keepalive === true });
};

// One entry title paired with the file it lives in.
type TitleIndexEntry = { title: string; path: string };

// One-request workspace summary: every included file's name, entry titles, and approved/total tallies, plus whether
// a .vibraryinclude exists. Replaces the old pattern of re-downloading every file's full content client-side to
// derive the title index and the sidebar badges. Null tallies mark a file the server could not read/parse.
type FileSummary = { name: string; titles: string[]; labels: string[]; approved: number | null; total: number | null; brokenReferences: number | null };
// One entry that references a given title, for the editor's "Referenced by" backlinks. Keyed by target title in the
// Backlinks map; a title with no incoming references is simply absent from the map.
type BacklinkSource = { file: string; title: string };
type Backlinks = Record<string, BacklinkSource[]>;
type FilesSummary = { files: FileSummary[]; backlinks: Backlinks; hasVibraryInclude: boolean };

const getFilesSummary = function (): Promise<FilesSummary> {
    return request<FilesSummary>('/api/files-summary');
};

// One changed file from `git status`, in simple-git's native shape: `index` is the staged (index) column and
// `working_dir` the unstaged (worktree) column, which the Source Control panel uses to group rows into
// Staged / Changes / Untracked.
type GitFileStatus = {
    path: string;
    index: string;
    working_dir: string
};

// `tracking` is the upstream branch (null when none is set - Push then publishes the branch), and ahead/behind count
// commits relative to it.
type GitStatus = { current: string | null; tracking: string | null; ahead: number; behind: number; files: GitFileStatus[] };

// One stash entry; `index` is its stash@{N} position, which apply/pop/drop take.
type GitStash = { index: number; message: string; date: string };

// Status plus stash list, returned by every stash mutation since each changes at least one of the two.
type GitStashResult = { status: GitStatus; stashes: GitStash[] };

// One matching ENTRY inside a file: its index within the file's parsed entries (what a clicked result hands the
// editor to highlight), its title, the field the match was found in, and a trimmed, length-capped snippet line.
type SearchMatch = { entryIndex: number; type: EntryType; title: string; field: 'title' | 'content' | 'notes' | 'labels'; snippet: string };
type SearchFileResult = { path: string; matches: SearchMatch[] };
// One persisted-transcript match (the in:transcripts scope): the record's listing metadata plus the first matching
// line's snippet. Present (possibly empty) exactly when the query carried the transcript scope.
type TranscriptSearchMatch = TranscriptSummary & { snippet: string };
type SearchResult = { results: SearchFileResult[]; truncated: boolean; transcripts?: TranscriptSearchMatch[] };

// Full-text search across the included vibrary files (the same set the Explorer lists). The backend caps the result
// set and flags `truncated` when it does. An optional `files` list narrows the search to just those file names; an
// empty/omitted list searches everywhere.
const searchFiles = function (query: string, files: string[] = [], precision: { matchCase?: boolean; wholeWord?: boolean } = {}): Promise<SearchResult> {
    const filesParameter = files.length > 0 ? `&files=${encodeURIComponent(files.join(','))}` : '';
    // The flags are sent only when set, so the default request stays byte-identical to the pre-precision one.
    const precisionParameter = `${precision.matchCase ? '&matchCase=1' : ''}${precision.wholeWord ? '&wholeWord=1' : ''}`;
    return request<SearchResult>(`/api/search?q=${encodeURIComponent(query)}${filesParameter}${precisionParameter}`);
};

// Current branch and changed files. Rejects with "Not a git repository" when the served folder is not a git repo.
const getGitStatus = function (): Promise<GitStatus> {
    return request<GitStatus>('/api/git/status');
};

// Stage / unstage the given paths, resolving with the refreshed status so the panel can re-render in one round trip.
const stagePaths = function (paths: string[]): Promise<GitStatus> {
    return requestJson<GitStatus>('/api/git/stage', 'POST', { paths });
};

const unstagePaths = function (paths: string[]): Promise<GitStatus> {
    return requestJson<GitStatus>('/api/git/unstage', 'POST', { paths });
};

// Commit the staged changes with a summary and optional extended body, resolving with the refreshed status.
const commitChanges = function (message: { summary: string; body: string }): Promise<GitStatus> {
    return requestJson<GitStatus>('/api/git/commit', 'POST', message);
};

// Push the current branch, resolving with the refreshed status (the ahead count drops, and publishing a branch sets
// its upstream); rejects with git's stderr on failure.
const pushChanges = function (): Promise<GitStatus> {
    return request<GitStatus>('/api/git/push', { method: 'POST' });
};

// One file's staged or worktree diff; for an untracked file (no diff exists) the response carries the file's full
// content instead, flagged untracked so the dialog can title it accordingly.
type GitFileDiff = { diff: string; untracked: boolean };

const getGitDiff = function (path: string, options: { staged?: boolean; untracked?: boolean }): Promise<GitFileDiff> {
    const parameters = new URLSearchParams({ path, staged: String(options.staged === true), untracked: String(options.untracked === true) });
    return request<GitFileDiff>(`/api/git/diff?${parameters.toString()}`);
};

// Pull the current branch, resolving with the refreshed status (a pull can change the working tree).
const pullChanges = function (): Promise<GitStatus> {
    return request<GitStatus>('/api/git/pull', { method: 'POST' });
};

// Discard working-tree changes: tracked paths are restored from the index/HEAD, untracked paths are deleted.
// Destructive - callers confirm with the user first.
const discardPaths = function (paths: string[]): Promise<GitStatus> {
    return requestJson<GitStatus>('/api/git/discard', 'POST', { paths });
};

const listStashes = function (): Promise<GitStash[]> {
    return request<GitStash[]>('/api/git/stashes');
};

// Stash all current changes (staged + unstaged + untracked) under an optional message.
const stashChanges = function (message?: string): Promise<GitStashResult> {
    return requestJson<GitStashResult>('/api/git/stash', 'POST', message === undefined ? {} : { message });
};

// Apply / pop / drop a stash by its stash@{N} position.
const stashAction = function (action: 'apply' | 'pop' | 'drop', index: number): Promise<GitStashResult> {
    return requestJson<GitStashResult>(`/api/git/stash/${action}`, 'POST', { index });
};

// Draft a commit summary + extended body from the staged diff via the backend's headless agent (buffered, like
// populateTitle). Rejects when nothing is staged.
const generateCommitMessage = function (signal?: AbortSignal): Promise<{ summary: string; body: string }> {
    return request<{ summary: string; body: string }>('/api/git/generate-message', { method: 'POST', signal });
};

// One persisted agent-run transcript in the history list; `name` doubles as the record's id for read/delete.
type TranscriptSummary = { name: string; startedAt: string; outcome: 'success' | 'error' | 'aborted'; route: string };
// A full stored record: the run's raw NDJSON lines plus its outcome metadata, replayable through the same reducer
// the live transcript uses.
type StoredTranscript = { route: string; startedAt: string; endedAt: string; outcome: string; error: string | null; truncated: boolean; lines: string[] };

const listTranscripts = async function (): Promise<TranscriptSummary[]> {
    const output = await request<{ transcripts: TranscriptSummary[] }>('/api/transcripts');
    return output.transcripts;
};

const getTranscript = async function (name: string): Promise<StoredTranscript> {
    const output = await request<{ transcript: StoredTranscript }>(`/api/transcripts/${encodeURIComponent(name)}`);
    return output.transcript;
};

const deleteTranscript = async function (name: string): Promise<void> {
    await request<Record<string, never>>(`/api/transcripts/${encodeURIComponent(name)}`, { method: 'DELETE' });
};

const clearTranscripts = async function (): Promise<void> {
    await request<Record<string, never>>('/api/transcripts', { method: 'DELETE' });
};

// One row of the Elo standings: the entry's title plus its replayed rating and record.
type RankingRow = { title: string; rating: number; wins: number; losses: number; games: number };
// One recorded comparison. `orphanedTitles` names any contender that no longer resolves to an entry (renamed or
// removed since the match) - the record is kept and flagged, and sits out of the replay until repaired or discarded.
type RankingsMatch = { id: string; playedAt: string; firstTitle: string; secondTitle: string; winnerTitle: string; judge: 'AI' | 'Human'; rationale: string; orphanedTitles: string[] };
// The whole rankings picture in one payload; every mutation answers with the same recomputed shape.
type RankingsPayload = { standings: RankingRow[]; matches: RankingsMatch[]; types: EntryType[]; labels: string[]; suggestedPairings: [string, string][] };

// The scope narrowing which entries compete: entry types (empty = the backend's idea default) and optional labels
// (an entry must carry at least one; empty imposes nothing, like the editor's filters).
type RankingsScope = { types: EntryType[]; labels: string[] };

// Scope legs travel as comma-separated values (query param and body alike); an empty selection is omitted so the
// backend applies its own default.
const scopeToParameters = function (scope: RankingsScope): { types?: string; labels?: string } {
    return {
        types: scope.types.length > 0 ? scope.types.join(',') : undefined,
        labels: scope.labels.length > 0 ? scope.labels.join(',') : undefined
    };
};

const EMPTY_SCOPE: RankingsScope = { types: [], labels: [] };

const getRankings = function (scope: RankingsScope = EMPTY_SCOPE): Promise<RankingsPayload> {
    const { types, labels } = scopeToParameters(scope);
    const query = new URLSearchParams();
    if (types !== undefined) {
        query.set('types', types);
    }
    if (labels !== undefined) {
        query.set('labels', labels);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return request<RankingsPayload>(`/api/rankings${suffix}`);
};

// Record one Human-judged head-to-head result (the AI judge writes through its own competition run route).
const recordManualMatch = function (match: { firstTitle: string; secondTitle: string; winnerTitle: string; rationale?: string }, scope: RankingsScope = EMPTY_SCOPE): Promise<RankingsPayload & { match: RankingsMatch }> {
    return requestJson<RankingsPayload & { match: RankingsMatch }>('/api/rankings/matches', 'POST', { ...match, ...scopeToParameters(scope) });
};

// Discard recorded results by id - one, several, or the whole log - resolving with the recomputed picture.
const discardMatches = function (ids: string[], scope: RankingsScope = EMPTY_SCOPE): Promise<RankingsPayload & { removed: number }> {
    return requestJson<RankingsPayload & { removed: number }>('/api/rankings/matches', 'DELETE', { ids, ...scopeToParameters(scope) });
};

// Runs the backend's AI competition judge over `count` least-met pairings as one streamed job, recording each
// verdict as an AI match; per-pairing progress arrives through `options.onEvent` as competition_start (carrying that
// pairing's exact judge prompt) and competition_result (carrying the recorded match) events.
const runCompetitions = function (body: { count: number; instructions: string; scope?: RankingsScope }, options: StreamOptions): Promise<string> {
    const { scope = EMPTY_SCOPE, ...rest } = body;
    return streamClaude('/api/rankings/competitions', { ...rest, ...scopeToParameters(scope) }, options);
};

export { ApiError, applySpecs, type Backlinks, type BacklinkSource, chatContinue, clearTranscripts, commitChanges, createFile, createVibraryInclude, deleteFile, deleteTranscript, discardMatches, discardPaths, duplicateFile, type FileSummary, generateCommitMessage, generateSpecs, getFile, getFilesSummary, getGitDiff, getGitStatus, getManualPage, getRankings, getSchemaFile, getSettings, getTranscript, getVersion, getWorkspace, type GitFileStatus, type GitStash, type GitStashResult, type GitStatus, listFiles, listStashes, listTranscripts, moveEntries, planSpec, populateTitle, pullChanges, pushChanges, type RankingRow, type RankingsMatch, type RankingsPayload, type RankingsScope, recordManualMatch, renameFile, runCompetitions, runQuick, runTask, saveFile, saveSettings, searchFiles, type SearchFileResult, type SplitPart, splitSpec, stagePaths, stashAction, stashChanges, type StoredTranscript, type TitleIndexEntry, type TranscriptSearchMatch, type TranscriptSummary, unstagePaths };
