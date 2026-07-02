import { type ClaudeStreamEvent } from './activityStream.ts';
import { type AppSettings } from './settings.ts';
import { countApprovedSpecs, type EntryType, parseVibraryXml } from './vibraryXml.ts';

type ApprovalCount = { approved: number; total: number };

type ApiResponse<T> = { status: 'success'; output: T } | { status: 'error'; errorMessage: string };

// Options for the streaming agent calls: an abort signal (for the queue's abort/refresh) and an onEvent callback that
// receives each parsed claude stream-json event as it arrives.
type StreamOptions = { signal?: AbortSignal; onEvent?: (event: ClaudeStreamEvent) => void };

const request = async function <T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = (await response.json()) as ApiResponse<T>;
    if (body.status !== 'success') {
        throw new Error(body.errorMessage || `Request failed (${response.status})`);
    }
    return body.output;
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

const getFile = async function (name: string): Promise<string> {
    const output = await request<{ name: string; content: string }>(`/api/files/${encodeURIComponent(name)}`);
    return output.content;
};

// Read a form-schemas sidecar (e.g. "docs/tasks/tasks.xml.schemas.json") referenced by an entry's formSchemaRef. Served
// by a dedicated read-only endpoint, separate from the vibrary file listing. Rejects (e.g. 404) when the sidecar is
// absent; callers resolving an entry's schema treat that as "no form".
const getSchemaFile = async function (name: string): Promise<string> {
    const output = await request<{ name: string; content: string }>(`/api/schema-file/${encodeURIComponent(name)}`);
    return output.content;
};

// Create a new, empty specs file (create-only on the server: it refuses to overwrite an existing file). The caller
// refreshes the file list and opens the new file once this resolves.
const createFile = async function (name: string): Promise<void> {
    await request<{ name: string }>('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
};

const saveFile = async function (name: string, content: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
};

// Delete a specs file. The caller (the explorer's "More" menu) confirms with the user first, then refreshes the file
// list and closes any open tab for the file once this resolves.
const deleteFile = async function (name: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
};

// Rename (or move - the new name may live in another folder) a specs file. The server refuses to overwrite an
// existing target; the caller refreshes the file list and reopens the file under its new name once this resolves.
const renameFile = async function (name: string, newName: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName })
    });
};

// Duplicate a specs file under a new name (a copy - the source is untouched). The server refuses to overwrite an
// existing target; the caller refreshes the file list and opens the copy once this resolves.
const duplicateFile = async function (name: string, newName: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName })
    });
};

// Runs the backend's headless AI agent to append `count` new specs to the file, streaming its activity through
// `options.onEvent`. Resolves with the run's final result text once the file has been updated on disk; the caller
// reloads it to pick up the additions.
const generateSpecs = function (name: string, type: EntryType, count: number, options: StreamOptions): Promise<string> {
    return streamClaude(`/api/files/${encodeURIComponent(name)}/generate`, { type, count }, options);
};

// Runs the backend's headless AI agent to make the codebase conform to a single spec, editing files directly and
// streaming its activity through `options.onEvent`. Resolves with the run's final result text once the agent finishes.
// `instructions` carries optional custom one-time guidance for this run; it is folded into the agent's prompt when non-empty.
const applySpec = function (spec: { title: string; content: string; notes: string; instructions: string }, options: StreamOptions): Promise<string> {
    return streamClaude('/api/apply', { title: spec.title, content: spec.content, notes: spec.notes, instructions: spec.instructions }, options);
};

// Runs the backend's headless AI agent to carry out a single task, editing files directly and streaming its activity
// through `options.onEvent`. Resolves with the run's final result text once the agent finishes. `instructions` carries
// optional custom one-time guidance; `task.options` carries the directive block derived from the task's per-run options
// form. Both are folded into the agent's prompt when non-empty.
const runTask = function (task: { title: string; content: string; notes: string; instructions: string; options: string }, options: StreamOptions): Promise<string> {
    return streamClaude('/api/run-task', { title: task.title, content: task.content, notes: task.notes, instructions: task.instructions, options: task.options }, options);
};

// Runs the backend's headless AI agent to make the codebase conform to several selected specs in a single run, editing
// files directly and streaming its activity through `options.onEvent`. Resolves with the run's final result text once
// the agent finishes. `instructions` carries optional custom one-time guidance for the whole batch, the bulk
// counterpart of applySpec's own `instructions`; folded into the agent's prompt when non-empty.
const applySpecs = function (entries: { title: string; content: string; notes: string }[], instructions: string, options: StreamOptions): Promise<string> {
    return streamClaude('/api/apply-batch', { entries, instructions }, options);
};

// Continues a finished activity as a chat by resuming its claude session with a follow-up message, streaming the reply
// through `options.onEvent`. `sessionId` is the id captured from the original run's stream. Resolves with the reply's
// final result text.
const chatContinue = function (body: { message: string; sessionId: string }, options: StreamOptions): Promise<string> {
    return streamClaude('/api/chat', body, options);
};

// Runs the backend's headless AI agent to derive a hyphenated title from a spec's content, backing the editor's
// "Populate" button. Resolves with the slugified title the agent produced.
const populateTitle = async function (content: string, signal?: AbortSignal): Promise<string> {
    const output = await request<{ title: string }>('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal
    });
    return output.title;
};

// Loads a single file and tallies its approved/total spec counts, for the at-a-glance overview in the file list.
const getApprovalCount = async function (name: string): Promise<ApprovalCount> {
    const entries = parseVibraryXml(await getFile(name));
    return { approved: countApprovedSpecs(entries), total: entries.length };
};

