import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { startAppAsync } from '../shared/testHelpers.js';

// Integration coverage for the git router against a real repository in a scratch folder: the not-a-repo empty-state
// contract, the status -> stage -> commit -> modify -> diff -> discard flow the Source Control panel drives, and the
// input validation guarding paths and commit messages. Runs the real simple-git wrappers - nothing is mocked.

// Module-scope setup (this whole file is the suite): one folder that is a git repo with a deterministic local
// identity, and one that is not.
const repoCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-git-route-'));
const git = function (...arguments_) {
    execFileSync('git', arguments_, { cwd: repoCwd });
};
git('init', '-b', 'main');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'Test');
git('config', 'commit.gpgsign', 'false');
writeFileSync(path.join(repoCwd, 'specs.xml'), 'original\n');

const plainCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-git-plain-'));

// A repo whose SERVED folder is a subdirectory (docs/), plus a change at the repo root outside it, to pin that status
// paths are remapped to cwd-relative and out-of-folder changes are dropped.
const subRepoRoot = mkdtempSync(path.join(tmpdir(), 'vibrary-git-subdir-'));
const subGit = function (...arguments_) {
    execFileSync('git', arguments_, { cwd: subRepoRoot });
};
subGit('init', '-b', 'main');
subGit('config', 'user.email', 'test@example.com');
subGit('config', 'user.name', 'Test');
subGit('config', 'commit.gpgsign', 'false');
mkdirSync(path.join(subRepoRoot, 'docs'));
writeFileSync(path.join(subRepoRoot, 'docs', 'specs.xml'), 'in the served subfolder\n');
writeFileSync(path.join(subRepoRoot, 'root-file.txt'), 'at the repo root, outside the served folder\n');
const subCwd = path.join(subRepoRoot, 'docs');

const repo = await startAppAsync(repoCwd);
const plain = await startAppAsync(plainCwd);
const sub = await startAppAsync(subCwd);

after(function () {
    repo.server.close();
    plain.server.close();
    sub.server.close();
    rmSync(repoCwd, { recursive: true, force: true });
    rmSync(plainCwd, { recursive: true, force: true });
    rmSync(subRepoRoot, { recursive: true, force: true });
});

test('served from a repo subdirectory: status paths are cwd-relative and out-of-folder changes are dropped', async function () {
    const { body } = await sub.requestJsonAsync('/git/status');
    const paths = body.output.files.map(function (file) { return file.path; });
    // The served folder's file is reported cwd-relative ("specs.xml"), not repo-root-relative ("docs/specs.xml").
    assert.ok(paths.includes('specs.xml'), `expected cwd-relative specs.xml, got ${JSON.stringify(paths)}`);
    assert.ok(paths.every(function (entry) { return !entry.startsWith('docs/'); }), 'no repo-root-relative path leaks through');
    // A change at the repo root, outside the served folder, is filtered out.
    assert.ok(paths.every(function (entry) { return !entry.includes('root-file'); }), 'out-of-folder change is not shown');
});

test('served from a repo subdirectory: staging a cwd-relative path targets the right file', async function () {
    const staged = await sub.sendJsonAsync('/git/stage', { paths: ['specs.xml'] });
    assert.equal(staged.status, 200);
    const file = staged.body.output.files.find(function (entry) { return entry.path === 'specs.xml'; });
    // 'A' = added to the index; a doubled path (docs/docs/specs.xml) would have staged nothing.
    assert.equal(file?.index, 'A');
});

test('every git route answers 400 "Not a git repository" outside a repo', async function () {
    const { status, body } = await plain.requestJsonAsync('/git/status');
    assert.equal(status, 400);
    assert.equal(body.errorMessage, 'Not a git repository');
});

