// ============================================
// 🪙 GW LOOT-DESPAWN QA (owner 2026-10-06)
// "the gold is supposed to despawn after you leave the room but that
//  'this room has been looted' should still be there when you or someone
//  else comes back — all consumable encounters, not puzzles"
//
//   T1 discovery/dig  : gold pile ONLY while the digger stays; on exit the
//                       despawn flag flips (atomic enterRoom pipeline) and
//                       every re-entry (looter or stranger) renders the pit
//   T2 reward/take    : cavity coins despawn on exit; open chest stays CLAIMED
//   T3 secret/claim   : idol despawns on exit; torn-out setting stays CLAIMED
//   T4 puzzle immune  : lootFresh never leaks into puzzle visuals
//   T5 plumbing       : occupant moves still work; non-looter exit keeps the
//                       flag; missing occupants array tolerated; no resurrection
// Run: node scripts/gw_loot_despawn_qa.js  (gwtest DB + mock socks)
// ============================================
process.env.GW_TEST = '1';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
const mockSock = () => ({
    sent: [],
    async sendMessage(chatId, content) {
        this.sent.push({ chatId, hasImage: !!content.image, text: (content.text || content.caption || '').slice(0, 90) });
    },
});

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
}

const GW = '/core/rpg/guildWar';
const state = require(`..${GW}/state`);
const rooms = require(`..${GW}/rooms`);
const roomScene = require(`..${GW}/roomScene`);
const dmRouter = require(`..${GW}/dmRouter`);

const playerOf = (doc, jid) => doc.players.find((p) => p.jid === jid);

async function freshEvent(tag) {
    await require('../core/models/GuildWarEvent').updateMany(
        { state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } },
        { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: `lootqa-${tag}@g.us`, initiatedBy: 'owner' });
    const jids = ['lp0@s.whatsapp.net', 'lp1@s.whatsapp.net'];
    for (const [i, jid] of jids.entries()) {
        await state.registerPlayer(created.event.eventId, {
            jid, name: `LP${i}`, guildId: `LootQA${i}`, guildName: `LootQA${i}`,
        });
    }
    const started = await state.startEvent(created.event.eventId);
    if (!started.ok) throw new Error('startEvent failed: ' + started.reason);
    return started.event;
}

// seat a player in a room without router cooldowns (direct seating, like rejoin does)
async function seat(eventId, jid, roomKey) {
    await state.updatePlayer(eventId, jid, {}, { roomId: roomKey, prevRoomId: roomKey, lastMoveAt: 0 });
    await rooms.enterRoom(eventId, jid, null, roomKey);
}

// retype an existing room (QA: topology seeds don't guarantee every type)
async function retype(eventId, roomKey, patch) {
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateOne(
        { eventId, rooms: { $elemMatch: { key: roomKey } } },
        { $set: { 'rooms.$.type': patch.type, ...(patch.payload ? { 'rooms.$.payload': patch.payload } : {}) } });
}

// pixel-diff two PNG buffers (decoded) — count pixels differing by >8 on any channel
async function pixelDiff(bufA, bufB) {
    const { createCanvas, loadImage } = require('canvas');
    const [a, b] = await Promise.all([loadImage(bufA), loadImage(bufB)]);
    if (a.width !== b.width || a.height !== b.height) return Infinity;
    const c = createCanvas(a.width, a.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(a, 0, 0);
    const da = ctx.getImageData(0, 0, a.width, a.height).data;
    const c2 = createCanvas(b.width, b.height);
    const ctx2 = c2.getContext('2d');
    ctx2.drawImage(b, 0, 0);
    const db = ctx2.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8 || Math.abs(da[i + 3] - db[i + 3]) > 8) n++;
    }
    return n;
}

async function renderFor(eventId, jid) {
    const doc = await state.getEvent(eventId, { fresh: true });
    const me = playerOf(doc, jid);
    const room = doc.rooms.find((r) => r.key === me.roomId);
    return { doc, me, room, img: await roomScene._renderInProcess(doc, me, room, { prefix: '.' }) };
}

const roomOf = async (eventId, roomKey) => {
    const doc = await state.getEvent(eventId, { fresh: true });
    return doc.rooms.find((r) => r.key === roomKey);
};

