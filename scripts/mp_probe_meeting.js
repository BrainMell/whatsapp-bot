// PROBE: why doesn't the late entrant's scene show the waiting player?
const L = require('./mp_lib');
const fs = require('fs');
const RUN = Math.random().toString(36).slice(2, 6);

(async () => {
    await L.connectDB();
    L.overlaySprites();
    const state = require('../core/rpg/guildWar/state');
    const GWE = require('../core/models/GuildWarEvent');

    const roster = L.makeRoster([
        { jid: 'pa' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 },
        { jid: 'pb' + RUN, name: 'Brutus', guild: 'Bravo', class: 'BERSERKER', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);

    // force both into the same room via direct state writes (unit-level probe)
    const doc0 = await state.getEvent(ev.eventId, { fresh: true });
    const a = doc0.players.find(p => p.jid === roster[0].jid);
    const meet = a.roomId; // A's spawn is the meeting room
    // B teleports in (spawn-safe: empty room)
    await state.updatePlayer(ev.eventId, roster[1].jid, {}, { roomId: meet, prevRoomId: meet, lastMoveAt: 0 });
    await GWE.updateOne({ eventId: ev.eventId, 'rooms.key': meet }, { $set: { 'rooms.$.type': 'empty' } });
    // mirror rooms.enterRoom occupants update (what a real move would do)
    const rooms = require('../core/rpg/guildWar/rooms');
    await rooms.enterRoom(ev.eventId, roster[1].jid, roster[1].spawnRoomId || roster[1].roomId, meet);

    const doc1 = await state.getEvent(ev.eventId, { fresh: true });
    const room = doc1.rooms.find(r => r.key === meet);
    console.log('DB occupants of', meet, ':', JSON.stringify(room.occupants));

    const ctx = await state.getMoveContext(ev.eventId, meet);
    console.log('ctx.room.occupants:', JSON.stringify(ctx.room.occupants));
    console.log('ctx.players:', JSON.stringify(ctx.players.map(p => ({ jid: p.jid.slice(0, 12), name: p.name, guildId: p.guildId, roomId: p.roomId }))));

    // A "moves" in (already in room: emulate late arrival by re-entering)
    const sock = L.makeSock('A');
    const roomsLib = rooms;
    await roomsLib.enterRoom(ev.eventId, roster[0].jid, roster[0].prevRoomId, meet);
    const me = { ...doc1.players.find(p => p.jid === roster[0].jid), prevRoomId: roster[0].prevRoomId };
    const ctx2 = await state.getMoveContext(ev.eventId, meet);
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    await dmRouter.presentRoom(sock, roster[0].jid, '\u200B', ctx2, me, ctx2.room, { prefix: '.j' });
    console.log('--- A received:');
    for (const s of sock.sent) {
        const p = s.payload || {};
        console.log(p.image ? '[IMG]' : '[txt]', (p.caption || p.text || '').replace(/\n+/g, ' ⏎ ').slice(0, 200));
        if (p.image) fs.writeFileSync('/home/z/my-project/download/mp_playtest/smoke/probe_scene.png', p.image);
    }
    await state.abortEvent(ev.eventId, 'probe done');
    L.restoreSprites();
    await require('mongoose').disconnect();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
