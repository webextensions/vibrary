#!/usr/bin/env bash

# Merge a source branch into a target branch:
#
#     ./scripts/branching/merge-source-to-target.sh --source <source-branch> --target <target-branch> [flags]
#
# The primary intended use is inside a *forked* project, merging "template" into "main", where:
#   - "main"     is your project's own branch.
#   - "template" tracks the upstream template repo/branch (its upstream is the template remote).
#
# This script never edits branches you have not checked out and bails early on a dirty tree. Syncing
# with upstream is fast-forward-only: each branch either fast-forwards to its upstream or stays
# untouched - never a merge commit, never a rebase rewrite. When that is impossible (diverged, no
# upstream, or unpushed local commits) the script stops with exit 1. With --local, that upstream
# syncing and the unpushed-commits checks are skipped entirely and the merge runs on the local refs
# as they are - for in-repo cascades whose merge commits are deliberately local-only (see
# .claude/commands/cmd-merge-base-branches.md); --local and --push are incompatible. Before merging
# it prints a divergence summary (incoming commits and changed files). It pushes the target branch
# only when --push is given.
# It auto-resolves the two conflicts that are expected on a template merge:
#   - package.json      -> regenerated from package.json.ts
#   - package-lock.json -> regenerated via `npm install`
# package-version.json (the version fallback) usually needs no conflict handling: fork versions are
# owned by each fork's own "main" via "npm version", and the shared "template" branch normally is not
# version-bumped. If it does conflict, it is auto-resolved the same way in both modes: the target
# (fork/main) side is kept and the file is regenerated. When package.json is auto-regenerated below,
# this script also stages package-version.json because the housekeeping command rewrites both
# generated files.
#
# With --resolve-conflict-with-ai, every other conflict (including package.json.ts) is handed to a
# headless Claude run (`claude -p`) driven by the prompt in
# merge-source-to-target/prompt-resolve-conflict-with-ai.md; the AI's output is logged under
# .cache/merge-source-to-target/. The AI only resolves and stages files - this script then verifies
# that no unmerged paths remain, regenerates the manifests, and concludes: an AI-resolved merge is
# committed only with --allow-ai-commit (otherwise the run stops with everything staged for review)
# and pushed only with --push plus --allow-ai-push. Conflicts the AI declines (judgment calls,
# deleted-by paths) are left for you to resolve manually.
# Without the flag, any other conflict (including package.json.ts itself) is left for you to resolve
# manually.
#
# https://stackoverflow.com/questions/2870992/automatic-exit-from-bash-shell-script-on-error
# https://stackoverflow.com/questions/821396/aborting-a-shell-script-if-any-command-returns-a-non-zero-value
set -e

print_usage() {
    cat <<'USAGE'
Usage:
    ./scripts/branching/merge-source-to-target.sh --source <source-branch> --target <target-branch> [flags]

Flags:
    --local                      Use local refs only: skip the upstream syncing and the
                                 unpushed-commits checks (incompatible with --push)
    --push                       Push the target branch when done (off by default)
    --resolve-conflict-with-ai   Resolve non-generated merge conflicts with a headless Claude run
                                 (prompt: scripts/branching/merge-source-to-target/prompt-resolve-conflict-with-ai.md)
    --allow-ai-commit            Permit the merge commit when the AI resolved conflicts
                                 (without it, an AI-resolved run stops with the resolution staged for review)
    --allow-ai-push              Permit pushing when the AI resolved conflicts (--push is still required)
    -h, --help                   Show this help

Examples:
    ./scripts/branching/merge-source-to-target.sh --source template --target main
    ./scripts/branching/merge-source-to-target.sh --source template --target main --push
    ./scripts/branching/merge-source-to-target.sh --source template --target main --push \
        --resolve-conflict-with-ai --allow-ai-commit --allow-ai-push
    ./scripts/branching/merge-source-to-target.sh --source abstract-javascript-project \
        --target abstract-npm-package --local

The script checks out both branches, fast-forward-syncs each with its upstream (stopping if a
branch cannot be fast-forwarded; --local skips the syncing and uses the local refs as they are),
shows what is about to merge, merges <source-branch> into <target-branch> (auto-resolving the
expected package.json / package-lock.json conflicts), and pushes only when --push is given.
USAGE
}

