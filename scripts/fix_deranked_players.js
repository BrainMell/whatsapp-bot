// Fix deranked players in production database.
// This script finds ALL F-rank players whose level+quests qualify them for
// a higher rank, and restores their correct rank.
const mongoose = require('mongoose');
const path = require('path');
const uri = 'mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

(async () => {
  await mongoose.connect(uri);
  const User = require(path.join(__dirname, '..', 'core', 'models', 'User'));
  const classSystem = require(path.join(__dirname, '..', 'core', 'rpg', 'classSystem'));

  // 1. Find ALL F-rank players where calculated rank is higher
  console.log('=== SCANNING FOR DERANKED PLAYERS ===');
  const allF = await User.find({ registered: true, adventurerRank: 'F' }).lean();
  console.log('Total F-rank players:', allF.length);

  let fixedCount = 0;
  for (const u of allF) {
    const level = u.progression?.level || 1;
    const quests = u.questsCompleted || 0;
    const calcRank = classSystem.calculateAdventurerRank(level, quests, 0);

    if (calcRank !== 'F') {
      console.log('  FIXING: ' + (u.nickname || u.userId) + ' — F → ' + calcRank +
        ' (Lv.' + level + ', ' + quests + ' quests)');
      await User.updateOne({ _id: u._id }, { $set: { adventurerRank: calcRank } });
      fixedCount++;
    }
  }
  console.log('\nTotal players fixed:', fixedCount);

  // 2. Also check for players who might have been deranked to ranks lower than
  // what their level+quests warrant (not just F — could be E when they should be C, etc.)
  console.log('\n=== CHECKING ALL PLAYERS FOR UNDER-RANKING ===');
  const allUsers = await User.find({ registered: true }).lean();
  const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'GOD'];
  let underRanked = 0;

  for (const u of allUsers) {
    const level = u.progression?.level || 1;
    const quests = u.questsCompleted || 0;
    const calcRank = classSystem.calculateAdventurerRank(level, quests, 0);
    const currentRank = u.adventurerRank || 'F';
    const currentIdx = rankOrder.indexOf(currentRank);
    const calcIdx = rankOrder.indexOf(calcRank);

    if (calcIdx > currentIdx) {
      console.log('  UNDER-RANKED: ' + (u.nickname || u.userId) +
        ' — Current: ' + currentRank + ' → Should be: ' + calcRank +
        ' (Lv.' + level + ', ' + quests + ' quests)');
      // Only fix if the under-ranking is clear (calcRank is at least 2 tiers higher)
      // We DON'T fix players who are at a mission gate — they're correctly blocked
      // from the NEXT rank but should still be at their current rank.
      // However, if they're MORE than 1 tier below their calculated rank, they
      // were definitely deranked by the old bug.
      if (calcIdx - currentIdx >= 2) {
        console.log('    FIXING (>= 2 tiers below): ' + currentRank + ' → ' + calcRank);
        await User.updateOne({ _id: u._id }, { $set: { adventurerRank: calcRank } });
        underRanked++;
      }
    }
  }
  console.log('\nTotal under-ranked players fixed:', underRanked);

  // 3. Verify specific players
  console.log('\n=== VERIFICATION ===');
  const checks = ['akon', 'too much', 'slade', 'ayomide', 'tanluffy', 'mell', 'void'];
  for (const name of checks) {
    const u = await User.findOne({ nickname: { $regex: name, $options: 'i' } }).lean();
    if (u) {
      const level = u.progression?.level || 1;
      const quests = u.questsCompleted || 0;
      const calcRank = classSystem.calculateAdventurerRank(level, quests, 0);
      console.log('  ' + u.nickname + ' — Rank: ' + u.adventurerRank +
        ' (calculated: ' + calcRank + ', Lv.' + level + ', ' + quests + ' quests)');
    }
  }

  // 4. Final rank distribution
  console.log('\n=== FINAL RANK DISTRIBUTION ===');
  const final = await User.find({ registered: true }).select('adventurerRank').lean();
  const counts = {};
  final.forEach(u => { const r = u.adventurerRank || 'F'; counts[r] = (counts[r]||0)+1; });
  rankOrder.forEach(r => { if (counts[r]) console.log('  ' + r + '-rank: ' + counts[r]); });

  process.exit(0);
})();
