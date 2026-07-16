import path from 'node:path';

import markdown from '@eslint/markdown';
import { Linter } from 'eslint';
import {
    describe,
    expect,
    it
} from 'vitest';

import { markdownRelativeLinks } from './markdown-relative-links.js';

const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const config = /** @type {import('eslint').Linter.Config} */ ({
    files: ['**/*.md'],
    plugins: {
        markdown,
        local: {
            rules: {
                'markdown-relative-links': markdownRelativeLinks
            }
        }
    },
    language: 'markdown/gfm',
    rules: {
        'local/markdown-relative-links': 'error'
    }
});

// Lint a markdown string as if it lived at a VIRTUAL path inside the repo (the file itself never
// exists on disk - a real broken-link fixture .md would fail the eslint:markdown health check).
const lintMarkdown = function (text, { filePath = path.join(projectRoot, 'virtual-fixture.md') } = {}) {
    const linter = new Linter({ cwd: projectRoot });
    return linter.verify(text, config, filePath);
};

describe('markdown-relative-links', function () {
    it('should accept a relative link to an existing file', function () {
        const messages = lintMarkdown('[docs index](docs/README.md)');
        expect(messages).toEqual([]);
    });

    it('should accept a relative link to an existing directory', function () {
        const messages = lintMarkdown('[docs](docs/)');
        expect(messages).toEqual([]);
    });

    it('should accept a parent-relative link from a nested virtual file', function () {
        const messages = lintMarkdown('[conventions](../template-project/file-conventions.md)', {
            filePath: path.join(projectRoot, 'docs', 'development', 'virtual-fixture.md')
        });
        expect(messages).toEqual([]);
    });

    it('should accept a root-relative link (resolved from the repo root)', function () {
        const messages = lintMarkdown('[readme](/docs/README.md)');
        expect(messages).toEqual([]);
    });

    it('should ignore external URLs, mailto, protocol-relative, and fragment-only links', function () {
        const messages = lintMarkdown([
            '[web](https://example.com/no-such-page)',
            '[mail](mailto:someone@example.com)',
            '[protocol relative](//example.com/x)',
            '[same-file anchor](#some-heading)'
        ].join('\n\n'));
        expect(messages).toEqual([]);
    });

    it('should strip "#fragment" and "?query" before resolving', function () {
        const messages = lintMarkdown('[a](docs/README.md#some-heading) [b](docs/README.md?x=1)');
        expect(messages).toEqual([]);
    });

    it('should report a relative link to a missing file', function () {
        const messages = lintMarkdown('[broken](does-not-exist.md)');
        expect(messages).toHaveLength(1);
        expect(messages[0].ruleId).toBe('local/markdown-relative-links');
        expect(messages[0].message).toContain('does-not-exist.md');
    });

    it('should report a missing image target', function () {
        const messages = lintMarkdown('![logo](images/missing-logo.png)');
        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain('images/missing-logo.png');
    });

    it('should report a missing link-definition target', function () {
        const messages = lintMarkdown('[text][ref]\n\n[ref]: missing/definition-target.md');
        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain('missing/definition-target.md');
    });

    it('should resolve percent-encoded targets', function () {
        const messages = lintMarkdown('[readme](docs/README%2Emd)');
        expect(messages).toEqual([]);
    });
});
