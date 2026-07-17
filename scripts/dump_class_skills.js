// Dump current skills for each under-skilled class so we can design additions
require('/home/z/my-project/scripts/test_harness.js');
const st = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/skillTree.js');
const SK = st.SKILL_TREES || st.skillTrees || st;

// The under-skilled classes from my earlier audit
const targets = [
  'DIVINE_FIST', 'DEATH_LORD',        // 1 skill each
  'CLERIC', 'NINJA', 'MONK', 'ELEMENTALIST', 'WARLOCK', 'DRUID', 'SAMURAI',  // 2 skills
  'AVATAR', 'SHOGUN', 'KAGE', 'REAPER', 'GOD_HAND',  // 4 skills
  'WARLORD', 'DOOMSLAYER', 'TIMELORD', 'SAINT', 'ARCHDRUID',
  'TYCOON', 'NIGHTBLADE', 'ZENMASTER', 'VIRTUOSO', 'GRAND_INVENTOR',  // 5 skills
];

for (const cls of targets) {
  if (!SK[cls]) { console.log(`\n## ${cls} — NOT FOUND`); continue; }
  console.log(`\n## ${cls}`);
  const tree = SK[cls];
  if (tree.trees) {
    for (const [treeName, treeData] of Object.entries(tree.trees)) {
      console.log(`\n### Tree: ${treeName} — ${treeData.name || ''}`);
      if (treeData.skills) {
        for (const [skillId, skill] of Object.entries(treeData.skills)) {
          console.log(`  - ${skillId} (${skill.name}) — L${skill.requiredLevel||'?'}, tier ${skill.tier||'?'}, cd ${skill.cooldown||0}, dmgMult ${JSON.stringify(skill.damageMultiplier||'none')}, type ${skill.damageType||'?'}, targeting ${skill.targeting||'?'}`);
          if (skill.effects) console.log(`    effects: ${JSON.stringify(skill.effects).slice(0,150)}`);
          if (skill.description) console.log(`    desc: ${skill.description.slice(0,100)}`);
          if (skill.isUltimate) console.log(`    ⭐ ULTIMATE`);
        }
      }
    }
  } else {
    console.log(`  (no 'trees' field — top-level keys: ${Object.keys(tree).join(', ')})`);
  }
}
