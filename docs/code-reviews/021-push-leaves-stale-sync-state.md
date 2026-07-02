# 021 - After a successful Push, the panel keeps showing the pre-push sync state

- **Area**: UI state consistency after user actions
- **Files**: [frontend/src/components/SourceControlPanel.tsx](../../frontend/src/components/SourceControlPanel.tsx),
  [backend/routes/git.js](../../backend/routes/git.js)
- **Status**: proposed (review only - not implemented)

## Finding

The Source Control actions are designed around "mutate and get the refreshed status in one round trip": commit
returns the new `GitStatus` (`setStatus(await commitChanges(...))`), pull does the same, and stage/unstage/discard
flow through `runStatusAction`. Push is the one exception:

- Backend: `POST /git/push` responds with `{ output }` - the raw push output - instead of the refreshed status the
  other mutating routes return.
- Frontend: `handlePush` (around line 238) only sets `setNotice('Pushed.')`; `status` is untouched.

So after a successful push the header keeps rendering stale facts:

- the ahead badge still shows `↑N` even though those commits were just pushed (it clears only on a manual Refresh
  or some other action that happens to return status);
- for the publish case (branch had no upstream), `status.tracking` stays `null`, so the branch tooltip still says
  "no upstream - Push will publish it", and a second Push would again present the "Publish it?" confirmation for a
  branch that is already published.

The user just performed the action whose whole point is to change this state; the panel telling them it did not
change reads as "the push did not work", directly contradicting the "Pushed." notice next to it.

## Suggested improvement

- Backend: have `/git/push` respond like its siblings - `{ status: await statusAsync(cwd) }` after a successful
  push (the raw push output is currently unused by the frontend; drop it or include it alongside).
- Frontend: `setStatus(await pushChanges())` in `handlePush`, mirroring `handlePull` one function below, and update
  `pushChanges`'s return type from `Promise<void>` to `Promise<GitStatus>`.
- This also naturally fixes the publish flow: `tracking` becomes non-null in the refreshed status, so the tooltip
  and the next Push confirmation read correctly.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check in a repo with a remote: make a commit, note `↑1`, push - the badge disappears without touching
  Refresh, and the notice reads "Pushed.". On a fresh branch: Publish once, then hover the branch name - the tooltip
  now names the tracking branch, and a second Push asks the plain "Push ... to its remote?" question.

## Risk

Low. One extra `git status` per push on the backend; the frontend change mirrors an adjacent, proven pattern.
