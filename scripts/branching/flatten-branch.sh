#!/usr/bin/env bash

# Append the source branch's new first-parent commits onto its flat mirror branch.
#
# Use:
#
#     ./scripts/branching/flatten-branch.sh --source template-web-app --target template-web-app-flat
#
# What this script does:
#
# - Produces a LINEAR mirror of a template branch, so a forked project can fork from a branch whose
#   history is one commit per change instead of the template family's tangled multi-branch history.
#   Background, rationale, and the fork-side workflow: docs/template-project/flat-branches.md
# - Walks `git rev-list --first-parent`, so a merge of a base branch into the source becomes ONE flat
#   commit carrying the merged result ("one template update"), not the base branch's individual commits.
# - Reuses each source commit's TREE object verbatim via `git commit-tree`. It copies trees, it does
#   not re-apply patches: the mirror is byte-identical to the source at every step, the operation can
#   never conflict, and it is deterministic.
# - Is APPEND-ONLY. Each flat commit ends with a `Template-Source-Commit: <sha>` trailer; a re-run
#   reads the last one and appends only what is newer. Existing flat commits are never rewritten, so
#   forks that already merged them keep a valid merge base. The script refuses to regenerate a mirror
#   from scratch - see "Limitations".
# - Copies each source commit's author/committer identity and dates, so re-running produces identical
#   commit shas.
# - Uses local Git refs only. It never fetches, pulls, pushes, or updates remote refs, and it moves
#   only the target ref (one `git update-ref` at the end).
# - Never reads or writes the working tree or the index - it is pure ref/object plumbing
#   (`rev-list` / `commit-tree` / `update-ref`). The clean-tree gate below is therefore a convention
#   guard, not a correctness requirement, and `--allow-dirty` lifts it.
#
# Limitations:
#
# - A flat branch is GENERATED OUTPUT: never commit onto it directly, and never delete-and-rebuild it.
#   Rebuilding gives every flat commit a new sha, which destroys the merge base of every fork that
#   already merged it and reintroduces the repeated-conflict problem the mirror exists to avoid.
# - If the target branch exists but its tip carries no `Template-Source-Commit` trailer, the script
#   stops rather than guess where to resume (that branch was not produced by this script, or someone
#   committed onto it by hand).
# - Results are only as fresh as the local source ref; run your own fetch/merge first if needed.

set -Eeuo pipefail

SOURCE_REF=""
TARGET_REF=""
FLAG_ALLOW_DIRTY=false

TRAILER_KEY="Template-Source-Commit"

print_usage() {
    cat <<'USAGE'
Usage:
    ./scripts/branching/flatten-branch.sh --source <ref> --target <ref> [--allow-dirty]

Example:
    ./scripts/branching/flatten-branch.sh --source template-web-app --target template-web-app-flat

The script does not pull or push. It uses local refs only, and only ever appends to the target branch.
USAGE
}

die() {
    echo "Error: $*" >&2
    exit 1
}

die_with_usage() {
    echo "Error: $*" >&2
    echo "" >&2
    print_usage >&2
    exit 1
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --help|-h)
                print_usage
                exit 0
                ;;
            --source)
                [ "$#" -ge 2 ] || die "Missing value for --source"
                SOURCE_REF="$2"
                shift 2
                ;;
            --target)
                [ "$#" -ge 2 ] || die "Missing value for --target"
                TARGET_REF="$2"
                shift 2
                ;;
            --allow-dirty)
                FLAG_ALLOW_DIRTY=true
                shift
                ;;
            *)
                die "Unknown argument: $1"
                ;;
        esac
    done
}

git_without_hooks() {
    HUSKY=0 git -c core.hooksPath=/dev/null "$@"
}

require_clean_start() {
    local status_output

    if [ "$FLAG_ALLOW_DIRTY" = true ]; then
        return 0
    fi

    status_output="$(git status --porcelain)"
    if [ -n "$status_output" ]; then
        echo "Error: The working tree or index is dirty." >&2
        echo "" >&2
        echo "$status_output" >&2
        echo "" >&2
        echo "This script only reads Git objects and moves the target ref, so a dirty tree cannot" >&2
        echo "affect its result. The gate matches the other scripts in scripts/branching/ - pass" >&2
        echo "--allow-dirty to skip it, or commit / stash these changes first." >&2
        exit 1
    fi
}

# The sha the target branch was last built up to, read from its tip commit's trailer.
get_last_synced_source_commit() {
    local target_message
    local trailer_value

    target_message="$(git log -1 --format=%B "$TARGET_REF")"
    trailer_value="$(printf '%s\n' "$target_message" | sed -n "s/^${TRAILER_KEY}: //p" | tail -1)"

    printf '%s' "$trailer_value"
}

