#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../            # Change directory to project's root folder

set -e

echo "About to delete package-lock.json and node_modules, then regenerate them via 'npm install'."
echo ""
read -r -p "Press Enter to continue, or Ctrl+C to abort... " _

echo ""
echo "$ rm -f package-lock.json"
rm -f package-lock.json

echo "$ rm -rf node_modules"
rm -rf node_modules

echo "$ npm install"
npm install

echo ""
echo " ✔ Done"
echo ""
