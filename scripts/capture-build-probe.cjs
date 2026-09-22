'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
module.exports = async function captureSource(source, name) {
    // This path is already accepted by existing persistent CDP services.
    // No service restart, browser restart or second connection is needed.
    const slot = path.join(root, 'tests/twentythird-round-probe.js');
    const original = fs.readFileSync(slot);
    try {
        fs.writeFileSync(slot, source);
        return await require('../capture-cdp.cjs').capture({script:'tests/twentythird-round-probe.js', outputName:name});
    } finally {
        fs.writeFileSync(slot, original);
    }
};
