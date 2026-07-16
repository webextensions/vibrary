#!/usr/bin/env bash

# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit), wired in .claude/settings.json.
#
# Whenever package.json.ts is edited, regenerate package.json so it never drifts from package.json.ts
# - the editor-side equivalent of the .vscode "run on save" rule. The hook payload arrives as JSON on
# stdin; tool_input.file_path is parsed with node.

file_path="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write((JSON.parse(d).tool_input||{}).file_path||"")}catch(e){}})')"

case "$file_path" in
    */package.json.ts|package.json.ts)
        if "${CLAUDE_PROJECT_DIR:-.}/scripts/housekeeping/generate-package-json.sh" >/dev/null 2>&1; then
            echo "Regenerated package.json from package.json.ts."
        else
            echo "package.json.ts changed but regeneration failed - check it. Run: node --run housekeeping:generate-package-json" >&2
            exit 2
        fi
        ;;
esac

exit 0