die() {
    echo "Error: $*" >&2
    exit 1
}

SOURCE_BRANCH=""
TARGET_BRANCH=""
FLAG_LOCAL=false
FLAG_PUSH=false
FLAG_RESOLVE_CONFLICT_WITH_AI=false
FLAG_ALLOW_AI_COMMIT=false
FLAG_ALLOW_AI_PUSH=false

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --source)
                [ "$#" -ge 2 ] || die "Missing value for --source"
                SOURCE_BRANCH="$2"
                shift 2
                ;;
            --target)
                [ "$#" -ge 2 ] || die "Missing value for --target"
                TARGET_BRANCH="$2"
                shift 2
                ;;
            --local)
                FLAG_LOCAL=true
                shift
                ;;
            --push)
                FLAG_PUSH=true
                shift
                ;;
            --resolve-conflict-with-ai)
                FLAG_RESOLVE_CONFLICT_WITH_AI=true
                shift
                ;;
            --allow-ai-commit)
                FLAG_ALLOW_AI_COMMIT=true
                shift
                ;;
            --allow-ai-push)
                FLAG_ALLOW_AI_PUSH=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                die "Unknown argument: $1"
                ;;
        esac
    done
}

if [ "$#" -eq 0 ]; then
    print_usage
    exit 1
fi

parse_args "$@"

MISSING_FLAGS=""
[ -n "$SOURCE_BRANCH" ] || MISSING_FLAGS="$MISSING_FLAGS --source"
[ -n "$TARGET_BRANCH" ] || MISSING_FLAGS="$MISSING_FLAGS --target"
if [ -n "$MISSING_FLAGS" ]; then
    echo "Error: required flag(s) missing:$MISSING_FLAGS" >&2
    echo "" >&2
    print_usage
    exit 1
fi

[ "$SOURCE_BRANCH" != "$TARGET_BRANCH" ] || die "Source and target branches must differ (both are: $SOURCE_BRANCH)"

if [ "$FLAG_LOCAL" = true ] && [ "$FLAG_PUSH" = true ]; then
    die "--local and --push are incompatible (local mode never pushes)"
fi

# Anchor to the repo root: the script invokes repo-relative helpers (./scripts/housekeeping/...) and
# writes under .cache/, so a run from a subdirectory would otherwise fail mid-merge. Captured into a
# variable first: outside a repo the substitution is empty and `cd ""` would succeed silently in bash.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "This script must be run inside a Git repository"
cd "$REPO_ROOT"

git rev-parse --verify -q "refs/heads/${SOURCE_BRANCH}^{commit}" >/dev/null ||
    die "Source branch does not exist locally: $SOURCE_BRANCH"
git rev-parse --verify -q "refs/heads/${TARGET_BRANCH}^{commit}" >/dev/null ||
    die "Target branch does not exist locally: $TARGET_BRANCH"

# Preflight the AI prerequisites before touching any git state, so a missing CLI or prompt file
# cannot strand the run mid-merge.
PROMPT_FILE="scripts/branching/merge-source-to-target/prompt-resolve-conflict-with-ai.md"
if [ "$FLAG_RESOLVE_CONFLICT_WITH_AI" = true ]; then
    command -v claude >/dev/null 2>&1 ||
        die "claude CLI not found on PATH (required for --resolve-conflict-with-ai)"
    [ -s "$PROMPT_FILE" ] ||
        die "AI prompt file is missing or empty: $PROMPT_FILE"
fi

AI_USED=false
LOG_FILE=""

# Function to check if git working directory is dirty
check_git_dirty() {
    local git_dirty=false
    [ -n "$(git status --porcelain)" ] && git_dirty=true
    if [ "$git_dirty" = true ]; then
        echo "Your working directory is dirty. Please commit or stash your changes before merging."
        exit 1
    fi
}

check_git_dirty

# Enable verbose mode
set -x

git checkout "$SOURCE_BRANCH"

set +x

if [ "$FLAG_LOCAL" = true ]; then
    echo "Local mode (--local): skipping the upstream sync for '$SOURCE_BRANCH'."
