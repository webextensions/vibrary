import { createApp } from '../app.js';

// Shared plumbing for the route integration tests: boot a real app on an ephemeral port against a scratch folder,
// plus a tiny JSON client answering { status, body }. The envelope's `output` is typed loosely on purpose - each
// test pins exactly the parts it cares about. Not a test file itself (no .test suffix), so the runner never executes
// it directly.
const startAppAsync = async function (cwd) {
    const app = await createApp({ cwd });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(function (resolve) {
        server.on('listening', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;

    const requestJsonAsync = async function (route, init) {
        const response = await fetch(`${base}${route}`, init);
        const body = /** @type {{ status: string, output: any, errorMessage?: string }} */ (await response.json());
        return { status: response.status, body };
    };

    const sendJsonAsync = function (route, payload, method = 'POST') {
        return requestJsonAsync(route, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    };

    return { server, requestJsonAsync, sendJsonAsync };
};

export { startAppAsync };
