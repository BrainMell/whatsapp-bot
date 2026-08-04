// Test script: simulates the .summons command flow
// Runs on Box 1, calls the Go service, verifies the GIF
require('dotenv').config();
const connectDB = require('../db');
const Summon = require('../core/models/Summon');
const User = require('../core/models/User');
const economy = require('../core/rpg/economy');
const summonSystem = require('../core/rpg/summonSystem');
const registry = require('../core/rpg/summonRegistry');
const goService = require('../core/utils/goImageService');

(async () => {
  console.log('=== SUMMON ROSTER END-TO-END TEST ===\n');
  
  await connectDB();
  
  // Get mell's data
  const userId = '251453323092189@lid';
  await economy.reloadUserFromDB(userId);
  const user = economy.getUser(userId);
  if (!user) { console.log('FAIL: user not found'); process.exit(1); }
  console.log('✅ User found:', user.nickname);
  console.log('   summonSlots:', user.summonSlots);
  console.log('   activeSummonId:', user.activeSummonId);
  
  const summons = await Summon.find({ ownerJid: userId });
  console.log('✅ Summons found:', summons.length);
  summons.forEach(s => console.log('   -', s.summonId, s.species, s.nickname, 'Lv.' + s.level));
  
  // Build the payload (same as cmdPokedex)
  console.log('\n--- Building payload ---');
  const rosterSummons = summons.map(s => {
    const stats = summonSystem.computeEffectiveStats(s);
    const species = registry.getSpecies(s.species);
    return {
      species: s.species,
      nickname: s.nickname || species?.name || s.species,
      level: s.level || 1,
      rarity: s.rarity || 'COMMON',
      element: s.element || species?.element || 'neutral',
      archetype: s.archetype || species?.archetype || 'BRUTE',
      loyalty: s.loyalty || 100,
      hp: stats.hp || 0,
      atk: stats.atk || 0,
      def: stats.def || 0,
      mag: stats.mag || 0,
      spd: stats.spd || 0,
      isDeployed: user.activeSummonId === s.summonId,
    };
  });
  console.log('✅ Payload built:', rosterSummons.length, 'summons');
  
  // Call the Go service
  console.log('\n--- Calling Go service ---');
  console.log('   GO_IMAGE_SERVICE_URL:', process.env.GO_IMAGE_SERVICE_URL);
  
  const startTime = Date.now();
  try {
    const gifBuffer = await goService.generateSummonRosterGIF({
      userNickname: user.nickname || 'Adventurer',
      slotsUsed: summons.length,
      slotsMax: user.summonSlots || 3,
      summons: rosterSummons,
      activeIndex: -1,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (gifBuffer && gifBuffer.length > 0) {
      console.log(`✅ GIF generated: ${gifBuffer.length} bytes in ${elapsed}s`);
      
      // Verify it's a valid GIF
      const header = gifBuffer.slice(0, 6).toString('ascii');
      if (header.startsWith('GIF')) {
        console.log('✅ Valid GIF header:', header);
      } else {
        console.log('❌ Invalid header:', header);
      }
      
      // Save to file for inspection
      const fs = require('fs');
      fs.writeFileSync('/tmp/roster_e2e_test.gif', gifBuffer);
      console.log('✅ Saved to /tmp/roster_e2e_test.gif');
      
      console.log('\n=== TEST PASSED: GIF generation works end-to-end ===');
      console.log('The issue (if any) is in sock.sendMessage, not in GIF generation.');
    } else {
      console.log('❌ GIF buffer is null or empty');
    }
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ FAILED after ${elapsed}s:`, e.message);
  }
  
  process.exit(0);
})();
