require('dotenv').config();
const connectDB = require('../db');
const Summon = require('../core/models/Summon');
const User = require('../core/models/User');

(async () => {
  await connectDB();
  
  // Find the user by nickname 'mell' or by LID from logs
  let user = await User.findOne({ nickname: /mell/i });
  if (!user) {
    user = await User.findOne({ userId: '251453323092189@lid' });
  }
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }
  
  console.log('Found user:', user.userId, '| nickname:', user.nickname);
  console.log('activeSummonId:', user.activeSummonId);
  console.log('summonSlots:', user.summonSlots);
  
  const summons = await Summon.find({ ownerJid: user.userId });
  console.log('\n=== CURRENT SUMMONS ===');
  console.log('Total:', summons.length);
  for (const s of summons) {
    console.log('  ' + s.summonId + ' | ' + s.species + ' | ' + (s.nickname || 'no nick') + ' | Lv.' + s.level + ' | ' + s.rarity + (s.summonId === user.activeSummonId ? ' | ACTIVE' : ''));
  }
  
  process.exit(0);
})();
