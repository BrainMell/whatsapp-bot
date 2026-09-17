#!/usr/bin/env node
/** Require-every-module smoke test: catches load-time throws (TDZ, bad imports,
 *  missing files, circulars). Run from the bot root: node scripts/e2e_smoke_require.js */
const fs = require('fs');
const path = require('path');

// load .env like the bot does
try { require('dotenv').config(); } catch (e) {}

const DIRS = ['core/rpg', 'core/commands', 'core/utils', 'core/src/context_engine'];
let ok = 0, fail = 0;
const failures = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.js') || e.name.includes('.bak') || e.name.includes('.pre_')) continue;
    try {
      require(path.resolve(p));
      ok++;
    } catch (err) {
      fail++;
      failures.push({ file: p, err: err.message, stack: (err.stack || '').split('\n').slice(0, 3).join(' | ') });
    }
  }
}

// silence expected noise
const origErr = console.error;
console.error = () => {};

for (const d of DIRS) {
  if (fs.existsSync(d)) walk(d);
}
console.error = origErr;

console.log(`REQUIRE SMOKE: ok=${ok} fail=${fail}`);
for (const f of failures) {
  console.log(`\nFAIL ${f.file}\n  ${f.err}\n  ${f.stack}`);
}
process.exit(fail > 0 ? 1 : 0);
