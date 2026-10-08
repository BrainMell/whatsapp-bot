#!/usr/bin/env node
'use strict';
/* qa_captions_universal.js — QA for the universal CARD DETAIL caption unification
 * Part A: render-extract + eval buildCardDetailCaption/buildSpawnCaption from
 *         cardSystem.js and buildPreviewCaption from mentoringCommands.js,
 *         assert Mellow's universal style line-by-line.
 * Part B: live handler E2E (.j mentoring dashboard / find / ids reg / bogus)
 *         with a mock sock against the real DB. Read-only.
 */
const fs = require('fs');
const path = require('path');

const REPO = '/home/ubuntu/whatsapp-bot';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// ── extract top-level function source by brace depth ────────────────────────
function grabFn(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`fn not found: ${name}`);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') { d++; started = true; }
    else if (ch === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`unbalanced braces for ${name}`);
}
function grabConst(src, name) {
  const m = src.match(new RegExp(`const ${name} = \\{[\\s\\S]*?\\};`));
  if (!m) throw new Error(`const not found: ${name}`);
  return m[0];
}

// ════════ Part A: cardSystem captions ════════
console.log('\n═══ A1. cardSystem.buildCardDetailCaption ═══');
{
  const src = fs.readFileSync(path.join(REPO, 'core/rpg/cardSystem.js'), 'utf8');
  const code = [
    grabConst(src, 'TIER_STARS'), grabConst(src, 'TIER_LABEL'),
    'const BASE_MAX = {};',
    'const economy = { getDisplayName: () => "Ace#001" };',
    'const isEventCard = (c) => String(c.id || "").startsWith("E-");',
    'const P = () => ".j";',
    grabFn(src, 'buildCardDetailCaption'), grabFn(src, 'buildSpawnCaption'),
  ].join('\n');
  const sandbox = {};
  new Function('sandbox', `${code}
    sandbox.detailOwned = buildCardDetailCaption(
      { id: "1-00042", cardName: "Rias Gremory", animeName: "High School DxD", tier: "6", creator: "christineyy", description: "Rias Gremory from High School DxD" },
      { userId: "u1", copyNumber: 3, inMainDeck: false, inCustomDeck: false }, { maxCopies: 200 }, "Collection", 12, "Ace");
    sandbox.detailEventDb = buildCardDetailCaption(
      { id: "E-03100", cardName: "Halloween Beira", animeName: "Mato Seihei no Slave", tier: "6", creator: "christineyy", eventName: "Halloween", description: "Halloween Beira from Mato Seihei no Slave" },
      null, { maxCopies: 100 }, "Event Database");
    sandbox.spawnReg = buildSpawnCaption(
      { id: "1-11769", cardName: "Kaede Azusagawa", animeName: "Aobuta", tier: "1", creator: "kaiser123_", description: "Kaede Azusagawa from Aobuta" }, 5, 200, 15);
    sandbox.spawnEvent = buildSpawnCaption(
      { id: "E-03101", cardName: "Summer Nero", animeName: "Mato Seihei no Slave", tier: "5", creator: "someone", eventName: "Summer", description: "Summer Nero from Mato Seihei no Slave" }, 7, 150, 20);
  `)(sandbox);
  const { detailOwned, detailEventDb, spawnReg, spawnEvent } = sandbox;

  ok(detailOwned.includes('🎴  *CARD DETAIL*'), 'header is universal CARD DETAIL');
  ok(!detailOwned.includes('╔'), 'no boxed header anymore');
  ok(detailOwned.includes('🏷️ ⟢ *Name:* _Rias Gremory_'), 'Name line style');
  ok(detailOwned.includes('📺 ⟢ *Series:* _High School DxD_'), 'Series line style (real anime)');
  ok(detailOwned.includes('🏆 ❖ *Tier:* _TIER VI_'), 'Tier line single-space TIER VI');
  ok(detailOwned.includes('🎨 ⟢ *Artist:* _christineyy_'), 'Artist line style');
  ok(detailOwned.includes('📝 ⟢ *Description:* _Rias Gremory from High School DxD_'), 'Description line style');
  ok(detailOwned.includes('📋 ⟢ *Copy:* _#3 / 200_'), 'Copy line style');
  ok(detailOwned.includes('📍 ⟢ *Location:* 📦 *Ace\u2019s Coll*') || detailOwned.includes("📍 ⟢ *Location:* 📦 *Ace's Coll*"), 'Location line (owned)');
  ok(!detailOwned.includes('CARD APPEARED'), 'old header gone');

  ok(detailEventDb.includes('📺 ⟢ *Series:* _Mato Seihei no Slave_'), 'event card series = real anime');
  ok(detailEventDb.includes('🎪 ⟢ *Event:* _Halloween_'), 'event card Event line');
  ok(detailEventDb.includes('📍 ⟢ *Location:* 🗄️ *Event Database*'), 'db lookup location');

  ok(spawnReg.includes('🎴  *CARD DETAIL*'), 'spawn header unified');
  ok(!spawnReg.includes('Location'), 'SPAWN HAS NO LOCATION (owner rule)');
  ok(spawnReg.includes('🆔 ⟢ _1-11769_'), 'spawn id footer');
  ok(spawnReg.includes('⌨️ ⟢ _Type .j claim 1-11769_'), 'spawn claim footer');
  ok(!spawnReg.includes('🎪'), 'regular spawn has no Event line');
  ok(!spawnEvent.includes('Location'), 'event spawn also has no location');
  ok(spawnEvent.includes('🎪 ⟢ *Event:* _Summer_'), 'event spawn shows Event');
}