else
    # Fast-forward-only sync: the branch either fast-forwards to its upstream or stays untouched.
    # The env var tells .husky/post-merge to skip its informational full-suite run for this sync
    # pull (the lockfile-driven npm install there still happens); the actual merge below runs
    # without it, so its hook run stays complete.
    if ! MERGE_SOURCE_TO_TARGET_SYNCING=1 git pull --ff-only; then
        echo "Could not fast-forward '$SOURCE_BRANCH' to its upstream (the branches have diverged, or no upstream is configured). Please reconcile manually, then re-run."
        exit 1
    fi

    SOURCE_COMMIT_HASH_LOCAL=$(git rev-parse @)
    SOURCE_COMMIT_HASH_REMOTE=$(git rev-parse @{u})

    if [ "$SOURCE_COMMIT_HASH_LOCAL" != "$SOURCE_COMMIT_HASH_REMOTE" ]; then
        echo "Your local '$SOURCE_BRANCH' branch has unpushed commits (it is ahead of its upstream). Push or reconcile them first."
        exit 1
    fi
fi

check_git_dirty

set -x

git checkout "$TARGET_BRANCH"

set +x

if [ "$FLAG_LOCAL" = true ]; then
    echo "Local mode (--local): skipping the upstream sync for '$TARGET_BRANCH'."
else
    # Fast-forward-only sync: the branch either fast-forwards to its upstream or stays untouched.
    # See the source-branch sync above for what MERGE_SOURCE_TO_TARGET_SYNCING does.
    if ! MERGE_SOURCE_TO_TARGET_SYNCING=1 git pull --ff-only; then
        echo "Could not fast-forward '$TARGET_BRANCH' to its upstream (the branches have diverged, or no upstream is configured). Please reconcile manually, then re-run."
        exit 1
    fi

    TARGET_COMMIT_HASH_LOCAL=$(git rev-parse @)
    TARGET_COMMIT_HASH_REMOTE=$(git rev-parse @{u})

    if [ "$TARGET_COMMIT_HASH_LOCAL" != "$TARGET_COMMIT_HASH_REMOTE" ]; then
        echo "Your local '$TARGET_BRANCH' branch has unpushed commits (it is ahead of its upstream). Push or reconcile them first."
        exit 1
    fi
fi

# Divergence summary: what is about to merge (uses --no-pager so long output never blocks on a pager)
INCOMING_COMMIT_COUNT=$(git rev-list --count "$TARGET_BRANCH..$SOURCE_BRANCH")

if [ "$INCOMING_COMMIT_COUNT" -eq 0 ]; then
    echo "Nothing new to merge: '$TARGET_BRANCH' already contains every commit of '$SOURCE_BRANCH'."
else
    echo ""
    echo "About to merge $INCOMING_COMMIT_COUNT commit(s) from '$SOURCE_BRANCH' into '$TARGET_BRANCH':"
    git --no-pager log --oneline "$TARGET_BRANCH..$SOURCE_BRANCH"
    echo ""
    echo "Files changed on '$SOURCE_BRANCH' since the merge base:"
    git --no-pager diff --name-status "$TARGET_BRANCH...$SOURCE_BRANCH"
    echo ""
fi

set -x

set +e
git merge "$SOURCE_BRANCH" --no-edit
MERGE_EXIT_CODE=$?
set -e

