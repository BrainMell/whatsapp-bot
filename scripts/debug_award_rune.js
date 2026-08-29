// scripts/debug_award_rune.js
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const uri = m[1].trim().replace(/^["']|["']$/g, '');
const TEST_JID = 'test_award_rune_debug@s.whatsapp.net';

async function main() {
  await mongoose.connect(uri);
  console.log('Connected to:', mongoose.connection.db.databaseName);
  const runeSystem = require('../core/rpg/runeSystem');
  const Rune = require('../core/models/Rune');
  await Rune.deleteMany({ ownerJid: TEST_JID });
  try {
    console.log('Calling awardRune...');
    const result = await runeSystem.awardRune(TEST_JID, 'POWER', 'GREATER', 'admin_grant');
    console.log('Result.success:', result.success);
    console.log('Result.message:', result.message);
    if (result.rune) {
      console.log('Rune ID:', result.rune.runeId);
      console.log('Rune type:', result.rune.type);
      console.log('Rune tier:', result.rune.tier);
    }
  } catch (e) {
    console.error('THREW:', e.message);
    console.error(e.stack);
  }
  await Rune.deleteMany({ ownerJid: TEST_JID });
  await mongoose.disconnect();
}

main();
