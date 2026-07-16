#!/usr/bin/env bash

# ALLOW_GIT_CONFLICT_MARKERS

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../../         # Change directory to project's root folder

source ./utils/bash-helpers/color-codes.sh

# Check all repo files that are tracked or untracked-but-not-ignored:
#     `git ls-files --cached --others --exclude-standard`
#
# Apply the following rules:
#     * If there are no files to check, then return exit code 0.
#     * Check if they contain the text `<<<<<<<`, `|||||||`, or `>>>>>>>`. If such text is found, then check if that
#       file contains `ALLOW_GIT_CONFLICT_MARKERS` text. If such text is found, then it's okay. But if such text is not
#       found, then it's not okay.
#     * A standalone `=======` line can also be a normal heading underline in documentation or source comments, so this
#       script only treats `<<<<<<<`, `|||||||`, and `>>>>>>>` as definite failures.
#     * When a definite marker is found, the printed context also includes `=======` lines from the same file.
#     * If it's okay, then return exit code 0.
#     * If it's not okay, then return exit code 1.
#     * If there is an error, then return exit code 1.

printf "\n${BLUE}Checking for git conflict markers in tracked and untracked-not-ignored files ...${NORMAL}\n"

atLeastOneErrorOccurred="no"

blockMarkers=(
    "<<<<<<<"
    "|||||||"
    ">>>>>>>"
)

contextMarkers=(
    "<<<<<<<"
    "|||||||"
    "======="
    ">>>>>>>"
)

## Begin Approach 1 (commented out - because it may not work on macOS)
# readarray -d '' -t files < <(git ls-files -z --cached --others --exclude-standard)
## End Approach 1

## Begin Approach 2
# Use a NUL-delimited "while read" loop (not "readarray", a bash 4.0+ builtin absent on macOS bash 3.2,
# where it would silently leave "files" empty) so this runs on bash 3.2 and handles newlines in filenames.
files=()
while IFS= read -r -d '' file; do
    files+=("$file")
done < <(git ls-files -z --cached --others --exclude-standard)
## End Approach 2

for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        continue
    fi

    for marker in "${blockMarkers[@]}"; do
        grep -IFq -- "$marker" "$file"
        exitCode="$?"

        if [ "$exitCode" -eq 0 ]; then
            if grep -IFq -- "ALLOW_GIT_CONFLICT_MARKERS" "$file"; then
                :
            else
                printf "\n ${RED}Error: Git conflict marker(s) found in file: %s${NORMAL}\n" "$file"
                for contextMarker in "${contextMarkers[@]}"; do
                    grep -IFn -- "$contextMarker" "$file"
                done | sed 's/^/    /'
                atLeastOneErrorOccurred="yes"
            fi

            continue 2
        elif [ "$exitCode" -eq 1 ]; then
            :
        else
            printf "\n ${RED}Error: Could not scan file for git conflict markers: %s${NORMAL}" "$file"
            atLeastOneErrorOccurred="yes"
            break
        fi
    done
done

if [ "$atLeastOneErrorOccurred" == "yes" ]; then
    printf "\n"
    printf "\n${RED}Error: Please resolve the above mentioned git conflict marker(s) before committing.${NORMAL}"
    printf "\n${YELLOW}Alternatively, if you want to commit such text, then add the text 'ALLOW_GIT_CONFLICT_MARKERS' in the same file (preferably, near the beginning of the file).${NORMAL}"
    printf "\n\n"
    exit 1
else
    printf "${GREEN}Success: No git conflict markers found in any file${NORMAL}\n\n"
    exit 0
fi
