#!/usr/bin/env node
// ⚔️ GW PRESENCE + SCOREBOARD QA — owner live-test bug report (2026-10-06
// 22:52Z, multiplayer playtest 8:47 PM-onward):
//   SC. Standings duplicated across bots (#10): the scoreboard cadence lived
//       in PER-PROCESS memory → Subaru AND Joker both posted identical
//       standings. Now claimed atomically on the event DOC — exactly one
//       post per cadence window fleet-wide; failed sends release the claim.
//   P1. Co-op joiner presentation (#2/#3): a joiner seated mid-fight got a
//       TEXT-ONLY ack (no battle image, no turn state). presentRuinsBattleTo
//       re-presents the CURRENT battle from THEIR POV.
//   P2. Bare `challenge` auto-targets a lone rival (#11) and the rival's DM
//       notification rides a POV scene (#1 sprite asymmetry).
//   P3. Duel start: BOTH duelists receive their own POV scene (#1/#2).
//   P4. Arrival presence: occupants see the newcomer's sprite (#1).
// Same harness as gw_flee_typo_mining_qa.js (gwtest DB + mock socks).
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mockSock(log) {
    return {
        groupMetadata: async () => ({ id: 'g-ok@g.us' }),
        sendMessage: async (chatId, content) => {
            if (log) log.push({ chatId, hasImage: !!content.image, text: (content.text || content.caption || '').slice(0, 120) });
            return {};
        },
    };
}

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

async function freshEvent(host) {
    const state = require('../core/rpg/guildWar/state');
    await require('../core/models/GuildWarEvent').updateMany(
        { state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } },
        { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: host, initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, {
        jid: 'pp0@s.whatsapp.net', name: 'Alpha', guildId: 'GwTestA', guildName: 'GwTestA',
    });
    await state.registerPlayer(created.event.eventId, {
        jid: 'pp1@s.whatsapp.net', name: 'Bravo', guildId: 'GwTestB', guildName: 'GwTestB',
    });
    const started = await state.startEvent(created.event.eventId);
    if (!started.ok) throw new Error('startEvent failed: ' + started.reason);
    return started.event;
}

