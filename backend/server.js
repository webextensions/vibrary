import getPort, { portNumbers } from 'get-port';
import open from 'open';

import { createApp } from './app.js';

// The default bind is loopback: the API is unauthenticated and its agent routes execute commands (with permission
// prompts disabled), so exposing it must be an explicit choice - `--host 0.0.0.0` for the LAN/phone case - not a side
// effect of starting the server on a shared network. Matches how comparable local dev tools (vite, jupyter) bind.
const startServer = async function ({ port = 3000, host = '127.0.0.1', open: shouldOpen = true, cwd = process.cwd(), hmr = false } = {}) {
    const app = await createApp({ cwd, hmr });

    // Honor the requested port, advancing to the next free one (up to 65535) if it is busy on the requested host
    const resolvedPort = await getPort({ port: portNumbers(port, 65535), host });

    return new Promise(function (resolve, reject) {
        const server = app.listen(resolvedPort, host, async function () {
            const url = `http://localhost:${resolvedPort}/`;

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
