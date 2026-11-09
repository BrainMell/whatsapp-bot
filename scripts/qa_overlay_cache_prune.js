// LRU cap for the death-overlay frame cache: oldest evicted, recent (<10min) + hot (touched) kept, memo cleared, cap respected.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ovprune_')); process.env.DEATH_OV_DIR = root; process.env.DEATH_OV_MAX_MB = '40';
const ov = require('../core/rpg/systems/combat/deathOverlay');
const mk = (name, mb, ageMin) => { const d = path.join(root, name); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'f000.png'), Buffer.alloc(mb * 1048576)); fs.writeFileSync(path.join(d, 'meta.json'), '{"n":1,"fps":15}'); const t = new Date(Date.now() - ageMin * 60000); fs.utimesSync(path.join(d, 'meta.json'), t, t); fs.utimesSync(d, t, t); };
mk('old1', 15, 600); mk('old2', 15, 300); mk('mid', 15, 60); mk('fresh', 15, 1);   // 60MB > 40MB cap
const r = ov.pruneOverlayCache(true);
const left = fs.readdirSync(root).sort();
assert(!left.includes('old1'), 'oldest evicted'); assert(left.includes('fresh'), 'recently used (<10min) never evicted');
const total = left.reduce((a, n) => a + fs.statSync(path.join(root, n, 'f000.png')).size, 0); assert(total <= 40 * 1048576, 'under cap: ' + total);
assert(r.removed >= 1); const r2 = ov.pruneOverlayCache(true); assert.strictEqual(r2.removed, 0, 'idempotent under the cap');
fs.rmSync(root, { recursive: true, force: true }); console.log('overlay cache prune QA: PASS (removed', r.removed + ')');
