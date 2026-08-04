// Generic, namespace-aware store for health-check result caching. It records that a given piece of
// work PASSED against a specific git CONTENT state, so the same work can be skipped next time the
// state is unchanged. It is deliberately decoupled from WHAT is being cached: the caller supplies a
// `namespace` (a logical bucket - 'checks' for the per-check entries written by ../all-is-well.ts), a
// `partition` (a shard directory within the bucket - the gitContentHash for 'checks', so each content
// state gets its own folder), and a `cacheKey` (the entry filename within the partition).
//
// Cache layout (the whole .cache/ tree is git-ignored):
//     .cache/checks-executions/<namespace>/<partition>/<cacheKey>.json
// For 'checks': <partition> is the gitContentHash (from ./computeGitContentHash.ts - it contains NO
// commit sha, so a commit that does not change content keeps every entry valid, and pre-push reuses
// what pre-commit just verified) and <cacheKey> is the per-check filename built by computeCacheKey:
// a filesystem-safe check name plus the first 16 hex of sha256(signature). Sharding by content state
// keeps each folder small (~one file per check) rather than one flat folder of every check x state;
// the signature hash in the filename still gives config-driven variations (per-check env overrides
// from the git-ignored local config) distinct entries within a folder.
//
// Entries are pruned by age (best-effort) across the whole tree via pruneOldCacheEntries - the
// orchestrator calls it once per run, after writing its entries - so the cache cannot grow without
// bound and emptied folders / obsolete namespaces drain away. Reads and writes never throw: a missing
// / corrupt / unreadable entry is a cache MISS, and a failed write (read-only or full .cache) is
// swallowed so the suite still runs. The cache fails OPEN.
//
// NOTE on style: like the sibling health-check scripts (and ./computeGitContentHash.ts) this module
// uses synchronous fs and plain return values / `null` sentinels, matching the local precedent in
// block-non-keyboard-characters/block-characters.ts (fast, local file I/O - no need for async here).

import fs from 'node:fs';
import path from 'node:path';

import { sha256Hex } from './computeGitContentHash.ts';

interface CacheEntry {
    checkName: string;
    gitContentHash: string;
    headSha: string;
    passedAt: string
}

const PRUNE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const cacheRootDir = function ({ projectRoot }: { projectRoot: string }): string {
    return path.join(projectRoot, '.cache', 'checks-executions');
};

const cacheDirForNamespace = function ({ projectRoot, namespace }: { namespace: string; projectRoot: string }): string {
    return path.join(cacheRootDir({ projectRoot }), namespace);
};

const cacheDirForPartition = function ({ namespace, partition, projectRoot }: { namespace: string; partition: string; projectRoot: string }): string {
    return path.join(cacheDirForNamespace({ namespace, projectRoot }), partition);
};

const cacheEntryPath = function ({ cacheKey, namespace, partition, projectRoot }: { cacheKey: string; namespace: string; partition: string; projectRoot: string }): string {
    return path.join(cacheDirForPartition({ namespace, partition, projectRoot }), `${cacheKey}.json`);
};

// True when HEALTHCHECKS_NO_CACHE is set to anything other than the explicit "off" values.
const isCacheDisabledByEnv = function (): boolean {
    const value = process.env.HEALTHCHECKS_NO_CACHE;
    if (!value) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== '0' && normalized !== 'false';
};

// Replace any character outside the portable filename set so a name like "eslint:staged" yields a
// safe, browsable filename ("eslint-staged") on every platform.
const toSafeFileNameSegment = function (value: string): string {
    return value.replaceAll(/[^A-Za-z0-9._-]/g, '-');
};

// The entry filename within a partition: a readable, filesystem-safe name plus a short signature
// hash. The partition directory already encodes the gitContentHash, so the filename only has to
// discriminate the work within that content state; the short hash keeps signature variations (e.g. a
// per-check env override from the local config) in distinct files.
const computeCacheKey = function ({ name, signature }: { name: string; signature: string }): string {
    return `${toSafeFileNameSegment(name)}.${sha256Hex(signature).slice(0, 16)}`;
};

const readCacheEntry = function ({ cacheKey, namespace, partition, projectRoot }: { cacheKey: string; namespace: string; partition: string; projectRoot: string }): CacheEntry | null {
    const filePath = cacheEntryPath({ cacheKey, namespace, partition, projectRoot });
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content) as CacheEntry;
    } catch {
        // ENOENT (no entry yet) or a corrupt/unreadable file both count as a cache MISS.
        return null;
    }
};

// Delete entries older than PRUNE_MAX_AGE_MS anywhere under the cache root, then remove any directory
// left empty (bottom-up), so aged-out content-state folders and retired namespaces both drain away.
// Best-effort; never throws. The orchestrator calls this once per run, after writing its entries -
// not per write, to avoid re-scanning the tree in a burst.
const pruneCacheTree = function ({ dir, now }: { dir: string; now: number }): void {
    let dirents: fs.Dirent[];
    try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        // Directory missing or unreadable - nothing to prune here.
        return;
    }
    for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            pruneCacheTree({ dir: fullPath, now });
            try {
                if (fs.readdirSync(fullPath).length === 0) {
                    fs.rmdirSync(fullPath);
                }
            } catch {
                // Ignore a directory that is non-empty or already removed.
            }
        } else if (dirent.name.endsWith('.json')) {
            try {
                if (now - fs.statSync(fullPath).mtimeMs > PRUNE_MAX_AGE_MS) {
                    fs.rmSync(fullPath, { force: true });
                }
            } catch {
                // Ignore a single unreadable/already-removed entry.
            }
        }
    }
};

const pruneOldCacheEntries = function ({ projectRoot }: { projectRoot: string }): void {
    pruneCacheTree({ dir: cacheRootDir({ projectRoot }), now: Date.now() });
};

const writeCacheEntry = function ({ cacheKey, entry, namespace, partition, projectRoot }: { cacheKey: string; entry: CacheEntry; namespace: string; partition: string; projectRoot: string }): void {
    try {
        const dir = cacheDirForPartition({ namespace, partition, projectRoot });
        fs.mkdirSync(dir, { recursive: true });
        // Write to a per-process temp file, then rename: rename is atomic on the same filesystem, so
        // concurrent runs (manual `npm test` racing a husky hook) can never interleave into a corrupt
        // entry. (A corrupt entry would only be a MISS, but atomicity is nearly free here.)
        const filePath = path.join(dir, `${cacheKey}.json`);
        const tmpPath = `${filePath}.tmp-${process.pid}`;
        fs.writeFileSync(tmpPath, JSON.stringify(entry, null, 4) + '\n');
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        // A read-only or full .cache must never break the suite - just skip caching this run.
        console.error('Warning: could not write checks-execution cache entry.', err);
    }
};

export {
    computeCacheKey,
    isCacheDisabledByEnv,
    pruneOldCacheEntries,
    readCacheEntry,
    writeCacheEntry
};
