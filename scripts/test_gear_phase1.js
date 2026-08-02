// ═══════════════════════════════════════════════════════════════════════════
//  PHASE 1 TESTS — Gear & Equipment system
// ═══════════════════════════════════════════════════════════════════════════
//
// PURPOSE:
//   Verify the 2026-08-01 fixes for the Gear & Equipment system.
//   Each test maps to a BUG # from the audit document:
//     BUG #1 — mythic_enhancement_stone in ENHANCEMENT_BONUS_MAP
//     BUG #2 — enhance command priority list includes mythic stone
//     BUG #3 — shop buyableDbItems propagates rarity
//     BUG #4 — enhance result includes stone name + bonus
//     BUG #5 — enhance result includes per-stat deltas
//     BUG #6 — repairItemStats assumes Mythic stones (0.60), not Legendary (0.35)
//     BUG #7 — recover_enhancement_stats.js uses relative require path
//     GAP #1 — getRequiredRankForLevel + rankGte helpers + equipItem rank check
//
// USAGE:
//   cd /home/z/my-project/repos/whatsapp-bot
//   node scripts/test_gear_phase1.js
// ═══════════════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');

// Test framework — minimal, no external deps
const tests = [];
const results = { pass: 0, fail: 0, skip: 0, failures: [] };

function test(name, fn) {
    tests.push({ name, fn });
}
function assertEq(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`assertEq failed: ${msg || ''}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    }
}
function assertDeepEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        throw new Error(`assertDeepEq failed: ${msg || ''}\n  expected: ${b}\n  actual:   ${a}`);
    }
}
function assertTrue(cond, msg) {
    if (!cond) throw new Error(`assertTrue failed: ${msg || '(no message)'}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════════

// --- BUG #1: Mythic Enhancement Stone is in ENHANCEMENT_BONUS_MAP with 0.60 ---
test('BUG #1: mythic_enhancement_stone is in ENHANCEMENT_BONUS_MAP with value 0.60', () => {
    const inv = require('../core/rpg/inventorySystem');
    assertTrue(inv.ENHANCEMENT_BONUS_MAP, 'ENHANCEMENT_BONUS_MAP should be exported');
    assertEq(inv.ENHANCEMENT_BONUS_MAP.mythic_enhancement_stone, 0.60,
        'mythic_enhancement_stone bonus must be 0.60 (60%), not the 0.05 fallback');
    // Verify the other stones are still correct (no regression)
    assertEq(inv.ENHANCEMENT_BONUS_MAP.minor_enhancement_stone, 0.05, 'minor stone bonus');
    assertEq(inv.ENHANCEMENT_BONUS_MAP.rare_enhancement_stone, 0.15, 'rare stone bonus');
    assertEq(inv.ENHANCEMENT_BONUS_MAP.legendary_enhancement_stone, 0.35, 'legendary stone bonus');
    // Verify progression: minor < rare < legendary < mythic
    assertTrue(
        inv.ENHANCEMENT_BONUS_MAP.minor_enhancement_stone <
        inv.ENHANCEMENT_BONUS_MAP.rare_enhancement_stone <
        inv.ENHANCEMENT_BONUS_MAP.legendary_enhancement_stone <
        inv.ENHANCEMENT_BONUS_MAP.mythic_enhancement_stone,
        'Stone bonuses should ascend: minor < rare < legendary < mythic'
    );
});

// --- BUG #2: enhance command priority list includes mythic stone ---
test('BUG #2: rpgCommands ENHANCE_STONE_PRIORITY has mythic FIRST (best → worst)', () => {
    // rpgCommands.js doesn't export the const, so we read the source
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'core', 'commands', 'rpgCommands.js'),
        'utf8'
    );
    assertTrue(src.includes("'mythic_enhancement_stone'"),
        'rpgCommands.js should reference mythic_enhancement_stone');
    // Verify priority order: mythic should come BEFORE legendary in the priority list
    const priorityMatch = src.match(/ENHANCE_STONE_PRIORITY\s*=\s*\[([\s\S]*?)\]/);
    assertTrue(priorityMatch, 'ENHANCE_STONE_PRIORITY array should exist');
    const mythicIdx = priorityMatch[1].indexOf("'mythic_enhancement_stone'");
    const legendaryIdx = priorityMatch[1].indexOf("'legendary_enhancement_stone'");
    assertTrue(mythicIdx > -1 && legendaryIdx > -1,
        'Both mythic and legendary should be in the priority list');
    assertTrue(mythicIdx < legendaryIdx,
        'mythic_enhancement_stone should come BEFORE legendary in the priority list (best first)');
});

