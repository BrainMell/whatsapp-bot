// scripts/full_rpg_reset.js
// WIPES ALL RPG progression for ALL users in production.
// Goal: every player starts from zero — no skills, no equipment, no inventory
// RPG items, no summons, no progression. Non-RPG side of the bot untouched.
//
// WHAT GETS WIPED:
//   Inventory:      user.inventory → {} (all RPG items gone)
//   Equipment:      user.equipment → all slots null
//   Skills:         user.skills → {} (no abilities unlocked)
//   Class:          user.class → null (back to starter state)
//   Progression:    user.progression.{level, xp, statPoints, allocatedPoints} → 1/0/0/0
//   Stats:          user.allocatedStats → {}, user.statBonuses → {} (stat fields zeroed)
//   Rank:           user.adventurerRank → 'F'
//   Summons:        DELETE every Summon doc where ownerJid matches a user
//                   (wipes Main Deck + Backlog + active)
//                   user.activeSummonId → null
//   Runes:          DELETE every Rune doc where ownerJid matches a user
//                   (wipes socketed + inventory runes)
//   Quest/PvP:      user.questGold, questsCompleted, questsWon, questsFailed, pvpWins, pvpLosses → 0
//   Timers:         user.lastDaily, user.lastRob → 0
//   Money:          user.wallet → 1000 (STARTING_BALANCE), user.bank → 0
//   Alt-detect:     user.phoneHash preserved (anti-multibox)
//   Bonds/CP:       user.bondXp, user.unlockedSummonPassives preserved? NO — these are
//                   summon-related progression, so wipe unlockedSummonPassives too.
//
// WHAT IS PRESERVED (non-RPG):
//   userId, nickname, registered, displayName, spriteIndex (cosmetic)
//   classChangeCount (history field)
//   eventTokens (separate economy — could be RPG-related but per spec keep)
//   guild memberships (Guild model not touched)
//   card collection (UserCard not touched — separate system)
//   chat profile, warnings, mutes, bans
//   alt-detection state (phoneHash)
//   message history
//
// SAFETY:
//   1. Backs up entire users + summons + runes collections
//   2. Prints BEFORE state (counts + sample user)
//   3. Applies the reset in this order: Summons → Runes → Users
//   4. Prints AFTER state for verification
//   5. Rollback: restore from backup JSON

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const m = envContent.match(/^MONGO_URI=(.+)$/m);
const MONGO_URI = m[1].trim().replace(/^["']|["']$/g, '');

const STARTING_BALANCE = 1000;
const BACKUP_DIR = '/tmp';

let conn;
let User, Summon, Rune;

async function main() {
  console.log('[+] Connecting to MongoDB...');
  // Don't override dbName — production uses URI default ('test')
  conn = await mongoose.connect(MONGO_URI);
  console.log(`[+] Connected to database: ${conn.connection.db.databaseName}`);
  User = require('../core/models/User');
  Summon = require('../core/models/Summon');
  Rune = require('../core/models/Rune');

  // ── 1. BEFORE state ─────────────────────────────────────────────────────
  console.log('\n=== BEFORE RESET ===');
  const userCount = await User.countDocuments({});
  const summonCount = await Summon.countDocuments({});
  const runeCount = await Rune.countDocuments({});
  const walletAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: '$wallet' } } }]);
  const bankAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: '$bank' } } }]);
  const totalWallet = walletAgg[0]?.total || 0;
  const totalBank = bankAgg[0]?.total || 0;
  console.log(`[i] Users: ${userCount}`);
  console.log(`[i] Summons: ${summonCount}`);
  console.log(`[i] Runes: ${runeCount}`);
  console.log(`[i] Total wallet: ${totalWallet.toLocaleString()}`);
  console.log(`[i] Total bank: ${totalBank.toLocaleString()}`);

  const sample = await User.findOne({ registered: true, wallet: { $gt: 1000 } }).sort({ wallet: -1 });
  if (sample) {
    console.log(`[i] Sample user BEFORE:`);
    console.log(`    userId:    ${sample.userId}`);
    console.log(`    nickname:  ${sample.nickname}`);
    console.log(`    class:     ${sample.class || 'null'}`);
    console.log(`    level:     ${sample.progression?.level || 1}`);
    console.log(`    wallet:    ${sample.wallet.toLocaleString()}`);
    console.log(`    bank:      ${sample.bank.toLocaleString()}`);
    console.log(`    inventory keys: ${Object.keys(sample.inventory || {}).length}`);
    console.log(`    skills:    ${Object.keys(sample.skills || {}).length}`);
    console.log(`    activeSummonId: ${sample.activeSummonId || 'null'}`);
  }

  // ── 2. Backup ───────────────────────────────────────────────────────────
  console.log('\n=== BACKUP ===');
  const ts = Date.now();
  const userBackupFile = path.join(BACKUP_DIR, `users_backup_full_rpg_${ts}.json`);
  const summonBackupFile = path.join(BACKUP_DIR, `summons_backup_full_rpg_${ts}.json`);
  const runeBackupFile = path.join(BACKUP_DIR, `runes_backup_full_rpg_${ts}.json`);

  console.log(`[+] Backing up users to ${userBackupFile}...`);
  const allUsers = await User.find({}).lean();
  fs.writeFileSync(userBackupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    count: allUsers.length,
    users: allUsers
  }, null, 2));
  console.log(`    ✓ ${allUsers.length} users (${(fs.statSync(userBackupFile).size / 1024 / 1024).toFixed(2)} MB)`);

  console.log(`[+] Backing up summons to ${summonBackupFile}...`);
  const allSummons = await Summon.find({}).lean();
  fs.writeFileSync(summonBackupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    count: allSummons.length,
    summons: allSummons
  }, null, 2));
  console.log(`    ✓ ${allSummons.length} summons (${(fs.statSync(summonBackupFile).size / 1024 / 1024).toFixed(2)} MB)`);

  console.log(`[+] Backing up runes to ${runeBackupFile}...`);
  const allRunes = await Rune.find({}).lean();
  fs.writeFileSync(runeBackupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    count: allRunes.length,
    runes: allRunes
  }, null, 2));
  console.log(`    ✓ ${allRunes.length} runes (${(fs.statSync(runeBackupFile).size / 1024 / 1024).toFixed(2)} MB)`);

  // ── 3. Apply reset (order: Summons → Runes → Users) ──────────────────────
  console.log('\n=== APPLYING RESET ===');

  // 3a. Delete all Summon docs (Main Deck + Backlog)
  console.log('[+] Deleting all Summon documents...');
  const summonDel = await Summon.deleteMany({});
  console.log(`    ✓ Deleted ${summonDel.deletedCount} summons`);

  // 3b. Delete all Rune docs (socketed + inventory)
  console.log('[+] Deleting all Rune documents...');
  const runeDel = await Rune.deleteMany({});
  console.log(`    ✓ Deleted ${runeDel.deletedCount} runes`);

  // 3c. Reset all User fields
  console.log('[+] Resetting all User RPG fields...');
  const userReset = {
    wallet: STARTING_BALANCE,
    bank: 0,
    inventory: {},
    equipment: {
      main_hand: null, off_hand: null, armor: null, helmet: null,
      boots: null, ring: null, amulet: null, cloak: null, gloves: null
    },
    skills: {},
    class: null,
    allocatedStats: {},
    statBonuses: {},
    adventurerRank: 'F',
    activeSummonId: null,
    unlockedSummonPassives: [],
    questGold: 0,
    questsCompleted: 0,
    questsWon: 0,
    questsFailed: 0,
    pvpWins: 0,
    pvpLosses: 0,
    lastDaily: 0,
    lastRob: 0,
    'progression.level': 1,
    'progression.xp': 0,
    'progression.statPoints': 0,
    'progression.allocatedPoints': 0,
  };
  const userUpdate = await User.updateMany({}, { $set: userReset });
  console.log(`    ✓ Matched: ${userUpdate.matchedCount}, Modified: ${userUpdate.modifiedCount}`);

  // ── 4. AFTER state ──────────────────────────────────────────────────────
  console.log('\n=== AFTER RESET ===');
  const userCountAfter = await User.countDocuments({});
  const summonCountAfter = await Summon.countDocuments({});
  const runeCountAfter = await Rune.countDocuments({});
  const walletAggAfter = await User.aggregate([{ $group: { _id: null, total: { $sum: '$wallet' } } }]);
  const bankAggAfter = await User.aggregate([{ $group: { _id: null, total: { $sum: '$bank' } } }]);
  const totalWalletAfter = walletAggAfter[0]?.total || 0;
  const totalBankAfter = bankAggAfter[0]?.total || 0;
  console.log(`[i] Users: ${userCountAfter} (unchanged)`);
  console.log(`[i] Summons: ${summonCountAfter} (was ${summonCount})`);
  console.log(`[i] Runes: ${runeCountAfter} (was ${runeCount})`);
  console.log(`[i] Total wallet: ${totalWalletAfter.toLocaleString()} (was ${totalWallet.toLocaleString()})`);
  console.log(`[i] Total bank: ${totalBankAfter.toLocaleString()} (was ${totalBank.toLocaleString()})`);
  console.log(`[i] Wiped: ${(totalWallet + totalBank - totalWalletAfter - totalBankAfter).toLocaleString()} zeni evaporated`);

  // Sample user after
  if (sample) {
    const sampleAfter = await User.findOne({ userId: sample.userId });
    if (sampleAfter) {
      console.log(`\n[i] Sample user AFTER:`);
      console.log(`    userId:    ${sampleAfter.userId} (preserved)`);
      console.log(`    nickname:  ${sampleAfter.nickname} (preserved)`);
      console.log(`    class:     ${sampleAfter.class || 'null'} (was ${sample.class || 'null'})`);
      console.log(`    level:     ${sampleAfter.progression?.level || 1} (was ${sample.progression?.level || 1})`);
      console.log(`    wallet:    ${sampleAfter.wallet.toLocaleString()} (was ${sample.wallet.toLocaleString()})`);
      console.log(`    bank:      ${sampleAfter.bank.toLocaleString()} (was ${sample.bank.toLocaleString()})`);
      console.log(`    inventory keys: ${Object.keys(sampleAfter.inventory || {}).length} (was ${Object.keys(sample.inventory || {}).length})`);
      console.log(`    skills:    ${Object.keys(sampleAfter.skills || {}).length} (was ${Object.keys(sample.skills || {}).length})`);
      console.log(`    activeSummonId: ${sampleAfter.activeSummonId || 'null'} (was ${sample.activeSummonId || 'null'})`);
    }
  }

  // ── 5. Integrity spot check ─────────────────────────────────────────────
  console.log('\n=== INTEGRITY SPOT CHECK ===');
  const userAgg = await User.aggregate([{
    $group: {
      _id: null,
      totalWallet: { $sum: '$wallet' },
      maxWallet: { $max: '$wallet' },
      minWallet: { $min: '$wallet' },
      avgWallet: { $avg: '$wallet' }
    }
  }]);
  if (userAgg[0]) {
    const v = userAgg[0];
    console.log(`[i] Wallet: total=${v.totalWallet.toLocaleString()}, max=${v.maxWallet}, min=${v.minWallet}, avg=${Math.round(v.avgWallet)}`);
    if (v.maxWallet === STARTING_BALANCE && v.minWallet === STARTING_BALANCE) {
      console.log('✅ Integrity check PASSED — all wallets at starting balance');
    } else {
      console.log('⚠️ Integrity check WARNING — wallets not uniform');
    }
  }
  // Verify all summons/runes deleted
  if (summonCountAfter === 0 && runeCountAfter === 0) {
    console.log('✅ All summons and runes wiped');
  } else {
    console.log(`⚠️ Some summons (${summonCountAfter}) or runes (${runeCountAfter}) remain`);
  }

  // ── 6. Final report ─────────────────────────────────────────────────────
  console.log('\n=== DONE ===');
  console.log(`Backup files:`);
  console.log(`  Users:   ${userBackupFile}`);
  console.log(`  Summons: ${summonBackupFile}`);
  console.log(`  Runes:   ${runeBackupFile}`);
  console.log(`\n⚠️  Bot must be restarted (pm2 restart whatsapp-bot) to pick up changes.`);
  console.log(`   In-memory caches (economyData, summons, runes) hold stale data otherwise.`);
}

async function cleanup() {
  if (conn) await mongoose.disconnect();
  console.log('[+] Disconnected');
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error('\n❌ RESET FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
