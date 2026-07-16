#!/usr/bin/env bash

# Merge the "template" branch into "main" and push.
#
# Intended to run inside a *forked* project, where:
#   - "main"     is your project's own branch.
#   - "template" tracks the upstream template repo/branch (its upstream is the template remote).
#
# This script never edits branches you have not checked out and bails early on a dirty tree.
# It auto-resolves the two conflicts that are expected on a template merge:
#   - package.json      -> regenerated from package.json.ts
#   - package-lock.json -> regenerated via `npm install`
# package-version.json (the version fallback) usually needs no conflict handling: fork versions are
# owned by each fork's own "main" via "npm version", and the shared "template" branch normally is not
# version-bumped. If it does conflict, resolve it manually and keep the fork/main side. When package.json
# is auto-regenerated below, this script also stages package-version.json because the housekeeping command
# rewrites both generated files.
# Any other conflict (including package.json.ts itself) is left for you to resolve manually.
#
# https://stackoverflow.com/questions/2870992/automatic-exit-from-bash-shell-script-on-error
# https://stackoverflow.com/questions/821396/aborting-a-shell-script-if-any-command-returns-a-non-zero-value
set -e

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

git checkout template
git pull --rebase

set +x

TEMPLATE_COMMIT_HASH_LOCAL=$(git rev-parse @)
TEMPLATE_COMMIT_HASH_REMOTE=$(git rev-parse @{u})

if [ "$TEMPLATE_COMMIT_HASH_LOCAL" != "$TEMPLATE_COMMIT_HASH_REMOTE" ]; then
    echo "Your local 'template' branch is not in sync with its upstream 'template' branch. Please bring them in sync first."
    exit 1
fi

check_git_dirty

set -x

git checkout main
git pull --rebase

set +x

MAIN_COMMIT_HASH_LOCAL=$(git rev-parse @)
MAIN_COMMIT_HASH_REMOTE=$(git rev-parse @{u})

if [ "$MAIN_COMMIT_HASH_LOCAL" != "$MAIN_COMMIT_HASH_REMOTE" ]; then
    echo "Your local 'main' branch is not in sync with the remote 'main' branch. Please bring them in sync first."
    exit 1
fi

set -x

set +e
git merge template --no-edit
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
    HAS_PACKAGE_LOCK_JSON_CONFLICT=false
    HAS_OTHER_CONFLICTS=false

    for file in "${CONFLICTED_FILES[@]}"; do
        if [ "$file" = "package.json.ts" ]; then
            HAS_PACKAGE_JSON_TS_CONFLICT=true
        elif [ "$file" = "package.json" ]; then
            HAS_PACKAGE_JSON_CONFLICT=true
        elif [ "$file" = "package-lock.json" ]; then
            HAS_PACKAGE_LOCK_JSON_CONFLICT=true
        else
            HAS_OTHER_CONFLICTS=true
        fi
    done

    # If package.json.ts is in conflict, we can't auto-resolve package.json (since it's generated from package.json.ts)
    if [ "$HAS_PACKAGE_JSON_TS_CONFLICT" = true ]; then
        set +x
        echo "Merge conflicts detected (including package.json.ts):"
        printf '%s\n' "${CONFLICTED_FILES[@]}"
        echo "Please resolve these conflicts manually."
        exit 1
    fi

    if [ "$HAS_PACKAGE_JSON_CONFLICT" = true ]; then
        # Restore a parseable package.json before regenerating. generate-package-json.sh import()s
        # package.json.ts, and Node reads the adjacent package.json to load that module - a
        # conflict-marked package.json is invalid JSON and throws ERR_INVALID_PACKAGE_CONFIG before
        # regeneration can run. Check out OUR (main) side, NOT --theirs: package.json.ts derives
        # "version" from the adjacent package.json, so --theirs would bake in the template's baseline
        # version (the "template" branch is never "npm version"-bumped) and silently regress this
        # fork's version. Every other field is regenerated from package.json.ts regardless of side.
        echo "Conflict detected in package.json. Restoring a parseable copy, then regenerating from package.json.ts..."
        git checkout --ours -- package.json
        ./scripts/housekeeping/generate-package-json.sh
        # generate-package-json.sh rewrites BOTH package.json and package-version.json (the version
        # fallback), so stage both. Staging only package.json would leave a regenerated
        # package-version.json unstaged, tripping the post-commit check_git_dirty below. Normally a
        # template -> main merge keeps package-version.json unchanged (main owns the version and it
        # merges cleanly), so this is usually a no-op - but staging it keeps the auto-resolve correct
        # if it does change, mirroring prepare-version.sh.
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
        echo "Auto-resolved conflicts for package.json and/or package-lock.json."
        echo ""
        echo "Merge conflicts remaining in other files:"
        printf '%s\n' "${REMAINING_CONFLICTED_FILES[@]}"
        echo "Please resolve these conflicts manually."
        exit 1
    fi

    # Only commit if a merge is actually in progress. If `git merge` failed but recorded no unmerged
    # paths, all HAS_* flags stay false, every branch above is skipped, and we must not commit an
    # unexpected state with `git commit --no-edit`.
    if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
        git commit --no-edit
    else
        set +x
        echo "Merge failed without recorded conflicts - resolve manually." >&2
        exit 1
    fi
fi

set +x

check_git_dirty

## The .husky/post-merge hook runs the full suite informationally after a conflict-free merge (its
## header documents when it fires and that it never blocks). We deliberately keep a bad manual/auto
## resolution (e.g. in package.json.ts) AS the merge commit and fix it in a SEPARATE explicit commit
## rather than blocking the merge here; the real guard against pushing a broken state is the pre-push
## hook, which runs the full suite on the "git push" below. Kept as a reference of the inline
## alternative we chose against:
# node --run test

MAIN_COMMIT_HASH_LOCAL=$(git rev-parse @)
MAIN_COMMIT_HASH_REMOTE=$(git rev-parse @{u})

if [ "$MAIN_COMMIT_HASH_LOCAL" != "$MAIN_COMMIT_HASH_REMOTE" ]; then
    set -x
    git push
    set +x
else
    echo "Local branch is already in sync with remote. Nothing to push."
fi

echo "✔ Success"

# Disable verbose mode
set +x