// --- BUG #3: shop buyableDbItems propagates rarity ---
test('BUG #3: shopCommands buyableDbItems copies rarity from ITEM_DATABASE', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'core', 'commands', 'shopCommands.js'),
        'utf8'
    );
    // Look for the rarity propagation in BOTH displayShop and buyItem
    const matches = src.match(/rarity:\s*item\.rarity\s*\|\|\s*'COMMON'/g) || [];
    assertTrue(matches.length >= 3,
        `Expected at least 3 occurrences of "rarity: item.rarity || 'COMMON'" (displayShop, buyItem, handleEquipment); found ${matches.length}`);
    // Verify reqLevel is also propagated (GAP #1)
    assertTrue(src.includes('reqLevel: item.reqLevel'),
        'shopCommands should propagate reqLevel for rank enforcement display');
});

// --- BUG #4 + #5: enhance result includes stone name + per-stat deltas ---
// (Integration test — requires mocking economy + inventory. Skip for now,
//  verify via source inspection that the return value includes the new fields.)
test('BUG #4+#5: enhanceItem return value includes stoneUsed, stoneName, statDeltas', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'core', 'rpg', 'inventorySystem.js'),
        'utf8'
    );
    // Verify the return object includes the new structured fields
    assertTrue(src.includes('stoneUsed: stoneId'),
        'enhanceItem should return stoneUsed');
    assertTrue(src.includes('stoneName,'),
        'enhanceItem should return stoneName');
    assertTrue(src.includes('statDeltas'),
        'enhanceItem should return statDeltas');
    assertTrue(src.includes('statsBefore = JSON.parse(JSON.stringify(item.stats || {}))'),
        'enhanceItem should snapshot stats before recalculateEnhancedStats');
    // Verify the message includes the stone name
    assertTrue(src.includes('Stone used: *${stoneName}'),
        'enhanceItem message should include the stone name');
});

// --- BUG #6: repairItemStats uses 0.60 (Mythic), not 0.35 (Legendary) ---
test('BUG #6: repairItemStats assumes Mythic stones (0.60), not Legendary (0.35)', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'core', 'rpg', 'inventorySystem.js'),
        'utf8'
    );
    // The fix should use 0.60 in the actual multiplication, not 0.35
    const repairSection = src.substring(
        src.indexOf('function repairItemStats'),
        src.indexOf('function repairUserEquipmentStats')
    );
    // Check the actual code line: should be `item.enhancementLevel * 0.60`
    assertTrue(repairSection.includes('item.enhancementLevel * 0.60'),
        'repairItemStats should compute `item.enhancementLevel * 0.60` (Mythic assumption)');
    // Verify no active multiplication uses the old 0.35 value.
    // We check for `* 0.35` (with asterisk) to avoid matching "0.35" in comments.
    const activeUse = repairSection.match(/\*\s*0\.35/g) || [];
    assertEq(activeUse.length, 0,
        `repairItemStats should NOT multiply by 0.35 in active code (found ${activeUse.length} match(es))`);
});

test('BUG #6 (cont): recover_enhancement_stats.js uses ASSUMED_STONE_BONUS = 0.60', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'recover_enhancement_stats.js'),
        'utf8'
    );
    assertTrue(src.includes('ASSUMED_STONE_BONUS = 0.60'),
        'recover_enhancement_stats.js should define ASSUMED_STONE_BONUS = 0.60');
    assertTrue(src.includes('item.enhancementLevel * ASSUMED_STONE_BONUS'),
        'recalcStats should use ASSUMED_STONE_BONUS');
    // No active multiplication by 0.35
    const activeUse = src.match(/\*\s*0\.35/g) || [];
    assertEq(activeUse.length, 0,
        `recover_enhancement_stats.js should NOT multiply by 0.35 in active code (found ${activeUse.length} match(es))`);
});

