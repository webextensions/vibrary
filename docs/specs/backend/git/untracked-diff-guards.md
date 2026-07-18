# Untracked diff preview: size cap and binary sniff

The untracked-file branch of `GET /git/diff` ([backend/git/git.js](../../../backend/git/git.js)) guards its raw read
with proportionality checks before returning the file's content as the "diff":

- Files over `MAX_UNTRACKED_PREVIEW_BYTES` (1 MiB) answer `File is too large to preview (N bytes)` instead of
  buffering the whole file and doubling it through the JSON envelope.
- A NUL byte in the first 8000 bytes - git's own binary heuristic - answers `Binary file`, so the untracked branch
  agrees with the tracked branch (where git itself says "Binary files differ") on what counts as binary.

## Why

The tracked branch inherits git's own binary/size handling; the untracked branch read raw bytes with no bound,
decoding a stray image or multi-hundred-MB archive as UTF-8 mojibake and shipping it whole to the browser. The
discard flow is exactly where accidental clutter (build output, downloads, archives) shows up, so this branch is
disproportionately likely to meet such files. The existing security guard (only paths git reports as `??` are
readable) is unchanged - this adds proportionality on top.

The notices travel in the existing `diff` field; the dialog renders them as plain unclassed text (the diff coloring
only classes `+`/`-`/`@@`-prefixed lines), so no frontend change was needed.

## Tests

[backend/git/git.test.js](../../../backend/git/git.test.js) pins both notices against a real repo fixture (a
NUL-carrying blob and a just-over-cap file).
