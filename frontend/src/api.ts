import { countApprovedTruths, type EntryType, parseRunbooksXml } from './runbooksXml.ts';

type ApprovalCount = { approved: number; total: number };

type ApiResponse<T> = { status: 'success'; output: T } | { status: 'error'; errorMessage: string };

const request = async function <T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = (await response.json()) as ApiResponse<T>;
    if (body.status !== 'success') {
        throw new Error(body.errorMessage || `Request failed (${response.status})`);
    }
    return body.output;
};

const listFiles = async function (): Promise<string[]> {
    const output = await request<{ files: string[] }>('/api/files');
    return output.files;
};

const getWorkspace = async function (): Promise<string> {
    const output = await request<{ cwd: string }>('/api/workspace');
    return output.cwd;
};

const getFile = async function (name: string): Promise<string> {
    const output = await request<{ name: string; content: string }>(`/api/files/${encodeURIComponent(name)}`);
    return output.content;
};

// Create a new, empty truths file (create-only on the server: it refuses to overwrite an existing file). The caller
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

// Delete a truths file. The caller (the explorer's "More" menu) confirms with the user first, then refreshes the file
// list and closes any open tab for the file once this resolves.
const deleteFile = async function (name: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
};

// Runs the backend's headless AI agent to append `count` new truths to the file. Resolves with the CLI's raw stdout
// (logged to the console for debugging) once the file has been updated on disk; the caller reloads it to pick up the
// additions.
const generateTruths = async function (name: string, type: EntryType, count: number): Promise<string> {
    const output = await request<{ name: string; claudeOutput: string }>(`/api/files/${encodeURIComponent(name)}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, count })
    });
    return output.claudeOutput;
};

// Runs the backend's headless AI agent to make the codebase conform to a single truth, editing files directly. Resolves
// with the CLI's raw stdout (logged to the console for debugging) once the agent finishes. `instructions` carries
// optional custom one-time guidance for this run; it is folded into the agent's prompt when non-empty.
const applyTruth = async function (truth: { title: string; content: string; notes: string; instructions: string }): Promise<string> {
    const output = await request<{ claudeOutput: string }>('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: truth.title, content: truth.content, notes: truth.notes, instructions: truth.instructions })
    });
    return output.claudeOutput;
};

// Runs the backend's headless AI agent to make the codebase conform to several selected truths in a single run, editing
// files directly. Resolves with the CLI's raw stdout (logged to the console for debugging) once the agent finishes.
const applyTruths = async function (entries: { title: string; content: string; notes: string }[]): Promise<string> {
    const output = await request<{ claudeOutput: string }>('/api/apply-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
    });
    return output.claudeOutput;
};

// Runs the backend's headless AI agent to derive a hyphenated title from a truth's content, backing the editor's
// "Populate" button. Resolves with the slugified title the agent produced.
const populateTitle = async function (content: string): Promise<string> {
    const output = await request<{ title: string }>('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
    return output.title;
};

// Loads a single file and tallies its approved/total truth counts, for the at-a-glance overview in the file list.
const getApprovalCount = async function (name: string): Promise<ApprovalCount> {
    const entries = parseRunbooksXml(await getFile(name));
    return { approved: countApprovedTruths(entries), total: entries.length };
};

// Collects every entry title across all runbooks files in the folder, for the "Relates to" option list. Files that
// fail to parse are skipped so one bad file does not break the option list.
const loadAllTruthTitles = async function (): Promise<string[]> {
    const files = await listFiles();
    const titles = new Set<string>();

    await Promise.all(files.map(async function (name) {
        try {
            const content = await getFile(name);
            for (const truth of parseRunbooksXml(content)) {
                if (truth.title !== '') {
                    titles.add(truth.title);
                }
            }
        } catch {
            // Skip files that cannot be read or parsed
        }
    }));

    return [...titles].toSorted(function (a, b) {
        return a.localeCompare(b);
    });
};

export { applyTruth, applyTruths, type ApprovalCount, createFile, deleteFile, generateTruths, getApprovalCount, getFile, getWorkspace, listFiles, loadAllTruthTitles, populateTitle, saveFile };
