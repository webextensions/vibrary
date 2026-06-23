# truths file format

A truths file (`truths.xml` or `truths-*.xml`) holds a list of "truths". The structure is a single `<root>` element
containing a `<truths>` wrapper with zero or more `<truth>` elements:

```xml
<root>
    <truths>
        <truth>
            <title>some-hyphenated-title</title>
            <createdBy>Human</createdBy>
            <approved>1b6cecf787222b</approved>
            <content>Truth content text</content>
            <contentHash>1b6cecf787222b</contentHash>
            <relatesTo>
                <ref>other-truth-title</ref>
            </relatesTo>
            <notes>Notes text</notes>
            <labels>
                <label>A</label>
            </labels>
        </truth>
    </truths>
</root>
```

## Fields

Each `<truth>` has these child elements:

- `title` - a hyphenated identifier for the truth (for example `sky-is-blue`). Other truths reference it by this value
  in their `relatesTo`. The editor normalizes typed titles to lowercase and replaces whitespace with hyphens.
- `createdBy` - a single value, either `Human` or `AI`.
- `approved` - the human approval: a short hash of the `content` captured when it was approved, or empty when not
  approved. If the stored hash no longer matches the current `content` the approval is stale (the text changed since
  sign-off): the editor shows a yellow "Reapprove" button and the truth drops out of the approved count until
  reapproved.
- `content` - free text: the body of the truth.
- `contentHash` - a short hash of `content`, kept in sync by the editor whenever the content changes. This is the value
  written into `approved` when a human signs off; comparing it against the stored approval hash is how a stale approval
  is detected. It is regenerated from `content` on load, so a hand-edited value is corrected on next save.
- `relatesTo` - zero or more `<ref>` entries, each the `title` of another truth (in any `truths*.xml` file in the
  folder).
- `notes` - free text.
- `labels` - zero or more `<label>` entries; freeform tags chosen by the user.

## Notes

- Saving from the editor's Structured tab regenerates the XML from the fields above. Any content outside this schema is
  not preserved, so keep truths files to this structure.
- Indentation is four spaces, matching the project's [.editorconfig](../.editorconfig).
- A truth may leave any field empty; empty elements are written as `<content></content>`.
