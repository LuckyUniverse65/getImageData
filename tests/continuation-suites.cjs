'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const cases = require('./fourth-round-cases');

const suites = {
    contextSeparation: 'runContextSeparationCases',
    twentiethRound: 'runTwentiethRoundCases',
    allocationLifecycle: 'runAllocationLifecycleCases',
    allocationEdges: 'runAllocationEdgeCases',
    rasterEdges: 'runRasterEdgeCases',
    lossState: 'runLossStateCases',
    snapshotPrecision: 'runSnapshotPrecisionCases',
    exportAllocation: 'runExportAllocationCases',
    wideSource: 'runWideSourceCases',
    tiledComposition: 'runTiledCompositionCases',
    pixelLifecycle: 'runPixelLifecycleCases',
    transferState: 'runTransferStateCases',
    formatBoundary: 'runFormatBoundaryCases',
    rasterFormatBoundary: 'runRasterFormatBoundaryCases',
    resetDrawing: 'runResetDrawingCases'
};

async function runLocal(Canvas) {
    const result = {};
    for (const [key, fn] of Object.entries(suites)) result[key] = await cases[fn](Canvas);
    result.twentiethAllocation = {};
    // Keep the original native-abort repro in its own process permanently.
    for (const name of ['putLast', 'readFirst', 'resizeWide']) {
        const child = spawnSync(process.execPath,
            [path.join(__dirname, 'compare-twentieth-round.cjs'), '--allocation-child', name],
            {cwd: path.join(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 10000});
        assert.equal(child.status, 0, `${name}: ${child.error?.message || child.stderr}`);
        result.twentiethAllocation[name] = JSON.parse(child.stdout);
    }
    return result;
}

module.exports = {suites, runLocal};
