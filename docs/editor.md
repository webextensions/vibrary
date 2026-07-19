# The editor

When you select a file in the sidebar, it opens in an editor with two tabs. Every entry uses the same editor regardless
of its type; the only difference today is that only `spec` and `task` entries get a headless-agent run action ("Apply
this spec" / "Run this task" respectively) - `review` and `idea` entries have none. A single file can hold a mix of
entry types.

## Structured tab (source of truth)

The Structured tab is a form-based editor over the list of entries in the file. It is authoritative: edits here are what
get saved, and the Raw tab is generated from this form.

Each entry is shown as a card. A card opens in review mode (fields read-only); **Edit** switches it to edit mode, and
a freshly added or duplicated entry opens in edit mode directly. Collapsed, a card shows its selection checkbox, type
icon, title, header actions (Remove / Edit / Copy / Duplicate / Approve) and content; the chevron at its top-left
expands the remaining fields and the run action. An entry ranked in the Rankings view also carries its Elo rating as
a small chip beside the title (see [rankings.md](rankings.md)). When another entry - in this file or any other file in the folder -
has the same title (which makes `relatesTo` references, resolved by exact title folder-wide, ambiguous) a **duplicate
title** warning appears next to it, with a **Make unique** action that appends the first free numeric suffix. The
controls:

- **Title** - text input in edit mode. On blur it is normalized to a hyphenated form: lowercase, with every run of
  non-alphanumeric characters (whitespace and punctuation alike) collapsed to a single `-` - the same rule the
  AI-derived **Populate** titles use. While you edit the title of an entry that other entries reference, a muted
  **renaming breaks N links** hint appears beside it: because `relatesTo` references resolve by exact title, renaming
  this entry leaves those references pointing at a title no entry has unless you update them too. (The hint steps aside
  for the duplicate-title warning when the edited title collides with another entry.)
- **Approve button** - the card's top-right one-click action. It reads **Approve** when unapproved, green
  **Approved** when approved against the current content, and yellow **Reapprove** when the content changed since
  approval (hover for the hash-mismatch details). Clicking **Reapprove** re-signs against the current text; removing
  an existing approval is confirmed first.
- **Content** - multi-line textarea. In edit mode a live word/character count shows below it. In review mode a long
  content is clamped to a preview with a **Show more** / **Show less** toggle, so one wall-of-text entry cannot bury
  the rest of the list; a short entry is shown in full with no toggle.
- **Type** - the entry's kind (`spec` / `review` / `task` / `idea`), shown as the icon on the collapsed card and
  editable as a dropdown in the expanded fields. Changing it turns the headless-agent run action on or off (only
  `spec`/`task` entries have one) and updates the type icon immediately.
- **Copy** - copies the entry to the clipboard as Markdown (the title as a heading, the content, and any notes, labels
  and relations), for pasting into a PR, doc, or chat.
- **Notes** - multi-line textarea.
- **Labels** - freeform creatable multi-select. Type a label and press Enter to add it; any value is allowed, and the
  dropdown suggests every label already used anywhere in the folder (including unsaved ones in the open file), so an
  existing spelling gets reused instead of a near-duplicate being coined. In review
  mode each label renders as a chip; clicking a chip toggles that label into (or out of) the label filter (see
  Filtering below) as a quick "show me more/fewer like this".
- **Relates to** - searchable multi-select. Type to filter; options are the titles of all entries
  across every vibrary file in the folder (the current entry's own title is excluded). The option list refreshes
  after a save. In review mode each reference renders as a chip; clicking it opens the target entry's file (switching
  files if needed) and scrolls to / highlights it. Following a relation chip (here or in **Referenced by**) reveals a
  **Back** button in the editor toolbar (or press Alt+ArrowLeft) that returns you along the path you took - across
  files, and one hop per press - so you can explore the relation graph and retrace your steps. A reference whose title
  matches no entry (a broken link
  left by a
  renamed or removed target) renders instead as an inert amber chip with a tooltip explaining it points to nothing, and
  the card's header shows a **N broken references** badge (naming the missing titles on hover) with two actions:
  **Repair...** opens a small panel proposing the likely intended target for each dead reference ("did you mean
  `oauth-token-refresh`?" - matched by normalization, closeness, or containment against every title in the folder, and
  never applied without a click), and **Remove** drops the dead references in one click. A reference with no similar
  entry says so - which is exactly when Remove is the informed choice.
  The file's row in the sidebar also carries an amber count of its broken references, so files with dead links stand
  out across the whole folder without opening each one.
- **Referenced by** - the reverse of "Relates to": a read-only list of the entries (across every file in the folder)
  whose `relatesTo` points at this one, each a chip that opens the referencing entry (its file named in the tooltip).
  The row appears only when at least one entry references this one. It reflects the last saved state of other files and
  this file's live edits, so adding or removing a relation updates both entries' views without a save.
- **Created by** - a `Human` / `AI` radio pair; clicking the selected option again clears it back to unset.
- **Approved** - reads `Yes` / `No` in review mode; in edit mode a Yes/No radio pair mirroring the Approve button:
  **Yes** stores a hash of the current content, so the approval can later be detected as stale (see the Approve
  button above and [vibrary-file-format.md](vibrary-file-format.md)), and **No** clears it (confirmed first, like the
  button).
- **Created** / **Updated** / **Updated by** - read-only provenance; the timestamps render in your locale.
- **Apply this spec** / **Run this task** - the card's headless-agent run action at the bottom of the expanded card,
  shown only on `spec`/`task` entries (see above). A **Provide custom one time instructions** checkbox reveals a
  prompt for free-text guidance specific to that one run (for example "focus on the backend only"), folded into the
  agent's prompt alongside the entry's own content; when saved prompt templates exist, the prompt offers an
  **Insert saved template** select that fills the field (still editable for the run). A spec additionally offers
  **Plan first**: a read-only agent run that researches the codebase and writes a concise implementation plan into
  the entry's notes under an "Implementation plan" heading, for review (and correction - it is ordinary note text)
  before any code changes. Once a plan is present the apply button reads **Apply with plan** - the notes ride the
  apply prompt, so the reviewed plan steers the run - and Plan first becomes **Re-plan**, which replaces the old
  plan section while keeping any hand-written notes above it. The plan run is instructed not to edit files, but like
  every agent action it executes unsandboxed - see "Agent runs and permissions" in [README.md](README.md). Like every agent action, the run executes with permission prompts
  disabled - see "Agent runs and permissions" in [README.md](README.md).

The floating **+** button offers two ways to add entries: **Create manually** appends a new empty entry of the file's
own type family (specs.xml adds a spec, tasks.xml a task, and so on - the type stays editable afterward), and **Create
entries with AI** opens a dialog where you pick what to create (specs / reviews / tasks / ideas - defaulting to the
open file's name family), how many, and optional custom instructions for the run; a headless agent then appends that
many entries of the chosen type to the file. When saved prompt templates exist (managed in the activity monitor's
Settings popover), an **Insert saved template** picker above the instructions box fills it with a template's text -
still editable for the run. **Duplicate** on a card clones it (a fresh entry with the same content,
notes, labels and relations, but its own id, timestamps, an unapproved state, and a unique `-copy` title) as a
starting point for a similar one. **Remove** on a card deletes that entry (with a brief **Undo** toast to restore it). The stacked up/down control at the start of a card's actions moves the
entry one position in the file (disabled at the ends, and hidden while a filter or a non-default sort is active, since
moving relative to hidden or re-ordered entries would be ambiguous).

## Bulk selection

Each card has a checkbox at its top-left; the footer below the list shows how many of the file's entries are ticked,
with **Select all** / **Deselect all** links (Select all only ticks the entries currently shown under an active
filter) and Escape clears the selection. The footer also shows a small approval progress meter (how many of the file's
entries are currently approved), an **Expand all** / **Collapse all** link that opens or closes the extra-fields
section of every shown entry at once, and a **Sort** control that reorders the list view - by file order (the
default, and the only one in which the up/down reorder is available), title, most-recently-updated, approval
status, or Elo rating (highest first, entries without a recorded rating last - see [rankings.md](rankings.md); in a
folder with no recorded results this sort keeps the file order). The sort is view-only and never changes the saved
file, and your choice is remembered across reloads. A
**Markdown** checkbox renders each entry's content and notes as
formatted Markdown in review mode (headings, emphasis, code, lists, quotes) instead of plain text; it is off by default
(remembered across reloads), and while it is on the long-content clamp and the Search-match emphasis (which work on the
raw text) do not apply. Two
buttons act on the ticked entries:

- **Operations** - **Approve**, **Remove Approval**, **Add label** / **Remove label** (prompt for a label and add it
  to, or strip it from, every ticked entry), **Remove broken references** (drops every dangling `relatesTo` reference -
  see below - from the ticked entries, touching only those that have one), **Change type** (opens a dialog to set every
  ticked entry to a chosen type at once), **Move to file** (opens a dialog to move the ticked entries into another
  vibrary file - pick an existing file or type a new name to split them into a fresh file; the moved entries are
  appended to the destination, and both the source and, if it is open, an existing destination must be saved first),
  **Find & replace** (opens a dialog to
  replace a term across the ticked entries' content and notes - titles are left alone since they are `relatesTo`
  identifiers - with a **Match case** toggle and a live occurrence count), **Copy as Markdown** (copies the ticked entries as one Markdown
  document, so **Select all** then this copies the whole file), **Duplicate** (each ticked entry's copy is inserted
  right after its own source), and **Delete**. These apply to any entry type. The operations that lose information -
  **Delete**, **Change type**, **Find & replace**, and **Remove broken references** - each offer a brief **Undo** toast
  that restores exactly what they changed, leaving any edit you made in the meantime untouched.
- **Actions** - **Apply changes**, which queues the same headless-agent apply run as the single-card button over
  every ticked `spec` entry as one combined job, with its own **Provide custom one time instructions** checkbox
  applying the entered guidance to the whole batch. Only `spec` entries batch: a `task`'s action is "run" (with its
  per-run options form), not "apply", so ticked tasks - like `review`/`idea` entries - are counted among the skipped
  in the popup and keep their single-card **Run this task** flow.

## Filtering

The toolbar's **Filter** button (visible once a file has entries) opens a free-text box plus four multi-select
dropdowns: **Approval status**, **Entry type**, **Labels** (whose options are whatever labels are actually used in
the open file), and **Created by** (Human / AI / Unspecified - the entry's provenance). The text box matches an
entry's title, content, notes, or labels. An entry is shown when it matches every dimension that is set; an empty selection
(or empty text) in a dimension imposes no constraint there. A dot on the
Filter button and an "X of Y shown" count both indicate when a filter is active, and a **Clear filters** link resets
them all at once. This narrows the open file's list; to jump to a matching entry across all files, use the Search
panel instead.

The Search panel (the magnifier in the navigation rail) searches every included file's entries by title, content,
notes, and labels - optionally narrowed to specific files via the "Narrow to files" selector - listing each match
with the term emphasized in its snippet. Matching is case-insensitive substring by default; the **Match case** and
**Whole word** toggles tighten it for identifier-shaped queries (whole-word treats hyphens as boundaries, so
"auth" still finds the hyphenated title "auth-token"). The query box also understands field operators, giving the
folder-wide search the filter panel's vocabulary: `type:spec`, `label:auth`, `approved:yes|no|stale`,
`by:ai|human|unspecified`, `file:specs*.xml` (a gitignore-style pattern, ANDed with the file selector), and a `-`
prefix to negate any of them. Operators combine with free text (`type:spec approved:no oauth`), each parsed operator
shows as a removable chip under the box (a mistyped one stays plain search text), and a constraint-only query like
`type:spec` is valid on its own - it lists every matching entry with the head of its content as the snippet. Choosing a result opens the entry's
file, scrolls to and briefly rings the entry, reveals it (un-clamping long content and opening its extra fields so a
match in the notes is visible), and marks the matched term in its title, content, or notes so it stands out where you
land.

## Raw tab

The Raw tab shows the XML for the file, regenerated from the Structured form, as a read-only preview. A **Copy** button
copies the whole file's XML to the clipboard, and a **Wrap** toggle (remembered across sessions) controls long-line
wrapping. To change the content, edit the fields in the Structured tab.

If the file on disk is not valid XML, the editor shows a parse error and the Raw tab becomes a repair editor over the
original file content: a live parse check reports whether the text parses as you type (naming the failure position),
and its **Save** writes your text to the file verbatim - still guarded against the file having changed on disk since it
loaded. The moment a save parses, the file reloads and the Structured tab lights back up. Saving text that still does
not parse is allowed (a partial fix is better than a lost one) but asks first. The Raw tab stays read-only while the
file parses: a raw edit to a working file would be silently reshaped by the serializer on the next structured save,
so there is exactly one editable view at a time.

## Saving

The **Save** button (or Ctrl+S / Cmd+S from anywhere in the app) writes the file. It always serializes the Structured
model to XML (see [vibrary-file-format.md](vibrary-file-format.md)), regardless of which tab is active. When more than
one open file has unsaved edits, a **Save all (N unsaved)** action appears atop the sidebar's **Open Editors** list and
writes them all in one go (each file is saved independently, so a conflict on one - see the overwrite prompt below -
does not block the others).

## Keyboard and mouse shortcuts

A skip link ("Skip to editor") is the first Tab stop on every load, jumping past the rail, sidebar, and tab strip
straight to the editor. For screen readers, a single polite live region announces the changes that are otherwise
visual-only: completed saves, the filter's shown count, search result tallies, and keyboard approvals.

- Ctrl+Enter / Cmd+Enter - send the chat composer's message in an activity tab.
- Ctrl+S / Cmd+S - save the active file (plain Ctrl+S only; a no-op when there is nothing to save, with the browser's
  own save dialog suppressed).
- Ctrl+Shift+T / Cmd+Shift+T - reopen the most recently closed tab (same as the toolbar button; falls through to the
  browser when there is nothing to reopen).
- Ctrl+K / Cmd+K - open the quick-open palette to jump to a file or entry by name (type to filter, arrow keys to move,
  Enter to open).
- `?` - open the Help dialog (also reachable from the `?` button at the foot of the navigation rail): a Shortcuts tab
  listing everything in this section, and a Guide tab rendering this manual (Overview, Editor guide, File format) from
  the installed package. Ignored while typing in a field.
- `/` - jump to the structured editor's text filter, opening the filter panel first if it is closed. Ignored while
  typing in a field, and a no-op unless a structured editor with entries is showing.
- Alt+ArrowUp / Alt+ArrowDown - move to the previous / next entry card, and Home / End jump to the first / last, landing
  on the card's selection checkbox and scrolling it into view. The focused card takes a subtle blue accent, so it is
  clear which one the A / E / C / D actions above will act on. Walks the entries currently shown, so an entry hidden by
  a filter is skipped. Ignored while typing in a text field or using a dropdown, so it never disturbs editing.
- Alt+Shift+ArrowUp / Alt+Shift+ArrowDown - move the focused entry one position up / down, the keyboard equivalent of a
  card's up/down buttons. Available only in file order (no filter or sort active), for the same reason those buttons
  are; the moved card keeps focus at its new position.
- A - approve (or re-approve a stale) focused entry, the keyboard equivalent of its Approve button, for reviewing down a
  list with Alt+ArrowUp/Down. It only ever adds or refreshes an approval, never removes one (that needs the button's
  confirm); a no-op on an already-approved entry. Ignored while typing in a text field.
- E - toggle the focused entry between edit and review mode, the keyboard equivalent of its Edit button, so a keyboard
  review can fix an entry in place. To leave edit mode, focus the card itself (not one of its fields) and press it
  again. Ignored while typing in a text field.
- C - copy the focused entry to the clipboard as Markdown, the keyboard equivalent of its Copy button (Ctrl/Cmd+C still
  copies any selected text). Ignored while typing in a text field.
- D - duplicate the focused entry, the keyboard equivalent of its Duplicate button; the copy opens in edit mode with its
  content focused. Ignored while typing in a text field.
- Escape - closes the open popup, menu, or dialog first; with none open, clears the entry or file selection.
- ArrowLeft/ArrowRight/Home/End on a focused editor tab - switch tabs (wrapping at the ends); the whole strip is a
  single Tab stop, so keyboarding past it costs one press however many files are open.
- Middle-click a tab - close it.
- Right-click a tab - open its context menu (Close / Close Others / Close All); menus support
  ArrowUp/ArrowDown/Home/End navigation.
