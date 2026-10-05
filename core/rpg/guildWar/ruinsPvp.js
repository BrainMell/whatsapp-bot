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

// challenge windows are PERSISTED in the event doc (`pvpChallenges[]`) —
// §15 #8: the old per-process Map broke challenge→accept whenever the two
// players sat on different bot instances, and lost all windows on restart.
// The local Map below is kept ONLY as a legacy mirror for QA seams.
const openChallenges = new Map();

// ── challenge flow ──
async function challenge(eventDoc, challenger, targetJid) {
    if (challenger.guildId === (eventDoc.players.find((p) => p.jid === targetJid)?.guildId)) {
        return { ok: false, text: '🤝 Same guild - challenge your rivals, not your brothers-in-arms. Work together instead.' };
    }
    if (challenger.protectedUntil > Date.now()) {
        return { ok: false, text: '🛡️ Your spawn protection is still active - you cannot challenge yet.' };
    }
    const target = eventDoc.players.find((p) => p.jid === targetJid && p.status === 'active');
    if (!target) return { ok: false, text: '❌ That player is not here (or not active).' };
    // ⚔️ §15 #7 FIX (two-way protection): only the CHALLENGER's protection was
    // checked — a freshly-respawned/rejoined player could be challenged and
    // killed the instant they landed. Protection now protects both sides.
    if ((target.protectedUntil || 0) > Date.now()) {
        return { ok: false, text: `🛡️ *${target.name}* is still under spawn protection (${Math.ceil((target.protectedUntil - Date.now()) / 1000)}s). The Ruins give no quarter to the wounded - wait it out.` };
    }

    const challengeKey = `${eventDoc.eventId}:${challenger.roomId}:${targetJid}`;
    const rec = {
        key: challengeKey, challengerJid: challenger.jid, challengedJid: targetJid,
        roomKey: challenger.roomId, expiresAt: Date.now() + CFG.PVP.CHALLENGE_WINDOW_MS,
    };
    openChallenges.set(challengeKey, rec);
    const GuildWarEvent = require('../../models/GuildWarEvent');
    await GuildWarEvent.updateOne(
        { eventId: eventDoc.eventId },
        { $push: { pvpChallenges: { $each: [rec], $slice: -50 } } }
    );

    // auto-expire: timeout = implicit flee by the challenged player
    setTimeout(() => {
        const c = openChallenges.get(challengeKey);
        if (c && Date.now() >= c.expiresAt) {
            openChallenges.delete(challengeKey);
            resolveTimeout(c).catch((e) => console.error('[RuinsPvP] timeout:', e.message));
        }
    }, CFG.PVP.CHALLENGE_WINDOW_MS + 1000);

    feed.queue(eventDoc.eventId, 'normal', `⚔️ ${challenger.name} calls out ${target.name} — steel is drawn and a duel hangs in the dust!`);
    const windowS = Math.max(1, Math.round((CFG.PVP.CHALLENGE_WINDOW_MS || 60000) / 1000));
    return { ok: true, text: `⚔️ Challenge issued to *${target.name}* - they have ${windowS}s to accept.\nThey may: \`accept\` the duel, or \`flee\` (retreat to their previous room and concede what was contested).` };
}

// atomic DB claim: the accept wins only if the window is still open — works
// across instances and survives restarts.
async function accept(eventDoc, challenged) {
    const challengeKey = `${eventDoc.eventId}:${challenged.roomId}:${challenged.jid}`;
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const prev = await GuildWarEvent.findOneAndUpdate(
        {
            eventId: eventDoc.eventId,
            pvpChallenges: { $elemMatch: { key: challengeKey, expiresAt: { $gt: Date.now() } } },
        },
        { $pull: { pvpChallenges: { key: challengeKey } } },
        { new: false, projection: { pvpChallenges: 1 } }
    ).lean();
    openChallenges.delete(challengeKey);
    const c = (prev?.pvpChallenges || []).find((x) => x.key === challengeKey);
    if (!c || Date.now() > c.expiresAt) {
        return { ok: false, text: '❌ No open challenge against you here.' };
    }
    const challenger = eventDoc.players.find((p) => p.jid === c.challengerJid);
    if (!challenger) return { ok: false, text: '❌ The challenger has moved on.' };
    return { ok: true, challenger, text: null };
}

