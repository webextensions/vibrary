# Route coverage: duplicate and title

The last two untested backend routes are covered:

- `POST /files/:name/duplicate` - four cases in
  [backend/files/files.test.js](../../../backend/files/files.test.js), mirroring the sibling rename tests: copy
  leaves the source intact, 409 for an existing target (the `wx` flag, not an overwrite), 404 for a non-included
  source plus 400 for a non-included target name, and a nested target creating its parent directory.
- `POST /title` - [backend/files/title.test.js](../../../backend/files/title.test.js), using the PATH-stubbed
  `claude` harness (the spawnClaude.test.js technique) over `startAppAsync`: the slugify contract (first non-empty
  stdout line through `normalizeTitle`, pinned with a chatty multi-line response), 400 for empty/whitespace/missing
  content, and a CLI failure surfacing as the 500 envelope with the stderr message.

## Why

The backend's route tests are otherwise exhaustive (case-only rename, same-inode move refusal, the baseFileHash 409
handshake, the one-agent 409, argv-overflow 413 all have named tests); the two gaps read as accidents against that
baseline, and both routes have behavior worth pinning. Both suites fit the existing idioms exactly - no new
infrastructure.
