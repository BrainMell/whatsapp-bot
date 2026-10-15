'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// QA — homestead media matrix + §5 inventory flow (owner 2026-10-15
// "rpg_base_building_redesign.md" §5/§6, DM: "the main issue with the
// interior view of the house is just the name of furniture thing the gif
// image card alteration thing")
//   §6 matrix: view/select/move/rotate/theme → STATIC image card
//              successful placement / build / upgrade → ANIMATED GIF
//   §5: .home select (bare) → NAMES card of owned furniture (placed/storage)
//       .home select <storage piece> → placement-mode grid + suggested spot
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');

process.env.QA_MODE = '1';
const repo = process.env.QA_REPO || path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.error(`  ❌ ${label}`); }
}

(async () => {
    const env = fs.readFileSync(path.join(repo, '.env'), 'utf8');
    const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
    if (!uri) throw new Error('MONGO_URI not found in .env');
    const mongoose = require(path.join(repo, 'node_modules', 'mongoose'));
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[qa] mongoose connected');

    const economy = require(path.join(repo, 'core/rpg/economy'));
    const homestead = require(path.join(repo, 'core/rpg/homestead'));
    const baseBuilder = require(path.join(repo, 'core/rpg/baseBuilder'));
    const H = require(path.join(repo, 'core/models/Homestead'));
    const B = require(path.join(repo, 'core/models/Base'));
    const U = require(path.join(repo, 'core/models/User'));

    const UID = '15559990002@s.whatsapp.net';
    await H.deleteMany({ userId: UID });
    await B.deleteMany({ userId: UID });
    await U.deleteMany({ userId: UID });

    economy.registerUser(UID, 'QAMedia');
    const curBal = economy.getBalance(UID);
    if (curBal > 0) economy.removeMoney(UID, curBal, 'qa reset');
    economy.addMoney(UID, 200000, 'qa media seed');

    const sent = [];
    let seq = 0;
    const ctx = {
        sock: { sendMessage: async (id, content) => { sent.push(content); return { key: { id: 'k' } }; } },
        chatId: UID,
        senderJid: UID,
        m: { key: { id: 'x' }, message: {} },
        reply: async (t) => { sent.push({ text: t }); return t; },
        text: '.home',
        rawText: '.home',
        prefix: '.',
    };
    const rawHandle = homestead.handleCommand.bind(homestead);
    homestead.handleCommand = async (c) => {
        c.m = c.m || { key: {}, message: {} };
        c.m.key = { id: `media-${++seq}` };
        return rawHandle(c);
    };
    const last = (pick) => { for (let i = sent.length - 1; i >= 0; i--) { const v = pick(sent[i]); if (v) return v; } return null; };
    const isStaticImage = (s) => s && s.image && !s.video;
    const isGif = (s) => s && s.video;

    console.log('\n══ 1. §5 NAMES CARD — .home select (bare) ══');
    sent.length = 0;
    ctx.text = '.j home select'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'bare .j home select sends a STATIC image card');
    ok(last((s) => (s.caption || '')).includes('Your Furniture'), 'names card caption present');
    ok(!sent.some(isGif), 'names card is NOT an animated gif');

    console.log('\n══ 2. §6 STATIC matrix — interior views ══');
    // seed the base first, then enter the house interior: view → static
    sent.length = 0;
    ctx.text = '.j base'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'base map view = static image card');
    ok(!sent.some(isGif), 'base map view is NOT animated');
    sent.length = 0;
    ctx.text = '.j house 1'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'house interior view = static image card');
    ok(!sent.some(isGif), 'house interior view is NOT animated');
    // select a placed piece → grid preview static
    sent.length = 0;
    ctx.text = '.home select bed_bedroll'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'select placed piece → static grid image');
    ok(!sent.some(isGif), 'select preview is NOT animated');
    // move → static
    sent.length = 0;
    ctx.text = '.home move right'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'move → static grid image');
    // rotate → static
    sent.length = 0;
    ctx.text = '.home rotate'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'rotate → static grid image');

    console.log('\n══ 3. §5 PLACEMENT MODE — storage piece ══');
    // starter owned storage piece: plant_flower
    sent.length = 0;
    ctx.text = '.home select plant_flower'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'select storage piece → placement-mode grid image');
    ok((last((s) => (s.caption || '')) || '').includes('Placement mode'), 'placement-mode caption present');
    // deselect cancels
    sent.length = 0;
    ctx.text = '.home deselect'; await homestead.handleCommand(ctx);
    ok(sent.some((s) => String(s.text || '').includes('cleared')), 'deselect clears placement mode');

    console.log('\n══ 4. §6 GIF on placement success only ══');
    // buy a piece, then place it → ANIMATED (pop)
    sent.length = 0;
    ctx.text = '.home buy chest_ruby'; await homestead.handleCommand(ctx);
    ok(sent.some((s) => String(s.text || '').includes('Bought')), 'chest_ruby bought');
    sent.length = 0;
    ctx.text = '.home place chest_ruby'; await homestead.handleCommand(ctx);
    ok(sent.some(isGif), 'successful placement = ANIMATED gif (pop)');
    // starter-owned storage piece: re-arm placement mode then satisfy it
    sent.length = 0;
    ctx.text = '.home select plant_flower'; await homestead.handleCommand(ctx);
    ok((last((s) => (s.caption || '')) || '').includes('Placement mode'), 'storage select re-arms placement mode');
    sent.length = 0;
    ctx.text = '.home place plant_flower 8 8'; await homestead.handleCommand(ctx);
    ok(sent.some(isGif), 'second placement = ANIMATED gif');
    sent.length = 0;
    ctx.text = '.home select'; await homestead.handleCommand(ctx);
    ok(sent.some(isStaticImage), 'post-place bare select shows names card (mode was consumed)');

    console.log('\n══ 5. §6 base upgrade = GIF ══');
    // upgrade the house (structure 1) → celebrate → animated
    sent.length = 0;
    ctx.text = '.j base upgrade 1'; await homestead.handleCommand(ctx);
    ok(sent.some(isGif), 'base upgrade = ANIMATED gif (celebrate)');

    console.log('\n══ 6. renderer unit: static flag ══');
    const renderer = require(path.join(repo, 'core/rpg/homesteadRenderer'));
    const baseRenderer = require(path.join(repo, 'core/rpg/homesteadBaseRenderer'));
    const state = {
        owner: 'QA Media',
        theme: 'oakhaven',
        placed: [{ item: 'bed_bedroll', x: 2, y: 2 }, { item: 'plant_flower', x: 7, y: 3 }],
    };
    const t0 = Date.now();
    const stat = await renderer.renderRoomImage(state, { static: true });
    const statMs = Date.now() - t0;
    ok(stat.contentType === 'image/png', `static render returns PNG (${(stat.buffer.length / 1024).toFixed(0)}KB)`);
    const anim = await renderer.renderRoomImage(state, {});
    ok(anim.contentType === 'video/mp4', `default render returns mp4 (${(anim.buffer.length / 1024).toFixed(0)}KB)`);
    ok(statMs < 15000, `static render is fast (${statMs}ms vs full 14-frame pipeline)`);
    const inv = await renderer.renderInventoryCard(
        { placed: state.placed, owned: [{ id: 'chest_ruby' }, { id: 'stool_amber' }] },
        { prefix: '.' },
    );
    ok(inv && inv.length > 30000, `inventory names card renders (${(inv.length / 1024).toFixed(0)}KB)`);
    const bstat = await baseRenderer.renderBaseImage({ owner: 'QA Media', structures: [], freePlots: [] }, { static: true });
    ok(bstat.contentType === 'image/png', 'base static render returns PNG');
    const banim = await baseRenderer.renderBaseImage({ owner: 'QA Media', structures: [], freePlots: [] }, { celebrate: true });
    ok(banim.contentType === 'video/mp4', 'base celebrate render returns mp4');

    console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
    await H.deleteMany({ userId: UID });
    await B.deleteMany({ userId: UID });
    await U.deleteMany({ userId: UID });
    await mongoose.disconnect();
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA crashed:', e.message); process.exit(1); });