// best-effort timeout concede (fires on the issuing instance; harmless if
// the accept already claimed the window on another instance)
async function resolveTimeout(c) {
    const ev = await state.getEvent(c.eventId);
    if (!ev || ev.state !== 'ACTIVE') return;
    const challenged = ev.players.find((p) => p.jid === c.challengedJid);
    if (!challenged || challenged.status !== 'active') return;
    await concede(ev, challenged, 'ignored a challenge');
}

// reader for the DM router's flee flow (DB-backed, instance-independent)
async function openChallengeFor(eventDoc, challengedJid) {
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const doc = await GuildWarEvent.findOne(
        { eventId: eventDoc.eventId },
        { pvpChallenges: { $elemMatch: { challengedJid, expiresAt: { $gt: Date.now() } } } }
    ).lean();
    return doc?.pvpChallenges?.[0] || null;
}

// sweeper hook: pull expired windows; each entry resolved exactly once by
// whichever instance wins the pull (atomic $pull returns the previous set).
async function pruneExpired(eventDocOrId) {
    const eventId = typeof eventDocOrId === 'string' ? eventDocOrId : eventDocOrId.eventId;
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const prev = await GuildWarEvent.findOneAndUpdate(
        { eventId, 'pvpChallenges.expiresAt': { $lt: Date.now() } },
        { $pull: { pvpChallenges: { expiresAt: { $lt: Date.now() } } } },
        { new: false, projection: { pvpChallenges: 1 } }
    ).lean();
    const expired = (prev?.pvpChallenges || []).filter((c) => c.expiresAt <= Date.now());
    for (const c of expired) {
        openChallenges.delete(c.key);
        await resolveTimeout(c).catch((e) => console.error('[RuinsPvP] prune resolve:', e.message));
    }
    return expired.length;
}

// ── concede (flee/timeout): loser retreats, contested prize stays with the room ──
async function concede(eventDoc, loser, why, { sock = null, chatId = null } = {}) {
    void sock; void chatId;
    return forfeitToRoom(eventDoc, loser, why);
}

// 💬 copy overhaul 2026-10-05: why-phrases become group-readable prose
// (and never leak raw reason codes into the war feed)
const CONCEDE_LINES = {
    'ignored a challenge': 'left a challenge unanswered',
    'fled': 'fled the duel',
};

// the prize stays with the ROOM for the next arrival; loser retreats
async function forfeitToRoom(eventDoc, loser, why, { sock = null, chatId = null } = {}) {
    await state.updatePlayer(eventDoc.eventId, loser.jid, {}, {
        roomId: loser.prevRoomId,
        protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
        lastActionAt: Date.now(),
    });
    const whyLine = CONCEDE_LINES[why] || why;
    feed.queue(eventDoc.eventId, 'normal', `🏃 ${loser.name} ${whyLine} — retreats to their previous room, the contested prize left to the dust.`);
    return { text: `🏃 You retreat to your previous room. Whatever was contested stays with the room.` };
}

// ── settle a completed duel (called from the pvpSystem finish hook) ──
// Accepts an event DOC or an eventId string; resolves the fresh doc itself.
async function settle(eventDocOrId, winnerJid, loserJid) {
    const eventDoc = typeof eventDocOrId === 'string'
        ? await state.getEvent(eventDocOrId, { fresh: true })
        : eventDocOrId;
    if (!eventDoc || eventDoc.state !== 'ACTIVE') return { gp: 0, claimed: 0 };
    const winner = eventDoc.players.find((p) => p.jid === winnerJid);
    const loser = eventDoc.players.find((p) => p.jid === loserJid);
    if (!winner || !loser) return { gp: 0, claimed: 0 };

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

    const claimedNames = claimed.map((r) => `*${r.name}*`).join(' and ');
    feed.queue(eventDoc.eventId, 'normal',
        `⚔️ ${winner.name} cut down ${loser.name} in the Ruins${gp ? ` (+${gp} GP)` : ''}${claimed.length ? ` and claimed ${claimedNames} from the fallen!` : '.'}`);

    return { gp, claimed: claimed.length };
}

// 💬 roomLabel retired from the feed — raw coordinates ("chamber (4,0)")
// read like a debug log. Kept as a helper in case QA wants it.
function roomLabel(roomKey) {
    return `chamber (${roomKey})`;
}

// anti-farm: same-victim GP decay lives in points.recordPvpWin (pvpMeta ledger)

module.exports = { challenge, accept, concede, settle, forfeitToRoom, pruneExpired, openChallengeFor, _openChallenges: openChallenges };
