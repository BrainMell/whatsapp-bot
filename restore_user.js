// restore_user.js - restore user docs from the snapshot collection
// usage: node restore_user.js <jid> [<jid>...]
const connectDB = require('/home/ubuntu/whatsapp-bot/db');
const mongoose = require('mongoose');
(async () => {
  await connectDB();
  for (const jid of process.argv.slice(2)) {
    const snap = mongoose.connection.db.collection('__e2e_snapshot');
    const d = await snap.findOne({ jid });
    if (!d) { console.log('NOSNAP', jid); continue; }
    delete d._id;
    const col = mongoose.connection.db.collection('users');
    const cur = await col.findOne({ $or: [{ userId: jid }, { jid: jid }] });
    delete d.jid_dup;
    const doc = JSON.parse(JSON.stringify(d));
    if (cur && cur.userId) doc.userId = cur.userId;
    await col.replaceOne({ $or: [{ userId: jid }, { jid: jid }] }, doc, { upsert: true });
    console.log('RESTORE OK', jid);
  }
  process.exit(0);
})().catch((e) => { console.error('E', e.message); process.exit(1); });
