'use strict';

// Profile the actual demo without changing its drawing commands or reference pixels.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const demoPath = path.resolve(__dirname, '../demo.js');
const localRequire = createRequire(demoPath);
const packageName = process.argv[2] || './';
const count = Number(process.argv[3] || 11);
const source = fs.readFileSync(demoPath, 'utf8');
const instrumented = source.split(/\r?\n/).map((line, index) => {
  const label = line.trim();
  if (!label || label === '"use strict";' || /[{}]\s*$/.test(label) || label.startsWith('//')) return line;
  return line + '\nmark(' + JSON.stringify(`${index + 1}: ${label.slice(0, 90)}`) + ');';
}).join('\n');
const run = new Function('require', 'console', 'mark', instrumented + '\nreturn data;');
const results = [];
for (let i = 0; i < count; i++) {
  const steps = [];
  let correct;
  const started = performance.now();
  let previous = started;
  const pixels = run(name => localRequire(name === './' ? packageName : name),
    { log(value) { correct = value; } },
    label => { const now = performance.now(); steps.push({ label, ms: now - previous }); previous = now; });
  results.push({ iteration: i, ms: performance.now() - started, correct,
    sha256: createHash('sha256').update(Buffer.from(pixels)).digest('hex'), steps });
}
delete globalThis.data;
const warm = results.slice(1).map(r => r.ms).sort((a, b) => a - b);
const report = { package: packageName, node: process.version, cold: results[0],
  warmMedianMs: warm.length ? warm[Math.floor(warm.length / 2)] : null,
  allCorrect: results.every(r => r.correct === true),
  identicalPixels: results.every(r => r.sha256 === results[0].sha256), results };
if (process.env.CANVAS_BENCH_OUTPUT) fs.writeFileSync(process.env.CANVAS_BENCH_OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, results: undefined, cold: { ...report.cold,
  steps: report.cold.steps.filter(s => s.ms >= 1).sort((a, b) => b.ms - a.ms) } }, null, 2));
if (!report.allCorrect || !report.identicalPixels) process.exitCode = 1;
