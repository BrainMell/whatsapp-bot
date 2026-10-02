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
async function award(eventId, playerJid, baseGp, activity, { coopBonus = false, ignoreCap = false } = {}) {
    const ev = await state.getEvent(eventId);
    if (!ev || ev.state !== 'ACTIVE') return { ok: false, awarded: 0, capped: false };
    const p = ev.players.find((x) => x.jid === playerJid);
    if (!p) return { ok: false, awarded: 0, capped: false };

    let gp = Math.round(baseGp);
    if (coopBonus && activity !== 'pvp') gp = Math.round(gp * (1 + CFG.POINTS.COOP_BONUS));
    if (ev.type === 'alignment') gp = Math.round(gp * CFG.POINTS.ALIGNMENT_MULT);

    const cap = ev.type === 'alignment' ? CFG.POINTS.PLAYER_CAP_ALIGNMENT : CFG.POINTS.PLAYER_CAP_NORMAL;
    const capped = !ignoreCap && (p.score + gp) > cap;
    if (capped) gp = Math.max(0, cap - p.score);
    if (gp <= 0) return { ok: true, awarded: 0, capped: true };

    await state.updatePlayer(eventId, playerJid, {}, {
        score: (p.score || 0) + gp,
        gpEarned: (p.gpEarned || 0) + gp,
        lastActionAt: Date.now(),
    });
    return { ok: true, awarded: gp, capped };
}

// anti-farm: PvP GP vs the same victim decays; guildmates earn nothing
function pvpWinGp(attacker, victim) {
    if (attacker.guildId === victim.guildId) return 0; // co-op, not PvP
    const key = victim.jid;
    const ledger = attacker.pvpMeta || {};
    const victimState = ledger.get ? ledger.get(`victim:${key}`) : ledger[`victim:${key}`];
    const count = (victimState && victimState.count) || 0;
    if (count >= CFG.PVP.SAME_VICTIM_FLOOR_AFTER) return 0;
    const mult = Math.pow(CFG.PVP.SAME_VICTIM_DECAY, count);
    return Math.max(0, Math.round(CFG.PVP.WIN_GP * mult));
}

async function recordPvpWin(eventId, winner, loser) {
    const gp = pvpWinGp(winner, loser);
    if (gp > 0) await award(eventId, winner.jid, gp, 'pvp');
    // update decay ledger
    const key = `victim:${loser.jid}`;
    const ledger = winner.pvpMeta || {};
    const prev = (ledger.get && ledger.get(key)) || { count: 0 };
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

    // 1. participation floor for anyone who acted at least once
    for (const p of eventDoc.players) {
        if ((p.score || 0) === 0 && p.status !== 'quit' && p.joinedAt) {
            summary.participation.push(p.name);
        }
    }

    // 2. aggregate per guild
    const byGuild = feed.computeScoreboard(eventDoc);
    // 3. push into the real guild level curve (earned, permanent)
    for (const g of byGuild) {
        const total = eventDoc.players.filter((p) => p.guildId === g.guildId).reduce((s, p) => s + (p.score || 0), 0);
        try {
            guilds.addGuildPoints(g.guildId, total, `Guild War ${eventDoc.eventId} (${eventDoc.type})`);
        } catch (e) { /* guild may have disbanded mid-event */ }
        summary.guilds.push({ ...g, points: total });
    }

    // 4. individual honors
    summary.top = eventDoc.players
        .filter((p) => (p.score || 0) > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((p) => ({ name: p.name, guild: p.guildName, score: p.score }));

    // 5. participation GP (small, distinct from accomplishments)
    for (const p of eventDoc.players) {
        if ((p.score || 0) === 0 && p.status !== 'quit' && p.joinedAt) {
            const gp = CFG.POINTS.PARTICIPATION_GP;
            try { guilds.addGuildPoints(p.guildId, gp, 'Guild War participation'); } catch (e) { /* gone */ }
        }
    }

    await state.pushLog(eventDoc.eventId, 'rewards', 'system', `distributed ${summary.guilds.reduce((s, g) => s + g.points, 0)} GP — ${reason}`);
    return summary;
}

module.exports = { award, pvpWinGp, recordPvpWin, distribute };
