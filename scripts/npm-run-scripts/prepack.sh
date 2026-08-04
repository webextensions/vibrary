#!/usr/bin/env bash

cd "$(dirname "$0")/../.." # Change directory to the project's root folder

# Strips dev-only install-family scripts from the generated package.json just before npm builds the
# tarball, so the published manifest ships no install scripts: npm runs a dependency's
# preinstall/install/postinstall on every consumer's machine and flags the package with
# "hasInstallScript" - and the scripts they point at live under scripts/, which the "files"
# allowlist excludes from the tarball. Wired as the "prepack" script in package.json.ts, so it runs
# on "npm pack", "npm publish", and git-dependency installs. The paired "postpack" script
# (./postpack.sh) restores the generated files afterwards; the regeneration below also self-heals a
# previously aborted pack that left a stripped package.json behind.
./scripts/housekeeping/generate-package-json.sh

# Any script npm would run on a consumer's machine (install family: preinstall / install /
# postinstall) must be listed here; the "prepack-strip" health check enforces this.
npm pkg delete scripts.preinstall