if [ "$MERGE_EXIT_CODE" -ne 0 ]; then
    # Read the unmerged (conflicted) paths NUL-delimited into an array so paths with spaces or
    # newlines survive intact, and so git does not C-quote unusual names (the "-z" output is raw).
    # Mirrors the NUL-safe handling in the guard scripts and eslint-staged-files.sh. A "while read"
    # loop is used (not "readarray", a bash 4.0+ builtin absent on macOS bash 3.2) so this runs on bash 3.2.
    CONFLICTED_FILES=()
    while IFS= read -r -d '' file; do
        CONFLICTED_FILES+=("$file")
    done < <(git diff --name-only --diff-filter=U -z)

    HAS_PACKAGE_JSON_TS_CONFLICT=false
    HAS_PACKAGE_JSON_CONFLICT=false
    HAS_PACKAGE_VERSION_JSON_CONFLICT=false
    HAS_PACKAGE_LOCK_JSON_CONFLICT=false
    HAS_OTHER_CONFLICTS=false

    for file in "${CONFLICTED_FILES[@]}"; do
        if [ "$file" = "package.json.ts" ]; then
            HAS_PACKAGE_JSON_TS_CONFLICT=true
        elif [ "$file" = "package.json" ]; then
            HAS_PACKAGE_JSON_CONFLICT=true
        elif [ "$file" = "package-version.json" ]; then
            HAS_PACKAGE_VERSION_JSON_CONFLICT=true
        elif [ "$file" = "package-lock.json" ]; then
            HAS_PACKAGE_LOCK_JSON_CONFLICT=true
        else
            HAS_OTHER_CONFLICTS=true
        fi
    done

    if [ "$FLAG_RESOLVE_CONFLICT_WITH_AI" = true ] && { [ "$HAS_PACKAGE_JSON_TS_CONFLICT" = true ] || [ "$HAS_OTHER_CONFLICTS" = true ]; }; then
        # AI resolution stage. Ordering mirrors the cascade rules in
        # .claude/commands/cmd-merge-base-branches.md: restore a parseable package.json FIRST
        # (the generator import()s package.json.ts and Node reads the adjacent package.json to load
        # it - and the nested claude run's PostToolUse hook regenerates on every package.json.ts
        # edit, which would fail against conflict markers), then let the AI resolve the
        # non-generated files, then regenerate the manifests and resolve the lock file against the
        # final manifest.
        set +x

        if [ "$HAS_PACKAGE_JSON_CONFLICT" = true ]; then
            # OUR (target) side, NOT --theirs: package.json.ts derives "version" from the adjacent
            # package.json, so --theirs would bake in the source's baseline version (the shared
            # "template" branch is never "npm version"-bumped) and silently regress the target's
            # version. Every other field is regenerated from package.json.ts regardless of side.
            echo "Conflict detected in package.json. Restoring a parseable copy (regenerated after the AI stage)..."
            git checkout --ours -- package.json
        fi

        if [ "$HAS_PACKAGE_VERSION_JSON_CONFLICT" = true ]; then
            # Generated version fallback - keep the target side; regeneration rewrites it.
            echo "Conflict detected in package-version.json. Keeping the target side (regenerated below)..."
            git checkout --ours -- package-version.json
        fi

        NEED_MANIFEST_REGENERATION=false
        if [ "$HAS_PACKAGE_JSON_TS_CONFLICT" = true ] || [ "$HAS_PACKAGE_JSON_CONFLICT" = true ] ||
            [ "$HAS_PACKAGE_VERSION_JSON_CONFLICT" = true ]; then
            NEED_MANIFEST_REGENERATION=true
        fi

        AI_TARGET_FILES=()
        for file in "${CONFLICTED_FILES[@]}"; do
            case "$file" in
                package.json|package-version.json|package-lock.json)
                    # Generated - resolved mechanically by this script, never by the AI.
                    ;;
                *)
                    AI_TARGET_FILES+=("$file")
                    ;;
            esac
        done

        if [ "${#AI_TARGET_FILES[@]}" -gt 0 ]; then
            AI_USED=true
            LOG_DIR=".cache/merge-source-to-target"
            mkdir -p "$LOG_DIR"
            LOG_FILE="$LOG_DIR/resolve-conflict-with-ai-$(date +%Y-%m-%d-%H-%M-%S).log"

            AI_PROMPT="$(cat "$PROMPT_FILE")

## Runtime context (appended by merge-source-to-target.sh)

