'use strict';
// Test-only preload: every child/worker requiring the source package receives
// the actual candidate binary. No source JS facade is evaluated.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const target = process.env.CANVAS_TEST_MODULE;
if (!target) throw new Error('CANVAS_TEST_MODULE must name the candidate binary');
const api = require(path.resolve(target));
const entry = path.join(root, 'index.js');
require.cache[entry] = {id:entry, filename:entry, loaded:true, exports:api};
if (process.env.CANVAS_DIAGNOSTICS_DIR) process.once('exit', () => {
    const {threadId} = require('node:worker_threads');
    fs.writeFileSync(path.join(process.env.CANVAS_DIAGNOSTICS_DIR, `${process.pid}-${threadId}.json`), api.getRenderDiagnostics());
});
