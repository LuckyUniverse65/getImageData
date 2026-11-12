'use strict';

// Run once: node integration/canvas-service/server.js
// Keep this process alive while business Workers start and stop.
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { OffscreenCanvas } = require('canvas');
const { paint } = require('./paint.js');

function createServer() {
    // One canvas and one context per service instance, not per request.
    const canvas = new OffscreenCanvas(48, 48);
    const ctx = canvas.getContext('2d');
    const serviceId = randomUUID();
    let requests = 0;

    function draw() {
        // Assignment also resets transforms, clipping, paths and drawing styles.
        // clearRect alone would leave those states behind.
        canvas.width = 48;
        paint(ctx);
        return Array.from(ctx.getImageData(0, 0, 48, 48).data);
    }

    draw(); // Warm up rendering/fonts before accepting requests.
    return http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (req.url !== '/draw') {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Use GET /draw' }));
            return;
        }
        if (req.method !== 'GET') {
            res.writeHead(405, { Allow: 'GET' });
            res.end(JSON.stringify({ error: 'Use GET /draw' }));
            return;
        }
        try {
            const started = performance.now();
            // No await here: each complete drawing and pixel snapshot runs
            // synchronously, so concurrent requests cannot interleave drawings.
            const data = draw();
            res.end(JSON.stringify({
                serviceId, servicePid: process.pid, requestNumber: ++requests,
                width: 48, height: 48, data,
                drawMs: performance.now() - started
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

if (require.main === module) {
    const server = createServer();
    server.on('error', error => { console.error(error); process.exitCode = 1; });
    server.listen(3010, '127.0.0.1', () => {
        console.log('Canvas ready: http://127.0.0.1:3010/draw');
    });
}

module.exports = { createServer };
