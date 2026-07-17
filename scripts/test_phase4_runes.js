// Test: Phase 4 Rune Customization System
require('/home/z/my-project/scripts/test_harness.js');
const runeSystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/runeSystem.js');
const fs = require('fs');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); }
}

console.log('\n=== Phase 4: Rune Customization System ===\n');

// 1. Verify all 30 new runes are registered
const newRunes = [
  'FROST_CONVERSION', 'SHOCK_CONVERSION', 'VOID_CONVERSION',
  'MULTI_SHOT', 'CHAIN_BOUNCE', 'SPREAD_BLAST', 'PRECISE_FOCUS',
  'FRAGMENT', 'BARRAGE',
  'GROUND_FIRE', 'FROST_PATCH', 'POISON_CLOUD',
  'POISON_INFUSION', 'BLEED_INFUSION', 'BURN_INFUSION', 'FREEZE_INFUSION',
  'SHOCK_INFUSION', 'STUN_INFUSION', 'SILENCE_INFUSION', 'BLIND_INFUSION',
  'CURSE_INFUSION', 'FEAR_INFUSION',
  'LIFESTEAL', 'MANA_DRAIN', 'SOUL_RIP',
  'KNOCKBACK', 'PULL', 'TAUNT',
  'QUICK_CAST', 'EFFICIENT_CAST',
];

for (const runeId of newRunes) {
  check(`${runeId} registered`, !!runeSystem.RUNE_TYPES[runeId]);
}

// Total rune count: 7 original (POWER, EFFICIENCY, SPREAD, FOCUS, ENDURANCE, PIERCE, COOLDOWN) + 30 new = 37
check('Total rune count = 37 (7 original + 30 new)',
  Object.keys(runeSystem.RUNE_TYPES).length === 37,
  `actual: ${Object.keys(runeSystem.RUNE_TYPES).length}`);

// 2. Test applyRuneModifiers handles new fields
const baseEffect = { multiplier: 1, cost: 50 };

// LIFESTEAL rune
const lifestealRune = { type: 'LIFESTEAL', tier: 'NORMAL' };
const lsEffect = runeSystem.applyRuneModifiers(baseEffect, [lifestealRune]);
check('LIFESTEAL sets lifestealPercent',
  lsEffect.lifestealPercent === 25,
  `got: ${lsEffect.lifestealPercent}`);

// POISON_INFUSION
const poisonRune = { type: 'POISON_INFUSION', tier: 'GREATER' };
const pEffect = runeSystem.applyRuneModifiers(baseEffect, [poisonRune]);
check('POISON_INFUSION adds poison status',
  pEffect.addStatuses && pEffect.addStatuses.length === 1 && pEffect.addStatuses[0].type === 'poison',
  `got: ${JSON.stringify(pEffect.addStatuses)}`);
check('POISON_INFUSION GREATER tier value = 40',
  pEffect.addStatuses[0].value === 40,
  `got: ${pEffect.addStatuses[0].value}`);

// FROST_CONVERSION
const frostRune = { type: 'FROST_CONVERSION', tier: 'NORMAL' };
const fEffect = runeSystem.applyRuneModifiers({ ...baseEffect, element: 'FIRE' }, [frostRune]);
check('FROST_CONVERSION sets element to ICE',
  fEffect.element === 'ICE',
  `got: ${fEffect.element}`);
check('FROST_CONVERSION sets convertBurnToFreeze flag',
  fEffect.convertBurnToFreeze === true);

// QUICK_CAST
const quickRune = { type: 'QUICK_CAST', tier: 'NORMAL' };
const qEffect = runeSystem.applyRuneModifiers({ ...baseEffect, cooldown: 5 }, [quickRune]);
check('QUICK_CAST sets cooldownFlatReduction = 1',
  qEffect.cooldownFlatReduction === 1);
check('QUICK_CAST adds energy cost penalty',
  qEffect.cost === 60,  // 50 * 1.20 = 60
  `got: ${qEffect.cost}`);

// SPREAD_BLAST
const spreadRune = { type: 'SPREAD_BLAST', tier: 'GREATER' };
const sEffect = runeSystem.applyRuneModifiers({ ...baseEffect, targeting: 'SINGLE' }, [spreadRune]);
check('SPREAD_BLAST converts targeting to AOE_LARGE',
  sEffect.targeting === 'AOE_LARGE',
  `got: ${sEffect.targeting}`);

