#!/usr/bin/env node
// TOKEN RATE QA (47-l2) - run ON-BOX inside the bot dir:
// CARD_DIAG=1 node scripts/token_rate_qa.js
// Owner ask: "I haven't seen anyone get an event token even when they claimed alot of cards"
// Root causes under test:
// A) counter keys: load stores Mongo-safe keys ('...@g_us') but the spawn/
// cmd lookups used RAW jids ('...@g.us') -> every restart reset progress
// B) persist REPLACED the whole shared System value object -> jake/subaru
// spawns erased joker's group counters (and vice versa)
// Safety model:
// - ALL writes go to a SCRATCH database (qa_token_47l2) - production only
// gets one READ per section for before/after comparison
// - ZERO WhatsApp traffic
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' - ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function prodUri() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && (m[1] === 'MONGO_URI' || m[1] === 'MONGODB_URI')) return m[2].trim();
        }
    }
    return process.env.MONGO_URI || process.env.MONGODB_URI;
}
function scratchUri(uri) {
 // swap the database path segment for the scratch db
    const m = String(uri).match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(.*)$/);
    if (!m) throw new Error('cannot parse mongo uri');
    return `${m[1]}/qa_token_47l2${m[2] || ''}`;
}

const QA_GROUP_RAW = '120363050000000001@g.us';
const QA_USER_RAW  = '999000000000001@s.whatsapp.net';

