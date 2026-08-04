#!/usr/bin/env bash

cd "$(dirname "$0")" # Change directory to the folder containing this file
cd ../../            # Change directory to project's root folder

set -e

echo "Arguments are forwarded to 'npm install' (e.g. --prefer-offline, --verbose); --no-countdown skips the countdown."
echo ""

# --no-countdown skips the 5-second abort window; every other argument forwards to 'npm install'
flagCountdown=true
npmInstallArgs=()
for arg in "$@"; do
    if [ "$arg" = "--no-countdown" ]; then
        flagCountdown=false
    else
        npmInstallArgs+=("$arg")
    fi
done

echo "About to delete package-lock.json and node_modules, then regenerate them via 'npm install'."

if [ "$flagCountdown" = true ]; then
    if ! which countdown > /dev/null; then
        echo ""
        echo "Installing @webextensions/countdown"
        npm install --global @webextensions/countdown
    fi

    echo ""
    printf "Countdown: "
    if ! countdown 5; then
        echo ""
        echo "Aborted"
        exit 1
    fi
fi

echo ""
echo "$ rm -f package-lock.json"
rm -f package-lock.json

echo "$ rm -rf node_modules"
rm -rf node_modules

echo "$ npm install ${npmInstallArgs[*]}"
npm install "${npmInstallArgs[@]}"

echo ""
echo " ✔ Done"
echo ""
