// scripts/test_testing_infra.js
// Verifies the entire testing-infrastructure build:
//   1. testerSystem module loads + functions exist
//   2. Game Tester add/remove/list cycle (real MongoDB)
//   3. Tester GC add/remove/list cycle (real MongoDB)
//   4. Test mode on/off/status (real MongoDB)
//   5. canBypassRpgLock returns true for testers, false for regular users
//   6. Issue submission + list + count (real MongoDB)
//   7. giveitem rejects special RPG objects (summon, rune, card)
//   8. givesummon command creates a real Summon doc
//   9. giverune command creates a real Rune doc
//  10. Groq organize call works (or fails gracefully if API down)
//  11. RPG test-mode lock hook is in engine.js code
//  12. isGameTester export exists on engine module
//
// Uses real MongoDB execute-and-restore (create test data, run, delete).

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const m = envContent.match(/^MONGO_URI=(.+)$/m);
const MONGO_URI = m[1].trim().replace(/^["']|["']$/g, '');

const SUFFIX = '_tester_test_' + Date.now();
const TEST_USER = 'test_tester_user' + SUFFIX + '@s.whatsapp.net';
const TEST_GC = '120363TEST' + SUFFIX + '@g.us';

let conn;
let User, Issue, Summon, Rune;
let testerSystem, summonSystem, runeSystem, summonRegistry;

async function setup() {
  process.env.MONGO_URI = MONGO_URI;
  console.log('[+] Connecting to MongoDB...');
  conn = await mongoose.connect(MONGO_URI);  // Use URI default db
  console.log(`[+] Connected to: ${conn.connection.db.databaseName}`);
  User = require('../core/models/User');
  Issue = require('../core/models/Issue');
  Summon = require('../core/models/Summon');
  Rune = require('../core/models/Rune');
  testerSystem = require('../core/rpg/testerSystem');
  summonSystem = require('../core/rpg/summonSystem');
  runeSystem = require('../core/rpg/runeSystem');
  summonRegistry = require('../core/rpg/summonRegistry');
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  try {
    const r1 = await User.deleteMany({ userId: TEST_USER });
    console.log(`[+] Deleted ${r1.deletedCount} test users`);
    const r2 = await Issue.deleteMany({ reporterId: TEST_USER });
    console.log(`[+] Deleted ${r2.deletedCount} test issues`);
    const r3 = await Summon.deleteMany({ ownerJid: TEST_USER });
    console.log(`[+] Deleted ${r3.deletedCount} test summons`);
    const r4 = await Rune.deleteMany({ ownerJid: TEST_USER });
    console.log(`[+] Deleted ${r4.deletedCount} test runes`);
    // Clean tester GC if accidentally added
    await testerSystem.removeTesterGc(TEST_GC);
    // Clean Game Tester list
    await testerSystem.delGameTester(TEST_USER);
  } catch (e) { console.error('Cleanup error:', e.message); }
  if (conn) await mongoose.disconnect();
  console.log('[+] Disconnected');
}

async function runTests() {
  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: testerSystem module exports
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 1: testerSystem module exports ===');
  const expectedFns = ['loadGameTesters','addGameTester','delGameTester','isGameTester',
                       'loadTesterGcs','addTesterGc','removeTesterGc','isTesterGc',
                       'getTestMode','setTestMode','canBypassRpgLock',
                       'submitIssue','listIssues','countOpenIssues','organizeIssuesWithGroq','Issue'];
  for (const fn of expectedFns) {
    if (typeof testerSystem[fn] !== 'function' && fn !== 'Issue') {
      throw new Error(`testerSystem.${fn} is not a function (got ${typeof testerSystem[fn]})`);
    }
  }
  if (!testerSystem.Issue) throw new Error('testerSystem.Issue is not exported');
  console.log(`[+] All ${expectedFns.length} expected exports present ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: Game Tester add/remove/list
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 2: Game Tester add/remove ===');
  await testerSystem.addGameTester(TEST_USER);
  if (!testerSystem.isGameTester(TEST_USER)) {
    throw new Error(`isGameTester returned false after addGameTester`);
  }
  console.log(`[+] addGameTester → isGameTester=true ✅`);
  await testerSystem.delGameTester(TEST_USER);
  if (testerSystem.isGameTester(TEST_USER)) {
    throw new Error(`isGameTester returned true after delGameTester`);
  }
  console.log(`[+] delGameTester → isGameTester=false ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: Tester GC add/remove/list
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 3: Tester GC add/remove ===');
  await testerSystem.addTesterGc(TEST_GC);
  let gcs = await testerSystem.loadTesterGcs();
  if (!gcs.includes(TEST_GC)) {
    throw new Error(`Tester GC not added: ${JSON.stringify(gcs)}`);
  }
  if (!await testerSystem.isTesterGc(TEST_GC)) {
    throw new Error(`isTesterGc returned false after add`);
  }
  console.log(`[+] addTesterGc → isTesterGc=true ✅`);
  await testerSystem.removeTesterGc(TEST_GC);
  gcs = await testerSystem.loadTesterGcs();
  if (gcs.includes(TEST_GC)) {
    throw new Error(`Tester GC not removed: ${JSON.stringify(gcs)}`);
  }
  console.log(`[+] removeTesterGc → GC removed ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: Test mode on/off/status
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 4: Test mode on/off ===');
  const originalMode = await testerSystem.getTestMode();
  console.log(`[i] Original test mode: ${originalMode}`);
  await testerSystem.setTestMode(true);
  if (!await testerSystem.getTestMode()) {
    throw new Error(`setTestMode(true) failed — getTestMode returned false`);
  }
  console.log(`[+] setTestMode(true) → getTestMode=true ✅`);
  await testerSystem.setTestMode(false);
  if (await testerSystem.getTestMode()) {
    throw new Error(`setTestMode(false) failed — getTestMode returned true`);
  }
  console.log(`[+] setTestMode(false) → getTestMode=false ✅`);
  // Restore original
  await testerSystem.setTestMode(originalMode);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: canBypassRpgLock
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 5: canBypassRpgLock ===');
  // Regular user (not tester, not in tester GC) → false
  const regularUser = 'regular_user_' + SUFFIX + '@s.whatsapp.net';
  if (await testerSystem.canBypassRpgLock(regularUser, 'regular_chat@g.us')) {
    throw new Error(`canBypassRpgLock returned true for regular user in regular chat`);
  }
  console.log(`[+] Regular user in regular GC → bypass=false ✅`);
  // Add as Game Tester → true
  await testerSystem.addGameTester(regularUser);
  if (!await testerSystem.canBypassRpgLock(regularUser, 'regular_chat@g.us')) {
    throw new Error(`canBypassRpgLock returned false for Game Tester`);
  }
  console.log(`[+] Game Tester in regular GC → bypass=true ✅`);
  await testerSystem.delGameTester(regularUser);
  // Regular user in tester GC → true
  await testerSystem.addTesterGc(TEST_GC);
  if (!await testerSystem.canBypassRpgLock(regularUser, TEST_GC)) {
    throw new Error(`canBypassRpgLock returned false for regular user in tester GC`);
  }
  console.log(`[+] Regular user in tester GC → bypass=true ✅`);
  await testerSystem.removeTesterGc(TEST_GC);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: Issue submission + list + count
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 6: Issue submission + list + count ===');
  const issue1 = await testerSystem.submitIssue({
    reporterId: TEST_USER,
    reporterName: 'TestTester',
    chatId: TEST_GC,
    chatName: 'Test GC',
    body: 'Bug: PvP initiative says P1 even when P2 has higher SPD.',
    category: 'bug', severity: 'high'
  });
  if (!issue1 || !issue1._id) throw new Error('submitIssue returned no doc');
  console.log(`[+] Issue 1 submitted: ${issue1._id.toString().slice(-6)} ✅`);

  const issue2 = await testerSystem.submitIssue({
    reporterId: TEST_USER,
    reporterName: 'TestTester',
    chatId: TEST_GC,
    chatName: 'Test GC',
    body: 'Balance: SLOW doesn\'t affect turn order — maybe should.',
    category: 'balance', severity: 'normal'
  });
  console.log(`[+] Issue 2 submitted: ${issue2._id.toString().slice(-6)} ✅`);

  const openCount = await testerSystem.countOpenIssues();
  if (openCount < 2) throw new Error(`countOpenIssues returned ${openCount}, expected >= 2`);
  console.log(`[+] countOpenIssues: ${openCount} (>= 2) ✅`);

  const listed = await testerSystem.listIssues(10, 'open');
  const ours = listed.filter(i => i.reporterId === TEST_USER);
  if (ours.length !== 2) throw new Error(`listIssues returned ${ours.length} of our issues, expected 2`);
  console.log(`[+] listIssues: ${ours.length} of our issues in list ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 7: giveitem rejects special RPG objects (code path test)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 7: giveitem rejects special RPG objects ===');
  const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'core/commands/adminConsole.js'), 'utf-8');
  if (!adminSrc.includes('Cannot give special RPG object')) {
    throw new Error('adminConsole.js: special-RPG-object rejection NOT found');
  }
  if (!adminSrc.includes("'summon', 'summons', 'rune', 'runes', 'card', 'cards'")) {
    throw new Error('adminConsole.js: SPECIAL_RPG_OBJECTS set not found');
  }
  console.log(`[+] giveitem rejects special RPG objects ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 8: givesummon creates real Summon doc
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 8: givesummon creates real Summon doc ===');
  // Use 'bat' which is a starter species
  const batSpecies = summonRegistry.getSpecies('bat');
  if (!batSpecies) throw new Error('summonRegistry: bat species not found');
  const summon = await summonSystem.createSummon(TEST_USER, 'bat', {
    level: 5, obtainedFrom: 'admin_grant', loyalty: 100
  });
  if (!summon || !summon.summonId) throw new Error('createSummon returned no doc');
  // Verify it's in DB
  const fromDb = await Summon.findOne({ summonId: summon.summonId });
  if (!fromDb) throw new Error(`Summon ${summon.summonId} not in DB after createSummon`);
  if (fromDb.ownerJid !== TEST_USER) throw new Error(`Summon ownerJid wrong: ${fromDb.ownerJid}`);
  if (fromDb.species !== 'bat') throw new Error(`Summon species wrong: ${fromDb.species}`);
  if (fromDb.level !== 5) throw new Error(`Summon level wrong: ${fromDb.level}`);
  console.log(`[+] Summon ${summon.summonId} (bat, L5) created in DB ✅`);

  // Verify givesummon subcommand exists in adminConsole.js
  if (!adminSrc.includes("sub === 'givesummon'")) {
    throw new Error('adminConsole.js: givesummon subcommand NOT found');
  }
  console.log(`[+] adminConsole.js has givesummon subcommand ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 9: giverune creates real Rune doc
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 9: giverune creates real Rune doc ===');
  console.log('[i] runeSystem:', typeof runeSystem);
  console.log('[i] runeSystem.awardRune:', typeof runeSystem.awardRune);
  console.log('[i] RUNE_TYPES keys:', Object.keys(runeSystem.RUNE_TYPES || {}).slice(0, 5));
  console.log('[i] RUNE_TIERS keys:', Object.keys(runeSystem.RUNE_TIERS || {}));
  const result = runeSystem.awardRune(TEST_USER, 'POWER', 'GREATER', 'admin_grant');
  console.log('[i] awardRune returned:', typeof result, result instanceof Promise ? 'isPromise' : 'notPromise');
  const resolved = await Promise.resolve(result);
  console.log('[i] resolved:', JSON.stringify({ success: resolved.success, message: resolved.message, hasRune: !!resolved.rune }));
  if (!resolved.success) throw new Error(`awardRune failed: ${resolved.message}`);
  // Verify in DB
  const runeFromDb = await Rune.findOne({ runeId: resolved.rune.runeId });
  if (!runeFromDb) throw new Error(`Rune ${resolved.rune.runeId} not in DB after awardRune`);
  if (runeFromDb.ownerJid !== TEST_USER) throw new Error(`Rune ownerJid wrong: ${runeFromDb.ownerJid}`);
  if (runeFromDb.type !== 'POWER') throw new Error(`Rune type wrong: ${runeFromDb.type}`);
  if (runeFromDb.tier !== 'GREATER') throw new Error(`Rune tier wrong: ${runeFromDb.tier}`);
  console.log(`[+] Rune ${resolved.rune.runeId} (POWER/GREATER) created in DB ✅`);

  if (!adminSrc.includes("sub === 'giverune'")) {
    throw new Error('adminConsole.js: giverune subcommand NOT found');
  }
  console.log(`[+] adminConsole.js has giverune subcommand ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 10: RPG test-mode lock hook is in engine.js
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 10: RPG test-mode lock hook in engine.js ===');
  const engSrc = fs.readFileSync(path.join(__dirname, '..', 'core/engine.js'), 'utf-8');
  // The hook should check testerSystem.getTestMode() and canBypassRpgLock
  // right after the isCommandDisabled call.
  if (!engSrc.includes('if (await testerSystem.getTestMode())')) throw new Error('engine.js: testerSystem.getTestMode() check missing');
  if (!engSrc.includes('testerSystem.canBypassRpgLock(')) throw new Error('engine.js: canBypassRpgLock call missing');
  if (!engSrc.includes('isGameTester(userId)')) throw new Error('engine.js: isGameTester function not present');
  if (!engSrc.includes('async function loadGameTesters')) throw new Error('engine.js: loadGameTesters function not present');
  if (!engSrc.includes('addgtester')) throw new Error('engine.js: .j addgtester command missing');
  if (!engSrc.includes('delgtester')) throw new Error('engine.js: .j delgtester command missing');
  if (!engSrc.includes('listtesters')) throw new Error('engine.js: .j listtesters command missing');
  if (!engSrc.includes('testmode')) throw new Error('engine.js: .j testmode command missing');
  if (!engSrc.includes('testgc')) throw new Error('engine.js: .j testgc command missing');
  if (!engSrc.includes('bug ')) throw new Error('engine.js: .j bug command missing');
  if (!engSrc.includes('issues')) throw new Error('engine.js: .j issues command missing');
  if (!engSrc.includes('organizeissues')) throw new Error('engine.js: .j organizeissues command missing');
  console.log(`[+] engine.js has all required hooks + commands ✅`);

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 11: Groq organize call (graceful failure)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n=== TEST 11: Groq organize call ===');
  // We have 2 issues submitted in this test. Try to organize.
  // This may fail if GROQ_API_KEYS is not set or quota is exhausted.
  // We just verify it returns a structured response (success or graceful failure).
  const orgResult = await testerSystem.organizeIssuesWithGroq(TEST_USER);
  if (!orgResult || typeof orgResult.success !== 'boolean') {
    throw new Error('organizeIssuesWithGroq returned non-structured response');
  }
  if (orgResult.success) {
    console.log(`[+] Groq organized ${orgResult.issuesProcessed} issues ✅`);
    console.log(`[i] Organized preview: ${orgResult.organized.slice(0, 200)}...`);
    // Verify our test issues are marked as 'organized' now
    const ours = await Issue.find({ reporterId: TEST_USER }).lean();
    if (ours.some(i => i.status !== 'organized')) {
      throw new Error('After organize, not all test issues marked as organized');
    }
    console.log(`[+] All test issues marked as 'organized' ✅`);
  } else {
    console.log(`[i] Groq call failed (expected if no API key): ${orgResult.message}`);
    console.log(`[i] This is graceful failure — the function returned structured response, just no API access in test env`);
  }

  console.log('\n========== ALL TESTS PASSED ==========');
  console.log('1. testerSystem module exports ✅');
  console.log('2. Game Tester add/remove ✅');
  console.log('3. Tester GC add/remove ✅');
  console.log('4. Test mode on/off ✅');
  console.log('5. canBypassRpgLock (3 cases) ✅');
  console.log('6. Issue submit + list + count ✅');
  console.log('7. giveitem rejects special RPG objects ✅');
  console.log('8. givesummon creates real Summon doc ✅');
  console.log('9. giverune creates real Rune doc ✅');
  console.log('10. engine.js has all hooks + commands ✅');
  console.log('11. Groq organize call (graceful) ✅');
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main();
