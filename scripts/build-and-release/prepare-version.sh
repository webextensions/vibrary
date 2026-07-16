#!/usr/bin/env bash

# Runs as the "version" lifecycle step of "npm version <patch|minor|major>".
#
# By that point npm has already written the new version into package.json (and package-lock.json).
# package.json.ts derives its "version" from package.json, so regenerating package.json from the
# source re-derives that new version automatically. We then regenerate package-version.json (the
# version fallback) so it tracks the new version too, regenerate CHANGELOG.md from git history, and
# stage all of them so they are part of the version commit npm is about to create.

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../            # Change directory to project's root folder

set -e

# Regenerate package.json from package.json.ts (which derives the new "version" back from the
# package.json npm just wrote).
./node_modules/.bin/package-cjson --mode generate-package-json

# Regenerate package-version.json (the version fallback) so it tracks the new version.
./node_modules/.bin/package-cjson --mode generate-package-version-json

# Regenerate CHANGELOG.md from git history (auto-changelog reads .auto-changelog). With
# "package": true it labels the new section from package.json's version, even though npm has not
# created the tag (or the version-bump commit) yet at this point in the lifecycle.
# CHANGELOG.md is exempt from the non-keyboard-character guard (via the "exemptions" section of
# .block-non-keyboard-characters.suppressions.json), so any
# commit-subject punctuation is reproduced verbatim here - no normalization step is needed.
node --run changelog

# Stage the synced files so they are part of the version commit created by "npm version"
git add package.json package-version.json CHANGELOG.md
