// ============================================
// ⚰️ KILL THE CARVED VERSE QA (owner 2026-10-07)
// "the cursed verse is still fucking broken… you type open relic it doesnt
//  work and after you fail you don't go back to the previous room with a map
//  and encounter card — get rid of this stupid annoying game"
//
//   T1 pool sweep   : generate() NEVER spawns 'mapriddle' again; the other
//                     five kinds all still spawn (pool not broken)
//   T2 grading      : legacy mapriddle seals accept "open relic"; riddle
//                     accepts "a towel"; word-boundary holds ("age"≠"cabbage");
//                     glyph/shape/cipher/lever grading untouched
//   T3 fail flow    : wrong answer / exhaustion → map card + encounter card
//                     re-send BEFORE the verdict text (represent pipeline);
//                     shock really damages; seal really resets; solve still
//                     works and never re-presents
//   T4 live replay  : the EXACT screenshot sequence on a legacy mapriddle —
//                     "Open Reli" ✗ → "Open Relic" ✓ (solves, no shock)
// Run: node scripts/gw_kill_mapriddle_qa.js  (gwtest DB + mock socks)
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
        this.sent.push({ chatId, hasImage: !!content.image, text: String(content.text || content.caption || '') });
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
const puzzles = require(`..${GW}/puzzles`);
const mapEngine = require(`..${GW}/mapEngine`);
const dmRouter = require(`..${GW}/dmRouter`);
const economy = require('../core/rpg/economy');

const playerOf = (doc, jid) => doc.players.find((p) => p.jid === jid);
const roomOf = async (eventId, roomKey) => {
    const doc = await state.getEvent(eventId, { fresh: true });
    return doc.rooms.find((r) => r.key === roomKey);
};

async function freshEvent(tag) {
    await require('../core/models/GuildWarEvent').updateMany(
        { state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } },
        { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: `verseqa-${tag}@g.us`, initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, {
        jid: 'verse0@s.whatsapp.net', name: 'VerseQA', guildId: 'VerseQA', guildName: 'VerseQA',
    });
    const started = await state.startEvent(created.event.eventId);
    if (!started.ok) throw new Error('startEvent failed: ' + started.reason);
    return started.event;
}

async function seat(eventId, jid, roomKey) {
    await state.updatePlayer(eventId, jid, {}, { roomId: roomKey, prevRoomId: roomKey, lastMoveAt: 0 });
    await rooms.enterRoom(eventId, jid, null, roomKey);
}

async function retype(eventId, roomKey, patch) {
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateOne(
        { eventId, rooms: { $elemMatch: { key: roomKey } } },
        { $set: { 'rooms.$.type': patch.type, ...(patch.payload ? { 'rooms.$.payload': patch.payload } : {}) } });
}

