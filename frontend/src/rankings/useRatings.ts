import { useEffect, useState } from 'react';

import { getRankings } from '../api.ts';

// Title -> replayed Elo rating for the editor's decoration (card badges, the rating sort). Deliberately EMPTY until
// the folder has at least one recorded match: with an empty log every entry sits at the 1500 base, and stamping
// "1500" on every card would be pure noise in folders that never use the Rankings view. Fetched once per mount (the
// editor remounts per file); a failure leaves the map empty - ratings are decoration here, and the Rankings view is
// where a rankings problem gets surfaced properly.
const useRatings = function (): Map<string, number> {
    const [ratings, setRatings] = useState<Map<string, number>>(function () {
        return new Map();
    });
    useEffect(function () {
        let isActive = true;
        const load = async function () {
            try {
                const payload = await getRankings();
                if (isActive && payload.matches.length > 0) {
                    setRatings(new Map(payload.standings.map(function (row) {
                        return [row.title, row.rating] as const;
                    })));
                }
            } catch {
                // See above: decoration only.
            }
        };
        void load();
        return function () {
            isActive = false;
        };
    }, []);
    return ratings;
};

export { useRatings };
