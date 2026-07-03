# The editor

When you select a file in the sidebar, it opens in an editor with two tabs. Every entry uses the same editor regardless
of its type; the only difference today is that only `spec` and `task` entries get a headless-agent run action ("Apply
this spec" / "Run this task" respectively) - `review` and `idea` entries have none. A single file can hold a mix of
entry types.

## Structured tab (source of truth)

The Structured tab is a form-based editor over the list of entries in the file. It is authoritative: edits here are what
get saved, and the Raw tab is generated from this form.

Each entry is shown as a card with these controls:

- **Spec title** - text input. On blur it is normalized to a hyphenated form (lowercase, whitespace -> `-`).
- **Created by** - single-select (`Human` or `AI`), clearable.
- **Approved by** - a single `Human` checkbox; editable in both review and edit modes. Approving stores a hash of the
  current content, so the approval can later be detected as stale (see the Approve button below and
  [vibrary-file-format.md](vibrary-file-format.md)).
- **Approve button** - the card's top-right one-click action mirrors the checkbox. It reads **Approve** when
  unapproved, green **Approved** when approved against the current content, and yellow **Reapprove** when the content
  changed since approval (hover for the hash-mismatch details). Clicking **Reapprove** re-signs against the current
  text; removing an existing approval is confirmed first.
- **Content** - multi-line textarea.
- **Notes** - multi-line textarea.
- **Labels** - freeform creatable multi-select. Type a label and press Enter to add it; any value is allowed. In review
  mode each label renders as a chip; clicking a chip toggles that label into (or out of) the label filter (see
  Filtering below) as a quick "show me more/fewer like this".
- **Relates to** - searchable multi-select shown at the bottom. Type to filter; options are the titles of all entries
  across every vibrary file in the folder (the current entry's own title is excluded). The option list refreshes
  after a save. In review mode each reference renders as a chip; clicking it opens the target entry's file (switching
  files if needed) and scrolls to / highlights it.
- **Apply this spec** / **Run this task** - the card's headless-agent run action, shown only on `spec`/`task` entries
  (see above). A **Provide custom one time instructions** checkbox reveals a prompt for free-text guidance specific to
  that one run (for example "focus on the backend only"), folded into the agent's prompt alongside the entry's own
  content. Like every agent action, the run executes with permission prompts disabled - see "Agent runs and
  permissions" in [README.md](README.md).

The floating **+** button offers two ways to add entries: **Create manually** appends a new empty entry, and **Create
entries with AI** opens a dialog where you pick what to create (specs / reviews / tasks / ideas - defaulting to the
open file's name family), how many, and optional custom instructions for the run; a headless agent then appends that
many entries of the chosen type to the file. **Duplicate** on a card clones it (a fresh entry with the same content,
notes, labels and relations, but its own id, timestamps and an unapproved state) as a starting point for a similar
one. **Remove** on a card deletes that entry.

## Bulk selection

Each card has a checkbox at its top-left; the footer below the list shows how many of the file's entries are ticked,
with **Select all** / **Deselect all** links (Select all only ticks the entries currently shown under an active
filter) and Escape clears the selection. Two buttons act on the ticked entries:

- **Operations** - **Approve**, **Remove Approval**, **Duplicate** (each ticked entry's copy is inserted right after
  its own source), and **Delete**. These apply to any entry type.
- **Actions** - **Apply changes**, which queues the same headless-agent apply run as the single-card button over
  every ticked `spec` entry as one combined job, with its own **Provide custom one time instructions** checkbox
  applying the entered guidance to the whole batch. Only `spec` entries batch: a `task`'s action is "run" (with its
  per-run options form), not "apply", so ticked tasks - like `review`/`idea` entries - are counted among the skipped
  in the popup and keep their single-card **Run this task** flow.

## Filtering

The toolbar's **Filter** button (visible once a file has entries) opens three multi-select dropdowns: **Approval
status**, **Entry type**, and **Labels** (whose options are whatever labels are actually used in the open file). An
entry is shown when it matches every dimension that has a selection; an empty selection in a dimension imposes no
constraint there. A dot on the Filter button and an "X of Y shown" count both indicate when a filter is active.

## Raw tab

The Raw tab shows the XML for the file, regenerated from the Structured form, as a read-only preview. To change the
content, edit the fields in the Structured tab.

If the file on disk is not valid XML, the editor shows a parse error, the Raw tab displays the original file content so
you can see it, and saving is disabled until the file is fixed (edit it outside the app, then reopen it).

## Saving

The **Save** button (or Ctrl+S / Cmd+S from anywhere in the app) writes the file. It always serializes the Structured
model to XML (see [vibrary-file-format.md](vibrary-file-format.md)), regardless of which tab is active.
