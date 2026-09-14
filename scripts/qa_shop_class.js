/* QA: shop search rendering + custom class registration (no WhatsApp needed).
 * Run from whatsapp-bot dir: node scripts/qa_shop_class.js
 * Registers TEST_CLASS_QA, verifies it, then REMOVES it from the System docs.
 */
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const classSystem = require('../core/rpg/classSystem');
const skillTree = require('../core/rpg/skillTree');

// capture sendMessages instead of sending
const sent = [];
const mockSock = {
  sendMessage: async (jid, content) => { sent.push(content.text || JSON.stringify(content).slice(0, 80)); },
};

async function main() {
  // explicit DB connection (the bot's db.js connects at boot; standalone script must too)
  const mongoose = require('mongoose');
  const env = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
  const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
  if (!uri) throw new Error('MONGO_URI not found in .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('[qa] mongoose connected');

  // ── 1) SHOP SEARCH / VIEWS (pure rendering — reads static catalogs) ──
  const shopCommands = require('../core/commands/shopCommands');
  const chatId = 'qa-test-chat@s.whatsapp.net';

  console.log('═══ .shop all (first 12 lines) ═══');
  await shopCommands.displayShop(mockSock, chatId, 'all');
  console.log(sent.at(-1).split('\n').slice(0, 12).join('\n'));

  console.log('\n═══ .shop potion (search) ═══');
  await shopCommands.displayShop(mockSock, chatId, 'potion');
  console.log(sent.at(-1));

  console.log('\n═══ .shop health potion (multi-word) ═══');
  await shopCommands.displayShop(mockSock, chatId, 'health potion');
  console.log(sent.at(-1).split('\n').slice(0, 8).join('\n'));

  console.log('\n═══ .shop summon (first 10 lines) ═══');
  await shopCommands.displayShop(mockSock, chatId, 'summon');
  console.log(sent.at(-1).split('\n').slice(0, 10).join('\n'));

  console.log('\n═══ .shop zzzznothing (no results) ═══');
  await shopCommands.displayShop(mockSock, chatId, 'zzzznothing');
  console.log(sent.at(-1));

  // ── 2) CLASS CREATION pipeline (register → visible → cleanup) ──
  const System = require('../core/models/System');
  const TEST_ID = 'TEST_CLASS_QA';
  console.log('\n═══ registerCustomClass ═══');
  await classSystem.registerCustomClass({
    id: TEST_ID, name: 'Test Class QA', icon: '🧪', desc: 'QA round-trip test',
    tier: 'EVOLVED', role: 'DPS',
    stats: { hp: 900, atk: 33, def: 22, mag: 11, spd: 44, luck: 7, crit: 5 },
    evolves_into: [], evolvedFrom: 'FIGHTER',
    requirement: { level: 20, questsCompleted: 5 },
    passive: { name: 'QA Passive', effect: 'all_stats', value: 5 },
  });
  const visible = classSystem.getClassById(TEST_ID);
  console.log('getClassById(TEST_CLASS_QA):', visible ? `OK — ${visible.name} (${visible.tier}/${visible.role})` : 'MISSING!');
  const inAll = classSystem.getAllClasses()[TEST_ID];
  console.log('getAllClasses contains it:', inAll ? 'OK' : 'MISSING!');
  const parent = classSystem.getClassById('FIGHTER');
  console.log('FIGHTER.evolves_into wired:', parent.evolves_into.includes(TEST_ID) ? 'OK' : 'MISSING!');
  const doc = await System.findOne({ key: 'custom_classes_v1' }).lean();
  console.log('System persistence doc:', doc && doc.value && doc.value[TEST_ID] ? 'OK (saved to DB)' : 'MISSING!');

  // modclass-style resolution through the public API
  const modclassList = Object.keys(classSystem.getAllClasses());
  console.log('modclass would list', modclassList.length, 'classes incl. custom:', modclassList.includes(TEST_ID));

  // ── 3) CLEANUP (leave prod DB exactly as it was) ──
  await System.updateOne({ key: 'custom_classes_v1' }, { $unset: { [`value.${TEST_ID}`]: '' } });
  await System.updateOne({ key: 'custom_skilltrees_v1' }, { $unset: { [`value.${TEST_ID}`]: '' } });
  const afterDoc = await System.findOne({ key: 'custom_classes_v1' }).lean();
  console.log('\ncleanup: TEST_CLASS_QA removed from System:', afterDoc && afterDoc.value && !afterDoc.value[TEST_ID] ? 'OK' : 'CHECK MANUALLY');
  console.log('\nQA COMPLETE');
  process.exit(0);
}

main().catch(e => { console.error('QA FAIL:', e); process.exit(1); });