// Read the per-project UI preferences from `.vibrary/settings.local.json`. A missing/corrupt file comes back as `{}`
// from the backend, which the caller normalizes against the defaults.
const getSettings = async function (): Promise<unknown> {
    const output = await request<{ settings: unknown }>('/api/settings');
    return output.settings;
};

// Persist the per-project UI preferences, writing the whole settings object to `.vibrary/settings.local.json`.
const saveSettings = async function (settings: AppSettings): Promise<void> {
    await request<Record<string, never>>('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
    });
};

// One entry title paired with the file it lives in.
type TitleIndexEntry = { title: string; path: string };

// Collects every entry title across all vibrary files in the folder, alongside which file it lives in: backs both the
// "Relates to" option list (title only) and resolving a clicked "Relates to" chip back to its target file. Files that
// fail to parse are skipped so one bad file does not break the index. A title duplicated across files keeps whichever
// file's scan resolves first - titles are meant to be unique identifiers, so this is only an edge case.
const loadTitleIndex = async function (): Promise<TitleIndexEntry[]> {
    const { files } = await listFiles();
    const seen = new Set<string>();
    const index: TitleIndexEntry[] = [];

    await Promise.all(files.map(async function (name) {
        try {
            const content = await getFile(name);
            for (const spec of parseVibraryXml(content)) {
                if (spec.title === '' || seen.has(spec.title)) {
                    continue;
                }
                seen.add(spec.title);
                index.push({ title: spec.title, path: name });
            }
        } catch {
            // Skip files that cannot be read or parsed
        }
    }));

    return index.toSorted(function (a, b) {
        return a.title.localeCompare(b.title);
    });
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

// One line match inside a file; `line` is 1-based and `text` is the trimmed, length-capped line.
type SearchMatch = { line: number; text: string };
type SearchFileResult = { path: string; matches: SearchMatch[] };
type SearchResult = { results: SearchFileResult[]; truncated: boolean };

// Full-text search across the included vibrary files (the same set the Explorer lists). The backend caps the result
// set and flags `truncated` when it does. An optional `files` list narrows the search to just those file names; an
// empty/omitted list searches everywhere.
const searchFiles = function (query: string, files: string[] = []): Promise<SearchResult> {
    const filesParameter = files.length > 0 ? `&files=${encodeURIComponent(files.join(','))}` : '';
    return request<SearchResult>(`/api/search?q=${encodeURIComponent(query)}${filesParameter}`);
};

// Current branch and changed files. Rejects with "Not a git repository" when the served folder is not a git repo.
const getGitStatus = function (): Promise<GitStatus> {
    return request<GitStatus>('/api/git/status');
};

// Stage / unstage the given paths, resolving with the refreshed status so the panel can re-render in one round trip.
const stagePaths = function (paths: string[]): Promise<GitStatus> {
    return request<GitStatus>('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
    });
};

const unstagePaths = function (paths: string[]): Promise<GitStatus> {
    return request<GitStatus>('/api/git/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
    });
};

// Commit the staged changes with a summary and optional extended body, resolving with the refreshed status.
const commitChanges = function (message: { summary: string; body: string }): Promise<GitStatus> {
    return request<GitStatus>('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
    });
};

// Push the current branch; rejects with git's stderr on failure. The panel only needs success/failure, so the push
// result is not returned.
const pushChanges = async function (): Promise<void> {
    await request<{ output: unknown }>('/api/git/push', { method: 'POST' });
};

// Pull the current branch, resolving with the refreshed status (a pull can change the working tree).
const pullChanges = function (): Promise<GitStatus> {
    return request<GitStatus>('/api/git/pull', { method: 'POST' });
};

// Discard working-tree changes: tracked paths are restored from the index/HEAD, untracked paths are deleted.
// Destructive - callers confirm with the user first.
const discardPaths = function (paths: string[]): Promise<GitStatus> {
    return request<GitStatus>('/api/git/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
    });
};

const listStashes = function (): Promise<GitStash[]> {
    return request<GitStash[]>('/api/git/stashes');
};

// Stash all current changes (staged + unstaged + untracked) under an optional message.
const stashChanges = function (message?: string): Promise<GitStashResult> {
    return request<GitStashResult>('/api/git/stash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message === undefined ? {} : { message })
    });
};

// Apply / pop / drop a stash by its stash@{N} position.
const stashAction = function (action: 'apply' | 'pop' | 'drop', index: number): Promise<GitStashResult> {
    return request<GitStashResult>(`/api/git/stash/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index })
    });
};

// Draft a commit summary + extended body from the staged diff via the backend's headless agent (buffered, like
// populateTitle). Rejects when nothing is staged.
const generateCommitMessage = function (signal?: AbortSignal): Promise<{ summary: string; body: string }> {
    return request<{ summary: string; body: string }>('/api/git/generate-message', { method: 'POST', signal });
};

export { applySpec, applySpecs, type ApprovalCount, chatContinue, commitChanges, createFile, deleteFile, discardPaths, duplicateFile, type FileListing, generateCommitMessage, generateSpecs, getApprovalCount, getFile, getGitStatus, getSchemaFile, getSettings, getWorkspace, type GitFileStatus, type GitStash, type GitStashResult, type GitStatus, listFiles, listStashes, loadTitleIndex, populateTitle, pullChanges, pushChanges, renameFile, runTask, saveFile, saveSettings, searchFiles, type SearchFileResult, type SearchResult, stagePaths, stashAction, stashChanges, type TitleIndexEntry, unstagePaths };
