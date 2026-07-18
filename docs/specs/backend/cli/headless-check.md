# Headless CLI: vibrary check / list / search

The `vibrary` binary grew three agent-free subcommands beside `server`, all running the same Express-free workers the
routes use (the `{ cwd }`-factory split keeps workers transport-independent - this is what that separation was for):

- `vibrary check [--require-approved] [--json]` - the headline: a CI gate that exits 1 when the folder has broken
  `relatesTo` references, folder-wide duplicate titles, or unparseable files; `--require-approved` additionally fails
  unapproved and stale entries. `npx vibrary check --require-approved` is a one-line required PR check.
- `vibrary list` - per-file approved/total and broken-reference tallies.
- `vibrary search <query> [--match-case] [--whole-word]` - `searchVibrary` on stdout.

## The rules live once

[backend/files/checkVibrary.js](../../../backend/files/checkVibrary.js) reuses `listVibraryFiles` (the
`.vibraryinclude` gate), `parseVibraryXml`, `approvalState`, and `countApprovedSpecs` - the SAME helpers behind the
sidebar's badges - so `vibrary check` and the app can never disagree about whether a folder is healthy. Note the
approval rule: `approvalState` answers `none | current | stale`, and anything but `current` fails the strict gate
(the proposal's sketch compared against a nonexistent `'approved'` state; the implementation follows the core).

## Exit codes are the contract

- `0` - clean. `1` - problems (printed one per line on stderr, or as JSON with `--json`).
- `2` - unconfigured: no `.vibraryinclude` exists, so the scan is trivially empty and MUST NOT read as clean - a
  silently vacuous CI gate is worse than no gate. `list` and `search` report the same state the same way.

No command shells out to `claude`, so they run in a CI container with no agent CLI and no API key.

## Deliberately not included: show / export

The proposal's `vibrary show <title>` and `vibrary export` need the entry-to-Markdown serializer, which lives in the
frontend (`specMarkdown.ts`) and is NOT shipped in the tarball - reusing it means either relocating it into the
shared core (a change to the core's public surface worth its own decision) or a second copy that would drift. Left
out until that relocation is decided.

## Tests

- [backend/files/checkVibrary.test.js](../../../backend/files/checkVibrary.test.js) - the exact problems set over a
  fixture with a dangling reference, a cross-file duplicate title, a stale approval and an unparseable file;
  `--require-approved` as the only surfacer of approval problems; per-file tallies; the unconfigured report.
- [backend/cli.test.js](../../../backend/cli.test.js) - the real binary's exit codes (0/1/2), `--json`, and the
  list/search output shapes, via child-process runs of `bin/vibrary.js`.
