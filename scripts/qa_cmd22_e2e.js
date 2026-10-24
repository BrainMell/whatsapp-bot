#!/usr/bin/env node
// 🧪 TASK 22 E2E QA (2026-10-25) — run ON-BOX inside the bot dir:
//   node scripts/qa_cmd22_e2e.js
// Owner ask (21:34Z): bare movement ("just use right left or coords directly
// with a timer"), space hopping ("select or change which room or space you
// wanna move to — the loft or an additional room"), names in captions,
// multi-pick remove, buy-by-number. Drives the REAL handleCommand through the
// REAL renderer + REAL MongoDB with a throwaway identity, ZERO WhatsApp traffic.
//
// Safety model: QA-only identity qa_cmd22_<ts>@lid; its users/homesteads/bases
// docs are deleted at the end. No real user data is touched.
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const t0 = Date.now();
    const mark = (s) => process.stdout.write(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}\n`);
    setTimeout(() => { console.log('QA_HARD_TIMEOUT'); process.exit(3); }, 280000).unref();

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
    await economy.loadEconomy().catch((e) => console.log(`[qa] economy warn: ${e.message}`));
    mark('economy loaded');

    const H = require(path.join(BOT, 'core', 'rpg', 'homestead.js'));
    const renderer = require(path.join(BOT, 'core', 'rpg', 'homesteadRenderer.js'));
    const Homestead = require(path.join(BOT, 'core', 'models', 'Homestead'));
    const User = mongoose.models.User || mongoose.model('User');
    const QA_JID = `qa_cmd22_${Date.now()}@lid`;

    // register + fund (in-memory cache + DB, same as a real player)
    const reg = economy.registerUser(QA_JID, 'QA Cmd22');
    check('registerUser succeeded', reg && reg.success === true);
    economy.addMoney(QA_JID, 100000000, 'QA funding');
    check('wallet funded', economy.getBalance(QA_JID) >= 100000000);

    // stub transport
    const replies = []; const sends = [];
    const sock = { sendMessage: async (chat, content) => { if (content && (content.image || content.video)) sends.push(content); return { key: { id: 'qa' } }; } };
    const mkCtx = (text) => ({ sock, chatId: 'qa-chat', senderJid: QA_JID, m: { key: { id: 'qa' + Math.random() } }, reply: async (t) => { replies.push(String(t)); }, text, prefix: '.j' });
    const say = async (text) => { replies.length = 0; await H.handleCommand(mkCtx(text)); return replies[0] || ''; };
    const freshRec = async () => Homestead.findOne({ userId: QA_JID }).lean();
    // rendering commands report via media sends, not reply() — wait until the
    // send stream goes quiet (bake ~10-28s) before asserting media outcomes
    const waitForQuiet = async (maxS = 70) => {
        let last = sends.length, stable = 0;
        for (let i = 0; i < maxS; i++) {
            await sleep(1000);
            if (sends.length === last) { if (++stable >= 3 && i > 3) return true; }
            else { stable = 0; last = sends.length; }
        }
        return false;
    };

    // ── §1 furniture card: names in the caption ──
    console.log('\n── §1 select card + caption listing ──');
    let r = await say('.j home select');
    check('select card renders (image)', sends.length >= 1 && !!sends[sends.length - 1].image);
    const cap1 = sends[sends.length - 1].caption || '';
    check('caption lists numbered rows (#1)', cap1.includes('#1'), cap1.slice(0, 120));
    const rec0 = await freshRec();
    const rows0 = renderer.inventoryRows(rec0);
    const floorRow = rows0.find((q) => q.placed && q.d.layer !== 'wall');
    check('seed has a placeable floor piece', !!floorRow);

    // ── §2 select by number ──
    r = await say(`.j home select ${floorRow.n}`);
    check(`select ${floorRow.n} renders grid preview (media)`, sends.length >= 2 && !!(sends[sends.length - 1].image || sends[sends.length - 1].video));
    const selUid = floorRow.uid;

    // ── §3 bare movement: .home <dir> 2 ──
    console.log('\n── §3 bare steering (instant acks + idle-timer preview) ──');
    const before = (await freshRec()).placed.find((q) => q.uid === selUid);
    const dirWord = before.x >= 6 ? 'left' : 'right';   // steer toward room centre
    const sign = dirWord === 'right' ? 1 : -1;
    r = await say(`.j home ${dirWord} 2`);
    check(`right/left 2 acks instantly with ➡️`, r.startsWith('➡️'), r.slice(0, 80));
    const stopM = r.match(/stopped after (\d+)/);
    const expDx = sign * (stopM ? +stopM[1] : 2);
    let after = (await freshRec()).placed.find((q) => q.uid === selUid);
    check('DB position moved as acked', after.x === before.x + expDx && after.y === before.y, `(${before.x},${before.y}) → (${after.x},${after.y}) (expected dx=${expDx})`);
    r = await say(`.j home ${dirWord}`);
    const blocked = r.startsWith('🚧');
    check('second bare move acks (➡️) or a legit block (🚧)', r.startsWith('➡️') || blocked, r.slice(0, 60));
    const stopM2 = r.match(/stopped after (\d+)/);
    const expDx2 = blocked ? 0 : sign * (stopM2 ? +stopM2[1] : 1);
    after = (await freshRec()).placed.find((q) => q.uid === selUid);
    check('DB position matches acks (2nd)', after.x === before.x + expDx + expDx2, `x=${after.x}`);

    // ── §4 idle-timer preview (2.5s → one animated render) ──
    const sendsBeforePreview = sends.length;
    mark('waiting for idle-timer preview bake (up to 60s)');
    let previewArrived = false;
    for (let i = 0; i < 60; i++) {
        await sleep(1000);
        if (sends.length > sendsBeforePreview) { previewArrived = true; break; }
    }
    check('idle preview rendered exactly once after pause', previewArrived && sends.length === sendsBeforePreview + 1, `sends ${sendsBeforePreview}→${sends.length}`);
    if (previewArrived) {
        const pv = sends[sends.length - 1];
        check('preview is the animated room (video/mp4 or image)', !!(pv.video || pv.image));
    }

    // ── §5 bare coords .home 3 4 (NOT structure #3) ──
    r = await say('.j home 3 4');
    check('.home 3 4 → coords move ack', r.startsWith('➡️'), r.slice(0, 80));
    const mCoords = r.match(/➡️ \((\d+),(\d+)\)/);
    after = (await freshRec()).placed.find((q) => q.uid === selUid);
    check('coords DB position matches ack', mCoords && +mCoords[1] === after.x && +mCoords[2] === after.y, `ack ${mCoords ? mCoords[0] : '?'} vs (${after.x},${after.y})`);
    r = await say('.j home 3');
    check('.home 3 (single number) does NOT steer — structure route (or its guild gate)', r.includes('No such structure') || r.includes('Bases belong to guild'), r.slice(0, 80));
    // the coords move re-armed an idle preview — let it finish before §6
    await waitForQuiet();

    // ── §6 space hopping ──
    console.log('\n── §6 .home to <space> ──');
    r = await say('.j home to');
    check('.home to bare lists spaces', r.includes('Main hall') && r.includes('Loft'), r.slice(0, 90));
    r = await say('.j home to loft');
    check('.home to loft without a loft → build hint', r.includes('loft first'), r.slice(0, 80));
    await Homestead.updateOne({ userId: QA_JID }, { $set: { upper: true } });
    const sendsBeforeLoft = sends.length;
    r = await say('.j home to loft');
    check('.home to loft reports via media render', sends.length > sendsBeforeLoft, `sends ${sendsBeforeLoft}→${sends.length}`);
    after = (await freshRec()).placed.find((q) => q.uid === selUid);
    check('piece is lvl 1 inside the loft bounds', after.lvl === 1 && after.x >= 0 && after.x < 6 && after.y >= 0 && after.y < 6, `lvl=${after.lvl} (${after.x},${after.y})`);
    r = await say('.j home to e');
    check('.home to east without an annex → build hint', r.includes("don't have a East annex"), r.slice(0, 90));
    r = await say('.j home to main');
    await waitForQuiet();
    check('.home to main reports via media render', sends.length > sendsAfterLoft);
    after = (await freshRec()).placed.find((q) => q.uid === selUid);
    check('piece back on the ground floor', !after.lvl, `lvl=${after.lvl}`);

    // ── §7 shop: names in caption + buy-by-number ──
    console.log('\n── §7 shop session + buy-by-number ──');
    r = await say('.j home catalog');
    const capShop = sends[sends.length - 1].caption || '';
    check('catalog caption lists numbered items', capShop.includes('1. ') && capShop.includes('buy <number|name>'), capShop.slice(0, 100));
    const balBefore = economy.getBalance(QA_JID);
    r = await say('.j home buy 1');
    check('buy 1 → bought by number', r.includes('Bought'), r.slice(0, 90));
    const recAfterBuy = await freshRec();
    check('bought instance landed in owned', recAfterBuy.owned.length === rec0.owned.length + 1, `owned ${rec0.owned.length}→${recAfterBuy.owned.length}`);
    check('wallet debited', economy.getBalance(QA_JID) < balBefore);
    r = await say('.j home buy 99');
    check('out-of-range number → range error', r.includes('only shows'), r.slice(0, 80));

    // ── §8 numbered multi-pick remove ──
    console.log('\n── §8 remove by numbers ──');
    const rowsNow = renderer.inventoryRows(await freshRec());
    const placedRow = rowsNow.find((q) => q.placed && q.uid !== selUid) || rowsNow.find((q) => q.placed);
    r = await say(`.j home remove ${placedRow.n}`);
    check('remove <n> picks the numbered piece up', r.includes('Picked up'), r.slice(0, 90));
    const recAfterRemove = await freshRec();
    check('piece moved placed→storage atomically', recAfterRemove.placed.length === recAfterBuy.placed.length - 1 && recAfterRemove.owned.length === recAfterBuy.owned.length + 1);

    // ── cleanup ──
    console.log('\n── cleanup ──');
    const d1 = await Homestead.deleteOne({ userId: QA_JID });
    const d2 = await User.deleteOne({ userId: QA_JID });
    let d3 = { deletedCount: 'n/a' };
    try { const Base = mongoose.models.Base || mongoose.model('Base'); d3 = await Base.deleteOne({ userId: QA_JID }); } catch (e) { /* no Base model */ }
    check('QA docs removed', d1.deletedCount === 1 && d2.deletedCount === 1);
    console.log(`  (homesteads=${d1.deletedCount} users=${d2.deletedCount} bases=${d3.deletedCount})`);

    console.log(`\n═══ E2E QA: ${PASS} pass / ${FAIL} fail ═══`);
    await mongoose.disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('QA_CRASH', e); process.exit(2); });
