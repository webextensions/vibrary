#!/usr/bin/env bash

# Stop hook (fires when the agent is about to end its turn).
#
# Auto-fixes lint on files changed in the working tree (staged + unstaged +
# untracked), then surfaces any remaining NON-autofixable problems as a
# non-blocking warning, so every turn leaves clean, formatted diffs and the
# Husky pre-commit/pre-push checks (which only REPORT) rarely surprise you
# later.
#
# Reuses the eslint:changed-files:fix package.json script (it writes autofixable
# fixes AND reports whatever remains, exiting non-zero when errors survive).
#
# Paired with ".claude/hooks/Stop/fix-non-keyboard-characters.sh" (sibling Stop
# autofix).
#
# Reads the Claude Code hook event JSON from stdin (unused - Stop events carry
# no file-path payload worth gating on).

eslintOutput=$(node --run eslint:changed-files:fix 2>&1)
if [ $? -ne 0 ]; then
    {
        echo ''
        echo 'Stop hook - lint auto-fix applied; some problems need manual fixes:'
        echo ''
        echo "$eslintOutput"
        echo ''
    } >&2
fi

exit 0