// ════════ A2: mentoring preview caption ════════
console.log('\n═══ A2. mentoringCommands.buildPreviewCaption ═══');
{
  const src = fs.readFileSync(path.join(REPO, 'core/commands/mentoringCommands.js'), 'utf8');
  const code = [
    grabConst(src, 'TIER_STARS'), grabConst(src, 'TIER_LABEL'),
    grabFn(src, 'buildPreviewCaption'),
  ].join('\n');
  const sandbox = {};
  new Function('sandbox', `${code}
    sandbox.cap = buildPreviewCaption(
      { id: "6-00324", cardName: "Itachi Uchiha", animeName: "Naruto", tier: "6", creator: "Chama", description: "Itachi Uchiha from Naruto", detailUrl: "https://shoob.gg/cards/info/x" });
    sandbox.capE = buildPreviewCaption(
      { id: "E-03004", cardName: "Beira", animeName: "Mato Seihei no Slave", tier: "6", creator: "makerx", eventName: "Halloween", description: "Beira from Mato Seihei no Slave", detailUrl: "https://shoob.gg/card-events/halloween/x" });
  `)(sandbox);
  const { cap, capE } = sandbox;
  ok(cap.includes('🎴  *CARD DETAIL*'), 'preview header universal');
  ok(!cap.includes('╔════'), 'preview boxed header gone');
  ok(cap.includes('🏷️ ⟢ *Name:* _Itachi Uchiha_ `6-00324`'), 'preview name + id');
  ok(cap.includes('🏆 ❖ *Tier:* _TIER VI_'), 'preview tier single-space');
  ok(cap.includes('📍 ⟢ *Location:* 🗄️ _Event Database_'), 'preview location style');
  ok(capE.includes('🎪 ⟢ *Event:* _Halloween_'), 'preview event line');
  ok(capE.includes('📺 ⟢ *Series:* _Mato Seihei no Slave_'), 'preview series = real anime');
}

// ════════ Part B: live handler E2E (read-only) ════════
(async () => {
  console.log('\n═══ B. live handler E2E (read-only) ═══');
  process.env.qa_marker = '1';
  require('dotenv').config({ path: path.join(REPO, '.env') });
  const mongoose = require(path.join(REPO, 'node_modules/mongoose'));
  if (process.env.MONGO_URI) {
    try { await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 }); console.log('  mongo connected'); }
    catch (e) { console.log('  mongo connect FAILED — Part B limited:', e.message); }
  }
  const sent = [];
  const sock = { sendMessage: async (chat, m) => { sent.push(m); return { key: 'k' }; } };
  const handleMentoring = require(path.join(REPO, 'core/commands/mentoringCommands.js')).handleMentoring;
  ok(typeof handleMentoring === 'function', 'module loads, handler exported');

  sent.length = 0;
  await handleMentoring(sock, 'qa', 'status', { isOwner: false });
  const dash = sent[0] && sent[0].text || '';
  ok(dash.includes('MINING DASHBOARD'), 'dashboard renders');
  if (dash.includes('regular catalog:')) ok(true, 'dashboard shows regular phase stats');
  else console.log('  · (regular stats not published yet — shown after miner cycle completes)');

  sent.length = 0;
  await handleMentoring(sock, 'qa', 'find itachi', { isOwner: false });
  ok(sent[0] && (sent[0].text.includes('hit') || sent[0].text.includes('No match')), 'find renders (merged pools)');

  sent.length = 0;
  await handleMentoring(sock, 'qa', 'ids reg 5', { isOwner: false });
  ok(sent[0] && (sent[0].text.includes('newest card ids') || sent[0].text.includes('No ids match')), 'ids reg renders');

  sent.length = 0;
  await handleMentoring(sock, 'qa', 'bogus', { isOwner: false });
  ok(sent[0] && sent[0].text.includes('ids [reg]'), 'usage text updated');

  try { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); } catch {}
  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA FATAL:', e); process.exit(1); });
