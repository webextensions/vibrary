// Tests the public entry point (index.js, the thin re-export over lib/). The unit itself is
// covered by the colocated lib/template.test.js. Replace alongside the stub (conventions:
// .claude/rules/testing.md).

import {
    describe,
    expect,
    it
} from 'vitest';

import { templateNpmPackage } from '../index.js';

describe('templateNpmPackage', function () {
    it('should default to greeting the world', function () {
        expect(templateNpmPackage()).toBe('Hello, world!');
    });

    it('should greet the provided name', function () {
        expect(templateNpmPackage('Ada')).toBe('Hello, Ada!');
    });
});
