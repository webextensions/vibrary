# vibrary file format

A vibrary file is a container of entries. Each `<entry>` carries its own `type` attribute - one of `spec`, `review`,
`task`, or `idea` - and a single file may hold any mix of them. The file itself has no type.

File names follow four families (`reviews.xml`/`reviews-*.xml`, `specs.xml`/`specs-*.xml`,
`tasks.xml`/`tasks-*.xml`, `ideas.xml`/`ideas-*.xml`); the name is only a discovery and naming convention (and seeds the
default in "Create entries with AI"), not a constraint on what an individual file may contain.

The structure is a single `<root>` element containing an `<entries>` wrapper with zero or more `<entry type="...">`
elements. This schema is also the round-trip contract: the editor's save path regenerates the file from the parsed
entries, so elements outside it are not preserved - anything else placed in the file is dropped on the next save:

```xml
<root>
    <entries>
        <entry type="spec">
            <title>some-hyphenated-title</title>
            <createdBy>Human</createdBy>
            <approved>1b6cecf787222b</approved>
            <content>Entry content text</content>
            <contentHash>1b6cecf787222b</contentHash>
            <relatesTo>
                <ref>other-entry-title</ref>
            </relatesTo>
            <notes>Notes text</notes>
            <formSchemaRef></formSchemaRef>
            <labels>
                <label>A</label>
            </labels>
            <created>2026-06-24T12:00:00.000Z</created>
            <updated>2026-06-24T12:00:00.000Z</updated>
            <updatedBy>Human</updatedBy>
        </entry>
        <entry type="review">
            <title>another-entry</title>
            <content>A review entry in the same file</content>
        </entry>
    </entries>
</root>
```

All entry types share the same fields; the only behavioral difference is that the editor's headless-agent run action -
"Apply this spec" or "Run this task" - is shown only on `type="spec"` and `type="task"` entries (`review` and `idea`
have none). A `task` entry may additionally declare a `formSchemaRef` (see below) for a per-run options form; the other
types leave it empty. An entry with no `type` attribute is treated as a `spec`.

## Fields

Each `<entry>` has these child elements:

- `title` - a hyphenated identifier for the entry (for example `sky-is-blue`). Other entries reference it by this value
  in their `relatesTo`, so titles should be unique across the folder: a duplicated title resolves to its first
  occurrence in listing order, and the editor flags duplicates within a file. The editor normalizes typed titles to
  lowercase with every non-alphanumeric run collapsed to a single hyphen.
- `createdBy` - a single value, either `Human` or `AI`.
- `approved` - the human approval: a short hash of the `content` captured when it was approved, or empty when not
  approved. If the stored hash no longer matches the current `content` the approval is stale (the text changed since
  sign-off): the editor shows a yellow "Reapprove" button and the entry drops out of the approved count until
  reapproved.
- `content` - free text: the body of the entry.
- `contentHash` - a short hash of `content`, kept in sync by the editor whenever the content changes. This is the value
  written into `approved` when a human signs off; comparing it against the stored approval hash is how a stale approval
  is detected. It is regenerated from `content` on load, so a hand-edited value is corrected on next save.
- `relatesTo` - zero or more `<ref>` entries, each the `title` of another entry (in any vibrary file in the folder).
- `notes` - free text.
- `labels` - zero or more `<label>` entries; freeform tags chosen by the user.
- `formSchemaRef` - only consulted on `type="task"` entries: a reference to a per-run options form, in
  `<sibling-file>#<schemaId>` form (for example `tasks.xml.schemas.json#deploy-options`), resolved against that
  sidecar's schemas when the file loads. Empty (the default) means the task has no options form. Ignored on every
  other entry type.
- `created` / `updated` - ISO 8601 timestamps: when the entry was created and when it was last edited. The editor
  stamps `updated` on every change and renders both in the viewer's locale.
- `updatedBy` - who made the last edit, either `Human` or `AI`: edits through the editor stamp `Human`, agent runs
  stamp `AI`.

## Notes

- Saving from the editor's Structured tab regenerates the XML from the fields above. Any content outside this schema is
  not preserved, so keep vibrary files to this structure.
- Indentation is four spaces, matching the project's [.editorconfig](../.editorconfig).
- An entry may leave any field empty; empty elements are written as `<content></content>`.
