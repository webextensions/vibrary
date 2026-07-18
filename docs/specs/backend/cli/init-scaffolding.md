# vibrary init, and the format doc the generate prompt can finally read

Two changes from one proposal, deliberately separated as it asked ("fix the prompt first; scaffold second"):

## The prompt fix (the bug)

`runClaudeGenerate`'s prompt used to say "If docs/vibrary-file-format.md exists in this folder, read it" - true in
vibrary's own repo, false for every npm-installed user, so installed users' agents only ever saw the abbreviated
inline rules: a works-on-my-machine gap the developers were the one population never to experience. The prompt now
points at the INSTALLED package's own shipped copy by absolute path
([backend/files/runClaudeGenerate.js](../../../backend/files/runClaudeGenerate.js)) - unconditional, because
`docs/*.md` is in the `files` list and the smoke test guards its presence. This is the proposal's own preferred fix
("probably the best answer to the bug"): the doc never needed to live in the user's tree at all, so no scaffolded
copy is written and none can drift from the installed release.

## The scaffold (`vibrary init`)

[backend/files/initVibrary.js](../../../backend/files/initVibrary.js), wired as a CLI subcommand beside the other
headless commands:

- Writes the `.vibraryinclude` from the SAME `VIBRARY_INCLUDE_TEMPLATE` constant the in-app bootstrap route uses
  (imported, not copied - asserted byte-for-byte in the tests), and a starter `specs.xml`.
- The starter entries are built through the core's own `emptySpec`/`serializeVibraryXml`/`hashContent` - valid by
  construction, no second copy of the format to drift - and DEMONSTRATE the model: a genuinely approved entry (its
  `approved` hash matches its content, so `approvalState` says `current`), an entry whose `relatesTo` resolves to it,
  labels on both.
- Every write is create-only (`wx`), each existing file reported individually as kept; a second `init` is a safe
  no-op that says so. `--minimal` writes only the include (the in-app button's behavior).

## Tests

- [backend/files/initVibrary.test.js](../../../backend/files/initVibrary.test.js) - template byte-equality with the
  route's constant, the starter genuinely demonstrating a `current` approval and a resolving relation, create-only
  reruns, per-file skip reporting, `--minimal`.
- [backend/cli.test.js](../../../backend/cli.test.js) - the real binary's init output, rerun messaging, and that a
  freshly scaffolded folder immediately passes `vibrary check`.
- [backend/files/agents.test.js](../../../backend/files/agents.test.js) - the generate prompt names the shipped
  format doc path.
