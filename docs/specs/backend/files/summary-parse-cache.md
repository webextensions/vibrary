# files-summary parse cache

`GET /files-summary` ([backend/files/files.js](../../../backend/files/files.js)) caches each file's parsed per-file
record (titles, tallies, references) in a module-scope map keyed by resolved path and validated by `(mtimeMs, size)`.
A refresh after one save re-parses ONE file and stats the rest.

## Why (measured)

The frontend refetches the summary after every save/delete/rename/move/generate, and in the common case exactly one
file changed - yet the endpoint re-read and re-parsed everything. Measured on 100 files x 30 entries: ~85-100 ms per
call, of which file reads are only ~5.7 ms - the synchronous XML work dominates (validate 15.2 ms + parse 59.1 ms).
The measurement refuted the earlier concurrent-reads idea (I/O is ~6% of the cost and the parse is single-threaded
CPU work); the cache follows the numbers, cutting the steady-state refresh to a few ms.

## Freshness contract

- Every call still stats every file (microseconds), so external edits are picked up immediately - the same visible
  behavior as no cache, matching the include-file's no-restart philosophy. A regression test pins this: an on-disk
  edit is reflected on the very next call.
- The mtime+size pair is the standard cheap validator; a same-mtime same-size rewrite (sub-timestamp-resolution) is
  the accepted residual risk build tools take.
- Failures are never cached (the next call retries), and keys for files gone from the listing are pruned per call so
  the map never outgrows the folder.

## Noted, not taken

The same measurement showed `parseVibraryXml` double-scans every document (`XMLValidator.validate` then
`parser.parse`); a parse-first-validate-in-catch order would halve the cold cost but changes core error shapes -
worth its own evaluation if ever needed.
