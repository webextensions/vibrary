# vibrary

Browse and edit vibrary files - `reviews`, `specs`, `tasks`, and `ideas` XML files
(`<family>.xml` / `<family>-*.xml`) in a folder - through a small local web UI. Entries can be created, edited,
approved, searched, related to each other, and Elo-ranked from head-to-head comparisons (your own verdicts or
AI-judged competition batches); `spec` and `task` entries can additionally be handed to a headless
[Claude Code](https://claude.com/claude-code) agent to apply or run against the folder's codebase. Agent runs execute
with permission prompts disabled (see "Agent runs and permissions" in [docs/README.md](https://github.com/webextensions/vibrary/blob/main/docs/README.md)), so only use
vibrary in folders, and on entries, that you trust.

## Prerequisites

- Node.js >= 22.18
- For the AI actions only (Apply spec, Run task, Create entries, chat): the
  [Claude Code](https://claude.com/claude-code) CLI on your `PATH`, installed with
  `npm install -g @anthropic-ai/claude-code`. Browsing, editing, searching, and the git panel all work without it;
  only the agent actions shell out to `claude`, and they fail with "Claude CLI not found on PATH" if it is missing.

## Install

```bash
npm install -g vibrary
```

## Quick start

```bash
cd your-project
vibrary-server            # start the server in the current folder (auto-opens the browser)
vibrary server --port 4000 --no-open
vibrary --help
```

The server starts on port 3000 and advances to the next free port if it is busy. Which files are shown is chosen by
a `.vibraryinclude` file in the folder (gitignore-style patterns, e.g. `specs*.xml`; prefix a pattern with `!` to
re-exclude).

## Documentation

- [docs/README.md](https://github.com/webextensions/vibrary/blob/main/docs/README.md) - overview, running, and development setup (including reorder-insensitive git
  diffs for vibrary files)
- [docs/editor.md](https://github.com/webextensions/vibrary/blob/main/docs/editor.md) - the editor UI: the Structured and Raw tabs and how each field is edited
- [docs/vibrary-file-format.md](https://github.com/webextensions/vibrary/blob/main/docs/vibrary-file-format.md) - the XML schema and what each field means

## License

MIT
