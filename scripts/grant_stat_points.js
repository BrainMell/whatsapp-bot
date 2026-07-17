// scripts/grant_stat_points.js
//
// Finds a user by fuzzy nickname match and grants them a number of
// unallocated stat points (the same `statPoints` field the .g stats
// command spends from). Backs up the affected document first per
// Critical Rule #8.
//
// Usage:
//   node scripts/grant_stat_points.js "mah_xee" 45
//   node scripts/grant_stat_points.js "mah_xee" 45 --apply   (writes for real; without --apply it's a dry run)

const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');

const [, , nicknameQuery, pointsArg, applyFlag] = process.argv;
const points = parseInt(pointsArg, 10);
const apply = applyFlag === '--apply';

if (!nicknameQuery || !Number.isFinite(points) || points <= 0) {
  console.error('Usage: node scripts/grant_stat_points.js "<nickname or partial>" <points> [--apply]');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection('users');

  // Case-insensitive partial match against nickname, and against the
  // raw userId (in case the JID/phone-derived fallback name was used).
  const regex = new RegExp(nicknameQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const matches = await users.find({
    $or: [{ nickname: regex }, { userId: regex }]
  }).toArray();

  if (matches.length === 0) {
    console.log(`No user found matching "${nicknameQuery}". Try a shorter fragment.`);
    await mongoose.disconnect();
    return;
  }

  if (matches.length > 1) {
    console.log(`Found ${matches.length} users matching "${nicknameQuery}" — be more specific:`);
    matches.forEach(u => console.log(`  - ${u.nickname}  (userId: ${u.userId}, current statPoints: ${u.statPoints ?? 0})`));
    await mongoose.disconnect();
    return;
  }

  const user = matches[0];
  console.log(`Match: ${user.nickname} (userId: ${user.userId})`);
  console.log(`Current statPoints: ${user.statPoints ?? 0} -> ${(user.statPoints ?? 0) + points}`);

  if (!apply) {
    console.log('\nDry run only — nothing written. Re-run with --apply to actually grant the points.');
    await mongoose.disconnect();
    return;
  }

  // Backup per Critical Rule #8
  const backupPath = `users.before_grant_${user.userId.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(user, null, 2));
  console.log(`Backed up affected document to ${backupPath}`);

  const result = await users.updateOne(
    { _id: user._id },
    { $inc: { statPoints: points } }
  );

  const updated = await users.findOne({ _id: user._id });
  console.log(`Done. ${user.nickname} now has ${updated.statPoints} unallocated stat points.`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