(async () => {
    const mongoose = require('mongoose');
 // scratch world - FORCE every mongoose.connect (ours + db.js's internal
 // retry inside loadEconomy) onto the scratch db: modules re-connect with
 // the prod URI mid-run, which would otherwise flip the default connection
 // to prod and contaminate both directions.
    const PU = prodUri();
    if (!PU) { console.log('❌ no MONGO_URI'); process.exit(1); }
    const origConnect = mongoose.connect.bind(mongoose);
    mongoose.connect = (u, o) => origConnect(scratchUri(PU), o);
    await origConnect(scratchUri(PU), { serverSelectionTimeoutMS: 10000 });

 // production snapshot BEFORE (read-only, separate connection, not stubbed)
    const prodConn = await mongoose.createConnection(PU, { serverSelectionTimeoutMS: 10000 }).asPromise();
    const prodSys = prodConn.db.collection('systems');
    const snapBefore = JSON.stringify((await prodSys.findOne({ key: 'card_token_spawn_counters_v1' }))?.value || {});

    console.log(`[qa] scratch db: ${mongoose.connection.name}`);
    const Sys = mongoose.connection.db.collection('systems');

    const BOT = path.join(__dirname, '..');
    process.env.CARD_DIAG = '1';
    const cardSystem = require(path.join(BOT, 'core', 'rpg', 'cardSystem'));
    const economy = require(path.join(BOT, 'core', 'rpg', 'economy'));
    const QA = cardSystem.__tokenQA;
    if (!QA) { console.log('❌ __tokenQA missing - CARD_DIAG not loaded?'); process.exit(1); }

 // QA user must exist BEFORE loadEconomy so addTokens finds it in cache
    const User = mongoose.connection.db.collection('users');
    await User.deleteMany({ userId: QA_USER_RAW });
    await User.insertOne({ userId: QA_USER_RAW, wallet: 0, bank: 0, eventTokens: 0, nickname: 'QA Token 47l2', registered: true });
    await economy.loadEconomy().catch(e => console.log(`[qa] loadEconomy warn: ${e.message}`));

    const safeKey = QA.safeCounterKey;
    const spawnDocKey = 'card_token_spawn_counters_v1';
    const cmdDocKey = 'card_token_cmd_counters_v1';
    const getVal = async (key) => (await Sys.findOne({ key }))?.value || {};

 // -- §1 restart survival: loaded keys must answer the spawn-time lookup --
    console.log('\n── §1 counter key invariant (Bug A) ──');
    check('safeCounterKey strips dots', safeKey(QA_GROUP_RAW) === '120363050000000001@g_us');
    await Sys.updateOne({ key: spawnDocKey }, { $set: { value: { [safeKey(QA_GROUP_RAW)]: 7 } } }, { upsert: true });
    QA.clearCounters();
    await QA.loadTokenRateCounters();
    const loaded = Object.fromEntries(QA.counters().spawn);
    check('loaded map carries sanitized key', loaded[safeKey(QA_GROUP_RAW)] === 7, JSON.stringify(loaded));
    check('spawn-time lookup finds loaded progress', loaded[safeKey(QA_GROUP_RAW)] === 7 && safeKey(QA_GROUP_RAW) in loaded,
        'pre-fix: lookup used the RAW jid and missed the sanitized key -> silent reset');

 // -- §2 real cmd path: wrap at 15 grants a token (Bug A, end-to-end) --
    console.log('\n── §2 cmd-token wrap on real code path ──');
    await Sys.updateOne({ key: cmdDocKey }, { $set: { value: { [safeKey(QA_USER_RAW)]: 14 } } }, { upsert: true });
    QA.clearCounters();
    await QA.loadTokenRateCounters();
    QA.setEventActive(true);
    const notify = await QA.noteEligibleCommand(QA_USER_RAW);
    check('15th eligible command GRANTS (was silent pre-fix)', typeof notify === 'string' && /Event Token/i.test(notify), String(notify));
    check('balance +1 via economy cache', economy.getTokens(QA_USER_RAW) === 1, `got ${economy.getTokens(QA_USER_RAW)}`);
    check('counter wrapped to 0 in memory', (Object.fromEntries(QA.counters().cmd))[safeKey(QA_USER_RAW)] === 0);
    await sleep(400);
    check('wrapped 0 persisted to doc', (await getVal(cmdDocKey))[safeKey(QA_USER_RAW)] === 0);

 // -- §2b unregistered players: token sub-economy must not gate on RPG reg --
    console.log('\n── §2b unregistered claimer grant (Bug C) ──');
    const QA_USER_UNREG = '999000000000002@s.whatsapp.net';
    await User.deleteMany({ userId: QA_USER_UNREG });
    await User.insertOne({ userId: QA_USER_UNREG, wallet: 0, bank: 0, eventTokens: 0, nickname: 'QA Unreg 47l2', registered: false });
    await economy.loadEconomy().catch(e => console.log(`[qa] loadEconomy warn: ${e.message}`));
    await Sys.updateOne({ key: cmdDocKey }, { $set: { [`value.${safeKey(QA_USER_UNREG)}`]: 14 } }, { upsert: true });
    QA.clearCounters();
    await QA.loadTokenRateCounters();
    QA.setEventActive(true);
    const notify2 = await QA.noteEligibleCommand(QA_USER_UNREG);
    check('UNREGISTERED claimer also GRANTS (pre-fix: silent no-op + lying "+1 Total: 0")',
        typeof notify2 === 'string' && /Event Token/i.test(notify2) && /\(Total: 1\)/.test(notify2), String(notify2));
    check('unregistered balance +1 (getEventTokens)', economy.getEventTokens(QA_USER_UNREG) === 1);
    check('registration gate INTACT for wallet currency (addTokens still refuses)',
        economy.addTokens(QA_USER_UNREG, 5) === false && economy.getTokens(QA_USER_UNREG) === 0);
    QA.setEventActive(false);

 // -- §3 cross-bot merge: foreign bot keys must survive persist (Bug B) --
    console.log('\n── §3 merge persist (Bug B) ──');
    await Sys.updateOne({ key: spawnDocKey }, { $set: { value: { '999999999999999999@g_us': 9, [safeKey(QA_GROUP_RAW)]: 3 } } }, { upsert: true });
    QA.clearCounters();
    await QA.loadTokenRateCounters();
    await QA.persistTokenSpawnCounters();
    const merged = await getVal(spawnDocKey);
    check('FOREIGN bot key survives (pre-fix: erased)', merged['999999999999999999@g_us'] === 9, JSON.stringify(merged));
    check('own key intact after merge', merged[safeKey(QA_GROUP_RAW)] === 3);

 // -- §4 empty-map persist is a no-op (tokenreset needs the explicit wipe) --
    console.log('\n── §4 empty-map guard ──');
    QA.clearCounters();
    await Sys.updateOne({ key: spawnDocKey }, { $set: { value: { 'keep_me@g_us': 1 } } }, { upsert: true });
    await QA.persistTokenSpawnCounters();
    check('empty map does not wipe doc', (await getVal(spawnDocKey))['keep_me@g_us'] === 1);

 // -- §5 production untouched --
    console.log('\n── §5 production read-only ──');
    const snapAfter = JSON.stringify((await prodSys.findOne({ key: 'card_token_spawn_counters_v1' }))?.value || {});
    check('prod spawn counters byte-identical', snapBefore === snapAfter, `${snapBefore} -> ${snapAfter}`);
    check('QA users never leaked to prod', (await prodConn.db.collection('users').countDocuments({ userId: { $in: [QA_USER_RAW, QA_USER_UNREG] } })) === 0);

    await mongoose.disconnect().catch(() => {});
    await prodConn.close().catch(() => {});
 // drop the scratch database - zero residue
    const tmp = await mongoose.createConnection(scratchUri(PU), { serverSelectionTimeoutMS: 10000 }).asPromise();
    await tmp.dropDatabase().catch(() => {});
    await tmp.close().catch(() => {});

    console.log(`\n═══ RESULT: ${PASS} passed, ${FAIL} failed ═══`);
    process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('QA FATAL:', e); process.exit(1); });
