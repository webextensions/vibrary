# Diff driver: the raw line fingerprint check

`scripts/vibrary-diff.js` suppresses a diff only when BOTH checks agree: the two sides canonicalize to identical text
AND their raw contents match as sorted multisets of trimmed non-blank lines (`lineFingerprint` in
[scripts/canonicalize-vibrary.js](../../scripts/canonicalize-vibrary.js)).

## Why

Canonical equality alone had a verified blind spot: canonicalization goes through `parseVibraryXml`, which drops
unknown child elements and normalizes out-of-vocabulary values, so a change touching only what the parser discards
(adding `<custom>SECRET-CHANGE</custom>`, changing `<createdBy>alice</createdBy>` to `bob`) canonicalized to
identical text - and `git diff` showed NOTHING for a file that genuinely changed. Staging and commits always used the
real bytes, but a reviewer running `git diff` before committing saw a clean tree while real changes rode along
invisibly, inverting the driver's contract ("emit nothing" means "pure reordering").

## Why a fingerprint, not a lossless parser

Every transformation the driver exists to suppress - reordering entries, fields within an entry, or `<ref>`/`<label>`
items - moves whole lines without changing their content, so the sorted-lines fingerprint is invariant under all of
them while any dropped/added/edited line changes it. Failure directions are safe by construction: a false mismatch (a
reorder that also re-wraps a line) merely falls through to the raw unified diff - slightly noisy, never wrong. Making
`parseVibraryXml` lossless would change the app's model (see the still-open
`parse-normalization-lossy-round-trip` suggestion for the editor-side face of the same parser behavior); the
fingerprint keeps the fix local to the driver at the cost of two line sorts per diff.

## Tests

[scripts/canonicalize-vibrary.test.js](../../scripts/canonicalize-vibrary.test.js) pins both verified blind-spot
cases (unknown-element add, out-of-vocabulary agent change: canonical forms equal, fingerprints differ) and the
fingerprint's invariance under every reordering the driver suppresses.
