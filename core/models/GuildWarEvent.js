// ============================================
// ⚔️ GUILD WAR EVENT MODEL — Guild War Overhaul 2026-10-03
// Replaces the old weekly simulated tournament (GuildWar model, REMOVED).
// One document per event: map topology + room states + players embedded.
// ALL mutations during ACTIVE use atomic findOneAndUpdate (multi-instance safe).
// ============================================

const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    key: String,            // "x,y"
    x: Number, y: Number,
    region: { type: Number, default: 0 },
    type: String,           // empty|combat|puzzle|discovery|reward|hazard|lore|coop|secret|anomaly|landmark|core
    state: { type: String, default: 'UNEXPLORED' }, // UNEXPLORED|ACTIVE|CLEARED
    ring: { type: Number, default: 0 },      // BFS ring from spawn band (§15 #3: was stripped by strict mode before)
    payload: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }, // encounter setup (server-side answers, enemies, loot)
    clearedBy: String,      // player jid
    clearedByGuild: String,
    clearedAt: Date,
    lootFresh: Boolean,     // 🪙 consumable spoils still on the floor (owner 2026-10-06): true while the clearer is present; the enterRoom/leaveRoom pipelines flip it to false the moment they leave — renders then show the permanent LOOTED marker. Undefined on legacy rooms = already-looted (falsy on purpose)
    occupants: [String],    // jids currently inside
    residue: { type: Map, of: mongoose.Schema.Types.Mixed, default: null },
    variant: { type: String, default: 'intact' }, // Ruins visual variant (baked at startEvent — a room never changes look between renders)
}, { _id: false });

const RelicSchema = new mongoose.Schema({
    id: String,             // unique within event
    name: String,
    tier: String,           // Common..Mythic
    category: String,       // seeker|blink|ward|cross|trophy
    charges: { type: Number, default: 0 },
    meta: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    acquiredAt: Date,
}, { _id: false });

const PlayerSchema = new mongoose.Schema({
    jid: String,
    name: String,
    guildId: String,
    guildName: String,
    roomId: String,
    prevRoomId: String,
    spawnRoomId: String,
    markedRoom: String,         // §16 teleport anchor: ONE room, player-replaceable
    status: { type: String, default: 'active' }, // active|inactive|defeated|quit
    discovered: [String],
    relics: [RelicSchema],
    score: { type: Number, default: 0 },        // personal GP earned this event
    gpEarned: { type: Number, default: 0 },
    lives: { type: Number, default: 3 },
    protectedUntil: { type: Number, default: 0 },
    lastActionAt: { type: Number, default: 0 },
    lastMoveAt: { type: Number, default: 0 },   // §15 #4: move cooldown clock (was stripped by strict mode)
    pvpMeta: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }, // victim decay ledger
    joinedAt: Date,
}, { _id: false });

const GuildWarEventSchema = new mongoose.Schema({
    eventId: { type: String, unique: true, required: true },
    type: { type: String, default: 'normal' },  // normal|alignment
    hostGroupId: String,
    initiatedBy: String,
    guilds: [{ guildId: String, name: String }],
    state: { type: String, default: 'INITIATED' }, // INITIATED|REGISTRATION|ACTIVE|ENDED|REWARDS|ARCHIVED|ABORTED
    seed: String,
    deadWorld: String,                          // lore theme (world catalog id)
    side: { type: Number, default: 0 },         // grid dimension
    rooms: [RoomSchema],
    players: [PlayerSchema],
    coreKey: String,                            // "x,y" of World Core
    edges: [String],                            // open edges "x,y|dir" (pruned topology — source of truth)
    coreClaimedBy: String,                      // first guild to breach
    scoreboard: [{ guildId: String, name: String, points: Number }],
    config: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }, // config snapshot
    startedAt: Number,
    registrationEndsAt: Number,
    endsAt: Number,                             // hard end
    archivedAt: Number,
    logTail: [{ t: Number, type: String, actor: String, payload: String }], // ring, newest last
    // Phase 2 (feed resurrection): the live feed queue lives in the DOC so
    // every instance can flush it and a restart loses nothing.
    feedQueue: [{ id: String, tier: String, text: String, t: Number, tries: { type: Number, default: 0 } }],
    // Phase 1 #8: PvP challenge windows are shared state (was per-process Map)
    // ⚔️ eventId rides each challenge record (2026-10-05): resolveTimeout —
    // the sweeper that concedes/voids expired windows — reads c.eventId.
    // The old schema stripped it (mongoose strict subdoc), so every DB-pulled
    // resolution got eventId=undefined → getEvent(null) → silent no-op:
    // expired challenges NEVER resolved (measured in the multiplayer sim).
    pvpChallenges: [{ key: String, eventId: String, challengerJid: String, challengedJid: String, roomKey: String, expiresAt: Number }],
    // ⚔️ Cross-box flow lease (2026-10-05): both servers share this MongoDB,
    // so every instance ticks every war. {owner, at} names the ONE instance
    // allowed to run proactive flows (auto-start + start-card DMs, hard end,
    // inactivity sweep). Stale after 90s → any member instance takes over.
    // Mixed + default null (NOT a subdoc): mongoose instantiates subdoc
    // fields as {} on create, which breaks the {flow: null} lease claim.
    flow: { type: mongoose.Schema.Types.Mixed, default: null },
    // ⏳ FINALE (owner 2026-10-05 23:09Z: "If a timer brings the Guild War to
    // an end, place 4 bosses around the map. After all 4 bosses die, then the
    // Guild War ends."): set when endsAt passes. { started, startedAt,
    // bosses: [{ key, name, index, dead }] }. Mixed + default null — the
    // atomic flip condition ({finale: null}) must match fresh docs exactly.
    finale: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
}, { collection: 'guildwarevents', minimize: false });

GuildWarEventSchema.index({ state: 1 });
GuildWarEventSchema.index({ hostGroupId: 1 });

module.exports = mongoose.model('GuildWarEvent', GuildWarEventSchema);
