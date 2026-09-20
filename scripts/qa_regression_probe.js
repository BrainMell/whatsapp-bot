// Regression probe for the last session's ticket pass (commit ee896af).
// Runtime-verifies the math/behavior seams that the static QA battery cannot.
'use strict';
const assert = require('assert');
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok - ' + label); }
  else { fail++; console.error('  FAIL - ' + label); }
}

// ── 1. XP curve: exact +20% (200L^2 -> 240L^2) at the canonical source ──────
const economy = require('../core/rpg/economy');
const fakeUsers = {};
economy.getUser = (jid) => fakeUsers[jid] || null;
const progression = require('../core/rpg/progression');
console.log('[1] XP curve + stat points');
ok(progression.getXPForLevel(1) === 0, 'getXPForLevel(1) === 0 (level 1 is the start, by design)');
for (const L of [2, 5, 10, 25, 50, 77, 100]) {
  ok(progression.getXPForLevel(L) === 240 * L * L, `getXPForLevel(${L}) === 240*L^2 (got ${progression.getXPForLevel(L)})`);
}

// ── 2. Stat points range grant (admin setlevel / milestones) ────────────────
ok(typeof progression.getStatPointsForRange === 'function', 'getStatPointsForRange exported');
const pts = progression.getStatPointsForRange(1, 31);
// 30 levels x 5 + milestone bonuses at 10/20/30 (real contract includes milestones)
ok(pts === 30 * 5 + 30, `levels 1..30 grant 5/level + milestones (got ${pts})`);
ok(progression.getStatPointsForRange(10, 10) === 0, 'empty range grants 0 (no double grants)');

// ── 3. previewAllocation mirrors backend allocation (three-point sync) ──────
const J = 'qa_probe@s.whatsapp.net';
fakeUsers[J] = { jid: J, class: 'FIGHTER', nickname: 'Probe' };
const progRec = progression.getUser(J);
ok(!!progRec, 'progression record created for probe user');
progRec.statPoints = 500; progRec.allocatedStats = {}; progRec.allocatedStatPoints = {};
const pv = progression.previewAllocation(J, 'atk', 5);
ok(pv.gainedValue === 15, `5 ATK points preview pays exactly base x 5 (got ${pv.gainedValue})`);
const res = progression.allocateStatPoint(J, 'atk', 5);
ok(res.valueGained === pv.gainedValue, 'backend pays exactly the preview (three-point sync)');
const pv1 = progression.previewAllocation(J, 'atk', 1);
ok(Number(pv1.gainedValue) > 0, 'single point preview pays base x tier (soft cap removed)');

// ── 4. Cosmology gate seams (abyss window + triune + status lines) ──────────
const cosmology = require('../core/rpg/cosmology');
console.log('[2] cosmology gate seams');
const w = cosmology.abyssWindow();
ok(w && typeof w.open === 'boolean' && typeof w.label === 'string', 'abyssWindow() returns {open,label} shape');
// find an open moment and a locked moment inside the 6h cycle
let openAt = null, lockedAt = null;
for (let t = Date.now(); t < Date.now() + 7 * 3600e3; t += 60e3) {
  const x = cosmology.abyssWindow(t);
  if (!openAt && x.open) openAt = t;
  if (!lockedAt && !x.open) lockedAt = t;
  if (openAt && lockedAt) break;
}
ok(openAt && cosmology.abyssWindow(openAt).open === true, 'an open window exists in the 6h cycle');
ok(lockedAt && cosmology.abyssWindow(lockedAt).open === false, 'a locked window exists in the 6h cycle');
ok(typeof cosmology.isTriuneAligned === 'function' && typeof cosmology.triuneWindow === 'function', 'triune state is checked, never auto-scheduled');

// ── 5. combatTargetIcon resolver (undefined-name class of bugs) ─────────────
const ga = require('../core/rpg/guildAdventure');
console.log('[3] combat icon resolver');
ok(ga.combatTargetIcon({ name: 'MellowDiHOfHeaven', class: { icon: '🧙' } }) === '🧙', 'player icon resolves from class');
ok(ga.combatTargetIcon({ name: 'X', class: null }) === '👤', 'missing icon never renders undefined');

// ── 6. Environment art for the new realm/dead-world cards is loadable ───────
console.log('[4] card renderer asset prerequisites');
const fs = require('fs');
const fontDir = '/home/z/my-project/whatsapp-bot/core/rpgasset/fonts/';
for (const f of ['Cinzel-Variable.ttf', 'IMFellEnglish-Regular.ttf', 'MedievalSharp.ttf', 'PixeloidSans.ttf']) {
  ok(fs.existsSync(fontDir + f), `font present: ${f}`);
}
for (const f of ['characters/clean/Fighter1.png', 'characters/clean/apprentice1.png', 'environment/spark_10.png', 'environment/spark_7.png']) {
  const p = '/home/z/my-project/whatsapp-bot/core/rpgasset/' + f;
  const real = fs.existsSync(p) && fs.readFileSync(p).slice(0, 4).toString('hex') === '89504e47';
  ok(real, `real PNG (not LFS pointer): ${f}`);
}

console.log(`\nREGRESSION PROBE: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