main() {
    local source_commit
    local last_synced_source_commit
    local commit_range
    local parent_commit
    local candidate
    local candidate_tree
    local candidate_message
    local appended_count

    parse_args "$@"

    [ -n "$SOURCE_REF" ] || die_with_usage "Missing required --source"
    [ -n "$TARGET_REF" ] || die_with_usage "Missing required --target"

    [ "$SOURCE_REF" != "$TARGET_REF" ] || die "--source and --target must differ (both are: $SOURCE_REF)"

    cd "$(git rev-parse --show-toplevel 2>/dev/null)" || die "This script must be run inside a Git repository"

    require_clean_start

    source_commit="$(git rev-parse --verify -q "refs/heads/${SOURCE_REF}^{commit}")" ||
        die "Source branch does not exist locally: $SOURCE_REF"

    if git show-ref -q --verify "refs/heads/$TARGET_REF"; then
        last_synced_source_commit="$(get_last_synced_source_commit)"

        if [ -z "$last_synced_source_commit" ]; then
            echo "Error: The target branch exists but its tip has no \"${TRAILER_KEY}\" trailer: $TARGET_REF" >&2
            echo "" >&2
            echo "This script can only APPEND to a mirror it produced itself, and it must never rebuild" >&2
            echo "one from scratch (that would change every flat commit's sha and break the merge base" >&2
            echo "of any fork that already merged it). Inspect the branch by hand:" >&2
            echo "    git log -1 $TARGET_REF" >&2
            exit 1
        fi

        git rev-parse --verify -q "${last_synced_source_commit}^{commit}" >/dev/null ||
            die "The ${TRAILER_KEY} trailer on $TARGET_REF points at an unknown commit: $last_synced_source_commit"

        commit_range="${last_synced_source_commit}..${source_commit}"
        parent_commit="$(git rev-parse --verify "refs/heads/$TARGET_REF")"
    else
        commit_range="$source_commit"
        parent_commit=""
    fi

    echo "Source ref: $SOURCE_REF ($source_commit)"
    echo "Target ref: $TARGET_REF${parent_commit:+ ($parent_commit)}"
    echo ""

    appended_count=0

    # Streaming loop instead of `mapfile`, so macOS Bash 3.2 can run the script.
    while IFS= read -r candidate; do
        candidate_tree="$(git rev-parse "${candidate}^{tree}")"
        candidate_message="$(git log -1 --format=%B "$candidate")"

        # The blank line before the trailer keeps it readable by `git interpret-trailers` and
        # `git log --format=%(trailers)`.
        candidate_message="${candidate_message}

${TRAILER_KEY}: ${candidate}"

        # Carry the source identities and dates so re-running yields identical flat shas.
        GIT_AUTHOR_NAME="$(git log -1 --format=%an "$candidate")"
        GIT_AUTHOR_EMAIL="$(git log -1 --format=%ae "$candidate")"
        GIT_AUTHOR_DATE="$(git log -1 --format=%aI "$candidate")"
        GIT_COMMITTER_NAME="$(git log -1 --format=%cn "$candidate")"
        GIT_COMMITTER_EMAIL="$(git log -1 --format=%ce "$candidate")"
        GIT_COMMITTER_DATE="$(git log -1 --format=%cI "$candidate")"
        export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE
        export GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

        if [ -n "$parent_commit" ]; then
            parent_commit="$(git_without_hooks commit-tree "$candidate_tree" -p "$parent_commit" -m "$candidate_message")"
        else
            parent_commit="$(git_without_hooks commit-tree "$candidate_tree" -m "$candidate_message")"
        fi

        appended_count=$((appended_count + 1))
        echo "APPENDED $(git rev-parse --short "$parent_commit") <- $(git rev-parse --short "$candidate") $(git log -1 --format=%s "$candidate" | tr '\n\r\t' '   ')"
    done < <(git rev-list --first-parent --reverse "$commit_range")

    if [ "$appended_count" -eq 0 ]; then
        echo "Already up to date: $TARGET_REF already mirrors $SOURCE_REF."
        exit 0
    fi

    git_without_hooks update-ref "refs/heads/$TARGET_REF" "$parent_commit"

    echo ""
    echo "Appended $appended_count commit(s) to $TARGET_REF ($parent_commit)."
    echo ""
    echo "Verify:"
    echo "    git diff $SOURCE_REF $TARGET_REF   # expected: empty"
}

main "$@"
