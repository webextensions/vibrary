import path from 'node:path';
import { fileURLToPath } from 'node:url';

import compression from 'compression';
import express from 'express';

import { createFilesRouter } from './routes/files.js';
import { createGitRouter } from './routes/git.js';
import { createSearchRouter } from './routes/search.js';
import { createSettingsRouter } from './routes/settings.js';
import { sendErrorResponse } from './utils/sendResponse.js';

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

    // Unmatched API paths answer with the JSON error envelope, registered before the frontend fallbacks so a typo'd
    // or removed endpoint can never fall through to index.html - a 200 of HTML where JSON was expected reads as a
    // parser error in the client and hides the actual mistake. Applies identically in dev (Vite) and production.
    app.use('/api', function (request, response) {
        return sendErrorResponse(response, 404, 'Unknown API endpoint');
    });

    // Convert any error that escapes a route - express.json's body-parse SyntaxError, or a rejected await outside a
    // route's try (Express 5 forwards those here) - into the API's JSON error envelope. Without this, Express's
    // default handler answers with an HTML error page, which the client's JSON parsing reports as "Request failed"
    // and hides the real problem. Client-caused errors (4xx, e.g. a malformed body) pass their message through;
    // everything else is logged here and kept generic for the client.
    app.use('/api', function (error, request, response, next) {
        if (response.headersSent) {
            return next(error);
        }
        const statusCode = typeof error.status === 'number' ? error.status : 500;
        if (statusCode >= 500) {
            console.error(`Unhandled error in ${request.method} ${request.originalUrl}:`, error);
            return sendErrorResponse(response, statusCode, 'Internal server error');
        }
        return sendErrorResponse(response, statusCode, error.message);
    });

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
