// scripts/lookup_psater.js — diagnostic for psater's ban/block state
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
  let psaterOnAnyList = false;
  for (const key of lists) {
    const doc = await System.findOne({ key });
    if (doc && Array.isArray(doc.value)) {
      const onList = doc.value.includes(PSATER_JID);
      console.log(`${key}: ${doc.value.length} entries${onList ? '  ⚠️ PSATER IS ON THIS LIST' : ''}`);
      if (onList) {
        psaterOnAnyList = true;
        console.log('  Full list:', JSON.stringify(doc.value));
      }
    } else {
      console.log(`${key}: not found or empty`);
    }
  }
  console.log('\nResult:', psaterOnAnyList ? 'PSATER needs pardon' : 'PSATER is not on any list');
  await mongoose.disconnect();
}
main();
