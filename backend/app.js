import path from 'node:path';
import { fileURLToPath } from 'node:url';

import compression from 'compression';
import express from 'express';

import { createFilesRouter } from './routes/files.js';
import { createGitRouter } from './routes/git.js';
import { createSearchRouter } from './routes/search.js';
import { createSettingsRouter } from './routes/settings.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// The prebuilt frontend (shipped in the published package) lives in <packageRoot>/dist
const distributionDirectory = path.join(dirname, '..', 'dist');

const createApp = async function ({ cwd = process.cwd(), hmr = false } = {}) {
    const app = express();

    app.use(compression());
    app.use(express.json({ limit: '10mb' }));

    app.use('/api', createFilesRouter({ cwd }));
    app.use('/api', createGitRouter({ cwd }));
    app.use('/api', createSearchRouter({ cwd }));
    app.use('/api', createSettingsRouter({ cwd }));

    if (hmr) {
        // Dev-only: run Vite in middleware mode so a single server serves both /api and the frontend with HMR. Vite is a
        // devDependency, so import it lazily here - the published package never takes this branch.
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            configFile: path.join(dirname, '..', 'frontend', 'vite.config.ts'),
            server: { middlewareMode: true },
            appType: 'spa'
        });
        // Vite's middleware transforms/serves the frontend and provides the SPA fallback (and HMR client) itself
        app.use(vite.middlewares);
    } else {
        app.use(express.static(distributionDirectory));

        // SPA fallback: serve index.html for any non-API GET that did not match a static asset
        app.get(/.*/, function (request, response) {
            response.sendFile(path.join(distributionDirectory, 'index.html'));
        });
    }

    return app;
};

export { createApp };
