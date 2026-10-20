#!/usr/bin/env node
// ⚔️ ECON COMPOSITING QA (47-l1, 2026-10-20) — wallet/bank/eventTokens move
// as $inc DELTAS, not stale absolute $sets.
// Owner report: Akon withdrew 5,000 (wallet 1,500→6,500, bank 98,027→93,027),
// then his wallet READ 1,500 again while the bank debit stuck — the withdraw
// credit evaporated and the next buy tripped the "wallet changed" guard.
// Root cause: joker (box2) and subaru/jake (box1) hold separate caches of the
// same user; a leaf-$set from a stale snapshot plants that process's stale
// absolute balance over a sibling's newer credit.
// Post-fix law: counter deltas are captured from the PRE-MERGE cache vs our
// baseline and written as $inc, so concurrent credits/debits compose.
//
// Phases:
//   P1  THE AKON BUG: stale parent edits wallet while sibling credits → both
//       deltas compose (wallet 6750, tokens 3), bank untouched, sibling's
//       non-counter leaves survive.
//   P2  NO DOUBLE-APPLY: stale parent saves WITHOUT touching wallet → the
//       sibling's newer wallet stands untouched (adoption must not delta).
//   P3  REAL-API flow: addMoney on the adopted cache → exact delta lands.
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
    const uri = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwqa_47l1$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`[qa] db: ${mongoose.connection.name}`);
}

function runSibling(step, jid) {
    execFileSync(process.execPath, [path.join(__dirname, 'econ_compositing_sibling.js'), step, jid], {
        stdio: 'inherit', timeout: 120000,
        env: { ...process.env, MONGO_URI: process.env.MONGO_URI },
    });
}

(async () => {
    await connectDB();
    const User = require('../core/models/User');
    const economy = require('../core/rpg/economy');

    // ════ P1 — THE AKON BUG ════
    const jid = '15550001001@s.whatsapp.net';
    await User.deleteMany({ userId: { $in: [jid] } });
    await User.create({
        userId: jid, wallet: 1500, bank: 98027, eventTokens: 0, registered: true,
        nickname: 'CompositingQA', activeEffects: {},
    });
    await economy.loadEconomy(); // parent snapshot: wallet 1500 / bank 98027
    let u = economy.getUser(jid);
    check('P0 parent cache loaded (wallet 1500 / bank 98027)', u && u.wallet === 1500 && u.bank === 98027, u && { w: u.wallet, b: u.bank });

    // sibling (fresh snapshot) credits the withdraw +5,000 and +2 tokens
    runSibling('withdraw_and_tokens', jid); // DB: wallet 6500, tokens 2, questsWon 7
    let dbDoc = await User.findOne({ userId: jid }).lean();
    check('P0 sibling write landed (wallet 6500 / tokens 2)', dbDoc.wallet === 6500 && (dbDoc.eventTokens || 0) === 2, { w: dbDoc.wallet, t: dbDoc.eventTokens });

    // parent (STALE at wallet 1500) pays a quiz reward +250 and +1 token, flushes
    u = economy.getUser(jid);
    u.wallet = u.wallet + 250;
    u.eventTokens = (u.eventTokens || 0) + 1;
    await economy.saveUser(jid);
    dbDoc = await User.findOne({ userId: jid }).lean();
    check('P1 THE FIX: stale +250 composes → wallet 6750 (pre-fix: 1750, evaporation)', dbDoc.wallet === 6750, dbDoc.wallet);
    check('P1b token deltas compose → 3', (dbDoc.eventTokens || 0) === 3, dbDoc.eventTokens);
    check('P1c bank untouched by both sides stays 98027', dbDoc.bank === 98027, dbDoc.bank);
    check('P1d sibling non-counter leaf survives (questsWon 7)', dbDoc.questsWon === 7, dbDoc.questsWon);

    u = economy.getUser(jid);
    check('P1e parent cache adopted DB truth (6750 / 3)', u.wallet === 6750 && (u.eventTokens || 0) === 3, { w: u.wallet, t: u.eventTokens });

    // fast path: no sibling since last stamp → exact delta, exact result
    u.wallet = u.wallet + 1;
    await economy.saveUser(jid);
    dbDoc = await User.findOne({ userId: jid }).lean();
    check('P1f fast-path save: wallet 6751', dbDoc.wallet === 6751, dbDoc.wallet);

    // ════ P2 — NO DOUBLE-APPLY (stale save WITHOUT touching the wallet) ════
    const jid2 = '15550001002@s.whatsapp.net';
    await User.deleteMany({ userId: { $in: [jid2] } });
    await User.create({
        userId: jid2, wallet: 500, bank: 10, eventTokens: 0, registered: true,
        nickname: 'CompositingQA2', activeEffects: {},
    });
    await economy.loadEconomy(); // parent snapshot: wallet 500
    runSibling('credit_4000', jid2); // DB: wallet 4500
    u = economy.getUser(jid2);
    u.questGold = 99; // parent touches ONLY questGold — wallet stays 500 in cache
    await economy.saveUser(jid2);
    dbDoc = await User.findOne({ userId: jid2 }).lean();
    check('P2 sibling wallet 4500 stands (no revert, no double-apply)', dbDoc.wallet === 4500, dbDoc.wallet);
    check('P2b parent questGold 99 landed', dbDoc.questGold === 99, dbDoc.questGold);

    // ════ P3 — REAL-API flow on the adopted cache ════
    economy.addMoney(jid2, 250, 'CompositingQA payout');
    await economy.saveUser(jid2);
    dbDoc = await User.findOne({ userId: jid2 }).lean();
    check('P3 addMoney(+250) after adoption → wallet 4750', dbDoc.wallet === 4750, dbDoc.wallet);

    // ════ P4 — CONCURRENT saves must not double-apply (47-l1 save mutex) ════
    // pre-fix: two overlapping saveUser calls both diffed +100 against the
    // same not-yet-stamped baseline → $inc applied twice (caught live when
    // the scheduleSave debounce flush raced the QA's explicit save).
    economy.addMoney(jid2, 100, 'CompositingQA concurrent');
    await Promise.all([economy.saveUser(jid2), economy.saveUser(jid2)]);
    dbDoc = await User.findOne({ userId: jid2 }).lean();
    check('P4 concurrent saves apply the +100 delta ONCE → 4850', dbDoc.wallet === 4850, dbDoc.wallet);

    console.log('[qa] sibling readback:');
    runSibling('verify_readback', jid2);

    console.log(`\n═══ COMPOSITING QA: ${PASS} passed, ${FAIL} failed ═══`);
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
