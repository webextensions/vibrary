# The Raw tab is editable while the file is broken

The app's one unrecoverable state - a file that will not parse - had a documented remedy of "edit it outside the app,
then reopen it". The Raw tab is now a repair editor exactly when `parseError` is set: a monospace textarea seeded with
the broken on-disk text, a live parse verdict as you type (the same `parseVibraryXml` the app loads files with,
running in the browser, so "parses here" and "parses on reload" can never disagree - and its message carries the
failure position), and a **Save** that writes the text verbatim.

## The invariant: editable only while broken

Firm and deliberate. A raw edit to a PARSEABLE file would be laundered through the serializer on the next structured
save (the round-trip contract drops anything outside the schema) - so two editable views of a working file is a
data-loss trap, not a feature. Read-only Raw stays exactly as it was for parseable files.

## The write path

- No backend change: the existing `PUT /files/:name` writes whatever it is sent, and the `baseFileHash` guard still
  applies - a raw fix must not clobber a change written on disk since the load (an agent may have been mid-write when
  it produced the broken file). App-side, the guarded-write core was extracted from `saveGuardedAsync` so the model
  save (serializes) and the repair save (verbatim) share one 409-confirm flow.
- The backend deliberately does not validate parseability (it is the user's file, and refusing a partial fix
  mid-repair would be maddening) - pinned as a route test now that the repair UI relies on it. The UI carries the
  honesty instead: saving still-broken text asks "Save anyway?" first.
- On a successful save the tab reloads from disk (`reloadTabFromDisk` owns the transition): if the fix took,
  `parseError` clears and the Structured tab lights back up without a page reload; if not, the tab stays in repair.
- The repair draft is keyed by path + reloadNonce, so a tab switch or reload reseeds it - another file's text can
  never leak in.

## Deliberately not included

The proposal's optional "Fix this XML" agent action (a buffered run returning corrected XML for review) is a new
agent action with its own prompt and review flow - left for a human call.

## Tests

[backend/files/files.test.js](../../../backend/files/files.test.js) pins the verbatim write of unparseable content
(and the summary honestly reporting the file as unparseable afterwards). The live-check and transition behavior is
browser-side JSX over the already-tested core parser and reload path; the repo's node-only test setup does not
exercise components.
