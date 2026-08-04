---
description: Update npm dependency versions via package.json.ts following the update-npm-packages skill
argument-hint: [optional package names and/or tier: patch|minor|major]
---

# Update NPM Packages

Invoke the `update-npm-packages` skill ([.claude/skills/update-npm-packages/SKILL.md](../skills/update-npm-packages/SKILL.md))
with `$ARGUMENTS` passed through verbatim, and follow it exactly. The arguments are free-form: package names,
tier keywords (`patch` / `minor` / `major`), or a mix - their meaning is defined by the skill.
