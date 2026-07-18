# Search file reads go through resolveWithinCwd

`searchVibrary` ([backend/search/searchVibrary.js](../../../backend/search/searchVibrary.js)) resolves every candidate
file through `resolveWithinCwd` before reading it, exactly as the files router's `/files-summary` loop treats the same
`listVibraryFiles` output.

## Why

`resolveWithinCwd` is documented as the shared defense-in-depth guard "applied before any filesystem or git access".
The search loop used to be the one filesystem access that skipped it, reading with `path.join(cwd, name)` directly.
The names are glob-derived today, so this was not an exploitable hole - but the search route's `files` query parameter
does reach this loop (narrowing the glob output via Set intersection), and if that filter logic were ever loosened or
reordered, the read would silently have become client-controlled with no guard behind it. Defense-in-depth only works
when it is unconditional; each exception turns the invariant into a per-call-site audit.

No behavior change for any current input: a name that fails to resolve is skipped, the same tolerance the loop already
had for unreadable files.
