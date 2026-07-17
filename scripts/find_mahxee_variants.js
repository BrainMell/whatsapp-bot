const mongoose = require('mongoose');
const M = 'mongodb+srv://admin:umtaSx2zu940HhKQ@cluster0.drpztk6.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

(async () => {
  await mongoose.connect(M);
  const db = mongoose.connection.db;
  const queries = ['mahx', 'max', 'mahxe', 'maxe', 'mee', 'xee', 'hex', 'mxe'];
  for (const q of queries) {
    const m = await db.collection('users').find({
      nickname: { $regex: q, $options: 'i' }
    }).limit(5).toArray();
    if (m.length > 0) {
      console.log(`regex "${q}" → ${m.length} matches:`);
      for (const u of m) {
        console.log(`  - ${u.userId} | nickname="${u.nickname}" | statPoints=${u.progression?.statPoints ?? 'n/a'}`);
      }
    }
  }
  await mongoose.disconnect();
})().catch(e => console.error('FATAL:', e));
