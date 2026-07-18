import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

// The exit code IS the check command's contract (a CI step is `npx vibrary check` and nothing else), so it is pinned
// here by running the real binary: 0 clean, 1 problems, 2 unconfigured.

const execFileAsync = promisify(execFile);
const binPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'vibrary.js');

// execFile rejects on a non-zero exit; normalize both outcomes to { code, stdout, stderr }.
const runCliAsync = async function (cwd, ...cliArguments) {
    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, ...cliArguments], { cwd });
        return { code: 0, stdout, stderr };
    } catch (error) {
        return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
};

const cleanCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-cli-clean-'));
writeFileSync(path.join(cleanCwd, '.vibraryinclude'), 'specs*.xml\n');
writeFileSync(path.join(cleanCwd, 'specs.xml'), '<root><entries><entry type="spec"><title>fine</title><content>ok</content></entry></entries></root>');

const brokenCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-cli-broken-'));
writeFileSync(path.join(brokenCwd, '.vibraryinclude'), 'specs*.xml\n');
writeFileSync(path.join(brokenCwd, 'specs.xml'), '<root><entries><entry type="spec"><title>refers-out</title><content>c</content><relatesTo><ref>ghost</ref></relatesTo></entry></entries></root>');

const bareCwd = mkdtempSync(path.join(tmpdir(), 'vibrary-cli-bare-'));

after(function () {
    for (const cwd of [cleanCwd, brokenCwd, bareCwd]) {
        rmSync(cwd, { recursive: true, force: true });
    }
});

test('check exits 0 on a clean folder, 1 on problems, 2 when unconfigured', async function () {
    const clean = await runCliAsync(cleanCwd, 'check');
    assert.equal(clean.code, 0);
    assert.match(clean.stdout, /no problems found/);

    const broken = await runCliAsync(brokenCwd, 'check');
    assert.equal(broken.code, 1);
    assert.match(broken.stderr, /references "ghost"/);

    const bare = await runCliAsync(bareCwd, 'check');
    assert.equal(bare.code, 2);
    assert.match(bare.stderr, /No \.vibraryinclude found/);
});

test('check --require-approved fails a folder whose only flaw is an unapproved entry', async function () {
    const relaxedThenStrict = await runCliAsync(cleanCwd, 'check', '--require-approved');
    assert.equal(relaxedThenStrict.code, 1);
    assert.match(relaxedThenStrict.stderr, /"fine" is unapproved/);
});

test('check --json emits the report machine-readably with the same exit contract', async function () {
    const { code, stdout } = await runCliAsync(brokenCwd, 'check', '--json');
    assert.equal(code, 1);
    const report = JSON.parse(stdout);
    assert.equal(report.configured, true);
    assert.equal(report.problems[0].kind, 'broken-reference');
});

test('list prints per-file tallies and search prints entry matches', async function () {
    const listed = await runCliAsync(cleanCwd, 'list');
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /specs\.xml {2}0\/1 approved/);

    const found = await runCliAsync(cleanCwd, 'search', 'ok');
    assert.equal(found.code, 0);
    assert.match(found.stdout, /fine \[spec, content\]/);
});
