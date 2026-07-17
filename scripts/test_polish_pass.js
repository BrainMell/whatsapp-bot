// Test: Polish pass — verify new effect handlers + bug fixes
require('/home/z/my-project/scripts/test_harness.js');
const fs = require('fs');
const st = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/skillTree.js');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); }
}

console.log('\n=== Polish Pass: Effect Handler Verification ===\n');

const SK = st.SKILL_TREES || st;
const gaSrc = fs.readFileSync('/home/z/my-project/repo/whatsapp-bot/core/rpg/guildAdventure.js', 'utf8');

// 1. Skill field renames
const monkMeditation = SK.MONK.trees.ZEN.skills.meditation;
check('MONK meditation uses energyRestore (not restore_energy)',
  monkMeditation.effects.energyRestore !== undefined &&
  monkMeditation.effects.restore_energy === undefined);

const deathLordAura = SK.DEATH_LORD.trees.DEATH.skills.death_aura;
check('DEATH_LORD death_aura uses debuff_enemies (not debuff)',
  deathLordAura.effects.debuff_enemies !== undefined &&
  deathLordAura.effects.debuff === undefined);

const soulTether = SK.DEATH_LORD.trees.DEATH.skills.soul_tether;
check('DEATH_LORD soul_tether has lifestealPercent at top level (not nested in heal)',
  soulTether.effects.lifestealPercent !== undefined &&
  soulTether.effects.heal.lifestealPercent === undefined);

// 2. New effect handlers in applyAbilityEffect
check('cleanse handler in applyAbilityEffect',
  gaSrc.includes('effId === "cleanse"'));
check('selfDamage handler in applyAbilityEffect',
  gaSrc.includes('effId === "selfDamage"'));
check('lifestealPercent handler in applyAbilityEffect',
  gaSrc.includes('effId === "lifestealPercent"'));
check('counterattack handler in applyAbilityEffect',
  gaSrc.includes('effId === "counterattack"'));
check('thorns handler in applyAbilityEffect',
  gaSrc.includes('effId === "thorns"'));
check('ignoreDefense handler in applyAbilityEffect',
  gaSrc.includes('effId === "ignoreDefense"'));
check('evasion handler in applyAbilityEffect',
  gaSrc.includes('effId === "evasion"'));
check('summon handler (stub) in applyAbilityEffect',
  gaSrc.includes('effId === "summon"'));

// 3. Counterattack / thorns / evasion buff wire-up in damage-taken code
check('Evasion buff check in enemy-attacks-player path',
  gaSrc.includes("EVASION BUFF") && gaSrc.includes("evasionBuff"));
check('Thorns buff reflection in damage-taken path',
  gaSrc.includes("THORNS BUFF") && gaSrc.includes("thornsBuff"));
check('Counterattack buff retaliation in damage-taken path',
  gaSrc.includes("COUNTERATTACK BUFF") && gaSrc.includes("counterBuff"));

// 4. damageType normalization (pre-existing bug fix)
check('damageType normalized to uppercase before comparison (single-target)',
  gaSrc.includes("rawDmgType = String(effect.damageType") && gaSrc.includes("'MAGICAL'"));
check('damageType normalized for AOE path too',
  gaSrc.includes("aoeRawDmgType = String(effect.damageType"));
check("TRUE damage type recognized as distinct from physical/magic",
  gaSrc.includes("rawDmgType === 'TRUE'"));

// 5. Bypass shield wire-up
check('bypassShield check in shield absorption block',
  gaSrc.includes('!effect?.bypassShield'));

// 6. Verify all 30 new skills still load
const newSkillIds = [
  ['CLERIC', 'smite'], ['CLERIC', 'blessing'], ['CLERIC', 'cleanse'],
  ['NINJA', 'shadow_clone_jutsu'], ['NINJA', 'poison_kunai'], ['NINJA', 'kunai_storm'],
  ['MONK', 'ki_blast'], ['MONK', 'whirlwind_kick'], ['MONK', 'meditation'],
  ['ELEMENTALIST', 'flame_burst'], ['ELEMENTALIST', 'frost_nova'], ['ELEMENTALIST', 'chain_lightning'],
  ['WARLOCK', 'curse_of_agony'], ['WARLOCK', 'demon_armor'], ['WARLOCK', 'hellfire'],
  ['DRUID', 'entangle'], ['DRUID', 'healing_bloom'], ['DRUID', 'thorn_surge'],
  ['SAMURAI', 'frontal_cut'], ['SAMURAI', 'mindful_stance'], ['SAMURAI', 'whirlwind_blade'],
  ['WARLORD', 'wide_cleave'], ['WARLORD', 'shield_bash'], ['WARLORD', 'banner_charge'],
  ['DIVINE_FIST', 'iron_palm'], ['DIVINE_FIST', 'heavenly_step'], ['DIVINE_FIST', 'eight_gates'],
  ['DEATH_LORD', 'raise_dead'], ['DEATH_LORD', 'death_aura'], ['DEATH_LORD', 'soul_tether'],
];
let loadedCount = 0;
for (const [cls, id] of newSkillIds) {
  const tree = SK[cls];
  if (!tree) continue;
  for (const treeData of Object.values(tree.trees || {})) {
    if ((treeData.skills || {})[id]) { loadedCount++; break; }
  }
}
check(`All 30 new skills still load (${loadedCount}/30)`, loadedCount === 30);

console.log(`\n--- Polish: ${pass}/${pass + fail} passed, ${fail} failed ---\n`);
process.exit(fail > 0 ? 1 : 0);
