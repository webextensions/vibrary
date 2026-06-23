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
