const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const User = require('../core/models/User');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    val = JSON.stringify(val);
  } else {
    val = String(val);
  }
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

async function exportUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    console.log('Fetching all user documents from database...');
    const users = await User.find({}).lean();
    console.log(`Fetched ${users.length} users.`);

    // 1. Save full JSON export
    const jsonPath = path.join(__dirname, '..', 'users_export.json');
    fs.writeFileSync(jsonPath, JSON.stringify(users, null, 2), 'utf-8');
    const jsonStats = fs.statSync(jsonPath);
    console.log(`✅ Exported JSON to ${jsonPath} (${(jsonStats.size / (1024 * 1024)).toFixed(2)} MB)`);

    // 2. Prepare CSV Export
    // Gather all possible flat key paths across documents or standard header list
    const headers = [
      'userId',
      'registered',
      'nickname',
      'phoneHash',
      'wallet',
      'bank',
      'class',
      'adventurerRank',
      'spriteIndex',
      'level',
      'xp',
      'hp',
      'maxHp',
      'currentHP',
      'questGold',
      'questsCompleted',
      'questsWon',
      'questsFailed',
      'pvpWins',
      'pvpLosses',
      'eventTokens',
      'totalEarned',
      'totalSpent',
      'totalGambled',
      'gamesPlayed',
      'gamesWon',
      'gamesLost',
      'biggestWin',
      'biggestLoss',
      'bossesDefeated',
      'dragonsKilled',
      'itemsCrafted',
      'itemsEquipped',
      'undeadKills',
      'kills',
      'membership_tier',
      'membership_expires',
      'inventorySlots',
      'inventory',
      'equipment',
      'statBonuses',
      'professions',
      'progression_level',
      'progression_xp',
      'progression_gp',
      'progression_totalGP',
      'progression_statPoints',
      'frozenAssets',
      'summonSlots',
      'activeSummonId',
      'profile_whatsappName',
      'profile_nickname',
      'profile_firstSeen',
      'profile_lastSeen',
      'profile_messageCount',
      'createdAt',
      'updatedAt'
    ];

    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const u of users) {
      const row = [
        escapeCSV(u.userId),
        escapeCSV(u.registered),
        escapeCSV(u.nickname),
        escapeCSV(u.phoneHash),
        escapeCSV(u.wallet),
        escapeCSV(u.bank),
        escapeCSV(u.class),
        escapeCSV(u.adventurerRank),
        escapeCSV(u.spriteIndex),
        escapeCSV(u.stats?.level ?? u.progression?.level),
        escapeCSV(u.stats?.xp ?? u.progression?.xp),
        escapeCSV(u.stats?.hp),
        escapeCSV(u.stats?.maxHp),
        escapeCSV(u.stats?.currentHP),
        escapeCSV(u.questGold),
        escapeCSV(u.questsCompleted),
        escapeCSV(u.questsWon),
        escapeCSV(u.questsFailed),
        escapeCSV(u.pvpWins),
        escapeCSV(u.pvpLosses),
        escapeCSV(u.eventTokens),
        escapeCSV(u.stats?.totalEarned),
        escapeCSV(u.stats?.totalSpent),
        escapeCSV(u.stats?.totalGambled),
        escapeCSV(u.stats?.gamesPlayed),
        escapeCSV(u.stats?.gamesWon),
        escapeCSV(u.stats?.gamesLost),
        escapeCSV(u.stats?.biggestWin),
        escapeCSV(u.stats?.biggestLoss),
        escapeCSV(u.stats?.bossesDefeated),
        escapeCSV(u.stats?.dragonsKilled),
        escapeCSV(u.stats?.itemsCrafted),
        escapeCSV(u.stats?.itemsEquipped),
        escapeCSV(u.stats?.undeadKills),
        escapeCSV(u.stats?.kills),
        escapeCSV(u.membership?.tier),
        escapeCSV(u.membership?.expires),
        escapeCSV(u.inventorySlots),
        escapeCSV(u.inventory),
        escapeCSV(u.equipment),
        escapeCSV(u.statBonuses),
        escapeCSV(u.professions),
        escapeCSV(u.progression?.level),
        escapeCSV(u.progression?.xp),
        escapeCSV(u.progression?.gp),
        escapeCSV(u.progression?.totalGP),
        escapeCSV(u.progression?.statPoints),
        escapeCSV(u.frozenAssets),
        escapeCSV(u.summonSlots),
        escapeCSV(u.activeSummonId),
        escapeCSV(u.profile?.whatsappName),
        escapeCSV(u.profile?.nickname),
        escapeCSV(u.profile?.stats?.firstSeen),
        escapeCSV(u.profile?.stats?.lastSeen),
        escapeCSV(u.profile?.stats?.messageCount),
        escapeCSV(u.createdAt ? new Date(u.createdAt).toISOString() : ''),
        escapeCSV(u.updatedAt ? new Date(u.updatedAt).toISOString() : '')
      ];
      csvRows.push(row.join(','));
    }

    const csvPath = path.join(__dirname, '..', 'users_export.csv');
    fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');
    const csvStats = fs.statSync(csvPath);
    console.log(`✅ Exported CSV to ${csvPath} (${(csvStats.size / (1024 * 1024)).toFixed(2)} MB)`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error exporting users:', err);
    process.exit(1);
  }
}

exportUsers();