// one full consumable lifecycle (dig / take / claim share the machinery)
async function lifecycle(tag, kind, verb) {
    console.log(`\n── ${tag}: "${verb}" → spoils on presence, marker on return ──`);
    const ev = await freshEvent(tag);
    const [LOOTER, STRANGER] = ['lp0@s.whatsapp.net', 'lp1@s.whatsapp.net'];
    const target = ev.rooms.find((r) => !['core', 'finale'].includes(r.type) && r.key !== ev.rooms.find((q) => q.type === 'core')?.key);
    await retype(ev.eventId, target.key, { type: kind });

    await seat(ev.eventId, LOOTER, target.key);
    const sock = mockSock();
    const dm = (txt, jid) => dmRouter.handleDM(sock, jid, jid, txt, '\u200B', { prefix: '.', prefixed: true });

    // ── claim it ──
    const res = await dm(verb, LOOTER);
    check(`${tag}: "${verb}" handled with an afterImage`, !!res && res.handled !== false && sock.sent.some((s) => s.hasImage), JSON.stringify(res || {}).slice(0, 90));
    let room = await roomOf(ev.eventId, target.key);
    check(`${tag}: room CLEARED + clearedBy`, room.state === 'CLEARED' && room.clearedBy === LOOTER);
    check(`${tag}: lootFresh=true right after the claim (DB)`, room.lootFresh === true, `got ${room.lootFresh}`);

    const fresh = await renderFor(ev.eventId, LOOTER);
    check(`${tag}: fresh render (looter present) produced`, Buffer.isBuffer(fresh.img) && fresh.img.length > 1000);

    // 'look' while still in the room → spoils still render (lootFresh true in DB)
    const look = await dm('look', LOOTER);
    check(`${tag}: 'look' while present still works`, !!look);

    // ── walk away (the atomic enterRoom flip under test) ──
    const dest = ev.rooms.find((r) => r.key !== target.key);
    await rooms.enterRoom(ev.eventId, LOOTER, target.key, dest.key);
    room = await roomOf(ev.eventId, target.key);
    check(`${tag}: lootFresh flipped FALSE the moment the looter left`, room.lootFresh === false, `got ${room.lootFresh}`);
    check(`${tag}: looter pulled from old occupants`, !(room.occupants || []).includes(LOOTER));

    // ── the looter comes back → marker, NO resurrection ──
    await rooms.enterRoom(ev.eventId, LOOTER, dest.key, target.key);
    room = await roomOf(ev.eventId, target.key);
    check(`${tag}: re-entry does NOT resurrect the loot`, room.lootFresh === false, `got ${room.lootFresh}`);
    const back = await renderFor(ev.eventId, LOOTER);
    const diffLooted = await pixelDiff(fresh.img, back.img);
    // 1200 floor: the reward chest swap only changes the cavity (~2k px);
    // discovery/secret swap whole sprites and land far above it
    check(`${tag}: return render ≠ fresh render (sprite swapped)`, diffLooted > 1200, `diff=${diffLooted}`);

    // deterministic: re-render the same looted state → stable
    const back2 = await renderFor(ev.eventId, LOOTER);
    check(`${tag}: looted render is deterministic`, await pixelDiff(back.img, back2.img) < 500);

    // ── a stranger walks in → sees the marker too ──
    await seat(ev.eventId, STRANGER, target.key);
    const strangerView = await renderFor(ev.eventId, STRANGER);
    check(`${tag}: stranger's view renders`, Buffer.isBuffer(strangerView.img));
    room = await roomOf(ev.eventId, target.key);
    check(`${tag}: stranger's presence keeps lootFresh false`, room.lootFresh === false);

    // non-looter leaving must NOT touch the flag (it's already false → stays false)
    await rooms.enterRoom(ev.eventId, STRANGER, target.key, dest.key);
    room = await roomOf(ev.eventId, target.key);
    check(`${tag}: non-looter exit leaves the flag alone`, room.lootFresh === false);

    return { ev, target, LOOTER, STRANGER, dest };
}

