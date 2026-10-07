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
                                        then: { $mergeObjects: ['$$r', {
                                            occupants: { $setDifference: ['$$r.occupants', [jid]] },
                                            // 🪙 LOOT DESPAWN (owner 2026-10-06): when the player who
                                            // CLEARED a consumable room walks out, the fresh-loot sprite
                                            // (gold pile / cavity coins / idol) dies with their presence —
                                            // every later render (theirs or anyone's) shows the looted marker.
                                            lootFresh: { $cond: [
                                                { $and: [{ $eq: ['$$r.state', 'CLEARED'] }, { $eq: ['$$r.clearedBy', jid] }, { $eq: ['$$r.lootFresh', true] }] },
                                                false,
                                                '$$r.lootFresh',
                                            ] },
                                        }] } },
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
    // 🪙 LOOT DESPAWN (owner 2026-10-06): upgraded from a bare $pull to a
    // pipeline so the looter's exit ALSO kills the fresh-loot sprite in the
    // same atomic pass (flee/return/war-end paths route through here).
    await GuildWarEvent.updateOne(
        { eventId },
        [
            { $set: {
                rooms: {
                    $map: {
                        input: '$rooms',
                        as: 'r',
                        in: {
                            $cond: [{ $eq: ['$$r.key', roomKey] }, {
                                $mergeObjects: ['$$r', {
                                    occupants: { $setDifference: [{ $ifNull: ['$$r.occupants', []] }, [jid]] },
                                    lootFresh: { $cond: [
                                        { $and: [{ $eq: ['$$r.state', 'CLEARED'] }, { $eq: ['$$r.clearedBy', jid] }, { $eq: ['$$r.lootFresh', true] }] },
                                        false,
                                        '$$r.lootFresh',
                                    ] },
                                }],
                            }, '$$r'],
                        },
                    },
                },
            } },
        ],
        { updatePipeline: true }
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
                'rooms.$.lootFresh': true,   // 🪙 spoils render while the clearer stays; despawns on their exit
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

// ── ⏳ THE FOUR WARDENS ──
// owner 2026-10-05 23:09Z: "If a timer brings the Guild War to an end, place
// 4 bosses around the map. After all 4 bosses die, then the Guild War ends."
// owner 2026-10-07 (Test Run 2 directive): the four bosses are ON THE MAP
// FROM WAR START — randomly placed — and the war only concludes when all
// four fall. Room selection SCATTERS like the current (secret-room) bosses
// do — random mid-map rooms, organically spread — but never pinned to the
// border corners the way the old farthest-point sampler did (owner
// 2026-10-06 01:07Z: "shouldn't be at the 4 edges, scattered around like
// the current boss"). Eligibility is tiered, relaxing only when a small map
// forces it, and a minimum pairwise separation keeps them from clustering.
// Each warden room:
//   • type 'finale' + payload {finaleBoss, wardenIndex, wardenName, enemies, boss, theme}
//   • revealed on EVERY active champion's map (fog push) — hunting them is
//     the whole point of the phase
// All writes are atomic room updates; idempotent by the caller's ledger flip
// (startEvent's ACTIVE flip at war start / the tick's {finale: null} flip on
// the legacy timer path).
async function spawnFinaleBosses(eventDoc) {
    const encounters = require('./encounters');
    const CFG = require('./config');
    const bossLvl = Math.max(1, Math.round(CFG.COMBAT.BASE_ENEMY_LEVEL * CFG.FINALE.BOSS_LEVEL_MULT));
    const theme = encounters.worldTheme(eventDoc.deadWorld);
    const spawnSet = new Set((eventDoc.players || []).map((p) => p.spawnRoomId).filter(Boolean));

    // candidates: not the World Core, not a landing hall, not already a lair
    const cands = eventDoc.rooms.filter((r) => r.type !== 'core' && r.type !== 'finale' && !spawnSet.has(r.key));
    if (!cands.length) return { ok: false, reason: 'no-candidate-rooms' };

    // scatter sampling (owner fix 01:07Z — see block comment above):
    //   T0 interior rooms ≥2 steps from every landing hall
    //   T1 interior rooms (warden may sit next to a landing hall)
    //   T2 anywhere except core + landing halls (tiny maps only)
    // The border ring is excluded in T0/T1 so wardens never hug the map
    // edges; the pairwise Manhattan separation starts at ≈30% of the map
    // side and relaxes until the quota fills. Random shuffle = the organic
    // "like the current boss" feel instead of deterministic corners.
    const side = eventDoc.side;
    const last = side - 1;
    const mdist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const spawnRooms = (eventDoc.players || [])
        .map((p) => eventDoc.rooms.find((r) => r.key === p.spawnRoomId))
        .filter(Boolean);
    const interior = (r) => r.x > 0 && r.y > 0 && r.x < last && r.y < last;
    const spawnDist = (r) => (spawnRooms.length ? Math.min(...spawnRooms.map((s) => mdist(s, r))) : 99);
    const tiers = [
        (r) => interior(r) && spawnDist(r) >= 2,
        interior,
        () => true,
    ];
    const want = Math.min(CFG.FINALE.BOSS_COUNT, cands.length);
    const shuffle = (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    let picked = [];
    outer: for (const tier of tiers) {
        for (let sep = Math.max(2, Math.round(side * 0.3)); sep >= 1; sep--) {
            picked = [];
            for (const r of shuffle(cands.filter(tier))) {
                if (picked.every((p) => mdist(p, r) >= sep)) picked.push(r);
                if (picked.length === want) break outer;
            }
        }
    }
    // absolute fallback: top up from any untouched candidate so the finale
    // can never fail to place its wardens
    if (picked.length < want) {
        picked = picked.concat(cands.filter((r) => !picked.includes(r)).slice(0, want - picked.length));
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
