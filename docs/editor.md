# The editor

When you select a file in the sidebar, it opens in an editor with two tabs.

## Structured tab (source of truth)

The Structured tab is a form-based editor over the list of truths in the file. It is authoritative: edits here are what
get saved, and the Raw tab is generated from this form.

Each truth is shown as a card with these controls:

- **Truth title** - text input. On blur it is normalized to a hyphenated form (lowercase, whitespace -> `-`).
- **Created by** - single-select (`Human` or `AI`), clearable.
- **Approved by** - a single `Human` checkbox; editable in both review and edit modes. Approving stores a hash of the
  current content, so the approval can later be detected as stale (see the Approve button below and
  [truths-file-format.md](truths-file-format.md)).
- **Approve button** - the card's top-right one-click action mirrors the checkbox. It reads **Approve** when
  unapproved, green **Approved** when approved against the current content, and yellow **Reapprove** when the content
  changed since approval (hover for the hash-mismatch details). Clicking **Reapprove** re-signs against the current
  text; removing an existing approval is confirmed first.
- **Content** - multi-line textarea.
- **Notes** - multi-line textarea.
- **Labels** - freeform creatable multi-select. Type a label and press Enter to add it; any value is allowed.
- **Relates to** - searchable multi-select shown at the bottom. Type to filter; options are the titles of all truths
  across every `truths*.xml` file in the folder (the current truth's own title is excluded). The option list refreshes
  after a save.

Use **+ Add truth** to append a new empty truth, and **Remove** on a card to delete that truth.

## Raw tab

The Raw tab shows the XML for the file, regenerated from the Structured form, as a read-only preview. To change the
content, edit the fields in the Structured tab.

If the file on disk is not valid XML, the editor shows a parse error, the Raw tab displays the original file content so
you can see it, and saving is disabled until the file is fixed (edit it outside the app, then reopen it).

## Saving

The **Save** button writes the file. It always serializes the Structured model to XML (see
[truths-file-format.md](truths-file-format.md)), regardless of which tab is active.
