"use strict";

// Start: node demo_server.js
// Request: GET http://127.0.0.1:3000/draw
const http = require("node:http");
const { performance } = require("node:perf_hooks");
const { OffscreenCanvas } = require("canvas");

function draw() {
    const started = performance.now();
    const b = new OffscreenCanvas(48, 48);
    const gl = b.getContext('2d');
    gl.scale(0.384, 0.384);
    let gr = gl.createRadialGradient(33, 18, 8, 42, 10, 226);
    gl.fillStyle = gr;
    gl.shadowBlur = 11;
    gl.shadowColor = '#F38020';
    gl.beginPath();
    gl.moveTo(9, 14);
    gl.quadraticCurveTo(93, 48, 116, 111);
    gl.stroke();
    gl.fill();
    gl.shadowBlur = 0;
    gr = gl.createRadialGradient(77, 98, 2, 27, 30, 206);
    gl.fillStyle = gr;
    gl.beginPath();
    gl.ellipse(58, 55, 31, 28, 1.4441705959829747, 0.5401125108618993, 4.052233984744969);
    gl.stroke();
    gl.fill();
    gl.shadowBlur = 0;
    gr = gl.createRadialGradient(108, 12, 10, 65, 118, 169);
    gl.fillStyle = gr;
    gl.shadowBlur = 16;
    gl.shadowColor = '#809980';
    gl.font = '27.77777777777778px aanotafontaa';
    gl.fillText('Ry', 13, 67);
    gl.shadowBlur = 0;
    gr = gl.createRadialGradient(46, 47, 0, 101, 108, 207);
    gl.fillStyle = gr;
    gl.shadowBlur = 3;
    gl.shadowColor = '#FF6633';
    gl.beginPath();
    gl.moveTo(54, 5);
    gl.bezierCurveTo(54, 90, 32, 74, 71, 120);
    gl.stroke();
    gl.fill();
    gl.shadowBlur = 0;
    gr = gl.createRadialGradient(119, 123, 3, 109, 90, 137);
    gl.fillStyle = gr;
    gl.shadowBlur = 4;
    gl.shadowColor = 'red';
    gl.beginPath();
    gl.moveTo(76, 0);
    gl.bezierCurveTo(1, 49, 103, 67, 49, 125);
    gl.stroke();
    gl.fill();
    gl.shadowBlur = 0;
    gr = gl.createConicGradient(34, 47, 1);
    gl.fillStyle = gr;
    gl.beginPath();
    gl.ellipse(56, 57, 14, 8, 1.2273132071162383, 4.1926143018618225, 2.8853539230051624);
    gl.stroke();
    gl.fill();
    gl.shadowBlur = 0;
    gl.shadowBlur = 14;
    gl.shadowColor = '#809900';
    gl.font = '11.904761904761905px aanotafont';
    gl.strokeText('@H1', 30, 73);
    gl.shadowBlur = 0;
    const data = Array.from(gl.getImageData(0, 0, 48, 48).data);
    return { width: 48, height: 48, elapsedMs: performance.now() - started};
}

function createServer() {
    return http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (req.url.split('?')[0] !== '/draw') {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found. Use GET /draw.' }));
            return;
        }
        if (req.method !== 'GET') {
            res.writeHead(405, { Allow: 'GET' });
            res.end(JSON.stringify({ error: 'Method not allowed. Use GET /draw.' }));
            return;
        }
        try {
            // Every request creates its own canvas and performs the complete drawing.
            res.end(JSON.stringify(draw()));
        } catch (error) {
            console.error(error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Canvas drawing failed.' }));
        }
    });
}

if (require.main === module) {
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || '127.0.0.1';
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError('PORT must be an integer between 1 and 65535.');
    }
    // Pay the first GPU/font initialization cost before accepting requests.
    draw();
    const server = createServer();
    server.on('error', error => {
        console.error(`Server failed: ${error.message}`);
        process.exitCode = 1;
    });
    server.listen(port, host, () => {
        console.log(`Canvas demo ready: http://${host}:${port}/draw`);
    });
}

module.exports = { draw, createServer };
