#!/usr/bin/env node
// eslint no-undef gate (rebuilt after sandbox wipe - see worklog Task 13)
// Uses the Linter API directly with a minimal config that enables no-undef
// with an explicit globals allowlist (node + es2023 + repo idioms).
// Known non-blocking elsewhere: core/engine.js pre-existing no-unreachable.
const { Linter } = require('eslint');
const fs = require('fs');
const path = require('path');

const linter = new Linter();
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node no_undef.js <file...>');
  process.exit(2);
}

const GLOBALS = {
  console: 'writable', setTimeout: 'writable', clearTimeout: 'writable',
  setInterval: 'writable', clearInterval: 'writable', setImmediate: 'writable',
  clearImmediate: 'writable', process: 'writable', Buffer: 'writable',
  require: 'writable', module: 'writable', exports: 'writable',
  __dirname: 'writable', __filename: 'writable', global: 'writable',
  URL: 'writable', URLSearchParams: 'writable', TextEncoder: 'writable', TextDecoder: 'writable',
  fetch: 'writable', AbortController: 'writable', queueMicrotask: 'writable',
  structuredClone: 'writable', performance: 'writable', BigInt: 'writable',
  Promise: 'writable', Map: 'writable', Set: 'writable', WeakMap: 'writable', WeakSet: 'writable',
  Symbol: 'writable', Proxy: 'writable', Reflect: 'writable', Math: 'writable', JSON: 'writable',
  Object: 'writable', Array: 'writable', String: 'writable', Number: 'writable', Boolean: 'writable',
  Date: 'writable', RegExp: 'writable', Error: 'writable', TypeError: 'writable', RangeError: 'writable',
  SyntaxError: 'writable', Function: 'writable', isNaN: 'writable', isFinite: 'writable',
  parseInt: 'writable', parseFloat: 'writable', encodeURIComponent: 'writable',
  decodeURIComponent: 'writable', encodeURI: 'writable', decodeURI: 'writable',
  NaN: 'writable', Infinity: 'writable', undefined: 'writable', globalThis: 'writable',
};

let bad = 0;
for (const f of files) {
  const abs = path.resolve(f);
  const code = fs.readFileSync(abs, 'utf8');
  const msgs = linter.verify(code, {
    plugins: {},
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: GLOBALS },
    rules: { 'no-undef': 'error' },
  }, abs);
  const hits = msgs.filter((m) => m.ruleId === 'no-undef');
  if (hits.length) {
    bad += hits.length;
    for (const h of hits) console.log(`✖ ${f}:${h.line} col${h.column} ${h.message}`);
  } else {
    console.log(`✔ ${f} no-undef clean`);
  }
}
console.log(bad ? `GATE FAIL (${bad})` : 'GATE PASS');
process.exit(bad ? 1 : 0);
