// Focused probe: one final-death fight; watch the war player doc evolve.
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const ROOT = '/home/z/my-project/repo';

async function connectDB() {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2];
    }
    const RUN_DB = `qa_gw_e2e_${Date.now().toString(36)}`;
    process.env.MONGO_URI = process.env.MONGO_URI.replace(/\/([a-z_0-9]+)\?/, `/${RUN_DB}?`);
    await require(path.join(ROOT, 'db'))();
    return require(path.join(ROOT, 'node_modules', 'mongoose'));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const mongoose = await connectDB();
    const goService = require(path.join(ROOT, 'core/utils/goImageService.js'));
    const _png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    goService.isHealthy = async () => true;
    goService.generateCombatImage = async () => _png;
    goService.generateCombatImageDirect = async () => _png;
    goService.generateAnimatedCombat = async () => _png;
    goService.generateCombatEndScreen = async () => _png;
    goService.generateHuntCard = async () => _png;
    for (const c of ['guildwarevents', 'guilds', 'systems', 'users', 'inventories']) {
        try { await mongoose.connection.db.collection(c).deleteMany({}); } catch (e) {}
    }
    const state = require(path.join(ROOT, 'core/rpg/guildWar/state.js'));
    const rooms = require(path.join(ROOT, 'core/rpg/guildWar/rooms.js'));
    const encounters = require(path.join(ROOT, 'core/rpg/guildWar/encounters.js'));
    const index = require(path.join(ROOT, 'core/rpg/guildWar/index.js'));
    const guilds = require(path.join(ROOT, 'core/rpg/guilds.js'));
    const guildAdventure = require(path.join(ROOT, 'core/rpg/guildAdventure.js'));
    const economy = require(path.join(ROOT, 'core/rpg/economy.js'));
    const engineMod = require(path.join(ROOT, 'core/engine.js'));
    engineMod.isBotOwner = () => true; engineMod.isGlobalMod = () => true; engineMod.isRpgMod = () => true;

    await guilds.loadGuilds();
    try { await guilds.createGuild('Alpha', 'u-alpha', 'ADVENTURER'); } catch (e) {}
    const P1 = 'probe@s.whatsapp.net';
    if (!economy.getUser(P1)) economy.registerUser(P1, 'Probe');
    const u = economy.getUser(P1);
    u.progression = { level: 1 };
    u.stats = { atk: 1, def: 0, mag: 0, spd: 1, maxHp: 30, hp: 30, maxEnergy: 10, energy: 10 };
    economy.saveUser(P1, u);

    const sock = { sent: [], async sendMessage(chatId, content) { this.sent.push({ chatId, text: String(content.text || content.caption || '') }); return { key: { id: 'm' } }; }, texts() { return this.sent.map((s) => s.text); } };
    const gcSock = { sent: [], async sendMessage(c, x) { this.sent.push(x); return { key: { id: 'g' } }; }, texts() { return this.sent.map((s) => String(s.text || s.caption || '')); } };
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'feed@g.us', initiatedBy: 'mod' });
    const EV = created.event.eventId;
    await state.registerPlayer(EV, { jid: P1, name: 'Probe', guildId: 'Alpha', guildName: 'Alpha' });
    await index.handleGroupCommand(gcSock, 'feed@g.us', 'mod@s.whatsapp.net', 'Mod', ['forcestart'], { prefix: '.j' });
    await wait(1500);

    // pre-drain lives to 1 via direct write (isolates the LAST death)
    await state.updatePlayer(EV, P1, {}, { lives: 1 });
    const evF = await state.getEvent(EV, { fresh: true });
    const me0 = evF.players.find((p) => p.jid === P1);
    console.log(`[pre] lives=${me0.lives} status=${me0.status} roomId=${me0.roomId} spawn=${me0.spawnRoomId}`);

    // seed a relic
    const room = evF.rooms.find((r) => ['discovery', 'reward', 'secret'].includes(r.type));
    if (room) { try { await encounters.awardRoomRelic(evF, me0, room); } catch (e) { console.log('[relic]', e.message); } }
    const evR = await state.getEvent(EV, { fresh: true });
    const meR = evR.players.find((p) => p.jid === P1);
    console.log(`[relic] carried=${JSON.stringify(meR.carriedRelics || meR.relics || []).slice(0, 80)}`);

    // fight to death
    const cRoom = evR.rooms.find((r) => ['combat', 'elite', 'cursed', 'bounty'].includes(r.type) && r.state !== 'CLEARED') || evR.rooms.find((r) => r.state !== 'CLEARED' && r.key !== meR.roomId);
    await rooms.enterRoom(EV, P1, meR.roomId, cRoom.key);
    await state.updatePlayer(EV, P1, {}, { roomId: cRoom.key, lastMoveAt: Date.now() - 10000, protectedUntil: 0 });
    const fresh = await state.getEvent(EV, { fresh: true });
    const me2 = fresh.players.find((p) => p.jid === P1);
    const room2 = fresh.rooms.find((r) => r.key === cRoom.key);
    const started = await encounters.startRoomCombat(sock, P1, me2, fresh, room2, {});
    console.log(`[fight] started=${started.success} in room ${cRoom.key}`);
    for (let i = 0; i < 40; i++) {
        const st = guildAdventure.getGameState(P1, P1);
        if (!st || !st.active || !st.inCombat) break;
        try { await guildAdventure.handleCombatAction(sock, P1, P1, 'attack', null); } catch (e) {}
        await wait(400);
    }
    console.log('[fight] session over — watching player doc for 6s:');
    for (let i = 0; i < 15; i++) {
        const ev = await state.getEvent(EV, { fresh: true });
        const me = ev.players.find((p) => p.jid === P1);
        console.log(`  t+${(i * 0.4).toFixed(1)}s lives=${me.lives} status=${me.status} roomId=${me.roomId} relics=${(me.carriedRelics || []).length}`);
        await wait(400);
    }
    await mongoose.connection.client.close().catch(() => {});
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