(async () => {
    await connectDB();
    if (typeof roomScene.ensureFonts === 'function') await roomScene.ensureFonts();

    // ═══ T1 discovery ═══
    const t1 = await lifecycle('discovery', 'discovery', 'dig');

    // explicit pixel-proof trio for the dig site: ACTIVE rubble vs fresh coins vs looted pit
    {
        const { ev, target, LOOTER } = t1;
        const active = await roomOf(ev.eventId, target.key);
        // force a third state for the comparison: fresh-loot (looter present again, flag true)
        const GuildWarEvent = require('../core/models/GuildWarEvent');
        await GuildWarEvent.updateOne(
            { eventId: ev.eventId, rooms: { $elemMatch: { key: target.key } } },
            { $set: { 'rooms.$.lootFresh': true } });
        const freshAgain = await renderFor(ev.eventId, LOOTER);
        await GuildWarEvent.updateOne(
            { eventId: ev.eventId, rooms: { $elemMatch: { key: target.key } } },
            { $unset: { 'rooms.$.lootFresh': '' } });
        const marker = await renderFor(ev.eventId, LOOTER);
        check('discovery: fresh(lootFresh) vs marker(no flag) renders differ', await pixelDiff(freshAgain.img, marker.img) > 3000);
        check('discovery: lootFresh absent → marker (legacy rooms covered)', (await roomOf(ev.eventId, target.key)).lootFresh === undefined);
        void active;
    }

    // ═══ T2 reward ═══
    await lifecycle('reward', 'reward', 'take');

    // ═══ T3 secret ═══
    await lifecycle('secret', 'secret', 'claim');

    // ═══ T4 puzzle immunity ═══
    console.log('\n── puzzle: lootFresh must not leak into puzzle visuals ──');
    {
        const ev = await freshEvent('puzzle');
        const target = ev.rooms.find((r) => !['core', 'finale'].includes(r.type));
        await retype(ev.eventId, target.key, { type: 'puzzle' });
        const GuildWarEvent = require('../core/models/GuildWarEvent');
        await GuildWarEvent.updateOne(
            { eventId: ev.eventId, rooms: { $elemMatch: { key: target.key } } },
            { $set: { 'rooms.$.state': 'CLEARED', 'rooms.$.lootFresh': true, 'rooms.$.clearedBy': 'lp0@s.whatsapp.net' } });
        await seat(ev.eventId, 'lp0@s.whatsapp.net', target.key);
        const withFlag = await renderFor(ev.eventId, 'lp0@s.whatsapp.net');
        await GuildWarEvent.updateOne(
            { eventId: ev.eventId, rooms: { $elemMatch: { key: target.key } } },
            { $unset: { 'rooms.$.lootFresh': '' } });
        const noFlag = await renderFor(ev.eventId, 'lp0@s.whatsapp.net');
        check('puzzle: lootFresh true/false renders IDENTICAL (immune)', await pixelDiff(withFlag.img, noFlag.img) < 500);
    }

    // ═══ T5 plumbing ═══
    console.log('\n── plumbing: occupant moves, non-looter exits, missing occupants ──');
    {
        const ev = await freshEvent('plumbing');
        const [a, b] = ev.rooms.slice(0, 2);
        // occupant move still works
        await seat(ev.eventId, 'lp0@s.whatsapp.net', a.key);
        await rooms.enterRoom(ev.eventId, 'lp0@s.whatsapp.net', a.key, b.key);
        let ra = await roomOf(ev.eventId, a.key);
        let rb = await roomOf(ev.eventId, b.key);
        check('enterRoom: occupant pulled from A', !(ra.occupants || []).includes('lp0@s.whatsapp.net'));
        check('enterRoom: occupant pushed to B', (rb.occupants || []).includes('lp0@s.whatsapp.net'));
        // ACTIVE room keeps lootFresh undefined through moves
        check('enterRoom: ACTIVE room lootFresh untouched', ra.lootFresh === undefined && rb.lootFresh === undefined);
        // missing occupants array tolerated by leaveRoom
        const GuildWarEvent = require('../core/models/GuildWarEvent');
        await GuildWarEvent.updateOne(
            { eventId: ev.eventId, rooms: { $elemMatch: { key: b.key } } },
            { $unset: { 'rooms.$.occupants': '' } });
        let threw = null;
        try { await rooms.leaveRoom(ev.eventId, 'lp0@s.whatsapp.net', b.key); } catch (e) { threw = e; }
        check('leaveRoom: missing occupants array tolerated', !threw, threw && threw.message);
        rb = await roomOf(ev.eventId, b.key);
        check('leaveRoom: occupants materialized as []', Array.isArray(rb.occupants) && rb.occupants.length === 0, JSON.stringify(rb.occupants));
    }

    console.log(`\n════════ LOOT-DESPAWN QA: ${PASS} passed, ${FAIL} failed ════════`);
    await require('mongoose').disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch(async (e) => {
    console.error('[qa] fatal:', e);
    try { await require('mongoose').disconnect(); } catch (_) { /* noop */ }
    process.exit(1);
});
