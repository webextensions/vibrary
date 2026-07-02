// Wire a client disconnect to an AbortController so a long-running "claude -p" child is killed when the browser
// aborts its fetch (the user cancels the run, or refreshes the page). We listen on the RESPONSE, not the request:
// Express consumes the request body up front and Node then closes the request stream, so request 'close' fires
// immediately - long before the client actually leaves. Response 'close' fires only when the connection ends; the
// writableEnded guard distinguishes a normal completion (already ended) from a premature client disconnect.
const abortOnDisconnect = function (request, response) {
    const controller = new AbortController();
    response.on('close', function () {
        if (!response.writableEnded) {
            controller.abort();
        }
    });
    return controller;
};

export { abortOnDisconnect };
