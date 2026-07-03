import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const repo = await startAppAsync(repoCwd);
const plain = await startAppAsync(plainCwd);

after(function () {
    repo.server.close();
    plain.server.close();
    rmSync(repoCwd, { recursive: true, force: true });
    rmSync(plainCwd, { recursive: true, force: true });
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
