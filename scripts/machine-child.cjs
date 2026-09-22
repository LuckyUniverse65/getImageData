'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const api = require(path.resolve(process.env.CANVAS_TEST_MODULE));
const {fontSample, shapeSample} = require('../tests/machine-probe.js');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const action = process.argv[2];
async function main() {
    if (action === 'calibrate') {
        const reference = JSON.parse(fs.readFileSync(process.argv[3])).value;
        const diagnostics = JSON.parse(api.getRenderDiagnostics());
        const targets = Object.fromEntries(Object.entries(reference.fonts).map(([name, sample]) => [name, hash(sample.pixels)]));
        const candidates = [...new Set(['Noto Sans SC','Arial','Times New Roman','Courier New','Segoe UI', ...diagnostics.availableFontFamilies])];
        const matches = {};
        const metrics = {};
        const tested = [];
        for (const family of candidates) {
            if (!diagnostics.availableFontFamilies.includes(family)) continue;
            const sample = fontSample(api.OffscreenCanvas, JSON.stringify(family));
            const fingerprint = hash(sample.pixels);
            tested.push(family);
            for (const [name, target] of Object.entries(targets)) if (!matches[name] && fingerprint === target) {
                matches[name] = family;
                metrics[name] = {localWidth:sample.width, chromeWidth:reference.fonts[name].width,
                    equal:sample.width === reference.fonts[name].width};
            }
            if (Object.keys(matches).length === Object.keys(targets).length) break;
        }
        console.log(JSON.stringify({shapeMatches:hash(shapeSample(api.OffscreenCanvas)) === hash(reference.shape),
            genericFonts:matches, fontIdentificationMetrics:metrics,
            unresolved:Object.keys(targets).filter(name => !matches[name]), tested,
            diagnostics:JSON.parse(api.getRenderDiagnostics())}));
    } else if (action === 'local-suites') {
        const Canvas = api.OffscreenCanvas;
        api.installWebGLGlobals();
        const cases = require('../tests/fourth-round-cases.js');
        const out = {
            basic: await require('../tests/browser-cases.js')(Canvas, require('../tests/png-reader.js')),
            additional: await require('../tests/additional-cases.js')(Canvas),
            third: await require('../tests/third-round-cases.js')(Canvas),
            fourthRound: await cases(Canvas)
        };
        for (const round of ['Fifth','Sixth','Seventh','Eighth','Ninth','Tenth','Eleventh','Twelfth','Thirteenth','Fourteenth','Fifteenth','Sixteenth','Seventeenth','Eighteenth','Nineteenth']) {
            out[round[0].toLowerCase() + round.slice(1) + 'Round'] = await cases['run' + round + 'RoundCases'](Canvas);
        }
        Object.assign(out, await require('../tests/continuation-suites.cjs').runLocal(Canvas));
        fs.writeFileSync(process.argv[3], JSON.stringify(out));
        console.log(JSON.stringify({suites:Object.keys(out).length, cases:Object.values(out).reduce((n, group) => n + Object.keys(group).length, 0)}));
    } else throw new Error('Unknown machine child action');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
