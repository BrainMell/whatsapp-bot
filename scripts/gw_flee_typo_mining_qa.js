// ============================================
// ⚔️ GW FLEE-PRESENTATION + TYPO-ROUTING + MINING QA (2026-10-05)
// Owner playtest regression battery:
//   T1  typo routing: ".j move lwft" reaches the router and behaves
//       EXACTLY like ".j move left" (it used to fall through to the
//       generic pipeline → tictactoe "No active game in this chat")
//   T2  flee presentation: retreating from a forced room (puzzle) now
//       replays the room entry (retreat text → map → scene) and the
//       war STAYS ACTIVE (the "game died on flee" report)
//   T3  mining energy: proportional cost keeps the bar finishable at
//       every level; recovery can never net-gain
// Run: node scripts/gw_flee_typo_mining_qa.js   (gwtest DB + mock socks)
// ============================================
process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300'; // fast cooldown for the sim

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function playerOf(doc, jid) { return doc.players.find((p) => p.jid === jid); }

async function freshEvent() {
    const state = require('../core/rpg/guildWar/state');
    // the router resolves a player to their OLDEST active event — sections must
    // never leave events behind, or the next section's DMs land in the OLD war
    await require('../core/models/GuildWarEvent').updateMany(
        { state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } },
        { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'fleeqa@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, {
        jid: 'pp0@s.whatsapp.net', name: 'PP0', guildId: 'GwTestA', guildName: 'GwTestA',
    });
    const started = await state.startEvent(created.event.eventId);
    if (!started.ok) throw new Error('startEvent failed: ' + started.reason);
    return started.event;
}

// ═════════ T1: TYPO ROUTING ═════════
async function t1_typo() {
    console.log('\n── T1: ".j move lwft" routes like ".j move left" ──');
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const ga = require('../core/rpg/guildAdventure');

    // stub the combat pipeline: auto-encounters must not explode the sim
    ga.startRuinsCombat = async () => ({ success: true, sessionKey: 'sim' });

    const ev = await freshEvent();
    const sock = mockSock();
    const dm = (txt) => dmRouter.handleDM(sock, 'pp0@s.whatsapp.net', 'pp0@s.whatsapp.net', txt, '\u200B', { prefix: '.j', prefixed: true });
    const pos = async () => playerOf(await state.getEvent(ev.eventId, { fresh: true }), 'pp0@s.whatsapp.net');
    const spawn = (await pos()).spawnRoomId;
    const reset = async () => { await state.updatePlayer(ev.eventId, 'pp0@s.whatsapp.net', {}, { roomId: spawn, prevRoomId: spawn, lastMoveAt: 0 }); };

    // unit: the fuzzy matcher returns the matched ALIAS KEY (the router then
    // runs it through MOVE_WORDS itself — returning the VALUE double-maps)
    check('fuzzy: lwft → left', dmRouter.fuzzyMoveToken('lwft') === 'left');
    check('fuzzy: wwst → west', dmRouter.fuzzyMoveToken('wwst') === 'west');
    check('fuzzy: nort → north', dmRouter.fuzzyMoveToken('nort') === 'north');
    check('fuzzy: bakc → back', dmRouter.fuzzyMoveToken('bakc') === 'back');
    check('fuzzy: rght → right', dmRouter.fuzzyMoveToken('rght') === 'right');
    check('fuzzy: ambiguous wast (west/east tie) → null', dmRouter.fuzzyMoveToken('wast') === null);
    check('fuzzy: xyzzy → null', dmRouter.fuzzyMoveToken('xyzzy') === null);

    // behavioral: the typo move and the exact move must be indistinguishable
    await reset(); await sleep(360);
    const r1 = await dm('.j move lwft');
    const posTypo = (await pos()).roomId;
    await reset(); await sleep(360);
    const r2 = await dm('.j move left');
    const posExact = (await pos()).roomId;
    check('typo ".j move lwft" consumed by the router', r1 !== null && typeof r1 === 'object', JSON.stringify(r1 || 'null').slice(0, 80));
    check('typo reaches the MOVE system (not the unknown-dir reply)', !(r1 && /Unknown direction/.test(r1.text || '')), JSON.stringify(r1 || {}).slice(0, 80));
    check('typo and exact ".j move left" land in the SAME room', posTypo === posExact, `typo=${posTypo} exact=${posExact}`);

    // garbage direction dies HERE with guidance — never falls through again
    const r3 = await dm('.j move xyzzy');
    check('".j move xyzzy" → real guidance reply (non-null)', r3 !== null && /Unknown direction/.test(r3.text || ''), JSON.stringify(r3 || 'null').slice(0, 80));

    // bare near-word WITHOUT move-intent must stay ungated (games may want it)
    await dm('.j look');
    const r4 = await dm('lwft');
    check('bare "lwft" (no move intent) still falls through', r4 === null, JSON.stringify(r4 || 'null').slice(0, 60));

    // no war running → quiet guidance instead of tictactoe error
    const sock9 = mockSock();
    const dm9 = (txt) => dmRouter.handleDM(sock9, 'pp9@s.whatsapp.net', 'pp9@s.whatsapp.net', txt, '\u200B', { prefix: '.j', prefixed: true });
    const r5 = await dm9('.j move left');
    check('no-war ".j move left" → "Ruins stand quiet" guidance', r5 !== null && /stand quiet/.test(r5.text || ''), JSON.stringify(r5 || 'null').slice(0, 80));
}

