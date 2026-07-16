#!/usr/bin/env bash

# Find the newest local source-branch commit that is safe to merge into a base branch.
#
# Default use:
#
#     ./scripts/branching/find-safe-template-merge-commit.sh
#
# Equivalent explicit use:
#
#     ./scripts/branching/find-safe-template-merge-commit.sh --base main --source template
#
# Custom test command:
#
#     ./scripts/branching/find-safe-template-merge-commit.sh --base main --source template -- node --run test
#
# What this script does:
#
# - Uses local Git refs only. It never fetches, pulls, pushes, or updates remote refs.
# - Aborts before doing any Git probe work when the starting working tree or index is dirty.
# - Disables Git hooks only for internal probe checkout/reset/merge operations. The configured
#   test command still runs normally.
# - Treats "latest" as the newest first-parent commit reachable from the source branch and not
#   reachable from the base branch.
# - Tests each candidate by temporarily detaching HEAD at the base commit, creating a probe merge
#   commit for that candidate, and running the configured test command.
# - Considers a candidate safe only when:
#     - `git merge` completes with no conflict or merge error.
#     - The merge result leaves the working tree clean before tests run.
#     - The configured test command exits with status 0.
# - Restores the original branch or detached HEAD before exiting.
# - Runs `git clean -fd` during cleanup only after a clean starting state has been verified, so it
#   removes only unignored artifacts created during probing.
#
# Limitations:
#
# - Results are only as fresh as the local `main` and `template` refs.
# - A commit that would pass only after installing or rebuilding dependencies is reported as
#   test-failed when the configured test command fails in the current environment.
# - The default `node --run test` command matches the user-facing command normally used for this workflow.

set -Eeuo pipefail

BASE_REF="main"
SOURCE_REF="template"
TEST_COMMAND=("node" "--run" "test")

PROJECT_ROOT=""
START_HEAD=""
START_BRANCH=""
BASE_COMMIT=""
SOURCE_COMMIT=""
FLAG_CAN_CLEANUP=false

print_usage() {
    cat <<'USAGE'
Usage:
    ./scripts/branching/find-safe-template-merge-commit.sh [--base <ref>] [--source <ref>] [-- <test command>]

Defaults:
    --base main
    --source template
    test command: node --run test

Examples:
    ./scripts/branching/find-safe-template-merge-commit.sh
    ./scripts/branching/find-safe-template-merge-commit.sh --base main --source template
    ./scripts/branching/find-safe-template-merge-commit.sh --base main --source template -- node --run test

The script does not pull or push. It uses local refs only.
USAGE
}

die() {
    echo "Error: $*" >&2
    exit 1
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --help|-h)
                print_usage
                exit 0
                ;;
            --base)
                [ "$#" -ge 2 ] || die "Missing value for --base"
                BASE_REF="$2"
                shift 2
                ;;
            --source)
                [ "$#" -ge 2 ] || die "Missing value for --source"
                SOURCE_REF="$2"
                shift 2
                ;;
            --)
                shift
                [ "$#" -gt 0 ] || die "Missing test command after --"
                TEST_COMMAND=("$@")
                break
                ;;
            *)
                die "Unknown argument: $1"
                ;;
        esac
    done
}

get_git_status() {
    git status --porcelain
}

git_without_hooks() {
    HUSKY=0 git -c core.hooksPath=/dev/null "$@"
}

require_clean_start() {
    local status_output

    status_output="$(get_git_status)"
    if [ -n "$status_output" ]; then
        echo "Error: The working tree or index is dirty. Aborting before any merge probes." >&2
        echo "" >&2
        echo "$status_output" >&2
        echo "" >&2
        echo "Please commit, stash, or otherwise clean these changes before running this script." >&2
        exit 1
    fi
}

abort_merge_if_needed() {
    if git rev-parse --verify -q MERGE_HEAD >/dev/null; then
        git_without_hooks merge --abort >/dev/null 2>&1 ||
            git_without_hooks reset --merge >/dev/null 2>&1 ||
            true
    fi
}

restore_starting_git_state() {
    abort_merge_if_needed

    # Always return the worktree contents to the exact commit where the script started before
    # reattaching the original branch name. The script never moves branch refs, so this is enough
    # to abandon any detached probe merge commits.
    if [ -n "$START_HEAD" ]; then
        git_without_hooks reset --hard -q "$START_HEAD" >/dev/null 2>&1 || true
    fi

    if [ -n "$START_BRANCH" ]; then
        git_without_hooks checkout -q "$START_BRANCH" >/dev/null 2>&1 || true
    elif [ -n "$START_HEAD" ]; then
        git_without_hooks checkout -q --detach "$START_HEAD" >/dev/null 2>&1 || true
    fi
}

