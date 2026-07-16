---
description: Create a git commit following project conventions
argument-hint: [optional commit message]
---

# Project-Aware Commit

Create a git commit for the currently staged changes.

## Steps

- Run `git status` to see all changes (never use `-uall` flag)
- Run `git diff --cached` to review exactly what will be committed; use `git diff` only as unstaged context
- Run `git log --oneline -10` to see recent commit message style
- If there are ESLint-fixable issues, run `node --run eslint:fix` first
- If fix scripts modify files, stop and ask the developer to review/stage those updates
- If no changes are staged, stop and ask the developer to stage the intended changes
- Draft a commit message that:
   - Follows the project's style: past-tense descriptive ("Improved...", "Added...", "Refactored...")
   - Is concise (1-2 sentences) and focuses on the "why"
   - If `$ARGUMENTS` is provided, use it as the commit message basis
- Create the commit using a HEREDOC for the message
- Run `git status` after to verify success

## Rules

- Never commit `.env`, credentials, or secret files
- Never stage or unstage changes (`git add`, `git restore --staged`, `git reset`, etc.)
- Never use `--no-verify` to skip Husky hooks
- Never amend previous commits unless explicitly asked
- `package.json.ts` is the source of truth - if `package.json` was modified, check if `package.json.ts` should have been modified instead
- Commit subjects become CHANGELOG.md entries (auto-changelog) - keep them clear and ASCII-only
