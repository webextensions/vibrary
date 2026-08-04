#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../            # Change directory to project's root folder

set -e

# Generate package.json from package.json.ts
./node_modules/.bin/package-cjson --mode generate-package-json

# Generate package-version.json (the version fallback) so it tracks package.json.ts's version
# (which is derived from package.json). See the header comment in package.json.ts.
./node_modules/.bin/package-cjson --mode generate-package-version-json