- Source branch (being merged in; \"theirs\"): $SOURCE_BRANCH
- Target branch (checked out; \"ours\"): $TARGET_BRANCH
- Conflicted paths to resolve:"
            for file in "${AI_TARGET_FILES[@]}"; do
                AI_PROMPT="$AI_PROMPT
    - $file"
            done

            echo "Invoking claude to resolve ${#AI_TARGET_FILES[@]} conflicted file(s); output goes to the terminal and $LOG_FILE ..."
            set +e
            claude -p "$AI_PROMPT" --dangerously-skip-permissions 2>&1 | tee "$LOG_FILE"
            AI_EXIT_CODE=${PIPESTATUS[0]}
            set -e
            if [ "$AI_EXIT_CODE" -ne 0 ]; then
                echo "claude exited with code $AI_EXIT_CODE (log: $LOG_FILE). Checking what got resolved anyway..." >&2
            fi

            # Safety net: for files the AI already resolved AND staged, re-stage the worktree
            # version so post-staging edits (e.g. a fixer run after the git add) are not lost. A
            # file the AI never staged stays unmerged on purpose: it cannot be told apart from an
            # unresolved one here, so it falls through to the remaining-conflicts stop below.
            for file in "${AI_TARGET_FILES[@]}"; do
                if [ -z "$(git ls-files -u -- "$file")" ] && [ -e "$file" ]; then
                    git add -- "$file"
                fi
            done
        fi

        if [ "$NEED_MANIFEST_REGENERATION" = true ]; then
            if [ -z "$(git ls-files -u -- package.json.ts)" ]; then
                echo "Regenerating package.json / package-version.json from package.json.ts..."
                ./scripts/housekeeping/generate-package-json.sh
                # generate-package-json.sh rewrites BOTH generated files, so stage both.
                git add package.json
                git add package-version.json
            else
                echo "package.json.ts is still unresolved - skipping manifest regeneration." >&2
            fi
        fi

        if [ "$HAS_PACKAGE_LOCK_JSON_CONFLICT" = true ]; then
            if [ -z "$(git ls-files -u -- package.json.ts)" ]; then
                echo "Conflict detected in package-lock.json. Running 'npm install' to resolve..."
                npm install
                git add package-lock.json
            else
                echo "package.json.ts is still unresolved - skipping the package-lock.json resolution." >&2
            fi
        fi

        REMAINING_CONFLICTED_FILES=()
        while IFS= read -r -d '' file; do
            REMAINING_CONFLICTED_FILES+=("$file")
        done < <(git diff --name-only --diff-filter=U -z)

        if [ "${#REMAINING_CONFLICTED_FILES[@]}" -gt 0 ]; then
            echo ""
            echo "The AI stage did not resolve all conflicts. Remaining:"
            printf '%s\n' "${REMAINING_CONFLICTED_FILES[@]}"
            if [ -n "$LOG_FILE" ]; then
                echo "Review the AI log for its reasoning: $LOG_FILE"
            fi
            echo "Please resolve these conflicts manually (the merge is left in progress)."
            exit 1
        fi
    else
        # If package.json.ts is in conflict, we can't auto-resolve package.json (since it's generated from package.json.ts)
        if [ "$HAS_PACKAGE_JSON_TS_CONFLICT" = true ]; then
            set +x
            echo "Merge conflicts detected (including package.json.ts):"
            printf '%s\n' "${CONFLICTED_FILES[@]}"
            echo "Please resolve these conflicts manually."
            exit 1
        fi

        if [ "$HAS_PACKAGE_JSON_CONFLICT" = true ] || [ "$HAS_PACKAGE_VERSION_JSON_CONFLICT" = true ]; then
            if [ "$HAS_PACKAGE_JSON_CONFLICT" = true ]; then
                # Restore a parseable package.json before regenerating. generate-package-json.sh import()s
                # package.json.ts, and Node reads the adjacent package.json to load that module - a
                # conflict-marked package.json is invalid JSON and throws ERR_INVALID_PACKAGE_CONFIG before
                # regeneration can run. Check out OUR (target) side, NOT --theirs: package.json.ts derives
                # "version" from the adjacent package.json, so --theirs would bake in the source's baseline
                # version (the shared "template" branch is never "npm version"-bumped) and silently regress
                # the target's version. Every other field is regenerated from package.json.ts regardless of side.
                echo "Conflict detected in package.json. Restoring a parseable copy, then regenerating from package.json.ts..."
                git checkout --ours -- package.json
            fi
            if [ "$HAS_PACKAGE_VERSION_JSON_CONFLICT" = true ]; then
                # Generated version fallback - keep the target side; regeneration rewrites it.
                echo "Conflict detected in package-version.json. Keeping the target side, then regenerating..."
                git checkout --ours -- package-version.json
            fi
            ./scripts/housekeeping/generate-package-json.sh
            # generate-package-json.sh rewrites BOTH package.json and package-version.json (the version
            # fallback), so stage both. Staging only package.json would leave a regenerated
            # package-version.json unstaged, tripping the post-commit check_git_dirty below. Normally a
            # source -> target merge keeps package-version.json unchanged (the target branch owns the
            # version and it merges cleanly), so this is usually a no-op - but staging it keeps the
            # auto-resolve correct if it does change, mirroring prepare-version.sh.
            git add package.json
            git add package-version.json
        fi

        if [ "$HAS_PACKAGE_LOCK_JSON_CONFLICT" = true ]; then
            echo "Conflict detected in package-lock.json. Running 'npm install' to resolve..."
            npm install
            git add package-lock.json
        fi

        if [ "$HAS_OTHER_CONFLICTS" = true ]; then
            REMAINING_CONFLICTED_FILES=()
            while IFS= read -r -d '' file; do
                REMAINING_CONFLICTED_FILES+=("$file")
            done < <(git diff --name-only --diff-filter=U -z)
            set +x
            echo ""
            echo "Auto-resolved conflicts in the generated manifest files (package.json / package-version.json / package-lock.json)."
            echo ""
            echo "Merge conflicts remaining in other files:"
            printf '%s\n' "${REMAINING_CONFLICTED_FILES[@]}"
            echo "Please resolve these conflicts manually."
            echo "Tip: re-run with --resolve-conflict-with-ai to let a headless Claude run attempt these."
            exit 1
        fi
    fi

    # Only commit if a merge is actually in progress. If `git merge` failed but recorded no unmerged
    # paths, all HAS_* flags stay false, every branch above is skipped, and we must not commit an
    # unexpected state with `git commit --no-edit`.
    if ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
        set +x
        echo "Merge failed without recorded conflicts - resolve manually." >&2
        exit 1
    fi

    if [ "$AI_USED" = true ] && [ "$FLAG_ALLOW_AI_COMMIT" != true ]; then
        set +x
        echo ""
        echo "The AI resolved and staged the conflicted file(s). Stopping before commit (no --allow-ai-commit)."
        echo "Review the staged resolution, then conclude the merge:"
        echo "    git diff --staged"
        echo "    git commit --no-edit"
        echo "    git push"
        echo "AI log: $LOG_FILE"
        exit 0
    fi

    git commit --no-edit
fi

set +x

check_git_dirty

## The .husky/post-merge hook runs the full suite informationally after a conflict-free merge (its
## header documents when it fires and that it never blocks). We deliberately keep a bad manual/auto
## resolution (e.g. in package.json.ts) AS the merge commit and fix it in a SEPARATE explicit commit
## rather than blocking the merge here; the real guard against pushing a broken state is the pre-push
## hook, which runs the full suite on a "git push" (whether this script pushes below or you push
## afterwards). Kept as a reference of the inline alternative we chose against:
# node --run test

if [ "$FLAG_LOCAL" = true ]; then
    # A local-mode branch may have no upstream at all, so the @{u} comparison below would die.
    echo "Local mode (--local): nothing pushed."
else
    TARGET_COMMIT_HASH_LOCAL=$(git rev-parse @)
    TARGET_COMMIT_HASH_REMOTE=$(git rev-parse @{u})

    if [ "$TARGET_COMMIT_HASH_LOCAL" = "$TARGET_COMMIT_HASH_REMOTE" ]; then
        echo "Local branch is already in sync with remote. Nothing to push."
    elif [ "$FLAG_PUSH" != true ]; then
        echo "Not pushing (pass --push to push '$TARGET_BRANCH')."
    elif [ "$AI_USED" = true ] && [ "$FLAG_ALLOW_AI_PUSH" != true ]; then
        echo "The AI resolved this merge; push withheld without --allow-ai-push. Push manually with: git push"
    else
        set -x
        git push
        set +x
    fi
fi

echo "✔ Success"

# Disable verbose mode
set +x
