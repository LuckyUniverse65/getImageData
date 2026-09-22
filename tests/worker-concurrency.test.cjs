'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');

if (!isMainThread) {
    const {OffscreenCanvas} = require('..');
    parentPort.postMessage('ready');
    parentPort.once('message', () => {
        for (let i=0; i<30; i++) {
            const g=new OffscreenCanvas(32,32).getContext('2d');
            const colors=['red','lime','blue'],values=[[255,0,0,255],[0,255,0,255],[0,0,255,255]];
            const color=(workerData+i)%3;
            g.fillStyle=colors[color];g.fillRect(0,0,32,32);
            assert.deepEqual([...g.getImageData(0,0,1,1).data],values[color]);
            const bitmap=g.canvas.transferToImageBitmap();
            g.reset();g.drawImage(bitmap,0,0);bitmap.close();
            assert.deepEqual([...g.getImageData(0,0,1,1).data],values[color]);
            const gradient=g.createLinearGradient(0,0,32,32);
            gradient.addColorStop(0,'blue');gradient.addColorStop(1,'lime');
            g.fillStyle=gradient;g.fillRect(0,0,32,32);
            assert.equal(g.getImageData(16,16,1,1).data[3],255);
        }
        parentPort.close();
    });
} else {
    test('independent worker canvases can draw and read concurrently', {timeout:30000}, async () => {
        for(let wave=0;wave<3;wave++) {
        const workers=Array.from({length:3},(_,i)=>new Worker(__filename,{workerData:i+wave}));
        try {
            const completed=workers.map(w=>new Promise((resolve,reject)=>{w.on('error',reject);w.on('exit',code=>code===0?resolve():reject(new Error('Worker exit '+code)));}));
            await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);})));
            workers.forEach(w=>w.postMessage('draw'));
            await Promise.all(completed);
        } finally {await Promise.all(workers.map(w=>w.terminate()));}
        }
    });
}
