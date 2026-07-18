# Dependency update pass (2026-07-18)

## Applied

- In-range batch (one lockfile update, checks run once): `@eslint-react/eslint-plugin` 5.10.0 -> 5.14.10,
  `@types/node` 26.0.1 -> 26.1.1, `eslint` 10.6.0 -> 10.7.0, `eslint-plugin-n` 18.2.1 -> 18.2.2, `fast-xml-parser`
  5.9.3 -> 5.10.0, `ignore` 7.0.5 -> 7.0.6, `typescript-eslint` 8.62.0 -> 8.64.0, `vite` 8.1.0 -> 8.1.4.
  `fast-xml-parser` and `ignore` are runtime dependencies, so the packaged-tarball smoke test ran too (passed).
- Major: `eslint-plugin-unicorn` 69.0.0 -> 72.0.0. Its recommended set gained
  `unicorn/prefer-simple-condition-first`, which produced six pure-reordering findings against deliberately-ordered
  guards; the rule is opted out in `eslint.config.js` with a rationale, following the existing ref-name-rule
  precedent, rather than churning the six sites.

## Deferred

- Major: `typescript` 6.0.3 -> 7.0.2 is BLOCKED upstream: `typescript-eslint` 8.64.0 declares peer
  `typescript >=4.8.4 <6.1.0`, so TS 7 (and even 6.1) is unsupported by the lint toolchain. Revisit when
  typescript-eslint widens its supported range; expect a real migration budget (the typecheck is a gate over the
  frontend AND the checkJs pass, and TS majors tighten inference).

All four checks plus the smoke test pass at the final state.
