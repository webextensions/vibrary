# hashContent takes the content string

`hashContent` in [shared/vibraryXmlCore.js](../../shared/vibraryXmlCore.js) takes the content string directly -
`hashContent(content: string)` in the type layer ([frontend/src/xml/vibraryXml.ts](../../frontend/src/xml/vibraryXml.ts)).

## Why

The function only ever read one property, but its signature demanded a whole spec-shaped object. That overstatement
forced call-site contortions - the editor spread a full spec just to smuggle a new content value past the type checker
(`hashContent({ ...value, content: next })`), and even the core faked a spec for the empty case
(`hashContent({ content: '' })`). Taking the string states exactly what the hash depends on: the content text and
nothing else.

The hash algorithm, its normalization (CRLF -> LF, trim), and every stored `<contentHash>`/`<approved>` value are
untouched - this was purely a parameter-shape change, mechanical at every call site (`approvalState` passes
`spec.content` explicitly; the editor call sites pass their content values directly).