// PRECISE_FOCUS
const preciseRune = { type: 'PRECISE_FOCUS', tier: 'GREATER' };
const prEffect = runeSystem.applyRuneModifiers({ ...baseEffect, targeting: 'AOE' }, [preciseRune]);
check('PRECISE_FOCUS converts targeting to SINGLE',
  prEffect.targeting === 'SINGLE');
check('PRECISE_FOCUS sets guaranteedCrit',
  prEffect.guaranteedCrit === true);

// FRAGMENT
const fragRune = { type: 'FRAGMENT', tier: 'NORMAL' };
const frEffect = runeSystem.applyRuneModifiers(baseEffect, [fragRune]);
check('FRAGMENT sets splitIntoHits = 3',
  frEffect.splitIntoHits === 3);
check('FRAGMENT splitDamageMult = 0.40',
  frEffect.splitDamageMult === 0.40);

// GROUND_FIRE
const gfRune = { type: 'GROUND_FIRE', tier: 'GREATER' };
const gfEffect = runeSystem.applyRuneModifiers(baseEffect, [gfRune]);
check('GROUND_FIRE sets groundEffect with type burn',
  gfEffect.groundEffect && gfEffect.groundEffect.type === 'burn');
check('GROUND_FIRE GREATER value = 35',
  gfEffect.groundEffect.value === 35);

// SOUL_RIP
const srRune = { type: 'SOUL_RIP', tier: 'GREATER' };
const srEffect = runeSystem.applyRuneModifiers(baseEffect, [srRune]);
check('SOUL_RIP sets executeThreshold = 20',
  srEffect.executeThreshold === 20);
check('SOUL_RIP GREATER executeBonus = 3.0',
  srEffect.executeBonus === 3.0);

// FEAR_INFUSION (multiple statuses)
const fearRune = { type: 'FEAR_INFUSION', tier: 'NORMAL' };
const feEffect = runeSystem.applyRuneModifiers(baseEffect, [fearRune]);
check('FEAR_INFUSION adds 2 statuses (slow + stun)',
  feEffect.addStatuses && feEffect.addStatuses.length === 2 &&
  feEffect.addStatuses.some(s => s.type === 'slow') &&
  feEffect.addStatuses.some(s => s.type === 'stun'));

// 3. Verify the applyAbilityEffect post-processing is in place
const gaSrc = fs.readFileSync('/home/z/my-project/repo/whatsapp-bot/core/rpg/guildAdventure.js', 'utf8');
check('applyAbilityEffect has LIFESTEAL post-processing',
  gaSrc.includes('RUNE: LIFESTEAL'));
check('applyAbilityEffect has addStatuses post-processing',
  gaSrc.includes('RUNE: addStatuses'));
check('applyAbilityEffect has GROUND_EFFECT post-processing',
  gaSrc.includes('RUNE: GROUND_EFFECT'));
check('applyAbilityEffect has SOUL_RIP execute post-processing',
  gaSrc.includes('SOUL RIP!'));
check('applyAbilityEffect has convertBurnToFreeze post-processing',
  gaSrc.includes('burn flash-freezes'));
check('applyAbilityEffect has applyWet post-processing',
  gaSrc.includes('primed for SHOCK synergy'));
check('useAbility applies cooldownFlatReduction',
  gaSrc.includes('- cooldownFlatReduction'));

// 4. Verify rollRuneDrop can return new types
const drops = [];
for (let i = 0; i < 500; i++) {
  const d = runeSystem.rollRuneDrop(1.0);
  if (d) drops.push(d);
}
const dropTypes = new Set(drops.map(d => d.type));
let newDropsFound = 0;
for (const r of newRunes) {
  if (dropTypes.has(r)) newDropsFound++;
}
check(`rollRuneDrop returns new rune types (found ${newDropsFound}/30)`,
  newDropsFound >= 20,
  `only ${newDropsFound}/30 new types dropped in 500 rolls`);

console.log(`\n--- Phase 4 Runes: ${pass}/${pass + fail} passed, ${fail} failed ---\n`);
process.exit(fail > 0 ? 1 : 0);
