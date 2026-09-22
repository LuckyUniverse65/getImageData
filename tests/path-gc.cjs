'use strict';
// Path2D owns a native SkPath. The wrapper must release it once the JavaScript
// object becomes unreachable, and must keep it alive while a draw is pending.
const assert = require('node:assert/strict');
const {OffscreenCanvas, Path2D} = require('..');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function main() {
    const g = new OffscreenCanvas(8, 8).getContext('2d');
    let weak;
    (() => {
        const path = new Path2D();
        path.rect(0, 0, 4, 4);
        weak = new WeakRef(path);
        g.fillStyle = 'red';
        g.fill(path);
        // A copy must not keep the source alive.
        const copy = new Path2D(path);
        copy.rect(4, 4, 4, 4);
        g.fill(copy);
    })();
    assert.deepEqual([...g.getImageData(1, 1, 1, 1).data], [255, 0, 0, 255]);
    assert.deepEqual([...g.getImageData(5, 5, 1, 1).data], [255, 0, 0, 255]);

    let released = false;
    for (let i = 0; i < 12; i++) {
        await tick();
        global.gc();
        await tick();
        if (weak.deref() === undefined) { released = true; break; }
    }
    assert.ok(released, 'Path2D retained after the last reference went away');

    // Repeated allocation must reuse the released native storage rather than grow.
    const build = () => { const p = new Path2D(); p.rect(0, 0, 10, 10); p.arc(5, 5, 3, 0, 6); };
    for (let i = 0; i < 20000; i++) build();
    for (let i = 0; i < 6; i++) { global.gc(); await tick(); }
    const base = process.memoryUsage().rss;
    for (let i = 0; i < 20000; i++) build();
    for (let i = 0; i < 6; i++) { global.gc(); await tick(); }
    const growth = (process.memoryUsage().rss - base) / 1048576;
    assert.ok(growth < 16, `Path2D storage grew by ${growth.toFixed(1)} MB across identical rounds`);
    console.log(JSON.stringify({releasedWhenUnreachable: true, storageReused: true}));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
