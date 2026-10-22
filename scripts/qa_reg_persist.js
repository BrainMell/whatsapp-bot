#!/usr/bin/env node
// 🧪 REGISTRATION PERSISTENCE QA (2026-10-22) — run ON-BOX inside the bot dir:
//   node scripts/qa_reg_persist.js
// Owner ask: "players keep having to double register — their registration just
// got botched, fix that"
//
// Root cause this guards: registerUser() stamped the sync baseline with the
// fresh doc itself → debounced saveUser() emitted an EMPTY leafDiff → only
// {updatedAt} reached Mongo → registered:true lived in RAM and died on every
// restart (zero registered:true docs created since the Oct-15 leaf-diff commit).
//
// Safety model:
//   - QA-only identity qa_regpersist_<ts>@lid, deleted from `users` at the end
//   - exercises the REAL economy module + REAL MongoDB (write path is the thing
//     under test) but ZERO WhatsApp traffic
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const t0 = Date.now();
    const mark = (s) => process.stdout.write(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}\n`);
    setTimeout(() => { console.log('QA_HARD_TIMEOUT'); process.exit(3); }, 150000).unref();
    const envPath = path.join(__dirname, '..', '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    mark('connecting mongo');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    mark(`mongo connected: ${mongoose.connection.name}`);

    const BOT = path.join(__dirname, '..');
    const economy = require(path.join(BOT, 'core', 'rpg', 'economy'));
    mark('loadEconomy starting (2778 users)');
    await economy.loadEconomy().catch(e => console.log(`[qa] economy warn: ${e.message}`));
    mark('loadEconomy done');

    const User = mongoose.models.User || mongoose.model('User');
    const QA_JID = `qa_regpersist_${Date.now()}@lid`;
    const NICK = 'QA RegPersist';
    let created = false;
    try {
        // ── §1 register → PERSISTED ──────────────────────────────────────
        console.log('\n── §1 register → whole account reaches MongoDB ──');
        const reg = economy.registerUser(QA_JID, NICK);
        mark('registerUser returned');
        check('registerUser returns success', reg && reg.success === true);
        created = reg && reg.success === true;

        await sleep(1400); // 500ms debounce + write margin
        mark('debounce window elapsed, reading DB');
        const doc = await User.findOne({ userId: QA_JID }).lean();
        mark('DB read done');
        check('doc EXISTS in MongoDB after debounce', !!doc);
        check('registered:true PERSISTED', doc && doc.registered === true, `got ${doc && doc.registered}`);
        check('wallet 1000 persisted', doc && doc.wallet === 1000, `got ${doc && doc.wallet}`);
        check('class persisted (starter)', doc && ['FIGHTER', 'SCOUT', 'APPRENTICE', 'ACOLYTE'].includes(doc.class), `got ${doc && doc.class}`);
        check('nickname persisted', doc && doc.nickname === NICK, `got ${doc && doc.nickname}`);
        check('adventurerRank F persisted', doc && doc.adventurerRank === 'F', `got ${doc && doc.adventurerRank}`);
        check('Registration Bonus in history', doc && Array.isArray(doc.history) && doc.history.some(h => h.desc === 'Registration Bonus'));

        // ── §2 gameplay delta still composes ($inc path) ─────────────────
        console.log('\n── §2 post-register wallet delta still $inc-composes ──');
        const u = economy.getUser(QA_JID);
        check('getUser finds the new player', !!u && u.registered === true);
        if (u) {
            u.wallet += 500;
            economy.scheduleSave(QA_JID);
            await sleep(1400);
            const doc2 = await User.findOne({ userId: QA_JID }).lean();
            check('wallet 1500 in DB after delta save', doc2 && doc2.wallet === 1500, `got ${doc2 && doc2.wallet}`);
            check('registered still true after delta save', doc2 && doc2.registered === true);
        }

        // ── §3 double-register guard (cache path) ────────────────────────
        console.log('\n── §3 ALREADY REGISTERED guard ──');
        const again = economy.registerUser(QA_JID, 'Again');
        check('second register refused', again && again.success === false, (again && again.message || '').slice(0, 60));

        // ── §4 restart-survival semantics (cache drop → DB is the truth) ─
        console.log('\n── §4 fresh-cache read (restart simulation) ──');
        const freshDoc = await User.findOne({ userId: QA_JID }).lean();
        check('a restarting process would load registered:true', freshDoc && freshDoc.registered === true);

        console.log(`\n═══ RESULT: ${PASS} passed, ${FAIL} failed ═══`);
        process.exitCode = FAIL ? 1 : 0;
    } finally {
        try {
            await User.deleteMany({ userId: QA_JID });
            console.log(`[qa] cleaned up ${QA_JID}`);
        } catch (e) { console.log('[qa] cleanup warn:', e.message); }
        try { await mongoose.disconnect(); } catch (e) {}
        console.log(`[qa] done (exit ${FAIL ? 1 : 0})`);
        process.exit(FAIL ? 1 : 0);   // force clean exit: mongoose timers keep the loop alive
    }
})().catch(e => { console.error('QA_FATAL:', e); process.exit(1); });