test('status -> stage -> commit -> modify -> diff -> discard round trip', async function () {
    const initial = await repo.requestJsonAsync('/git/status');
    assert.equal(initial.body.output.current, 'main');
    assert.deepEqual(
        initial.body.output.files.map(function (file) { return [file.path, file.index, file.working_dir]; }),
        [['specs.xml', '?', '?']]
    );

    const staged = await repo.sendJsonAsync('/git/stage', { paths: ['specs.xml'] });
    assert.equal(staged.body.output.files[0].index, 'A');

    const committed = await repo.sendJsonAsync('/git/commit', { summary: 'Add specs file' });
    assert.deepEqual(committed.body.output.files, []);

    writeFileSync(path.join(repoCwd, 'specs.xml'), 'original\nmodified\n');
    const diff = await repo.requestJsonAsync('/git/diff?path=specs.xml');
    assert.equal(diff.body.output.untracked, false);
    assert.match(diff.body.output.diff, /\+modified/);

    const discarded = await repo.sendJsonAsync('/git/discard', { paths: ['specs.xml'] });
    assert.deepEqual(discarded.body.output.files, []);
    assert.equal(readFileSync(path.join(repoCwd, 'specs.xml'), 'utf8'), 'original\n');
});

test('an untracked file diff answers its full content, and discard deletes the file', async function () {
    writeFileSync(path.join(repoCwd, 'notes.txt'), 'scratch content\n');
    const diff = await repo.requestJsonAsync('/git/diff?path=notes.txt&untracked=true');
    assert.deepEqual(diff.body.output, { diff: 'scratch content\n', untracked: true });

    await repo.sendJsonAsync('/git/discard', { paths: ['notes.txt'] });
    assert.throws(function () { readFileSync(path.join(repoCwd, 'notes.txt')); }, { code: 'ENOENT' });
});

test('untracked diff refuses a path git does not report as untracked (no raw read of arbitrary files)', async function () {
    // specs.xml is tracked and clean (committed, then discarded back) so git does not list it. The untracked branch
    // must not read its bytes just because the client claimed untracked=true - that would turn the diff endpoint into
    // an arbitrary in-folder file reader (a .env, a key) beyond the untracked files the panel actually shows.
    const tracked = await repo.requestJsonAsync('/git/diff?path=specs.xml&untracked=true');
    assert.equal(tracked.status, 404);
    assert.doesNotMatch(JSON.stringify(tracked.body), /original/);
});

test('stash save and pop round-trip the working tree, answering status plus stash list', async function () {
    writeFileSync(path.join(repoCwd, 'specs.xml'), 'original\nstash me\n');

    const stashed = await repo.sendJsonAsync('/git/stash', { message: 'wip work' });
    assert.deepEqual(stashed.body.output.status.files, []);
    assert.equal(stashed.body.output.stashes.length, 1);
    assert.match(stashed.body.output.stashes[0].message, /wip work/);
    assert.equal(readFileSync(path.join(repoCwd, 'specs.xml'), 'utf8'), 'original\n');

    const popped = await repo.sendJsonAsync('/git/stash/pop', { index: 0 });
    assert.deepEqual(popped.body.output.stashes, []);
    assert.equal(popped.body.output.status.files[0].working_dir, 'M');
    assert.equal(readFileSync(path.join(repoCwd, 'specs.xml'), 'utf8'), 'original\nstash me\n');

    // Restore a clean tree so later tests (and reruns) start from the committed state.
    await repo.sendJsonAsync('/git/discard', { paths: ['specs.xml'] });
});

test('stash actions reject a non-integer or negative index', async function () {
    assert.equal((await repo.sendJsonAsync('/git/stash/apply', { index: -1 })).status, 400);
    assert.equal((await repo.sendJsonAsync('/git/stash/drop', { index: 1.5 })).status, 400);
    assert.equal((await repo.sendJsonAsync('/git/stash/pop', {})).status, 400);
});

test('validation: bad paths, empty commit summaries, and traversal are rejected', async function () {
    assert.equal((await repo.sendJsonAsync('/git/stage', { paths: [] })).status, 400);
    assert.equal((await repo.sendJsonAsync('/git/stage', { paths: ['../outside'] })).status, 400);
    assert.equal((await repo.sendJsonAsync('/git/commit', { summary: ' '.repeat(3) })).status, 400);
    assert.equal((await repo.requestJsonAsync('/git/diff?path=../outside')).status, 400);
});
