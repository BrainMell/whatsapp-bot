// Find any user whose nickname contains "mahx" or "mahxee" — case-insensitive
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const usersColl = db.collection('users');

  // Search nickname contains mahx
  console.log('\n=== Users with nickname matching /mahx/i ===');
  const matches = await usersColl.find({
    $or: [
      { nickname: { $regex: 'mahx', $options: 'i' } },
      { userId: { $regex: 'mahx', $options: 'i' } },
    ]
  }).limit(20).toArray();
  console.log(`Found ${matches.length}:`);
  for (const u of matches) {
    console.log(`  - userId=${u.userId}`);
    console.log(`    nickname="${u.nickname}"`);
    console.log(`    statPoints=${u.statPoints ?? 'n/a'}`);
    console.log(`    progression.statPoints=${u.progression?.statPoints ?? 'n/a'}`);
    console.log('');
  }

  // Also list 10 sample users to see the field shape
  console.log('\n=== Sample 5 users (just to see field shape) ===');
  const samples = await usersColl.find({}).limit(5).toArray();
  for (const u of samples) {
    console.log(`  - userId=${u.userId} | nickname="${u.nickname}" | statPoints=${u.statPoints ?? 'n/a'} | progression.statPoints=${u.progression?.statPoints ?? 'n/a'}`);
  }

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
