'use strict';
const assert = require('node:assert/strict');
const {OffscreenCanvas} = require('..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
    const source = new OffscreenCanvas(2,2);
    source.getContext('2d').fillRect(0,0,2,2);
    const g = new OffscreenCanvas(8,4).getContext('2d');
    const h = new OffscreenCanvas(8,4).getContext('2d');
    let weak;
    (() => {
        const pattern = g.createPattern(source,'no-repeat');
        weak = new WeakRef(pattern);
        g.fillStyle = pattern;
        h.strokeStyle = pattern;
        g.save();
        g.fillStyle = 'red';
        pattern.setTransform({e:4});
    })();
    await tick();
    global.gc();
    g.restore();
    assert.equal(g.fillStyle,h.strokeStyle);
    g.fillRect(0,0,8,4);
    assert.deepEqual([...g.getImageData(4,0,1,1).data],[0,0,0,255]);
    assert.deepEqual([...g.getImageData(0,0,1,1).data],[0,0,0,0]);
    g.reset();
    h.reset();
    for(let i=0;i<12;i++) {
        await tick();
        global.gc();
        await tick();
        if(weak.deref()===undefined) {
            console.log(JSON.stringify({retainedWhileUsed:true,releasedAfterReset:true}));
            return;
        }
    }
    assert.fail('Pattern retained after both contexts released it');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
