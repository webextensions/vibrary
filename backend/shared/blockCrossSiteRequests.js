import net from 'node:net';

import { sendErrorResponse } from './sendResponse.js';

// The API is unauthenticated and its agent routes execute `claude -p ... --dangerously-skip-permissions` in the served
// folder, so the browser itself is an attack path: any web page the user happens to visit can fire a cross-origin POST
// at http://localhost:<port>/api/... (the response is CORS-blocked, but the side effect - an agent editing files - is
// not), and DNS rebinding lets a page's own origin resolve to this machine, making even reads same-origin. Two checks
// close both holes without touching legitimate use:
// - Host must be localhost(-ish) or an IP literal. Rebinding needs the victim to reach us via an attacker-owned DOMAIN
//   name, so refusing name-based Hosts kills it while keeping the documented phone-on-the-LAN flow (users type the IP).
// - When the browser declares an Origin, it must match the Host we were reached at. Plain cross-site POSTs from a
//   regular web page always carry the foreign Origin, so they are rejected before any router runs. Requests without an
//   Origin header (same-origin GETs, curl, scripts) pass - they are not the cross-site case this defends against.

const parseHostHeader = function (hostHeader) {
    try {
        // Piggyback on URL to split hostname:port robustly (IPv6 brackets included) and normalize case/default port
        const { hostname, host } = new URL(`http://${hostHeader}`);
        return { hostName: hostname, host };
    } catch {
        return null;
    }
};

const isTrustedHostName = function (hostName) {
    if (hostName === 'localhost' || hostName.endsWith('.localhost')) {
        return true;
    }
    // URL keeps IPv6 hostnames bracketed ("[::1]"); net.isIP wants them bare
    const bareAddress = hostName.startsWith('[') && hostName.endsWith(']') ? hostName.slice(1, -1) : hostName;
    return net.isIP(bareAddress) !== 0;
};

const blockCrossSiteRequests = function (request, response, next) {
    const parsedHost = parseHostHeader(request.headers.host ?? '');
    if (parsedHost === null || !isTrustedHostName(parsedHost.hostName)) {
        return sendErrorResponse(response, 403, 'Blocked: unexpected Host header - open vibrary via localhost or the machine\'s IP address');
    }

    const { origin } = request.headers;
    if (origin !== undefined) {
        let originHost = null;
        try {
            originHost = new URL(origin).host;
        } catch {
            // A malformed or opaque Origin (e.g. "null" from sandboxed frames) is treated as foreign
        }
        if (originHost !== parsedHost.host) {
            return sendErrorResponse(response, 403, 'Blocked: cross-origin requests to the vibrary API are not allowed');
        }
    }

    return next();
};

export { blockCrossSiteRequests };
