// snapshot_user.js - copy user docs to a snapshot collection before tests
// usage: node snapshot_user.js <jid> [<jid>...]
const connectDB = require('/home/ubuntu/whatsapp-bot/db');
const mongoose = require('mongoose');
(async () => {
  await connectDB();
  for (const jid of process.argv.slice(2)) {
    const col = mongoose.connection.db.collection('users');
    const d = await col.findOne({ $or: [{ userId: jid }, { jid: jid }] });
    if (!d) { console.log('NODOC', jid); continue; }
    const copy = JSON.parse(JSON.stringify(d));
    await mongoose.connection.db.collection('__e2e_snapshot').replaceOne({ jid }, copy, { upsert: true });
    console.log('SNAP OK', jid, 'style', d.cardStyle || 0);
  }
  process.exit(0);
})().catch((e) => { console.error('E', e.message); process.exit(1); });
