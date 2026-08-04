#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file

# Fail the install when the active Node does not satisfy .nvmrc (the script exits non-zero on
# mismatch by default), so development never proceeds with the wrong Node. Wired as the "prepare"
# script in package.json.ts, which runs only for local dev installs and git-dependency installs,
# never for registry consumers.
../health-checks/checks/check-node-version.ts
