# 013 - Bare crypto.randomUUID() calls crash the app's own supported plain-HTTP LAN case

- **Area**: tightening code and logic (missed edge case the repo itself documents)
- **Files**: [frontend/src/ActivityQueueProvider.tsx](../../frontend/src/ActivityQueueProvider.tsx),
  [frontend/src/components/SpecsEditor.tsx](../../frontend/src/components/SpecsEditor.tsx),
  [frontend/src/vibraryXmlCore.js](../../frontend/src/vibraryXmlCore.js)
- **Status**: proposed (review only - not implemented)

## Finding

`vibraryXmlCore.js` (around line 104) contains a `randomId()` helper written explicitly because
`crypto.randomUUID` only exists in secure contexts:

```js
// crypto.randomUUID is only exposed in secure contexts (https or localhost); when the UI is opened over plain HTTP on a
// LAN address (for example from a phone), it is undefined. ...
const randomId = function () {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `spec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};
```

The phone-over-LAN scenario is a supported use case by the repo's own account: the same reasoning drove the choice of
a pure-JS `hashContent` (see the comment right above `randomId`, and the dogfood entry in `docs/reviews/reviews.xml`).

But three call sites bypass the helper and call `crypto.randomUUID()` bare, so on `http://<lan-ip>:3000` each one
throws `TypeError: crypto.randomUUID is not a function`:

- `ActivityQueueProvider.tsx` line 216 - `enqueue()` assigns every job's id. EVERY AI action (run task, apply spec,
  generate entries, derive title) crashes at the moment it is queued.
- `ActivityQueueProvider.tsx` line 344 - chat follow-up message ids; sending a chat message crashes.
- `SpecsEditor.tsx` line 299 - `cloneSpec` for the bulk Duplicate operation; duplicating entries crashes.

`randomId()` itself is not exported (it is private to `vibraryXmlCore.js`), which is likely why the newer call sites
reinvented the direct call without the guard.

## Suggested improvement

- Export `randomId` from `vibraryXmlCore.js` (adding it to the export list alongside `hashContent` etc.), and
  reword its comment slightly since the ids are no longer only parse-time entry ids.
- Replace the three bare `crypto.randomUUID()` calls with `randomId()`. The job-id and message-id call sites only
  need uniqueness within a browser session, exactly what the fallback provides.
- Optionally prefix flexibility: the current fallback hardcodes `spec-`; either keep it (harmless for job ids) or
  make the prefix a parameter defaulting to `id`.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: serve the app and open `http://<machine-lan-ip>:<port>` from another device (or emulate by running
  a browser with `--unsafely-treat-insecure-origin-as-secure` unset and a non-localhost host); trigger an AI action,
  a chat follow-up, and a bulk Duplicate - all three now work instead of throwing.
- Quick emulation without a second device: in devtools, `delete crypto.randomUUID` cannot emulate a missing API on
  the real object in all browsers, so prefer the LAN-address check.

## Risk

Low. In secure contexts the behavior is identical (the helper prefers `crypto.randomUUID`); the change only adds the
documented fallback where it was missing.
