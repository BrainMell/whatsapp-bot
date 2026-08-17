// scripts/test_combat_fixes.js
// Verifies the 6 combat fixes from the playtest log review:
//   1. PvP initiative message uses actual turn-0 player name
//   2. Duel challenge message resolves LID via economy.getDisplayName
//   3. SLOW has design-limit comment (documentation only)
//   4. 0-cost active abilities no longer mislabeled "Passive"
//   5. buff_self/buff_team tooltips no longer show misleading %
//   6. abyssal_detonator is in lootSystem DB (no longer "Unknown item")

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const m = envContent.match(/^MONGO_URI=(.+)$/m);
const MONGO_URI = m[1].trim().replace(/^["']|["']$/g, '');

const SUFFIX = '_combat_fix_' + Date.now();
const USER_A = 'test_combat_a' + SUFFIX + '@lid';     // LID-style JID (Issue 2 test)
const USER_B = 'test_combat_b' + SUFFIX + '@s.whatsapp.net';

let conn;
let User, economy, inventorySystem, lootSystem;

async function setup() {
  process.env.MONGO_URI = MONGO_URI;
  conn = await mongoose.connect(MONGO_URI, { dbName: 'whatsapp_rpg' });
  console.log('[+] Connected to MongoDB');
  User = require('../core/models/User');
  economy = require('../core/rpg/economy');
  inventorySystem = require('../core/rpg/inventorySystem');
  lootSystem = require('../core/rpg/lootSystem');
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  try {
    const r1 = await User.deleteMany({ userId: { $in: [USER_A, USER_B] } });
    console.log(`[+] Deleted ${r1.deletedCount} test users`);
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
  if (conn) await mongoose.disconnect();
  console.log('[+] Disconnected');
}

async function runTests() {
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: PvP initiative message uses actual turn-0 player name
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 1: PvP initiative message uses turn-0 player name ===');
  const pvpSrc = fs.readFileSync(path.join(__dirname, '..', 'core/rpg/pvpSystem.js'), 'utf-8');
  // Verify the OLD hardcoded line is GONE
  if (pvpSrc.includes('claims the initiative!\\n` +\n        `———————————')) {
    // The old line was: `startMsg += `\\n🎯 *${p1.name}* claims the initiative!\\n` +`
    // We just check that the hardcoded p1.name version is no longer present
    const hasOld = /startMsg \+= `\\n🎯 \*\$\{p1\.name\}\* claims the initiative!/.test(pvpSrc);
    if (hasOld) throw new Error('PvP: old hardcoded p1.name message still present');
  }
  // Verify the NEW line uses duelState.players[duelState.turn]
  const newLineRegex = /startMsg \+= `\\n🎯 \*\$\{duelState\.players\[duelState\.turn\]\.name\}\* claims the initiative!/;
  if (!newLineRegex.test(pvpSrc)) {
    throw new Error('PvP: new initiative message using duelState.players[turn].name NOT found');
  }
  console.log('[+] PvP initiative message now uses duelState.players[duelState.turn].name ✅');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: Duel challenge uses economy.getDisplayName (Issue 2 fix)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 2: Duel challenge resolves LID via getDisplayName ===');
  const engSrc = fs.readFileSync(path.join(__dirname, '..', 'core/engine.js'), 'utf-8');
  // The "DUEL CHALLENGE" string is in the sendMessage call. The `targetName`
  // declaration is a few lines ABOVE that. Look in a 3000-char window before
  // the "DUEL CHALLENGE" string to find the declaration.
  const idx = engSrc.indexOf('DUEL CHALLENGE');
  if (idx < 0) throw new Error('engine.js: DUEL CHALLENGE string not found');
  const start = Math.max(0, idx - 3000);
  const duelBlock = engSrc.slice(start, idx + 1500);
  // Strip JS comments (both // line comments and /* */ block comments) so we
  // don't false-positive on the FIX comment that mentions the old pattern.
  const strippedBlock = duelBlock
    .replace(/\/\/.*$/gm, '')         // strip // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // strip /* block */ comments
  // Now check the code-only block (no comments)
  if (strippedBlock.includes('target.split("@")[0]') || strippedBlock.includes("target.split('@')[0]")) {
    throw new Error('engine.js: duel challenge block still uses target.split — Issue 2 NOT FIXED');
  }
  if (!strippedBlock.includes('economy.getDisplayName(target)')) {
    throw new Error('engine.js: duel challenge block does not use economy.getDisplayName(target) — Issue 2 NOT FIXED');
  }
  console.log('[+] Duel challenge uses economy.getDisplayName(target) ✅');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: SLOW design-limit comment present
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 3: SLOW design-limit comment ===');
  if (!pvpSrc.includes('DESIGN LIMITATION (2026-08-18): SLOW reduces')) {
    throw new Error('pvpSystem: SLOW design-limit comment not found');
  }
  console.log('[+] SLOW design-limit comment present ✅');
  console.log('  (Documentation only — turn order still alternates after first turn; SLOW affects spd in getEffectiveStats only)');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: 0-cost active abilities no longer mislabeled "Passive"
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 4: 0-cost active abilities no longer mislabeled "Passive" ===');
  const skillSrc = fs.readFileSync(path.join(__dirname, '..', 'core/commands/skillCommands.js'), 'utf-8');
  // The old logic: const costDisplay = ability.cost > 0 ? `⚡ ${ability.cost}` : `✨ Passive`;
  // The new logic checks ability.effect?.type === 'passive' || ability.type === 'passive'
  const oldDisplayRegex = /const costDisplay = ability\.cost > 0 \? `⚡ \$\{ability\.cost\}` : `✨ Passive`;/;
  if (oldDisplayRegex.test(skillSrc)) {
    throw new Error('skillCommands: old Passive label logic still present');
  }
  const newDisplayRegex = /ability\.effect\?\.type === ['"]passive['"] \|\| ability\.type === ['"]passive['"]/;
  if (!newDisplayRegex.test(skillSrc)) {
    throw new Error('skillCommands: new passive check (effect?.type === "passive" || ability.type === "passive") NOT found');
  }
  console.log('[+] 0-cost active abilities now check actual passive type, not just cost=0 ✅');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: buff_self/buff_team tooltips no longer show misleading %
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 5: buff tooltips no longer show misleading % ===');
  // Old: `✨ +${e.value}% ${e.buffType || 'stats'} for ${e.duration}t`
  // New: `✨ +${e.value} ${e.buffType || 'stats'} for ${e.duration}t`
  const oldTooltipRegex = /✨ \+\$\{e\.value\}% \$\{e\.buffType/;
  if (oldTooltipRegex.test(skillSrc)) {
    throw new Error('skillCommands: old "+${e.value}%" tooltip still present (misleading %)');
  }
  console.log('[+] buff tooltips no longer show misleading % ✅');

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: abyssal_detonator in lootSystem (no longer "Unknown item")
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 6: abyssal_detonator in lootSystem DB ===');
  const itemInfo = lootSystem.getItemInfo('abyssal_detonator');
  if (!itemInfo || itemInfo.name === 'Unknown') {
    throw new Error(`lootSystem.getItemInfo('abyssal_detonator') returned: ${JSON.stringify(itemInfo)}`);
  }
  if (itemInfo.name !== 'Abyssal Detonator') {
    throw new Error(`lootSystem: abyssal_detonator name wrong — expected "Abyssal Detonator", got "${itemInfo.name}"`);
  }
  if (!itemInfo.description) {
    throw new Error('lootSystem: abyssal_detonator missing description');
  }
  console.log(`[+] getItemInfo('abyssal_detonator').name = "${itemInfo.name}" ✅`);
  console.log(`[+] getItemInfo('abyssal_detonator').description = "${itemInfo.description}" ✅`);
  console.log(`[+] getItemInfo('abyssal_detonator').rarity = "${itemInfo.rarity}" ✅`);
  console.log(`[+] getItemInfo('abyssal_detonator').value = ${itemInfo.value} ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 7: Live verification — getDisplayName on a LID-style user works
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 7: Live getDisplayName resolves LID JID ===');
  // Create a test user with a LID-style userId and a nickname
  await User.create({
    userId: USER_A,
    wallet: 50000, bank: 0, inventory: {}, inventorySlots: 50,
    nickname: 'TestCombatA', registered: true
  });
  await economy.reloadUserFromDB(USER_A);
  const displayName = economy.getDisplayName(USER_A);
  if (displayName !== 'TestCombatA') {
    throw new Error(`getDisplayName returned "${displayName}", expected "TestCombatA"`);
  }
  console.log(`[+] getDisplayName("${USER_A}") = "${displayName}" ✅`);
  console.log('  (Confirms: if a player tags a LID-JID target in a duel, getDisplayName will resolve to their nickname instead of showing the raw LID)');

  console.log('\n========== ALL TESTS PASSED ==========');
  console.log('Issue 1 (initiative message): ✅');
  console.log('Issue 2 (broken LID in challenge): ✅');
  console.log('Issue 3 (SLOW design-limit comment): ✅');
  console.log('Issue 4 (Passive mislabel): ✅');
  console.log('Issue 5 (tooltip misleading %): ✅');
  console.log('Issue 6 (abyssal_detonator in DB): ✅');
  console.log('Issue 7 (live getDisplayName on LID): ✅');
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main();
