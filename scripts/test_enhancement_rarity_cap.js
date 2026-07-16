// Test: rarity-based enhancement cap + COOLDOWN rune behavior
// Run: node scripts/test_enhancement_rarity_cap.js
require('/home/z/my-project/scripts/test_harness.js');

const inventorySystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/inventorySystem.js');
const runeSystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/runeSystem.js');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '\n        ' + detail : ''}`); }
}

console.log('\n=== Rarity-Based Enhancement Cap Tests ===\n');

// getMaxEnhancementLevel: rarity lookup
check('Common → 5',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'COMMON' }) === 5);
check('Uncommon → 10',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'UNCOMMON' }) === 10);
check('Rare → 15',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'RARE' }) === 15);
check('Epic → 20',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'EPIC' }) === 20);
check('Legendary → 25',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'LEGENDARY' }) === 25);
check('Mythic → 30',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'MYTHIC' }) === 30);
check('Unknown rarity → default 5',
  inventorySystem.getMaxEnhancementLevel({ rarity: 'WAT' }) === 5);
check('Missing rarity → default 5',
  inventorySystem.getMaxEnhancementLevel({}) === 5);
check('Null item → default 5',
  inventorySystem.getMaxEnhancementLevel(null) === 5);

// Exported maps
check('MAX_ENHANCEMENT_LEVEL_BY_RARITY exported',
  !!inventorySystem.MAX_ENHANCEMENT_LEVEL_BY_RARITY &&
  inventorySystem.MAX_ENHANCEMENT_LEVEL_BY_RARITY.MYTHIC === 30);
check('DEFAULT_MAX_ENHANCEMENT_LEVEL exported',
  inventorySystem.DEFAULT_MAX_ENHANCEMENT_LEVEL === 5);
check('MAX_ENHANCEMENT_LEVEL still exported (back-compat)',
  inventorySystem.MAX_ENHANCEMENT_LEVEL === 5);
check('repairItemStats still exported',
  typeof inventorySystem.repairItemStats === 'function');
check('repairUserEquipmentStats still exported',
  typeof inventorySystem.repairUserEquipmentStats === 'function');
check('enhanceItem still exported',
  typeof inventorySystem.enhanceItem === 'function');

console.log('\n=== COOLDOWN Rune Tests ===\n');

// COOLDOWN rune is in RUNE_TYPES
check('COOLDOWN rune type registered',
  !!runeSystem.RUNE_TYPES.COOLDOWN,
  `got: ${JSON.stringify(runeSystem.RUNE_TYPES.COOLDOWN || {})}`);

if (runeSystem.RUNE_TYPES.COOLDOWN) {
  check('COOLDOWN icon ⏱️',
    runeSystem.RUNE_TYPES.COOLDOWN.icon === '⏱️');
  check('COOLDOWN cooldownMult array of 4 tiers',
    Array.isArray(runeSystem.RUNE_TYPES.COOLDOWN.cooldownMult) &&
    runeSystem.RUNE_TYPES.COOLDOWN.cooldownMult.length === 4);
  check('COOLDOWN LESSER = 0.75 (-25%)',
    runeSystem.RUNE_TYPES.COOLDOWN.cooldownMult[0] === 0.75);
  check('COOLDOWN NORMAL = 0.50 (-50%)',
    runeSystem.RUNE_TYPES.COOLDOWN.cooldownMult[1] === 0.50);
  check('COOLDOWN GREATER = 0.25 (-75%)',
    runeSystem.RUNE_TYPES.COOLDOWN.cooldownMult[2] === 0.25);
  check('COOLDOWN ABYSSAL = 0.00 (no cooldown)',
    runeSystem.RUNE_TYPES.COOLDOWN.cooldownMult[3] === 0.00);
}

