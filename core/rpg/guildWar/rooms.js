// ============================================
// 🚪 ROOM OPERATIONS — Guild War Overhaul 2026-10-03
// Enter/leave/clear with atomic DB guards. Enter/occupy/clear are all
// findOneAndUpdate with state conditions — two players resolving the same
// room cannot both win the transition (multi-instance safe).
// ============================================

const GuildWarEvent = require('../../models/GuildWarEvent');
const state = require('./state');
const mapEngine = require('./mapEngine');
const feed = require('./feed');
const CFG = require('./config');

// ── encounter seeding (at event start): server-side payloads per room ──
async function seedEncounters(eventDoc, map) {
    const encounters = require('./encounters');
    const bulk = [];
    for (const room of eventDoc.rooms) {
        if (room.type === 'empty') continue;
        const payload = encounters.buildRoomPayload(eventDoc, room, map);
        if (payload && Object.keys(payload).length) {
            bulk.push({
                updateOne: {
                    filter: { eventId: eventDoc.eventId, rooms: { $elemMatch: { key: room.key } } },
                    update: { $set: { 'rooms.$.payload': payload } },
                },
            });
        }
    }
    if (bulk.length) await GuildWarEvent.bulkWrite(bulk, { ordered: false });
}

// ── fog: merge revealed keys into a player's discovered set ──
async function applyFog(eventId, jid, revealKeys) {
    const doc = await GuildWarEvent.findOneAndUpdate(
        { eventId, 'players.jid': jid },
        { $addToSet: { 'players.$[p].discovered': { $each: revealKeys } } },
        { arrayFilters: [{ 'p.jid': jid }], new: true, projection: { players: { $elemMatch: { jid } }, state: 1 } }
    );
    return doc?.players?.[0]?.discovered || null;
}

// ── enter a room (ONE atomic op: pull from old occupants + push to new) ──
// ⚔️ LOAD FIX: was 2 round-trips; aggregation-pipeline update does both in one
// server-side atomic pass. Edge validity is checked upstream (topology).
async function enterRoom(eventId, jid, fromKey, toKey) {
    await GuildWarEvent.updateOne(
        { eventId },
        [
            { $set: {
                rooms: {
                    $map: {
                        input: '$rooms',
                        as: 'r',
                        in: {
                            $switch: {
                                branches: [
                                    { case: { $and: [{ $ne: [fromKey, null] }, { $eq: ['$$r.key', fromKey] }] },
                                        then: { $mergeObjects: ['$$r', { occupants: { $setDifference: ['$$r.occupants', [jid]] } }] } },
                                    { case: { $eq: ['$$r.key', toKey] },
                                        then: { $mergeObjects: ['$$r', { occupants: { $setUnion: ['$$r.occupants', [jid]] } }] } },
                                ],
                                default: '$$r',
                            },
                        },
                    },
                },
            } },
        ],
        { updatePipeline: true }
    );
    return true;
}

async function leaveRoom(eventId, jid, roomKey) {
    await GuildWarEvent.updateOne(
        { eventId, rooms: { $elemMatch: { key: roomKey } } },
        { $pull: { 'rooms.$.occupants': jid } }
    );
}

// ── clear a room (the atomic claim): only one winner ever ──
// condition: room ACTIVE (or UNEXPLORED for instant-clear types) and not already cleared
async function clearRoom(eventId, roomKey, player, { extraPayload = null } = {}) {
    // ⚔️ CLAIM SAFETY (race bug found in S3): plain 'rooms.key' + 'rooms.state'
    // conditions can match the DOCUMENT via DIFFERENT elements, and the
    // positional $ then writes an arbitrary element (measured: 6 winners, 6
    // rooms corrupted). $elemMatch binds ALL conditions to ONE element, so
    // the positional $ always points at the claimed room and the claim is
    // lost (null) the moment another writer wins it.
    const prev = await GuildWarEvent.findOneAndUpdate(
        {
            eventId,
            rooms: {
                $elemMatch: {
                    key: roomKey,
                    state: { $in: ['UNEXPLORED', 'ACTIVE'] },
                    $or: [{ clearedBy: null }, { clearedBy: { $exists: false } }],
                },
            },
        },
        {
            $set: {
                'rooms.$.state': 'CLEARED',
                'rooms.$.clearedBy': player.jid,
                'rooms.$.clearedByGuild': player.guildId,
                'rooms.$.clearedAt': new Date(),
                ...(extraPayload || {}),
            },
        },
        { new: false } // return BEFORE → null means we did NOT win the race
    );
    if (!prev) return { won: false, reason: 'already-cleared-or-gone' };

    // residue on a tunable share of cleared rooms
    if (Math.random() < CFG.MAP.RESIDUE_CHANCE) {
        const residue = {
            by: player.name,
            guild: player.guildName || player.guildId,
            loot: Math.random() < CFG.MAP.RESIDUE_LOOT_CHANCE ? { gp: 3 + Math.floor(Math.random() * 5) } : null,
            note: 'someone has already dealt with what was here',
        };
        await GuildWarEvent.updateOne(
            { eventId, 'rooms.key': roomKey },
            { $set: { 'rooms.$.residue': residue } }
        );
    }
    return { won: true };
}

