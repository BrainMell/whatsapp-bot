const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const CardStat = require('../core/models/CardStat');
const UserCard = require('../core/models/UserCard');
const CardMarket = require('../core/models/CardMarket');

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  console.log(`🧹 MongoDB Cleanup Script for Old Event Cards`);
  console.log(`⚙️  Mode: ${isDryRun ? 'DRY-RUN (Preview changes only)' : 'LIVE (Changes will be written to DB)'}`);

  // 1. Connect to MongoDB
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI not found in .env file!");
    process.exit(1);
  }

  console.log("📡 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB.");

  try {
    // 2. Load the new cards database
    const cardsDataPath = path.join(__dirname, '..', 'core', 'data', 'cards_data.json');
    if (!fs.existsSync(cardsDataPath)) {
      throw new Error(`Cards JSON database not found at ${cardsDataPath}`);
    }

    const cardsJson = JSON.parse(fs.readFileSync(cardsDataPath, 'utf8'));
    const cardsList = Array.isArray(cardsJson.cards) ? cardsJson.cards : Object.values(cardsJson.cards);
    console.log(`📖 Loaded ${cardsList.length} cards from cards_data.json`);

    // Build lookup map from hex ID to new E-XXXXX ID
    // We parse the hex ID from detailUrl (e.g. ".../event-slug/65cdfc96eefd6fa3e4d1dbe4")
    const hexToNewIdMap = new Map();
    for (const card of cardsList) {
      if (String(card.tier).toUpperCase() === 'E' && card.detailUrl) {
        const parts = card.detailUrl.split('/').filter(Boolean);
        const hexId = parts[parts.length - 1];
        if (hexId && hexId.length > 10) {
          hexToNewIdMap.set(hexId.toLowerCase(), card.id);
        }
      }
    }
    console.log(`🗺️  Mapped ${hexToNewIdMap.size} E-tier cards from JSON database.`);

    // --- Part A: CardStat Cleanup ---
    // Deletes stats where cardId starts with 'event-'
    console.log('\n--- CardStat Collection Cleanup ---');
    const oldStats = await CardStat.find({ cardId: { $regex: /^event-/ } });
    console.log(`🔍 Found ${oldStats.length} CardStat records with old 'event-<hex>' IDs.`);
    
    if (oldStats.length > 0) {
      if (isDryRun) {
        console.log(`   [Dry Run] Would delete ${oldStats.length} CardStat records.`);
      } else {
        const result = await CardStat.deleteMany({ cardId: { $regex: /^event-/ } });
        console.log(`   ✅ Successfully deleted ${result.deletedCount} CardStat records.`);
      }
    } else {
      console.log(`   ✓ No old CardStat records found.`);
    }

    // --- Part B: CardMarket Cleanup ---
    // Deletes listings where cardId starts with 'event-'
    console.log('\n--- CardMarket Collection Cleanup ---');
    const oldListings = await CardMarket.find({ cardId: { $regex: /^event-/ } });
    console.log(`🔍 Found ${oldListings.length} CardMarket listings with old 'event-<hex>' IDs.`);

    if (oldListings.length > 0) {
      if (isDryRun) {
        console.log(`   [Dry Run] Would delete ${oldListings.length} CardMarket listings.`);
      } else {
        const result = await CardMarket.deleteMany({ cardId: { $regex: /^event-/ } });
        console.log(`   ✅ Successfully deleted ${result.deletedCount} CardMarket listings.`);
      }
    } else {
      console.log(`   ✓ No old CardMarket listings found.`);
    }

    // --- Part C: UserCard Migration/Cleanup ---
    // Migrates matching old event cards, deletes those without a match
    console.log('\n--- UserCard Collection Cleanup/Migration ---');
    const oldUserCards = await UserCard.find({ cardId: { $regex: /^event-/ } });
    console.log(`🔍 Found ${oldUserCards.length} UserCards with old 'event-<hex>' IDs.`);

    let migrateCount = 0;
    let deleteCount = 0;

    for (const uc of oldUserCards) {
      const oldId = uc.cardId;
      const hexId = oldId.replace('event-', '').toLowerCase();
      const newId = hexToNewIdMap.get(hexId);

      if (newId) {
        migrateCount++;
        if (isDryRun) {
          console.log(`   [Dry Run] UserCard ${uc._id} (User: ${uc.userId}) would migrate: ${oldId} ➔ ${newId}`);
        } else {
          uc.cardId = newId;
          await uc.save();
        }
      } else {
        deleteCount++;
        if (isDryRun) {
          console.log(`   [Dry Run] UserCard ${uc._id} (User: ${uc.userId}) has no matching card in JSON database. Would delete.`);
        } else {
          await UserCard.deleteOne({ _id: uc._id });
        }
      }
    }

    if (oldUserCards.length > 0) {
      if (isDryRun) {
        console.log(`\n📊 Summary [Dry Run]:`);
        console.log(`   • Would migrate: ${migrateCount} UserCards`);
        console.log(`   • Would delete:  ${deleteCount} UserCards`);
      } else {
        console.log(`\n📊 Summary:`);
        console.log(`   • Successfully migrated: ${migrateCount} UserCards`);
        console.log(`   • Successfully deleted:  ${deleteCount} UserCards`);
      }
    } else {
      console.log(`   ✓ No old UserCard records found.`);
    }

    console.log('\n🎉 Cleanup process completed.');

  } catch (err) {
    console.error("❌ Cleanup failed with error:", err.message);
  } finally {
    console.log("🔌 Disconnecting from MongoDB...");
    await mongoose.disconnect();
    console.log("✅ Disconnected.");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
