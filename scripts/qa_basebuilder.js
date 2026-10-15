#!/usr/bin/env node
// 🏠 BASE BUILDER QA — renders + command flow (Task 42)
//   Layer 1: renders every scene kind to download/base_preview/ for eyeballing
//   Layer 2: BaseBuild model roundtrip (slots, persistence)
//   Layer 3: command flow with a mock sock against the TEST database
// Run: node scripts/qa_basebuilder.js
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/([^/?]+)(\?|$)/, '/gwtest$2');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
}

function mockSock() {
    const sends = [];
    return {
        sends,
        sendMessage: async (jid, content, opts) => {
            sends.push({ jid, content, opts });
            return { key: { id: 'mock' } };
        },
    };
}

const TEST_JID = 'bbqa@s.whatsapp.net';

(async () => {
    await connectDB();

    // ── register the tester in the in-memory economy ──
    const economy = require('../core/rpg/economy');
    economy.economyData.set(TEST_JID, {
        registered: true,
        nickname: 'QA Tester',
        profile: { whatsappName: 'QA Tester' },
        wallet: 1000, bank: 0,
    });

    // ══ LAYER 1: renders ══
    console.log('\n[render] composing all scenes…');
    const renderer = require('../core/rpg/baseBuilderRenderer');
    const outDir = process.env.BB_PREVIEW_DIR || '/home/z/my-project/download/base_preview';
    fs.mkdirSync(outDir, { recursive: true });

    const t0 = Date.now();
    await renderer.preloadAll();
    console.log(`[render] assets preloaded in ${Date.now() - t0}ms`);

    const renders = [];
    async function rend(name, fn) {
        const t = Date.now();
        const buf = await fn();
        const p = path.join(outDir, name);
        fs.writeFileSync(p, buf);
        renders.push({ name, buf, ms: Date.now() - t });
        check(`render ${name} (${buf.length} bytes, ${Date.now() - t}ms)`, buf.length > 20000);
    }

    await rend('world_map.jpg', () => renderer.worldMapBuffer(null));
    await rend('world_map_here.jpg', () => renderer.worldMapBuffer(0));
    await rend('zone0_willow.jpg', () => renderer.zoneBuffer(0));
    await rend('zone1_pinewood.jpg', () => renderer.zoneBuffer(1));
    await rend('zone2_dune.jpg', () => renderer.zoneBuffer(2));
    await rend('zone3_frost.jpg', () => renderer.zoneBuffer(3));
    await rend('zone8_town.jpg', () => renderer.zoneBuffer(8));
    await rend('room_empty.jpg', () => renderer.roomBuffer([], 'QA Tester'));
    await rend('room_furnished.jpg', () => renderer.roomBuffer([
        { slot: 25, item: 'furn_rug' },
        { slot: 17, item: 'furn_bed' },
        { slot: 24, item: 'furn_chest' },
        { slot: 33, item: 'furn_table' },
        { slot: 21, item: 'furn_shelf' },
        { slot: 5, item: 'furn_fireplace' },
        { slot: 15, item: 'furn_chair' },
        { slot: 9, item: 'furn_plant' },
        { slot: 41, item: 'furn_lamp' },
    ], 'QA Tester'));

    // cache hit must be fast
    const t1 = Date.now();
    await renderer.worldMapBuffer(null);
    const cachedMs = Date.now() - t1;
    check(`render cache hit < 50ms (${cachedMs}ms)`, cachedMs < 50);

    // homography sanity: cell centers must be inside the floor quad
    const H = renderer.roomHomography();
    const c1 = renderer.cellCenterImg(H, 0, 0);
    const c2 = renderer.cellCenterImg(H, 6, 6);
    const c3 = renderer.cellCenterImg(H, 3, 3);
    check('homography center ≈ floor centroid', Math.abs(c3.x - 500) < 60 && Math.abs(c3.y - 640) < 60,
        `got ${Math.round(c3.x)},${Math.round(c3.y)}`);
    check('homography corners spread', c1.x < c2.x && c1.y < 500 && c2.y > 600);

    // ══ LAYER 2: model roundtrip ══
    console.log('\n[model] BaseBuild roundtrip…');
    const BaseBuild = require('../core/models/BaseBuild');
    await BaseBuild.deleteMany({ userId: TEST_JID });
    const doc = await BaseBuild.getFor(TEST_JID);
    check('fresh doc: view=map, zone=null, empty', doc.view === 'map' && doc.zone === null && doc.placements.length === 0);
    doc.view = 'room'; doc.zone = 0;
    doc.placements.push({ slot: 25, item: 'furn_bed' }, { slot: 24, item: 'furn_rug' });
    await BaseBuild.safeSave(doc);
    const reloaded = await BaseBuild.getFor(TEST_JID);
    check('placements persist', reloaded.placements.length === 2 && reloaded.placements[0].slot === 25);
    // unique index on userId
    let dupRejected = false;
    try { await BaseBuild.create({ userId: TEST_JID }); } catch (e) { dupRejected = true; }
    check('duplicate userId rejected', dupRejected);

    // ══ LAYER 3: command flow ══
    console.log('\n[flow] command handler…');
    const bb = require('../core/rpg/baseBuilder');

    async function run(text, jid = TEST_JID) {
        const sock = mockSock();
        await bb.showBase(sock, jid, jid, text, { isMod: () => true });
        return sock.sends;
    }
    const lastOf = (sends, kind) => [...sends].reverse().find((s) => (kind === 'img' ? !!s.content.image : !s.content.image));
    const isImg = (s) => s && s.content && Buffer.isBuffer(s.content.image);

    // reset to clean state
    await run('reset');

    // 1. map
    let sends = await run('');
    check('.j base sends world map image', sends.length === 1 && isImg(sends[0]), JSON.stringify(sends.map(s => Object.keys(s.content))));

    // 2. goto by number
    sends = await run('goto 1');
    check('goto 1 → zone image + saved', sends.length === 1 && isImg(sends[0]));
    let d = await BaseBuild.getFor(TEST_JID);
    check('state: view=zone zone=0', d.view === 'zone' && d.zone === 0);

    // 3. enter far away must refuse
    sends = await run('goto 3');
    sends = await run('enter');
    check('enter in Frostvale refuses (text)', sends.length === 1 && !isImg(sends[0]) && /willow/i.test(sends[0].content.text));

    // 4. goto by fuzzy name then enter
    sends = await run('goto willow');
    check('goto willow → zone image', sends.length === 1 && isImg(sends[0]));
    sends = await run('enter');
    check('enter → room image', sends.length === 1 && isImg(sends[0]));
    d = await BaseBuild.getFor(TEST_JID);
    check('state: view=room', d.view === 'room');

    // 5. place without slot → auto slot
    sends = await run('place bed');
    check('place bed → room image re-render', sends.length === 1 && isImg(sends[0]));
    d = await BaseBuild.getFor(TEST_JID);
    check('bed placed (auto slot = 25 center)', d.placements.some((p) => p.item === 'furn_bed' && p.slot === 25),
        JSON.stringify(d.placements));

    // 6. place with explicit slot
    sends = await run('place rug 10');
    d = await BaseBuild.getFor(TEST_JID);
    check('rug placed at slot 10 (flat under furniture)', d.placements.some((p) => p.item === 'furn_rug' && p.slot === 10));

    // 7. occupied slot refuses
    sends = await run('place chair 10');
    check('occupied slot refuses', sends.length === 1 && !isImg(sends[0]) && /already/i.test(sends[0].content.text));

    // 8. unknown item lists catalog
    sends = await run('place spaceship');
    check('unknown item refuses with catalog', !isImg(sends[0]) && /known pieces/i.test(sends[0].content.text));

    // 8b. wall-row slot (back row) refuses
    sends = await run('place chair 3');
    check('wall-row slot 3 refuses', !isImg(sends[0]) && /8/i.test(sends[0].content.text));

    // 9. remove by slot
    sends = await run('remove 10');
    d = await BaseBuild.getFor(TEST_JID);
    check('remove slot 10', !d.placements.some((p) => p.slot === 10) && isImg(sends[0]));

    // 10. remove by item name
    sends = await run('remove bed');
    d = await BaseBuild.getFor(TEST_JID);
    check('remove bed by name', !d.placements.some((p) => p.item === 'furn_bed'));

    // 11. exit → back to zone 0
    sends = await run('exit');
    d = await BaseBuild.getFor(TEST_JID);
    check('exit → zone 0 outside', d.view === 'zone' && d.zone === 0 && isImg(sends[0]));

    // 12. items catalog is text
    sends = await run('items');
    check('items → text catalog', !isImg(sends[0]) && /bed/i.test(sends[0].content.text));

    // 13. zone list on bad goto
    sends = await run('goto nowhereland');
    check('bad goto → zone list', !isImg(sends[0]) && /mirefen/i.test(sends[0].content.text));

    // 14. unregistered user refused
    const stranger = 'bbqa_stranger@s.whatsapp.net';
    sends = await run('', stranger);
    check('unregistered refused', sends.length === 1 && /register/i.test(sends[0].content.text));

    // 15. help
    sends = await run('help');
    check('help text', !isImg(sends[0]) && /homestead/i.test(sends[0].content.text));

    // cleanup qa docs
    await BaseBuild.deleteMany({ userId: { $in: [TEST_JID, 'bbqa_stranger@s.whatsapp.net'] } });

    console.log(`\n════════ BASE BUILDER QA: ${PASS} passed, ${FAIL} failed ════════`);
    console.log(`[render] previews written to ${outDir}`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => {
    console.error('QA fatal:', e);
    process.exit(1);
});
