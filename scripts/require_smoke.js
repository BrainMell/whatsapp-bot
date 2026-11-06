#!/usr/bin/env node
// require_smoke.js — load every runtime module of the reorganized tree and report failures.
process.chdir('/home/ubuntu/refactor-ws');
const path = require('path'), fs = require('fs');
const ROOT = '/home/ubuntu/refactor-ws';
const targets = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.git', 'media_cache', 'instances', 'temp', 'tmp', 'logs', 'rpgasset'].includes(e.name)) walk(p); }
        else if (e.name.endsWith('.js') && !e.name.includes('.bak')) targets.push(p);
    }
})(path.join(ROOT, 'core'));
targets.push(path.join(ROOT, 'index.js'));

let ok = 0; const failed = [];
for (const f of targets) {
    try { require(f); ok++; }
    catch (e) { failed.push({ f: path.relative(ROOT, f), err: (e.code || '') + ' ' + e.message.split('\n')[0] }); }
}
console.log(`require-smoke: ${ok} loaded, ${failed.length} failed`);
failed.forEach((x) => console.log(`  ✗ ${x.f}: ${x.err}`));
process.exit(failed.length ? 1 : 0);
