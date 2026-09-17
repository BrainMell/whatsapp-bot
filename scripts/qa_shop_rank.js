/* QA: shop rank filter (no WhatsApp needed).
 * Run from whatsapp-bot dir: node scripts/qa_shop_rank.js
 * Verifies `.shop equipment legendary`, `.shop legendary`, and that name
 * search still wins for non-category queries like "rare sword".
 */
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const sent = [];
const mockSock = {
  sendMessage: async (jid, content) => { sent.push(content.text || JSON.stringify(content).slice(0, 80)); },
};

async function main() {
  const mongoose = require('mongoose');
  const env = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
  const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
  if (!uri) throw new Error('MONGO_URI not found in .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('[qa] mongoose connected');

  const shopCommands = require('../core/commands/shopCommands.ranktest');
  const chatId = 'qa-rank-chat@s.whatsapp.net';

  const run = async (label, arg) => {
    sent.length = 0;
    await shopCommands.displayShop(mockSock, chatId, arg);
    const text = sent[0] || '';
    const lines = text.split('\n').filter(Boolean);
    console.log(`\n===== .shop ${arg} -> ${label} =====`);
    console.log(lines.slice(0, 8).join('\n'));
    console.log(`   [total lines: ${lines.length}]`);
    return text;
  };

  // 1. category + rank
  const t1 = await run('equipment+legendary', 'equipment legendary');
  const ok1 = /SHOP.*• Equipment/i.test(t1) && /🏷️ LEGENDARY/.test(t1);
  const bad1 = /Rarity.*(COMMON|UNCOMMON|RARE|EPIC)\b(?!.*LEGENDARY)/.test(t1);
  console.log(`\n[check] header shows Equipment + LEGENDARY: ${ok1}; stray lower ranks: ${bad1}`);

  // 2. rank alone -> whole shop
  const t2 = await run('legendary only', 'legendary');
  const ok2 = /🏷️ LEGENDARY/.test(t2);
  const allRar = [...t2.matchAll(/(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC)\b/g)].map((m) => m[1]);
  const onlyLeg = allRar.filter((r) => !['LEGENDARY', 'MYTHIC'].includes(r)).length === 0 || allRar.length === 0;
  console.log(`[check] rank-alone view filters to legendary: ${ok2 && (onlyLeg || allRar.length === 0)}; rarities seen: ${[...new Set(allRar)].join(',') || 'none'}`);

  // 3. name search still works (multi-word, no category)
  const t3 = await run('name search', 'health potion');
  const ok3 = /SHOP SEARCH/i.test(t3) && !/Nothing matches/.test(t3);
  console.log(`[check] name search untouched: ${ok3}`);

  // 4. "rare sword" -> name search, NOT rank filter (no known category)
  const t4 = await run('name search with rarity word', 'rare sword');
  const ok4 = /SHOP SEARCH/i.test(t4);
  console.log(`[check] 'rare sword' stays a name search: ${ok4}`);

  // 5. category view unchanged
  const t5 = await run('plain category', 'equipment');
  const ok5 = /SHOP.*• Equipment/i.test(t5) && !/🏷️/.test(t5.split('\n')[0]);
  console.log(`[check] plain equipment view has no rank tag: ${ok5}`);

  // 6. prefix + short-rank handling
  const t6 = await run('prefix rank', 'equipment leg');
  const ok6 = /🏷️ LEGENDARY/.test(t6);
  console.log(`[check] 'leg' prefix resolves to LEGENDARY: ${ok6}`);

  // 7. rank with zero hits shows friendly empty message
  const t7 = await run('empty rank view', 'class mythic');
  const ok7 = /No mythic items/.test(t7) || /No items/.test(t7);
  console.log(`[check] empty rank view message: ${ok7}`);

  // 8. summon shop with rank
  const t8 = await run('summon + rank', 'summon epic');
  const ok8 = /SUMMON SHOP/.test(t8);
  console.log(`[check] summon shop reachable with rank: ${ok8}`);

  const allOk = ok1 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8;
  console.log(`\n[qa] RESULT: ${allOk ? 'ALL PASS' : 'FAILURES PRESENT'}`);
  await mongoose.disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
