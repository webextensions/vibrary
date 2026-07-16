#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file (scripts/health-checks/checks/)
cd ../../../         # Change directory to project's root folder

# Lints only the files changed in the working tree - the union of staged, unstaged, and untracked
# files (run by the eslint:changed-files / eslint:changed-files:fix npm scripts; the Stop hook
# ".claude/hooks/Stop/fix-lint-on-changed-files.sh" uses the ":fix" variant to leave clean diffs at
# the end of every agent turn). Read-only verify - never auto-fixes unless "--fix" is passed.
#
# Sibling of "eslint-staged-files.sh" (which covers only the staged set, for the all-is-well
# pre-commit check) and shares its portability approach: paths are read NUL-delimited (handles
# spaces / newlines in filenames) into an array via a "while read" loop (not "readarray", a
# bash 4.0+ builtin absent on macOS bash 3.2), and eslint is skipped entirely when nothing changed -
# the portable equivalent of GNU-only "xargs -r".
#
# "eslint" resolves via PATH: this script is always invoked through "node --run ...", which adds
# node_modules/.bin to PATH. "--quiet" hides the "File ignored ..." warning eslint emits for
# changed non-code files (README, JSON, etc.).

# Skip listed paths missing from the working tree (e.g. staged-then-deleted files) - eslint errors
# on paths it cannot find ("No files matching the pattern ... were found").
files=()
while IFS= read -r -d '' file; do
    if [ -e "$file" ]; then
        files+=("$file")
    fi
done < <(
    {
        git diff --cached --name-only --diff-filter=ACMRU -z
        git diff --name-only --diff-filter=ACMRU -z
        git ls-files --others --exclude-standard -z
    } | sort -z -u
)

if [ ${#files[@]} -eq 0 ]; then
    exit 0
fi

exec eslint --quiet "$@" "${files[@]}"
