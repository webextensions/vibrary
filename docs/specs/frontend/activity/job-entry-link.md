# Activity jobs link back to the entry they ran on

A job enqueued from an entry's run action ("Apply this spec" / "Run this task") records the entry it ran on as a
`target` (`{ filePath, entryTitle }`) on the job, and its activity-monitor row renders an **Open entry** button that
opens that entry in the editor - switching files if needed and ring-highlighting it via the same exact-title reveal the
relation chips and quick-open use. Jobs with no single entry (a batch apply, a generate into a file) carry no target
and render no button, so there is never a dead affordance.

## Why

The activity monitor is a list of entry titles, none of which used to be clickable: to fix a spec whose run failed, the
user had to read the title off the job row, switch to the explorer, find its file by hand, and scroll to it. The editor
already knew how to open an entry by title from anywhere (`openEntryByTitle` backs the relation chips, search results
and quick-open); the click was simply never wired.

## The target is file + title, resolved at click time

Recording the file as well as the title is what makes the link robust: titles resolve folder-wide but are not
immortal. `resolveJobTarget` in
[frontend/src/activity/resolveJobTarget.ts](../../../frontend/src/activity/resolveJobTarget.ts) resolves the recorded
target against the CURRENT title index when the button is clicked, not against the world as it was at enqueue time:

- The recorded file wins while the title still resolves there, so a title duplicated across files opens the run's own
  file rather than the folder's first occurrence.
- An entry moved to another file since the run is followed by title.
- A title that resolves nowhere (renamed or removed) gets the relation chips' existing "may have been renamed or
  removed" toast instead of a silent dead click.

Untitled entries enqueue no target: a title is the only address the editor can navigate to.

## Wiring

- [frontend/src/activity/activityQueue.ts](../../../frontend/src/activity/activityQueue.ts) - the `JobTarget` type;
  `JobSpec.target` (optional) and `Job.target` (nullable).
- [frontend/src/activity/ActivityQueueProvider.tsx](../../../frontend/src/activity/ActivityQueueProvider.tsx) - enqueue
  stores the target; retryJob passes it through so a retried row keeps its link.
- [frontend/src/editor/RunActionSection.tsx](../../../frontend/src/editor/RunActionSection.tsx) - the one enqueue site
  with a single entry; receives the file path threaded from `SpecsEditor` through `SpecCard`.
- [frontend/src/activity/ActivityMonitor.tsx](../../../frontend/src/activity/ActivityMonitor.tsx) - the row's
  **Open entry** button (`GoToIcon`), shown for any status when a target exists.
- [frontend/src/App.tsx](../../../frontend/src/App.tsx) - `handleOpenJobEntry` resolves and navigates (or toasts),
  passed down through `LeftPanel` and `ActivityPanel` as the activity view's `onOpenEntry`.

## Tests

[frontend/src/activity/resolveJobTarget.test.ts](../../../frontend/src/activity/resolveJobTarget.test.ts) pins the
three resolution rules: recorded file preferred over another file's duplicate title, a moved entry followed by title,
and null (the toast path) for a title that resolves nowhere.
