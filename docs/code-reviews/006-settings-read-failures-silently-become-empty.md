# 006 - GET /settings silently masks corrupt or unreadable settings files

- **Area**: improving log and error messages so failures are diagnosable
- **Files**: [backend/routes/settings.js](../../backend/routes/settings.js)
- **Status**: proposed (review only - not implemented)

## Finding

The settings read route treats every failure identically (around `backend/routes/settings.js` line 20):

```js
router.get('/settings', async function (request, response) {
    try {
        const content = await readFile(settingsPath, 'utf8');
        return sendSuccessResponse(response, { settings: JSON.parse(content) });
    } catch {
        return sendSuccessResponse(response, { settings: {} });
    }
});
```

Falling back to `{}` is the right UX for a genuinely missing file (`ENOENT` - first run, nothing saved yet). But the
bare `catch` also swallows two failure modes that deserve a trace:

- **Corrupt JSON** in an existing `.vibrary/settings.local.json` (hand-edited, interrupted write, merge damage). The
  user's remembered task options and notification toggles silently revert to defaults, and the next save overwrites
  the corrupt file - destroying the only evidence of what went wrong. Nothing is ever logged, so "my settings keep
  resetting" is undiagnosable from the server output.
- **Permission errors** (`EACCES`/`EPERM`) reading the file. The UI shows defaults as if no settings existed; the
  user's first hint of trouble is a later save failing with a 500 (the PUT branch does log and surface its errors -
  commit `00b9112` added that - which makes the read branch's total silence the odd one out).

The route comment says a corrupt file is deliberately treated as "no settings yet"; keeping that response behavior is
fine - the gap is purely observability.

## Suggested improvement

- Split the failure handling: on `error.code === 'ENOENT'`, return `{ settings: {} }` silently (expected case).
- For any other failure (JSON parse error, `EACCES`, ...), keep returning `{ settings: {} }` so the UI stays usable,
  but `console.error('Failed to read settings from <path>:', error)` first, mirroring the PUT branch's existing
  `console.error('Failed to save settings:', error)`.
- Optional hardening while in the file: the PUT branch could write via a temp file + rename so an interrupted write
  cannot produce the corrupt-JSON case in the first place; worth its own small change if taken up.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: write garbage into `.vibrary/settings.local.json`, hit the UI - it still loads with defaults, and the
  server log now names the parse failure and the path. Delete the file - no log line (ENOENT stays silent).

## Risk

Low. Response bodies are unchanged in every case; the only new behavior is a server-side log line on unexpected read
failures.