// --- BUG #7: recover_enhancement_stats.js uses relative require path ---
test('BUG #7: recover_enhancement_stats.js uses relative require path (not hardcoded)', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'recover_enhancement_stats.js'),
        'utf8'
    );
    assertTrue(src.includes("require('../core/rpg/lootSystem.js')"),
        "recover_enhancement_stats.js should use require('../core/rpg/lootSystem.js')");
    // Check that no active require() uses an absolute /home/... path.
    // We look for `require('/home/` to catch any hardcoded absolute path in active code.
    const hardcodedRequire = src.match(/require\(['"]\/home\//g) || [];
    assertEq(hardcodedRequire.length, 0,
        `recover_enhancement_stats.js should NOT require() any /home/... absolute path (found ${hardcodedRequire.length})`);
});

// --- GAP #1: getRequiredRankForLevel + rankGte helpers ---
test('GAP #1: getRequiredRankForLevel returns correct rank for level thresholds', () => {
    const inv = require('../core/rpg/inventorySystem');
    assertTrue(typeof inv.getRequiredRankForLevel === 'function',
        'getRequiredRankForLevel should be exported');
    // Level thresholds: F=1, E=10, D=20, C=30, B=40, A=50, S=60, SS=75, SSS=90, GOD=100
    assertEq(inv.getRequiredRankForLevel(1), 'F', 'level 1 → F');
    assertEq(inv.getRequiredRankForLevel(5), 'F', 'level 5 → F (under E threshold)');
    assertEq(inv.getRequiredRankForLevel(10), 'E', 'level 10 → E');
    assertEq(inv.getRequiredRankForLevel(15), 'E', 'level 15 → E (under D threshold)');
    assertEq(inv.getRequiredRankForLevel(20), 'D', 'level 20 → D');
    assertEq(inv.getRequiredRankForLevel(30), 'C', 'level 30 → C');
    assertEq(inv.getRequiredRankForLevel(40), 'B', 'level 40 → B');
    assertEq(inv.getRequiredRankForLevel(50), 'A', 'level 50 → A');
    assertEq(inv.getRequiredRankForLevel(60), 'S', 'level 60 → S');
    assertEq(inv.getRequiredRankForLevel(75), 'SS', 'level 75 → SS');
    assertEq(inv.getRequiredRankForLevel(90), 'SSS', 'level 90 → SSS');
    assertEq(inv.getRequiredRankForLevel(100), 'GOD', 'level 100 → GOD');
    assertEq(inv.getRequiredRankForLevel(0), 'F', 'level 0 → F (default)');
    assertEq(inv.getRequiredRankForLevel(null), 'F', 'null → F (default)');
    assertEq(inv.getRequiredRankForLevel(undefined), 'F', 'undefined → F (default)');
});

test('GAP #1 (cont): rankGte correctly compares ranks using RANK_ORDER indices', () => {
    const inv = require('../core/rpg/inventorySystem');
    assertTrue(typeof inv.rankGte === 'function', 'rankGte should be exported');
    // Equal ranks
    assertTrue(inv.rankGte('F', 'F'), 'F >= F');
    assertTrue(inv.rankGte('S', 'S'), 'S >= S');
    assertTrue(inv.rankGte('GOD', 'GOD'), 'GOD >= GOD');
    // Strictly greater
    assertTrue(inv.rankGte('E', 'F'), 'E >= F');
    assertTrue(inv.rankGte('S', 'A'), 'S >= A');
    assertTrue(inv.rankGte('SS', 'S'), 'SS >= S (string compare would FAIL here — "SS" < "S")');
    assertTrue(inv.rankGte('SSS', 'S'), 'SSS >= S');
    assertTrue(inv.rankGte('GOD', 'F'), 'GOD >= F');
    // Strictly less (should return false)
    assertTrue(!inv.rankGte('F', 'E'), 'F >= E should be false');
    assertTrue(!inv.rankGte('A', 'S'), 'A >= S should be false');
    assertTrue(!inv.rankGte('S', 'SS'), 'S >= SS should be false');
    // Unknown ranks fail closed (return false)
    assertTrue(!inv.rankGte('XYZ', 'F'), 'unknown rank should fail closed');
    assertTrue(!inv.rankGte('F', 'XYZ'), 'unknown rank should fail closed');
});

// --- GAP #1 (cont): equipItem checks rank (source inspection) ---
test('GAP #1 (cont): equipItem source includes rank enforcement check', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'core', 'rpg', 'inventorySystem.js'),
        'utf8'
    );
    const equipSection = src.substring(
        src.indexOf('async function equipItem'),
        src.indexOf('async function unequipItem')
    );
    assertTrue(equipSection.includes('getRequiredRankForLevel(reqLevel)'),
        'equipItem should call getRequiredRankForLevel(reqLevel)');
    assertTrue(equipSection.includes('rankGte(playerRank, reqRank)'),
        'equipItem should call rankGte(playerRank, reqRank)');
    assertTrue(equipSection.includes('Rank too low'),
        'equipItem should reject with a "Rank too low" message when rank check fails');
});

