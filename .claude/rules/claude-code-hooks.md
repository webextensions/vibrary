---
description: Layout, naming, and wiring conventions for Claude Code hook scripts
globs: [".claude/hooks/**", ".claude/settings.json"]
---

# Claude Code Hooks - Layout and Conventions

Claude Code hooks (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, etc.) are configured
in [.claude/settings.json](../settings.json). To keep hooks readable, debuggable, and version-control friendly, the
project keeps the **logic in standalone shell scripts** under [.claude/hooks/](../hooks/) and limits `settings.json` to
short pointers that invoke those scripts. Do **not** inline multi-statement shell commands into `settings.json`.

## Directory Layout

```
.claude/
  hooks/
    PreToolUse/
      <descriptive-kebab-case-name>.sh
    PostToolUse/
      <descriptive-kebab-case-name>.sh
    UserPromptSubmit/
      <descriptive-kebab-case-name>.sh
    Stop/
      <descriptive-kebab-case-name>.sh
    lib/
      <shared-helper>.ts
    ...
  settings.json
```

- One subdirectory per Claude Code hook event, named **exactly** as the event appears in `settings.json`
  (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `Notification`, `SessionStart`,
  `SessionEnd`, `PreCompact`). PascalCase matches Claude Code's documented event names - do not lowercase or
  rename them
- One `.sh` file per logical hook. If a single event has several unrelated behaviors, create separate scripts
  rather than branching inside one - easier to debug, easier to disable individually
- Place each script under the event directory that triggers it. A script that runs on both `PreToolUse` and
  `PostToolUse` should be split into two scripts (or factored into a shared helper sourced by both), not
  symlinked across directories
- When a hook needs real logic (JSON parsing, transcript reading), keep the `.sh` as a thin pointer that
  runs a paired `.ts` helper next to it; shared helper code lives in `.claude/hooks/lib/`

## File Naming

- **kebab-case**, descriptive of the **action**, optionally including the trigger context: for example
  `block-direct-package-json-edit.sh`, `regenerate-package-json-after-source-edit.sh`
- Use action verbs (`block-`, `regenerate-`, `notify-`, `log-`, `enforce-`) so the name reads as what the
  script *does*, not what it watches for
- Keep names short enough to fit comfortably in `settings.json`'s `command` field but specific enough that
  a stranger reading the directory listing can guess each script's purpose without opening it

## Script Template

Every hook script should follow this shape:

```sh
#!/usr/bin/env bash

# <HookEvent> hook for <matcher, e.g., Write|Edit, or "all events" if no matcher>.
#
# <One short paragraph: what this hook does and WHY it exists. Mention the
# source of truth, the constraint being enforced, or the side-effect being
# automated. Cross-link the paired hook if there is one - e.g., a PreToolUse
# guard often has a matching PostToolUse automation.>
#
# Reads the Claude Code hook event JSON from stdin.
# <For PreToolUse blockers: "On a block, prints the reason on stderr and exits 2"
# or "On a block, prints the standard PreToolUse 'deny' response on stdout.">

f="$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write((JSON.parse(d).tool_input||{}).file_path||"")}catch(e){}})')"

case "$f" in
    */node_modules/*)
        exit 0
        ;;
    */some-pattern)
        # <action: emit hook response JSON, or run a command, or both>
        ;;
esac
```

Conventions:

- **Shebang `#!/usr/bin/env bash`** - do not rely on `/bin/sh` (the project's hooks use `bash` idioms like
  `case` glob matching)
- **`chmod +x`** the script after creating it so it can be invoked directly. Executability keeps local
  testing (`./script.sh`) ergonomic
- **Read input from stdin** using `node` - Claude Code pipes the hook event JSON to the script. Parse it
  with a small `node -e` reader (see the template's `f="$(node -e '...')"` line) rather than `jq`: `node`
  is always present in this repo, `jq` may not be. Read `tool_input.file_path` (or the appropriate field
  for the event) and gate on the result
- **Header comment is mandatory.** State what the hook does and *why* - the value of moving hooks out of
  `settings.json` is lost if the script doesn't explain itself
- **No silent failures.** If the hook is meant to log or emit JSON, do so on stdout; surface errors on
  stderr. A `PreToolUse` hook can block in two ways: print the reason on stderr and exit `2` (the simple
  form - what `block-direct-package-json-edit.sh` uses), or emit the standard deny JSON on stdout for
  richer control:
  ```json
  {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<message>"}}
  ```
- **Exit `0` for the no-op path.** Exit `2` blocks the action (its stderr is fed back to Claude); any
  other non-zero exit is treated as an error
- **Match the project shell style** - 4-space indentation in `case` arms, single quotes for literal
  strings, double quotes around variable expansions (`"$f"`)

## Wiring Into `settings.json`

Each hook entry in [.claude/settings.json](../settings.json) should be a thin pointer:

```json
"hooks": {
    "PreToolUse": [
        {
            "matcher": "Write|Edit",
            "hooks": [
                {
                    "type": "command",
                    "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/PreToolUse/<script-name>.sh\""
                }
            ]
        }
    ]
}
```

- **Always invoke via `"$CLAUDE_PROJECT_DIR/.claude/hooks/<HookEvent>/<script-name>.sh"`** - the
  `$CLAUDE_PROJECT_DIR` prefix (quoted, so paths with spaces survive) keeps the pointer working no matter
  which directory the hook runs from. This relies on the executable bit - another reason to `chmod +x`
- **One pointer per script.** If the same event needs multiple unrelated scripts, add multiple
  entries under the event's array rather than chaining them inside one shell command
- **`matcher` belongs in `settings.json`, not in the script.** Use Claude Code's matcher syntax
  (`Write|Edit`, `Bash`, `mcp__.*`, etc.) for tool-level filtering; reserve the script's `case` block
  for finer-grained logic like file-path patterns

## Adding a New Hook - Checklist

- Pick the correct Claude Code hook event (see the Claude Code docs for the full list and what data each
  event provides)
- Create `.claude/hooks/<HookEvent>/` if it does not already exist
- Add the script with the header comment, shebang, and stdin-driven body shown above
- `chmod +x` the script
- Add a single pointer entry to `settings.json` under `hooks.<HookEvent>` with the right `matcher`
- Smoke-test by piping a representative event JSON into the script:
  ```sh
  echo '{"tool_input":{"file_path":"/repo/some/path"}}' | .claude/hooks/PreToolUse/<script-name>.sh
  ```
  Verify the expected stdout (deny JSON, log line, or empty) and exit code
- If a `PreToolUse` guard pairs with a `PostToolUse` automation (or vice versa), cross-reference them in
  each script's header comment so a future agent does not silently break the pair

## Anti-Patterns

- Multi-statement shell commands inlined into `settings.json` - moves logic out of source control review
  diffs and out of any editor's shell tooling
- Flat `.claude/hooks/` directory with no event subdirectories - quickly becomes ambiguous as the number
  of hooks grows
- Scripts without header comments - defeats the purpose of moving hooks into files
- Hooks that fork `node`/`npm`/build commands without first gating on the relevant `case` pattern - every
  matched tool call will pay the startup cost
- Mixing matcher logic into the script when Claude Code's `matcher` field would already filter at the
  event level
