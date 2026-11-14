'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../npm/index.js'), 'utf8');
function load(platform, arch, release, glibc = '2.31', node = '22.13.1') {
    const module = {exports: {}};
    vm.runInNewContext(source, {module, process: {platform, arch, versions: {node}, report: {getReport: () => ({header: {glibcVersionRuntime: glibc}})}},
        require: name => name === 'node:os' ? {release: () => release} : name});
    return module.exports;
}
test('macOS chooses the Node process architecture, including x64 under Rosetta', () => {
    assert.equal(load('darwin', 'arm64', '23.6.0'), './canvas-darwin-arm64.node');
    assert.equal(load('darwin', 'x64', '24.0.0'), './canvas-darwin-x64.node');
    assert.throws(() => load('darwin', 'arm64', '22.6.0'), /macOS 14/);
});
test('existing Windows and Linux selection and minimum glibc remain intact', () => {
    assert.equal(load('win32', 'x64', '10.0.22631'), './canvas-win32-x64.node');
    assert.equal(load('linux', 'x64', '5.10'), './canvas-linux-x64-gnu.node');
    assert.throws(() => load('linux', 'x64', '5.10', '2.30'), /glibc >= 2.31/);
    assert.throws(() => load('linux', 'x64', '5.10', null), /musl/);
    assert.throws(() => load('win32', 'x64', '6.1'), /Windows 10/);
});
test('unsupported platform/architecture and old Node fail before native loading', () => {
    assert.throws(() => load('linux', 'arm64', '6.0'), /arm64 on macOS/);
    assert.throws(() => load('win32', 'arm64', '10.0'), /arm64 on macOS/);
    assert.throws(() => load('darwin', 'ia32', '23.0'), /supports x64/);
    assert.throws(() => load('freebsd', 'x64', '14.0'), /supports Windows/);
    assert.throws(() => load('darwin', 'arm64', '23.0', null, '20.19.0'), /Node.js 22/);
});
