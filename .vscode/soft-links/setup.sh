#!/usr/bin/env bash

# Creates the ./node symlink this directory exists for: a stable, workspace-relative path to the
# Node binary currently on PATH.
#
# .vscode/settings.json points "eslint.runtime" and the integrated-terminal PATH at that link, so the
# editor's ESLint runs on the same Node the shell uses. Without it, VS Code / Cursor may fall back to
# a bundled or system Node and fail to load the flat config (a documented "ESLint not working in
# VS Code" workaround).
#
# The link captures whatever "which node" resolves to at run time - run "nvm use" first so it picks
# up the .nvmrc version. The link itself is git-ignored (see the .gitignore next to this file);
# re-run this script (or "node --run setup:editor") after switching Node versions.

cd "$(dirname "$0")" # Change directory to the folder containing this file

set -x

rm -f ./node
ln -s "$(which node)" ./node

set +x
