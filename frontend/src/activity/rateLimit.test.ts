import assert from 'node:assert/strict';
import test from 'node:test';

import { isRateLimitError } from './rateLimit.ts';

// The detector behind the "rate limited" row hint and its delayed retry: broad enough for the provider's prose
// shapes, but never matching an ordinary failure.

test('recognizes the provider limit shapes', function () {
    assert.equal(isRateLimitError('API Error: 429 {"error":{"type":"rate_limit_error"}}'), true);
    assert.equal(isRateLimitError('Claude AI usage limit reached|1234567890'), true);
    assert.equal(isRateLimitError('Rate limit exceeded, please slow down'), true);
    assert.equal(isRateLimitError('Overloaded, try again later'), true);
    assert.equal(isRateLimitError('too many requests'), true);
});

test('ordinary failures and missing errors stay unflagged', function () {
    assert.equal(isRateLimitError(null), false);
    assert.equal(isRateLimitError('Claude CLI not found on PATH'), false);
    assert.equal(isRateLimitError('Applying 1 spec timed out after 12 minutes'), false);
    // "1429" is a number, not the HTTP status - the \b guards keep it unmatched.
    assert.equal(isRateLimitError('exit code 1429'), false);
});
