(function () {
    function run(Canvas) {
        const g=new Canvas(2,2).getContext('2d');
        g.fillStyle='red';
        try {
            g.fillStyle='#红';
            g.fillRect(0,0,2,2);
            return {style:g.fillStyle,pixel:Array.from(g.getImageData(0,0,1,1).data)};
        } catch(e) { return {error:e.name}; }
    }
    if(typeof module!=='undefined'&&module.exports){
        // Run only in a child process: malformed UTF-8 slicing can abort native code.
        console.log(JSON.stringify(run(require('..').OffscreenCanvas)));
    } else globalThis.__canvasResult=run(OffscreenCanvas);
})();
