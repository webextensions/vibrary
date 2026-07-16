// Colocated unit test for the lib/template.js stub. The public entry point is exercised
// separately by test/index.test.js. Replace alongside the stub (conventions:
// .claude/rules/testing.md). Kept out of the published tarball by the "!**/*.test.*"
// negation in package.json.ts's "files".

import {
    describe,
    expect,
    it
} from 'vitest';

import { templateJavascriptProject } from './template.js';

describe('templateJavascriptProject (lib/template.js)', function () {
    it('should default to greeting the world', function () {
        expect(templateJavascriptProject()).toBe('Hello, world!');
    });

    it('should greet the provided name', function () {
        expect(templateJavascriptProject('Ada')).toBe('Hello, Ada!');
    });
});
