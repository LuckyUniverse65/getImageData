'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function bundle() {
    let source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const replace = (from, to) => {
        if (!source.includes(from)) throw new Error('Bundle input changed: ' + from);
        source = source.replace(from, () => to);
    };
    replace('const native = require("./webgl.node");', '');
    const float16 = fs.readFileSync(path.join(root, 'node_modules/@petamoriken/float16/browser/float16.js'), 'utf8');
    replace("require('@petamoriken/float16').Float16Array", `(function(){\n${float16}\nreturn float16.Float16Array;})()`);
    const matrix = fs.readFileSync(path.join(root, 'src/dommatrix.js'), 'utf8');
    replace("require('./src/dommatrix.js')", `(function(){const module={exports:{}};\n${matrix}\nreturn module.exports;})()`);
    if (/\brequire\s*\(/.test(source)) throw new Error('Unbundled dependency in Canvas source');
    const result = `(function(native){'use strict';const module={exports:{}};\n${source}\nreturn module.exports;})`;
    new vm.Script(result, {filename:'embedded-canvas.js'});
    return result;
}
if (require.main === module) fs.writeFileSync(process.argv[2], bundle());
module.exports = bundle;
