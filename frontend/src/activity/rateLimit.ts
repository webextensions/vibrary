// Whether a failed run's error text looks like a rate/usage limit rather than a real failure. Heuristic by nature -
// the CLI surfaces provider messages as prose, not codes - so the patterns cover the shapes Anthropic's tooling
// actually emits ("rate limit", "usage limit reached", HTTP 429, "overloaded"). A false negative just means the
// user retries by hand; a false positive only decorates the row and offers a delayed retry, so erring slightly
// broad is safe.
const RATE_LIMIT_PATTERN = /rate.?limit|usage limit|too many requests|overloaded|\b429\b/i;

const isRateLimitError = function (message: string | null): boolean {
    return message !== null && RATE_LIMIT_PATTERN.test(message);
};

export { isRateLimitError };
