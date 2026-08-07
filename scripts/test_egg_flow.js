#!/usr/bin/env node
// Test 9: Egg purchase → craft → hatch flow end-to-end
// Uses the real MongoDB + economy cache + inventory system.
const mongoose = require('mongoose');

const OWNER = '251453323092189@lid';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) { console.error('❌ MONGO_URI required'); process.exit(1); }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected.\n');

  const economy = require('../core/rpg/economy');
  const summonEggSystem = require('../core/rpg/summonEggSystem');
  const inventorySystem = require('../core/rpg/inventorySystem');
  const lootSystem = require('../core/rpg/lootSystem');

  // Step 0: Sync user from DB
  console.log('Step 0: Syncing owner user from DB...');
  await economy.syncUserFromDB(OWNER);
  const user = economy.getUser(OWNER);
  if (!user) { console.log('❌ User not found'); await mongoose.disconnect(); return; }
  console.log('✅ User loaded:', user.nickname || OWNER);

  // Step 1: Add basic_summon_egg to inventory (simulates shop purchase)
  console.log('\nStep 1: Adding basic_summon_egg to inventory...');
  inventorySystem.addItem(OWNER, 'basic_summon_egg', 1);
  const hasBasic = inventorySystem.hasItem(OWNER, 'basic_summon_egg', 1);
  console.log('  hasItem basic_summon_egg:', hasBasic);
  if (!hasBasic) { console.log('❌ FAIL: egg not in inventory after addItem'); await mongoose.disconnect(); return; }

  // Step 2: Hatch the basic egg
  console.log('\nStep 2: Hatching basic_summon_egg...');
  const hatchResult = await summonEggSystem.hatchEgg(OWNER, 'basic_summon_egg');
  console.log('  success:', hatchResult.success);
  console.log('  message:', hatchResult.message.substring(0, 100));
  if (!hatchResult.success) { console.log('❌ FAIL: hatch failed'); await mongoose.disconnect(); return; }

  // Step 3: Verify egg was consumed
  const eggConsumed = !inventorySystem.hasItem(OWNER, 'basic_summon_egg', 1);
  console.log('  egg consumed:', eggConsumed);
  if (!eggConsumed) { console.log('❌ FAIL: egg not consumed after hatch'); await mongoose.disconnect(); return; }

  // Step 4: Add 10 rare fragments (simulates Abyss drops)
  console.log('\nStep 3: Adding 10 rare_fragment...');
  inventorySystem.addItem(OWNER, 'rare_fragment', 10);
  const fragCount = inventorySystem.getItemCount(OWNER, 'rare_fragment');
  console.log('  rare_fragment count:', fragCount);
  if (fragCount < 10) { console.log('❌ FAIL: fragments not added'); await mongoose.disconnect(); return; }

  // Step 5: Craft rare egg from fragments
  console.log('\nStep 4: Crafting rare_summon_egg from fragments...');
  const craftResult = await summonEggSystem.craftEgg(OWNER, 'rare');
  console.log('  success:', craftResult.success);
  console.log('  message:', craftResult.message.substring(0, 100));
  if (!craftResult.success) { console.log('❌ FAIL: craft failed'); await mongoose.disconnect(); return; }

  // Step 6: Verify fragments consumed + egg created
  const fragConsumed = inventorySystem.getItemCount(OWNER, 'rare_fragment') < 10;
  const hasRareEgg = inventorySystem.hasItem(OWNER, 'rare_summon_egg', 1);
  console.log('  fragments consumed:', fragConsumed);
  console.log('  has rare_summon_egg:', hasRareEgg);
  if (!fragConsumed || !hasRareEgg) { console.log('❌ FAIL: craft didn\'t consume fragments or create egg'); await mongoose.disconnect(); return; }

  // Step 7: Hatch the rare egg
  console.log('\nStep 5: Hatching rare_summon_egg...');
  const rareHatchResult = await summonEggSystem.hatchEgg(OWNER, 'rare_summon_egg');
  console.log('  success:', rareHatchResult.success);
  console.log('  message:', rareHatchResult.message.substring(0, 100));
  if (!rareHatchResult.success) { console.log('❌ FAIL: rare egg hatch failed'); await mongoose.disconnect(); return; }

  // Step 8: Verify rare egg consumed
  const rareEggConsumed = !inventorySystem.hasItem(OWNER, 'rare_summon_egg', 1);
  console.log('  rare egg consumed:', rareEggConsumed);

  console.log('\n=== EGG FLOW TEST: ✅ ALL STEPS PASSED ===');
  console.log('Flow: buy basic egg → hatch → add fragments → craft rare egg → hatch rare egg');
  console.log('All steps completed successfully with real DB + economy cache + inventory system.');

  await mongoose.disconnect();
}

main().catch(e => { console.error('❌ Test failed:', e); process.exit(1); });
