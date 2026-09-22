'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const {createHash} = require('node:crypto');
const {capture} = require('../capture-cdp.cjs');
const matchesFloat = require('../tests/nineteenth-comparison.cjs');
const root = path.resolve(__dirname, '..');
const sha = source => createHash('sha256').update(source).digest('hex').toUpperCase();
async function verify({binary, output, env = process.env}) {
    const preload = path.join(__dirname, 'use-built-canvas.cjs');
    const diagnosticDir = path.join(output, 'native-diagnostics');
    fs.mkdirSync(diagnosticDir, {recursive:true});
    const childEnv = {...env, CANVAS_TEST_MODULE:binary, CANVAS_DIAGNOSTICS:'1', CANVAS_DIAGNOSTICS_DIR:diagnosticDir,
        NODE_OPTIONS:`${env.NODE_OPTIONS || ''} --require ${JSON.stringify(preload)}`.trim()};
    const run = (args, name) => {
        const result = spawnSync(process.execPath, args, {cwd:root, env:childEnv, encoding:'utf8', windowsHide:true,
            timeout:240000, maxBuffer:64 * 1024 * 1024});
        fs.writeFileSync(path.join(output, name + '.log'), (result.stdout || '') + (result.stderr || ''));
        if (result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
        return result.stdout;
    };
    const localPath = path.join(output, 'local-suites.json');
    run([path.join(__dirname, 'machine-child.cjs'), 'local-suites', localPath], 'local-suites');
    const local = JSON.parse(fs.readFileSync(localPath));
    const captures = [];
    const live = async (script, name) => {
        const result = await capture({script, outputName:'build-' + name});
        assert.equal(result.scriptSHA256, sha(fs.readFileSync(path.join(root, script))));
        assert.equal(result.browserMode, 'user-chrome-cdp');
        fs.writeFileSync(path.join(output, name + '-browser.json'), JSON.stringify(result));
        const {value, ...metadata} = result;
        captures.push(metadata);
        return value;
    };
    const references = {
        basic: await live('tests/browser-cases.js', 'basic'),
        additional: await live('tests/additional-cases.js', 'additional'),
        third: await live('tests/third-round-cases.js', 'third'),
        ...await live('tests/fourth-round-cases.js', 'extended')
    };
    const differences = [], tolerated = [];
    let tested = 0, exact = 0;
    for (const [suite, group] of Object.entries(local)) {
        const expected = references[suite];
        if (!expected || !isDeepStrictEqual(Object.keys(group).sort(), Object.keys(expected).sort())) {
            differences.push({suite, reason:'Case names differ', localNames:Object.keys(group), browserNames:expected && Object.keys(expected)});
            continue;
        }
        const floatTolerance = suite === 'nineteenthRound' || Object.hasOwn(require('../tests/continuation-suites.cjs').suites, suite);
        for (const [name, actual] of Object.entries(group)) {
            tested++;
            if (isDeepStrictEqual(actual, expected[name])) exact++;
            else if (floatTolerance && matchesFloat(actual, expected[name])) tolerated.push({suite, name});
            else differences.push({suite, name, local:actual, chrome:expected[name]});
        }
    }
    const unicode = JSON.parse(run([path.join(root, 'tests/unicode-color-case.js')], 'unicode').trim());
    const unicodeReference = await live('tests/unicode-color-case.js', 'unicode');
    tested++;
    if (isDeepStrictEqual(unicode, unicodeReference)) exact++;
    else differences.push({suite:'unicode', local:unicode, chrome:unicodeReference});
    const demo = run([path.join(root, 'data.js')], 'demo').trim().split(/\r?\n/).at(-1).split(',').map(Number);
    const demoReference = await live('demo.js', 'demo');
    const demoMismatches = demo.filter((v, i) => v !== demoReference[i]).length + Math.abs(demo.length - demoReference.length);
    if (demoMismatches) differences.push({suite:'demo', mismatches:demoMismatches});
    // These exercise instance ownership and concurrent worker loading of the candidate.
    run(['--test', path.join(root, 'tests/worker-concurrency.test.cjs')], 'workers');
    for (const name of ['path-gc.cjs', 'gradient-gc.cjs', 'pattern-gc.cjs']) {
        run(['--expose-gc', path.join(root, 'tests', name)], name);
    }
    const versions = new Set(captures.map(c => c.chromeVersion));
    const connections = new Set(captures.map(c => c.connectionId));
    assert.equal(versions.size, 1, 'Chrome changed during verification');
    assert.equal(connections.size, 1, 'Verification must reuse one CDP connection');
    const report = {tested, exact, tolerated, differences, demoValues:demo.length, demoMismatches,
        browserVerified:differences.length === 0, chromeVersion:captures[0].chromeVersion,
        rgbaFloat16RgbAbsoluteTolerance:1e-5, captures, candidateSHA256:sha(fs.readFileSync(binary))};
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
    return report;
}
module.exports = verify;
