// ============================================
// ⚙️ GUILD WAR STATE MACHINE — 2026-10-03
// Lifecycle: INITIATED → REGISTRATION → ACTIVE → ENDED → REWARDS → ARCHIVED (+ABORTED)
// Persistence: Mongo doc is the source of truth. In-memory cache is a read view;
// ALL contested mutations are atomic findOneAndUpdate with state conditions
// (3 bot instances share one Atlas DB — never trust memory across instances).
// ============================================

const crypto = require('crypto');
const GuildWarEvent = require('../../models/GuildWarEvent');
const mapEngine = require('./mapEngine');
const CFG = require('./config');
const rooms = require('./rooms');
const points = require('./points');
const feed = require('./feed');

// ── in-memory read views (per instance) ──
const activeViews = new Map(); // eventId → { map topology view, doc snapshot }

function viewOf(doc) {
    // topology is immutable after generation → cheap derived view
    const roomsMap = new Map();
    for (const r of doc.rooms) roomsMap.set(r.key, r);
    const adjacency = new Map();
    for (const r of doc.rooms) {
        adjacency.set(r.key, {
            n: roomsMap.has(mapEngine.key(r.x, r.y - 1)),
            s: roomsMap.has(mapEngine.key(r.x, r.y + 1)),
            e: roomsMap.has(mapEngine.key(r.x + 1, r.y)),
            w: roomsMap.has(mapEngine.key(r.x - 1, r.y)),
        });
    }
    const view = activeViews.get(doc.eventId) || {};
    view.roomsMap = roomsMap;
    view.adjacency = adjacency;
    view.doc = doc;
    activeViews.set(doc.eventId, view);
    return view;
}

async function getEvent(eventId, { fresh = false } = {}) {
    const v = activeViews.get(eventId);
    if (v && !fresh) return v.doc;
    const doc = await GuildWarEvent.findOne({ eventId });
    if (!doc) { activeViews.delete(eventId); return null; }
    return viewOf(doc).doc;
}

async function getActiveEvents() {
    const docs = await GuildWarEvent.find({ state: { $in: ['REGISTRATION', 'ACTIVE'] } });
    return docs.map((d) => viewOf(d).doc);
}

// ── atomic mutation helpers (DB condition = the real guard) ──
async function updateRoom(eventId, roomKey, condition, update) {
    const cond = { eventId, 'rooms.key': roomKey, ...(condition || {}) };
    const setUpdate = {};
    for (const [k, val] of Object.entries(update)) setUpdate[`rooms.$[r].${k}`] = val;
    return GuildWarEvent.findOneAndUpdate(cond, { $set: setUpdate }, {
        arrayFilters: [{ 'r.key': roomKey }],
        new: true,
    });
}

async function updatePlayer(eventId, jid, condition, update) {
    const cond = { eventId, 'players.jid': jid, ...(condition || {}) };
    const setUpdate = {};
    for (const [k, val] of Object.entries(update)) setUpdate[`players.$[p].${k}`] = val;
    return GuildWarEvent.findOneAndUpdate(cond, { $set: setUpdate }, {
        arrayFilters: [{ 'p.jid': jid }],
        new: true,
    });
}

async function pushLog(eventId, type, actor, payload) {
    const entry = { t: Date.now(), type, actor: String(actor || '').slice(0, 64), payload: String(payload || '').slice(0, 200) };
    try {
        await GuildWarEvent.findOneAndUpdate(
            { eventId },
            { $push: { logTail: { $each: [entry], $slice: -300 } } }
        );
    } catch (e) { /* log tail is best-effort */ }
}

