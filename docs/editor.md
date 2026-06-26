# The editor

When you select a file in the sidebar, it opens in an editor with two tabs. Every entry uses the same editor regardless
of its type; the only difference today is that the "Apply this spec" action is shown only on `spec` entries. A single
file can hold a mix of entry types.

## Structured tab (source of truth)

The Structured tab is a form-based editor over the list of entries in the file. It is authoritative: edits here are what
get saved, and the Raw tab is generated from this form.

Each entry is shown as a card with these controls:

- **Spec title** - text input. On blur it is normalized to a hyphenated form (lowercase, whitespace -> `-`).
- **Created by** - single-select (`Human` or `AI`), clearable.
- **Approved by** - a single `Human` checkbox; editable in both review and edit modes. Approving stores a hash of the
  current content, so the approval can later be detected as stale (see the Approve button below and
  [runbooks-file-format.md](runbooks-file-format.md)).
- **Approve button** - the card's top-right one-click action mirrors the checkbox. It reads **Approve** when
  unapproved, green **Approved** when approved against the current content, and yellow **Reapprove** when the content
  changed since approval (hover for the hash-mismatch details). Clicking **Reapprove** re-signs against the current
  text; removing an existing approval is confirmed first.
- **Content** - multi-line textarea.
- **Notes** - multi-line textarea.
- **Labels** - freeform creatable multi-select. Type a label and press Enter to add it; any value is allowed.
- **Relates to** - searchable multi-select shown at the bottom. Type to filter; options are the titles of all entries
  across every runbooks file in the folder (the current entry's own title is excluded). The option list refreshes
  after a save.

The floating **+** button offers two ways to add entries: **Create manually** appends a new empty entry, and **Create
entries with AI** opens a dialog where you pick what to create (specs / reviews / tasks - defaulting to the
open file's name family) and how many; a headless agent then appends that many entries of the chosen type to the file.
**Remove** on a card deletes that entry.

## Raw tab

The Raw tab shows the XML for the file, regenerated from the Structured form, as a read-only preview. To change the
content, edit the fields in the Structured tab.

If the file on disk is not valid XML, the editor shows a parse error, the Raw tab displays the original file content so
you can see it, and saving is disabled until the file is fixed (edit it outside the app, then reopen it).

## Saving

The **Save** button writes the file. It always serializes the Structured model to XML (see
[runbooks-file-format.md](runbooks-file-format.md)), regardless of which tab is active.
