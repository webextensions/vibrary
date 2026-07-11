import getPort, { portNumbers } from 'get-port';
import open from 'open';

import { createApp } from './app.js';
import { terminateActiveClaudeRunsAsync } from './shared/spawnClaude.js';

// The default bind is loopback: the API is unauthenticated and its agent routes execute commands (with permission
// prompts disabled), so exposing it must be an explicit choice - `--host 0.0.0.0` for the LAN/phone case - not a side
// effect of starting the server on a shared network. Matches how comparable local dev tools (vite, jupyter) bind.
const startServer = async function ({ port = 3000, host = '127.0.0.1', open: shouldOpen = true, cwd = process.cwd(), hmr = false } = {}) {
    const app = await createApp({ cwd, hmr });

    // Honor the requested port, advancing to the next free one (up to 65535) if it is busy on the requested host
    const resolvedPort = await getPort({ port: portNumbers(port, 65535), host });

    // Graceful shutdown: agent children run as detached process-group leaders (see spawnClaude.js), so they would
    // survive this process's death and keep editing the served folder with nobody watching. On the first
    // SIGINT/SIGTERM stop accepting connections and kill every live agent group, then RE-RAISE the signal: the
    // handlers are registered `once`, so the re-raise (and a second Ctrl+C from an impatient user) falls through to
    // Node's default handling and terminates with the conventional 128+signal status. The unref'd failsafe re-raise
    // covers a wedged child keeping terminateActiveClaudeRunsAsync from resolving.
    const shutdownAsync = async function (signalName) {
        console.log(`\n${signalName} received, shutting down (stopping agent runs)...`);
        setTimeout(function () {
            process.kill(process.pid, signalName);
        }, 10 * 1000).unref();
        await terminateActiveClaudeRunsAsync();
        process.kill(process.pid, signalName);
    };

    return new Promise(function (resolve, reject) {
        const server = app.listen(resolvedPort, host, async function () {
            const url = `http://localhost:${resolvedPort}/`;

            process.once('SIGINT', function () {
                server.close();
                void shutdownAsync('SIGINT');
            });
            process.once('SIGTERM', function () {
                server.close();
                void shutdownAsync('SIGTERM');
            });

            // Name the bind address so the exposure state is visible at a glance in the startup line.
            console.log(`vibrary-server running at ${url} (bound to ${host}, serving ${cwd})`);

            if (shouldOpen) {
                // The server is already up; a failed browser launch (e.g. headless environment) should not crash it.
                try {
                    await open(url);
                } catch {
                    console.error(`Could not open the browser automatically; visit ${url} yourself.`);
                }
            }

            resolve({ server, port: resolvedPort, url });
        });

        // Without this, a failed bind (e.g. losing a race for the port get-port said was free) crashes the process
        // as an unhandled 'error' event and leaves this promise pending forever; reject instead so callers can
        // report the failure and exit cleanly. Node's own message already names the address and port.
        server.on('error', reject);
    });
};

export { startServer };
