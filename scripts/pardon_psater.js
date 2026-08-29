// scripts/pardon_psater.js — clear psater from all ban/block lists in MongoDB
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const uri = m[1].trim().replace(/^["']|["']$/g, '');

const PSATER_JID = '258690259108066@lid';

async function main() {
  await mongoose.connect(uri);
  console.log('Connected:', mongoose.connection.db.databaseName);
  const System = require('../core/models/System');

  const lists = ['_shared_banned_users', '_shared_hard_banned_users', '_shared_blocked_users'];
  let cleared = [];
  for (const key of lists) {
    const doc = await System.findOne({ key });
    if (doc && Array.isArray(doc.value) && doc.value.includes(PSATER_JID)) {
      const filtered = doc.value.filter(j => j !== PSATER_JID);
      doc.value = filtered;
      await doc.save();
      cleared.push(key);
      console.log(`[+] Cleared psater from ${key}. Remaining: ${filtered.length}`);
    }
  }
  if (cleared.length === 0) {
    console.log('Psater was not on any list — no action needed.');
  } else {
    console.log(`\n✅ PARDONED psater from: ${cleared.join(', ')}`);
    console.log('⚠️  Bot must be restarted (pm2 restart whatsapp-bot) for in-memory Sets to refresh.');
  }
  await mongoose.disconnect();
}
main();
