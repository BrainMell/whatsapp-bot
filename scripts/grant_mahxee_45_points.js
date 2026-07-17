// Grant 45 stat points to Mahxee specifically
// Usage: MONGO_URI=... node scripts/grant_mahxee_45_points.js [--live]
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const LIVE = process.argv.includes('--live');
const TARGET_NICKNAME = 'Mahxee';
const POINTS_TO_GRANT = 45;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI env var is required');
  process.exit(1);
}

console.log(`\n══════════════════════════════════════════════════`);
console.log(`  GRANT ${POINTS_TO_GRANT} STAT POINTS to "${TARGET_NICKNAME}" — ${LIVE ? '🔴 LIVE' : '🟡 DRY RUN'}`);
console.log(`══════════════════════════════════════════════════\n`);

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersColl = db.collection('users');

  // Search case-insensitively by nickname
  const matches = await usersColl.find({
    nickname: { $regex: `^${TARGET_NICKNAME}$`, $options: 'i' }
  }).toArray();

  console.log(`Found ${matches.length} user(s) matching nickname "${TARGET_NICKNAME}":`);
  for (const u of matches) {
    const currentPoints = u.progression?.statPoints ?? u.statPoints ?? 0;
    console.log(`  - ${u.userId} | nickname="${u.nickname}" | current statPoints=${currentPoints}`);
  }

  if (matches.length === 0) {
    console.log('\n❌ No user found with that nickname. Searching phone-number variants...');
    // Try searching by phone-pattern in userId (Mahxee might have a phone-based JID)
    const phoneMatches = await usersColl.find({
      userId: { $regex: 'mahxee', $options: 'i' }
    }).toArray();
    console.log(`Found ${phoneMatches.length} user(s) matching userId regex "mahxee":`);
    for (const u of phoneMatches) {
      console.log(`  - ${u.userId} | nickname="${u.nickname}"`);
    }
    if (phoneMatches.length === 0) {
      console.log('\n❌ Could not find Mahxee. Ask the user for their exact nickname or JID.');
      await mongoose.disconnect();
      return;
    }
    matches.push(...phoneMatches);
  }

  if (!LIVE) {
    console.log(`\n🟡 Dry run — would grant ${POINTS_TO_GRANT} stat points to ${matches.length} user(s).`);
    console.log(`   Re-run with --live to apply.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`\n🔴 Applying +${POINTS_TO_GRANT} stat points to ${matches.length} user(s)...`);

  for (const user of matches) {
    // Try progression.statPoints first (canonical location), fall back to top-level statPoints
    const update = {
      $inc: {}
    };
    // Always increment progression.statPoints if it exists, else top-level
    if (user.progression && typeof user.progression.statPoints === 'number') {
      update.$inc['progression.statPoints'] = POINTS_TO_GRANT;
    } else if (typeof user.statPoints === 'number') {
      update.$inc['statPoints'] = POINTS_TO_GRANT;
    } else {
      // Neither exists — set both
      update.$set = {
        'progression.statPoints': POINTS_TO_GRANT,
        'statPoints': POINTS_TO_GRANT,
      };
      delete update.$inc;
    }

    const result = await usersColl.updateOne({ userId: user.userId }, update);
    console.log(`  ${result.modifiedCount > 0 ? '✅' : '⚠️'} ${user.userId} (${user.nickname}): ${result.modifiedCount > 0 ? 'updated' : 'no change'}`);
  }

  console.log(`\n✅ Done. Players can use \`.g resetstats\` if they want to reallocate.`);
  await mongoose.disconnect();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
