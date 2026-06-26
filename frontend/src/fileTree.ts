// Turns the flat list of file paths from the API (POSIX-style, e.g. "docs/api/specs-auth.xml") into a nested tree for
// the sidebar. Only folders that lead to a file appear, since the list itself only contains files.

type FileNode = { kind: 'file'; name: string; path: string };
type FolderNode = { kind: 'folder'; name: string; path: string; children: TreeNode[] };
type TreeNode = FolderNode | FileNode;

// Folders before files at each level, then case-insensitive alphabetical by display name.
const sortNodes = function (nodes: TreeNode[]): TreeNode[] {
    return nodes.toSorted(function (a, b) {
        if (a.kind !== b.kind) {
            return a.kind === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
};

const sortTree = function (nodes: TreeNode[]): TreeNode[] {
    for (const node of nodes) {
        if (node.kind === 'folder') {
            node.children = sortTree(node.children);
        }
    }
    return sortNodes(nodes);
};

// Build the tree by walking each path's segments, auto-creating folder nodes and deduping them by cumulative path.
const buildFileTree = function (paths: string[]): TreeNode[] {
    const root: FolderNode = { kind: 'folder', name: '', path: '', children: [] };
    const folders = new Map<string, FolderNode>([['', root]]);

    for (const filePath of paths) {
        const segments = filePath.split('/');
        const fileName = segments.at(-1) as string;
        const folderSegments = segments.slice(0, -1);
        let parent = root;
        let prefix = '';
        for (const segment of folderSegments) {
            prefix = prefix === '' ? segment : `${prefix}/${segment}`;
            let folder = folders.get(prefix);
            if (folder === undefined) {
                folder = { kind: 'folder', name: segment, path: prefix, children: [] };
                folders.set(prefix, folder);
                parent.children.push(folder);
            }
            parent = folder;
        }
        parent.children.push({ kind: 'file', name: fileName, path: filePath });
    }

    return sortTree(root.children);
};

// Flattens a tree node to the file paths it contains: a file yields itself; a folder yields every file beneath it. Used
// to delete a folder, which has no on-disk entity of its own (folders are derived from file paths) and so is removed by
// deleting the files under it.
const collectFilePaths = function (node: TreeNode): string[] {
    if (node.kind === 'file') {
        return [node.path];
    }
    return node.children.flatMap(function (child) {
        return collectFilePaths(child);
    });
};

export { buildFileTree, collectFilePaths, type FileNode, type FolderNode, type TreeNode };
