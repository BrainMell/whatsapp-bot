// ============================================
// 👁️ VISIBILITY PERKS — Guild War Overhaul 2026-10-03
// Guild level unlocks map awareness. Information advantage, never forced PvP.
// Tier ladder in config.VISIBILITY; applied at render/ping time.
// ============================================

const CFG = require('./config');
const mapEngine = require('./mapEngine');

function tierForLevel(level) {
    let t = CFG.VISIBILITY.TIERS[0];
    for (const tier of CFG.VISIBILITY.TIERS) if (level >= tier.level) t = tier;
    return t;
}

// what a player can see beyond their own fog, given their guild level
function extrasFor(eventDoc, player, guildLevel) {
    const tier = tierForLevel(guildLevel || 1);
    const now = Date.now();
    const out = { tier: tier.id, mates: [], enemyPings: [], quadrant: null };

    // L5+: guildmate positions
    if (tier.id === 'mates' || tier.id === 'detect' || tier.id === 'radius') {
        out.mates = eventDoc.players
            .filter((p) => p.guildId === player.guildId && p.jid !== player.jid && p.status === 'active')
            .map((p) => ({ jid: p.jid, name: p.name, roomId: p.roomId }));
    }

    // L3+: quadrant ping of enemy RELIC CARRIERS (Rare+ carriers expose themselves)
    if (tier.id !== 'self') {
        const refreshMs = CFG.VISIBILITY.QUADRANT_REFRESH_MS;
        const cacheOk = player.pvpMeta?.get?.('quadrantPing') || player.pvpMeta?.['quadrantPing'];
        if (!cacheOk || now - (cacheOk.at || 0) > refreshMs) {
            const carriers = eventDoc.players.filter((p) => {
                if (p.guildId === player.guildId || p.status !== 'active') return false;
                const exposing = (p.relics || []).filter((r) => CFG.RELICS.CARRY_EXPOSE_TIERS.includes(r.tier));
                return exposing.length > 0;
            });
            out.quadrant = carriers.length
                ? mapEngine.quadrant({ side: eventDoc.side }, carriers[0].roomId)
                : null;
        }
    }

    // L7+: recent-enemy detection (moved within the decay window)
    if (tier.id === 'detect' || tier.id === 'radius') {
        out.enemyPings = eventDoc.players
            .filter((p) => p.guildId !== player.guildId && p.status === 'active' && now - (p.lastActionAt || 0) < CFG.VISIBILITY.DETECT_DECAY_MS)
            .map((p) => ({ jid: p.jid, name: p.name, roomId: p.roomId, movedAt: p.lastActionAt }));
    }

    // L10: wider fog radius is applied by the renderer/applyFog (radius 2)
    out.revealRadius = tier.id === 'radius' ? CFG.VISIBILITY.RADIUS2 : 1;
    return out;
}

// fog reveal honoring the perk radius
function revealFor(eventDoc, roomId, guildLevel) {
    const radius = guildLevel >= 10 ? CFG.VISIBILITY.RADIUS2 : 1;
    const [x, y] = roomId.split(',').map(Number);
    const out = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < eventDoc.side && ny < eventDoc.side) out.push(mapEngine.key(nx, ny));
        }
    }
    return out;
}

module.exports = { tierForLevel, extrasFor, revealFor };