// RUNE_TIERS now includes ABYSSAL (was broken before the syntax fix)
check('RUNE_TIERS has 4 tiers (LESSER, NORMAL, GREATER, ABYSSAL)',
  Object.keys(runeSystem.RUNE_TIERS).length === 4 &&
  !!runeSystem.RUNE_TIERS.ABYSSAL,
  `got: ${Object.keys(runeSystem.RUNE_TIERS)}`);
check('ABYSSAL multIndex = 3',
  runeSystem.RUNE_TIERS.ABYSSAL?.multIndex === 3);

// applyRuneModifiers: COOLDOWN rune reduces cooldown
const baseEffect = { cost: 50, multiplier: 1 };
const lesserCdRune = { type: 'COOLDOWN', tier: 'LESSER' };
const normalCdRune = { type: 'COOLDOWN', tier: 'NORMAL' };
const greaterCdRune = { type: 'COOLDOWN', tier: 'GREATER' };
const abyssalCdRune = { type: 'COOLDOWN', tier: 'ABYSSAL' };

check('LESSER COOLDOWN rune sets cooldownMult = 0.75',
  runeSystem.applyRuneModifiers(baseEffect, [lesserCdRune]).cooldownMult === 0.75,
  `got: ${runeSystem.applyRuneModifiers(baseEffect, [lesserCdRune]).cooldownMult}`);
check('NORMAL COOLDOWN rune sets cooldownMult = 0.50',
  runeSystem.applyRuneModifiers(baseEffect, [normalCdRune]).cooldownMult === 0.50);
check('GREATER COOLDOWN rune sets cooldownMult = 0.25',
  runeSystem.applyRuneModifiers(baseEffect, [greaterCdRune]).cooldownMult === 0.25);
check('ABYSSAL COOLDOWN rune sets cooldownMult = 0.00 (no cooldown)',
  runeSystem.applyRuneModifiers(baseEffect, [abyssalCdRune]).cooldownMult === 0.00);

// No cooldown rune = no cooldownMult field added (falls back to 1 in useAbility)
check('No runes = no cooldownMult field',
  runeSystem.applyRuneModifiers(baseEffect, []).cooldownMult === undefined);

// Stacking two LESSER = 0.75 × 0.75 = 0.5625 (diminishing returns)
check('Two LESSER COOLDOWN runes multiply (0.75 × 0.75 = 0.5625)',
  runeSystem.applyRuneModifiers(baseEffect, [lesserCdRune, lesserCdRune]).cooldownMult === 0.5625,
  `got: ${runeSystem.applyRuneModifiers(baseEffect, [lesserCdRune, lesserCdRune]).cooldownMult}`);

// Energy cost still applied (COOLDOWN rune has energyCostMult penalty)
check('LESSER COOLDOWN rune applies energy cost penalty (×1.15)',
  runeSystem.applyRuneModifiers(baseEffect, [lesserCdRune]).cost === 58,
  `got: ${runeSystem.applyRuneModifiers(baseEffect, [lesserCdRune]).cost}`);  // ceil(50 × 1.15) = 58
check('ABYSSAL COOLDOWN rune applies max energy penalty (×1.30)',
  runeSystem.applyRuneModifiers(baseEffect, [abyssalCdRune]).cost === 65,
  `got: ${runeSystem.applyRuneModifiers(baseEffect, [abyssalCdRune]).cost}`);  // ceil(50 × 1.30) = 65

// rollRuneDrop can return COOLDOWN type
const drops = [];
for (let i = 0; i < 200; i++) {
  const d = runeSystem.rollRuneDrop(1.0);  // 100% drop rate
  if (d) drops.push(d);
}
check('rollRuneDrop can return COOLDOWN type',
  drops.some(d => d.type === 'COOLDOWN'),
  `types seen: ${[...new Set(drops.map(d => d.type))].sort().join(', ')}`);

console.log(`\n--- Enhancement + Runes: ${pass}/${pass + fail} passed, ${fail} failed ---\n`);
process.exit(fail > 0 ? 1 : 0);
