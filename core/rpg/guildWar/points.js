// ============================================
// 🏛️ GUILD POINTS — Guild War Overhaul 2026-10-03
// GP earned (never bought). Awards feed the EXISTING guild level curve
// (guilds.addGuildPoints) at event end + live per-player score during play.
// Anti-farming: per-player event cap, no guildmate GP, diminishing returns
// on repeat PvP victims, no repeat-clear points.
// ============================================

const CFG = require('./config');
const state = require('./state');
const feed = require('./feed');

// live award during the event (respects caps; adds to player score)
// returns { ok, awarded, capped } — awarded GP after cap/clamp
// ⚔️ §15 #2 FIX (atomic GP): the old read-modify-write read a possibly stale
// cached score and wrote the WHOLE value back — back-to-back awards (core
// breach fires three) read the same snapshot and last-write-wins silently
// ate GP. Now: ONE atomic $inc, then an atomic $min clamp against the cap.
async function award(eventId, playerJid, baseGp, activity, { coopBonus = false, ignoreCap = false } = {}) {
    const ev = await state.getEvent(eventId);
    if (!ev || ev.state !== 'ACTIVE') return { ok: false, awarded: 0, capped: false };
    const p = ev.players.find((x) => x.jid === playerJid);
    if (!p) return { ok: false, awarded: 0, capped: false };

    let gp = Math.round(baseGp);
    if (coopBonus && activity !== 'pvp') gp = Math.round(gp * (1 + CFG.POINTS.COOP_BONUS));
    if (ev.type === 'alignment') gp = Math.round(gp * CFG.POINTS.ALIGNMENT_MULT);
    if (gp <= 0) return { ok: true, awarded: 0, capped: false };

    const GuildWarEvent = require('../../models/GuildWarEvent');
    const res = await GuildWarEvent.findOneAndUpdate(
        { eventId, state: 'ACTIVE', players: { $elemMatch: { jid: playerJid } } },
        {
            $inc: { 'players.$.score': gp, 'players.$.gpEarned': gp },
            $set: { 'players.$.lastActionAt': Date.now() },
        },
        { new: true, projection: { players: { $elemMatch: { jid: playerJid } }, type: 1, state: 1 } }
    ).lean();
    if (!res || !res.players?.[0]) return { ok: false, awarded: 0, capped: false };

    const newScore = res.players[0].score || 0;
    const cap = res.type === 'alignment' ? CFG.POINTS.PLAYER_CAP_ALIGNMENT : CFG.POINTS.PLAYER_CAP_NORMAL;
    if (!ignoreCap && newScore > cap) {
        // atomic clamp (positional $min): score never exceeds the cap
        await GuildWarEvent.updateOne(
            { eventId, players: { $elemMatch: { jid: playerJid } } },
            { $min: { 'players.$.score': cap } }
        );
        const cappedGp = Math.max(0, cap - (newScore - gp));
        return { ok: true, awarded: cappedGp, capped: true };
    }
    return { ok: true, awarded: gp, capped: false };
}

// mongoose Maps forbid '.' in keys — jids contain dots → encode them
function victimKey(jid) {
    return `victim:${String(jid).replace(/\./g, '_')}`;
}

// anti-farm: PvP GP vs the same victim decays; guildmates earn nothing
function pvpWinGp(attacker, victim) {
    if (attacker.guildId === victim.guildId) return 0; // co-op, not PvP
    const key = victimKey(victim.jid);
    const ledger = attacker.pvpMeta || {};
    const victimState = ledger.get ? ledger.get(key) : ledger[key];
    const count = (victimState && victimState.count) || 0;
    if (count > CFG.PVP.SAME_VICTIM_FLOOR_AFTER) return 0; // floor after N decayed repeats
    const mult = Math.pow(CFG.PVP.SAME_VICTIM_DECAY, count);
    return Math.max(0, Math.floor(CFG.PVP.WIN_GP * mult)); // floor: never rounds up a decayed payout
}

async function recordPvpWin(eventId, winner, loser) {
    // decay ledger must be computed from FRESH state — the caller's player
    // snapshot is stale across duels (measured: decay stuck at one step)
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const fresh = await GuildWarEvent.findOne(
        { eventId, players: { $elemMatch: { jid: winner.jid } } },
        { players: { $elemMatch: { jid: winner.jid } } }
    ).lean();
    const freshWinner = fresh?.players?.[0] || winner;
    const gp = pvpWinGp(freshWinner, loser);
    if (gp > 0) await award(eventId, winner.jid, gp, 'pvp');
    const key = victimKey(loser.jid);
    const ledger = freshWinner.pvpMeta || {};
    const prev = (ledger.get && ledger.get(key)) || ledger[key] || { count: 0 };
    const next = { count: (prev.count || 0) + 1, at: Date.now() };
    const set = {};
    set[key] = next;
    await state.updatePlayer(eventId, winner.jid, {}, { pvpMeta: set });
    return gp;
}

// ── end-of-event distribution (state.endEvent calls this) ──
// Converts live scores into guild-level XP via the existing curve, applies
// participation floor, returns the reward summary for the recap card.
async function distribute(eventDoc, reason) {
    const guilds = require('../guilds');
    const summary = { reason, guilds: [], top: [], participation: [] };

    // 1-5. participation GP — ⚔️ §22 FIX (inverted logic): the old check
    // selected score === 0, i.e. it PAID the players who did NOTHING and
    // skipped everyone who actually fought. "Participated" now means the
    // player took at least one action after joining (lastActionAt moved
    // past joinedAt) and didn't quit.
    for (const p of eventDoc.players) {
        if (p.status === 'quit' || !p.joinedAt) continue;
        const acted = (p.lastActionAt || 0) > (new Date(p.joinedAt).getTime() || 0);
        const scored = (p.score || 0) > 0;
        if (acted || scored) {
            summary.participation.push(p.name);
            const gp = CFG.POINTS.PARTICIPATION_GP;
            try { guilds.addGuildPoints(p.guildId, gp, 'Guild War participation'); } catch (e) { /* gone */ }
        }
    }

    // aggregate per guild
    const byGuild = feed.computeScoreboard(eventDoc);
    // push into the real guild level curve (earned, permanent)
    for (const g of byGuild) {
        const total = eventDoc.players.filter((p) => p.guildId === g.guildId).reduce((s, p) => s + (p.score || 0), 0);
        try {
            guilds.addGuildPoints(g.guildId, total, `Guild War ${eventDoc.eventId} (${eventDoc.type})`);
        } catch (e) { /* guild may have disbanded mid-event */ }
        summary.guilds.push({ ...g, points: total });
    }

    // individual honors
    summary.top = eventDoc.players
        .filter((p) => (p.score || 0) > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((p) => ({ name: p.name, guild: p.guildName, score: p.score }));

    await state.pushLog(eventDoc.eventId, 'rewards', 'system', `distributed ${summary.guilds.reduce((s, g) => s + g.points, 0)} GP — ${reason}`);
    return summary;
}

module.exports = { award, pvpWinGp, recordPvpWin, distribute };
