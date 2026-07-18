// The Elo mechanics behind the rankings feature: pure, framework-free functions with no I/O. The design premise
// (documented in docs/rankings.md) is that the recorded MATCHES are the source of truth and ratings are never stored:
// standings are recomputed by replaying the kept match records in played order. That makes "discard some results and
// recompute" trivially correct - remove the records, replay the rest - instead of trying to un-apply rating deltas.

const BASE_RATING = 1500;

// Classic chess K-factor: large enough that a handful of comparisons visibly reorders a small idea backlog, small
// enough that one AI misjudgment does not bury an entry.
const K_FACTOR = 32;

// The probability the first side wins under the Elo model: 1 / (1 + 10^((opponent - own) / 400)). Equal ratings give
// 0.5; a 400-point edge gives about 0.91.
const expectedScore = function (rating, opponentRating) {
    return 1 / (1 + (10 ** ((opponentRating - rating) / 400)));
};

// One unordered-pair key, so "a vs b" and "b vs a" count as the same meeting.
const pairKey = function (firstTitle, secondTitle) {
    return [firstTitle, secondTitle].toSorted(function (a, b) { return a.localeCompare(b); }).join(' ');
};

// Replays `matches` into standings. Every title in `titles` (and any title a match mentions) is seeded at the base
// rating, so entries that have never competed still appear - at 1500 with no games - rather than popping into
// existence on their first match. Matches are applied in playedAt order (ISO timestamps compare lexicographically),
// with the stored order as the tie-break, so the result is deterministic regardless of how the store happens to order
// records. A match whose winnerTitle is not one of its two contenders is skipped rather than crashing the replay: the
// store validates on write, but the file is user-editable JSON and one bad record must not take the whole board down.
// Returns { title, rating, wins, losses, games } sorted by rating (descending), then title, with ratings rounded for
// display only - the replay itself runs on unrounded values so ordering never depends on when rounding happened.
const replayMatches = function (matches, titles = []) {
    const ratings = new Map();
    const records = new Map();
    const seed = function (title) {
        if (ratings.has(title)) {
            return;
        }
        ratings.set(title, BASE_RATING);
        records.set(title, { wins: 0, losses: 0 });
    };
    for (const title of titles) {
        seed(title);
    }
    const ordered = matches
        .map(function (match, index) { return { match, index }; })
        .toSorted(function (a, b) {
            const byTime = String(a.match.playedAt).localeCompare(String(b.match.playedAt));
            return byTime === 0 ? a.index - b.index : byTime;
        });
    for (const { match } of ordered) {
        const { firstTitle, secondTitle, winnerTitle } = match;
        if (winnerTitle !== firstTitle && winnerTitle !== secondTitle) {
            continue;
        }
        seed(firstTitle);
        seed(secondTitle);
        const loserTitle = winnerTitle === firstTitle ? secondTitle : firstTitle;
        const winnerRating = ratings.get(winnerTitle);
        const loserRating = ratings.get(loserTitle);
        const exchanged = K_FACTOR * (1 - expectedScore(winnerRating, loserRating));
        ratings.set(winnerTitle, winnerRating + exchanged);
        ratings.set(loserTitle, loserRating - exchanged);
        records.get(winnerTitle).wins += 1;
        records.get(loserTitle).losses += 1;
    }
    const standings = [];
    for (const [title, rating] of ratings) {
        const { wins, losses } = records.get(title);
        standings.push({ title, rating: Math.round(rating), wins, losses, games: wins + losses });
    }
    return standings.toSorted(function (a, b) {
        return a.rating === b.rating ? a.title.localeCompare(b.title) : b.rating - a.rating;
    });
};

// Picks `count` pairings for the next competitions, preferring the pairs that have met the fewest times (counting
// both the already-recorded matches and the pairs picked earlier in this same batch, so one batch spreads across the
// backlog instead of rematching the same two entries). Ties are broken by `random` - injectable so tests are
// deterministic - over the tied pairs in a fixed traversal order. With fewer than two titles there is nothing to
// pair; a count larger than the number of distinct pairs simply wraps around to rematches, which is the right
// behavior for a long-running board.
const selectLeastMetPairings = function (titles, matches, count, random = Math.random) {
    if (titles.length < 2 || count < 1) {
        return [];
    }
    const meetings = new Map();
    for (const match of matches) {
        const key = pairKey(match.firstTitle, match.secondTitle);
        meetings.set(key, (meetings.get(key) ?? 0) + 1);
    }
    const pairings = [];
    for (let picked = 0; picked < count; picked += 1) {
        let leastMet = Infinity;
        let candidates = [];
        for (let firstIndex = 0; firstIndex < titles.length - 1; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < titles.length; secondIndex += 1) {
                const pair = [titles[firstIndex], titles[secondIndex]];
                const met = meetings.get(pairKey(...pair)) ?? 0;
                if (met < leastMet) {
                    leastMet = met;
                    candidates = [pair];
                } else if (met === leastMet) {
                    candidates.push(pair);
                }
            }
        }
        const chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        pairings.push(chosen);
        const key = pairKey(...chosen);
        meetings.set(key, (meetings.get(key) ?? 0) + 1);
    }
    return pairings;
};

export { BASE_RATING, expectedScore, K_FACTOR, replayMatches, selectLeastMetPairings };
