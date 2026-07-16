// Tests the public entry point (index.js, the thin re-export over lib/). The unit itself is
// covered by the colocated lib/template.test.js. Replace alongside the stub (conventions:
// .claude/rules/testing.md).

import {
    describe,
    expect,
    it
} from 'vitest';

import { templateJavascriptProject } from '../index.js';

describe('templateJavascriptProject', function () {
    it('should default to greeting the world', function () {
        expect(templateJavascriptProject()).toBe('Hello, world!');
    });

    it('should greet the provided name', function () {
        expect(templateJavascriptProject('Ada')).toBe('Hello, Ada!');
    });
});
