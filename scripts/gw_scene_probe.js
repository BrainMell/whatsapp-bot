// Render room scenes for rooms with every exit combo → visual QA of door/arrow agreement
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
async function connectDB() {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2];
    }
    await require('../db')();
}
(async () => {
    await connectDB();
    const mongoose = require('mongoose');
    for (const c of ['guildwarevents', 'guilds', 'systems', 'users']) { try { await mongoose.connection.db.collection(c).deleteMany({}); } catch (e) {} }
    const state = require('../core/rpg/guildWar/state');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const roomScene = require('../core/rpg/guildWar/roomScene');
    const encounters = require('../core/rpg/guildWar/encounters');
    const guilds = require('../core/rpg/guilds');
    await guilds.loadGuilds();
    try { await guilds.createGuild('QAG', 'u-qag', 'ADVENTURER'); } catch (e) {}
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'qa@g.us', initiatedBy: 'x' });
    await state.registerPlayer(created.event.eventId, { jid: 'qa@s.whatsapp.net', name: 'QA', guildId: 'QAG', guildName: 'QAG' });
    await state.startEvent(created.event.eventId);
    const ev = await state.getEvent(created.event.eventId, { fresh: true });
    const me = ev.players[0];
    me.classId = 'APPRENTICE'; me.spriteIndex = 0;
    const topo = state.topologyOf(ev);

    const outDir = path.join(ROOT, 'tmp_gw_qa', 'exits');
    fs.mkdirSync(outDir, { recursive: true });

    // find rooms for each exit pattern (n/e/w combos), any type
    const wanted = ['0', 'F', 'FR', 'LF', 'LFR', 'LR', 'L_a', 'R'];
    const found = {};
    for (const room of ev.rooms) {
        const exits = ['n', 'e', 's', 'w'].map((dir) => ({ dir, edge: !!mapEngine.step(topo, room.key, dir) }));
        const key = roomScene.plateKeyFor(exits, `${ev.seed}:${room.key}`);
        if (wanted.includes(key) && !found[key]) found[key] = { room, exits };
        if (Object.keys(found).length === wanted.length) break;
    }
    for (const [plate, { room, exits }] of Object.entries(found)) {
        const fakeMe = { ...me, roomId: room.key };
        const buf = await roomScene.renderRoomScene(ev, fakeMe, room, { prefix: '.j' });
        fs.writeFileSync(path.join(outDir, `${plate.replace(/[^\w]/g, '')}_room_${room.type}_${room.key.replace(',', '_')}.png`), buf);
        console.log(`${plate}: room ${room.key} (${room.type}) exits=${exits.filter((e) => e.edge).map((e) => e.dir).join('/')}`);
    }
    const missing = wanted.filter((w) => !found[w]);
    if (missing.length) console.log('MISSING PLATES ON THIS MAP:', missing.join(', '));
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
