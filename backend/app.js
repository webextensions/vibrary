import path from 'node:path';
import { fileURLToPath } from 'node:url';

import compression from 'compression';
import express from 'express';

import { createFilesRouter } from './routes/files.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// The prebuilt frontend (shipped in the published package) lives in <packageRoot>/dist
const distributionDirectory = path.join(dirname, '..', 'dist');

const createApp = function ({ cwd = process.cwd() } = {}) {
    const app = express();

    app.use(compression());
    app.use(express.json({ limit: '10mb' }));

    app.use('/api', createFilesRouter({ cwd }));

    app.use(express.static(distributionDirectory));

    // SPA fallback: serve index.html for any non-API GET that did not match a static asset
    app.get(/.*/, function (request, response) {
        response.sendFile(path.join(distributionDirectory, 'index.html'));
    });

    return app;
};

export { createApp };
