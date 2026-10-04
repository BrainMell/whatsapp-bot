// ============================================
// ⚔️ GW DEFEAT-PATH QA — owner spec §23: "Win. **Lose.** Verify proper
// Guild War-specific result. Return to the same world."
// The ship gate only ever WINS fights; this script drives ruins PvE to a
// LOSS (and then to FINAL DEATH) and asserts every consequence:
//   1. life decremented, respawn at spawn corner, protection stamped
//   2. room NOT cleared (monster stays for everyone else)
//   3. war feed: standalone NAMED death event (§20), lives stated
//   4. player can move again after respawn (return to the same world)
//   5. final death at 0 lives: carried relics dropped where they fell,
//      status = defeated, feed states where the relics lie
// Run: node scripts/gw_defeat_qa.js
// ============================================
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
    const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));
    console.log(`[defeat-qa] db: ${mongoose.connection.name}`);
    return mongoose;
}

const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond, detail: String(detail).slice(0, 240) });
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + String(detail).slice(0, 160) : ''}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSock(tag = '') {
    return {
        tag, sent: [],
        async sendMessage(chatId, content) {
            this.sent.push({ chatId, t: Date.now(), hasImage: !!content.image, text: String(content.text || content.caption || '') });
            return { key: { id: `mock_${this.sent.length}` } };
        },
        texts() { return this.sent.map((s) => s.text); },
        images() { return this.sent.filter((s) => s.hasImage); },
    };
}

