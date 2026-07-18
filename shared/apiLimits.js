// API bounds enforced by the backend AND mirrored in the frontend's inputs, kept in one isomorphic module so the two
// sides can never drift: a stale frontend copy either lets the user submit requests the server 400s, or silently
// hides capacity the server would accept. Ships in the npm tarball (see package.json "files") because the backend
// imports it at runtime - a new shared module here needs its own "files" entry, which the packaged-tarball smoke test
// guards.

// Upper bound on entries generated in one AI request, guarding against a runaway agent run. Drives the create
// dialog's number-input max and the /generate route's 400.
const MAX_GENERATE_COUNT = 50;

// Floor on search-query length: a one-character query is too broad to be useful and scans every included file for
// nothing. The SearchPanel skips the round trip below it; the search route answers empty for the same reason.
const MIN_QUERY_LENGTH = 2;

export { MAX_GENERATE_COUNT, MIN_QUERY_LENGTH };