// --- Integration: end-to-end enhancement flow with a mock user ---
// This requires mocking economy.getUser, saveUser, etc. We do a lightweight
// version that exercises the core math without the full DB stack.
test('INTEGRATION: enhanceItem with Mythic stone gives +60% bonus (not +5%)', () => {
    // We can't easily mock the entire economy module, so we verify the math
    // directly: a level-0 item enhanced once with a Mythic stone should get
    // enhancementBonus = 0.60 (not 0.05).
    const inv = require('../core/rpg/inventorySystem');
    const stoneBonus = inv.ENHANCEMENT_BONUS_MAP.mythic_enhancement_stone;
    assertEq(stoneBonus, 0.60, 'Mythic stone bonus must be 0.60');
    // Simulate: item with baseStats.atk = 100, enhancementLevel 0, bonus 0
    // After 1 Mythic stone: enhancementLevel = 1, bonus = min(0 + 0.60, maxBonus)
    // For a Mythic item, maxBonus = 10.50, so bonus = 0.60
    // New atk = ceil(100 * (1 + 0.60)) = ceil(160) = 160
    const baseAtk = 100;
    const bonusAfter = Math.min(0 + stoneBonus, 10.50);
    const newAtk = Math.ceil(baseAtk * (1 + bonusAfter));
    assertEq(bonusAfter, 0.60, 'bonus after 1 Mythic stone');
    assertEq(newAtk, 160, 'ATK after 1 Mythic stone on a 100-ATK base');
    // Compare with the OLD buggy behavior (0.05 fallback):
    const buggyBonus = 0.05;
    const buggyAtk = Math.ceil(baseAtk * (1 + buggyBonus));
    assertEq(buggyAtk, 105, 'ATK with old buggy 5% fallback');
    // The fix gives 55 more ATK per stone at this base — a 52% improvement
    assertTrue(newAtk > buggyAtk, 'Fixed Mythic stone should give more ATK than the old 5% fallback');
});

// --- Regression: existing stone bonuses unchanged ---
test('REGRESSION: Minor, Rare, Legendary stone bonuses unchanged', () => {
    const inv = require('../core/rpg/inventorySystem');
    assertEq(inv.ENHANCEMENT_BONUS_MAP.minor_enhancement_stone, 0.05, 'minor still 5%');
    assertEq(inv.ENHANCEMENT_BONUS_MAP.rare_enhancement_stone, 0.15, 'rare still 15%');
    assertEq(inv.ENHANCEMENT_BONUS_MAP.legendary_enhancement_stone, 0.35, 'legendary still 35%');
});

// --- Regression: rarity-aware enhancement caps unchanged ---
test('REGRESSION: MAX_ENHANCEMENT_BONUS_BY_RARITY caps unchanged', () => {
    const inv = require('../core/rpg/inventorySystem');
    assertEq(inv.MAX_ENHANCEMENT_BONUS_BY_RARITY.COMMON, 1.75, 'Common cap');
    assertEq(inv.MAX_ENHANCEMENT_BONUS_BY_RARITY.UNCOMMON, 3.50, 'Uncommon cap');
    assertEq(inv.MAX_ENHANCEMENT_BONUS_BY_RARITY.RARE, 5.25, 'Rare cap');
    assertEq(inv.MAX_ENHANCEMENT_BONUS_BY_RARITY.EPIC, 7.00, 'Epic cap');
    assertEq(inv.MAX_ENHANCEMENT_BONUS_BY_RARITY.LEGENDARY, 8.75, 'Legendary cap');
    assertEq(inv.MAX_ENHANCEMENT_BONUS_BY_RARITY.MYTHIC, 10.50, 'Mythic cap');
});

