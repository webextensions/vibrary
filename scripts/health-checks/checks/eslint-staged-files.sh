#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file (scripts/health-checks/checks/)
cd ../../../         # Change directory to project's root folder

## Begin Approach 1 (commented out - because it may not work on macOS)
## For detecting issues:
# git diff --cached --name-only --diff-filter=ACMRU | xargs -r eslint --quiet
## For auto-fixing issues:
# git diff --cached --name-only --diff-filter=ACMRU | xargs -r eslint --quiet --fix
## End Approach 1

## Begin Approach 2
# Lints only the staged files (run by the eslint:staged check inside all-is-well, which "node --run test"
# invokes; pre-commit runs "node --run test", not this script directly). Read-only verify - never
# auto-fixes / re-stages unless "--fix" is passed (the eslint:staged-files:fix script).
#
# Portability: replaces the former "git diff ... | xargs -r eslint" pipeline. "-r"
# (--no-run-if-empty) is GNU-only and fails on macOS/BSD xargs. Here we read the staged paths
# NUL-delimited (handles spaces / newlines in filenames) into an array and skip eslint entirely when
# nothing is staged - the portable equivalent of "-r". A NUL-delimited "while read" loop is used
# (not "readarray", a bash 4.0+ builtin absent on macOS bash 3.2) so this runs on bash 3.2.
#
# "eslint" resolves via PATH: this script is always invoked through "node --run eslint:staged-files",
# which adds node_modules/.bin to PATH. "--quiet" hides the "File ignored ..." warning eslint emits
# for staged non-code files (README, JSON, etc.).

# Skip staged paths missing from the working tree (staged-then-deleted files, e.g. mid
# template-merge or while staged copies are kept as a backup) - eslint errors on paths it
# cannot find ("No files matching the pattern ... were found").
files=()
while IFS= read -r -d '' file; do
    if [ -e "$file" ]; then
        files+=("$file")
    fi
done < <(git diff --cached --name-only --diff-filter=ACMRU -z)

if [ ${#files[@]} -eq 0 ]; then
    exit 0
fi

exec eslint --quiet "$@" "${files[@]}"
## End Approach 2
