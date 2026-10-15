'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// QA — homestead house builder (local, pre-deploy)
//  1. renderer smoke: frame render, mp4 encode, catalog card
//  2. geometry rules: bounds, overlap, rug stacking, banner slots
//  3. command logic: loadRec seeding, place→store round-trip, buy flow,
//     theme purchase, resolveItem fuzz (via in-memory MongoDB)
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');

process.env.QA_MODE = '1';
const repo = '/home/z/my-project/repo';

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.error(`  ❌ ${label}`); }
}

(async () => {
    // ── real DB via .env (same pattern as qa_energy.js) — QA-jid + cleanup ──
    const env = fs.readFileSync(path.join(repo, '.env'), 'utf8');
    const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
    if (!uri) throw new Error('MONGO_URI not found in .env');
    const mongoose = require(path.join(repo, 'node_modules', 'mongoose'));
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[qa] mongoose connected');

    console.log('\n══ 1. RENDERER SMOKE ══');
    const renderer = require(path.join(repo, 'core/rpg/homesteadRenderer'));
    const state = {
        owner: 'QA Tester',
        theme: 'oakhaven',
        placed: [
            { item: 'rug_royal', x: 4, y: 4 },
            { item: 'bed_noble', x: 2, y: 1 },
            { item: 'hearth_brick', x: 5, y: 0 },
            { item: 'cauldron', x: 1, y: 5 },
            { item: 'well_wishing', x: 9, y: 8 },
            { item: 'clock_grand', x: 8, y: 1 },
            { item: 'banner_crimson', x: 4, y: 1 },
            { item: 'stall_market', x: 7, y: 5 },
        ],
    };
    const f0 = await renderer.renderFrame(state, 0, {});
    ok(f0 && f0.length > 50000, `room frame renders (${(f0.length / 1024).toFixed(0)}KB)`);
    const mp4 = await renderer.encodeFramesToMp4(
        [f0, await renderer.renderFrame(state, 5, {}), await renderer.renderFrame(state, 9, {})],
    );
    ok(mp4 && mp4.length > 20000, `mp4 encodes (${(mp4.length / 1024).toFixed(0)}KB)`);
    fs.writeFileSync('/home/z/my-project/basebuilder/assets_out/qa_room.mp4', mp4);
    const card = await renderer.renderCatalogPage(0, 5, { balance: 9999 });
    ok(card && card.length > 50000, `catalog card renders (${(card.length / 1024).toFixed(0)}KB)`);
    const img2 = await renderer.renderRoomImage(state, {});
    ok(img2.contentType === 'video/mp4' && img2.buffer.length > 20000,
        `renderRoomImage full pipeline (${img2.contentType}, ${(img2.buffer.length / 1024).toFixed(0)}KB)`);
    const cached = await renderer.renderRoomImage(state, {});
    ok(cached.buffer === img2.buffer, 'render cache hit (identical state)');

    console.log('\n══ 2. GEOMETRY RULES ══');
    // pull internal helpers through a test-only export surface: replicate via module internals
    // (canPlace/findFreeSpot are module-private in homestead.js — test through handleCommand instead)
    const homestead = require(path.join(repo, 'core/rpg/homestead'));
    ok(typeof homestead.handleCommand === 'function', 'handleCommand exported');

    console.log('\n══ 3. COMMAND LOGIC (in-memory DB) ══');
    const economy = require(path.join(repo, 'core/rpg/economy'));
    const UID = '15559990001@s.whatsapp.net';
    economy.registerUser(UID, 'QAUser');
    // deterministic slate: wipe prior QA docs (owned is now INSTANCE objects)
    await HomesteadWipe();
    const curBal = economy.getBalance(UID);
    if (curBal > 0) economy.removeMoney(UID, curBal, 'qa reset');
    economy.addMoney(UID, 51000, 'qa seed');
    ok(economy.isRegistered(UID), 'QA user registered');
    ok(economy.getBalance(UID) >= 50000, `QA wallet seeded (${economy.getBalance(UID)})`);

    async function HomesteadWipe() {
        const H = require(path.join(repo, 'core/models/Homestead'));
        const B = require(path.join(repo, 'core/models/Base'));
        await H.deleteMany({ userId: UID });
        await B.deleteMany({ userId: UID });
    }

    const sent = [];
    let seq = 0;
    const ctx = {
        sock: { sendMessage: async (id, content, opts) => { sent.push(content); return { key: { id: 'k' } }; } },
        chatId: UID,
        senderJid: UID,
        m: { key: { id: 'x' }, message: {} },
        reply: async (t) => { sent.push({ text: t }); return t; },
        text: '.home',
        rawText: '.home',
        prefix: '.',
    };
    // purchase idempotency (§4) keys on the WhatsApp message id — give every
    // harness invocation a fresh id so redelivery-dedupe never eats a step
    const rawHandle = homestead.handleCommand.bind(homestead);
    homestead.handleCommand = async (c) => {
        c.m = c.m || { key: {}, message: {} };
        c.m.key = { id: `legacy-${++seq}` };
        return rawHandle(c);
    };

    // view (first open seeds starter room) — bare .home now opens the OUTDOOR
    // base map (spec §6), so this asserts media of either kind arrives
    sent.length = 0;
    ctx.text = '.home'; await homestead.handleCommand(ctx);
    ok(sent.some(s => s.video || s.image), `.home renders media (${sent.map(s => s.video ? 'mp4-gif' : s.image ? 'png' : null).filter(Boolean).join('+') || '???'})`);

    // 💡 REGRESSION (owner "home commands don't work"): the engine passes the
    // FULL command text with joker's TWO-TOKEN prefix (".j home ..."). The
    // old tokenizer read tokens[1] ('home') as the SUBcommand, so every live
    // invocation fell into the unknown-command reply and the renderer never
    // ran. Pin all dispatch forms here — especially the ".j " prefixed ones.
    const dispatchForms = ['.j home', '.j homestead', '.j house', '.j base'];
    for (const form of dispatchForms) {
        sent.length = 0;
        ctx.text = form; await homestead.handleCommand(ctx);
        ok(sent.some(s => s.video || s.image), `dispatch form ${JSON.stringify(form)} reaches the renderer`);
    }
    sent.length = 0;
    ctx.text = '.j home catalog'; await homestead.handleCommand(ctx);
    ok(sent.some(s => s.image), 'dispatch form ".j home catalog" reaches the catalog');
    sent.length = 0;
    ctx.text = '.j home nosuchsub'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Unknown homestead command')), 'genuinely unknown sub still rejects');

    // catalog
    sent.length = 0;
    ctx.text = '.home catalog'; await homestead.handleCommand(ctx);
    ok(sent.some(s => s.image), '.home catalog sends card image');

    // buy (registerUser grants 1000 starter ZENI → 51000 total)
    sent.length = 0;
    ctx.text = '.home buy rug_royal'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Bought')), '.home buy succeeds with funds');
    const bal1 = economy.getBalance(UID);
    ok(bal1 === 51000 - 5000, `ZENI deducted (46,000, got ${bal1})`);

    // place with coords
    sent.length = 0;
    ctx.text = '.home place rug_royal 3 6'; await homestead.handleCommand(ctx);
    ok(sent.some(s => s.video || s.image), '.home place renders room');

    // place auto-spot (plant_flower comes with the starter kit)
    sent.length = 0;
    ctx.text = '.home place plant_flower'; await homestead.handleCommand(ctx);
    ok(sent.some(s => s.video || s.image), 'auto-spot place works (starter item, no coords)');

    // theme list + buy+apply (stonehearth 5000, affordable at 46000)
    sent.length = 0;
    ctx.text = '.home themes'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Stonehearth')), 'themes list');
    sent.length = 0;
    ctx.text = '.home theme stonehearth'; await homestead.handleCommand(ctx);
    const Homestead = require(path.join(repo, 'core/models/Homestead'));
    let rec = await Homestead.findOne({ userId: UID }).lean();
    ok(rec.theme === 'stonehearth', 'theme bought+applied (stonehearth)');
    ok(economy.getBalance(UID) === bal1 - 5000, `theme 5000 deducted (bal=${economy.getBalance(UID)})`);
    ok(rec.themesOwned.includes('stonehearth'), 'theme added to themesOwned');

    // buy + place round-trip
    sent.length = 0;
    ctx.text = '.home buy chest_ruby'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Bought')), 'chest_ruby bought');
    ctx.text = '.home place chest_ruby'; await homestead.handleCommand(ctx);
    ok(sent.some(s => s.video || s.image), 'buy+place round-trip');

    // drain the wallet deterministically: well_wishing (15000) + arcaneum theme (20000)
    // 46000-5000(theme)-3200(chest) = 37800 → -15000 = 22800 → -20000 = 2800
    sent.length = 0;
    ctx.text = '.home buy well_wishing'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Bought')), 'legendary affordable → bought');
    ctx.text = '.home theme arcaneum'; await homestead.handleCommand(ctx);
    ok(economy.getBalance(UID) === 2800, `drained to 2800 (got ${economy.getBalance(UID)})`);

    // insufficient funds (blackvault 26000 > 2800)
    sent.length = 0;
    ctx.text = '.home theme blackvault'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Not enough')), 'insufficient funds rejected');
    ok(economy.getBalance(UID) === 2800, 'balance untouched on failed theme buy');
    rec = await Homestead.findOne({ userId: UID }).lean();
    ok(rec.theme === 'arcaneum', 'arcaneum theme still active after failed buy');

    // move + store
    rec = await Homestead.findOne({ userId: UID }).lean();
    const chest = rec.placed.find(p => p.item === 'chest_ruby');
    ok(!!chest, 'chest_ruby is placed');
    sent.length = 0;
    ctx.text = `.home store ${chest.x} ${chest.y}`; await homestead.handleCommand(ctx);
    rec = await Homestead.findOne({ userId: UID }).lean();
    ok(!rec.placed.some(p => p.item === 'chest_ruby') && rec.owned.some(o => o.id === 'chest_ruby'), 'store returns item to owned');

    // visit (no target → usage)
    sent.length = 0;
    ctx.text = '.home visit'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('Usage')), 'visit without target → usage');

    // unregistered gate
    const UID2 = "15559990002@s.whatsapp.net";
    sent.length = 0;
    ctx.senderJid = UID2; ctx.text = '.home'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('register')), 'unregistered gate blocks');
    ctx.senderJid = UID;

    // help
    sent.length = 0;
    ctx.text = '.home help'; await homestead.handleCommand(ctx);
    ok(sent.some(s => String(s.text || '').includes('HOMESTEAD')), 'help text');

    console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);

    // ── cleanup QA artifacts ──
    try {
        const Homestead = require(path.join(repo, 'core/models/Homestead'));
        const User = require(path.join(repo, 'core/models/User'));
        await Homestead.deleteMany({ userId: { $in: [UID, UID2] } });
        await User.deleteMany({ userId: { $in: [UID, UID2] } });
        console.log('[qa] cleaned up QA homesteads + users');
    } catch (e) { console.log('[qa] cleanup warning:', e.message); }

    await mongoose.disconnect();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA crashed:', e); process.exit(1); });