(async () => {
    await connectDB();
    const state = require('../core/rpg/guildWar/state');
    const feed = require('../core/rpg/guildWar/feed');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const ga = require('../core/rpg/guildAdventure');
    const botConfig = require('../botConfig');
    const economy = require('../core/rpg/economy');

    // economy users so the duel pipeline resolves real players
    economy.economyData.set('pp0@s.whatsapp.net', {
        userId: 'pp0@s.whatsapp.net', wallet: 1000, bank: 0, registered: true,
        nickname: 'Alpha', stats: {}, progression: { level: 3 },
        adventurerRank: 'D', class: 'FIGHTER', spriteIndex: 0,
    });
    economy.economyData.set('pp1@s.whatsapp.net', {
        userId: 'pp1@s.whatsapp.net', wallet: 1000, bank: 0, registered: true,
        nickname: 'Bravo', stats: {}, progression: { level: 3 },
        adventurerRank: 'D', class: 'FIGHTER', spriteIndex: 1,
    });

    const scope = (() => { try { return botConfig.getBotId() || 'global'; } catch (e) { return 'global'; } })();
    const standingsCount = (log) => log.filter((s) => /War standings/.test(s.text)).length;

    // ═════════ SC: cross-instance scoreboard claim ═════════
    console.log('\n── SC: standings claim lives on the DOC (one post per cadence, fleet-wide) ──');
    const evS = await freshEvent('scbqa@g.us');
    await state.updatePlayer(evS.eventId, 'pp0@s.whatsapp.net', {}, { score: 120 });
    const logS = [];
    const sockS = mockSock(logS);
    feed.dispose(evS.eventId);
    await feed.postScoreboard(evS.eventId, sockS, '');
    check('SC1 first post sends the standings exactly once', standingsCount(logS) === 1, JSON.stringify(logS).slice(0, 200));
    const docS1 = await GuildWarEvent.findOne({ eventId: evS.eventId }).lean();
    check('SC2 claim rides the event doc (scoreboardAt set)', !!docS1.scoreboardAt, String(docS1.scoreboardAt));
    await feed.postScoreboard(evS.eventId, sockS, '');
    check('SC3 second post inside the cadence window is claimed away', standingsCount(logS) === 1);
    await GuildWarEvent.updateOne({ eventId: evS.eventId }, { $set: { scoreboardAt: Date.now() - 11 * 60 * 1000 } });
    await feed.postScoreboard(evS.eventId, sockS, '');
    check('SC4 cadence expiry admits the next post', standingsCount(logS) === 2);
    await GuildWarEvent.updateOne({ eventId: evS.eventId }, { $set: { scoreboardAt: Date.now() - 11 * 60 * 1000 } });
    const badSock = { groupMetadata: async () => ({ id: 'g-ok@g.us' }), sendMessage: async () => { throw new Error('forbidden'); } };
    await feed.postScoreboard(evS.eventId, badSock, '');
    const docS2 = await GuildWarEvent.findOne({ eventId: evS.eventId }).lean();
    check('SC5 failed send releases the claim (retryable)', !docS2.scoreboardAt || docS2.scoreboardAt < Date.now() - 9 * 60 * 1000, String(docS2.scoreboardAt));
    await feed.postScoreboard(evS.eventId, sockS, '');
    check('SC6 retry after release lands', standingsCount(logS) === 3);
    feed.dispose(evS.eventId);

    // ═════════ P1: co-op joiner battle presentation ═════════
    console.log('\n── P1: joinRuinsSession joiners get the CURRENT battle (their POV) ──');
    const evP = await freshEvent('presqa@g.us');
    const docP = await state.getEvent(evP.eventId, { fresh: true });
    const roomP = docP.rooms[0];
    const sessKey = `${scope}|gwr:${evP.eventId}:${roomP.key}`;
    ga.gameStates.set(sessKey, {
        mode: 'RUINS', inCombat: true, sessionKey: sessKey, solo: false, round: 4,
        chatId: 'pj@s.whatsapp.net',
        ruinsMeta: { eventId: evP.eventId, roomKey: roomP.key },
        players: [
            { jid: 'pj@s.whatsapp.net', name: 'Joiner', class: { id: 'FIGHTER', icon: '⚔️' }, stats: { hp: 80, maxHp: 100, energy: 30, maxEnergy: 50 }, currentHP: 80, mana: 30, maxMana: 50, isDead: false },
            { jid: 'pa@s.whatsapp.net', name: 'Ally', class: { id: 'MAGE', icon: '🔮' }, stats: { hp: 60, maxHp: 90, energy: 10, maxEnergy: 40 }, currentHP: 60, mana: 10, maxMana: 40, isDead: false },
        ],
        enemies: [
            { name: 'Ash Wraith', currentHP: 40, stats: { hp: 40, maxHp: 81 }, isDead: false },
            { name: 'Ash Wretch', currentHP: 0, stats: { hp: 0, maxHp: 70 }, isDead: true },
        ],
        activeCombatant: { isEnemy: true, name: 'Ash Wraith' },
        turnOrder: [],
    });
    const pres = await ga.presentRuinsBattleTo(evP.eventId, roomP.key, 'pj@s.whatsapp.net');
    check('P1 presentation returns for the seated joiner', !!pres);
    check('P1 text: joined banner + live turn state', pres && /YOU JOINED THE BATTLE/.test(pres.text) && /The pack is moving/.test(pres.text), pres && pres.text.slice(0, 120));
    check('P1 text: living enemy shown, dead enemy hidden', pres && /Ash Wraith/.test(pres.text) && !/Ash Wretch/.test(pres.text));
    check('P1 text: allies listed', pres && /Fighting beside: Ally/.test(pres.text));
    check('P1 POV battle image rendered (fresh plan incl. joiner)', pres && !!pres.image, pres && typeof pres.image);
    ga.gameStates.get(sessKey).activeCombatant = { jid: 'pj@s.whatsapp.net', name: 'Joiner' };
    const pres2 = await ga.presentRuinsBattleTo(evP.eventId, roomP.key, 'pj@s.whatsapp.net');
    check('P1b own turn reads "YOUR TURN"', pres2 && /YOUR TURN/.test(pres2.text));
    ga.gameStates.delete(sessKey);

    // ═════════ P2: bare challenge + rival POV notification ═════════
    console.log('\n── P2: bare `challenge` targets a lone rival; rival DM rides a scene ──');
    ga.startRuinsCombat = async () => ({ success: true, sessionKey: 'sim' });
    const evC = await freshEvent('chalqa@g.us');
    const docC = await state.getEvent(evC.eventId, { fresh: true });
    const roomC = docC.players.find((p) => p.jid === 'pp0@s.whatsapp.net').roomId;
    await state.updatePlayer(evC.eventId, 'pp0@s.whatsapp.net', {}, { roomId: roomC, prevRoomId: roomC, protectedUntil: 0 });
    await state.updatePlayer(evC.eventId, 'pp1@s.whatsapp.net', {}, { roomId: roomC, prevRoomId: roomC, protectedUntil: 0 });
    const logC = [];
    const sockC = mockSock(logC);
    const dm0 = (txt) => dmRouterHandleDM(sockC, 'pp0@s.whatsapp.net', txt);
    const dm1 = (txt) => dmRouterHandleDM(sockC, 'pp1@s.whatsapp.net', txt);
    function dmRouterHandleDM(sock, jid, txt) {
        const dmRouter = require('../core/rpg/guildWar/dmRouter');
        return dmRouter.handleDM(sock, jid, jid, txt, '\u200B', { prefix: '.j', prefixed: true });
    }
    await sleep(60);
    const rChal = await dm0('challenge');
    check('P2 bare challenge auto-targets the lone rival', rChal && /Challenge issued to \*Bravo\*/.test(rChal.text || ''), JSON.stringify(rChal || {}).slice(0, 120));
    const notified = logC.find((s) => s.chatId === 'pp1@s.whatsapp.net' && /calls you out/.test(s.text));
    check('P2 rival DM notified WITH a POV scene image', !!notified && notified.hasImage, JSON.stringify(logC).slice(0, 260));

    // ═════════ P3: duel start POV scenes to BOTH duelists ═════════
    console.log('\n── P3: accept renders each duelist their own duel scene ──');
    const rAcc = await dm1('accept');
    check('P3 duel begins on accept', rAcc && /THE DUEL BEGINS/.test(rAcc.text || ''), JSON.stringify(rAcc || {}).slice(0, 120));
    const scenes = logC.filter((s) => /THE DUEL BEGINS/.test(s.text) && s.hasImage);
    const toChallenger = scenes.find((s) => s.chatId === 'pp0@s.whatsapp.net');
    const toAccepter = scenes.find((s) => s.chatId === 'pp1@s.whatsapp.net');
    check('P3 both duelists receive a POV duel scene', !!toChallenger && !!toAccepter, JSON.stringify(logC).slice(-400));

    // ═════════ P4: arrival presence to occupants ═════════
    console.log('\n── P4: occupants SEE the newcomer (scene from their perspective) ──');
    const evA = await freshEvent('arrqa@g.us');
    const docA = await state.getEvent(evA.eventId, { fresh: true });
    const roomA = docA.players.find((p) => p.jid === 'pp1@s.whatsapp.net').roomId;
    const rooms = require('../core/rpg/guildWar/rooms');
    // seat pp1 in roomA via the REAL enterRoom (fromKey=null → pure push branch)
    await state.updatePlayer(evA.eventId, 'pp1@s.whatsapp.net', {}, { roomId: roomA, prevRoomId: docA.players.find((p) => p.jid === 'pp1@s.whatsapp.net').spawnRoomId || roomA, protectedUntil: 0 });
    await rooms.enterRoom(evA.eventId, 'pp1@s.whatsapp.net', null, roomA);
    const docA2 = await state.getEvent(evA.eventId, { fresh: true });
    const roomA2 = docA2.rooms.find((r) => r.key === roomA);
    const logA = [];
    const sockA = mockSock(logA);
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    await dmRouter.announceArrival(sockA, docA2, { jid: 'pp0@s.whatsapp.net', name: 'Alpha' }, roomA2, { prefix: '.j' });
    const arrived = logA.find((s) => s.chatId === 'pp1@s.whatsapp.net' && /strides into your chamber/.test(s.text));
    check('P4 occupant notified of the arrival', !!arrived, JSON.stringify(logA).slice(0, 200));
    check('P4 arrival rides a POV scene image', !!arrived && arrived.hasImage);

    console.log(`\n════════ RESULT: ${PASS} pass / ${FAIL} fail ════════`);
    await require('mongoose').disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch(async (e) => {
    console.error('[qa] fatal:', e);
    try { await require('mongoose').disconnect(); } catch (e2) {}
    process.exit(1);
});
