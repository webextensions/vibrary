import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFileTree, collectFilePaths, collectFolderPaths, type TreeNode } from './fileTree.ts';

// collectFilePaths decides which files a folder delete/rename actually touches, so the tree's shape and its
// flattening are behavior worth pinning: a folder that went missing or a file collected twice would translate
// directly into lost or double-mutated files.

// Compact, order-preserving rendering of a tree for whole-shape assertions: "folder(child, child)" / "file".
const renderTree = function (nodes: TreeNode[]): string {
    return nodes.map(function (node) {
        return node.kind === 'folder' ? `${node.name}(${renderTree(node.children)})` : node.name;
    }).join(', ');
};

test('buildFileTree nests by path, dedupes shared folders, and sorts folders first then case-insensitively', function () {
    const tree = buildFileTree([
        'tasks.xml',
        'docs/specs-b.xml',
        'docs/Specs-a.xml',
        'docs/api/reviews.xml',
        'Zebra/ideas.xml'
    ]);
    assert.equal(
        renderTree(tree),
        'docs(api(reviews.xml), Specs-a.xml, specs-b.xml), Zebra(ideas.xml), tasks.xml'
    );
    // Node paths are the full cumulative paths, not just display names.
    const documentsFolder = tree[0];
    assert.equal(documentsFolder.kind === 'folder' && documentsFolder.children.at(0)?.path, 'docs/api');
});

test('buildFileTree of an empty listing is an empty tree', function () {
    assert.deepEqual(buildFileTree([]), []);
});

test('collectFilePaths yields a file itself and every file beneath a folder exactly once', function () {
    const tree = buildFileTree(['docs/api/reviews.xml', 'docs/specs.xml', 'tasks.xml']);
    const documentsFolder = tree[0];
    assert.equal(documentsFolder.path, 'docs');
    assert.deepEqual(collectFilePaths(documentsFolder), ['docs/api/reviews.xml', 'docs/specs.xml']);
    assert.deepEqual(collectFilePaths(tree[1]), ['tasks.xml']);
});

test('collectFolderPaths yields the folder itself plus nested folders; a file yields nothing', function () {
    const tree = buildFileTree(['docs/api/reviews.xml', 'docs/specs.xml', 'tasks.xml']);
    assert.deepEqual(collectFolderPaths(tree[0]), ['docs', 'docs/api']);
    assert.deepEqual(collectFolderPaths(tree[1]), []);
});
