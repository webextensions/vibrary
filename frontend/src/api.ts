import { countApprovedTruths, parseTruthsXml } from './truthsXml.ts';

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

const saveFile = async function (name: string, content: string): Promise<void> {
    await request<{ name: string }>(`/api/files/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
};

// Loads a single file and tallies its approved/total truth counts, for the at-a-glance overview in the file list.
const getApprovalCount = async function (name: string): Promise<ApprovalCount> {
    const truths = parseTruthsXml(await getFile(name));
    return { approved: countApprovedTruths(truths), total: truths.length };
};

// Collects every truth title across all truths*.xml files in the folder, for the "Relates to" option list. Files that
// fail to parse are skipped so one bad file does not break the option list.
const loadAllTruthTitles = async function (): Promise<string[]> {
    const files = await listFiles();
    const titles = new Set<string>();

    await Promise.all(files.map(async function (name) {
        try {
            const content = await getFile(name);
            for (const truth of parseTruthsXml(content)) {
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

export { type ApprovalCount, getApprovalCount, getFile, getWorkspace, listFiles, loadAllTruthTitles, saveFile };