(async () => {
    await connectDB();

    // ═══ T1: pool sweep — the Carved Verse is gone ═══
    console.log('\n── T1: generate() never spawns mapriddle again ──');
    {
        const seen = {};
        let mapriddleSpawns = 0, total = 0;
        for (const ring of [0, 0.2, 0.45, 0.8, 1.2]) {
            for (let i = 0; i < 500; i++) {
                const rng = mapEngine.makeRng(`verse-kill:${ring}:${i}`);
                const room = { key: '3,0', ring };
                const pz = puzzles.generate(rng, room, { rooms: new Map() });
                total++;
                seen[pz.kind] = (seen[pz.kind] || 0) + 1;
                if (pz.kind === 'mapriddle') mapriddleSpawns++;
            }
        }
        check(`T1: 0 mapriddle in ${total} generated puzzles`, mapriddleSpawns === 0, `spawned ${mapriddleSpawns}`);
        for (const kind of ['sequence', 'riddle', 'memory', 'levers', 'cipher']) {
            check(`T1: kind '${kind}' still spawns`, (seen[kind] || 0) > 0, `count=${seen[kind] || 0}`);
        }
    }

    // ═══ T2: grading tolerance (legacy mapriddle + riddle) ═══
    console.log('\n── T2: grading — legacy verse + riddle tolerance ──');
    {
        const verse = { kind: 'mapriddle', answer: 'relic', maxAttempts: 3 };
        check('T2: legacy verse "open relic" SOLVES (the screenshot bug)', puzzles.checkByKind('mapriddle', verse, 'open relic', 1).solved === true);
        check('T2: legacy verse "Open Relic" SOLVES', puzzles.checkByKind('mapriddle', verse, 'Open Relic', 1).solved === true);
        check('T2: legacy verse "relic" SOLVES', puzzles.checkByKind('mapriddle', verse, 'relic', 1).solved === true);
        check('T2: legacy verse "the relic!" SOLVES', puzzles.checkByKind('mapriddle', verse, 'the relic!', 1).solved === true);
        check('T2: legacy verse "open" still WRONG', puzzles.checkByKind('mapriddle', verse, 'open', 1).solved === false);
        check('T2: legacy verse "vault" still WRONG', puzzles.checkByKind('mapriddle', verse, 'vault', 1).solved === false);
        const cacheVerse = { kind: 'mapriddle', answer: 'cache', maxAttempts: 3 };
        check('T2: legacy verse cache "open the cache" SOLVES', puzzles.checkByKind('mapriddle', cacheVerse, 'open the cache', 1).solved === true);

        const towel = { kind: 'riddle', answer: 'towel', altAnswers: ['towel'], maxAttempts: 3 };
        check('T2: riddle "towel" SOLVES', puzzles.checkByKind('riddle', towel, 'towel', 1).solved === true);
        check('T2: riddle "a towel" SOLVES (article tolerance)', puzzles.checkByKind('riddle', towel, 'a towel', 1).solved === true);
        check('T2: riddle "it is a towel" SOLVES', puzzles.checkByKind('riddle', towel, 'it is a towel', 1).solved === true);
        check('T2: riddle "TOWEL!!" SOLVES', puzzles.checkByKind('riddle', towel, 'TOWEL!!', 1).solved === true);
        check('T2: riddle "shadow" still WRONG', puzzles.checkByKind('riddle', towel, 'shadow', 1).solved === false);
        const age = { kind: 'riddle', answer: 'age', altAnswers: ['age'], maxAttempts: 3 };
        check('T2: riddle word boundary — "age" SOLVES', puzzles.checkByKind('riddle', age, 'age', 1).solved === true);
        check('T2: riddle word boundary — "cabbage" still WRONG', puzzles.checkByKind('riddle', age, 'cabbage', 1).solved === false);

        // untouched kinds keep EXACT grading
        const seq = { kind: 'sequence', answer: 'ᚠ ᚢ ᚦ', altAnswer: 'ᚠᚢᚦ', maxAttempts: 3 };
        check('T2: sequence "ᚠ ᚢ ᚦ" SOLVES', puzzles.checkByKind('sequence', seq, 'ᚠ ᚢ ᚦ', 1).solved === true);
        check('T2: sequence "ᚠᚢᚦ" SOLVES (altAnswer)', puzzles.checkByKind('sequence', seq, 'ᚠᚢᚦ', 1).solved === true);
        check('T2: sequence wrong order still WRONG', puzzles.checkByKind('sequence', seq, 'ᚢ ᚠ ᚦ', 1).solved === false);
        const cipher = { kind: 'cipher', answer: 'RUIN', maxAttempts: 3 };
        check('T2: cipher "ruin" SOLVES (case-insensitive)', puzzles.checkByKind('cipher', cipher, 'ruin', 1).solved === true);
        check('T2: cipher "ruins" still WRONG', puzzles.checkByKind('cipher', cipher, 'ruins', 1).solved === false);
    }

    // ═══ T3: fail flow — map + encounter card ride the verdict ═══
    console.log('\n── T3: fail flow re-presents map + encounter card ──');
    {
        const ev = await freshEvent('failflow');
        const target = ev.rooms.find((r) => !['core', 'finale'].includes(r.type));
        await retype(ev.eventId, target.key, {
            type: 'puzzle',
            payload: { puzzle: { kind: 'riddle', prompt: 'QA guardian: what is soft and dries you?', answer: 'towel', altAnswers: ['towel'], maxAttempts: 3, started: true, attemptsUsed: 0 } },
        });
        const JID = 'verse0@s.whatsapp.net';
        // the shock writes through the ECONOMY persistent-HP store — the user
        // must exist AND be registered there or applyWarDamage silently no-ops
        const econ = economy.registerUser(JID, 'VerseQA');
        if (!econ.success) economy.getOrCreateUser(JID, 'VerseQA');
        await seat(ev.eventId, JID, target.key);
        const dm = (txt, sock) => dmRouter.handleDM(sock || mockSock(), JID, JID, txt, '\u200B', { prefix: '.', prefixed: true });

        // wrong answer #1 → represent: map image + scene image, verdict as the
        // returned text (the bot body sends it after the images)
        const s1 = mockSock();
        const r1 = await dm('zzz', s1);
        const imgs1 = s1.sent.filter((m) => m.hasImage);
        check('T3: wrong answer re-presents map + encounter card (2 images)', imgs1.length === 2, `got ${imgs1.length}`);
        check('T3: first image is the MAP (YOU ARE HERE caption)', imgs1.length > 0 && /YOU ARE HERE/.test(imgs1[0].text), imgs1[0] && imgs1[0].text.slice(0, 60));
        check('T3: verdict text rides the reply ("Wrong")', !!r1 && /Wrong/.test(r1.text || ''), r1 && r1.text && r1.text.slice(0, 50));
        check('T3: attempts counted (2 left)', !!r1 && /2 attempts left/.test(r1.text || ''));

        // exhaustion → shock + re-present + reset
        const s2 = mockSock(); await dm('nope', s2);   // attempt 2
        check('T3: wrong answer #2 also re-presents (2 images)', s2.sent.filter((m) => m.hasImage).length === 2);
        const hpBefore = economy.getPersistentHP(JID, 100);
        const s3 = mockSock(); const r3 = await dm('nah', s3);    // attempt 3 → shock
        check('T3: exhaustion re-presents too (2 images)', s3.sent.filter((m) => m.hasImage).length === 2);
        check('T3: exhaustion text = shock + reset promise', !!r3 && /shock/.test(r3.text || '') && /resets/.test(r3.text || ''), r3 && r3.text && r3.text.slice(0, 70));
        const hpAfter = economy.getPersistentHP(JID, 100);
        check('T3: shock damage was REAL (persistent HP dropped)', hpAfter < hpBefore, `before=${hpBefore} after=${hpAfter}`);

        // seal reset is real: fresh 3 attempts after the shock
        const s4 = mockSock(); const r4 = await dm('zzz', s4);
        check('T3: seal reset → back to counting from 2 left', !!r4 && /2 attempts left/.test(r4.text || ''), r4 && r4.text && r4.text.slice(0, 50));

        // solve → cleared scene + return map; the "clicks open" beat rides the
        // cleared-scene CAPTION, the return value stays empty
        const s5 = mockSock(); const r5 = await dm('a towel', s5);   // tolerance through the LIVE router
        check('T3: "a towel" SOLVES the seal via the live router', s5.sent.some((m) => /clicks open/.test(m.text)), JSON.stringify(s5.sent.map((m) => m.text.slice(0, 40))));
        const roomAfter = await roomOf(ev.eventId, target.key);
        check('T3: room CLEARED after the solve', roomAfter.state === 'CLEARED');
        check('T3: solve path sends cleared scene + return map (2 images)', s5.sent.filter((m) => m.hasImage).length === 2, `got ${s5.sent.filter((m) => m.hasImage).length} — ${JSON.stringify(s5.sent.map((m) => ({ img: m.hasImage, t: m.text.slice(0, 40) })))}`);
        check('T3: solve returns no bare verdict (caption carried it)', !r5 || !r5.text, r5 && r5.text);
    }

    // ═══ T4: the EXACT screenshot replay on a legacy mapriddle seal ═══
    console.log('\n── T4: screenshot replay — legacy carved verse, "Open Reli" ✗ then "Open Relic" ✓ ──');
    {
        const ev = await freshEvent('replay');
        const target = ev.rooms.find((r) => !['core', 'finale'].includes(r.type));
        await retype(ev.eventId, target.key, {
            type: 'puzzle',
            payload: { puzzle: { kind: 'mapriddle', prompt: 'A carved verse: "Seek the hidden chamber - 5 rooms east, 0 rooms south from this very hall. Speak \'open\' and name what you seek: *relic*."', answer: 'relic', maxAttempts: 3, started: true, attemptsUsed: 0 } },
        });
        const JID = 'verse0@s.whatsapp.net';
        await seat(ev.eventId, JID, target.key);
        const dm = (txt, sock) => dmRouter.handleDM(sock || mockSock(), JID, JID, txt, '\u200B', { prefix: '.', prefixed: true });

        const s1 = mockSock(); const r1 = await dm('Open Reli', s1);
        check('T4: "Open Reli" still WRONG (typo is a typo)', !!r1 && /Wrong/.test(r1.text || ''));
        const s2 = mockSock(); const r2 = await dm('Open Relic', s2);
        check('T4: "Open Relic" now SOLVES (instructed phrase accepted)', s2.sent.some((m) => /clicks open/.test(m.text)), r2 && r2.text);
        const roomAfter = await roomOf(ev.eventId, target.key);
        check('T4: legacy verse room CLEARED', roomAfter.state === 'CLEARED');
    }

    // ═══ T5: examine gate untouched — board still hidden until examine ═══
    console.log('\n── T5: examine gate intact for the remaining games ──');
    {
        const ev = await freshEvent('gate');
        const target = ev.rooms.find((r) => !['core', 'finale'].includes(r.type));
        await retype(ev.eventId, target.key, {
            type: 'puzzle',
            payload: { puzzle: { kind: 'levers', prompt: 'QA levers.', answer: 'ABC', maxAttempts: 3 } },
        });
        const JID = 'verse0@s.whatsapp.net';
        await seat(ev.eventId, JID, target.key);
        const s1 = mockSock();
        const r1 = await dmRouter.handleDM(s1, JID, JID, 'open relic', '\u200B', { prefix: '.', prefixed: true });
        check('T5: un-started mechanism demands examine (no attempt burned)', !!r1 && /examine/.test(r1.text || ''), r1 && r1.text && r1.text.slice(0, 60));
        const room = await roomOf(ev.eventId, target.key);
        check('T5: attemptsUsed still 0 after the hint', ((room.payload || {}).puzzle || {}).attemptsUsed === undefined);
    }

    console.log(`\n════════ KILL-MAPRIDDLE QA: ${PASS} passed, ${FAIL} failed ════════`);
    await require('mongoose').disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch(async (e) => {
    console.error('[qa] fatal:', e);
    try { await require('mongoose').disconnect(); } catch (_) { /* noop */ }
    process.exit(1);
});