// ═════════ T2: FLEE PRESENTATION ═════════
async function t2_flee() {
    console.log('\n── T2: flee replays retreat text → map → scene; war stays ACTIVE ──');
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const ga = require('../core/rpg/guildAdventure');
    ga.startRuinsCombat = async () => ({ success: true, sessionKey: 'sim' });

    const ev = await freshEvent();
    const sock = mockSock();
    const dm = (txt) => dmRouter.handleDM(sock, 'pp0@s.whatsapp.net', 'pp0@s.whatsapp.net', txt, '\u200B', { prefix: '.j', prefixed: true });

    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = playerOf(doc, 'pp0@s.whatsapp.net');
    // force the player into a live PUZZLE chamber (forced-room type) with the
    // spawn room as retreat destination — mirrors the owner's CARVED VERSE run
    const puzzle = doc.rooms.find((r) => r.type === 'puzzle') || doc.rooms.find((r) => r.key !== me.spawnRoomId);
    await require('../core/models/GuildWarEvent').updateOne(
        { eventId: ev.eventId, 'rooms.key': puzzle.key },
        { $set: { 'rooms.$.type': 'puzzle', 'rooms.$.state': 'ACTIVE' } }
    );
    await state.updatePlayer(ev.eventId, me.jid, {}, { roomId: puzzle.key, prevRoomId: me.spawnRoomId, lastMoveAt: 0 });

    const res = await dm('.j flee');
    check('flee consumed', res !== null && typeof res === 'object', JSON.stringify(res || 'null').slice(0, 60));

    doc = await state.getEvent(ev.eventId, { fresh: true });
    const fled = playerOf(doc, me.jid);
    check('retreated to the previous room', fled.roomId === me.spawnRoomId, `roomId=${fled.roomId}`);
    check('war STILL ACTIVE after flee (the game did not die)', doc.state === 'ACTIVE', `state=${doc.state}`);
    const roomAfter = doc.rooms.find((r) => r.key === puzzle.key);
    check('abandoned chamber stays ACTIVE (spoils forfeited, not cleared)', roomAfter.state === 'ACTIVE', `state=${roomAfter.state}`);

    // the owner's ask: retreat line, then the room's map, then the scene
    const retreatIdx = sock.sent.findIndex((s) => /You retreat to your previous room/.test(s.text || ''));
    check('retreat line sent', retreatIdx >= 0, JSON.stringify(sock.sent.map((s) => s.text)).slice(0, 200));
    const mapIdx = sock.sent.findIndex((s, i) => i > retreatIdx && s.hasImage);
    const sceneIdx = sock.sent.findIndex((s, i) => i > mapIdx && s.hasImage);
    check('map image arrives AFTER the retreat text', retreatIdx >= 0 && mapIdx > retreatIdx, `retreat@${retreatIdx} map@${mapIdx}`);
    check('room scene (encounter image) arrives after the map', sceneIdx > mapIdx, `scene@${sceneIdx}`);
    check('no "No active game" anywhere in the flow', !sock.sent.some((s) => /No active game/i.test(s.text || '')));
}

// ═════════ T3: MINING ENERGY ═════════
async function t3_mining() {
    console.log('\n── T3: mining cost stays proportional to the pool ──');
    // replica of pctCost in mineOre (kept in sync; source-scan below pins it)
    const pctCost = (maxEn, base, ml) => Math.max(5, Math.round(maxEn * Math.max(5, base - Math.floor(ml / 2)) / 100));
    check('new player pool 100, shimmering → 15 (old flat price)', pctCost(100, 15, 1) === 15);
    check('endgame pool 1000, shimmering → 150', pctCost(1000, 15, 1) === 150);
    check('endgame pool 1000, void fissure → 600', pctCost(1000, 60, 1) === 600);
    check('discount floors at 5% of the pool (ml 40 → 50 @1000)', pctCost(1000, 15, 40) === 50);
    check('deep-vein discount never drops below 5% of pool', pctCost(1000, 25, 40) === 50);
    check('tiny pool keeps the absolute 5 floor', pctCost(60, 15, 20) === 5);

    const rec = (cost) => Math.max(1, Math.round(cost * 0.25)); // recovery replica
    for (const c of [5, 50, 150, 600]) check(`recovery after a ${c}-cost mine < cost`, rec(c) < c, `rec=${rec(c)}`);

    // source pins: the shipped formulas + engine gate + flee presentation
    const cmds = fs.readFileSync(path.join(__dirname, '..', 'core', 'commands', 'rpgCommands.js'), 'utf8');
    check('mineOre uses the proportional formula', /pctCost = \(loc\) => Math\.max\(5, Math\.round\(maxEn \* Math\.max\(5, loc\.energyCost - Math\.floor\(miningLevel \/ 2\)\) \/ 100\)\)/.test(cmds));
    check('mineOre recovery is a fraction of the spend', /Math\.round\(energyCost \* 0\.25\)/.test(cmds));
    check('mine list display uses pctCost (no stale flat price)', /const cost = pctCost\(loc\);/.test(cmds) && !/const cost = Math\.max\(5, loc\.energyCost - Math\.floor\(miningLevel\/2\)\)/.test(cmds));
    const engine = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
    check('engine routes any ".j move X" to the war router', /\/\^move\\b\/\.test\(_gwVerb\)/.test(engine));
    const router = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildWar', 'dmRouter.js'), 'utf8');
    check('dmRouter flee branch replays presentRoom', /post-flee presentation failed/.test(router) && /await presentRoom\(sock, chatId, BOT_MARKER, ctxDoc, meFresh, destRoom/.test(router));
    check('dmRouter quiet branch answers "move …" when no war runs', /QUIET_ACTION_RE\.test\(norm\) \|\| \/\^move\\b\/\.test\(norm\)/.test(router));
}

(async () => {
    await connectDB();
    await t1_typo();
    await t2_flee();
    await t3_mining();
    const mongoose = require('mongoose');
    await mongoose.disconnect();
    console.log(`\n[qa] DONE — ${PASS} pass, ${FAIL} fail`);
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] fatal:', e); process.exit(1); });
