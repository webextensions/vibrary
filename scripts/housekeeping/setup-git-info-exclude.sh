#!/usr/bin/env bash

# Seed this clone's .git/info/exclude from docs/template-project/git-info-exclude.example.
#
# .git/info/exclude is git's per-clone ignore file; this repository uses it as the SECONDARY home
# for machine-local personal ignore patterns (the PRIMARY home for every shared pattern is the
# committed config of the abstract-javascript-project branch - see the example file's header and
# .claude/skills/updating-ignore-rules/SKILL.md). Because the file lives inside .git/ it can never
# be committed, so this script copies the committed example's patterns into it.
#
# Idempotent and append-only: every non-comment pattern line of the example that is not already
# present verbatim in .git/info/exclude is appended (in example order, under a marker comment);
# existing lines are never removed or rewritten, so local additions survive re-runs.
#
# Usage (from the project's root folder):
#     $ node --run setup:git-exclude

set -Eeuo pipefail

die() {
    echo "Error: $*" >&2
    exit 1
}

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || die "This script must be run inside a Git repository"

EXAMPLE_FILE="docs/template-project/git-info-exclude.example"
[ -f "$EXAMPLE_FILE" ] || die "Example file not found: $EXAMPLE_FILE"

# --git-path resolves correctly for normal clones, linked worktrees, and .git-file layouts (the
# file lives in the clone's common git dir, so all worktrees share it).
EXCLUDE_FILE="$(git rev-parse --git-path info/exclude)"

mkdir -p "$(dirname "$EXCLUDE_FILE")"
touch "$EXCLUDE_FILE"

appended_count=0

while IFS= read -r line; do
    # Skip the example's blank and comment lines; only pattern lines are seeded.
    case "$line" in
        ''|'#'*)
            continue
            ;;
    esac

    if grep -qxF -- "$line" "$EXCLUDE_FILE"; then
        continue
    fi

    if [ "$appended_count" -eq 0 ]; then
        {
            echo ""
            echo "# Appended from $EXAMPLE_FILE by \"node --run setup:git-exclude\""
        } >> "$EXCLUDE_FILE"
    fi

    echo "$line" >> "$EXCLUDE_FILE"
    appended_count=$((appended_count + 1))
    echo "APPENDED $line"
done < "$EXAMPLE_FILE"

if [ "$appended_count" -eq 0 ]; then
    echo "Already up to date: $EXCLUDE_FILE contains every pattern from $EXAMPLE_FILE."
else
    echo ""
    echo "Appended $appended_count pattern(s) to $EXCLUDE_FILE."
fi
