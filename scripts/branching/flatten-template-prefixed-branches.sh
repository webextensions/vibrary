#!/usr/bin/env bash

# Flatten every local "template-*" branch onto its "<branch>-flat" mirror.
#
# Use:
#
#     ./scripts/branching/flatten-template-prefixed-branches.sh [--create-branches]
#
# What this script does:
#
# - Discovers all local branches matching "template-*" (excluding the "*-flat" mirrors themselves) -
#   no hardcoded branch list; the branch family is described in docs/template-project/README.md.
# - Runs scripts/branching/flatten-branch.sh for each pair (--source <branch> --target <branch>-flat),
#   appending the new first-parent commits to each EXISTING mirror. Branches without a mirror are
#   skipped by default; pass --create-branches to create their missing "<branch>-flat" mirrors too
#   (creating a mirror is an explicit opt-in - the first run flattens the branch's entire
#   first-parent history). Mechanism, rationale, and the fork-side workflow:
#   docs/template-project/flat-branches.md.
# - Aborts on the first failing branch, leaving the remaining branches untouched.
# - Verifies at the end via `node --run branching:check-flat-branches` (read-only).
# - Uses local Git refs only (via flatten-branch.sh): it never fetches, pulls, or pushes - publishing
#   the mirrors stays a human step.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLATTEN_SCRIPT="${SCRIPT_DIR}/flatten-branch.sh"

FLAG_CREATE_BRANCHES=false

print_usage() {
    cat <<'USAGE'
Usage:
    ./scripts/branching/flatten-template-prefixed-branches.sh [--create-branches]

Flattens every local "template-*" branch (excluding "*-flat" mirrors) onto its EXISTING
"<branch>-flat" mirror via scripts/branching/flatten-branch.sh, then verifies the mirrors.
Branches without a mirror are skipped unless --create-branches is passed, which creates the
missing mirrors too.

The script does not pull or push. It uses local refs only, and only ever appends to the mirrors.
USAGE
}

die() {
    echo "Error: $*" >&2
    exit 1
}

require_clean_start() {
    local status_output

    status_output="$(git status --porcelain)"
    if [ -n "$status_output" ]; then
        echo "Error: The working tree or index is dirty." >&2
        echo "" >&2
        echo "$status_output" >&2
        echo "" >&2
        echo "Commit or stash these changes first." >&2
        exit 1
    fi
}

main() {
    local branch
    local flattened_count
    local repo_root
    local skipped_count

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --create-branches)
                FLAG_CREATE_BRANCHES=true
                shift
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                echo "Error: Unknown argument: $1" >&2
                echo "" >&2
                print_usage >&2
                exit 1
                ;;
        esac
    done

    # Captured into a variable first: outside a repo the substitution is empty and `cd ""` would
    # succeed silently in bash, swallowing the intended error.
    repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "This script must be run inside a Git repository"
    cd "$repo_root"

    require_clean_start

    flattened_count=0
    skipped_count=0

    # Streaming loop instead of `mapfile`, so macOS Bash 3.2 can run the script.
    while IFS= read -r branch; do
        case "$branch" in
            *-flat)
                continue
                ;;
        esac

        if [ "$FLAG_CREATE_BRANCHES" != true ] &&
            ! git show-ref --verify --quiet "refs/heads/${branch}-flat"; then
            echo "==> $branch: no ${branch}-flat mirror - skipped (pass --create-branches to create it)"
            skipped_count=$((skipped_count + 1))
            continue
        fi

        echo "==> $branch -> ${branch}-flat"
        "$FLATTEN_SCRIPT" --source "$branch" --target "${branch}-flat"
        echo ""

        flattened_count=$((flattened_count + 1))
    done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/template-*')

    if [ "$flattened_count" -eq 0 ]; then
        if [ "$skipped_count" -gt 0 ]; then
            echo "No existing mirrors to refresh ($skipped_count branch(es) without a mirror skipped; pass --create-branches to create them)."
        else
            echo "No local template-* branches found; nothing to flatten."
        fi
        exit 0
    fi

    echo "Flattened $flattened_count branch(es), skipped $skipped_count without a mirror. Verifying the mirrors ..."
    echo ""
    node --run branching:check-flat-branches

    echo ""
    echo "Nothing was pushed. Review each mirror and push manually when ready."
}

main "$@"
