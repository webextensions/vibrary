# The schema-file route's directory-scoped include gate

`GET /schema-file/:name` ([backend/files/files.js](../../../backend/files/files.js)) serves a `*.xml.schemas.json`
sidecar only when at least one INCLUDED vibrary file lives in the sidecar's directory. Otherwise it answers 404, the
same shape as a missing file.

## Why by directory, not by parent name

The obvious gate - strip `.schemas.json` and require THAT vibrary name to be included - is wrong: a `formSchemaRef`
names an arbitrary sidecar resolved against the referencing ENTRY's directory, and nothing requires the sidecar's
nominal parent to exist or be included (an included `tasks-foo.xml` may legitimately reference
`tasks.xml.schemas.json` while no `tasks.xml` matches the include patterns). The directory gate matches how sidecars
are actually consumed - always from an entry in a same-directory included file - so it cannot break a legitimate
reference, while an excluded folder's schema contents (field names, enum values, descriptions, defaults) stop being
readable through the API.

## Why gate at all

`.vibraryinclude` is documented as gating everything, and this route was the one silent carve-out: excluding
`specs-private.xml` did not exclude `specs-private.xml.schemas.json`, whose contents routinely leak the domain
information the include file was configured to hide. The cost is one listing call per schema read, and schema reads
happen only on file load.

## Tests

[backend/files/files.test.js](../../../backend/files/files.test.js) pins both directions: a sidecar alone in a folder
with no included file answers 404, and a sidecar next to an included file is served even though its nominal parent
(`tasks.xml`) does not exist.
