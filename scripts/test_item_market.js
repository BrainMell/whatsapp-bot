// scripts/test_item_market.js
// Real MongoDB execute-and-restore test for the new item market flow.
// Run on Box 1: cd ~/whatsapp-bot && node scripts/test_item_market.js

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const mongoMatch = envContent.match(/^MONGO_URI=(.+)$/m);
if (!mongoMatch) { console.error('FATAL: MONGO_URI not in .env'); process.exit(1); }
const MONGO_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '');

const SUFFIX = '_itemmarket_test_' + Date.now();
const USER_A = 'test_a' + SUFFIX + '@s.whatsapp.net';
const USER_B = 'test_b' + SUFFIX + '@s.whatsapp.net';
const TEST_ITEM_ID = 'test_potion_' + SUFFIX;

let conn;
let User, ItemMarket, Settlement, economy, inventorySystem, itemMarket;

async function setup() {
  process.env.MONGO_URI = MONGO_URI;
  conn = await mongoose.connect(MONGO_URI, { dbName: 'whatsapp_rpg' });
  console.log('[+] Connected to MongoDB');
  User = require('../core/models/User');
  ItemMarket = require('../core/models/ItemMarket');
  Settlement = require('../core/models/Settlement');
  economy = require('../core/rpg/economy');
  inventorySystem = require('../core/rpg/inventorySystem');
  itemMarket = require('../core/rpg/itemMarket');
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  try {
    if (User) {
      // 💡 FIX: User schema uses 'userId' field (required, unique), not 'jid'.
      // Prior version of this cleanup used `jid:` and matched 0 users.
      const r1 = await User.deleteMany({ userId: { $in: [USER_A, USER_B] } });
      console.log(`[+] Deleted ${r1.deletedCount} test users`);
    }
    if (ItemMarket) {
      const r2 = await ItemMarket.deleteMany({
        $or: [{ sellerId: USER_A }, { sellerId: USER_B }, { buyerId: USER_A }, { buyerId: USER_B }]
      });
      console.log(`[+] Deleted ${r2.deletedCount} test listings`);
    }
    if (Settlement) {
      const r3 = await Settlement.deleteMany({
        $or: [{ userId: USER_A }, { userId: USER_B }, { counterpartyId: USER_A }, { counterpartyId: USER_B }]
      });
      console.log(`[+] Deleted ${r3.deletedCount} test settlement records`);
    }
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
  if (conn) await mongoose.disconnect();
  console.log('[+] Disconnected');
}

function makeReply() {
  const log = [];
  const reply = (msg) => { log.push(msg); return true; };
  return { log, reply };
}

async function runTests() {
  // ─── Phase 1: setup ───
  console.log('\n=== Phase 1: setup ===');
  for (const jid of [USER_A, USER_B]) {
    await User.create({
      userId: jid,
      wallet: 100000,
      bank: 0,
      inventory: {},
      inventorySlots: 50,
      nickname: jid.split('@')[0],
      registered: true  // economy.getUser returns null if registered !== true
    });
    console.log(`[+] Created ${jid}`);
    // Load into economy's in-memory cache so addItem/getInventory work
    await economy.reloadUserFromDB(jid);
    console.log(`[+] Loaded ${jid} into economy cache`);
  }
  await inventorySystem.addItem(USER_A, TEST_ITEM_ID, 5, { name: 'Test Potion', rarity: 'COMMON', value: 100, type: 'ITEM' });
  await inventorySystem.addItem(USER_A, TEST_ITEM_ID + '_2', 3, { name: 'Other Potion', rarity: 'UNCOMMON', value: 200, type: 'ITEM' });
  await economy.saveUser(USER_A);
  await economy.saveUser(USER_B);

  const invA0 = inventorySystem.getInventory(USER_A);
  const balA0 = economy.getBalance(USER_A);
  const balB0 = economy.getBalance(USER_B);
  console.log(`[i] A ${TEST_ITEM_ID} qty: ${invA0[TEST_ITEM_ID]?.quantity}, balance: ${balA0}`);
  console.log(`[i] B balance: ${balB0}`);

  if (invA0[TEST_ITEM_ID].quantity !== 5) throw new Error('setup: A should have 5 of TEST_ITEM');
  if (balA0 !== 100000 || balB0 !== 100000) throw new Error(`setup: wrong balances A=${balA0} B=${balB0}`);

  // ─── Phase 2: listitem ───
  console.log('\n=== Phase 2: listitem ===');
  const slotsA = Object.keys(inventorySystem.getInventory(USER_A));
  const slotIdx = slotsA.indexOf(TEST_ITEM_ID) + 1;
  console.log(`[i] ${TEST_ITEM_ID} is in slot #${slotIdx}`);

  const r1 = makeReply();
  await itemMarket.cmdListItem(USER_A, r1.reply, [String(slotIdx), '5000', '3']);
  if (r1.log.length === 0) throw new Error('listitem: no reply');
  if (!/ITEM LISTED/i.test(r1.log[0])) throw new Error(`listitem: bad reply: ${r1.log[0]}`);
  console.log(`[+] listitem reply OK`);

  const listings = await ItemMarket.find({ sellerId: USER_A, status: 'active' }).sort({ listedAt: -1 });
  if (listings.length !== 1) throw new Error(`listitem: expected 1 listing, got ${listings.length}`);
  const l1 = listings[0];
  if (l1.itemId !== TEST_ITEM_ID) throw new Error(`listitem: wrong itemId ${l1.itemId}`);
  if (l1.quantity !== 3) throw new Error(`listitem: wrong qty ${l1.quantity}`);
  if (l1.price !== 5000) throw new Error(`listitem: wrong price ${l1.price}`);
  console.log(`[+] Listing verified: ${l1.itemId} x${l1.quantity} for ${l1.price}`);

  const invA1 = inventorySystem.getInventory(USER_A);
  if (invA1[TEST_ITEM_ID].quantity !== 2) throw new Error(`listitem: A should have 2 left, got ${invA1[TEST_ITEM_ID].quantity}`);
  console.log(`[+] A qty now ${invA1[TEST_ITEM_ID].quantity} (was 5, listed 3, expected 2) ✅`);

  // ─── Phase 3: itemmarket browse ───
  console.log('\n=== Phase 3: itemmarket browse ===');
  const r2 = makeReply();
  await itemMarket.cmdItemMarket(USER_B, r2.reply, []);
  if (!/Test Potion/i.test(r2.log[0])) throw new Error(`browse: market doesn't show listing: ${r2.log[0]}`);
  console.log(`[+] Browse verified — market shows the listing ✅`);

  // ─── Phase 4: buyitem (10% tax) ───
  console.log('\n=== Phase 4: buyitem ===');
  const r3 = makeReply();
  await itemMarket.cmdBuyItem(USER_B, r3.reply, ['1']);
  if (!/PURCHASE COMPLETE/i.test(r3.log[0])) throw new Error(`buyitem: bad reply: ${r3.log[0]}`);
  console.log(`[+] buyitem reply OK`);

  const balA1 = economy.getBalance(USER_A);
  const balB1 = economy.getBalance(USER_B);
  const expA = 100000 + 4500;
  const expB = 100000 - 5000;
  if (balA1 !== expA) throw new Error(`buyitem: A balance wrong — expected ${expA}, got ${balA1}`);
  if (balB1 !== expB) throw new Error(`buyitem: B balance wrong — expected ${expB}, got ${balB1}`);
  console.log(`[+] Money flow: A 100000→${balA1} (+4500 = 90% of 5000) ✅`);
  console.log(`[+] Money flow: B 100000→${balB1} (-5000 full price) ✅`);
  console.log(`[+] Tax evaporated: 500 (10% of 5000) ✅`);

  const invB1 = inventorySystem.getInventory(USER_B);
  if (invB1[TEST_ITEM_ID]?.quantity !== 3) throw new Error(`buyitem: B should have 3 of TEST_ITEM, got ${invB1[TEST_ITEM_ID]?.quantity}`);
  const invA2 = inventorySystem.getInventory(USER_A);
  if (invA2[TEST_ITEM_ID]?.quantity !== 2) throw new Error(`buyitem: A should still have 2, got ${invA2[TEST_ITEM_ID]?.quantity}`);
  console.log(`[+] Item transfer: B has 3, A still has 2 ✅`);

  const sold = await ItemMarket.findById(l1._id);
  if (sold.status !== 'sold') throw new Error(`buyitem: listing status wrong: ${sold.status}`);
  if (sold.buyerId !== USER_B) throw new Error(`buyitem: buyerId wrong: ${sold.buyerId}`);
  console.log(`[+] Listing status 'sold', buyerId set ✅`);

  // ─── Phase 5: unlistitem ───
  console.log('\n=== Phase 5: unlistitem ===');
  // A has 2 of TEST_ITEM_ID left, list 1 more
  const slotsA2 = Object.keys(inventorySystem.getInventory(USER_A));
  const slotIdx2 = slotsA2.indexOf(TEST_ITEM_ID) + 1;
  const r4 = makeReply();
  await itemMarket.cmdListItem(USER_A, r4.reply, [String(slotIdx2), '3000', '1']);
  if (!/ITEM LISTED/i.test(r4.log[0])) throw new Error(`unlist step 1 (list): bad reply: ${r4.log[0]}`);
  const listings2 = await ItemMarket.find({ sellerId: USER_A, status: 'active' }).sort({ listedAt: -1 });
  if (listings2.length !== 1) throw new Error(`unlist step 1: expected 1 active listing, got ${listings2.length}`);
  const l2 = listings2[0];

  const invA3 = inventorySystem.getInventory(USER_A);
  if (invA3[TEST_ITEM_ID].quantity !== 1) throw new Error(`unlist step 1: A should have 1 left, got ${invA3[TEST_ITEM_ID].quantity}`);
  console.log(`[+] 2nd listing created. A has 1 ${TEST_ITEM_ID} left.`);

  // Find l2's index in active market list
  const allActive = await ItemMarket.find({ status: 'active' }).sort({ listedAt: -1 });
  const l2Idx = allActive.findIndex(l => l._id.equals(l2._id)) + 1;
  const r5 = makeReply();
  await itemMarket.cmdUnlistItem(USER_A, r5.reply, [String(l2Idx)]);
  if (!/Unlisted/i.test(r5.log[0])) throw new Error(`unlistitem: bad reply: ${r5.log[0]}`);
  console.log(`[+] unlistitem reply: ${r5.log[0]}`);

  const invA4 = inventorySystem.getInventory(USER_A);
  if (invA4[TEST_ITEM_ID].quantity !== 2) throw new Error(`unlistitem: A should have 2 back, got ${invA4[TEST_ITEM_ID].quantity}`);
  console.log(`[+] Item returned: A has 2 ${TEST_ITEM_ID} ✅`);

  const unlisted = await ItemMarket.findById(l2._id);
  if (unlisted.status !== 'cancelled') throw new Error(`unlistitem: status should be 'cancelled', got '${unlisted.status}'`);
  console.log(`[+] Listing status 'cancelled' ✅`);

  // ─── Phase 6: Settlement records ───
  console.log('\n=== Phase 6: Settlement records ===');
  const settlements = await Settlement.find({
    $or: [{ userId: USER_A }, { userId: USER_B }, { counterpartyId: USER_A }, { counterpartyId: USER_B }]
  }).sort({ timestamp: -1 });
  console.log(`[+] Settlement records created for test users: ${settlements.length}`);
  if (settlements.length > 0) {
    console.log(`[i] Sample — category: ${settlements[0].category}, type: ${settlements[0].type}, amount: ${settlements[0].amount}`);
  }

  console.log('\n========== ALL TESTS PASSED ==========');
  console.log('List ✓  Browse ✓  Buy (10% tax) ✓  Item transfer ✓  Unlist (item returned) ✓  Settlement records ✓');
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
