#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../            # Change directory to project's root folder

set -e

# Updates dependency versions in "package.json.ts" (via "package-cjson --mode update") and
# then regenerates "package.json" from it. "package.json.ts" is the source of truth; never
# hand-edit "package.json".
./node_modules/.bin/package-cjson --mode update-and-generate-package-json

echo ""
echo " ✔ Done"
echo ""
