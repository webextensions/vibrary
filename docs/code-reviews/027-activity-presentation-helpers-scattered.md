# 027 - Activity presentation helpers are duplicated and live in the wrong module

- **Area**: modularising / clarifying module boundaries
- **Files**: [frontend/src/components/ActivityMonitor.tsx](../../frontend/src/components/ActivityMonitor.tsx),
  [frontend/src/components/ActivityDetail.tsx](../../frontend/src/components/ActivityDetail.tsx),
  [frontend/src/components/ActivityNotifier.tsx](../../frontend/src/components/ActivityNotifier.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The activity system's shared presentation vocabulary is split between duplication and a misplaced export:

- `STATUS_LABEL` (job status -> "Queued/Running/Done/Failed/Aborted") is defined verbatim TWICE:
  `ActivityMonitor.tsx` (~line 26) and `ActivityDetail.tsx` (~line 12). A new status, or a wording change
  ("Done" -> "Succeeded"), must be made in both or the monitor list and the detail tab disagree.
- `formatDuration` (mm:ss with the same live-tick semantics) is also defined verbatim twice, in the same two files
  (~lines 44 and 42 respectively).
- `KIND_META` (kind -> label + icon) lives in `ActivityMonitor.tsx` and is exported from there so that
  `ActivityNotifier.tsx` - a render-nothing toast watcher - can import it. That import drags the entire monitor
  component module (react-select, its filter options, the settings popover) into the notifier's dependency graph
  just for five labels. It also means anything wanting a kind label must import from a component file, inverting
  the usual "components import from shared modules" direction.

Notably, `ActivityDetail.tsx` is one of the two lazy-loaded chunks (`App.tsx` splits it out for its markdown
stack) - duplication between the eager and lazy sides is invisible at runtime precisely because each chunk carries
its own copy.

## Suggested improvement

- Create `frontend/src/components/activityPresentation.ts` (sibling of the existing `tabLabel.ts` /
  `taskOptions.ts` non-component helpers) holding `KIND_META`, `STATUS_LABEL`, `FINISHED_STATUSES`, and
  `formatDuration`.
- Import it from `ActivityMonitor`, `ActivityDetail`, and `ActivityNotifier`; drop the duplicate definitions and
  the `KIND_META` re-export from the monitor.
- No behavior change; the notifier's chunk also stops depending on the monitor component module.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- `grep -rn "STATUS_LABEL\|formatDuration\|KIND_META" frontend/src` shows one definition site each.
- Visual spot check: monitor rows, the detail tab header, and start toasts all render the same labels/durations as
  before.

## Risk

Low. Pure code motion of constants and one pure function, all already identical.
