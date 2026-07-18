# Vibrary documentation

Vibrary is a small, globally-installable web app for browsing and editing vibrary files - `reviews`, `specs`,
`tasks`, and `ideas` XML files (`<family>.xml` / `<family>-*.xml`) in a folder. Run `vibrary-server` (or
`vibrary server`) in a folder, and it opens a browser UI listing those files; selecting one opens it in an editor.

- [vibrary-file-format.md](vibrary-file-format.md) - the XML schema for a vibrary file and what each field means.
- [editor.md](editor.md) - the editor UI: the Structured and Raw tabs and how each field is edited.

## Prerequisites

- Node.js >= 22.18 (the package declares this as its `engines` floor; an older runtime is refused at startup).
- The [Claude Code](https://claude.com/claude-code) CLI on your `PATH` (`claude`), used by the AI actions - install it
  with `npm install -g @anthropic-ai/claude-code`. Everything else (browsing, editing, search, the git panel) works
  without it; the agent actions shell out to `claude` and fail with "Claude CLI not found on PATH" when it is absent
  (see [Agent runs and permissions](#agent-runs-and-permissions) below).

## Running

```bash
vibrary-server            # start the server in the current folder (auto-opens the browser)
vibrary server --port 4000 --no-open
vibrary server --host 0.0.0.0   # expose on the network, e.g. to open the UI from a phone
vibrary --help
```

The server starts on port 3000 and advances to the next free port if it is busy. By default it binds to
`127.0.0.1` (this machine only); `--host 0.0.0.0` exposes it to the network, which gives everyone on that network
the same powers the UI has - including agent runs (see below) - so only do it on networks you trust.

### Headless commands

Three subcommands work without a browser (or a `claude` CLI, or an API key - none of them runs an agent), over the
same `.vibraryinclude`-scoped files and the same rules the app's badges use:

```bash
vibrary init                       # scaffold this folder: a starter .vibraryinclude plus a specs.xml whose
                                   # entries demonstrate approvals, relations and labels (create-only: never
                                   # overwrites; --minimal writes just the .vibraryinclude)
vibrary check                      # exit 1 if anything is broken (prints each problem); 0 when clean
vibrary check --require-approved   # additionally fail on any unapproved or stale entry
vibrary check --json               # the same report, machine-readable, same exit codes
vibrary list                       # every included file with its approved/total and broken-reference counts
vibrary search <query>             # entry matches on stdout (--match-case / --whole-word and the type:/label:/
                                   # approved:/by:/file: operators, as in the Search panel)
```

`vibrary check` finds broken `relatesTo` references, folder-wide duplicate titles, and unparseable files - so a CI
step like `npx vibrary check --require-approved` can block a pull request on them. A folder with no `.vibraryinclude`
exits 2 ("unconfigured") rather than passing vacuously.

## The .vibraryinclude file

A `.vibraryinclude` at the folder root chooses which vibrary files the app lists and edits - nothing is shown (or
creatable) without one. Patterns are gitignore-style, matched by the `ignore` library: a pattern without a slash
applies at every depth (`specs*.xml` matches `docs/specs-auth.xml` too), and a `!` prefix re-excludes an earlier
match. The explorer's empty state offers a one-click **Create .vibraryinclude** that writes a starter file including
all four families; narrow it by editing the file - changes take effect on the next request, no restart needed.

```gitignore
# Show only specs, except the archived ones
specs*.xml
!specs-archive*.xml
```

## The explorer

The file list (the files icon in the navigation rail) lists every included vibrary file, grouping nested files into
folders by path. Each file carries a green approved/total badge; a file whose entries hold a dangling `relatesTo` (a
reference to a title no entry has) also shows an amber broken-reference count, and a file the server cannot read or
parse shows a `!`. The list footer sums the whole folder - "3 files, 12/40 approved" - for overall progress at a
glance, and shows the selection count instead while files are ticked. Above the list, **Open Editors** tracks the open
file tabs, with a **Save all** action when more than one has unsaved edits.

The header's **+** prompts for a name and creates a new vibrary file (its family taken from the name, e.g.
`tasks-auth.xml`); a slash in the name files it into a folder, creating the directories on the way (`docs/specs-api.xml`
- folders have no existence of their own, so this is also how a new folder is made). A refresh button re-reads the
folder, and **Collapse all folders** folds the tree. Each file's
**More options** menu renames, duplicates, or deletes it: a rename keeps any open tab pointing at the file (unsaved
edits follow the new name and remain unsaved until you save - it says so first), and a delete asks first and - because `relatesTo` references resolve by title folder-wide -
warns when entries in other files point at the ones being removed ("2 references from other files will break"), so an
irreversible delete never silently strands cross-file links. Ticking files' checkboxes enables a bulk **Delete** over
the selection.

## Agent runs and permissions

The AI actions ("Apply this spec", "Run this task", "Create entries with AI", chat follow-ups) run the Claude CLI
headlessly with permission prompts disabled (`--dangerously-skip-permissions`): a headless run has no way to surface
a permission prompt to the browser, so a gated run would simply hang. This means the agent can execute commands and
edit files as your user without asking - only run vibrary in folders, and on entries, that you trust. Two mitigations
apply: cancelling a run (or refreshing the page) kills the agent's whole process tree, and every run's exact prompt
is visible in the Activity monitor via the initial bubble's "Full" view.

## Activity monitor

Agent runs are queued and executed one at a time; the activity view (the pulse icon in the navigation rail) shows the
running job, the ones waiting behind it, and finished ones. A job's row opens its live transcript (the agent's output
as it streams), and the initial bubble's **Full** view shows the exact prompt that was sent. From the queue you can
pause and resume it, abort the running job, retry one that failed or was aborted, remove a queued or finished job,
reorder what is still queued, and filter the list by kind or status. A job that ran on a single entry ("Apply this
spec" / "Run this task") also has an **Open entry** button that jumps to that entry in the editor - or explains that it
was renamed or removed since the run. A run that ends in a chat takes free-text
follow-up messages (Ctrl/Cmd+Enter to send), continuing the same agent session.

## Source control

When the served folder is a Git repository, the source-control view (the branch icon in the navigation rail) is a small
Git panel over it. It lists the working tree's changes grouped as staged and unstaged; stages, unstages, and discards
files (discarding a file, or deleting an untracked one, is confirmed first, and a file's changes can be viewed before
you discard them); and commits, pushes, and pulls. **Generate** drafts a commit message from the staged diff with a
headless Claude run - the same agent machinery as the editor's actions - which you can edit before committing. A stash
section saves the current changes (untracked files included) and applies, pops, or drops entries. The panel refreshes
itself when an agent run finishes touching files, so a commit or apply that edited the tree shows up without a manual
refresh.

## Development

### Working on vibrary itself

```bash
npm install     # also wires the git diff driver below (prepare script)
npm start       # frontend build watcher + server with auto-reload
node --run dev  # vite dev server alone, proxying /api to a separately started server
```

Four checks gate every change - `node --run lint`, `node --run typecheck`, `node --run test` and
`node --run build` - and `prepack` runs them all before publishing.

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
