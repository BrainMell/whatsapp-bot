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

// ── enter a room (atomic: pull from old occupants, push to new) ──
async function enterRoom(eventId, jid, fromKey, toKey) {
    if (fromKey && fromKey !== toKey) {
        await GuildWarEvent.updateOne(
            { eventId, rooms: { $elemMatch: { key: fromKey } } },
            { $pull: { 'rooms.$.occupants': jid } }
        );
    }
    const entered = await GuildWarEvent.findOneAndUpdate(
        { eventId, rooms: { $elemMatch: { key: toKey } } },
        { $addToSet: { 'rooms.$.occupants': jid } },
        { new: false }
    );
    return !!entered;
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

// ── inactivity: carried relics drop into the current room's loot ──
async function dropCarriedRelics(eventId, jid, reason) {
    const doc = await GuildWarEvent.findOne({ eventId }, { players: { $elemMatch: { jid } } });
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
    feed.queue(eventId, 'normal', `💼 ${p.name}'s carried relics fell where they stood…`);
    return dropped.length;
}

module.exports = {
    seedEncounters, applyFog, enterRoom, leaveRoom, clearRoom,
    markActive, setRoomPayload, dropCarriedRelics,
};
