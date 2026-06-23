# truths documentation

`truths` is a small, globally-installable web app for browsing and editing `truths.xml` / `truths-*.xml` files in a
folder. Run `truths-server` (or `truths server`) in a folder, and it opens a browser UI listing those files; selecting
one opens it in an editor.

- [truths-file-format.md](truths-file-format.md) - the XML schema for a truths file and what each field means.
- [editor.md](editor.md) - the editor UI: the Structured and Raw tabs and how each field is edited.

## Running

```bash
truths-server            # start the server in the current folder (auto-opens the browser)
truths server --port 4000 --no-open
truths --help
```

The server starts on port 3000 and advances to the next free port if it is busy.

## Development

### Reorder-insensitive diffs for truth XML

Field order inside a `<truth>`, the order of `<truth>` entries, and the order of items inside
`<relatesTo>`/`<labels>` carry no meaning. A committed `.gitattributes` binds the truth files to a
`diff.truths-canon` external diff driver (`scripts/truths-diff.js`). For each diff it canonicalizes both sides (via
`scripts/canonicalize-truths.js`): if they are semantically equal - a pure reordering - it shows nothing; otherwise it
shows the full raw diff of the actual files, in real on-disk order with standard context (no minimizing or relocating).
The file on disk is never rewritten - `git status`, staging, and commits all use your bytes exactly as written.

git will not let a repo commit the command a diff driver runs, so the driver command lives in the committed `.gitconfig`
fragment and each clone includes it once. `npm install` does this automatically (via the `prepare` script, guarded to a
real checkout). To set it up by hand instead:

```bash
git config --local include.path ../.gitconfig
```
