# 042 - Lossy XML round-trip makes approvals go spuriously stale (trimValues vs hash)

- **Area**: tightening logic (real bug: parse/serialize asymmetry breaking the approval invariant)
- **Files**: [frontend/src/vibraryXmlCore.js](../../frontend/src/vibraryXmlCore.js),
  [frontend/src/components/SpecCard.tsx](../../frontend/src/components/SpecCard.tsx)
- **Status**: proposed (review only - not implemented)

## Finding

The parser is configured with `trimValues: true`, so a load-save cycle silently mutates content at the edges.
Verified with the shared core directly:

```
trailingNewlines   CHANGED: "line one\n\n"              -> "line one"
leadingSpaces      CHANGED: "    indented start\nend"   -> "indented start\nend"
windowsNewlines    CHANGED: "a\r\nb"                    -> "a\nb"
onlySpaces         CHANGED: "   "                       -> ""
```

On its own that is a (probably acceptable) normalization. The bug is that `hashContent` hashes the UN-normalized
text, so the approval invariant breaks on a no-op cycle. Reproduced end to end:

```
content typed in the editor: "my approved content\n"   (trailing newline - trivially common in a textarea)
approve (stores hash of the untrimmed text) -> save -> reload
state after reload: STALE, content preserved: false
```

The user approves, saves, reopens the file - and the card shows a yellow "Reapprove" with a hash-mismatch tooltip,
even though nobody changed anything. Every entry whose content starts or ends with whitespace (or uses CRLF - e.g.
written by an agent or editor on Windows) is permanently un-approvable in the same way: reapproving fixes it only
until the next reload if the textarea again holds edge whitespace... which it does not after reload (parse trimmed
it), so in practice it heals after ONE spurious reapprove per entry - still a trust-eroding false alarm on the
feature whose whole job is change detection.

## Suggested improvement

- Make the hash see exactly what survives the round trip: in `hashContent`, normalize first -
  `toText(spec.content).replaceAll('\r\n', '\n').trim()` - so approve-time and reload-time hashes agree by
  construction. This matches the parser's existing normalization instead of fighting it.
- Compatibility note: stored hashes for content WITHOUT edge whitespace are unchanged (trim/normalize is identity
  there); the only re-hashed entries are exactly the ones that today go spuriously stale - their stored approvals
  are already effectively broken, so this cannot make a healthy approval stale.
- Add the round-trip cases above to `vibraryXmlCore.test.js` (the existing idempotence suite is the natural home):
  parse(serialize(spec)) preserves `approvalState === 'current'` for content with trailing newline, CRLF, and
  leading indentation.

## Verification

- `node --run test` with the new cases; `node --run lint`, `node --run typecheck`.
- Manual check: type content ending with Enter, Approve, Save, reload the file - the card stays green "Approved".

## Risk

Low. One pure-function change plus tests; serialization bytes and parse behavior are untouched.
