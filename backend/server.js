import getPort, { portNumbers } from 'get-port';
import open from 'open';

import { createApp } from './app.js';

const startServer = async function ({ port = 3000, open: shouldOpen = true, cwd = process.cwd() } = {}) {
    const app = createApp({ cwd });

    // Honor the requested port, advancing to the next free one (up to 65535) if it is busy
    const resolvedPort = await getPort({ port: portNumbers(port, 65535) });

    return new Promise(function (resolve) {
        const server = app.listen(resolvedPort, function () {
            const url = `http://localhost:${resolvedPort}/`;

            console.log(`truths-server running at ${url} (serving ${cwd})`);

            if (shouldOpen) {
                open(url);
            }

            resolve({ server, port: resolvedPort, url });
        });
    });
};

export { startServer };
