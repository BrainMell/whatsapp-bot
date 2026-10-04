// 🎨 GUILD WAR VISUAL QA — renders REAL room scenes for vision inspection.
// Spec §12/§22: do not assume renders are correct — LOOK at them.
// Matrix: every room type × every Ruins variant × every exit-plate ×
// meeting scene × cleared wash. Pure node-canvas (no Go service needed).
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const ROOT = '/home/z/my-project/repo';
const OUT = '/home/z/my-project/envwork/visual_qa';

async function connectDB() {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2];
    }
    const RUN_DB = `qa_gw_e2e_${Date.now().toString(36)}`;
    process.env.MONGO_URI = process.env.MONGO_URI.replace(/\/([a-z_0-9]+)\?/, `/${RUN_DB}?`);
    await require(path.join(ROOT, 'db'))();
    const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));
    console.log(`[vqa] db: ${mongoose.connection.name}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    await connectDB();
    fs.mkdirSync(OUT, { recursive: true });
    const engineMod = require(path.join(ROOT, 'core/engine.js'));
    engineMod.isBotOwner = () => true;
    engineMod.isGlobalMod = () => true;
    engineMod.isRpgMod = () => true;
    const state = require(path.join(ROOT, 'core/rpg/guildWar/state'));
    const index = require(path.join(ROOT, 'core/rpg/guildWar/index'));
    const roomScene = require(path.join(ROOT, 'core/rpg/guildWar/roomScene'));
    const mapEngine = require(path.join(ROOT, 'core/rpg/guildWar/mapEngine'));

    const P1 = 'vqa1@s.whatsapp.net', P2 = 'vqa2@s.whatsapp.net', P3 = 'vqa3@s.whatsapp.net';
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'feed@g.us', initiatedBy: 'mod' });
    const EV = created.event.eventId;
    await state.registerPlayer(EV, { jid: P1, name: 'Alice', guildId: 'Alpha', guildName: 'Alpha' });
    await state.registerPlayer(EV, { jid: P2, name: 'Bob', guildId: 'Alpha', guildName: 'Alpha' });
    await state.registerPlayer(EV, { jid: P3, name: 'Carla', guildId: 'Bravo', guildName: 'Bravo' });
    const gcSock = { sent: [], async sendMessage(c, x) { this.sent.push(x); return { key: { id: 'm' } }; } };
    await index.handleGroupCommand(gcSock, 'feed@g.us', 'mod@s.whatsapp.net', 'Mod', ['forcestart'], { prefix: '.j' });
    await wait(2500); // let the deployment wave finish

    const evFresh = async () => await state.getEvent(EV, { fresh: true });
    let ev = await evFresh();
    const me = () => ev.players.find((p) => p.jid === P1);
    const roomOf = (key) => ev.rooms.find((r) => r.key === key);

    const shots = [];
    async function snap(tag, evDoc, player, room, opts = {}) {
        try {
            if (!evDoc || !player || !room) throw new Error(`missing args: ev=${!!evDoc} p=${!!player} room=${!!room}`);
            const buf = await roomScene.renderRoomScene(evDoc, player, room, opts);
            const f = path.join(OUT, `${tag}.png`);
            fs.writeFileSync(f, buf);
            shots.push(tag);
            console.log(`[vqa] ✓ ${tag} (${Math.round(buf.length / 1024)}KB)`);
        } catch (e) {
            console.log(`[vqa] ✗ ${tag}: ${e.message}`);
        }
    }
    const safeTag = (parts) => parts.map((x) => String(x == null ? 'undef' : x).replace(/[^a-zA-Z0-9_-]/g, '')).join('_');

    console.log(`[vqa] rooms=${ev.rooms.length} players=${ev.players.length} spawn=${me() && me().roomId}`);
    if (!ev.rooms.length) { console.log('[vqa] FATAL: war never started'); process.exit(2); }

    // ── 1. spawn room, as deployed (auto-present view) ──
    await snap('01_spawn_as_deployed', ev, me(), roomOf(me().roomId));

    // ── 2. every room TYPE (real payload content) ──
    const seenTypes = new Set();
    for (const r of ev.rooms) {
        if (seenTypes.has(r.type)) continue;
        seenTypes.add(r.type);
        await snap(safeTag(['02_type', r.type, r.key]), ev, me(), r);
    }

    // ── 3. every VARIANT (forced on a quiet plain room) ──
    const quiet = ev.rooms.find((r) => r.type === 'plain' && r.state === 'UNEXPLORED' && !(r.payload && r.payload.size)) || ev.rooms[3];
    for (const v of roomScene.ROOM_VARIANTS) {
        const r = { ...quiet, variant: v };
        await snap(`03_variant_${v}`, ev, me(), r);
    }

    // ── 4. every EXIT-PLATE combo (backgrounds must match exits) ──
    const seenPlates = new Map();
    for (const p of ev.players) {
        const exits = roomScene.exitsFor(ev, p);
        const key = roomScene.plateKeyFor(exits, `${ev.seed}:${p.roomId}`);
        if (seenPlates.has(key)) continue;
        seenPlates.set(key, p.roomId);
        const r = roomOf(p.roomId);
        const pl = ev.players.find((x) => x.jid === p.jid);
        await snap(safeTag(['04_plate', key]), ev, pl, r);
    }
    // left-only seeded pair (L_a/L_b) — distinct seeds so the hash picks BOTH
    const fakeEvL = JSON.parse(JSON.stringify({ ...ev }));
    for (const sub of ['a', 'b']) {
        fakeEvL.seed = ev.seed + sub;
        const p = me();
        const exits = [{ dir: 'w', edge: true }];
        const r = roomOf(p.roomId);
        if (!r) continue;
        const plan = roomScene.planFor(fakeEvL, p, r, exits);
        try {
            const buf = await roomScene._renderInProcess(fakeEvL, p, { ...r }, { exits, plan });
            fs.writeFileSync(path.join(OUT, `04_plate_L_${sub}.png`), buf);
            shots.push(`04_plate_L_${sub}`);
            console.log(`[vqa] ✓ 04_plate_L_${sub}`);
        } catch (e) { console.log(`[vqa] ✗ L_${sub}: ${e.message}`); }
    }

    // ── 5. MEETING scene: guildmate + rival in the room (§16) ──
    const rooms = require(path.join(ROOT, 'core/rpg/guildWar/rooms'));
    const meM = me();
    await rooms.enterRoom(EV, P2, meM.roomId, meM.roomId);
    await rooms.enterRoom(EV, P3, meM.roomId, meM.roomId);
    ev = await evFresh();
    const roomM = roomOf(me().roomId);
    const occ = [...(roomM.occupants || []), P2, P3];
    await snap('05_meeting_mate_and_rival', ev, me(), { ...roomM, occupants: occ });

    // ── 6. CLEARED wash ──
    const rC = { ...roomOf(me().roomId), state: 'CLEARED', clearedBy: 'Alice', clearedByGuild: 'Alpha' };
    await snap('06_cleared_room', ev, me(), rC);

    // ── 7. combat room with seeded pack (monster standing in the room, §12) ──
    const rCombat = ev.rooms.find((r) => r.type === 'combat' && r.state !== 'CLEARED');
    if (rCombat) await snap('07_combat_pack_visible', ev, me(), rCombat);

    console.log(`\n[vqa] DONE — ${shots.length} renders in ${OUT}`);
    process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
