'use strict';

const os = require('node:os');
if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('lucky65_canvas requires Node.js 22 or newer.');
}
if (process.arch !== 'x64') throw new Error('lucky65_canvas currently supports x64 only.');
if (process.platform === 'win32') {
    if (Number(os.release().split('.')[0]) < 10) throw new Error('lucky65_canvas requires Windows 10/11.');
    module.exports = require('./canvas-win32-x64.node');
} else if (process.platform === 'linux') {
    const glibc = process.report.getReport().header.glibcVersionRuntime;
    if (!glibc) {
        throw new Error('lucky65_canvas currently supports glibc Linux; Alpine/musl is not supported.');
    }
    const [major, minor] = glibc.split('.').map(Number);
    if (major < 2 || (major === 2 && minor < 31)) throw new Error('lucky65_canvas requires glibc >= 2.31 (Debian 11+/Ubuntu 20.04+).');
    module.exports = require('./canvas-linux-x64-gnu.node');
} else {
    throw new Error('lucky65_canvas supports Windows 10/11 x64 and glibc Linux x64.');
}
