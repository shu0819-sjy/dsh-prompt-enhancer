'use strict';
const fs = require('node:fs');
const host = fs.readFileSync('plugin-host.js', 'utf8');
const start = host.indexOf('    // ================= M2 深化：增强管道');
const end = host.indexOf('    ctx.effect(() => () => {', start);
if (start < 0 || end < 0) throw new Error('Could not locate intact host chunk boundaries');
const chunk = host.slice(start, end);
fs.writeFileSync('src/host/enhance-handlers.js', "'use strict';\n// Extracted from the intact generated bundle for recovery.\nmodule.exports = " + JSON.stringify(chunk) + ';\n', 'utf8');
console.log('Recovered ' + chunk.length + ' characters');
