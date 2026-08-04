#!/usr/bin/env bash

# Stop hook (fires when the agent is about to end its turn).
#
# Auto-fixes AI-style non-keyboard characters (em dash, en dash, curly quotes, ellipsis, bullet,
# box-drawing light horizontal (U+2500), tick marks, etc.) that the turn may have introduced. Runs the whole-repo fixer
# "node --run block-non-keyboard-characters:fix", which rewrites every non-suppressed file that
# drifted from the baseline (binary files are ignored, gitignored files are not listed, and suppressed
# or exempt files are skipped) and then re-checks. Whatever it changed is reported so the edit is visible
# in-context.
#
# Why at Stop (rather than per Write/Edit): the fixer runs once per turn over the whole repo, so it
# also catches files changed via Bash or codegen that never went through the Write/Edit tools. Files
# are rewritten as the turn ends, so there is no stale-view concern for in-flight edits.
#
# FORCE_COLOR=0 keeps the fixer's output plain so the "Fixed: <file>" lines parse reliably.
#
# Paired with:
#   - scripts/health-checks/checks/block-non-keyboard-characters/block-characters.ts  (the fixer / checker)
#   - scripts/health-checks/all-is-well.ts                                            (whole-repo check at pre-commit/pre-push)
#
# Behaviour:
#   - Runs the fixer (writes in place, then re-checks).
#   - If any files were rewritten, prints them to stderr.
#   - If non-keyboard characters still remain afterward (e.g. a suppressed file gained new chars that
#     the fixer will not touch), prints a warning to stderr.
#   - Does NOT block the stop. Exit code is always 0.
#
# Reads the Claude Code hook event JSON from stdin (unused - Stop events carry no file path).

output=$(FORCE_COLOR=0 node --run block-non-keyboard-characters:fix 2>&1)
status=$?

fixed=$(printf '%s\n' "$output" | grep '^Fixed: ' || true)

if [ -n "$fixed" ]; then
    {
        echo ''
        echo 'Stop hook - auto-corrected non-keyboard characters in:'
        echo ''
        echo "$fixed"
        echo ''
    } >&2
fi

if [ "$status" -ne 0 ]; then
    {
        echo ''
        echo 'Stop hook - non-keyboard characters still remain (could not be auto-fixed):'
        echo ''
        echo "$output"
        echo ''
        echo 'These are likely in files baselined in .block-non-keyboard-characters.suppressions.json.'
        echo "Fix them manually, or run 'node --run block-non-keyboard-characters:suppress' if intended."
        echo ''
    } >&2
fi

exit 0
