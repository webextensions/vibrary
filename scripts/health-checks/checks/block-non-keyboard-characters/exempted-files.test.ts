// Tests the exemption layer of the non-keyboard-character tooling: the pure last-match-wins glob
// evaluation and the hard-coded invariants (exempted-files.ts), plus the suppressions-file shape
// validation (suppressions-file.ts). Uses ASCII-only fixtures so this file never trips the guard.

import {
    describe,
    expect,
    it
} from 'vitest';

import {
    evaluateExemptions,
    isExemptFromGuard
} from './exempted-files.ts';
import { parseSuppressionsFileData } from './suppressions-file.ts';

describe('evaluateExemptions', function () {
    it('should exempt a whole subtree via "dir/**"', function () {
        const entries = [{ pattern: 'docs/vendored/**' }];
        expect(evaluateExemptions(entries, 'docs/vendored/a/b.md').exempt).toBe(true);
        expect(evaluateExemptions(entries, 'docs/other.md').exempt).toBe(false);
    });

    it('should re-include a deep file with a single "!" entry', function () {
        const entries = [
            { pattern: 'docs/vendored/**' },
            { pattern: '!docs/vendored/keep/notes.md' }
        ];
        expect(evaluateExemptions(entries, 'docs/vendored/a/b.md').exempt).toBe(true);
        expect(evaluateExemptions(entries, 'docs/vendored/keep/notes.md').exempt).toBe(false);
    });

    it('should let the last matching entry win', function () {
        const reExempted = [
            { pattern: 'docs/**' },
            { pattern: '!docs/x.md' },
            { pattern: 'docs/x.md' }
        ];
        expect(evaluateExemptions(reExempted, 'docs/x.md').exempt).toBe(true);

        const reIncluded = [
            { pattern: 'docs/x.md' },
            { pattern: '!docs/x.md' },
            { pattern: 'docs/**' }
        ];
        expect(evaluateExemptions(reIncluded, 'docs/x.md').exempt).toBe(true);
    });

    it('should not exempt when no entry matches', function () {
        expect(evaluateExemptions([{ pattern: 'docs/**' }], 'lib/template.js')).toEqual({
            exempt: false,
            skipInCensus: false
        });
    });

    it('should default skipInCensus to true and honor an explicit false', function () {
        expect(evaluateExemptions([{ pattern: 'CHANGELOG.md' }], 'CHANGELOG.md').skipInCensus).toBe(true);
        expect(evaluateExemptions(
            [{ pattern: 'CHANGELOG.md', skipInCensus: false }],
            'CHANGELOG.md'
        )).toEqual({ exempt: true, skipInCensus: false });
    });
});

describe('isExemptFromGuard', function () {
    it('should keep the suppressions file and characters.ts exempt as hard-coded invariants', function () {
        expect(isExemptFromGuard('.block-non-keyboard-characters.suppressions.json')).toBe(true);
        expect(isExemptFromGuard('scripts/health-checks/checks/block-non-keyboard-characters/characters.ts')).toBe(true);
    });
});

describe('parseSuppressionsFileData', function () {
    it('should parse both sections and default absent ones to empty', function () {
        expect(parseSuppressionsFileData({
            baseline: { 'docs/x.md': { x: 2 } },
            exemptions: [{ pattern: 'CHANGELOG.md', reason: 'generated', skipInCensus: false }]
        })).toEqual({
            baseline: { 'docs/x.md': { x: 2 } },
            exemptions: [{ pattern: 'CHANGELOG.md', reason: 'generated', skipInCensus: false }]
        });
        expect(parseSuppressionsFileData({})).toEqual({ baseline: {}, exemptions: [] });
    });

    it('should reject the retired flat counts-only format', function () {
        expect(function () {
            parseSuppressionsFileData({ 'docs/x.md': { x: 2 } });
        }).toThrow(/unrecognized top-level key "docs\/x\.md"/);
    });

    it('should reject a non-object document', function () {
        expect(function () {
            parseSuppressionsFileData([]);
        }).toThrow(/must be a JSON object/);
    });

    it('should reject an entry with an unknown key', function () {
        expect(function () {
            parseSuppressionsFileData({ exemptions: [{ pattern: 'CHANGELOG.md', skipCensus: true }] });
        }).toThrow(/unknown key "skipCensus"/);
    });

    it('should reject a pattern ending with "/"', function () {
        expect(function () {
            parseSuppressionsFileData({ exemptions: [{ pattern: 'docs/vendored/' }] });
        }).toThrow(/use "docs\/vendored\/\*\*"/);
    });

    it('should reject a missing or empty pattern', function () {
        expect(function () {
            parseSuppressionsFileData({ exemptions: [{ reason: 'no pattern' }] });
        }).toThrow(/non-empty string "pattern"/);
        expect(function () {
            parseSuppressionsFileData({ exemptions: [{ pattern: '!' }] });
        }).toThrow(/non-empty string "pattern"/);
    });
});
