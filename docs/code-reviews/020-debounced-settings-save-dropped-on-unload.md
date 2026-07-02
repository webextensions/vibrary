# 020 - Debounced settings save is silently dropped on reload/close

- **Area**: missed edge cases (persistence timing)
- **Files**: [frontend/src/SettingsProvider.tsx](../../frontend/src/SettingsProvider.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

Settings writes are debounced by 400 ms so rjsf's per-keystroke `onChange` does not spam the endpoint - a good call.
But the pending write has two silent-loss paths:

- The unmount cleanup only clears the timer:

  ```ts
  useEffect(function () {
      return function () {
          if (saveTimerReference.current !== null) {
              clearTimeout(saveTimerReference.current);
          }
      };
  }, []);
  ```

  Whatever change was waiting in that timer is discarded, with no error and no `saveError` - the UI already showed
  the new value, so the user has every reason to believe it stuck.
- Nothing listens for page unload. Toggling a notification setting (or editing task options) and reloading/closing
  within 400 ms silently reverts the change on next launch. The app's own beforeunload guard protects dirty FILE
  tabs, so the user is trained to expect "no warning = everything saved" - settings are the exception.

This is low-frequency but the failure is invisible when it happens ("my settings keep reverting" with no
reproduction), the same undiagnosability theme as review 006 on the backend side.

## Suggested improvement

- Flush instead of discard: keep the timer id AND the latest unsaved snapshot in refs; on `pagehide` (or
  `visibilitychange` to hidden - the modern replacement for unload work) and on provider unmount, if a save is
  pending, send it immediately with `fetch(..., { keepalive: true })` so the browser lets the request outlive the
  page. The API helper can accept an optional `keepalive` flag to avoid a parallel code path.
- The payload is small (a JSON settings object), well under the 64 KiB keepalive budget.
- Alternatively (smaller, partial): flush on unmount only and accept the hard-close loss; but since the listener and
  the flush share the same few lines, the full fix is barely bigger.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: toggle a notification setting and immediately reload (within 400 ms - e.g. bind the toggle and
  reload to a quick key sequence, or temporarily raise the debounce to 5 s to make the window easy to hit). After
  the change, the toggle survives the reload; before it, it reverts. `.vibrary/settings.local.json`'s mtime confirms
  the keepalive write landed.

## Risk

Low. The flush path reuses the same save call; the only new behavior is one extra PUT at page-hide time when a write
was pending.
