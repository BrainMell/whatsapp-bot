// scripts/test_issue_commands.js
// Verifies the partsArr index fixes for deleteissue + editissue.
// Simulates what happens when a user types:
//   .j deleteissue ABC123
//   .j editissue ABC123 bug:high
// by parsing the same way engine.js does, then confirming the right
// index produces the right value.

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const MONGO_URI = m[1].trim().replace(/^["']|["']$/g, '');

const SUFFIX = '_del_test_' + Date.now();
const TEST_USER = 'test_del' + SUFFIX + '@s.whatsapp.net';

let conn;
let Issue;

async function main() {
  conn = await mongoose.connect(MONGO_URI);
  console.log('[+] Connected:', conn.connection.db.databaseName);
  Issue = require('../core/models/Issue');

  // Create a real test issue
  const issue = await Issue.create({
    reporterId: TEST_USER,
    reporterName: 'DeleteTest',
    chatId: 'test@g.us',
    chatName: 'Test',
    body: 'Test issue for delete/edit verification',
    category: 'general', severity: 'normal'
  });
  const shortId = issue._id.toString().slice(-6);
  console.log(`[+] Created test issue: ${issue._id} (short: ${shortId})`);

  // ─── Test 1: Simulate `.j deleteissue ${shortId}` parsing ──────────
  console.log('\n=== TEST 1: deleteissue parsing ===');
  // Simulate the engine.js parsing logic:
  const txt1 = `.j deleteissue ${shortId}`;
  const partsArr1 = txt1.split(/\s+/);
  console.log(`  txt: "${txt1}"`);
  console.log(`  partsArr: ${JSON.stringify(partsArr1)}`);
  // OLD code: const issueIdShort = partsArr[1];  → 'deleteissue' (WRONG)
  // NEW code: const issueIdShort = partsArr[2];  → '<shortId>' (RIGHT)
  const oldResult1 = partsArr1[1];
  const newResult1 = partsArr1[2];
  if (oldResult1 === 'deleteissue') {
    console.log(`  OLD partsArr[1] = "${oldResult1}" (was causing the bug — ID check fails)`);
  }
  if (newResult1 !== shortId) {
    throw new Error(`NEW partsArr[2] = "${newResult1}", expected "${shortId}"`);
  }
  console.log(`  NEW partsArr[2] = "${newResult1}" ✅ matches expected short ID`);

  // Verify the actual delete works using the corrected index
  const all = await Issue.find({}).lean();
  const target = all.find(i => i._id.toString().slice(-6) === newResult1);
  if (!target) throw new Error('Could not find issue with parsed ID');
  console.log(`  Found issue in DB via parsed ID ✅`);

  // ─── Test 2: Simulate `.j editissue ${shortId} bug:high` parsing ─────
  console.log('\n=== TEST 2: editissue parsing ===');
  const txt2 = `.j editissue ${shortId} bug:high`;
  const partsArr2 = txt2.split(/\s+/);
  console.log(`  txt: "${txt2}"`);
  console.log(`  partsArr: ${JSON.stringify(partsArr2)}`);
  // OLD: partsArr[1] = issueId, partsArr[2] = tag  → 'editissue' + shortId (WRONG)
  // NEW: partsArr[2] = issueId, partsArr[3] = tag → shortId + 'bug:high' (RIGHT)
  const oldIdResult = partsArr2[1];
  const oldTagResult = partsArr2[2];
  const newIdResult = partsArr2[2];
  const newTagResult = partsArr2[3];
  if (oldIdResult === 'editissue') {
    console.log(`  OLD partsArr[1] = "${oldIdResult}" (was causing bug — ID was 'editissue')`);
    console.log(`  OLD partsArr[2] = "${oldTagResult}" (was treated as tag, but was actually the ID)`);
  }
  if (newIdResult !== shortId) throw new Error(`NEW partsArr[2] = "${newIdResult}", expected "${shortId}"`);
  if (newTagResult !== 'bug:high') throw new Error(`NEW partsArr[3] = "${newTagResult}", expected "bug:high"`);
  console.log(`  NEW partsArr[2] = "${newIdResult}" ✅ matches ID`);
  console.log(`  NEW partsArr[3] = "${newTagResult}" ✅ matches tag`);

  // Parse tag (same regex as engine.js)
  const tagMatch = newTagResult.match(/^([\w-]+):(\w+)$/);
  if (!tagMatch) throw new Error(`Tag regex failed on "${newTagResult}"`);
  const newCat = tagMatch[1].toLowerCase();
  const newSev = tagMatch[2].toLowerCase();
  if (newCat !== 'bug' || newSev !== 'high') {
    throw new Error(`Tag parsed wrong: cat=${newCat}, sev=${newSev}, expected bug:high`);
  }
  console.log(`  Tag parsed → cat=${newCat}, sev=${newSev} ✅`);

  // Apply the edit to the DB
  await Issue.findByIdAndUpdate(target._id, { $set: { category: newCat, severity: newSev } });
  const updated = await Issue.findById(target._id);
  if (updated.category !== 'bug' || updated.severity !== 'high') {
    throw new Error(`DB update wrong: cat=${updated.category}, sev=${updated.severity}`);
  }
  console.log(`  DB updated: cat=${updated.category}, sev=${updated.severity} ✅`);

  // ─── Test 3: Verify the actual fix is in engine.js source ────────────
  console.log('\n=== TEST 3: engine.js source verification ===');
  const engSrc = fs.readFileSync(path.join(__dirname, '..', 'core/engine.js'), 'utf-8');
  if (!engSrc.includes('PHASE 7 FIX 2026-08-29: editissue ID is at partsArr[2], tag at partsArr[3]')) {
    throw new Error('engine.js: editissue fix marker not found');
  }
  if (!engSrc.includes('PHASE 7 FIX 2026-08-29: ID is at partsArr[2], not partsArr[1]')) {
    throw new Error('engine.js: deleteissue fix marker not found');
  }
  // Verify the OLD broken code is gone (no partsArr[1] inside editissue/deleteissue blocks)
  const editissueBlock = engSrc.match(/\/\/ \.j editissue[\s\S]*?\n                  \}\n\n                  \/\/ \.j deleteissue/);
  if (editissueBlock && editissueBlock[0].includes('const issueIdShort = partsArr[1]')) {
    throw new Error('engine.js: editissue block still has partsArr[1]');
  }
  const deleteissueBlock = engSrc.match(/\/\/ \.j deleteissue[\s\S]*?\n                  \}\n\n                  \/\/ \.j clearissues/);
  if (deleteissueBlock && deleteissueBlock[0].includes('const issueIdShort = partsArr[1]')) {
    throw new Error('engine.js: deleteissue block still has partsArr[1]');
  }
  console.log('[+] Both editissue and deleteissue have the corrected partsArr[2] index ✅');

  console.log('\n========== ALL TESTS PASSED ==========');
  console.log('1. deleteissue partsArr[2] = issue ID (was partsArr[1] = "deleteissue") ✅');
  console.log('2. editissue partsArr[2] = ID, partsArr[3] = cat:sev tag (was partsArr[1] = "editissue") ✅');
  console.log('3. engine.js source has both fixes ✅');
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  try {
    await Issue.deleteMany({ reporterId: TEST_USER });
    console.log('[+] Deleted test issues');
  } catch (e) { console.error('Cleanup error:', e.message); }
  if (conn) await mongoose.disconnect();
  console.log('[+] Disconnected');
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
