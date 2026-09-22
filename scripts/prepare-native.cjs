'use strict';
const fs = require('node:fs');
const path = require('node:path');
const output = process.argv[2];
const config = process.env.CANVAS_MACHINE_CONFIG
    ? JSON.parse(fs.readFileSync(process.env.CANVAS_MACHINE_CONFIG, 'utf8')) : {};
const quote = value => JSON.stringify(value).replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const generic = config.genericFonts || {};
const header = `// Generated for this machine; no font files are embedded.\n` +
    `static constexpr bool canvas_default_raster = ${config.backend === 'raster'};\n` +
    `static constexpr const char* canvas_default_fallback = ${quote(config.fallbackFont || 'Noto Sans SC')};\n` +
    `static const char* canvas_generic_font(const std::string& family) {\n` +
    `std::string normalized = family; for (char& c : normalized) if (c >= 'A' && c <= 'Z') c += 'a' - 'A';\n` +
    Object.entries(generic).map(([name, value]) => `if (normalized == ${quote(name)}) return ${quote(value)};`).join('\n') +
    '\nreturn family.c_str();\n}\n';
fs.writeFileSync(path.join(output, 'canvas_machine_config.h'), header);
fs.writeFileSync(path.join(output, 'canvas-bundle.js'), require('./bundle-canvas.cjs')());
