# Changelog

All notable changes to this project are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow semantic versioning.

## Unreleased

### Added

- A **Rankings** view (trophy icon in the navigation rail) that Elo-ranks the folder's idea entries from recorded
  head-to-head results: a standings table (rating, wins-losses, games) whose rows jump to their entries in the
  editor, and a **Compare** mode that presents two entries at a time (the least-compared pair first) - click a
  card's Wins button or use the arrow keys to record your verdict, Skip to see another pair - updating the standings
  live. A collapsible **Match history** lists every recorded result newest-first (with the judge, time, and any
  rationale), flags results whose entries were renamed or removed, and discards one result, the checked selection, or
  the whole log - each confirmed, with the standings recomputed exactly because ratings are always replayed from the
  kept records in `vibrary-rankings.json` at the folder root. AI-judged competitions build on this.
- Undo for the editor's destructive actions: single-card Remove and the bulk Delete, Change type, Find & replace, and
  Remove broken references operations each show a brief Undo toast that restores exactly what changed, leaving any
  edit made in the meantime untouched.
- Editable entry type - a Type dropdown on each card and a bulk "Change type" operation over the selected entries.
- A bulk "Move to file" operation that relocates the selected entries into another vibrary file - an existing one or a
  new file named in the dialog (to split a file into topic files) - appending them to the destination, for
  reclassifying or reorganizing entries without losing their ids, approval, or timestamps.
- A "Show more" / "Show less" clamp on long entry content in review mode, so one wall-of-text entry no longer buries
  the rest of the list.
- A **Markdown** toggle (footer) that renders entry content and notes as formatted Markdown - headings, emphasis, code,
  lists, quotes - in review mode; off by default, and remembered across reloads.
- The Search panel now marks the matched term in a jumped-to entry's title, content, and notes, and reveals the entry
  (un-clamping its content and opening its extra fields) so the match is visible where you land.
- A **Referenced by** section on each entry - the reverse of "Relates to" - listing the entries folder-wide that point
  at it, each a chip that opens the referencing entry. It tracks unsaved edits to the open file live.
- A **Back** button in the editor toolbar (or Alt+ArrowLeft), shown after you follow a "Relates to" or "Referenced by"
  chip, retraces the relation-navigation path (across files, one hop per press) so you can explore an entry's relations
  and return. Alt+ArrowLeft only intervenes when there is a hop to return to, so the browser's own Back still works.
- Deleting a file now warns in the confirmation when entries in other files reference the ones being removed (e.g.
  "2 references from other files will break"), so an irreversible delete no longer silently strands cross-file links.
- The file-list footer shows a folder-wide approval total ("3 files, 12/40 approved") alongside the per-file badges,
  for an at-a-glance sense of overall progress; it tracks the open files' live edits like the badges do.
- Editing the title of an entry that other entries reference now shows a "renaming breaks N links" hint, since
  `relatesTo` references resolve by exact title - a heads-up before an edit silently strands those links.
- Keyboard shortcuts to review and act on entries without the mouse: move focus between cards with Alt+ArrowUp/Down (the
  focused card takes a subtle blue accent), then **A** approves or re-approves it, **E** toggles edit mode, **C** copies
  it as Markdown, and **D** duplicates it. All are ignored while typing, A never removes an approval, and Ctrl/Cmd+C
  still copies selected text. The "?" help groups these under "Entry cards".

### Changed

- The entry sort order persists across tab switches and survives a reload, instead of resetting to file order.
- A manually added entry takes the file's own type family (a task in `tasks.xml`, an idea in `ideas.xml`), and a
  duplicated entry gets a unique `-copy` title instead of one that collides with an existing copy.

### Fixed

- A Search result whose only match was a label now jumps to the correct entry instead of silently doing nothing.

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
  count, a one-click "make unique" fix for a title duplicated within or across files, and up/down reordering.
- Broken "Relates to" references (pointing at a title no entry has) are flagged - an amber chip on the reference, a
  header badge on the entry, and a per-file count in the sidebar - and cleared in one click on a card or in bulk.
- Bulk selection operations (approve, remove approval, add / remove label, remove broken references, find & replace
  across content and notes, copy as Markdown, duplicate, delete) and a batch agent apply.
- Filter entries by approval status, type, label, creator (Human / AI), or free text, with a one-click clear; a
  per-file approval meter; and a view-only sort (file order, title, recently updated, or approval status).
- Save the active file (Ctrl/Cmd+S) or, when several are unsaved, every open file at once (Save all in the Open
  Editors list). Concurrent-change detection: a save is refused if the file changed on disk since it was opened.

### Navigation

- Quick-open palette (`Cmd/Ctrl+K`) to jump to any file or entry by name, `/` to jump to the entry text filter, a
  keyboard-shortcuts help dialog (`?`), full-text search across files (matching entry title, content, notes, and
  labels, and labelling each result with its entry type), and per-folder session restore of open tabs.

### Git and agents

- Source Control panel (stage / unstage / discard / commit / push / pull / stash) with AI-drafted commit messages,
  auto-refreshing when an agent run finishes.
- Headless `claude -p` actions (apply spec, run task, create entries, chat follow-ups) streamed to an activity monitor,
  serialized one run at a time.