// ── room state transitions for encounter flow ──
async function markActive(eventId, roomKey) {
    return GuildWarEvent.findOneAndUpdate(
        { eventId, rooms: { $elemMatch: { key: roomKey, state: 'UNEXPLORED' } } },
        { $set: { 'rooms.$.state': 'ACTIVE' } },
        { new: false }
    );
}

async function setRoomPayload(eventId, roomKey, payloadPatch) {
    const set = {};
    for (const [k, v] of Object.entries(payloadPatch)) set[`rooms.$.payload.${k}`] = v;
    return GuildWarEvent.updateOne(
        { eventId, rooms: { $elemMatch: { key: roomKey } } },
        { $set: set }
    );
}

// 🔄 ENCOUNTER GATE (owner ruins_fixes.txt #8, 2026-10-05): puzzle
// encounters no longer start on room entry — the player must interact
// (`examine`) first. Marks the mechanism as started so later messages are
// answers. Idempotent; only touches rooms still in play.
async function startPuzzle(eventId, roomKey) {
    try {
        await GuildWarEvent.updateOne(
            { eventId, rooms: { $elemMatch: { key: roomKey, state: { $in: ['UNEXPLORED', 'ACTIVE'] } } } },
            { $set: { 'rooms.$.payload.puzzle.started': true } }
        );
    } catch (e) { /* best-effort — the in-memory flag still gates this turn */ }
}

// ── PUZZLE ATTEMPT CLAIM (owner brief §7: "one authoritative evaluation") ──
// The old flow read attemptsUsed, evaluated, then wrote it back — concurrent
// DMs all read the same value, all evaluated, and last-write-wins ate the
// attempt count (measured: a burst of 3 wrong answers advanced the counter
// by ONE). Now the attempt IS an atomic $inc: each player message claims
// exactly one attempt and the handler evaluates against the RETURNED room,
// so two rapid answers can never share an attempt number or evaluate stale
// state. Returns { attempts, puzzle } or null when the room is gone/resolved.
async function claimPuzzleAttempt(eventId, roomKey) {
    const doc = await GuildWarEvent.findOneAndUpdate(
        {
            eventId,
            rooms: { $elemMatch: { key: roomKey, state: { $in: ['UNEXPLORED', 'ACTIVE'] } } },
        },
        { $inc: { 'rooms.$.payload.puzzle.attemptsUsed': 1 } },
        { new: true, projection: { rooms: { $elemMatch: { key: roomKey } } } }
    ).lean();
    const room = doc?.rooms?.[0];
    if (!room) return null;
    const puzzle = room.payload?.puzzle
        ? (typeof room.payload.puzzle.get === 'function'
            ? Object.fromEntries(room.payload.puzzle.entries())
            : room.payload.puzzle)
        : null;
    if (!puzzle) return null;
    return { attempts: puzzle.attemptsUsed || 0, puzzle };
}

// exhaustion reset: the seal restarts from the first inscription — one atomic
// write, so a shock is followed by a CLEAN attempt cycle, never a treadmill
// where every further text input shocks forever.
async function resetPuzzleAttempts(eventId, roomKey) {
    return setRoomPayload(eventId, roomKey, { 'puzzle.attemptsUsed': 0 });
}