// ── lifecycle ──
async function createEvent({ type = 'normal', hostGroupId, initiatedBy, guilds = [], config = {} }) {
    const count = await GuildWarEvent.countDocuments({ state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } });
    if (count >= CFG.MAX_CONCURRENT_EVENTS) {
        return { ok: false, reason: `Too many events running (${count}/${CFG.MAX_CONCURRENT_EVENTS}).` };
    }
    const eventId = `gw_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const now = Date.now();
    const doc = await GuildWarEvent.create({
        eventId, type, hostGroupId, initiatedBy,
        guilds: guilds.map((g) => ({ guildId: g.guildId || g.name, name: g.name || g.guildId })),
        state: 'REGISTRATION',
        seed: eventId, // regenerated at start with player count baked in
        config: { ...config },
        registrationEndsAt: now + CFG.REGISTRATION_MS,
        endsAt: 0,
    });
    viewOf(doc);
    return { ok: true, event: doc };
}

async function registerPlayer(eventId, player) {
    const cond = { eventId, state: 'REGISTRATION', 'players.jid': { $ne: player.jid } };
    const sub = {
        jid: player.jid, name: player.name, guildId: player.guildId,
        guildName: player.guildName || player.guildId, status: 'active',
        lives: CFG.COMBAT.LIVES, lastActionAt: Date.now(), joinedAt: new Date(),
    };
    const doc = await GuildWarEvent.findOneAndUpdate(
        cond,
        { $addToSet: { players: sub } },
        { new: true }
    );
    return doc; // null if event not in REGISTRATION or already joined
}

async function startEvent(eventId, { deadWorld = null, worldIds = null } = {}) {
    const doc = await GuildWarEvent.findOne({ eventId, state: 'REGISTRATION' });
    if (!doc) return { ok: false, reason: 'Event not in REGISTRATION.' };
    if (!doc.players.length) return { ok: false, reason: 'No players registered.' };

    const seed = `${eventId}:${doc.players.length}:${Date.now() % 100000}`;
    const map = mapEngine.generate(seed, doc.players.length, {
        alignment: doc.type === 'alignment',
        worldIds,
    });

    // bake map into the doc (compact rooms)
    const roomDocs = [...map.rooms.values()].map((r) => ({
        key: r.key, x: r.x, y: r.y, region: r.region, type: r.type,
        state: 'UNEXPLORED', payload: {}, ring: r.ring,
        clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: [], residue: null,
    }));

    // spawn assignment: shuffle spawn keys (same-guild adjacency already minimized by farthest-point)
    const spawnKeys = mapEngine.makeRng(seed + ':spawns').shuffle(map.spawns);
    const playerDocs = doc.players.map((p, i) => ({
        ...p.toObject(),
        spawnRoomId: spawnKeys[i % spawnKeys.length],
        roomId: spawnKeys[i % spawnKeys.length],
        prevRoomId: spawnKeys[i % spawnKeys.length],
        discovered: [spawnKeys[i % spawnKeys.length]],
    }));

    // persist the pruned topology (movement + rendering derive from this)
    const edgeDocs = [];
    for (const [k, dirs] of map.adjacency) {
        for (const [d, open] of Object.entries(dirs)) if (open) edgeDocs.push(`${k}|${d}`);
    }

    const now = Date.now();
    const updated = await GuildWarEvent.findOneAndUpdate(
        { eventId, state: 'REGISTRATION' },
        {
            $set: {
                state: 'ACTIVE', seed, side: map.side, rooms: roomDocs, edges: edgeDocs,
                players: playerDocs, coreKey: map.coreKey, deadWorld: deadWorld || doc.deadWorld,
                startedAt: now,
                endsAt: now + (doc.type === 'alignment' ? CFG.ALIGNMENT_DURATION_MS : CFG.NORMAL_DURATION_MS),
            },
        },
        { new: true }
    );
    if (!updated) return { ok: false, reason: 'Event changed state concurrently.' };
    viewOf(updated);

    // seed room encounters (server-side payloads) + reveal spawn fog
    await rooms.seedEncounters(updated, map);
    for (const p of updated.players) {
        await rooms.applyFog(updated.eventId, p.jid, mapEngine.revealAround(map, p.roomId));
    }
    return { ok: true, event: updated, map };
}

// map topology view from a live doc (for movement/rendering) — edges come
// from the persisted pruned topology, NOT from coordinate-neighbor presence
function topologyOf(doc) {
    const v = viewOf(doc);
    const adjacency = new Map();
    for (const r of doc.rooms) adjacency.set(r.key, { n: false, s: false, e: false, w: false });
    for (const e of doc.edges || []) {
        const [k, d] = e.split('|');
        if (adjacency.has(k)) adjacency.get(k)[d] = true;
    }
    v.adjacency = adjacency;
    return { side: doc.side, rooms: v.roomsMap, adjacency, coreKey: doc.coreKey, alignment: doc.type === 'alignment', seed: doc.seed };
}

// ── sweeper: hard end + inactivity (called from engine 60s interval) ──
async function tick(sock, BOT_MARKER) {
    const actives = await getActiveEvents();
    const out = [];
    for (const ev of actives) {
        // registration expiry → force start
        if (ev.state === 'REGISTRATION' && ev.registrationEndsAt && Date.now() > ev.registrationEndsAt) {
            if (ev.players.length >= 2) {
                const res = await startEvent(ev.eventId);
                if (res.ok) out.push({ eventId: ev.eventId, auto: 'started' });
            } else {
                await abortEvent(ev.eventId, 'Not enough players registered.');
                out.push({ eventId: ev.eventId, auto: 'aborted-low-attendance' });
            }
            continue;
        }
        // hard end
        if (ev.state === 'ACTIVE' && ev.endsAt && Date.now() > ev.endsAt) {
            await endEvent(ev.eventId, 'Time expired.');
            out.push({ eventId: ev.eventId, auto: 'ended-time' });
            continue;
        }
        // inactivity → drop carried relics in current room
        if (ev.state === 'ACTIVE') {
            const cutoff = Date.now() - CFG.INACTIVITY_MS;
            for (const p of ev.players) {
                if (p.status === 'active' && p.lastActionAt < cutoff) {
                    await rooms.dropCarriedRelics(ev.eventId, p.jid, 'inactivity');
                    await updatePlayer(ev.eventId, p.jid, { status: 'active' }, { status: 'inactive' });
                    await pushLog(ev.eventId, 'inactivity', p.jid, 'went inactive; carried relics dropped in room');
                    feed.queue(ev.eventId, 'minor', `${p.name} has gone quiet in the Ruins…`);
                }
            }
        }
    }
    feed.tickAll(sock, BOT_MARKER);
    return out;
}

async function endEvent(eventId, reason) {
    const doc = await GuildWarEvent.findOneAndUpdate(
        { eventId, state: 'ACTIVE' },
        { $set: { state: 'ENDED' } },
        { new: true }
    );
    if (!doc) return null;
    const rewards = await points.distribute(doc, reason);
    await GuildWarEvent.updateOne({ eventId }, { $set: { state: 'REWARDS' } });
    return { event: doc, rewards };
}

async function archiveEvent(eventId, recap) {
    return GuildWarEvent.findOneAndUpdate(
        { eventId, state: 'REWARDS' },
        { $set: { state: 'ARCHIVED', archivedAt: Date.now(), ...(recap ? { config: { ...Object.fromEntries((recap instanceof Map) ? recap : Object.entries(recap)) } } : {}) } },
        { new: true }
    );
}

async function abortEvent(eventId, reason) {
    const doc = await GuildWarEvent.findOneAndUpdate(
        { eventId, state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } },
        { $set: { state: 'ABORTED', archivedAt: Date.now() } },
        { new: true }
    );
    if (doc) await pushLog(eventId, 'abort', 'system', reason || '');
    activeViews.delete(eventId);
    feed.dispose(eventId);
    return doc;
}

// restart recovery: called on boot — rebuild views, drop stale memory
async function recoverOnBoot() {
    const docs = await GuildWarEvent.find({ state: { $in: ['REGISTRATION', 'ACTIVE', 'REWARDS'] } });
    for (const d of docs) viewOf(d);
    return docs.map((d) => ({ eventId: d.eventId, state: d.state }));
}

module.exports = {
    createEvent, registerPlayer, startEvent, endEvent, archiveEvent, abortEvent,
    getEvent, getActiveEvents, updateRoom, updatePlayer, pushLog, tick,
    topologyOf, recoverOnBoot, viewOf,
    _activeViews: activeViews, // QA seam
};
