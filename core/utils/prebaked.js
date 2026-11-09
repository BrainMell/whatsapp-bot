'use strict';
// Copy-missing seed from <repo>/prebaked/<sub> into a live cache dir. Never overwrites, never throws.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', '..', 'prebaked');
function copyMissing(from, to) {
  let n = 0;
  let ents; try { ents = fs.readdirSync(from, { withFileTypes: true }); } catch (_) { return 0; }
  for (const e of ents) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    try {
      if (e.isDirectory()) { n += copyMissing(a, b); }
      else if (e.name !== 'README.md' && !fs.existsSync(b)) { fs.mkdirSync(to, { recursive: true }); fs.copyFileSync(a, b); n++; }
    } catch (_) {}
  }
  return n;
}
function seed(sub, dstDir) {
  if (process.env.PREBAKED_SEED === '0') return 0;
  const n = copyMissing(path.join(SRC, sub), dstDir);
  if (n) console.log('[prebaked] seeded ' + n + ' file(s) into ' + sub);
  return n;
}
module.exports = { seed, copyMissing, SRC };
