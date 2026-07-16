// Tests the placeholder entry point (index.js). Like index.js itself, template branches / forks
// replace this file wholesale with tests for their real public API (conventions:
// .claude/rules/testing.md).

import {
    describe,
    expect,
    it
} from 'vitest';

import { abstractNpmPackage } from '../index.js';

describe('abstractNpmPackage', function () {
    it('should expose the placeholder named export', function () {
        expect(abstractNpmPackage()).toBe('abstract-npm-package base template');
    });
});
