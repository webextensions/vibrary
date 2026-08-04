// Computes a single deterministic hash that uniquely identifies the git CONTENT state of the
// working copy. This is the reusable primitive behind the per-check health-check result cache (see
// ./cacheStore.ts and ../all-is-well.ts).
//
// The hash is the sha256 of two timestamp-free tree shas joined by a newline:
//   - staged-content tree    (`git write-tree` read off a throwaway temp index -> exact staged blobs)
//   - worktree+untracked tree(`git add -A` then `git write-tree` on that same temp index -> exact
//                             on-disk content of every NON-ignored file)
//
// The HEAD commit sha is deliberately NOT part of the hash: a commit that does not change content
// (the normal flow - stage, pre-commit verifies, commit) must keep every cache entry valid, so the
// pre-push hook moments later skips the checks pre-commit just ran. HEAD is still returned
// separately so cache entries can record it as metadata.
//
// Why git TREE objects (and not `git stash create`): a tree object is a pure content hash - it carries
// no author/committer timestamp and no branch name, so the same content always yields the same sha
// across runs and across machines. `git stash create` builds a COMMIT object that embeds the current
// time and the branch name, so its sha changes run-to-run and would never produce a cache hit.
//
// Why a THROWAWAY temp index (via the GIT_INDEX_FILE env var): running `git write-tree` against the
// REAL .git/index rewrites that file's stat-cache (its mtime changes), which is undesirable when
// several health-check runs execute concurrently (manual `npm test` racing the husky pre-push hook).
// We therefore copy the real index to a unique temp path (the copy inherits git's stat-cache for
// speed), take BOTH tree reads off that copy, and delete it in a `finally`. The real index is never
// written.
//
// ACCEPTED CAVEAT: `git add -A` respects .gitignore, so git-IGNORED paths (e.g. node_modules/) are NOT
// part of the hash. Deleting node_modules/ between two runs will therefore still produce a cache HIT
// even though an un-cached run might behave differently. Uncommitted changes inside a submodule's
// working tree are likewise invisible (the tree records only the submodule's gitlink commit). Both are
// accepted trade-offs - see .claude/rules/checks-execution-caching.md.
//
// Returns `null` when the hash cannot be computed (not a git repo, or `git write-tree` fails because
// the index has unmerged entries mid-merge). Callers MUST treat `null` as "caching disabled, run
// normally" - the cache fails OPEN, never closed.
//
// NOTE on style: this module deliberately mirrors the sibling health-check scripts (execa with
// `{ reject: false }`, plain return values / `null` sentinels).

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

interface GitContentHashResult {
    gitContentHash: string;
    headSha: string
}

const sha256Hex = function (input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
};

const computeGitContentHashAsync = async function ({ projectRoot }: { projectRoot: string }): Promise<GitContentHashResult | null> {
    // Locate the git directory; bail out (disable caching) if this is not a git repo.
    const gitDirResult = await execa('git', ['rev-parse', '--git-dir'], { cwd: projectRoot, reject: false });
    if (gitDirResult.exitCode !== 0) {
        return null;
    }
    const gitDir = path.resolve(projectRoot, gitDirResult.stdout.trim());
    const realIndexPath = path.join(gitDir, 'index');

    // HEAD commit sha (or a sentinel for a fresh repo with no commits yet). Metadata only - not part
    // of the content hash (see header).
    const headResult = await execa('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, reject: false });
    const headSha = headResult.exitCode === 0 ? headResult.stdout.trim() : 'NO_HEAD';

    // Unique temp index per process so concurrent runs never collide.
    const tmpIndexPath = path.join(os.tmpdir(), `healthcheck-index-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
    const env = { GIT_INDEX_FILE: tmpIndexPath };

    try {
        // Seed the temp index from the real index so `git add -A` only re-hashes what actually changed
        // (the copy inherits git's stat-cache). A fresh repo may have no index yet - start empty then.
        if (fs.existsSync(realIndexPath)) {
            fs.copyFileSync(realIndexPath, tmpIndexPath);
        }

        // Staged-content tree FIRST, straight off the copied index (no `add`), so the real index is
        // never touched. Fails on unmerged entries (mid-merge) -> disable caching.
        const stagedTreeResult = await execa('git', ['write-tree'], { cwd: projectRoot, env, reject: false });
        if (stagedTreeResult.exitCode !== 0) {
            return null;
        }
        const stagedTreeSha = stagedTreeResult.stdout.trim();

        // Stage every non-ignored working-tree file into the temp index, then snapshot it as a tree.
        const addResult = await execa('git', ['add', '-A'], { cwd: projectRoot, env, reject: false });
        if (addResult.exitCode !== 0) {
            return null;
        }
        const worktreeTreeResult = await execa('git', ['write-tree'], { cwd: projectRoot, env, reject: false });
        if (worktreeTreeResult.exitCode !== 0) {
            return null;
        }
        const worktreeTreeSha = worktreeTreeResult.stdout.trim();

        const gitContentHash = sha256Hex([stagedTreeSha, worktreeTreeSha].join('\n'));
        return { gitContentHash, headSha };
    } catch (err) {
        // Any unexpected failure (e.g. a missing `git` binary surfacing as a throw) disables caching.
        console.error('Warning: could not compute git content hash; caching disabled for this run.', err);
        return null;
    } finally {
        try {
            fs.rmSync(tmpIndexPath, { force: true });
        } catch {
            // Best-effort cleanup; a leftover temp index is harmless.
        }
    }
};

export {
    computeGitContentHashAsync,
    sha256Hex
};
