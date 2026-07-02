# 032 - A half-typed chat follow-up is lost by switching tabs

- **Area**: aligning behavior with user expectations (unsaved input preservation)
- **Files**: [frontend/src/components/ActivityDetail.tsx](../../frontend/src/components/ActivityDetail.tsx),
  [frontend/src/App.tsx](../../frontend/src/App.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

App mounts only the ACTIVE tab's content (`App.tsx` ~line 648: `activeTab.kind === 'activity' && <ActivityDetail
... />`), and `ActivityDetail` keeps its chat composer text in local state (`const [draft, setDraft] =
useState('')`, ~line 190). Switching to another tab unmounts the component and destroys the draft.

The flow this breaks is the natural one: while composing a follow-up to an agent run ("actually, also update the
tests in..."), the user clicks over to a file tab to check a detail - exactly what the multi-tab UI invites - and
returns to find the composer empty.

This contradicts the app's own standard elsewhere: file tabs were architected specifically so "a tab's unsaved
edits survive switching to another tab" (the `TabState` comment in `useOpenTabs.ts`), and the same unmount-safety
thinking shows up in the persisted prompt-view toggle and RawXmlView's wrap flag. The chat draft is the one piece
of user-typed input the app forgets.

Smaller casualties of the same remount: every `ToolResult`'s expanded/collapsed state resets, and the transcript's
scroll position snaps back to the bottom.

## Suggested improvement

- Keep drafts keyed by job id in the activity queue provider, next to the other per-job state that already survives
  tab switches (transcripts live there in refs for exactly this reason). Two small additions to the context:
  `getDraft(jobId)` / `setDraft(jobId, text)` backed by a `Map<string, string>` ref plus a local mirror state in
  the component for controlled-input rendering - or simply a module-level map read on mount
  (`useState(() => draftsRef.get(jobId) ?? '')`) and written on change/unmount.
- Clear a job's draft where its transcript is already cleared (`clearEvents`) so removed jobs do not leak drafts.
- The ToolResult/scroll resets are lower value; if wanted later, the same keyed-state approach covers them, but the
  draft is the part that costs users real typing.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Manual check: open an activity tab, type into the composer without sending, switch to a file tab and back - the
  text is still there. Remove the job from the monitor - the stored draft is gone (no stale map growth).

## Risk

Low. Additive state plumbing; send/queue behavior is untouched.
