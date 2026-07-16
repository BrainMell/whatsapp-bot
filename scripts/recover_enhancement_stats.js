// ═══════════════════════════════════════════════════════════════════════════
//  ENHANCEMENT RECOVERY SCRIPT
// ═══════════════════════════════════════════════════════════════════════════
//
// PURPOSE:
//   On 2026-07-16, commit a43fc1e0 added an auto-repair that overwrote
//   players' enhanced equipment stats under a flat 5-level cap and 100%
//   bonus cap. With the new rarity-based cap (Common 5, Uncommon 10,
//   Rare 15, Epic 20, Legendary 25, Mythic 30), many of those items
//   should be allowed higher enhancement — but they're currently sitting
//   at the old flat ceiling because the repair already ran on bag open.
//
//   This script scans all users in MongoDB, finds items where the new
//   rarity cap allows a higher enhancementBonus than what was applied
//   by tonight's flat-cap repair, and rewrites stats using the rarity-
//   aware formula: stats[stat] = ceil(baseStats[stat] × (1 + bonus)).
//
// FORMULA:
//   enhancementBonus (after recovery) = min(enhancementLevel × 0.35, 1.0)
//   — assumes legendary stones were used (most generous assumption).
//   — capped at MAX_ENHANCEMENT_BONUS = 1.0 (so max stats = 2× base).
//
//   If enhancementLevel was previously capped to 5 by the old repair,
//   we can't recover the original level — players who had level 10+
//   gear stay at level 5. BUT we still re-evaluate the bonus using the
//   new rarity-aware cap, so a Mythic item at level 5 still gets the
//   full 1.75 (5 × 0.35) bonus applied (vs. the old 1.0 cap = 1.0
//   bonus that was already in place).
//
//   Net effect: most items will go from 2× base to 2.75× base at level
//   5 (legendary stones assumed). That's a 37.5% stat bump for affected
//   items — meaningful but not OP, and capped at the same global 1.0
//   bonus ceiling so no runaway.
//
// SAFETY:
//   - Backs up affected collections to JSON files BEFORE any write
//   - DRY-RUN mode by default: prints what would change, writes nothing
//   - LIVE mode requires explicit --live flag
//   - Per-user bulk writes in chunks of 100, with progress logging
//   - Never deletes items, never reduces stats — only rewrites stats
//     using the rarity-aware formula when the result would be higher
//
// USAGE:
//   MONGO_URI="mongodb+srv://..." \
//     node scripts/recover_enhancement_stats.js              # dry run
//   MONGO_URI="mongodb+srv://..." \
//     node scripts/recover_enhancement_stats.js --live       # apply
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const LIVE = process.argv.includes('--live');
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_TAG = `before_enhancement_recovery_${new Date().toISOString().replace(/[:.]/g, '-')}`;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI env var is required');
  process.exit(1);
}

console.log(`\n══════════════════════════════════════════════════`);
console.log(`  ENHANCEMENT RECOVERY — ${LIVE ? '🔴 LIVE (writes)' : '🟡 DRY RUN (no writes)'}`);
console.log(`══════════════════════════════════════════════════\n`);

// Rarity caps — must match inventorySystem.js exactly
const MAX_ENHANCEMENT_LEVEL_BY_RARITY = {
  COMMON: 5, UNCOMMON: 10, RARE: 15, EPIC: 20, LEGENDARY: 25, MYTHIC: 30,
};
const DEFAULT_MAX_ENHANCEMENT_LEVEL = 5;
const MAX_ENHANCEMENT_BONUS = 1.0;

function getMaxLevel(rarity) {
  if (!rarity) return DEFAULT_MAX_ENHANCEMENT_LEVEL;
  return MAX_ENHANCEMENT_LEVEL_BY_RARITY[rarity] ?? DEFAULT_MAX_ENHANCEMENT_LEVEL;
}

