import { defineConfig } from 'vitest/config';

// eslint-disable-next-line import-x/no-default-export
export default defineConfig({
    test: {
        // Tests live in two homes (see .claude/rules/testing.md): colocated next to the source
        // for simple, self-contained units, and under test/ when grouping fits better. This glob
        // discovers both; vitest's default excludes keep node_modules etc. out.
        include: ['**/*.test.{js,ts}'],
        reporters: ['verbose']
    }
});
