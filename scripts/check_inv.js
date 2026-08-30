// scripts/check_inv.js - check if inventories were cleared
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const uri = m[1].trim().replace(/^["']|["']$/g, '');

async function main() {
  await mongoose.connect(uri);
  console.log('Connected:', mongoose.connection.db.databaseName);
  const User = require('../core/models/User');
  const count = await User.countDocuments({});
  const withInv = await User.countDocuments({ 'inventory.0': { $exists: true } });
  const withSkills = await User.countDocuments({ 'skills.0': { $exists: true } });
  const withClass = await User.countDocuments({ class: { $ne: null, $exists: true } });
  const withActiveSummon = await User.countDocuments({ activeSummonId: { $ne: null, $exists: true } });
  console.log('Total users:', count);
  console.log('Users with non-empty inventory:', withInv);
  console.log('Users with non-empty skills:', withSkills);
  console.log('Users with class set:', withClass);
  console.log('Users with activeSummonId set:', withActiveSummon);
  const Summon = require('../core/models/Summon');
  const Rune = require('../core/models/Rune');
  console.log('Summon docs in DB:', await Summon.countDocuments({}));
  console.log('Rune docs in DB:', await Rune.countDocuments({}));
  await mongoose.disconnect();
}
main();
