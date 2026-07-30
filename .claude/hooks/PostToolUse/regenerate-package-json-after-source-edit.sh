#!/usr/bin/env bash

# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit), wired in .claude/settings.json.
#
# Whenever package.json.ts (or the package-json-utils helper module it computes its dependency
# fields with) is edited, regenerate package.json so it never drifts from its sources - the
# editor-side equivalent of the .vscode "run on save" rule. The hook payload arrives as JSON on
# stdin; tool_input.file_path is parsed with node.

file_path="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write((JSON.parse(d).tool_input||{}).file_path||"")}catch(e){}})')"

case "$file_path" in
    */package.json.ts|package.json.ts|*/utils/package-json-utils/*.ts|utils/package-json-utils/*.ts)
        if "${CLAUDE_PROJECT_DIR:-.}/scripts/housekeeping/generate-package-json.sh" >/dev/null 2>&1; then
            echo "Regenerated package.json after the edit to $file_path."
        else
            echo "$file_path changed but regeneration of package.json failed - check it. Run: node --run housekeeping:generate-package-json" >&2
            exit 2
        fi
        ;;
esac

exit 0