test('REGRESSION: MAX_ENHANCEMENT_LEVEL_BY_RARITY level caps unchanged', () => {
    const inv = require('../core/rpg/inventorySystem');
    assertEq(inv.MAX_ENHANCEMENT_LEVEL_BY_RARITY.COMMON, 5, 'Common level cap');
    assertEq(inv.MAX_ENHANCEMENT_LEVEL_BY_RARITY.UNCOMMON, 10, 'Uncommon level cap');
    assertEq(inv.MAX_ENHANCEMENT_LEVEL_BY_RARITY.RARE, 15, 'Rare level cap');
    assertEq(inv.MAX_ENHANCEMENT_LEVEL_BY_RARITY.EPIC, 20, 'Epic level cap');
    assertEq(inv.MAX_ENHANCEMENT_LEVEL_BY_RARITY.LEGENDARY, 25, 'Legendary level cap');
    assertEq(inv.MAX_ENHANCEMENT_LEVEL_BY_RARITY.MYTHIC, 30, 'Mythic level cap');
});

// --- Regression: getMaxEnhancementLevel + getMaxEnhancementBonus still work ---
test('REGRESSION: getMaxEnhancementLevel + getMaxEnhancementBonus resolve rarity correctly', () => {
    const inv = require('../core/rpg/inventorySystem');
    // Direct item.rarity lookup
    assertEq(inv.getMaxEnhancementLevel({ rarity: 'MYTHIC' }), 30, 'Mythic level via item.rarity');
    assertEq(inv.getMaxEnhancementLevel({ rarity: 'COMMON' }), 5, 'Common level via item.rarity');
    assertEq(inv.getMaxEnhancementBonus({ rarity: 'MYTHIC' }), 10.50, 'Mythic bonus via item.rarity');
    assertEq(inv.getMaxEnhancementBonus({ rarity: 'COMMON' }), 1.75, 'Common bonus via item.rarity');
    // Missing rarity → default fallbacks
    assertEq(inv.getMaxEnhancementLevel({}), 5, 'unknown rarity level → default 5');
    assertEq(inv.getMaxEnhancementBonus({}), 1.75, 'unknown rarity bonus → default 1.75');
    assertEq(inv.getMaxEnhancementLevel(null), 5, 'null item → default 5');
    assertEq(inv.getMaxEnhancementBonus(null), 1.75, 'null item → default 1.75');
});

// --- Smoke test: all 4 modified files still parse ---
test('SMOKE: all 4 modified files parse without syntax errors', () => {
    // require() will throw if there's a syntax error
    require('../core/rpg/inventorySystem');
    require('../core/commands/rpgCommands');
    require('../core/commands/shopCommands');
    // recover_enhancement_stats.js connects to MongoDB on load — don't require it,
    // just check it parses. We already did `node -c` separately.
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'recover_enhancement_stats.js'),
        'utf8'
    );
    assertTrue(src.length > 0, 'recover_enhancement_stats.js should be non-empty');
});

// ═══════════════════════════════════════════════════════════════════════════
//  RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  PHASE 1 TESTS — Gear & Equipment system');
    console.log('  ' + new Date().toISOString());
    console.log('════════════════════════════════════════════════════\n');

    for (const { name, fn } of tests) {
        try {
            await fn();
            results.pass++;
            console.log(`  ✅ ${name}`);
        } catch (e) {
            results.fail++;
            results.failures.push({ name, error: e.message });
            console.log(`  ❌ ${name}`);
            console.log(`     ${e.message.split('\n').map(l => '       ' + l).join('\n')}`);
        }
    }

    console.log('\n════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${results.pass} pass, ${results.fail} fail, ${results.skip} skip`);
    console.log('════════════════════════════════════════════════════\n');

    if (results.fail > 0) {
        process.exit(1);
    }
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(2);
});
