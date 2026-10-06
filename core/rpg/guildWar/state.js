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
// ⚠️ rooms/feed/points require this module back — load them LAZILY inside
// functions to break the circular require (a top-level require here would
// hand them this module's half-initialized exports object).
const lazy = {};
function getRooms() { return lazy.rooms || (lazy.rooms = require('./rooms')); }
function getPoints() { return lazy.points || (lazy.points = require('./points')); }
function getFeed() { return lazy.feed || (lazy.feed = require('./feed')); }

// ── in-memory read views (per instance) ──
const activeViews = new Map(); // eventId → { map topology view, doc snapshot }

// adjacency derives ONLY from the immutable pruned edges → cache by
// (eventId, edges.length); rebuilding it per read measurably stalls the loop
const adjacencyCache = new Map(); // eventId → { edgesLen, adjacency }

// room key→index is IMMUTABLE (rooms are baked once at startEvent and never
// reordered — subdoc updates replace elements in place) → cache the index map
// per event instead of rebuilding a Map over 1800+ rooms on every read
const roomIndexCache = new Map(); // eventId → Map(key → index)

function roomLookup(doc) {
    let idx = roomIndexCache.get(doc.eventId);
    if (!idx || idx.size !== doc.rooms.length) {
        idx = new Map();
        doc.rooms.forEach((r, i) => idx.set(r.key, i));
        roomIndexCache.set(doc.eventId, idx);
    }
    return {
        get: (key) => {
            const i = idx.get(key);
            return i === undefined ? undefined : doc.rooms[i];
        },
    };
}

function viewOf(doc) {
    const roomsMap = roomLookup(doc);
    const edgesLen = (doc.edges || []).length;
    let cached = adjacencyCache.get(doc.eventId);
    if (!cached || cached.edgesLen !== edgesLen) {
        const adjacency = new Map();
        for (const r of doc.rooms) adjacency.set(r.key, { n: false, s: false, e: false, w: false });
        for (const e of doc.edges || []) {
            const [k, d] = e.split('|');
            if (adjacency.has(k)) adjacency.get(k)[d] = true;
        }
        cached = { edgesLen, adjacency };
        adjacencyCache.set(doc.eventId, cached);
    }
    const view = activeViews.get(doc.eventId) || {};
    view.roomsMap = roomsMap;
    view.adjacency = cached.adjacency;
    view.doc = doc;
    activeViews.set(doc.eventId, view);
    return view;
}

async function getEvent(eventId, { fresh = false } = {}) {
    const v = activeViews.get(eventId);
    if (v && !fresh) return v.doc;
    // ⚔️ .lean(): skip mongoose casting of thousands of room subdocs on every
    // read (measured: multi-second loop stalls without it at 100+ players).
    // Lean POJOs are read-only views — ALL mutations go through atomic
    // findOneAndUpdate helpers, so nothing here needs a full Document.
    const doc = await GuildWarEvent.findOne({ eventId }).lean();
    if (!doc) { activeViews.delete(eventId); return null; }
    return viewOf(doc).doc;
}

// ⚔️ post-move context in ONE projected read (~1KB) instead of re-reading
// the entire map (measured: 1849-room full reads per move = GC storms at
// alignment scale). Players return as light rows for mate/foe detection.
async function getMoveContext(eventId, roomKey) {
    // ⚔️ FIX (2026-10-04): `eventId: 1` was MISSING from this projection —
    // callers read ctxDoc.eventId and got undefined, so every presentRoom
    // fresh re-read returned null and the MAP + SCENE silently never sent
    // on room entry (the "navigation overhaul" shipped half-blind).
    const doc = await GuildWarEvent.findOne(
        { eventId },
        { eventId: 1, rooms: { $elemMatch: { key: roomKey } }, 'players.jid': 1, 'players.name': 1, 'players.guildId': 1, 'players.guildName': 1, 'players.roomId': 1, 'players.status': 1, side: 1, coreKey: 1, deadWorld: 1, type: 1, state: 1, seed: 1, edges: 1 }
    ).lean();
    if (!doc) return null;
    doc.room = doc.rooms?.[0] || null;
    delete doc.rooms;
    return doc;
}

