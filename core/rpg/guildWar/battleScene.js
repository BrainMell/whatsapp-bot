// ============================================
// ⚔️ RUINS BATTLE SCENE — the fight happens IN the room
// Owner directive 2026-10-05 23:39Z: "DO NOT switch to a separate battle
// scene or use the old encounter presentation. Keep the exact same room,
// doors, background, player sprite, enemy sprites, positioning, HP/mana
// HUD, etc. The battle system should happen directly on top of that
// existing room scene."
// → every ruins combat image (START + every TURN) is the SAME roomScene
//   render the player was just shown — same plate, same entry-door spawn
//   spot and facing, same pack positions — with only the live battle state
//   layered on: HP pills tick down, dead enemies leave the scene, a gold
//   ground ring marks the active actor, and the default-encounter HUD
//   panel carries the live HP/mana. NO banner, NO map panel, NO Go
//   microservice, NO sprite swap after attacks.
// ============================================

const roomScene = require('./roomScene');
const combatIntegration = require('../combatIntegration');

// lazy: models pull mongoose — keep this module require-light for workers
const GuildWarEventModel = () => require('../../models/GuildWarEvent');

// The frozen layout per combat session: START computes the plan ONCE and
// every TURN re-uses it, so the scene is pixel-stable even if another
// player wanders into the room mid-fight (occupants would otherwise shift
// the composition between turns).
const _layoutCache = new Map(); // sessionKey → { plan, exits }
const _LAYOUT_MAX = 240;
function layoutFor(sessionKey) {
    let l = _layoutCache.get(sessionKey);
    if (!l) {
        l = { plan: null, exits: null };
        _layoutCache.set(sessionKey, l);
        if (_layoutCache.size > _LAYOUT_MAX) {
            const oldest = _layoutCache.keys().next().value;
            if (oldest !== undefined) _layoutCache.delete(oldest);
        }
    }
    return l;
}
function clearLayout(sessionKey) {
    if (sessionKey) _layoutCache.delete(sessionKey);
}

function startCaption(state, turnOrderStr) {
    return combatIntegration.generateStartCaption(state.players, state.enemies, {
        rank: state.dungeonRank,
        turnOrderStr: turnOrderStr || null,
        theme: { theme: 'The Ruins', description: 'A fierce fight breaks out!' },
    });
}

// Render the ruins battle image for the CURRENT combat state.
//   state   — guildAdventure combat state (players/enemies/ruinsMeta/sessionKey)
//   phase   - 'START' | 'TURN'
//   turnInfo- the last turn payload (TURN renders; drives caption + ring)
//   povJid  — render from THIS participant's perspective (co-op joiners who
//             arrived after START; the frozen layout belongs to the starter)
//   freshPlan — compute a NEW plan for the POV instead of the frozen one
// Returns { success, buffer, caption } — same shape generateCombatScene
// returns, so the existing send/timeout logic in guildAdventure applies.
async function renderBattleImage(state, { phase = 'START', turnInfo = null, turnOrderStr = null, povJid = null, freshPlan = false } = {}) {
    try {
        const meta = state.ruinsMeta;
        const me = povJid
            ? (state.players || []).find((p) => p.jid === povJid)
            : state.players && state.players[0];
        if (!meta || !me) return { success: false };

        const doc = await GuildWarEventModel().findOne({ eventId: meta.eventId }).lean();
        const room = doc && (doc.rooms || []).find((r) => r.key === meta.roomKey);
        if (!doc || !room) return { success: false };

        // the event row carries roomId/prevRoomId → the battle render spawns
        // at the SAME entry-door spot (and facing) the intro scene used
        const prow = (doc.players || []).find((p) => p.jid === me.jid)
            || { jid: me.jid, roomId: meta.roomKey, prevRoomId: meta.roomKey, discovered: [] };

        // frozen layout (plan + exits) — computed once per fight. A POV render
        // (freshPlan) deliberately skips the cache: the joiner gets their OWN
        // entry-spot composition incl. themselves, everyone else stays
        // pixel-stable on the starter's frozen plan.
        let layout = freshPlan ? null : layoutFor(state.sessionKey);
        if (!layout) {
            // POV render: fresh plan, never cached
            layout = { exits: roomScene.exitsFor(doc, prow) };
            layout.plan = roomScene.planFor(doc, prow, room, layout.exits);
        } else if (!layout.plan) {
            layout.exits = roomScene.exitsFor(doc, prow);
            layout.plan = roomScene.planFor(doc, prow, room, layout.exits);
        }

        const enemies = state.enemies || [];
        const battle = {
            player: {
                hp: me.currentHP,
                maxHp: Math.max(1, Math.floor((me.stats && (me.stats.maxHp || me.stats.hp)) || me.currentHP || 100)),
                energy: me.mana,
                maxEnergy: Math.max(1, Math.floor(me.maxMana || 100)),
                state: phase === 'TURN' ? `TURN ${(turnInfo && turnInfo.turnNumber) || ''}`.trim() : 'BATTLE!',
            },
            enemyStates: enemies.map((e) => ({
                name: e.name,
                hp: Math.max(0, Math.floor(e.currentHP ?? (e.stats && e.stats.hp) ?? 0)),
                maxHp: Math.max(1, Math.floor((e.stats && e.stats.maxHp) || e.currentHP || 1)),
                alive: Math.floor(e.currentHP ?? (e.stats && e.stats.hp) ?? 0) > 0,
            })),
            active: null,
            panel: true,
        };
        const actor = turnInfo && turnInfo.actor;
        if (phase === 'TURN' && actor) {
            if (actor.isEnemy) battle.active = enemies.findIndex((e) => e === actor || e.name === actor.name);
            else if (!actor.isSummon) battle.active = 'player';
        }

        const buffer = await roomScene.renderRoomScene(doc, prow, room, {
            prefix: '.',
            plan: layout.plan,
            exits: layout.exits,
            battle,
        });
        if (!buffer) return { success: false };

        const caption = phase === 'TURN'
            ? combatIntegration.generateTurnCaption(state.players, state.enemies, turnInfo || {})
            : startCaption(state, turnOrderStr);
        return { success: true, buffer, caption };
    } catch (e) {
        console.error('[GW battleScene] render failed:', e?.message);
        return { success: false };
    }
}

module.exports = { renderBattleImage, clearLayout };
