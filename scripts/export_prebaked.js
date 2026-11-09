'use strict';
// Export warm caches into ./prebaked (commit the result). Newest files first, capped by PREBAKED_MAX_MB (60).
const fs = require('fs'), os = require('os'), path = require('path');
const OUT = path.join(__dirname, '..', 'prebaked');
const CAP = (Number(process.env.PREBAKED_MAX_MB) || 60) * 1048576;
const SRCS = [
  ['ult-plates', process.env.ULT_PLATE_DIR || path.join(os.homedir(), '.cache', 'ult-plates')],
  ['cardfx-v1', path.join(process.env.BAKE_DIR || path.join(os.homedir(), '.cache', 'bot_bake'), 'cardfx-v1')],
  ['deathov', process.env.DEATH_OV_DIR || path.join(os.tmpdir(), 'joker_deathov')],
];
function walk(d, rel = '') { let o = []; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return o; }
  for (const e of es) { const p = path.join(d, e.name), r = path.join(rel, e.name);
    if (e.isDirectory()) o = o.concat(walk(p, r)); else if (!e.name.includes('.tmp')) { const s = fs.statSync(p); o.push({ p, r, s: s.size, t: s.mtimeMs }); } } return o; }
let all = []; for (const [sub, dir] of SRCS) for (const f of walk(dir)) all.push({ ...f, sub });
all.sort((a, b) => b.t - a.t);
let tot = 0, n = 0;
for (const f of all) { if (tot + f.s > CAP) continue; const dst = path.join(OUT, f.sub, f.r);
  fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(f.p, dst); tot += f.s; n++; }
console.log(`exported ${n}/${all.length} files, ${(tot / 1048576).toFixed(1)}MB -> prebaked/`);
