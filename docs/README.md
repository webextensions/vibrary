# Vibrary documentation

Vibrary is a small, globally-installable web app for browsing and editing vibrary files - `reviews`, `specs`,
and `tasks` XML files (`<family>.xml` / `<family>-*.xml`) in a folder. Run `vibrary-server` (or
`vibrary server`) in a folder, and it opens a browser UI listing those files; selecting one opens it in an editor.

- [vibrary-file-format.md](vibrary-file-format.md) - the XML schema for a vibrary file and what each field means.
- [editor.md](editor.md) - the editor UI: the Structured and Raw tabs and how each field is edited.

## Running

```bash
vibrary-server            # start the server in the current folder (auto-opens the browser)
vibrary server --port 4000 --no-open
vibrary --help
```

The server starts on port 3000 and advances to the next free port if it is busy.

## Development

### Reorder-insensitive diffs for vibrary XML

Field order inside an `<entry>`, the order of `<entry>` elements, and the order of items inside
`<relatesTo>`/`<labels>` carry no meaning. A committed `.gitattributes` binds the vibrary files to a
`diff.vibrary-canon` external diff driver (`scripts/vibrary-diff.js`). For each diff it canonicalizes both sides (via
`scripts/canonicalize-vibrary.js`): if they are semantically equal - a pure reordering - it shows nothing; otherwise it
shows the full raw diff of the actual files, in real on-disk order with standard context (no minimizing or relocating).
The file on disk is never rewritten - `git status`, staging, and commits all use your bytes exactly as written.

git will not let a repo commit the command a diff driver runs, so the driver command lives in the committed `.gitconfig`
fragment and each clone includes it once. `npm install` does this automatically (via the `prepare` script, guarded to a
real checkout). To set it up by hand instead:

```bash
git config --local include.path ../.gitconfig
```
