#!/usr/bin/env node

/* eslint-disable n/no-process-exit */

// Applies remediations for file status expectations (read-only paths, etc.).
// Rules: status-of-files.config.ts
//
// Usage:
//     $ ./ensure-status-of-files.ts

import fs from 'node:fs';
import path from 'node:path';

import { readOnlyPaths } from './status-of-files.config.ts';

const __dirname = import.meta.dirname;
const projectRoot = path.resolve(__dirname, '..', '..', '..');

for (const relativePath of readOnlyPaths) {
    const absPath = path.join(projectRoot, relativePath);
    try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile()) {
            continue;
        }
        /* eslint-disable no-bitwise -- mask Unix permission bits (same as chmod a-w) */
        const mode = stat.mode & 0o777;
        if (mode & 0o222) {
            fs.chmodSync(absPath, mode & ~0o222);
        }
        /* eslint-enable no-bitwise */
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
            continue;
        }
    }
}

process.exit(0);
