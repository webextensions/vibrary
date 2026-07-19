# Rankings

The Rankings view (the trophy icon in the navigation rail) Elo-ranks the folder's entries from recorded head-to-head
results, so a pile of ideas becomes an ordered backlog without anyone having to rank fifty things in their head at
once. You record verdicts two ways - your own comparisons, or batches judged by the AI - and every verdict is a plain
record you can inspect, override, or discard.

## How the ranking works

- Every recorded result is a match record: the two entry titles, the winner, when it was played, who judged it (`AI`
  or `Human`), and the judge's rationale. The records are the SOURCE OF TRUTH - ratings are never stored anywhere.
- Standings are recomputed by replaying the kept records in played order, chess-style: every entry starts at 1500,
  the winner of each match takes points from the loser (K-factor 32), and beating a higher-rated entry earns more
  than beating a lower-rated one.
- Because standings are a pure replay, discarding any records and recomputing is exact: remove the records, replay
  the rest. There is no drift to undo and no cached rating to correct - "undo a bad verdict" IS discarding it.
- Records live in a `vibrary-rankings.json` at the folder root, a peer of your vibrary XML files. It is ordinary
  project data: commit it if you want the rankings shared with the folder, ignore it if you want them local.

## The view

- **Standings** - rank, title, rating, and win-loss record per entry in scope. A row's title jumps to its entry in
  the editor. Until the first result is recorded, everything sits at 1500.
- **Compare** - the manual voting mode: two entries side by side (the least-compared pair first), each with its
  content. Click a card's Wins button, or use the arrow keys (left/up picks the first card, right/down the second)
  to triage a backlog in a quick keyboard run; Skip advances to another pair without recording. Each verdict is
  recorded as a Human-judged match and the standings update live.
- **Scope** - which entries compete: any mix of entry types (ideas by default) and, optionally, only entries
  carrying one of the chosen labels. The choice is remembered across reloads. Standings and pairings consider only
  matches whose contenders are BOTH currently in scope; results recorded outside the scope stay stored and listed -
  they simply sit out until the scope covers them again.
- **Match history** - every recorded result, newest first, with the judge, the time, and the rationale behind an AI
  verdict. Discard one result, the checked selection, or the whole log - each asks first, and the standings
  recompute exactly. A result whose entry was renamed or removed is flagged (it sits out of the standings) rather
  than silently dropped; repairing the title brings its history straight back.

## AI competitions

**Run AI competitions** (the sparkle button) queues a batch of AI-judged matchups through the activity monitor - one
job, pausable and abortable like every other agent action. Pick how many matchups and, optionally, one-time judging
guidance (for example "favor quick wins over long-term bets"). The AI weighs each least-compared pair and answers
with a winner and a one-paragraph rationale; each verdict is recorded the moment it settles, so aborting a batch
keeps the verdicts already earned. The job's transcript shows every matchup as it completes - including, behind each
"Match N" bubble's Full view, the exact prompt the judge was sent.

An AI verdict is never final: outvote it with your own comparisons, or discard it from the match history.

### Customizing the judge

The judge's prompt is a per-project template, edited in the activity monitor's Settings popover. The template
replaces the built-in judging framing; `{{entryA}}` and `{{entryB}}` insert the two contenders (title, content,
notes) and `{{instructions}}` inserts the per-run judging guidance. The JSON answer format is always appended
regardless of the template, so verdicts stay machine-readable. Leave the template empty (or reset it) to use the
built-in prompt. Like every agent action, competition runs execute with permission prompts disabled - see "Agent
runs and permissions" in [README.md](README.md).

## Ratings in the editor

Once a folder has recorded results, ranked entries show their rating as a chip beside their title in the editor, and
the editor's Sort control gains a **Rating** order (highest first, view-only like the other sorts). Both stay
dormant in folders that never use the Rankings view.
