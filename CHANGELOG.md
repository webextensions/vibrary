# Changelog

All notable changes to this project are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow semantic versioning.

## 1.0.0

Initial release. A globally-installable local web app for browsing and editing vibrary files - `reviews` / `specs` /
`tasks` / `ideas` XML files in the folder the server is started in - with headless Claude Code agent actions. See the
[README](README.md) and [docs](https://github.com/webextensions/vibrary/blob/main/docs/README.md) for full usage.

### Server and CLI

- `vibrary server` (and the `vibrary-server` shortcut) serve a prebuilt React UI plus a JSON API over the current
  folder; `--port`, `--host`, and `--no-open` are honored by both entry points.
- Loopback bind by default; `--host 0.0.0.0` exposes it to the LAN (e.g. a phone) and prints the reachable LAN URLs.
- Cross-site request guard (Origin/Host checks) in front of the API, a Node-version guard that fails fast with a clear
  message, and graceful shutdown that stops in-flight agent runs on Ctrl+C.

### Editing

- Structured entry editor and a read-only Raw XML view (with copy and line-wrap), both backed by one model.
- Per-entry: approve / re-approve with content-hash staleness, duplicate, copy as Markdown, a live word/character
  count, a one-click "make unique" fix for duplicate titles, and up/down reordering.
- Bulk selection operations (approve, remove approval, copy as Markdown, duplicate, delete) and a batch agent apply.
- Filter entries by approval status, type, label, creator (Human / AI), or free text, with a one-click clear; a
  per-file approval meter; and a view-only sort (file order, title, recently updated, or approval status).
- Concurrent-change detection: a save is refused if the file changed on disk since it was opened.

### Navigation

- Quick-open palette (`Cmd/Ctrl+K`) to jump to any file or entry by name, a keyboard-shortcuts help dialog (`?`),
  full-text search across files (matching entry title, content, notes, and labels), and per-folder session restore
  of open tabs.

### Git and agents

- Source Control panel (stage / unstage / discard / commit / push / pull / stash) with AI-drafted commit messages,
  auto-refreshing when an agent run finishes.
- Headless `claude -p` actions (apply spec, run task, create entries, chat follow-ups) streamed to an activity monitor,
  serialized one run at a time.
