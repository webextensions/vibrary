---
description: Write ASCII keyboard punctuation in all produced content; typographic characters fail the non-keyboard-characters health check
---

# Non-Keyboard Characters - Write ASCII Punctuation

When creating or updating ANY file content - source code, comments, JSON, commit messages, and
Markdown alike - use only standard US-keyboard (ASCII) punctuation. AI text generation tends to
insert "smart" / typographic characters that look like normal punctuation but are not present on a
keyboard; they slip past visual review and then fail this repo's health check.

This rule file deliberately names the offending characters by Unicode name + code point instead of
printing the glyphs, so the file itself stays ASCII-clean (and is not rewritten by the auto-fixer).

## Characters To Avoid (and the keyboard equivalent to use)

- En dash (U+2013) and em dash (U+2014) -> hyphen `-`
- Horizontal ellipsis (U+2026) -> three periods `...`
- Left / right single quotation marks (U+2018 / U+2019) -> straight apostrophe `'`
- Left / right double quotation marks (U+201C / U+201D) -> straight double quote `"`
- Bullet (U+2022) -> asterisk `*` (or `-` for Markdown list items)
- Rightwards arrow (U+2192) -> greater-than `>`
- Box-drawing light horizontal (U+2500) -> hyphen `-`
- Check mark (U+2713) / ballot X (U+2717) -> prefer ASCII such as `[x]` / `[ ]` or plain words. The
  checker rewrites these light glyphs to heavy check mark (U+2714) / heavy ballot X (U+2718), which
  are the only tick glyphs it tolerates - reach for a glyph only when one is genuinely required.

The authoritative list is the `DETECTORS` table in
[scripts/health-checks/checks/block-non-keyboard-characters/characters.ts](../../scripts/health-checks/checks/block-non-keyboard-characters/characters.ts).

## Enforcement

The check is part of `node --run all-is-well` (and therefore `node --run test`), which runs at the
Husky `pre-commit` and `pre-push` hooks. It baselines per-file character counts in the `baseline`
section of `.block-non-keyboard-characters.suppressions.json` (at the project root) and fails on any
drift from that baseline.

- `node --run block-non-keyboard-characters` - check (exit 1 on drift)
- `node --run block-non-keyboard-characters:fix` - auto-replace the common chars in non-suppressed files
- `node --run block-non-keyboard-characters -- --file <path>` - scope the check to specific file(s)
- `node --run block-non-keyboard-characters:fix -- --file <path>` - scope the fix to specific file(s)
- `node --run block-non-keyboard-characters:suppress` - re-baseline (whole-repo)

A `Stop` hook
([.claude/hooks/Stop/fix-non-keyboard-characters.sh](../hooks/Stop/fix-non-keyboard-characters.sh),
registered in [.claude/settings.json](../settings.json)) auto-runs the whole-repo `:fix` at the end
of each turn, so stray characters in non-suppressed files are corrected automatically. Do not rely on
it - write clean ASCII in the first place.

## Exemptions - Skipping Files Entirely

Files the tooling should not scan at all (generated or vendored content) live in the `exemptions`
array of `.block-non-keyboard-characters.suppressions.json`; `--suppress` rewrites only `baseline`
and preserves this section. Each entry is `{ "pattern", "reason", "skipInCensus" }`:

- `pattern` is a plain glob anchored at the repo root (`dir/**` for a subtree, `**/name` for any
  depth); a leading `!` re-includes. Entries are ORDER-SENSITIVE - the last matching entry wins - so
  a single `!` entry re-includes a file at any depth under an excluded subtree (do not alphabetize).
- `skipInCensus` (default `true`): set `false` to keep the file visible in the
  `:detect-all` census while still exempting it from the guard (e.g. `CHANGELOG.md`).

Two exemptions are hard-coded invariants and not configurable: the suppressions file itself and
`characters.ts` (see
[scripts/health-checks/checks/block-non-keyboard-characters/exempted-files.ts](../../scripts/health-checks/checks/block-non-keyboard-characters/exempted-files.ts)).

## Genuinely Intentional Uses

Some content legitimately needs these characters: quoted prose, real command / log / transcript
output, test fixtures, or third-party text reproduced verbatim. In those cases:

- Keep the character, then run `node --run block-non-keyboard-characters:suppress` to baseline the
  file. The `:fix` command skips files already in the baseline, so it will not clobber them.
- For files whose content this repo does not author at all (generated / vendored), prefer an
  `exemptions` entry (above) over a baseline: a baseline still fails on drift, an exemption skips
  the file entirely.

Do not reach for `:suppress` or an exemption to dodge the check on ordinary code or docs - try the
ASCII equivalent above first.
