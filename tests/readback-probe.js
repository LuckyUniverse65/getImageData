globalThis.__canvasResult = [];
for (const frequent of [false, true]) {
    for (const rect of [[-1,-1,2,2], [-2,0,3,1], [23,23,2,2], [-4,-4,2,2], [0,0,2,2]]) {
        const c = new OffscreenCanvas(24,24), g = c.getContext('2d', {willReadFrequently:frequent});
        g.fillStyle='red';g.fillRect(0,0,1,1);
        g.fillStyle='blue';g.fillRect(23,23,1,1);
        const a=g.getImageData(...rect);
        globalThis.__canvasResult.push({frequent,rect,data:Array.from(a.data)});
    }
}
