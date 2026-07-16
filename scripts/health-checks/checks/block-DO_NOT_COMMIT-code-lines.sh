#!/usr/bin/env bash

# ALLOW_DO_NOT_COMMIT

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../../         # Change directory to project's root folder

source ./utils/bash-helpers/color-codes.sh

# Check all repo files that are tracked or untracked-but-not-ignored:
#     `git ls-files --cached --others --exclude-standard`

# Apply the following rules:
#     * If there are no files to check, then return exit code 0.
#     * Check if they contain the text `DO_NOT_COMMIT`. If such text is found, then check if that file contains
#       `ALLOW_DO_NOT_COMMIT` text. If such text is found, then it's okay. But if such text is not found, then it's not
#       okay.
#     * If it's okay, then return exit code 0.
#     * If it's not okay, then return exit code 1.
#     * If there is an error, then return exit code 1.

printf "\n${BLUE}Checking for text 'DO_NOT_COMMIT' in tracked and untracked-not-ignored files ...${NORMAL}\n"

# Create a variable to store that at least one error occurred
atLeastOneErrorOccurred="no"

## Begin Approach 1 (commented out - because it may not work on macOS)
## Store the list of files which are either tracked or untracked-but-not-ignored into an array
# readarray -t files < <(git ls-files --cached --others --exclude-standard)
## End Approach 1

## Begin Approach 2
# Store the list of files which are either tracked or untracked-but-not-ignored into an array.
# Use a NUL-delimited "while read" loop (not "readarray", a bash 4.0+ builtin absent on macOS bash 3.2,
# where it would silently leave "files" empty) so this runs on bash 3.2 and handles newlines in filenames.
files=()
while IFS= read -r -d '' file; do
    files+=("$file")
done < <(git ls-files -z --cached --others --exclude-standard)
## End Approach 2

# Loop through the array of files
for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        continue
    fi

    # Check if the file contains the text 'DO_NOT_COMMIT'
    if grep -Iq "DO_NOT_COMMIT" "$file"; then
        # Check if the file contains the text 'ALLOW_DO_NOT_COMMIT', which is okay
        if grep -Iq "ALLOW_DO_NOT_COMMIT" "$file"; then
            # Do nothing
            :
        else
            # If the text 'ALLOW_DO_NOT_COMMIT' is not found, then it's not okay
            printf "\n ${RED}✘ DO_NOT_COMMIT text found in file: $file${NORMAL}"
            atLeastOneErrorOccurred="yes"
        fi
    fi
done

# If at least one error occurred, then return exit code 1, otherwise return exit code 0
if [ "$atLeastOneErrorOccurred" == "yes" ]; then
    printf "\n"
    printf "\n${RED}Error: Please fix the above mentioned file(s) before committing.${NORMAL}"
    printf "\n${YELLOW}Alternatively, if you want to commit such text, then add the text 'ALLOW_DO_NOT_COMMIT' in the same file (preferably, near the beginning of the file).${NORMAL}"
    printf "\n\n"
    exit 1
else
    printf "${GREEN} ✔ Success: No text 'DO_NOT_COMMIT' found in any file${NORMAL}\n\n"
    exit 0
fi
