#!/usr/bin/env bash

# Claude Code PreToolUse hook (matcher: Write|Edit|MultiEdit), wired in .claude/settings.json.
#
# Blocks direct edits to files that are GENERATED from package.json.ts. The hook payload arrives as
# JSON on stdin; we read tool_input.file_path with node (robust JSON parsing, and node is always
# present in an npm project). Exit code 2 tells Claude to stop and shows the message below.

file_path="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write((JSON.parse(d).tool_input||{}).file_path||"")}catch(e){}})')"

case "$file_path" in
    */package.json|package.json|*/package-version.json|package-version.json)
        echo "Refusing to edit $file_path directly: it is generated from package.json.ts." >&2
        echo "Edit package.json.ts instead, then run: node --run housekeeping:generate-package-json" >&2
        exit 2
        ;;
esac

exit 0
