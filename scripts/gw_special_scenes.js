// Render special scenes for visual QA: puzzle room WITH board overlay, core boss, secret boss
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
    const encounters = require('../core/rpg/guildWar/encounters');
    const puzzleCards = require('../core/rpg/guildWar/puzzleCards');
    const CFG = require('../core/rpg/guildWar/config');
    const roomScene = require('../core/rpg/guildWar/roomScene');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const guilds = require('../core/rpg/guilds');
    await guilds.loadGuilds();
    try { await guilds.createGuild('QAG', 'u-qag', 'ADVENTURER'); } catch (e) {}
    const economy = require('../core/rpg/economy');
    if (!economy.getUser('qa@s.whatsapp.net')) economy.registerUser('qa@s.whatsapp.net', 'QA');
    const u = economy.getUser('qa@s.whatsapp.net'); u.level = 24; u.class = 'WARRIOR'; u.spriteIndex = 0; economy.saveUser('qa@s.whatsapp.net');

    const created = await state.createEvent({ type: 'normal', hostGroupId: 'qa@g.us', initiatedBy: 'x' });
    await state.registerPlayer(created.event.eventId, { jid: 'qa@s.whatsapp.net', name: 'QA', guildId: 'QAG', guildName: 'QAG' });
    await state.startEvent(created.event.eventId);
    const ev = await state.getEvent(created.event.eventId, { fresh: true });
    const me = ev.players[0];

    const outDir = path.join(ROOT, 'tmp_gw_qa', 'special');
    fs.mkdirSync(outDir, { recursive: true });

    // 1) puzzle room WITH the board overlay riding the scene
    const pzRoom = ev.rooms.find((r) => r.type === 'puzzle');
    if (pzRoom) {
        await require('../core/rpg/guildWar/rooms').markActive(ev.eventId, pzRoom.key);
        const pz = encounters.payloadGet(pzRoom.payload, 'puzzle');
        const board = await puzzleCards.renderPuzzleCard({
            kind: pz.kind, prompt: pz.prompt, attemptsUsed: 1, attemptsMax: CFG.PUZZLE.ATTEMPTS,
            world: 'the ash gardens', ring: 3,
        });
        const buf = await roomScene.renderRoomScene(ev, { ...me, roomId: pzRoom.key }, pzRoom, { prefix: '.j', puzzleBoard: board });
        fs.writeFileSync(path.join(outDir, 'puzzle_overlay.png'), buf);
        console.log('puzzle overlay rendered');
    }
    // 2) World Core boss scene
    const coreRoom = ev.rooms.find((r) => r.type === 'core');
    if (coreRoom) {
        await require('../core/rpg/guildWar/rooms').markActive(ev.eventId, coreRoom.key);
        const buf = await roomScene.renderRoomScene(ev, { ...me, roomId: coreRoom.key }, coreRoom, { prefix: '.j' });
        fs.writeFileSync(path.join(outDir, 'core_boss.png'), buf);
        console.log('core boss rendered');
    }
    // 3) secret boss
    const secretRoom = ev.rooms.find((r) => r.type === 'secret' && encounters.payloadGet(r.payload, 'boss'));
    if (secretRoom) {
        await require('../core/rpg/guildWar/rooms').markActive(ev.eventId, secretRoom.key);
        const buf = await roomScene.renderRoomScene(ev, { ...me, roomId: secretRoom.key }, secretRoom, { prefix: '.j' });
        fs.writeFileSync(path.join(outDir, 'secret_boss.png'), buf);
        console.log('secret boss rendered');
    } else console.log('no secret-boss room on this map');
    // 4) landmark
    const lmRoom = ev.rooms.find((r) => r.type === 'landmark');
    if (lmRoom) {
        const buf = await roomScene.renderRoomScene(ev, { ...me, roomId: lmRoom.key }, lmRoom, { prefix: '.j' });
        fs.writeFileSync(path.join(outDir, 'landmark.png'), buf);
        console.log('landmark rendered');
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
