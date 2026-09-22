'use strict';
const {isDeepStrictEqual} = require('node:util');

// Cross-gamut CPU transforms can differ slightly between Skia SIMD builds.
// Permit at most 1e-5 in half-float ImageData color channels only. Metadata,
// alpha, ordinary RGBA8 pixels, and all compositing cases remain exact.
function matches(actual, expected, floatingColor = false) {
    if (isDeepStrictEqual(actual, expected)) return true;
    if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
    if (!isDeepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort())) return false;
    if (Array.isArray(actual)) {
        if (!floatingColor) return actual.every((value, i) => matches(value, expected[i]));
        return actual.every((value, i) => i % 4 === 3 ? Object.is(value, expected[i]) :
            typeof value === 'number' && typeof expected[i] === 'number' && Math.abs(value-expected[i]) <= 1e-5);
    }
    return Object.keys(actual).every(key => matches(actual[key], expected[key],
        key === 'data' && actual.pixelFormat === 'rgba-float16' && expected.pixelFormat === 'rgba-float16'));
}
module.exports = matches;
