# runBufferedAgentAsync - the buffered run recipe

`runBufferedAgentAsync` in [backend/shared/spawnClaude.js](../../../backend/shared/spawnClaude.js) is the buffered
sibling of `runStreamedAgentAsync`: `claude -p <prompt> --dangerously-skip-permissions`, no stream-json flags, the
full stdout as the result. The two quick prompt-only helpers use it - the title generator (`runClaudeTitle.js`) and
the commit-message drafter (`runClaudeCommitMessage.js`).

## Why

CLAUDE.md's invariant reads "every agent invocation runs with `--dangerously-skip-permissions`", but the two buffered
helpers used to build their own argv WITHOUT the flag, making the documented claim false. The rationale for the flag
applies to them just as much: they are prompt-only tasks, but if the model decides to read a file anyway (models do
explore), a permission-gated tool call would stall until the timeout and surface as "Deriving the title timed out" -
an error that hides its real cause. Routing them through a shared recipe makes the CLAUDE.md sentence true again and
gives the "run recipe lives ONCE" principle a single home for buffered runs too.

## Contract

- Streamed runs: `runStreamedAgentAsync` (prompt echo, stream-json flags, the skip-permissions flag).
- Buffered runs: `runBufferedAgentAsync` (plain `-p`, the skip-permissions flag).
- New agent actions must use one of the two; flags and timeout policy change in `spawnClaude.js`, never per action.
