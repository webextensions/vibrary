// Sanity test for the abstract base template branch. This branch ships no runnable source code
// (template branches / forks add their own under their preferred layout), so this trivial test
// exists to keep the Vitest tooling exercised and to demonstrate the test/*.test.js convention.
// Replace it with real tests in your project.

import {
    describe,
    expect,
    it
} from 'vitest';

describe('sanity', () => {
    it('runs the test tooling', () => {
        expect(1 + 1).toBe(2);
    });
});
