#!/usr/bin/env bash

# Stop hook (fires when the agent is about to end its turn).
#
# Type-check safety net: when this turn changed any TypeScript source, run the
# project typecheck and surface any errors as a NON-blocking warning, so type
# breakage shows up in-context at end of turn instead of waiting for the Husky
# pre-commit / pre-push gate.
#
# Reuses the existing "test:types" npm script (tsc --noEmit). Read-only: tsc
# emits nothing; this hook never edits files and never blocks the turn.
#
# Gated on changed files (staged + unstaged + untracked) matching a TypeScript
# extension, so turns that touched no .ts/.tsx pay nothing.
#
# Paired with ".claude/hooks/Stop/fix-lint-on-changed-files.sh" (sibling Stop
# safety net).
#
# Reads the Claude Code hook event JSON from stdin (unused - Stop events carry
# no file-path payload worth gating on).

changedTsFiles=$(
    {
        git diff --cached --name-only --diff-filter=ACMRU
        git diff --name-only --diff-filter=ACMRU
        git ls-files --others --exclude-standard
    } | sort -u | grep -E '\.(cts|mts|ts|tsx)$'
)

if [ -z "$changedTsFiles" ]; then
    exit 0
fi

typecheckOutput=$(node --run test:types 2>&1)
if [ $? -ne 0 ]; then
    {
        echo ''
        echo 'Stop hook - TypeScript type errors detected (fix before committing):'
        echo ''
        echo "$typecheckOutput"
        echo ''
    } >&2
fi

exit 0
