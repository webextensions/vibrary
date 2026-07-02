# 024 - Dropdown menus claim ARIA menu roles but lack the keyboard behavior the roles promise

- **Area**: polishing UI/UX (keyboard access, focus handling)
- **Files**: [frontend/src/components/Sidebar.tsx](../../frontend/src/components/Sidebar.tsx),
  [frontend/src/components/TabBar.tsx](../../frontend/src/components/TabBar.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The explorer row's "More" dropdown (`RowMore` in `Sidebar.tsx`, around line 96) and the tab strip's context menu
(`TabBar.tsx`) both advertise full menu semantics - `aria-haspopup="menu"` and `aria-expanded` on the trigger,
`role="menu"` on the popup, `role="menuitem"` on each action - but none of the interaction contract those roles
declare is implemented (`grep onKeyDown\|ArrowDown` over the components returns nothing):

- Opening the menu does not move focus into it; focus stays on the trigger.
- ArrowDown/ArrowUp/Home/End do not navigate the items (the APG menu pattern's core requirement).
- Escape closes the menu (via the shared document listener) but does not return focus to the trigger button, so
  keyboard focus is stranded on an element inside a popup that no longer exists, falling back to `<body>`.
- Items are reachable only by Tab - which is exactly the behavior `role="menu"` tells assistive tech NOT to expect:
  screen readers announce "menu" and switch users into arrow-key interaction mode, where this menu is inert.

So for screen-reader and keyboard users, the current markup is worse than plain buttons would be: it promises a
pattern and then breaks it.

## Suggested improvement

Two honest directions; either resolves the mismatch:

- Implement the pattern (preferred, small since review 007's proposed `useDismissablePopup` hook is the natural
  home): on open, focus the first `menuitem`; handle ArrowDown/ArrowUp (cycling), Home/End; give items
  `tabIndex={-1}` so Tab skips past the menu; on close (Escape or action), return focus to the trigger. Both menus
  can share this via one small hook or component.
- Or downgrade the semantics: drop `role="menu"`/`role="menuitem"`/`aria-haspopup` and keep plain buttons in a
  positioned container. Tab-based access then matches what the markup declares. Less polished, but truthful.

Related sibling (worth the same treatment in a follow-up): the tab strip declares `role="tablist"`/`role="tab"`
(`TabBar.tsx` around line 84) and likewise has no arrow-key navigation, which the APG tabs pattern requires.

## Verification

- `node --run lint`, `node --run typecheck`, and `node --run test` pass.
- Keyboard walk-through: focus a row's More button, Enter to open - focus lands on "New File.../Rename...";
  ArrowDown cycles; Escape closes and restores focus to the More button. A screen reader (or the a11y tree in
  devtools) announces the items as menu items whose keyboard model now works.

## Risk

Low. Mouse behavior is unchanged; the changes are additive keyboard/focus wiring in two components (or a
markup-only role removal).