// ── ⏳ FINALE (owner 2026-10-05 23:09Z): the war timer ran out — the war
// does NOT end. FOUR WARDEN bosses rise "around the map" and the war only
// concludes when all four fall. Room selection is farthest-point sampling
// (each new warden maximizes the minimum Manhattan distance to the ones
// already placed), so the wardens genuinely spread across the four quarters
// of the ruins instead of clustering. Each warden room:
//   • type 'finale' + payload {finaleBoss, wardenIndex, wardenName, enemies, boss, theme}
//   • revealed on EVERY active champion's map (fog push) — hunting them is
//     the whole point of the phase
// All writes are atomic room updates; the caller (state.tick) already holds
// the flow lease and the {finale: null} flip guards double-spawns.
async function spawnFinaleBosses(eventDoc) {
    const encounters = require('./encounters');
    const CFG = require('./config');
    const bossLvl = Math.max(1, Math.round(CFG.COMBAT.BASE_ENEMY_LEVEL * CFG.FINALE.BOSS_LEVEL_MULT));
    const theme = encounters.worldTheme(eventDoc.deadWorld);
    const spawnSet = new Set((eventDoc.players || []).map((p) => p.spawnRoomId).filter(Boolean));

    // candidates: not the World Core, not a landing hall
    const cands = eventDoc.rooms.filter((r) => r.type !== 'core' && !spawnSet.has(r.key));
    if (!cands.length) return { ok: false, reason: 'no-candidate-rooms' };

    // farthest-point sampling by Manhattan distance
    const [cx, cy] = [eventDoc.side / 2, eventDoc.side / 2];
    const dist2 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    let picked = [];
    // seed with the candidate farthest from the map centre
    let first = cands[0], firstD = -1;
    for (const r of cands) {
        const d = Math.abs(r.x - cx) + Math.abs(r.y - cy);
        if (d > firstD) { firstD = d; first = r; }
    }
    picked.push(first);
    while (picked.length < Math.min(CFG.FINALE.BOSS_COUNT, cands.length)) {
        let best = null, bestD = -1;
        for (const r of cands) {
            if (picked.includes(r)) continue;
            const d = Math.min(...picked.map((p) => dist2(p, r)));
            if (d > bestD) { bestD = d; best = r; }
        }
        if (!best) break;
        picked.push(best);
    }

    const bosses = [];
    const bulk = [];
    picked.forEach((r, i) => {
        const name = CFG.FINALE.WARDEN_NAMES[i % CFG.FINALE.WARDEN_NAMES.length];
        bosses.push({ key: r.key, index: i, name, dead: false });
        bulk.push({
            updateOne: {
                filter: { eventId: eventDoc.eventId, rooms: { $elemMatch: { key: r.key } } },
                update: {
                    $set: {
                        'rooms.$.type': 'finale',
                        'rooms.$.payload': {
                            theme: theme.key,
                            flavor: theme.flavor,
                            boss: true,
                            finaleBoss: true,
                            wardenIndex: i,
                            wardenName: name,
                            enemies: [{ level: bossLvl }],
                        },
                    },
                },
            },
        });
    });
    await GuildWarEvent.bulkWrite(bulk, { ordered: false });

    // persist the warden ledger on the doc (the tick + onEnd hook read it)
    await GuildWarEvent.updateOne({ eventId: eventDoc.eventId }, { $set: { 'finale.bosses': bosses } });

    // reveal every warden on every active champion's map
    const reveal = bosses.map((b) => b.key);
    for (const p of eventDoc.players || []) {
        if (p.status !== 'active') continue;
        await applyFog(eventDoc.eventId, p.jid, reveal).catch(() => {});
    }
    return { ok: true, bosses, bossLvl };
}

// ── inactivity: carried relics drop into the current room's loot ──
async function dropCarriedRelics(eventId, jid, reason) {
    const doc = await GuildWarEvent.findOne({ eventId }, { players: { $elemMatch: { jid } } }).lean();
    const p = doc?.players?.[0];
    if (!p || !p.relics || !p.relics.length) return 0;
    const dropped = p.relics;
    await GuildWarEvent.updateOne(
        { eventId, 'players.jid': jid },
        { $set: { 'players.$.relics': [] } }
    );
    await GuildWarEvent.updateOne(
        { eventId, rooms: { $elemMatch: { key: p.roomId } } },
        { $push: { 'rooms.$.payload.droppedRelics': { $each: dropped.map((r) => r.toObject ? r.toObject() : r) } } }
    );
    await state.pushLog(eventId, 'relic-drop', jid, `${dropped.length} relics dropped (${reason})`);
    // 💬 dedupe (owner copy overhaul 2026-10-05): the FINAL-DEATH headline in
    // index.js already tells the group the relics lie where the champion
    // fell — the generic drop line only fires for silent-logouts.
    if (reason !== 'final death') {
        feed.queue(eventId, 'normal', `💼 ${p.name} has gone quiet — their carried relics lie scattered where they stood, ripe for the next passerby.`);
    }
    return dropped.length;
}

module.exports = {
    seedEncounters, applyFog, enterRoom, leaveRoom, clearRoom,
    markActive, setRoomPayload, dropCarriedRelics,
    startPuzzle, claimPuzzleAttempt, resetPuzzleAttempts,
    spawnFinaleBosses,
};
