---
name: update-npm-packages
description: Update npm dependency versions via package.json.ts (the source of truth) - survey, batch patch/minor via the bulk script, majors one at a time with changelog analysis, then a full lockfile recreate and health-check run.
argument-hint: [optional package names and/or tier: patch|minor|major]
disable-model-invocation: true
---

# Update NPM Packages

Update dependency versions in [package.json.ts](../../../package.json.ts) - the source of truth; never
hand-edit `package.json` (see [.claude/rules/git-workflow.md](../../rules/git-workflow.md)). Regenerate with
`node --run housekeeping:generate-package-json` after every hand edit.

Scope: version updates and the lockfile refresh only. Adding/removing packages and the category/fence layout
(`dependenciesFor*`, Project vs Template originated) are out of scope - the header comments in
`package.json.ts` cover those.

## Arguments

`$ARGUMENTS` is free-form and restricts the session:

- Package names: update only those packages (all other rules still apply).
- Tier keywords `patch` / `minor` / `major`: update only those tiers.
- A mix of both works; no arguments = full session over every dependency.

## Version-range policy

The range prefix in `package.json.ts` states the update intent - honor it:

- `^` entries: update to the latest available version; a major bump goes through the per-major flow below.
- `~` entries: update to the latest version within the SAME major (find it with
  `npm view "<pkg>@<major>.x" version`). Report a newer major as available, but do not cross it.
- `=` entries and bare exact versions (`1.2.3`): deliberately frozen - never update, report only.
- Any other range syntax (`>=`, `x`, `*`, `||`, ...): stop and ask the developer.

Preserve each version line's inline `//` comment; update its text only when the bump makes it stale.

## Workflow

- **Survey**: run `npm outdated` (plus `npm view` where needed) and classify every candidate: patch/minor
  batch, majors list, held-back pins, ask-first oddities.
    - Nothing needs updating? Do not stop: skip the batch and per-major phases and continue to Finish
      anyway - the from-scratch reinstall may still refresh transitive dependencies in `package-lock.json`.
      Exception: when `$ARGUMENTS` restricted the session and none of the targeted packages/tiers needs a
      change, report "already current" and stop - no recreate.
- **Patch/minor batch (bulk)**: run `node --run housekeeping:update-and-generate-package-json`.
    - It shells out to the globally installed `npm-check-updates`; if missing, run
      `npm install -g npm-check-updates` and proceed.
    - CRITICAL correction step: the script bumps EVERYTHING to latest, crossing majors even on `~` entries.
      Review the `package.json.ts` diff and revert in place: `^` major bumps back to current (they move to
      the per-major phase), `~` cross-major bumps down to latest-within-major, and any change to `=` / exact
      entries. Then run `node --run housekeeping:generate-package-json` again.
- **Majors, one at a time** (each `^` major, only after the batch above):
    - Read the changelog / release notes / migration guide; where the impact is unclear, analyze deeper
      (grep the repo's actual usage against the breaking changes) to be on the safer side.
    - Hand-edit the version in `package.json.ts`, regenerate, and apply the required code migrations -
      minimal and scoped to what the new version requires.
    - Between batches run light checks only: `node --run test:compare-package-json-with-source` and
      `node --run syntaxlint`. Full verification happens once at the end.
- **Finish - lockfile recreate + full verification**, once at the end:
    - The next step deletes `node_modules`: first make sure no other agents or scripts in this session might
      need it - wait for any running ones to finish, and do not run agents in parallel during this scenario.
    - Run `node --run housekeeping:update-package-lock-json -- --no-countdown` (recreates `node_modules` +
      `package-lock.json` from scratch).
    - Check `git diff --stat package-lock.json` and note whether the recreate changed the lockfile
      (transitive refresh) or left it identical.
    - Run `HEALTHCHECKS_NO_CACHE=1 node --run test` (includes the package/lockfile sync guards). The env var
      is required: recreating `node_modules` does not change the git content the checks cache is keyed on, so
      cached passes would otherwise skip the checks (see
      [.claude/rules/checks-execution-caching.md](../../rules/checks-execution-caching.md)). Fix or revert
      the offending bump on failure; never bypass a check.

## Report

- From->to per package, grouped by batch, with each change's tier.
- The lockfile outcome: updated (transitive refresh) or unchanged.
- Skipped entries with reasons: frozen `=` / exact pins, `~` entries held within their major (noting the
  available major), oddities awaiting the developer's answer.
- Per-major breaking-change notes and the migrations applied - including notes that may matter later even if
  nothing broke now.
- Final check results, and a reminder that nothing was staged or committed - review and commit stays the
  developer's step.
- When nothing changed anywhere (manifest untouched AND lockfile identical after the recreate), emit a short
  "everything already up to date" summary instead of the empty tables above.
