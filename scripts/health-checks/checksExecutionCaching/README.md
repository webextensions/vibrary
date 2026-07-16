# checksExecutionCaching

A small, reusable cache that lets the health-check suite SKIP work it has already verified for the
exact same git content state. The full behavior contract - what the cache key contains and why,
when entries are reused, the accepted caveats, and how to force a fresh run - lives in
[checks-execution-caching.md](../../../.claude/rules/checks-execution-caching.md);
this README covers the module's architecture only.

## Code map

- [computeGitContentHash.ts](computeGitContentHash.ts) - produces the deterministic content hash
  (`sha256(staged_tree_sha + worktree_plus_untracked_tree_sha)`); HEAD is returned separately and
  stored in entries as metadata only. Returns `null` when it cannot compute a hash - callers MUST
  treat `null` as "caching disabled, run normally" (the cache fails OPEN).
- [cacheStore.ts](cacheStore.ts) - reads/writes entries under
  `.cache/checks-executions/<namespace>/<partition>/<cacheKey>.json`:
  - `namespace` - the logical bucket: `checks` for the per-check entries.
  - `partition` - a shard directory within the bucket: the `gitContentHash`, so each content state
    gets its own folder (one readable file per check) rather than every check x state piling into
    one flat folder.
  - `cacheKey` - the entry filename, built by `computeCacheKey` from the check's signature (built
    by `buildCheckCacheSignature` in
    [../allIsWellConfig/resolveChecks.ts](../allIsWellConfig/resolveChecks.ts)).
  - Writes are atomic (temp file + rename), so concurrent runs cannot corrupt an entry; reads and
    writes never throw (miss or no-op on any error).
  - Entries older than 14 days are pruned (best-effort) across the whole cache tree, once per run,
    after the entries are written; directories left empty are removed, so aged-out content-state
    folders and retired namespaces both drain away.

## See also

- [../all-is-well.ts](../all-is-well.ts) - the consumer (namespace `checks`)
- [../allIsWellConfig/resolveChecks.ts](../allIsWellConfig/resolveChecks.ts) - per-check signature +
  cacheability partition
