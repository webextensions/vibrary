import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseMessage } from './runClaudeCommitMessage.js';

// parseMessage splits the model's stdout into the { summary, body } the commit box consumes. It is the load-bearing
// step (a regression would garble every AI-drafted commit), so pin its edges: the summary is the first non-empty line,
// the body is everything after it (blank separators collapsed), CRLF is normalized, and degenerate inputs stay safe.

test('splits summary from body, collapsing the blank separator', function () {
    assert.deepEqual(
        parseMessage('Add the widget\n\nIt does the thing.\n- and this'),
        { summary: 'Add the widget', body: 'It does the thing.\n- and this' }
    );
});

test('a single line is all summary, no body', function () {
    assert.deepEqual(parseMessage('Fix the typo'), { summary: 'Fix the typo', body: '' });
});

test('normalizes CRLF and strips leading/trailing blank lines', function () {
    assert.deepEqual(parseMessage('\r\n\r\nSummary\r\n\r\nBody line\r\n'), { summary: 'Summary', body: 'Body line' });
});

test('a body directly after the summary (no blank line) still splits', function () {
    assert.deepEqual(parseMessage('Summary\nBody'), { summary: 'Summary', body: 'Body' });
});

test('empty or whitespace-only stdout yields empty summary and body', function () {
    assert.deepEqual(parseMessage(''), { summary: '', body: '' });
    assert.deepEqual(parseMessage('   \n  \n'), { summary: '', body: '' });
});