cleanup() {
    local exit_code=$?
    local final_status

    trap - EXIT INT TERM

    # This flag is set only after the starting state is confirmed clean. From that point onward,
    # `git clean -fd` removes only unignored artifacts created during probe merges or tests.
    if [ "$FLAG_CAN_CLEANUP" = true ]; then
        restore_starting_git_state
        git clean -fd -q >/dev/null 2>&1 || true

        final_status="$(get_git_status || true)"
        if [ -n "$final_status" ]; then
            echo "" >&2
            echo "Warning: Cleanup could not restore a clean Git state." >&2
            echo "$final_status" >&2
            exit_code=1
        fi
    fi

    exit "$exit_code"
}

get_commit_subject() {
    # Keep progress output one-line even for unusual commit subjects.
    git log -1 --format=%s "$1" | tr '\n\r\t' '   '
}

get_short_sha() {
    git rev-parse --short "$1"
}

join_lines_for_report() {
    local value="$1"

    if [ -z "$value" ]; then
        printf '%s' "<no unmerged paths reported>"
        return
    fi

    printf '%s' "$value" | paste -sd ' ' -
}

print_start_summary() {
    echo "Base ref: $BASE_REF ($BASE_COMMIT)"
    echo "Source ref: $SOURCE_REF ($SOURCE_COMMIT)"
    echo "Test command: ${TEST_COMMAND[*]}"
    echo ""
}

main() {
    local base_commit
    local source_commit
    local candidate_count
    local candidate
    local short_sha
    local subject
    local merge_output
    local conflicted_files
    local conflicted_files_joined
    local status_after_merge

    parse_args "$@"

    PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "This script must be run inside a Git repository"
    cd "$PROJECT_ROOT"

    require_clean_start

    START_HEAD="$(git rev-parse --verify HEAD)"
    START_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"

    base_commit="$(git rev-parse --verify "${BASE_REF}^{commit}")" ||
        die "Base ref does not resolve to a commit: $BASE_REF"
    source_commit="$(git rev-parse --verify "${SOURCE_REF}^{commit}")" ||
        die "Source ref does not resolve to a commit: $SOURCE_REF"

    candidate_count="$(git rev-list --count --first-parent "${base_commit}..${source_commit}")"

    if [ "$candidate_count" -eq 0 ]; then
        echo "No local source commits to test: $SOURCE_REF is already reachable from $BASE_REF."
        exit 1
    fi

    BASE_COMMIT="$base_commit"
    SOURCE_COMMIT="$source_commit"

    FLAG_CAN_CLEANUP=true
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    print_start_summary

    git_without_hooks checkout -q --detach "$base_commit"

    # First-parent source history tests branch states in the same order a human would usually
    # consider them: newest template state first, then earlier template states. This uses a
    # streaming loop instead of `mapfile` so macOS Bash 3.2 can run the script.
    while IFS= read -r candidate; do
        git_without_hooks reset --hard -q "$base_commit"

        short_sha="$(get_short_sha "$candidate")"
        subject="$(get_commit_subject "$candidate")"

        # A successful `git merge` creates a real probe merge commit. That keeps `node --run test`
        # equivalent to the post-merge state a user would get from a normal merge command.
        if merge_output="$(
            HUSKY=0 git -c core.hooksPath=/dev/null -c rerere.enabled=false \
                merge --no-edit --no-ff --no-rerere-autoupdate "$candidate" 2>&1
        )"; then
            status_after_merge="$(get_git_status)"
            if [ -n "$status_after_merge" ]; then
                echo "TEST_FAIL $short_sha $subject :: merge left a dirty working tree before tests"
                echo "$status_after_merge"
                git_without_hooks reset --hard -q "$base_commit"
                git clean -fd -q
                continue
            fi

            echo "TESTING $short_sha $subject"

            if "${TEST_COMMAND[@]}"; then
                echo "SAFE $short_sha $subject"
                echo ""
                echo "Safe commit:"
                echo "    $candidate"
                echo ""
                echo "Base ref:"
                echo "    $BASE_REF ($base_commit)"
                echo ""
                echo "Source ref:"
                echo "    $SOURCE_REF ($source_commit)"
                echo ""
                echo "Merge command:"
                echo "    git merge $candidate --no-edit"
                exit 0
            fi

            echo "TEST_FAIL $short_sha $subject"
            git_without_hooks reset --hard -q "$base_commit"
            git clean -fd -q
            continue
        fi

        conflicted_files="$(git diff --name-only --diff-filter=U || true)"
        conflicted_files_joined="$(join_lines_for_report "$conflicted_files")"
        echo "CONFLICT $short_sha $subject :: $conflicted_files_joined"

        if [ -z "$conflicted_files" ] && [ -n "$merge_output" ]; then
            echo "$merge_output"
        fi

        abort_merge_if_needed
        git_without_hooks reset --hard -q "$base_commit"
        git clean -fd -q
    done < <(git rev-list --first-parent "${base_commit}..${source_commit}")

    echo ""
    echo "No local source commit satisfied both safety checks:"
    echo "    - merge into $BASE_REF without conflicts"
    echo "    - ${TEST_COMMAND[*]} exits with status 0 after the merge"
    exit 1
}

main "$@"