async function getActiveEvents() {
    const docs = await GuildWarEvent.find({ state: { $in: ['REGISTRATION', 'ACTIVE'] } }).lean();
    return docs.map((d) => viewOf(d).doc);
}

// ── atomic mutation helpers (DB condition = the real guard) ──
async function updateRoom(eventId, roomKey, condition, update) {
    // $elemMatch binds the room conditions to ONE element (claim-safe);
    // extra `condition` entries are room-subdoc field conditions.
    const elem = { key: roomKey, ...(condition || {}) };
    const setUpdate = {};
    for (const [k, val] of Object.entries(update)) setUpdate[`rooms.$.${k}`] = val;
    return GuildWarEvent.findOneAndUpdate(
        { eventId, rooms: { $elemMatch: elem } },
        { $set: setUpdate },
        { new: false }
    );
}

async function updatePlayer(eventId, jid, condition, update) {
    // positional + $elemMatch (same claim-safety rationale as updateRoom)
    const elem = { jid, ...(condition || {}) };
    const setUpdate = {};
    for (const [k, val] of Object.entries(update)) setUpdate[`players.$.${k}`] = val;
    // new:false: callers use the result only as a match indicator — returning
    // the updated doc forces mongoose to re-cast the entire map (measured stall)
    return GuildWarEvent.findOneAndUpdate(
        { eventId, players: { $elemMatch: elem } },
        { $set: setUpdate },
        { new: false }
    );
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
    if (count >= CFG.MAX_CONCURRENT_EVENTS && process.env.GW_TEST !== '1') {
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
    const doc = await GuildWarEvent.findOne({ eventId, state: 'REGISTRATION' }).lean();
    if (!doc) return { ok: false, reason: 'Event not in REGISTRATION.' };
    if (!doc.players.length) return { ok: false, reason: 'No players registered.' };

    const seed = `${eventId}:${doc.players.length}:${Date.now() % 100000}`;
    const map = mapEngine.generate(seed, doc.players.length, {
        alignment: doc.type === 'alignment',
        worldIds,
    });

    // bake map into the doc (compact rooms)
    // 💡 VISUAL VARIANTS (owner spec §7): each room gets a persistent Ruins
    // ambience variant at bake time — weighted by ring (deeper rooms trend
    // darker/damaged), seeded so the SAME room ALWAYS renders the SAME look.
    const variantRng = mapEngine.makeRng(seed + ':variants');
    const roomScene = require('./roomScene');
    const VARIANT_BAG = roomScene.ROOM_VARIANTS;
    const roomDocs = [...map.rooms.values()].map((r) => {
        // weighting: intact/mossy common near spawn; cracked/dim/skulls/overgrown rise with depth
        const depth = Math.min(1, (r.ring || 0) / 6);
        const weights = VARIANT_BAG.map((v) => {
            if (v === 'intact') return 3.2 - depth * 1.6;
            if (v === 'mossy') return 2.4;
            if (v === 'overgrown') return 1.2 + depth;
            if (v === 'cracked') return 0.9 + depth * 1.4;
            if (v === 'skulls') return 0.7 + depth * 1.2;
            return 0.6 + depth * 1.5; // dim
        });
        const total = weights.reduce((a, b) => a + b, 0);
        let roll = variantRng.next() * total, variant = VARIANT_BAG[0];
        for (let i = 0; i < VARIANT_BAG.length; i++) { roll -= weights[i]; if (roll <= 0) { variant = VARIANT_BAG[i]; break; } }
        return {
            key: r.key, x: r.x, y: r.y, region: r.region, type: r.type,
            state: 'UNEXPLORED', payload: {}, ring: r.ring, variant,
            clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: [], residue: null,
        };
    });

    // spawn assignment: shuffle spawn keys (same-guild adjacency already minimized by farthest-point)
    const spawnKeys = mapEngine.makeRng(seed + ':spawns').shuffle(map.spawns);

    // 🛡️ OWNER RULE 2026-10-05 (live playtest): "players that are weaker than
    // the monsters in a ruin should never spawn into a room with monsters."
    // A champion's landing hall is now ALWAYS monster-free: combat/coop
    // spawn rooms are rebaked as safe 'empty' halls BEFORE payloads are
    // seeded — so the intro text, the render and the encounter payload all
    // agree. Defeat respawn reuses spawnRoomId, so this guards both paths.
    // (The buildRoomPayload spawn-guard in encounters.js is the second belt:
    // it strips any enemies/boss a spawn room could still roll, e.g. a
    // secret chamber's boss.)
    const HOSTILE_TYPES = new Set(['combat', 'coop']);
    for (const k of new Set(spawnKeys)) {
        const rd = roomDocs.find((r) => r.key === k);
        const mr = map.rooms.get(k);
        if (rd && HOSTILE_TYPES.has(rd.type)) rd.type = 'empty';
        if (mr && HOSTILE_TYPES.has(mr.type)) mr.type = 'empty';
    }

    const playerDocs = doc.players.map((p, i) => ({
        ...(p.toObject ? p.toObject({ depopulate: true }) : p),
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
    await getRooms().seedEncounters(updated, map);
    for (const p of updated.players) {
        await getRooms().applyFog(updated.eventId, p.jid, mapEngine.revealAround(map, p.roomId));
    }
    // 🤝 CO-OP FOUNDATION (owner 2026-10-05 23:09Z): room occupancy must
    // include DEPLOYED champions — `.j talk` listeners, co-op party-at-start
    // seating (encounters.startRoomCombat reads room.occupants) and the
    // shared-battle rules all key off it. Moves maintained the list; the
    // deployment write above never did, so a champion who had not moved yet
    // was invisible inside their own spawn chamber.
    for (const p of updated.players) {
        await getRooms().enterRoom(updated.eventId, p.jid, null, p.roomId).catch(() => {});
    }
    return { ok: true, event: updated, map };
}

// map topology view from a live doc (for movement/rendering) — edges come
// from the persisted pruned topology, NOT from coordinate-neighbor presence
function topologyOf(doc) {
    const v = viewOf(doc);
    return { side: doc.side, rooms: v.roomsMap, adjacency: v.adjacency, coreKey: doc.coreKey, alignment: doc.type === 'alignment', seed: doc.seed };
}

// ── sweeper: hard end + inactivity (called from engine 60s interval) ──

// ⚔️ CROSS-BOX FLOW LEASE (2026-10-05): all 3 instances tick every event on
// one shared DB. Proactive flows — auto-start, the start-card DMs, hard end,
// inactivity sweeps — used to fire on EVERY instance (Mellow's playtest got
// 4× start cards: the atomic state guard stops double-START, but nothing
// stopped double-ANNOUNCE). The lease names the single instance allowed to
// flow an event; refresh is free for the holder, takeover after 90s TTL.
function _tenantId() {
    try { return require('../../../botConfig').getBotName() || 'gw-inst'; }
    catch (e) { return 'gw-inst'; }
}
async function claimFlow(eventId, ttlMs = 90 * 1000) {
    const me = _tenantId();
    const now = Date.now();
    try {
        const res = await GuildWarEvent.findOneAndUpdate(
            { eventId, $or: [
                { 'flow.owner': me },
                { 'flow.at': { $lt: now - ttlMs } },
                { flow: null },   // covers fresh docs (Mixed default null) AND pre-lease docs (field absent)
            ] },
            { $set: { flow: { owner: me, at: now } } },
            { new: true, projection: { _id: 1 } }
        ).lean();
        return !!res;
    } catch (e) { return true; } // lease infra failure → legacy behavior (don't freeze flows)
}

async function tick(sock, BOT_MARKER) {
    const actives = await getActiveEvents();
    const out = [];
    for (const ev of actives) {
        // 🏠 cross-box isolation: a bot that is not a member of the host group
        // is a pure SPECTATOR for this war — no flows, no lease, no start
        // cards, no sweeps (it also cannot post the feed; feed.js gates that
        // independently). DM command handling stays open to every bot.
        if (ev.hostGroupId && !(await getFeed().isMemberOf(sock, ev.hostGroupId))) continue;
        // flow lease: exactly ONE member instance runs the proactive blocks
        if (!(await claimFlow(ev.eventId))) continue;
        // registration expiry → force start
        if (ev.state === 'REGISTRATION' && ev.registrationEndsAt && Date.now() > ev.registrationEndsAt) {
            if (ev.players.length >= 2) {
                const res = await startEvent(ev.eventId);
                if (res.ok) {
                    out.push({ eventId: ev.eventId, auto: 'started' });
                    // 💡 PHASE 2 (feed resurrection): auto-started wars were
                    // SILENT — no GC announcement, no start-card DMs. Both now
                    // fire on the auto path exactly like forcestart.
                    getFeed().queue(ev.eventId, 'major',
                        `The war has begun! ${res.event.players.length} champions deploy into the Ruins of a dead world.`);
                    let prefix = '.';
                    try { prefix = require('../../botConfig').getPrefix() || '.'; } catch (e) {}
                    require('./index').dmWarStartCards(sock, BOT_MARKER || '\u200B', res.event, prefix)
                        .catch((e) => console.error('[GW] auto-start cards:', e?.message));
                }
            } else {
                await abortEvent(ev.eventId, 'Not enough players registered.');
                out.push({ eventId: ev.eventId, auto: 'aborted-low-attendance' });
            }
            continue;
        }
        // ⏳ FINALE (owner 2026-10-05 23:09Z: "If a timer brings the Guild War
        // to an end, place 4 bosses around the map. After all 4 bosses die,
        // then the Guild War ends."): time-expiry no longer ENDS the war — it
        // starts the WARDEN FINALE. The atomic {finale: null} flip means the
        // lease holder that sees the expiry first spawns the bosses exactly
        // once; every other instance's update misses and moves on.
        if (ev.state === 'ACTIVE' && ev.endsAt && Date.now() > ev.endsAt) {
            const alreadyFinale = ev.finale && ev.finale.started;
            if (!alreadyFinale) {
                const flipped = await GuildWarEvent.findOneAndUpdate(
                    { eventId: ev.eventId, state: 'ACTIVE', $or: [{ finale: null }, { 'finale.started': { $ne: true } }] },
                    { $set: { finale: { started: true, startedAt: Date.now(), bosses: [] } } },
                    { new: true }
                ).lean();
                if (flipped) {
                    const spawned = await getRooms().spawnFinaleBosses(flipped).catch((e) => {
                        console.error('[GW] finale spawn failed:', e?.message);
                        return { ok: false };
                    });
                    if (spawned.ok) {
                        out.push({ eventId: ev.eventId, auto: 'finale-started' });
                        const names = (spawned.bosses || []).map((b) => b.name).join(', ');
                        getFeed().queue(ev.eventId, 'major',
                            `⏳ *THE HOURGLASS IS EMPTY* — the war clock has run out, but the Ruins are NOT done with you. Four WARDENS rise around the dead world: *${names}*.\n` +
                            `They are marked on every champion's map. The war ends ONLY when all four fall — slay them for the final glory.`);
                        // DM every active champion: the game they were playing
                        // just changed under their feet.
                        try {
                            for (const p of flipped.players || []) {
                                if (p.status !== 'active') continue;
                                await sock.sendMessage(p.jid, {
                                    text: `${BOT_MARKER || ''}⏳ *THE WAR TIMER HAS RUN OUT, ${p.name}.*\nFour WARDENS now hold the Ruins — their chambers are marked on your map (\`map\`).\nThe war ends only when ALL FOUR are slain. Hunt them with your guild — champions who fight a warden together share the battle.`,
                                }).catch(() => {});
                                await new Promise((r) => setTimeout(r, 400));
                            }
                        } catch (e) { /* best-effort */ }
                    } else {
                        // spawn failed (no candidate rooms) → end the war the old way
                        await endEvent(ev.eventId, 'Time expired.');
                        out.push({ eventId: ev.eventId, auto: 'ended-time' });
                    }
                }
                continue;
            }
            // finale is running: the war closes when the ledger says all
            // wardens are dead (belt — onEnd also ends it), or on the safety
            // timeout so an empty ruins can never hold the war open forever.
            const bosses = (ev.finale && Array.isArray(ev.finale.bosses)) ? ev.finale.bosses : [];
            const allDead = bosses.length > 0 && bosses.every((b) => b.dead);
            const timedOut = CFG.FINALE.TIMEOUT_MS > 0
                && ev.finale.startedAt && Date.now() > ev.finale.startedAt + CFG.FINALE.TIMEOUT_MS;
            if (allDead || timedOut) {
                await endEvent(ev.eventId, allDead ? 'All four wardens have fallen. The Ruins fall silent.' : 'The finale burned out with the wardens still standing.');
                out.push({ eventId: ev.eventId, auto: allDead ? 'ended-finale-clear' : 'ended-finale-timeout' });
            }
            continue;
        }
        // inactivity → drop carried relics in current room
        if (ev.state === 'ACTIVE') {
            const cutoff = Date.now() - CFG.INACTIVITY_MS;
            for (const p of ev.players) {
                if (p.status === 'active' && p.lastActionAt < cutoff) {
                    await getRooms().dropCarriedRelics(ev.eventId, p.jid, 'inactivity');
                    await updatePlayer(ev.eventId, p.jid, { status: 'active' }, { status: 'inactive' });
                    await pushLog(ev.eventId, 'inactivity', p.jid, 'went inactive; carried relics dropped in room');
                    getFeed().queue(ev.eventId, 'minor', `${p.name} has gone quiet in the Ruins…`);
                }
            }
            // §15 #8: expired PvP challenge windows resolve (concede) exactly
            // once across instances via the atomic pull-claim in ruinsPvp.
            try { await require('./ruinsPvp').pruneExpired(ev.eventId); } catch (e) {}
        }
    }
    // 💡 PHASE 2: actives passed so tickAll flushes DB-queued items even when
    // this instance never queued locally (cross-instance queue pickup).
    getFeed().tickAll(sock, BOT_MARKER, actives);
    return out;
}

async function endEvent(eventId, reason, { quietFeed = false } = {}) {
    const doc = await GuildWarEvent.findOneAndUpdate(
        { eventId, state: 'ACTIVE' },
        { $set: { state: 'ENDED' } },
        { new: true }
    );
    if (!doc) return null;
    // 💡 PHASE 2: time-expiry ends were invisible to the feed (mods calling
    // `.gw end` announce in the GC, but nobody heard auto-expiry). Queue the
    // major here; mods may pass quietFeed since they post a richer card.
    if (!quietFeed) getFeed().queue(eventId, 'major', `🏳️ THE WAR HAS ENDED. ${reason || ''}`.trim());
    const rewards = await getPoints().distribute(doc, reason);
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
    getFeed().dispose(eventId);
    return doc;
}

// restart recovery: called on boot — rebuild views, drop stale memory
async function recoverOnBoot() {
    const docs = await GuildWarEvent.find({ state: { $in: ['REGISTRATION', 'ACTIVE', 'REWARDS'] } });
    for (const d of docs) viewOf(d);
    return docs.map((d) => ({ eventId: d.eventId, state: d.state }));
}

module.exports = {
    getMoveContext,
    createEvent, registerPlayer, startEvent, endEvent, archiveEvent, abortEvent,
    getEvent, getActiveEvents, updateRoom, updatePlayer, pushLog, tick,
    topologyOf, recoverOnBoot, viewOf,
    claimFlow, _tenantId, // cross-box flow lease (QA seam + engine reuse)
    _activeViews: activeViews, // QA seam
};