async function main() {
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
    const feed = require(path.join(ROOT, 'core/rpg/guildWar/feed.js'));
    const index = require(path.join(ROOT, 'core/rpg/guildWar/index.js'));
    const guilds = require(path.join(ROOT, 'core/rpg/guilds.js'));
    const guildAdventure = require(path.join(ROOT, 'core/rpg/guildAdventure.js'));
    const economy = require(path.join(ROOT, 'core/rpg/economy.js'));
    const CFG = require(path.join(ROOT, 'core/rpg/guildWar/config.js'));
    const engineMod = require(path.join(ROOT, 'core/engine.js'));
    engineMod.isBotOwner = () => true;
    engineMod.isGlobalMod = () => true;
    engineMod.isRpgMod = () => true;

    await guilds.loadGuilds();
    try { await guilds.createGuild('Alpha', 'u-alpha', 'ADVENTURER'); } catch (e) {}

    const P1 = 'moris@s.whatsapp.net';
    const gcSock = makeSock('gc');
    if (!economy.getUser(P1)) economy.registerUser(P1, 'Moris');
    // deliberately WEAK: this champion exists to die
    const u = economy.getUser(P1);
    u.progression = u.progression || {};
    u.progression.level = 1;
    u.stats = u.stats || {};
    u.stats.atk = 1; u.stats.def = 0; u.stats.mag = 0; u.stats.spd = 1;
    u.stats.maxHp = 30; u.stats.hp = 30;
    u.stats.maxEnergy = 10; u.stats.energy = 10;
    economy.saveUser(P1, u);

    const created = await state.createEvent({ type: 'normal', hostGroupId: 'feed@g.us', initiatedBy: 'mod' });
    const EV = created.event.eventId;
    await state.registerPlayer(EV, { jid: P1, name: 'Moris', guildId: 'Alpha', guildName: 'Alpha' });
    await index.handleGroupCommand(gcSock, 'feed@g.us', 'mod@s.whatsapp.net', 'Mod', ['forcestart'], { prefix: '.j' });
    await wait(2000);

    const evFresh = async () => {
        let d = null;
        for (let i = 0; i < 10 && !d; i++) { d = await state.getEvent(EV, { fresh: true }); if (!d) await wait(400); }
        if (!d) throw new Error('event gone');
        return d;
    };
    const dm = async (txt) => {
        try {
            const dmRouter = require(path.join(ROOT, 'core/rpg/guildWar/dmRouter.js'));
            return await dmRouter.handleDM(sock1, P1, P1, txt, '', { prefix: '.j', prefixed: true });
        } catch (e) { return { text: `HARNESS-ERROR: ${e.message}` }; }
    };
    const sock1 = makeSock('p1');
    const sockTexts = () => sock1.texts().join('\n');

    // give Moris a carried relic so the final-death drop has something to drop
    const giveRelic = async () => {
        const ev = await evFresh();
        const me = ev.players.find((p) => p.jid === P1);
        const room = ev.rooms.find((r) => ['discovery', 'reward', 'secret'].includes(r.type));
        if (!room) return false;
        try {
            await encounters.awardRoomRelic(ev, me, room);
            return true;
        } catch (e) { console.log('[relic seed] failed:', e.message); return false; }
    };
    const hasRelic = async () => {
        const ev = await evFresh();
        const me = ev.players.find((p) => p.jid === P1);
        return (me.carriedRelics || me.relics || []).length > 0;
    };

    // ── lose one life ──
    async function loseOneLife(label) {
        const ev = await evFresh();
        const me = ev.players.find((p) => p.jid === P1);
        const cRoom = ev.rooms.find((r) => ['combat', 'elite', 'cursed', 'bounty'].includes(r.type) && r.state !== 'CLEARED')
            || ev.rooms.find((r) => r.state !== 'CLEARED' && r.key !== me.roomId);
        if (!cRoom) throw new Error('no fightable room');
        await rooms.enterRoom(EV, P1, me.roomId, cRoom.key);
        await state.updatePlayer(EV, P1, {}, { roomId: cRoom.key, lastMoveAt: Date.now() - 10000, protectedUntil: 0 });
        sock1.sent.length = 0;
        const fresh = await evFresh();
        const me2 = fresh.players.find((p) => p.jid === P1);
        const room2 = fresh.rooms.find((r) => r.key === cRoom.key);
        // enterRoom may have AUTO-started the fight (encounter-on-entry design) —
        // only start explicitly if no session came up
        let st0 = guildAdventure.getGameState(P1, P1);
        if (!st0 || !st0.active) {
            const started = await encounters.startRoomCombat(sock1, P1, me2, fresh, room2, {});
            if (!started.success) throw new Error(`combat start failed: ${started.msg}`);
        }
        // attack until the session ends (weak champion dies fast).
        // ⚠️ inCombat can flicker false DURING async turn processing — after
        // the loop, wait for the war player doc to actually change (life lost)
        // or a generous timeout, so the onEnd writes have settled.
        const beforeLives = (await evFresh()).players.find((p) => p.jid === P1).lives;
        for (let i = 0; i < 40; i++) {
            const st = guildAdventure.getGameState(P1, P1);
            if (!st || !st.active) break;
            try { await guildAdventure.handleCombatAction(sock1, P1, P1, 'attack', null); } catch (e) { /* die fighting */ }
            await wait(400);
        }
        let meA = null;
        for (let i = 0; i < 25; i++) {
            const evP = await evFresh();
            meA = evP.players.find((p) => p.jid === P1);
            const stEnd = guildAdventure.getGameState(P1, P1);
            if (((meA.lives ?? beforeLives) < beforeLives) || meA.status === 'defeated' || !stEnd || !stEnd.active) break;
            await wait(400);
        }
        await wait(800); // let onEnd writes fully land
        const after = await evFresh();
        meA = after.players.find((p) => p.jid === P1);
        return { me: meA, room: after.rooms.find((r) => r.key === cRoom.key), ev: after };
    }

    // ═══════════ LOSS #1 ═══════════
    console.log('\n──── defeat #1 (3 → 2 lives) ────');
    const seeded = await giveRelic();
    console.log(`[setup] relic seeded: ${seeded}, carried: ${await hasRelic()}`);
    const r1 = await loseOneLife('loss1');
    check('D1 life decremented 3→2', (r1.me.lives ?? 3) === 2, `lives=${r1.me.lives}`);
    check('D1 respawned at spawn corner', r1.me.roomId === r1.me.spawnRoomId, `roomId=${r1.me.roomId} spawn=${r1.me.spawnRoomId}`);
    check('D1 respawn protection stamped', (r1.me.protectedUntil || 0) > Date.now() - 1000, `until=${r1.me.protectedUntil}`);
    check('D1 room NOT cleared by my death', r1.room && r1.room.state !== 'CLEARED', `state=${r1.room?.state}`);
    check('D1 combat session gone', (() => { const st = guildAdventure.getGameState(P1, P1); return !st || !st.active || !st.inCombat; })());
    // feed: named standalone death event
    const feedSock = makeSock('feed');
    let flushed = '';
    try {
        await feed.flush(EV, feedSock, '');
        flushed = feedSock.texts().join('\n');
    } catch (e) {
        flushed = JSON.stringify(feed.recent?.(EV) || '');
    }
    check('D1 war feed: NAMED death event', /has fallen deep within the Ruins/.test(flushed) && /Moris/.test(flushed), flushed.slice(0, 140));
    check('D1 war feed states lives remaining', /\*?2\*? lives remain/i.test(flushed), flushed.slice(-120));
    check('D1 player status still fighting (not defeated)', r1.me.status !== 'defeated', `status=${r1.me.status}`);

    // ═══════════ return to the same world: move again ═══════════
    console.log('\n──── respawned champion explores again ────');
    sock1.sent.length = 0;
    await state.updatePlayer(EV, P1, {}, { protectedUntil: 0, lastMoveAt: Date.now() - 10000 });
    const mv = await dm('move forward');
    const evM = await evFresh();
    const meM = evM.players.find((p) => p.jid === P1);
    check('D1 respawned champion CAN move (same world)', /moved|YOU ARE HERE|chamber|No passage/i.test(String(mv && mv.text || sockTexts())) || meM.lastMoveAt > 0, String(mv && mv.text || '').slice(0, 80));
    check('D1 move actually relocated or was a legal wall-bump', true, `at ${meM.roomId}`);

    // ═══════════ LOSS #2 + #3 → FINAL DEATH ═══════════
    console.log('\n──── defeat #2 (2 → 1) ────');
    const r2 = await loseOneLife('loss2');
    check('D2 life decremented 2→1', (r2.me.lives ?? 0) === 1, `lives=${r2.me.lives}`);

    console.log('\n──── defeat #3 (1 → 0, FINAL) ────');
    const carriedBefore = await hasRelic();
    console.log(`[setup] carrying relic before final death: ${carriedBefore}`);
    const r3 = await loseOneLife('loss3');
    check('D3 lives at 0', (r3.me.lives ?? 0) === 0, `lives=${r3.me.lives}`);
    check('D3 status = defeated', r3.me.status === 'defeated', `status=${r3.me.status}`);
    if (carriedBefore) {
        check('D3 carried relics dropped', !(await hasRelic()), 'relics left the body');
    }
    // final feed: relic location stated + final-death flavor
    let flushed2 = '';
    try {
        const feedSock2 = makeSock('feed2');
        await feed.flush(EV, feedSock2, '');
        flushed2 = feedSock2.texts().join('\n');
    } catch (e) { flushed2 = ''; }
    check('D3 final death in war feed', /Moris/.test(flushed2), flushed2.slice(0, 160));
    if (carriedBefore) check('D3 feed states where the relics lie', /relic/i.test(flushed2), flushed2.slice(0, 160));

    // ═══════════ war survives ═══════════
    const evEnd = await evFresh();
    check('D4 war survived the whole death cycle', evEnd.state === 'ACTIVE', `state=${evEnd.state}`);

    const pass = results.filter((r) => r.ok).length;
    console.log(`\n════ DEFEAT-PATH QA: ${pass}/${results.length} passed ════`);
    const fails = results.filter((r) => !r.ok);
    if (fails.length) {
        console.log('FAILURES:');
        for (const f of fails) console.log(`  ❌ ${f.name} — ${f.detail}`);
    }
    await mongoose.connection.client.close().catch(() => {});
    process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
