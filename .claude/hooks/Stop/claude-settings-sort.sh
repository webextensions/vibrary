#!/usr/bin/env bash

# Stop hook (fires when the agent is about to end its turn).
#
# Keeps .claude/settings.json and .claude/settings.local.json tidy: Claude Code appends "always allow"
# approvals to the END of the permissions.allow / permissions.deny arrays during a session and adds/edits
# other keys over time, leaving the document unordered. This hook runs "node --run claude-settings-sort:fix",
# which recursively sorts (case-insensitive) every object key and sorts + de-duplicates the allow / deny
# arrays in place, preserving each file's indentation and trailing newline.
#
# Why at Stop: the approval is written mid-turn (when a permission is granted), so by the time the turn
# ends the new entry is on disk and can be sorted. There is no tool call for permission writes, so a
# PreToolUse/PostToolUse matcher cannot catch them. Reordering is purely cosmetic, so doing it here is
# safe; if a later approval re-appends out of order, the next Stop re-sorts it.
#
# FORCE_COLOR=0 keeps the fixer's output plain so the "Sorted: <file>" line parses reliably.
#
# Paired with:
#   - scripts/health-checks/checks/claude-settings-sort.ts  (the check / fixer)
#   - scripts/health-checks/all-is-well.ts                  (the claude-settings-sort check at pre-commit/pre-push)
#
# Behaviour:
#   - Runs the fixer (writes in place only when something changed).
#   - If it sorted the file, prints what changed to stderr so the edit is visible in-context.
#   - Does NOT block the stop. Exit code is always 0.
#
# Reads the Claude Code hook event JSON from stdin (unused - Stop events carry no file path).

output=$(FORCE_COLOR=0 node --run claude-settings-sort:fix 2>&1)

sorted=$(printf '%s\n' "$output" | grep '^Sorted: ' || true)

if [ -n "$sorted" ]; then
    {
        echo ''
        echo 'Stop hook - sorted Claude settings:'
        echo ''
        echo "$sorted"
        echo ''
    } >&2
fi

exit 0
