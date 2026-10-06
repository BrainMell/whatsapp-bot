#!/usr/bin/env node
// ⚔️ ECON STALE-GUARD QA — cross-instance write clobber (2026-10-05)
// Mellow's report: "quests, money, and player actions keep reverting…
// maybe the bots keep overriding each other in the database?" — CONFIRMED
// pre-fix: saveUser() did {$set: <entire in-memory doc>}, and every bot
// process boots with its own snapshot of every user, so a sibling's flush
// rewrote newer data back to old values.
// This QA reproduces the real topology: PARENT process (bot A) + CHILD
// process (bot B, separate node process = separate cache snapshot) share
// one database, both mutate the same user, both flush.
// Post-fix assertions:
//   A1 sibling's newer WALLET survives the parent's flush (the headline
//      revert: money going back)
//   A2 sibling's QUEST PROGRESS survives
//   A3 sibling's BRAND-NEW FIELD survives (full-doc clobber would drop it)
//   A4 parent's own genuine change (gold) still lands (merge overlays it)
//   A5 post-merge cache was refreshed: a SUBSEQUENT fast-path save keeps
//      both the sibling's data and the parent's newer change
//   A6 fast path (no sibling write between saves) still writes wholesale
//   A7 new-user upsert path unaffected (fresh users have no baseline)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwqa_stale$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`[qa] db: ${mongoose.connection.name}`);
}

function runSibling(step, jid) {
    // separate node process = separate in-memory snapshot, exactly like
    // the other bot instance on Box1
    execFileSync(process.execPath, [path.join(__dirname, 'econ_stale_guard_sibling.js'), step, jid], {
        stdio: 'inherit', timeout: 120000,
        env: { ...process.env, MONGO_URI: process.env.MONGO_URI },
    });
}

(async () => {
    await connectDB();
    const User = require('../core/models/User');
    const economy = require('../core/rpg/economy');
    const jid = '15550000999@s.whatsapp.net';

    // ── seed: a user BOTH processes will soon hold in their caches ──
    await User.deleteMany({ userId: { $in: [jid] } });
    await User.create({
        userId: jid, wallet: 1000, questGold: 0, bank: 0, registered: true,
        nickname: 'StaleGuardQA', questsCompleted: 0, questsWon: 0, questsFailed: 0,
        activeEffects: {},
    });
    await economy.loadEconomy(); // parent snapshot: wallet 1000, questGold 0, no quests done
    let u = economy.getUser(jid);
    check('parent cache loaded with seeded doc', u && u.wallet === 1000 && u.questGold === 0, u && { w: u.wallet, qg: u.questGold });

    // ── parent-side local action BEFORE the sibling acts ──
    u.questGold = 50;          // +50 quest gold from parent-side play
    u.questsCompleted = 2;     // two quests finished via this bot

    // ── SIBLING process boots (fresh snapshot from DB), plays, flushes ──
    // sibling pays a quest reward → wallet 1500, completes dailySlain,
    // adds a field the parent has never seen
    runSibling('claim_reward', jid);

    // ── parent flushes its (now older-snapshot + own changes) copy ──
    await economy.saveUser(jid);
    let dbDoc = await User.findOne({ userId: jid }).lean();
    check('A1 sibling newer wallet 1500 NOT reverted to 1000', dbDoc.wallet === 1500, dbDoc.wallet);
    check('A2 sibling quest counter questsWon=7 survives', dbDoc.questsWon === 7, dbDoc.questsWon);
    check('A3 sibling new activeEffects survive', dbDoc.activeEffects?.full_restore === 999999999999, dbDoc.activeEffects);
    check('A4 parent genuine changes land (questGold 50, questsCompleted 2)', dbDoc.questGold === 50 && dbDoc.questsCompleted === 2, { qg: dbDoc.questGold, qc: dbDoc.questsCompleted });

    // ── A5: post-merge cache refreshed → next save keeps BOTH sides ──
    u = economy.getUser(jid);
    check('A5 cache refreshed to merged state (wallet readable)', u.wallet === 1500 && u.activeEffects?.full_restore === 999999999999, { w: u.wallet, fx: u.activeEffects });
    u.questGold = 110; // one more parent-side change
    await economy.saveUser(jid); // NO sibling write since last stamp → fast path
    dbDoc = await User.findOne({ userId: jid }).lean();
    check('A5b fast-path save keeps parent new change (questGold 110)', dbDoc.questGold === 110, dbDoc.questGold);
    check('A5c fast-path save still carries sibling data', dbDoc.wallet === 1500 && dbDoc.activeEffects?.full_restore === 999999999999, { w: dbDoc.wallet });

    // ── A6: a fast-path save with NO merge behaved wholesale (no false merge log) ──
    // (covered implicitly: if A5 had wrongly taken the merge path the gold
    // math above still holds; here we assert the doc updatedAt moved)
    const before = dbDoc.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 30));
    u.questGold = 115;
    await economy.saveUser(jid);
    dbDoc = await User.findOne({ userId: jid }).lean();
    check('A6 repeat save writes (updatedAt bumped)', dbDoc.updatedAt.getTime() > before && dbDoc.questGold === 115, dbDoc.questGold);

    // ── A7: brand-new user (no baseline) still upserts ──
    const fresh = '15550000998@s.whatsapp.net';
    await User.deleteMany({ userId: fresh });
    const nu = economy.getOrCreateUser(fresh);
    nu.wallet = 777;
    await economy.saveUser(fresh);
    const dbFresh = await User.findOne({ userId: fresh }).lean();
    check('A7 fresh user upserts with data', dbFresh && dbFresh.wallet === 777, dbFresh && dbFresh.wallet);

    // ── sibling readback: what the OTHER process would now see ──
    console.log('[qa] sibling readback of the final doc:');
    runSibling('verify_readback', jid);

    console.log(`\n═══ STALE-GUARD QA: ${PASS} passed, ${FAIL} failed ═══`);
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
