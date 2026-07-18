# The shared delete pipeline

`confirmAndDeletePathsAsync(paths, target)` in
[frontend/src/explorer/useFileOperations.ts](../../../frontend/src/explorer/useFileOperations.ts) is the one home for
the explorer's delete flow: warn (with the breaking-references count), delete sequentially closing each file's tab,
stop at the first failure naming the failing file, and refresh the listing even after a failure. `handleDelete` (a
tree node from the More menu) and `handleBulkDelete` (the multi-select footer) are thin entry points that differ only
in how the confirmation names the target.

## Why

The two handlers duplicated the whole pipeline (~25 lines), including the `finally` refresh whose explanatory comment
was maintained twice word for word. That `finally` encodes a non-obvious decision - refresh after PARTIAL failure so
already-deleted files do not linger as ghosts - and a future fix applied to one copy would silently miss the other.

## The surprising return value

The pipeline resolves whether the user CONFIRMED, not whether every delete succeeded - deliberately: the sidebar uses
the return only to decide whether to clear its selection, and a partial delete has genuinely changed what the
selection refers to, so clearing on confirm is right either way. This preserves the pre-merge behavior of both entry
points exactly.
