'use strict';

// This client never loads the native canvas package.
// Call inside a business Worker: const result = await drawRemote();
async function drawRemote(url = 'http://127.0.0.1:3010/draw') {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Canvas HTTP ${response.status}`);
    result.data = new Uint8ClampedArray(result.data);
    return result;
}

module.exports = { drawRemote };