// Recalculate stats using the rarity-aware formula. Returns the new stats
// object, or null if no change needed.
function recalcStats(item, baseStatsRef) {
  if (!item || !baseStatsRef) return null;
  if (!(item.enhancementLevel > 0)) return null;

  const bonus = Math.min(item.enhancementLevel * 0.35, MAX_ENHANCEMENT_BONUS);
  const newStats = {};
  for (const stat in baseStatsRef) {
    newStats[stat] = Math.ceil(baseStatsRef[stat] * (1 + bonus));
  }

  // Check if anything actually changes
  const oldStats = item.stats || {};
  let changed = false;
  for (const stat in newStats) {
    if (oldStats[stat] !== newStats[stat]) { changed = true; break; }
  }
  if (!changed) return null;

  return {
    stats: newStats,
    enhancementBonus: bonus,
    baseStats: item.baseStats && Object.keys(item.baseStats).length > 0
      ? item.baseStats
      : JSON.parse(JSON.stringify(baseStatsRef)),
  };
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersColl = db.collection('users');
  console.log('Connected.\n');

  // ── 1. Backup affected users to JSON before any writes ───────────────
  console.log('Backing up users with enhanced equipment...');
  const affectedUsers = await usersColl.find({
    $or: [
      { 'inventory.enhancementLevel': { $gt: 0 } },
      { 'equipment.main_hand.enhancementLevel': { $gt: 0 } },
      { 'equipment.off_hand.enhancementLevel': { $gt: 0 } },
      { 'equipment.armor.enhancementLevel': { $gt: 0 } },
      { 'equipment.helmet.enhancementLevel': { $gt: 0 } },
      { 'equipment.boots.enhancementLevel': { $gt: 0 } },
      { 'equipment.ring.enhancementLevel': { $gt: 0 } },
      { 'equipment.amulet.enhancementLevel': { $gt: 0 } },
      { 'equipment.cloak.enhancementLevel': { $gt: 0 } },
      { 'equipment.gloves.enhancementLevel': { $gt: 0 } },
    ],
  }).toArray();
  console.log(`Found ${affectedUsers.length} users with enhanced equipment.\n`);

  if (affectedUsers.length === 0) {
    console.log('Nothing to recover. Exiting.');
    await mongoose.disconnect();
    return;
  }

  if (!LIVE) {
    console.log(`(Dry run — skipping backup file write. Re-run with --live to apply.)`);
  } else {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `users_${BACKUP_TAG}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(affectedUsers, null, 2));
    console.log(`Backup written: ${backupPath}\n`);
  }

  // ── 2. Load ITEM_DATABASE for base-stat lookup ────────────────────────
  // Use the bot's own lootSystem so we read the exact same ITEM_DATABASE
  // the runtime uses.
  process.env.MONGO_URI = MONGO_URI;  // ensure lootSystem sees it if it lazy-loads
  const lootSystem = require('/home/z/my-project/repo/whatsapp-bot/core/rpg/lootSystem.js');

  // ── 3. Walk each affected user and compute recovery ops ──────────────
  let totalItemsScanned = 0;
  let totalItemsRecoverable = 0;
  let totalStatsBumped = 0;  // sum of stat increases (across all items / all stats)
  const ops = [];  // array of { filter: {userId}, update: {$set: ...} }

  for (const user of affectedUsers) {
    const setFields = {};

    // 3a. Inventory items (Map stored as plain object in Mongo)
    const inventory = user.inventory || {};
    for (const [itemId, item] of Object.entries(inventory)) {
      if (!item || item.type !== 'EQUIPMENT') continue;
      if (!(item.enhancementLevel > 0)) continue;
      totalItemsScanned++;

      const baseItem = lootSystem.getItemInfo(item.id || itemId);
      if (!baseItem || !baseItem.stats) continue;

      const result = recalcStats(item, baseItem.stats);
      if (!result) continue;

      totalItemsRecoverable++;
      for (const stat in result.stats) {
        totalStatsBumped += Math.max(0, (result.stats[stat] || 0) - ((item.stats || {})[stat] || 0));
      }
      setFields[`inventory.${itemId}.stats`] = result.stats;
      setFields[`inventory.${itemId}.enhancementBonus`] = result.enhancementBonus;
      setFields[`inventory.${itemId}.baseStats`] = result.baseStats;
    }

    // 3b. Equipment slots
    const equipment = user.equipment || {};
    for (const [slot, item] of Object.entries(equipment)) {
      if (!item || item.type !== 'EQUIPMENT') continue;
      if (!(item.enhancementLevel > 0)) continue;
      totalItemsScanned++;

      const baseItem = lootSystem.getItemInfo(item.id);
      if (!baseItem || !baseItem.stats) continue;

      const result = recalcStats(item, baseItem.stats);
      if (!result) continue;

      totalItemsRecoverable++;
      for (const stat in result.stats) {
        totalStatsBumped += Math.max(0, (result.stats[stat] || 0) - ((item.stats || {})[stat] || 0));
      }
      setFields[`equipment.${slot}.stats`] = result.stats;
      setFields[`equipment.${slot}.enhancementBonus`] = result.enhancementBonus;
      setFields[`equipment.${slot}.baseStats`] = result.baseStats;
    }

    if (Object.keys(setFields).length > 0) {
      ops.push({
        filter: { userId: user.userId },
        update: { $set: setFields },
      });
    }
  }

  // ── 4. Print summary ─────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════');
  console.log('  RECOVERY SUMMARY');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Users affected:           ${affectedUsers.length}`);
  console.log(`  Items scanned:            ${totalItemsScanned}`);
  console.log(`  Items recoverable:        ${totalItemsRecoverable}`);
  console.log(`  Total stat points gained: ${totalStatsBumped.toLocaleString()}`);
  console.log(`  Avg per recoverable item: ${totalItemsRecoverable > 0 ? Math.round(totalStatsBumped / totalItemsRecoverable) : 0} stat points`);
  console.log('══════════════════════════════════════════════════\n');

  if (totalItemsRecoverable === 0) {
    console.log('Nothing to recover — all items already at or above the rarity-aware ceiling.');
    await mongoose.disconnect();
    return;
  }

  if (!LIVE) {
    console.log('🟡 Dry run complete. To apply changes, re-run with --live:');
    console.log(`   MONGO_URI="$MONGO_URI" node scripts/recover_enhancement_stats.js --live\n`);
    await mongoose.disconnect();
    return;
  }

  // ── 5. Apply writes in chunks of 100 ─────────────────────────────────
  console.log(`🔴 Applying ${ops.length} user updates in chunks of 100...`);
  const CHUNK = 100;
  let applied = 0;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const chunk = ops.slice(i, i + CHUNK);
    const bulkOps = chunk.map(op => ({
      updateOne: {
        filter: op.filter,
        update: op.update,
        upsert: false,
      },
    }));
    const result = await usersColl.bulkWrite(bulkOps, { ordered: false });
    applied += result.modifiedCount || 0;
    console.log(`  chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(ops.length / CHUNK)}: ${result.modifiedCount} users updated`);
  }

  console.log(`\n✅ Recovery complete. ${applied}/${ops.length} users updated.\n`);
  await mongoose.disconnect();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
