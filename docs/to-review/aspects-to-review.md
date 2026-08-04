# Aspects to Review

This file catalogs aspects of this repository's tooling and conventions for which we want to run
focused, dedicated code reviews. Each item names a concern within a top-level area rather than a
prescribed fix - the intent is to enumerate *what to look at*, so reviews can be scoped and
prioritized later. Each item's slug is the suggested filename for its eventual review report.

Notes on scope:

- This repository is the root of a **template-branch family**: content written here flows into
  every branch and fork by merge. Aspects are written with that lens - prefer changes that stay
  generic, keep customization seams clean, and minimize merge conflicts on sync.
- Items are grouped by topic (one level of grouping only) and kept intentionally general.
- Some items are **aspirational** (things to add), not just audits of existing code.

## TypeScript & Type Safety

- `tsconfig-files.md` - Review tsconfig files
- `reduce-any-usage.md` - Reduce usage of `any`
- `typed-env-variables.md` - Validate and document environment variables the tooling reads
- `allowjs-migration.md` - Reconsider `allowJs` and the JS-first / TS-tooling split
- `type-escape-hatches-audit.md` - Audit `as any` / `@ts-ignore` / `@ts-expect-error` usages

## Node Runtime & Environment

- `nvmrc-engines-sync.md` - Keep `.nvmrc` and `engines` in sync
- `commonjs-in-esm.md` - Audit for lingering CommonJS in ESM files
- `js-target-lib-support.md` - Review JS target / lib support assumptions
- `top-level-await.md` - Review top-level `await` Node requirements
- `unhandled-rejection-handling.md` - Review unhandled-rejection / uncaught-exception handling

## Dependencies & Package Management

- `prune-unused-dependencies.md` - Prune unused dependencies
- `questionable-dependencies.md` - Review questionable direct dependencies
- `redundant-utility-libs.md` - Remove redundant utility libraries
- `package-json-generation.md` - Review the `package.json.ts` generation indirection
- `duplicate-transitive-versions.md` - Check for duplicate transitive versions
- `dependency-vulnerability-scan.md` - Add dependency vulnerability scanning (`npm audit`)

## Testing & Coverage

- `coverage-reporting-thresholds.md` - Add coverage reporting and thresholds
- `contract-tests-conventions.md` - Add contract tests for documented conventions (e.g. the
  `[error, result]` tuple shape)

## ESLint Configuration & Speed

- `eslint-rule-profiling.md` - Profile slowest ESLint rules/plugins
- `import-resolver-cost.md` - Review import-resolver cost
- `eslint-double-run.md` - Avoid running ESLint twice in health checks
- `eslint-caching.md` - Standardize on cached ESLint runs
- `eslint-per-file-typecheck.md` - Avoid per-file type-checking in lint
- `eslint-disable-audit.md` - Audit `eslint-disable` directives
- `noisy-eslint-rules.md` - Review noisy rules that force disables

## Health Checks & CI Pipeline

- `health-check-wall-time.md` - Profile total health-check wall time
- `pre-push-parallelization.md` - Scope/parallelize pre-push checks smarter
- `install-status-checks.md` - Remove overlapping install-status checks
- `health-check-failure-attribution.md` - Ensure failures are clearly attributable
- `ci-vulnerability-gate.md` - Wire a dependency-vulnerability gate into CI
- `ci-local-parity.md` - Confirm CI mirrors local health checks
- `interrupt-exit-code.md` - Verify interrupt handling yields non-zero exit

## Scripts & Tooling Optimization

- `shell-script-portability.md` - Review cross-platform portability of shell scripts
- `full-tree-scan-cost.md` - Measure cost of full-tree scanning checks
- `semver-reuse.md` - Reuse `semver` instead of a bundled copy
- `dependency-update-path.md` - Document the canonical dependency-update path
- `branching-policy-scripts.md` - Review branching-policy scripts
- `first-run-setup-errors.md` - Improve first-run setup error messages

## Git Workflow & Branching

- `merge-helper-robustness.md` - Review the template/main merge-helper robustness
- `pre-push-wait-time.md` - Review pre-push wait time vs moving checks to CI
- `hooks-fail-loudly.md` - Ensure hooks fail loudly when tools are missing
- `versioning-release-flow.md` - Review the versioning/release flow
- `revisit-tracking.md` - Ensure REVISIT tracking is periodically reviewed

## Logging & Observability

- `single-logger.md` - Standardize on a single logger
- `stray-console-log.md` - Remove stray `console.log` calls

## Code Quality & Tech Debt

- `todo-fixme-triage.md` - Triage comment-tag markers (see
  [.claude/rules/comment-tags.md](../../.claude/rules/comment-tags.md))
- `commented-out-code.md` - Remove large commented-out code blocks
- `questionable-eslint-disables.md` - Review questionable `eslint-disable` patterns
- `naming-convention-audit.md` - Confirm naming conventions across the whole tree
- `file-folder-casing.md` - Confirm file/folder casing conventions
- `duplicated-logic-extraction.md` - Extract duplicated logic

## Documentation & Onboarding

- `ai-instruction-docs-sync.md` - Keep AI-instruction docs in sync (`.claude/`, `.codex/`,
  `.cursor/`)
- `human-entry-point-docs.md` - Provide a human entry point beyond CLAUDE.md/AGENTS.md
- `because-directory-docs.md` - Document non-obvious decisions in [because/](../because/README.md)
- `documentation-coverage-gaps.md` - Fill documentation coverage gaps
- `specs-todo-currency.md` - Confirm the [docs/specs/](../specs/README.md) and TODO backlogs are
  current
- `clean-machine-first-run.md` - Verify a clean-machine first-run guide
- `archive-stale-temp.md` - Archive stale `temp/` content
