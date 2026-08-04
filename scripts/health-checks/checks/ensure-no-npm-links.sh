#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../../         # Change directory to project's root folder

source ./utils/bash-helpers/color-codes.sh

printf "\n${BLUE}Checking for npm-linked packages: ${NORMAL}"

# A clean install never produces these symlinks; an "npm link" does. They are typically created for
# local debugging and should not be relied upon in a checked-out / published state. npm links an
# unscoped package at node_modules/<pkg> (top level) and a scoped package at node_modules/@scope/<pkg>,
# so we check both locations.
#
# https://stackoverflow.com/questions/6565694/inform-right-hand-side-of-pipeline-of-left-side-failure#comment39203082_17611122

# List every npm-link symlink: top-level packages (depth 1) plus scoped @scope/pkg packages (depth 2).
# The scoped pass is restricted to node_modules/@*/* so it never matches node_modules/.bin/* (a clean
# install's bin symlinks) or symlinks nested deeper inside a regular package. Used for both the count
# and the failure listing so the two cannot diverge.
list_npm_links() {
    find ./node_modules -mindepth 1 -maxdepth 1 -type l
    find ./node_modules -mindepth 2 -maxdepth 2 -type l -path './node_modules/@*/*'
}

if [ ! -d ./node_modules ]; then
    printf "${GREEN}Folder node_modules/ does not exist yet (nothing to check)\n\n${NORMAL}"
    exit 0
fi

matchCount=$(set -o pipefail ; list_npm_links | wc -l)
exitCode="$?"

if [[ $exitCode -ne 0 ]]; then
    printf "${RED}Error: Could not execute the check for npm linked packages\n${NORMAL}"
    exit 1
fi

if [[ $matchCount -eq 0 ]]; then
    printf "${GREEN}Folder node_modules/ is free of npm-linked packages\n\n${NORMAL}"
    exit 0
else
    printf "${RED}npm linked package(s) found\n${NORMAL}"
    printf "${YELLOW}Warning: Get rid of npm-linked packages (they are generally used for debugging purposes)${NORMAL}"

    printf "\n${YELLOW}\n# List the npm-linked packages (top-level and scoped)${NORMAL}\n"
    printf "${BLUE}\$ find ./node_modules -mindepth 1 -maxdepth 1 -type l; find ./node_modules -mindepth 2 -maxdepth 2 -type l -path './node_modules/@*/*'\n${NORMAL}"
    list_npm_links
    printf "\n"
    exit 1
fi
