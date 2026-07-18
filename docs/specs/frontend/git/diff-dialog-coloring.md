# Diff dialog line coloring

The Source Control panel's per-file diff dialog renders unified diffs through `DiffText`
([frontend/src/git/SourceControlPanel.tsx](../../../frontend/src/git/SourceControlPanel.tsx)): each line is classified
by its prefix - green background for additions, red for removals, muted for `@@` hunk headers - with file-header lines
(`+++`/`---`) left unclassed so they read as structure, matching every conventional diff renderer. The untracked-file
branch (full file content, not a diff) keeps the plain `<pre>`.

## Why

This dialog is the "look at what would be lost" affordance backing every irreversible discard/delete, and its most
common question is "what did the agent actually change?" - exactly the case where diffs are large. An uncolored wall
of text is genuinely hard to scan; every diff surface users know (GitHub, VS Code, git's own terminal output) colors
it.

## Why no diff-rendering library

The repo's tarball/bundle discipline is strict (see CLAUDE.md's packaging section), the input is git's own well-formed
unified format, and line-prefix classification is the entire hard part of the display this dialog needs.
