# 017 - Unknown /api GETs return the SPA's index.html with HTTP 200

- **Area**: tightening error handling / API contract hygiene
- **Files**: [backend/app.js](../../backend/app.js)
- **Status**: proposed (review only - not implemented)

## Finding

The SPA fallback in `createApp` matches every GET that no earlier route claimed - including `/api/*`:

```js
// SPA fallback: serve index.html for any non-API GET that did not match a static asset
app.get(/.*/, function (request, response) {
    response.sendFile(path.join(distributionDirectory, 'index.html'));
});
```

The comment says "any non-API GET", but nothing excludes `/api`. Verified against the real app:

```
GET /api/nonexistent -> 200, Content-Type: text/html, body "<!doctype html>..."
```

Consequences:

- A typo'd or removed API endpoint answers 200 + HTML instead of 404 + JSON. The frontend's shared `request()`
  helper then dies parsing HTML as JSON - producing exactly the cryptic
  `SyntaxError: Unexpected token '<'` failure mode documented in review 002, but triggered by routing rather than
  server errors, and impossible to distinguish from a real success at the HTTP layer.
- The same applies in dev against the HMR branch only by accident of ordering (Vite's middleware also serves its
  own fallback), so dev and prod can disagree about what a bad API path returns.
- Anything probing the API (curl during debugging, a future client) sees 200s for endpoints that do not exist,
  which actively hides mistakes.

## Suggested improvement

- Register a JSON 404 for unmatched API paths BEFORE the SPA fallback (and before the Vite branch, so both modes
  agree):

  ```js
  app.use('/api', function (request, response) {
      return sendErrorResponse(response, 404, 'Unknown API endpoint');
  });
  ```

  Using the existing `sendResponse.js` envelope keeps the frontend's `request()` error path working as designed
  (it already surfaces `errorMessage` from the JSON envelope).
- This also makes the fallback's comment ("any non-API GET") truthful instead of aspirational.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Re-run the probe: `GET /api/nonexistent` returns
  `404` with `{"status":"error","errorMessage":"Unknown API endpoint"}`; a real page path (`/`, `/anything`) still
  returns index.html 200; all existing API routes behave unchanged.

## Risk

Low. Only unmatched `/api` paths change behavior, and nothing in the frontend requests one on purpose.
