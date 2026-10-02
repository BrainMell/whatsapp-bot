// ============================================
// ⚔️ RUINS PVP — Guild War Overhaul 2026-10-03
// A NEW duel type for the shared world (the chat-duel system in pvpSystem
// stays untouched). Triggered when players of DIFFERENT guilds share a room.
// Stakes: Guild Points + carried relics (capped). Flee/ignore = concede.
// Built on the existing combat engine: the actual fight reuses
// guildAdventure.startRuinsCombat with a PvP-flagged room payload.
// ============================================

const CFG = require('./config');
const state = require('./state');
const rooms = require('./rooms');
const points = require('./points');
const feed = require('./feed');
const relics = require('./relics');

// challenge windows: key `${eventId}:${roomKey}:${challengedJid}` → {challenger, expiresAt, prize}
const openChallenges = new Map();

// ── challenge flow ──
async function challenge(eventDoc, challenger, targetJid) {
    if (challenger.guildId === (eventDoc.players.find((p) => p.jid === targetJid)?.guildId)) {
        return { ok: false, text: '🤝 Same guild — challenge your rivals, not your brothers-in-arms. Work together instead.' };
    }
    if (challenger.protectedUntil > Date.now()) {
        return { ok: false, text: '🛡️ Your spawn protection is still active — you cannot challenge yet.' };
    }
    const target = eventDoc.players.find((p) => p.jid === targetJid && p.status === 'active');
    if (!target) return { ok: false, text: '❌ That player is not here (or not active).' };

    const challengeKey = `${eventDoc.eventId}:${challenger.roomId}:${targetJid}`;
    openChallenges.set(challengeKey, {
        eventId: eventDoc.eventId, roomKey: challenger.roomId,
        challengerJid: challenger.jid, challengedJid: targetJid,
        expiresAt: Date.now() + CFG.PVP.CHALLENGE_WINDOW_MS,
    });

    // auto-expire: timeout = implicit flee by the challenged player
    setTimeout(() => {
        const c = openChallenges.get(challengeKey);
        if (c && Date.now() >= c.expiresAt) {
            openChallenges.delete(challengeKey);
            resolveTimeout(c).catch((e) => console.error('[RuinsPvP] timeout:', e.message));
        }
    }, CFG.PVP.CHALLENGE_WINDOW_MS + 1000);

    feed.queue(eventDoc.eventId, 'normal', `⚔️ ${challenger.name} challenges ${target.name} in a ${roomLabel(challenger.roomId)}!`);
    return { ok: true, text: `⚔️ Challenge issued to *${target.name}* — they have 60s to accept.\nThey may: \`accept\` the duel, or \`flee\` (retreat to their previous room and concede what was contested).` };
}

async function accept(eventDoc, challenged) {
    const challengeKey = `${eventDoc.eventId}:${challenged.roomId}:${challenged.jid}`;
    const c = openChallenges.get(challengeKey);
    if (!c || Date.now() > c.expiresAt) {
        openChallenges.delete(challengeKey);
        return { ok: false, text: '❌ No open challenge against you here.' };
    }
    openChallenges.delete(challengeKey);
    const challenger = eventDoc.players.find((p) => p.jid === c.challengerJid);
    if (!challenger) return { ok: false, text: '❌ The challenger has moved on.' };
    return { ok: true, challenger, text: null };
}

async function resolveTimeout(c) {
    const ev = await state.getEvent(c.eventId);
    if (!ev || ev.state !== 'ACTIVE') return;
    const challenged = ev.players.find((p) => p.jid === c.challengedJid);
    if (!challenged || challenged.status !== 'active') return;
    await concede(ev, challenged, 'ignored a challenge');
}

// ── concede (flee/timeout): loser retreats, contested prize stays with the room ──
async function concede(eventDoc, loser, why, { sock = null, chatId = null } = {}) {
    void sock; void chatId;
    return forfeitToRoom(eventDoc, loser, why);
}

// the prize stays with the ROOM for the next arrival; loser retreats
async function forfeitToRoom(eventDoc, loser, why, { sock = null, chatId = null } = {}) {
    await state.updatePlayer(eventDoc.eventId, loser.jid, {}, {
        roomId: loser.prevRoomId,
        protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
        lastActionAt: Date.now(),
    });
    feed.queue(eventDoc.eventId, 'normal', `🏃 ${loser.name} ${why} — retreats to their previous room.`);
    return { text: `🏃 You retreat to your previous room. Whatever was contested stays with the room.` };
}

// ── settle a completed duel (called from the ruins combat onEnd hook) ──
// duelMeta: { eventId, roomKey, winnerJid, loserJid, isPvP }
async function settle(eventDoc, winnerJid, loserJid) {
    const winner = eventDoc.players.find((p) => p.jid === winnerJid);
    const loser = eventDoc.players.find((p) => p.jid === loserJid);
    if (!winner || !loser) return;

    const gp = await points.recordPvpWin(eventDoc.eventId, winner, loser);

    // winner may claim up to RELIC_STEAL_CAP carried stealable relics
    const stealable = (loser.relics || []).filter((r) => relics.isStealable(r));
    const claimed = stealable
        .sort((a, b) => relics.tierAtLeast(b.tier, 'Epic') ? 1 : -1)
        .slice(0, CFG.PVP.RELIC_STEAL_CAP);
    if (claimed.length) {
        const GuildWarEvent = require('../../models/GuildWarEvent');
        await GuildWarEvent.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': loserJid },
            { $pull: { 'players.$.relics': { id: { $in: claimed.map((r) => r.id) } } } }
        );
        for (const r of claimed) {
            await GuildWarEvent.updateOne(
                { eventId: eventDoc.eventId, 'players.jid': winnerJid },
                { $push: { 'players.$.relics': r } }
            );
        }
        await state.pushLog(eventDoc.eventId, 'relic-theft', winnerJid, `claimed ${claimed.map((r) => r.name).join(', ')} from ${loserJid}`);
    }

    // loser: retreat + protection
    await state.updatePlayer(eventDoc.eventId, loserJid, {}, {
        roomId: loser.prevRoomId,
        protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
    });

    feed.queue(eventDoc.eventId, 'normal',
        `⚔️ ${winner.name} defeated ${loser.name} in the Ruins${gp ? ` (+${gp} GP)` : ''}${claimed.length ? ` and claimed ${claimed.length} relic${claimed.length > 1 ? 's' : ''}!` : '.'}`);

    return { gp, claimed: claimed.length };
}

function roomLabel(roomKey) {
    return `chamber (${roomKey})`;
}

// anti-farm: same-victim GP decay lives in points.recordPvpWin (pvpMeta ledger)

module.exports = { challenge, accept, concede, settle, forfeitToRoom, _openChallenges: openChallenges };
