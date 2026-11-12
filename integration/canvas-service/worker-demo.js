'use strict';

// Start server.js first, then run this file in another terminal.
// Each request uses a new business Worker, which exits after receiving pixels.
const { Worker, isMainThread, parentPort, workerData, threadId } = require('node:worker_threads');
const { createHash } = require('node:crypto');
const { drawRemote } = require('./client.js');

function runOneWorker(url = 'http://127.0.0.1:3010/draw') {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: { url } });
        let result;
        worker.once('message', message => { result = message; });
        worker.once('error', reject);
        worker.once('exit', code => {
            if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
            else if (!result) reject(new Error('Worker exited without a result'));
            else resolve(result);
        });
    });
}

if (!isMainThread) {
    drawRemote(workerData.url).then(result => {
        parentPort.postMessage({ ...result, businessThreadId: threadId });
        parentPort.close();
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
        parentPort.close();
    });
} else if (require.main === module) {
    (async () => {
        for (let i = 0; i < 3; i++) {
            const result = await runOneWorker();
            console.log({
                businessThreadId: result.businessThreadId,
                serviceId: result.serviceId,
                servicePid: result.servicePid,
                requestNumber: result.requestNumber,
                rgbaValues: result.data.length,
                pixelHash: createHash('sha256').update(result.data).digest('hex'),
                drawMs: result.drawMs
            });
        }
    })().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { runOneWorker };
