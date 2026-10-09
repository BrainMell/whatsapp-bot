// class_skill_audit2.js — v2: normalize BOTH skill schemas through
// getSkillEffect (the function combat actually uses), cap aoe targets at 4
// (99 = "all enemies" semantics), and audit every live class.
const st = require('/home/ubuntu/whatsapp-bot/core/rpg/skillTree.js');
const cs = require('/home/ubuntu/whatsapp-bot/core/rpg/classSystem.js');

const SKILL_TREES = st.SKILL_TREES;
const se = st.getSkillEffect;
const CLASSES = cs.getAllClasses();
const STARTERS = Object.keys(cs.STARTER_CLASSES);
const TIER_RANK = { STARTER: 0, EVOLVED: 1, ASCENDED: 2, PEAK: 3 };
const TARGET_CAP = 4; // realistic encounter width

function norm(skill, lvl) {
  try {
    const e = se(skill, lvl) || {};
    const mult = Number(e.multiplier) || 0;
    const rawT = Number(e.targets) || 1;
    const targets = e.type === 'aoe' ? Math.min(rawT, TARGET_CAP) || 1 : 1;
    return {
      type: e.type || 'none',
      power: mult * targets,
      mult, rawT, targets,
      heal: Number(e.value) || 0,
      cc: !!e.cc, dot: !!e.dot, buff: !!(e.buffType || e.buff), debuff: !!e.debuffType,
      revive: /revive/.test(e.type || ''),
    };
  } catch (err) { return { type: 'error', power: 0, heal: 0, mult: 0, targets: 1, err: err.message }; }
}

function classProfile(classId) {
  const tree = SKILL_TREES[classId];
  if (!tree || !tree.trees) return null;
  const p = { classId, maxPower: 0, maxAoe: 0, maxHeal: 0, maxShield: 0, t1Power: 0,
    utility: 0, count: 0, errors: 0, top: null, best: [], skills: [] };
  for (const [, td] of Object.entries(tree.trees)) {
    for (const [, s] of Object.entries(td.skills || {})) {
      const eMax = norm(s, s.maxLevel || 1);
      const e1 = norm(s, 1);
      p.count++;
      if (eMax.err) p.errors++;
      if (eMax.type === 'aoe') { if (eMax.power > p.maxAoe) { p.maxAoe = eMax.power; p.top = s.id + ' ' + eMax.mult + 'x' + eMax.targets; } }
      else {
        if (eMax.power > p.maxPower) { p.maxPower = eMax.power; p.top = s.id + ' ' + eMax.mult + 'x'; }
        p.best.push({ id: s.id, tier: s.tier, power: eMax.power, type: eMax.type });
      }
      if (/heal/.test(eMax.type)) p.maxHeal = Math.max(p.maxHeal, eMax.heal || 0);
      if (eMax.type === 'shield') p.maxShield = Math.max(p.maxShield, eMax.heal || 0);
      if (eMax.cc || eMax.dot || eMax.debuff || eMax.revive) p.utility++;
      if ((s.tier || 1) === 1) p.t1Power = Math.max(p.t1Power, eMax.power);
      p.skills.push({ id: s.id, tier: s.tier, maxLevel: s.maxLevel, schema: typeof s.effect === 'function' ? 'fn' : 'data',
        p1: e1.power, pMax: eMax.power, type: eMax.type });
    }
  }
  return p;
}

const profiles = {};
for (const id of Object.keys(CLASSES)) profiles[id] = classProfile(id);
const starterMax = Math.max(...STARTERS.map(s => profiles[s]?.maxPower || 0));
const starterAoe = Math.max(...STARTERS.map(s => profiles[s]?.maxAoe || 0));

console.log(`STARTER BASELINE: maxPower=${starterMax.toFixed(2)} maxAoe=${starterAoe.toFixed(2)} (targets capped ${TARGET_CAP})`);
console.log('');
const rows = [];
for (const [id, c] of Object.entries(CLASSES)) {
  const p = profiles[id] || { maxPower: 0, maxAoe: 0, maxHeal: 0, maxShield: 0, count: 0, utility: 0, errors: 0, top: '-' };
  rows.push({ id, tier: c.tier, parent: c.evolvedFrom || '-', ...p });
}
rows.sort((a, b) => (TIER_RANK[a.tier] - TIER_RANK[b.tier]) || (a.maxPower - b.maxPower));
console.log('tier      class           maxHit  aoe(x4)  heal  shield  sk  util  top-skill');
for (const r of rows) {
  const flag = (TIER_RANK[r.tier] >= 1 && r.maxPower < starterMax) ? '  ⚠️' : '';
  console.log(`${r.tier.padEnd(9)} ${r.id.padEnd(15)} ${r.maxPower.toFixed(2).padStart(6)} ${r.maxAoe.toFixed(2).padStart(7)} ${String(r.maxHeal).padStart(6)} ${String(r.maxShield).padStart(6)} ${String(r.count).padStart(3)} ${String(r.utility).padStart(5)}  ${r.top || '-'}${flag}`);
}

console.log('\nCHAIN INVERSIONS (class < its evolvedFrom):');
for (const [id, parent] of Object.entries(Object.fromEntries(Object.entries(CLASSES).filter(([, c]) => c.evolvedFrom).map(([i, c]) => [i, c.evolvedFrom])))) {
  const p = profiles[id], pp = profiles[parent];
  if (!p || !pp) continue;
  if (p.maxPower < pp.maxPower * 0.999 || p.maxAoe < pp.maxAoe * 0.999)
    console.log(`  ${id} (${p.maxPower.toFixed(2)}/${p.maxAoe.toFixed(2)}) < ${parent} (${pp.maxPower.toFixed(2)}/${pp.maxAoe.toFixed(2)})`);
}

const fs = require('fs');
fs.writeFileSync('/tmp/gw_audit2.json', JSON.stringify({
  starterMax, starterAoe, targetCap: TARGET_CAP,
  rows: rows.map(r => ({ id: r.id, tier: r.tier, parent: r.parent, maxPower: r.maxPower, maxAoe: r.maxAoe, maxHeal: r.maxHeal, maxShield: r.maxShield, count: r.count, utility: r.utility, t1Power: r.t1Power, skills: r.skills })),
}, null, 1));
console.log('\nwrote class_skill_audit2.json');
