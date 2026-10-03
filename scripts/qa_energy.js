/* QA: persistent energy system (no WhatsApp needed).
 * Run from whatsapp-bot dir: node scripts/qa_energy.js
 * Creates a throwaway user, verifies lazy-init/deduct/regen/clamp, then runs
 * the real mineOre flow end-to-end and checks the displayed energy matches
 * the canonical pool. Cleans up after itself.
 */
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';
const jid = `qa_energy_${Date.now()}@s.whatsapp.net`;

const sent = [];
const mockSock = {
  sendMessage: async (chat, content) => { sent.push(content.text || ''); },
};

async function main() {
  const mongoose = require('mongoose');
  const env = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
  const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
  if (!uri) throw new Error('MONGO_URI not found in .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('[qa] mongoose connected');

  const economy = require('../core/rpg/economy');
  const progression = require('../core/rpg/progression');

  // 0. seed a minimal user (register path ensures schema-shaped doc)
  economy.economyData.set(jid, {
    userId: jid, wallet: 1000, bank: 0, registered: true, nickname: 'QAEnergy',
    class: 'FIGHTER', adventurerRank: 'B', stats: { hp: 500, maxHp: 500, level: 24 },
    professions: { mining: { level: 5, xp: 0 } }, inventory: {}, equipment: {},
    statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
  });

  let pass = 0, fail = 0;
  const check = (name, cond) => { console.log(`[check] ${name}: ${cond ? 'PASS' : 'FAIL'}`); cond ? pass++ : fail++; };

  const maxEn = progression.getBaseStats(jid, 'FIGHTER').maxEnergy || 100;
  console.log('[qa] derived maxEnergy for test user:', maxEn);

  // 1. lazy init -> FULL
  const e1 = economy.getPersistentEnergy(jid, maxEn);
  check('lazy init returns FULL max', e1 === maxEn);

  // 2. deduct + clamp
  economy.setPersistentEnergy(jid, e1 - 40, maxEn);
  const e2 = economy.getPersistentEnergy(jid, maxEn);
  check('deduct persists', e2 === maxEn - 40);

  // 3. set below zero clamps to 0
  economy.setPersistentEnergy(jid, -99, maxEn);
  const e3 = economy.getPersistentEnergy(jid, maxEn);
  check('clamp floor 0', e3 === 0);

  // 4. regen: backdate energyTs 1h -> expect +max/6
  const User = require('../core/models/User').User || require('../core/models/User');
  const doc = await (User.findOne ? User.findOne({ userId: jid }) : null);
  if (doc) {
    doc.stats.currentEnergy = 0;
    doc.stats.energyTs = Date.now() - 3600 * 1000; // 1h ago
    await doc.save();
    // force cache reload so the helper reads the backdated doc
    await economy.reloadUserFromDB(jid);
    const e4 = economy.getPersistentEnergy(jid, maxEn);
    const expected = Math.floor((3600 * 1000 / (6 * 3600 * 1000)) * maxEn);
    check(`1h regen adds max/6 (got ${e4}, expect ${expected})`, e4 === expected);
  } else {
    console.log('[check] regen via DB doc: SKIP (model shape differs)');
  }

  // 5. real mineOre end-to-end: drain to just under the cheapest location cost
  economy.setPersistentEnergy(jid, 10, maxEn);
  const { mineOre } = require('../core/commands/rpgCommands');
  await mineOre(mockSock, 'qa-energy-chat@s.whatsapp.net', jid, undefined); // list view, harmless
  sent.length = 0;
  await mineOre(mockSock, 'qa-energy-chat@s.whatsapp.net', jid, 'shimmering_caves'); // cost 15 -> blocked at 10
  const blocked = sent[0] || '';
  check('blocked mine shows canonical pool + regen hint', /Not enough energy.*have 10\/\d+\./.test(blocked) && /recharges over time/.test(blocked));
  console.log('   [msg]', blocked.split('\n')[0]);

  // 6. mine with enough energy -> display matches pool
  economy.setPersistentEnergy(jid, maxEn, maxEn);
  sent.length = 0;
  await mineOre(mockSock, 'qa-energy-chat@s.whatsapp.net', jid, 'shimmering_caves');
  const okMsg = sent[0] || '';
  const m = okMsg.match(/Energy Left: (\d+)\/(\d+)/);
  const after = economy.getPersistentEnergy(jid, maxEn);
  check(`mine display matches pool (msg ${m && m[1]}/${m && m[2]}, pool ${after}/${maxEn})`,
    m && Number(m[1]) === after && Number(m[2]) === maxEn);
  console.log('   [msg]', (okMsg.match(/.*Energy Left.*/) || ['(none)'])[0].trim());

  // 7. schema persists currentEnergy
  const doc2 = await (User.findOne ? User.findOne({ userId: jid }) : null);
  check('currentEnergy persisted to Mongo', doc2 && doc2.stats && Number.isFinite(doc2.stats.currentEnergy));

  // cleanup
  if (User.findOne) await User.deleteOne({ userId: jid });
  economy.economyData.delete(jid);
  console.log(`\n[qa] RESULT: ${fail === 0 ? 'ALL PASS' : `${fail} FAILURES`} (${pass} passed)`);
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
