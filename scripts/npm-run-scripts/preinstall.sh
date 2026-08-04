#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file

# Fail the install early when the active Node does not satisfy .nvmrc (the script exits non-zero on
# mismatch by default), so dependency trees are never built with the wrong Node. Wired as the
# "preinstall" script in package.json.ts.
../health-checks/checks/check-node-version.ts
