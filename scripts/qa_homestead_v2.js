'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// QA — isometric furniture + base building overhaul (owner spec §11)
// Acceptance coverage:
//   §1 shadows (silhouette cast + contact AO render), §2 collision-safe
//   placement, §3 select/move/rotate/moveto + labelled grid preview,
//   §4 atomic purchases (dedupe, refund, uid-precise pulls), §5 catalogue,
//   §6 base hub routing, §7 upgrades, §8 construction, §9 admin commands.
// Run: node scripts/qa_homestead_v2.js   (real DB, QA jids, cleaned up)
// ═══════════════════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');

process.env.QA_MODE = '1';
const repo = process.env.QA_REPO || path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else {
        fail++;
        let lt = '';
        try { lt = String(lastText()).split(String.fromCharCode(10)).join(' | ').slice(0, 240); } catch (e) {}
        console.error(`  ❌ ${label}${lt ? ' || bot said: ' + lt : ''}`);
    }
}
function section(t) { console.log(`\n══ ${t} ══`); }

(async () => {
    const env = fs.readFileSync(path.join(repo, '.env'), 'utf8');
    const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
    if (!uri) throw new Error('MONGO_URI not found in .env');
    const mongoose = require(path.join(repo, 'node_modules', 'mongoose'));
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[qa] mongoose connected');

    const Homestead = require(path.join(repo, 'core/models/Homestead'));
    const Base = require(path.join(repo, 'core/models/Base'));
    const economy = require(path.join(repo, 'core/rpg/economy'));
    const renderer = require(path.join(repo, 'core/rpg/homesteadRenderer'));
    const baseRenderer = require(path.join(repo, 'core/rpg/homesteadBaseRenderer'));
    const homestead = require(path.join(repo, 'core/rpg/homestead'));
    const baseBuilder = require(path.join(repo, 'core/rpg/baseBuilder'));

    const QA = '234000000001@s.whatsapp.net';
    const QA2 = '234000000002@s.whatsapp.net';
    await Homestead.deleteMany({ userId: { $in: [QA, QA2] } });
    await Base.deleteMany({ userId: { $in: [QA, QA2] } });
    if (!economy.isRegistered(QA)) economy.registerUser(QA, 'QA Builder');
    if (!economy.isRegistered(QA2)) economy.registerUser(QA2, 'QA Builder Two');

    // Task 44 guild charter gate: bases are claimed through a guild, so the QA
    // builder needs a banner before any base subcommand will answer (the gate
    // is intended product behavior — owner 2026-10-18).
    {
        const _guilds = require(path.join(repo, 'core/rpg/guilds'));
        if (!_guilds.getUserGuild(QA)) _guilds.createGuild('QA Banner', QA, 'ADVENTURER', null);
    }
    economy.addMoney(QA, 500000, 'QA seed');
    economy.addMoney(QA2, 500000, 'QA seed');

    // ── ctx mock ──
    let sent = [];
    let msgCounter = 0;
    function makeCtx(jid, text, extra = {}) {
        sent = [];
        return {
            sock: { sendMessage: async (c, msg) => { sent.push(msg); return { key: { id: 'x' } }; } },
            chatId: 'qa@g',
            senderJid: jid,
            m: { key: { id: `qa${++msgCounter}`, fromMe: false }, message: {} },
            reply: async (t) => { sent.push({ text: t }); return t; },
            text: String(text).toLowerCase(),
            rawText: String(text),
            prefix: '.j',
            isMod: true,
            ...extra,
        };
    }
    const lastText = () => { for (let i = sent.length - 1; i >= 0; i--) if (sent[i].text) return sent[i].text; return ''; };
    const lastMedia = () => { for (let i = sent.length - 1; i >= 0; i--) if (sent[i].image || sent[i].video) return sent[i]; return null; };
    // stage a homestead doc directly (deterministic layouts per section)
    async function stage(user, placed, owned) {
        await Homestead.updateOne(
            { userId: user },
            { $set: { theme: 'oakhaven', themesOwned: ['oakhaven'], placed, owned, comfort: 0, updatedAt: Date.now() } },
            { upsert: true },
        );
    }

    // ════════════════ §1 SHADOWS ════════════════
    section('1. SHADOWS — silhouette cast + contact AO');
    {
        // item with known empty floor to its lower-right: place a wardrobe at (2,2)
        const state = { owner: 'QA', theme: 'oakhaven', placed: [{ item: 'wardrobe', x: 2, y: 2 }, { item: 'bed_noble', x: 7, y: 2 }] };
        const frame = await renderer.renderFrame(state, 3, {});
        ok(frame && frame.length > 100000, `room frame renders (${(frame.length / 1024).toFixed(0)}KB)`);
        // sample the canvas: shadow region should be darker than the same offset
        // from an empty tile (use node-canvas to decode)
        const { loadImage, createCanvas } = require(path.join(repo, 'node_modules', 'canvas'));
        const im = await loadImage(frame);
        const cv = createCanvas(im.width, im.height);
        const c2 = cv.getContext('2d');
        c2.drawImage(im, 0, 0);
        // wardrobe anchor: footCenter(2.5,2.5) → screen; sample 40px along (0.894,0.447)*h below-right
        const OX = 450, OY = 190, TW = 64, TH = 32;
        const isoX = (x, y) => OX + (x - y) * (TW / 2);
        const isoY = (x, y) => OY + (x + y) * (TH / 2);
        const ax = isoX(2.5, 2.5);
        const ay = isoY(2.5, 2.5) + (1 + 1) * (TH / 4) - TH / 2 + 2;
        const sx = Math.round((ax + 0.894 * 78) * 2), sy = Math.round((ay + 0.447 * 78 - 20) * 2);
        // 8x8 box average — single-pixel probes land on plank lines since the
        // 2026-10 art merges (Task 41/43) and read as false no-shadow
        const boxLum = (img, x0, y0) => {
            let acc = 0, n = 0;
            for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
                const o = ((y0 + yy) * img.width + (x0 + xx)) * 4;
                acc += 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
                n++;
            }
            return acc / n;
        };
        const shadowPx = c2.getImageData(Math.max(0, sx - 4), Math.max(0, sy - 4), 8, 8);
        // empty-floor reference: tile (9,9) area at the same screen offset
        const ex = Math.round((isoX(9.5, 9.5) + 0.894 * 78) * 2), ey = Math.round((isoY(9.5, 9.5) + 0.447 * 78 - 20) * 2);
        const floorPx = c2.getImageData(Math.max(0, ex - 4), Math.max(0, ey - 4), 8, 8);
        const lum = (d) => 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
        const sAvg = boxLum(shadowPx, 0, 0), fAvg = boxLum(floorPx, 0, 0);
        ok(sAvg < fAvg - 4, `cast shadow darkens floor down-right of item (${sAvg.toFixed(0)} < ${fAvg.toFixed(0)})`);
        // contact AO: pixel just under the base line is darker than mid-floor
        const cxs = Math.round(ax * 2), cys = Math.round((ay - 2) * 2);
        const contactPx = c2.getImageData(cxs, cys, 1, 1).data;
        ok(lum(contactPx) < lum(floorPx.data), `contact AO present under base line (${lum(contactPx).toFixed(0)} < ${lum(floorPx.data).toFixed(0)})`);
    }

    // ════════════════ §2 COLLISION ════════════════
    section('2. COLLISION — no overlap, auto-relocate, safe rejections');
    {
        // deterministic layout: bed blocks (3,3)-(4,3), barrel at (6,6), 2 chair instances owned
        await stage(QA,
            [{ item: 'bed_noble', x: 3, y: 3, uid: 'a1' }, { item: 'barrel_oak', x: 6, y: 6, uid: 'a2' }],
            [{ id: 'chair_wood', uid: 'a3' }, { id: 'chair_wood', uid: 'a4' }]);
        // §2: place at blocked coords → auto-relocate, never rejected
        await homestead.handleCommand(makeCtx(QA, '.j home place chair_wood 3 3'));
        const after = await Homestead.findOne({ userId: QA }).lean();
        const chair = (after.placed || []).find((p) => p.item === 'chair_wood');
        ok(!!chair, 'placed despite blocked request (auto-relocate)');
        ok(chair && !(chair.x === 3 && chair.y === 3), `relocated off the blocked cell → (${chair.x},${chair.y})`);
        const cap = lastMedia()?.caption || '';
        ok(cap.includes('slid') || cap.includes('blocked'), 'feedback names the relocation');
        // §4: two same-id owned instances — placing pulled exactly ONE
        const stillOwned = (after.owned || []).filter((o) => o.id === 'chair_wood').length;
        ok(stillOwned === 1, `uid-precise pull: 1 of 2 chair instances consumed (${stillOwned} left)`);
    }

    // ════════════════ §3 MOVEMENT SYSTEM ════════════════
    section('3. MOVEMENT — select/move/moveto/rotate + grid preview');
    {
        // clean room: one chair at (5,5)
        await stage(QA, [{ item: 'chair_wood', x: 5, y: 5, uid: 'c1' }], []);
        await homestead.handleCommand(makeCtx(QA, '.j home select'));
        ok((lastMedia()?.caption || '').includes('Select mode is on'), 'no-argument select opens the simplified picker');
        await homestead.handleQuickInput(makeCtx(QA, '1'));
        ok(lastMedia() && (lastMedia().video || lastMedia().image), 'bare inventory number selects an item');
        ok((lastMedia()?.caption || '').includes('Selected'), 'bare selection previews and names the chosen item');
        // Plain replies work after selecting: right (+X), with no ".j home" prefix.
        await homestead.handleQuickInput(makeCtx(QA, 'right 2'));
        const after1 = await Homestead.findOne({ userId: QA }).lean();
        const c1 = after1.placed.find((p) => p.item === 'chair_wood');
        ok(c1.x === 7, `move right 2 → x 5→${c1.x}`);
        // blocked wall clamp: move right x12 → stops at 11 (or current)
        await homestead.handleCommand(makeCtx(QA, '.j home move right 99'));
        const after2 = await Homestead.findOne({ userId: QA }).lean();
        const c2 = after2.placed.find((p) => p.item === 'chair_wood');
        ok(c2.x === 11, `directional move clamps to grid bounds (x=${c2.x})`);
        // moveto with relocation
        await homestead.handleQuickInput(makeCtx(QA, '4 4'));
        const after3 = await Homestead.findOne({ userId: QA }).lean();
        const c3 = after3.placed.find((p) => p.item === 'chair_wood');
        ok(c3.x === 4 && c3.y === 4, `moveto lands (${c3.x},${c3.y})`);
        // rotate toggles f
        await homestead.handleQuickInput(makeCtx(QA, 'rotate'));
        const after4 = await Homestead.findOne({ userId: QA }).lean();
        const c4 = after4.placed.find((p) => p.item === 'chair_wood');
        ok(c4.f === true, 'rotate sets flip flag (f=true)');
        await homestead.handleCommand(makeCtx(QA, '.j home rotate'));
        const after5 = await Homestead.findOne({ userId: QA }).lean();
        ok(after5.placed.find((p) => p.item === 'chair_wood').f === false, 'rotate toggles back (f=false)');
        // store by selection
        await homestead.handleQuickInput(makeCtx(QA, 'store'));
        const after6 = await Homestead.findOne({ userId: QA }).lean();
        ok(!(after6.placed || []).some((p) => p.item === 'chair_wood'), 'store by selection removes from room');
        ok((after6.owned || []).some((o) => o.id === 'chair_wood' && o.uid), 'stored instance keeps its uid in storage');
    }

    // ════════════════ §4 ATOMIC PURCHASES ════════════════
    section('4. PURCHASES — dedupe, delivery, refund compensation');
    {
        const bal0 = economy.getBalance(QA);
        // buy
        await homestead.handleCommand(makeCtx(QA, '.j home buy pot_herbs'));
        const bal1 = economy.getBalance(QA);
        ok(bal1 === bal0 - 550, `buy debits exactly the price (${bal0 - bal1})`);
        let rec = await Homestead.findOne({ userId: QA }).lean();
        ok((rec.owned || []).some((o) => o.id === 'pot_herbs'), 'purchased item appears in storage immediately');
        // duplicate message id → no second charge (SAME id delivered twice)
        const fixedId = `dedupe-${Date.now()}`;
        const mkDup = () => makeCtx(QA, '.j home buy pot_herbs', { m: { key: { id: fixedId }, message: {} } });
        await homestead.handleCommand(mkDup()); // first delivery: charge + item
        const balAfterFirst = economy.getBalance(QA);
        await homestead.handleCommand(mkDup()); // redelivery: deduped
        const bal2 = economy.getBalance(QA);
        ok(bal2 === balAfterFirst, `retried message id does not double-charge (${bal2} === ${balAfterFirst})`);
        const rec2 = await Homestead.findOne({ userId: QA }).lean();
        const potCount = (rec2.owned || []).filter((o) => o.id === 'pot_herbs').length;
        const firstCount = potCount; // after the original buy + redelivered buy
        ok(potCount === 2, `exactly one extra instance from the redelivered id (${potCount} total: 1 + 1 real purchase, 0 dupes)`.replace('exactly one extra instance from the redelivered id (2 total: 1 + 1 real purchase, 0 dupes)', 'no duplicate item from retried message'));
        // insufficient funds
        const poorCtx = makeCtx(QA2, '.j home buy bed_royal');
        economy.removeMoney(QA2, economy.getBalance(QA2), 'QA drain');
        economy.addMoney(QA2, 100, 'QA crumbs');
        await homestead.handleCommand(poorCtx);
        if (!lastText().includes('Not enough ZENI')) console.log('    [debug] got:', lastText().slice(0, 120));
        ok(lastText().includes('Not enough ZENI'), 'insufficient funds rejected cleanly');
        // refund compensation: force the delivery write to fail
        const origUpdate = Homestead.updateOne.bind(Homestead);
        Homestead.updateOne = async () => { throw new Error('QA forced write failure'); };
        const bal3 = economy.getBalance(QA);
        await homestead.handleCommand(makeCtx(QA, '.j home buy chest_iron'));
        Homestead.updateOne = origUpdate;
        const bal4 = economy.getBalance(QA);
        ok(bal4 === bal3, `failed delivery refunds fully (${bal4} === ${bal3})`);
        ok(lastText().includes('refund') || lastText().includes('Nothing was lost'), 'refund feedback shown');
    }

    // ════════════════ §5 CATALOGUE ════════════════
    section('5. CATALOGUE — expanded set renders');
    {
        const cat = renderer.catalog();
        ok(cat.items.length >= 70, `catalogue expanded (${cat.items.length} items)`);
        const card = await renderer.renderCatalogPage(0, 7, { balance: 12345 });
        ok(card && card.length > 50000, `catalog card renders with new stock (${(card.length / 1024).toFixed(0)}KB)`);
    }

    // ════════════════ §6 BASE HUB ════════════════
    section('6. BASE HUB — outdoor map, house entry, routing');
    {
        await homestead.handleCommand(makeCtx(QA, '.j base'));
        const media = lastMedia();
        ok(media && (media.video || media.image), '.j base renders the OUTDOOR base map');
        ok(media && media.caption && media.caption.includes("Base"), 'map caption identifies the base');
        const brec = await baseBuilder.loadBase(QA);
        ok(brec.structures.length >= 4, `fresh base seeds 4 fixed structures (${brec.structures.length})`);
        ok(brec.structures[0].type === 'house' && brec.structures[0].level === 1, 'house is Structure #1, free at L1');
        ok(brec.structures.some((s) => s.type === 'mines') && brec.structures.some((s) => s.type === 'pond') && brec.structures.some((s) => s.type === 'hunting'), 'mines + pond + hunting grounds present');
        // house entry by structure id
        await homestead.handleCommand(makeCtx(QA, '.j base house 1'));
        const media2 = lastMedia();
        ok(media2 && (media2.video || media2.image), '.j base house 1 opens the house interior');
        // `.j house` alias
        await homestead.handleCommand(makeCtx(QA, '.j house'));
        ok(lastMedia() && (lastMedia().video || lastMedia().image), '.j house alias opens the interior');
        // structure info card for a non-house structure
        await homestead.handleCommand(makeCtx(QA, '.j base 2'));
        ok(lastText().toLowerCase().includes('structure'), 'structure #2 shows an info card');
        // non-house entry does NOT open the room
        ok(!(lastMedia() && lastMedia().caption && lastMedia().caption.includes('Homestead')), 'non-house entry does not open the room');
    }

    // ════════════════ §7 UPGRADES ════════════════
    section('7. UPGRADES — levels, costs, distinct sprites');
    {
        const b0 = await baseBuilder.loadBase(QA);
        const mines = b0.structures.find((s) => s.type === 'mines');
        const bal0 = economy.getBalance(QA);
        await homestead.handleCommand(makeCtx(QA, '.j base upgrade mines'));
        { const _m = lastMedia(); console.log('   [dbg] after upgrade: text=[' + String(lastText()).slice(0, 150) + '] media=' + (_m ? ((_m.caption || '').slice(0, 110) + ' / ' + (_m.video ? 'video' : 'image')) : 'none')); }
        const b1 = await Base.findOne({ userId: QA }).lean();
        const mines1 = b1.structures.find((s) => s.type === 'mines');
        ok(mines1.level === 2, `mines upgraded L1→L2 (${mines1.level})`);
        ok(economy.getBalance(QA) === bal0 - 6000, `upgrade debited the L2 price (${economy.getBalance(QA) - bal0})`);
        const def = baseRenderer.structDef('mines');
        ok(def.levels.find((l) => l.level === 2).sprite !== def.levels.find((l) => l.level === 1).sprite, 'L2 sprite differs from L1');
        // max level guard
        await homestead.handleCommand(makeCtx(QA, '.j baseadmin level 2 3'));
        await homestead.handleCommand(makeCtx(QA, '.j base upgrade 2'));
        ok(lastText().includes('fully upgraded') || lastText().includes('already'), 'max-level upgrade refused');
    }

    // ════════════════ §8 CONSTRUCTION ════════════════
    section('8. CONSTRUCTION — plots, overlap, atomic build');
    {
        const plots = baseBuilder.plotsFor(await baseBuilder.loadBase(QA));
        ok(plots.length === 4 && plots.every((p) => p.fw === 3 && p.fh === 3), `4 expansion plots defined (3x3 each)`);
        ok(plots.every((p) => p.free), 'all plots free on a fresh base');
        const bal0 = economy.getBalance(QA);
        await homestead.handleCommand(makeCtx(QA, '.j base build blacksmith 3'));
        { const _m = lastMedia(); console.log('   [dbg] after build: text=[' + String(lastText()).slice(0, 150) + '] media=' + (_m ? ((_m.caption || '').slice(0, 110) + ' / ' + (_m.video ? 'video' : 'image')) : 'none')); }
        const b1 = await Base.findOne({ userId: QA }).lean();
        const smithy = b1.structures.find((s) => s.type === 'blacksmith');
        ok(!!smithy, 'blacksmith built on plot #3');
        ok(!!smithy && smithy.x === 4 && smithy.y === 5, `built at plot #3 coordinates (${smithy ? smithy.x + ',' + smithy.y : 'none'})`);
        ok(economy.getBalance(QA) === bal0 - 12000, `build debited exactly L1 price (${bal0 - economy.getBalance(QA)})`);
        // duplicate build refused
        await homestead.handleCommand(makeCtx(QA, '.j base build blacksmith 2'));
        ok(lastText().includes('already own'), 'duplicate build refused (upgrade instead)');
        // occupied plot refused
        await homestead.handleCommand(makeCtx(QA, '.j base build medbay 3'));
        ok(lastText().includes('occupied'), 'occupied plot refused');
        // no-charge on refusal
        const bal1 = economy.getBalance(QA);
        ok(bal1 === bal0 - 12000, 'failed builds never charged');
        // render with the built structures
        const media = await baseRenderer.renderBaseImage({ owner: 'QA', structures: b1.structures, freePlots: baseBuilder.plotsFor(b1).filter((p) => p.free) }, {});
        ok(media && media.buffer.length > 100000, `base map renders with structures (${media.contentType}, ${(media.buffer.length / 1024).toFixed(0)}KB)`);
    }

    // ════════════════ §9 ADMIN ════════════════
    section('9. ADMIN — gated tools');
    {
        // non-mod blocked
        const ctxNonMod = makeCtx(QA2, '.j baseadmin inspect', { isMod: false });
        await homestead.handleCommand(ctxNonMod);
        ok(lastText().includes('moderators'), 'admin gate blocks non-mods');
        await homestead.handleCommand(makeCtx(QA, '.j baseadmin inspect'));
        ok(lastText().includes('BASE INSPECT'), 'inspect dumps structures');
        await homestead.handleCommand(makeCtx(QA, '.j baseadmin add medbay 2 13 2'));
        const b1 = await Base.findOne({ userId: QA }).lean();
        ok(b1.structures.some((s) => s.type === 'medbay' && s.level === 2), 'admin add places a structure at coordinates');
        await homestead.handleCommand(makeCtx(QA, '.j baseadmin remove 1'));
        ok(lastText().includes('cannot be removed'), 'house (Structure 1) is protected from removal');
        await homestead.handleCommand(makeCtx(QA, '.j baseadmin move 1 0 0'));
        ok(lastText().includes('designated'), 'fixed zones refuse admin moves (spec §6)');
        const b2 = await Base.findOne({ userId: QA }).lean();
        const smithy = b2.structures.find((s) => s.type === 'blacksmith');
        await homestead.handleCommand(makeCtx(QA, `.j baseadmin move ${b2.structures.indexOf(smithy) + 1} 11 10`));
        const b3 = await Base.findOne({ userId: QA }).lean();
        const smithy3 = b3.structures.find((s) => s.type === 'blacksmith');
        ok(!!smithy3 && smithy3.x === 11 && smithy3.y === 10, 'movable structure repositioned by admin');
        await homestead.handleCommand(makeCtx(QA, '.j baseadmin reset'));
        const b4 = await Base.findOne({ userId: QA }).lean();
        ok(b4.structures.length === 4 && b4.structures.every((s) => ['house', 'mines', 'pond', 'hunting'].includes(s.type)), 'reset restores the fresh layout');
    }

    // ════════════════ persistence across restart ════════════════
    section('PERSISTENCE — state survives a fresh require (restart sim)');
    {
        delete require.cache[require.resolve(path.join(repo, 'core/rpg/homestead'))];
        delete require.cache[require.resolve(path.join(repo, 'core/rpg/baseBuilder'))];
        const hom2 = require(path.join(repo, 'core/rpg/homestead'));
        await hom2.handleCommand(makeCtx(QA, '.j base info'));
        ok(lastText().includes('BASE LEDGER'), 'post-restart base ledger reads from DB');
        const b = await Base.findOne({ userId: QA }).lean();
        ok(b.structures.length >= 4, `structures persist (${b.structures.length})`);
    }

    // cleanup
    await Homestead.deleteMany({ userId: { $in: [QA, QA2] } });
    await Base.deleteMany({ userId: { $in: [QA, QA2] } });
    await mongoose.disconnect();

    console.log(`\n════════════════════════════════════`);
    console.log(`RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA crashed:', e); process.exit(1); });
