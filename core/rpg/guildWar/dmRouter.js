// ============================================
// 🎮 RUINS DM ROUTER — Guild War Overhaul 2026-10-03
// Player action grammar for active events, driven through bot DMs (the
// host group only receives the feed). Plugged as a pre-router into the
// encounterFramework DM entry — one DM entry point for the whole bot.
// ============================================

const state = require('./state');
const rooms = require('./rooms');
const encounters = require('./encounters');
const ruinsPvp = require('./ruinsPvp');
const relics = require('./relics');
const points = require('./points');
const visibility = require('./visibility');
const mapEngine = require('./mapEngine');
const feed = require('./feed');
const navCard = require('./navCard');
const CFG = require('./config');
const GuildWarEvent = require('../../models/GuildWarEvent');

// ⚔️ QA FIX (owner brief 2026-10-04 "movement still does not work"): the old
// query used 'players.status': { $ne: 'quit' } — MongoDB applies $ne across
// the WHOLE array, so the moment ANY single player typed `quit`, the event
// doc stopped matching for EVERY player. All war verbs then fell through to
// the generic command pipeline and surfaced as "unknown command". The exact
// failure the owner reported. $elemMatch binds jid + status to THE QUERYING
// player's row, so quitters can never poison anyone else's session.
async function getEventForPlayer(jid) {
    return GuildWarEvent.findOne({
        state: 'ACTIVE',
        players: { $elemMatch: { jid, status: { $ne: 'quit' } } },
    }).lean(); // skip casting the full map on every DM action
}

// ── per-player serialization (§11 state/session safety) ──
// Rapid DMs (double-tap move, answer + answer, answer while moving) used to
// interleave reads/writes on the same player row. Every handleDM for a jid
// now waits for the previous one to settle — one authoritative execution per
// player at a time, no dropped inputs, no duplicate evaluations. A watchdog
// releases a wedged chain so a crashed handler can never deadlock the player.
const _dmLocks = new Map(); // jid → Promise (tail of the chain)
const DM_LOCK_TIMEOUT_MS = 20 * 1000;
function serializeForPlayer(jid, fn) {
    const prev = _dmLocks.get(jid) || Promise.resolve();
    const run = prev.catch(() => {}).then(() => fn());
    // watchdog: forget the chain regardless of outcome so memory cannot grow
    // and a hung handler cannot wedge the player forever
    const release = () => {
        if (_dmLocks.get(jid) === tail) _dmLocks.delete(jid);
    };
    const tail = run.then(release, release);
    _dmLocks.set(jid, tail);
    // hard deadline: if fn() hangs (e.g. render pool stall), stop blocking
    // newer inputs after DM_LOCK_TIMEOUT_MS (silently — the underlying run
    // still completes and sends its own payloads; returning null keeps the
    // engine from double-handling the input)
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), DM_LOCK_TIMEOUT_MS));
    return Promise.race([run, timeout]);
}

// ── movement typo matching (owner playtest 2026-10-05: "move lwft") ──
// The hand-picked alias list (foward/bck/bak…) can never cover every typo.
// "lwft" slipped past it, never reached this router, and the generic game
// pipeline answered tictactoe's "No active game in this chat" — the war
// LOOKED dead to the owner. Near-direction words now resolve by edit
// distance; ambiguous words (tie between two directions) resolve to nothing.
// Damerau-Levenshtein (OSA): transpositions cost 1 — "bakc" is THE classic
// typo shape and plain Levenshtein would score it 2 (over the cap)
function editDistance(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[m][n];
}
function fuzzyMoveToken(word) {
    // returns the matched ALIAS KEY ('left'), never the direction value —
    // the caller runs it through MOVE_WORDS itself (double-mapping 'w'→'n'
    // turned "move lwft" into FORWARD once; caught by the QA battery)
    // tie-break on the RESOLVED direction: 'bakc' hits both 'bak' and 'back'
    // at distance 1 — same direction 's', so that is NOT a tie. 'wast' hits
    // west('w') and east('e') — a real tie → unresolved → null.
    let best = null, bestVal = null, bestDist = Infinity, tie = false;
    for (const key of Object.keys(MOVE_WORDS)) {
        if (key.length < 3) continue; // single letters never fuzzy
        const cap = key.length >= 6 ? 2 : 1;
        if (Math.abs(key.length - word.length) > cap) continue;
        const d = editDistance(word, key);
        if (d > cap) continue;
        const val = MOVE_WORDS[key];
        if (d < bestDist) { bestDist = d; best = key; bestVal = val; tie = false; }
        else if (d === bestDist && val !== bestVal) tie = true;
    }
    return tie ? null : best;
}

function playerOf(eventDoc, jid) {
    return eventDoc.players.find((p) => p.jid === jid);
}

function roomOf(eventDoc, player) {
    return eventDoc.rooms.find((r) => r.key === player.roomId);
}

// 💡 NAVIGATION OVERHAUL (owner): W = forward, A = left, S = back,
// D = right - game-style controls. "w" now means FORWARD (it no longer
// means west; west is still reachable via "west" / "left" / "a").
// Full compass words (north/south/east/west) keep working.
// ⚔️ TYPO TOLERANCE (owner brief §3: normalize "foward"): the owner's own
// test literally typed `.j move foward` — typos must reach the same movement
// system, never fall through to the generic pipeline.
const MOVE_WORDS = {
    n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e',
    w: 'n', a: 'w', d: 'e',
    west: 'w', forward: 'n', back: 's', left: 'w', right: 'e',
    foward: 'n', forwrd: 'n', faword: 'n', fwd: 'n', bck: 's', bak: 's',
};
const MOVE_TOKEN_RE = 'n|north|s|south|e|east|w|west|a|d|forward|back|left|right|foward|forwrd|faword|fwd|bck|bak';

// ── exits of the current room, for the visual navigation card ──
async function computeExits(eventDoc, player) {
    const topo = state.topologyOf(eventDoc);
    const DIRS = [
        { dir: 'n', rel: 'forward' },
        { dir: 'e', rel: 'right' },
        { dir: 's', rel: 'back' },
        { dir: 'w', rel: 'left' },
    ];
    const discovered = new Set(player.discovered || []);
    return DIRS.map(({ dir, rel }) => {
        const dest = mapEngine.step(topo, player.roomId, dir);
        if (!dest) return { dir, rel, edge: false };
        const nr = (eventDoc.rooms || []).find((r) => r.key === dest);
        return {
            dir, rel, edge: true, known: discovered.has(dest),
            kind: nr ? nr.type : null, cleared: nr ? nr.state === 'CLEARED' : false, key: dest,
        };
    });
}

async function navCardFor(eventDoc, player, room, prefix) {
    return navCard.renderNavCard({
        exits: await computeExits(eventDoc, player),
        roomType: room ? room.type : null,
        world: eventDoc.deadWorld,
        prefix,
    });
}

// ── RETURN map (§4): the same world map in its post-encounter visual
// state — ember frame + THE WAY ONWARD ribbon. Replaces the old parchment
// compass card as the post-battle / post-resolve visual.
async function returnMapFor(eventDoc, player, room) {
    const renderer = require('./mapRenderer');
    const extras = visibility.extrasFor(eventDoc, player, guildLevelOf(eventDoc, player));
    return renderer.renderRuinsMap(eventDoc, player, {
        mates: extras.mates, enemyPings: extras.enemyPings,
        ring: room ? room.ring : 0,
        style: 'return',
    });
}

// ── movement instructions that ride EVERY map card caption (owner brief §1:
// "the movement instructions should be included directly in the map card's
// text/caption — make it immediately clear what movement commands are available")
function mapCaption(head, prefix) {
    const p = prefix || '.';
    return `${head}\n\n` +
        `🚶 *Move:* \`${p} move forward\` · \`${p} left\` · \`${p} right\` · \`${p} back\` (bare \`forward\`/\`left\`… also works)\n` +
        `🗺️ \`${p} map\` · 🧭 \`${p} paths\` · ⚓ \`${p} mark\` → \`${p} teleport\``;
}

function roomsMapHas(eventDoc, key) {
    return (eventDoc.rooms || []).some((r) => r.key === key);
}

// ── ROOM ENTRY PRESENTATION (owner overhaul 2026-10-04: "a game rendered
// through WhatsApp") — the order is LAW (spec §2):
//   1. the LANDSCAPE map (where am I — self-zooming, fog-aware)
//   2. the ROOM SCENE (what this place looks like — the player's ASSIGNED
//      sprite standing in the exit-correct Ruins plate, yellow chevrons on
//      every open arch, floor compass, per-type ambience)
//   3. interaction info as captions (no parchment cards in the flow)
// Puzzles: the board OVERLAYS the scene panel — never a separate card.
async function presentRoom(sock, chatId, BOT_MARKER, ctxDoc, me, newRoom, opts = {}) {
    const prefix = opts.prefix || '.';
    const withMap = opts.withMap !== false;
    const send = async (payload) => {
        try { await sock.sendMessage(chatId, payload); } catch (e) { /* best-effort */ }
    };

    // meeting lines (kept short - they are gameplay-critical)
    const meta = navCard.typeMeta(newRoom.type);
    const others = (newRoom.occupants || []).filter((j) => j !== me.jid)
        .map((j) => (ctxDoc.players || []).find((p) => p.jid === j)).filter(Boolean);
    const foes = others.filter((o) => o.guildId !== me.guildId);
    const mates = others.filter((o) => o.guildId === me.guildId);
    let social = '';
    if (mates.length) social += `\n\n🤝 ${mates.map((m) => m.name).join(', ')} of your guild ${mates.length > 1 ? 'are' : 'is'} here - fight together for a shared reward.`;
    if (foes.length) social += `\n\n⚠️ ${foes.map((f) => f.name).join(', ')} (${foes[0].guildName}) ${foes.length > 1 ? 'are' : 'is'} here - rival guild. \`challenge @name\` or move carefully.`;

    // ONE fresh full read serves BOTH the map and the scene: the projected
    // ctxDoc carries no rooms array, so the room scene (exit arrows, door
    // variants) must derive from the complete doc.
    let full = ctxDoc;
    let freshMe = me;
    try {
        full = await state.getEvent(ctxDoc.eventId, { fresh: true }) || ctxDoc;
        freshMe = (full.players || []).find((p) => p.jid === me.jid) || me;
    } catch (e) { /* fall back to the projected context */ }

    // 1) MAP FIRST — "where am I" (§2) + the move grammar rides the caption
    // (owner brief §1: movement instructions live on the map card itself)
    if (withMap) {
        try {
            const renderer = require('./mapRenderer');
            const extras = visibility.extrasFor(full, freshMe, guildLevelOf(full, freshMe));
            const buf = await renderer.renderRuinsMap(full, freshMe, { mates: extras.mates, enemyPings: extras.enemyPings, ring: newRoom.ring, style: 'explore' });
            if (buf) {
                await send({ image: buf, caption: BOT_MARKER + mapCaption(`📍 *YOU ARE HERE* - ${meta.label} (chamber ${newRoom.key})`, prefix) });
            }
        } catch (e) {
            console.error('[RuinsNav] map render failed (non-fatal):', e?.message);
        }
    }

    // 2) THE ROOM ITSELF — environment image with the player in it (§2)
    try {
        const intro = await encounters.roomIntro(full, freshMe, newRoom, { prefix });
        const sceneCaption = BOT_MARKER + ((intro.text || '') + social).trim();
        if (intro.image) {
            await send({ image: intro.image, caption: sceneCaption });
        } else if (social) {
            await send({ text: BOT_MARKER + social.trim() });
        }
    } catch (e) {
        console.error('[RuinsNav] scene failed (non-fatal):', e?.message);
        if (social) await send({ text: BOT_MARKER + social.trim() });
    }
    return {};
}

// main entry (serialized): rapid inputs from one player queue behind each
// other instead of interleaving — see serializeForPlayer above.
// opts.prefixed: the text arrived WITH the bot prefix (e.g. ".j move left").
// Prefixed input only consumes WAR-SPECIFIC verbs — generic bot commands
// (use/bag/relics/status) fall through to the normal command pipeline so
// ".j use elixir" still hits the inventory mid-war. Bare DM text (game-mode)
// keeps the full grammar.
const GENERIC_PREFIXED_RE = /^(?:use|bag|relics|status|score|gw status|gw map|help)\b/;

function handleDM(sock, senderJid, chatId, txt, BOT_MARKER, opts = {}) {
    return serializeForPlayer(senderJid, () => _handleDMInner(sock, senderJid, chatId, txt, BOT_MARKER, opts));
}

async function _handleDMInner(sock, senderJid, chatId, txt, BOT_MARKER, opts = {}) {
    const prefix = String(opts.prefix || '.'); // dynamic per-bot prefix (owner rule)
    const raw = String(txt || '').trim();
    if (!raw) return null;
    // tolerate own prefix or not - strip the ACTUAL per-bot prefix dynamically
    // (owner rule: never hardcode .j/.s). Legacy bare ".j" still tolerated.
    const lower = raw.toLowerCase();
    const prefixed = lower.startsWith(prefix.toLowerCase())
        || /^\.j\s/.test(lower);
    let norm = lower.startsWith(prefix.toLowerCase())
        ? lower.slice(prefix.length).trim()
        : lower.replace(/^\.j\s*/, '');
    // legacy tolerance: bots whose prefix is "." still receive ".j <verb>" —
    // the prefix strip above leaves a leading "j " in that case. Strip it so
    // the grammar never depends on which prefix style the deployment uses.
    if (prefixed && !lower.startsWith(prefix.toLowerCase())) norm = norm.replace(/^j\s+/, '');
    else if (prefixed && /^j\s+[a-z]/.test(norm) && !/^(join|j)$/.test(norm)) norm = norm.replace(/^j\s+/, '');

    // prefixed generic commands are NEVER war verbs — hand them back early
    if (opts.prefixed && GENERIC_PREFIXED_RE.test(norm)) return null;

    // ── ruins action grammar: any DM verb this router understands ──
    const QUIET_ACTION_RE = new RegExp(`^(?:look|l|where(?:\\s?am\\s?i)?|map|gw map|paths|relics|bag|status|score|rejoin|return|quit|leave|exit|accept|flee|mark|teleport|tp|recall|handin(?:\\s\\S.*)?|use(?:\\s\\S.*)?|challenge(?:\\s\\S.*)?|share map(?:\\s\\S.*)?|move\\s+(?:${MOVE_TOKEN_RE})|(?:${MOVE_TOKEN_RE}))$`);

    const eventDoc = await getEventForPlayer(senderJid);
    if (!eventDoc) {
        // not in an event: "join" matters (during registration); recognized
        // ruins verbs get a guidance reply instead of dead silence (owner:
        // "typing look or e does nothing" - never leave a DM unanswered)
        if (/^(join|gw join)$/.test(norm)) {
            const pending = await GuildWarEvent.findOne({ state: 'REGISTRATION', 'players.jid': { $ne: senderJid } }).sort({ createdAt: -1 });
            if (pending) {
                const guilds = require('../guilds');
                const ug = guilds.getUserGuild(senderJid);
                if (!ug) return { text: '❌ You must be in a guild to enter the Guild War.' };
                const res = await state.registerPlayer(pending.eventId, {
                    jid: senderJid, name: displayName(senderJid), guildId: ug, guildName: ug,
                });
                if (res) return { text: `✅ You are registered for *${pending.type === 'alignment' ? 'the Alignment' : 'the Guild War'}* (${pending.players.length} players). Stand by for deployment.` };
            }
            return { text: `🕊️ *No war is registering right now.*\nMods raise the call in the GC: \`${prefix} gw start\`. Once a war opens, \`${prefix} gw join\` (or DM me \`join\`) gets you in.` };
        }
        // ⚔️ 2026-10-05: "move …" always answers here — never falls through to
        // the games pipeline (tictactoe's "No active game in this chat").
        if (QUIET_ACTION_RE.test(norm) || /^move\b/.test(norm)) {
            return { text: `🕯️ *The Ruins stand quiet.* No war is running right now.\n\nWhen one deploys, my DMs become your game screen — your room will show itself the moment the war begins.\nMods start it with \`${prefix} gw start\` - players join with \`${prefix} gw join\`.` };
        }
        return null;
    }

    const player = playerOf(eventDoc, senderJid);
    if (!player) return null;

    // ── registration-phase actions ──
    if (eventDoc.state === 'REGISTRATION') {
        if (/^(join|gw join)$/.test(norm)) {
            const res = await state.registerPlayer(eventDoc.eventId, { jid: senderJid, name: displayName(senderJid), guildId: player.guildId, guildName: player.guildName });
            return res ? { text: '✅ Already registered - stand by.' } : null;
        }
        return { text: '⏳ The war is still gathering. Deployment begins soon.' };
    }

    if (player.status === 'defeated') return { text: '💀 You have no lives left this war. Watch the feed for the outcome.' };
    if (player.status === 'quit') return null;

    // rejoin after inactivity
    if (player.status === 'inactive') {
        if (/^(rejoin|return)$/.test(norm)) {
            await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
                status: 'active', lastActionAt: Date.now(),
                protectedUntil: Date.now() + CFG.REJOIN_PROTECT_MS,
            });
            return { text: `🛡️ Welcome back. Spawn protection for ${CFG.REJOIN_PROTECT_MS / 1000}s. Your carried relics dropped where you fell - your position is unchanged.` };
        }
        return { text: '💤 You went inactive. Type `rejoin` to return to the war.' };
    }

    // touch lastAction for any recognized command from here on
    const touch = () => state.updatePlayer(eventDoc.eventId, senderJid, {}, { lastActionAt: Date.now() });

    // ── movement ──
    let moveToken = null;
    const moveMatch = new RegExp(`^(?:move\\s+)?(${MOVE_TOKEN_RE})$`).exec(norm);
    if (moveMatch) moveToken = moveMatch[1];
    // ⚔️ TYPO TOLERANCE v2: fuzzy path fires ONLY after an explicit "move "
    // intent ("move lwft" → left) so random bare English words (rest/last/
    // best are one substitution from west/east) can never hijack a DM.
    if (!moveToken) {
        const fuzzy = /^move\s+([a-z]{3,})$/.exec(norm);
        if (fuzzy) moveToken = fuzzyMoveToken(fuzzy[1]);
    }
    // "move <garbage>" dies HERE with a real answer — never again falls
    // through to the generic pipeline and its tictactoe error.
    if (!moveToken && /^move\b/.test(norm)) {
        return { text: `🧭 Unknown direction. The Ruins obey:\n🚶 *Move:* \`${prefix} move forward\` · \`${prefix} left\` · \`${prefix} right\` · \`${prefix} back\` (bare \`forward\`/\`left\`… also works)` };
    }
    if (moveToken) {
        const topo = state.topologyOf(eventDoc);
        const dir = MOVE_WORDS[moveToken];
        // Ruins rule: cannot move while the room's encounter is unresolved
        const room = roomOf(eventDoc, player);
        if (room && room.state === 'ACTIVE' && ['combat', 'puzzle', 'coop', 'core'].includes(room.type)) {
            return { text: '🚪 The way onward is blocked until this chamber is resolved (or you `flee`).' };
        }
        const cooldownLeft = CFG.MAP.MOVE_COOLDOWN_MS - (Date.now() - (player.lastMoveAt || 0));
        if (cooldownLeft > 0) {
            return { text: `⏳ You catch your breath... ${Math.ceil(cooldownLeft / 1000)}s until you can move again.` };
        }
        const dest = mapEngine.step(topo, player.roomId, dir);
        if (!dest) return { text: '🧱 No passage that way - the walls of the dead world are unbroken.' };

        await rooms.enterRoom(eventDoc.eventId, senderJid, player.roomId, dest);
        const reveal = visibility.revealFor(eventDoc, dest, guildLevelOf(eventDoc, player));
        await rooms.applyFog(eventDoc.eventId, senderJid, reveal);
        await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
            prevRoomId: player.roomId, roomId: dest, lastActionAt: Date.now(), lastMoveAt: Date.now(),
        });
        await touch();

        // ⚔️ projected context (room + light players) — no full-map re-read
        const ctxDoc = await state.getMoveContext(eventDoc.eventId, dest);
        const me = { ...player, roomId: dest, prevRoomId: player.roomId };
        const newRoom = ctxDoc.room;
        // 💡 OVERHAUL 2026-10-04: map → scene → (auto) encounter. Combat
        // kinds START THEMSELVES — the world reacts to the player; nobody
        // has to poke the bot (owner spec §14).
        try {
            await presentRoom(sock, chatId, BOT_MARKER, ctxDoc, me, newRoom, { prefix });
        } catch (e) {
            console.error('[RuinsNav] presentRoom failed, falling back to text:', e?.message);
            const intro = await encounters.roomIntro(ctxDoc, me, newRoom, { prefix });
            if (intro.text || intro.image) {
                const payload = { text: intro.text || '' };
                if (intro.image) payload.image = intro.image;
                await sock.sendMessage(chatId, payload).catch(() => {});
            }
        }
        // AUTO-ENCOUNTER (§14): unresolved combat kinds (and boss-sealed
        // secret chambers) engage the REAL combat pipeline immediately.
        const freshAfterPresent = await state.getEvent(eventDoc.eventId, { fresh: true });
        const meNow = playerOf(freshAfterPresent, senderJid) || me;
        const roomNow = roomOf(freshAfterPresent, meNow);
        const autoCombat = roomNow && roomNow.state !== 'CLEARED' && (
            ['combat', 'coop', 'core'].includes(roomNow.type)
            || (roomNow.type === 'secret' && encounters.payloadGet(roomNow.payload, 'boss'))
        );
        if (autoCombat) {
            const started = await encounters.startRoomCombat(sock, chatId, meNow, freshAfterPresent, roomNow, { groq: null });
            if (!started.success) return { text: started.msg || 'The encounter failed to begin - type `fight` to try again.' };
        }
        return {};
    }

    // ── visual navigation: the RETURN map (post-encounter visual state §4) ──
    if (/^paths$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        const buf = await returnMapFor(eventDoc, player, room);
        return { text: mapCaption(`🧭 The way onward from chamber ${player.roomId}. The compass marks your exits.`, prefix), image: buf };
    }

    // ── TELEPORT ANCHOR (owner spec §16): mark ONE room as a return point ──
    if (/^(mark|mark room|anchor)$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        if (!room) return { text: '❌ Nowhere to anchor.' };
        if (room.state === 'ACTIVE' && ['combat', 'coop', 'core'].includes(room.type)) {
            return { text: '🚫 You cannot anchor inside an unresolved encounter.' };
        }
        const prev = player.markedRoom || null;
        await state.updatePlayer(eventDoc.eventId, senderJid, {}, { markedRoom: player.roomId, lastActionAt: Date.now() });
        return { text: `⚓ *Anchor set on chamber ${player.roomId}.*${prev && prev !== player.roomId ? ` (replaces chamber ${prev})` : ''}\n\`teleport\` returns here - but never out of a live fight.` };
    }
    if (/^(teleport|tp|recall)$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        // 1) never out of a live fight — unresolved encounter OR pending duel
        if (room && room.state === 'ACTIVE' && ['combat', 'puzzle', 'coop', 'core'].includes(room.type)) {
            return { text: '🚫 *The way is shut.* Resolve this chamber first - teleporting out of a live fight is not granted.' };
        }
        const pendingDuel = (eventDoc.pvpChallenges || []).some((c) =>
            (c.challengerJid === senderJid || c.challengedJid === senderJid) && Date.now() < (c.expiresAt || 0));
        if (pendingDuel) {
            return { text: '🚫 A duel is being settled here. `accept` it, `flee`, or wait for the window to close.' };
        }
        if (!player.markedRoom) return { text: '⚓ You have no anchor. `mark` this room - or any room - to set one.' };
        if (player.markedRoom === player.roomId) return { text: '🧭 You are already standing in your anchored chamber.' };
        const topo = state.topologyOf(eventDoc);
        if (!roomsMapHas(eventDoc, player.markedRoom)) return { text: '⚓ Your anchored chamber has crumbled away. `mark` a new one.' };
        const cooldownLeft = CFG.MAP.MOVE_COOLDOWN_MS - (Date.now() - (player.lastMoveAt || 0));
        if (cooldownLeft > 0) return { text: `⏳ The stones refuse you for ${Math.ceil(cooldownLeft / 1000)}s.` };

        const dest = player.markedRoom;
        await rooms.enterRoom(eventDoc.eventId, senderJid, player.roomId, dest);
        await rooms.applyFog(eventDoc.eventId, senderJid, mapEngine.revealAround(topo, dest));
        await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
            prevRoomId: player.roomId, roomId: dest, lastActionAt: Date.now(), lastMoveAt: Date.now(),
        });
        await touch();
        const ctxDoc = await state.getMoveContext(eventDoc.eventId, dest);
        const me = { ...player, roomId: dest, prevRoomId: player.roomId };
        try {
            await presentRoom(sock, chatId, BOT_MARKER, ctxDoc, me, ctxDoc.room, { prefix });
        } catch (e) {
            return { text: `✨ The anchor pulls you back to chamber ${dest}.` };
        }
        return {};
    }

    // ── personal map ──
    if (/^(map|gw map)$/.test(norm)) {
        const fresh = await state.getEvent(eventDoc.eventId, { fresh: true });
        const me = playerOf(fresh, senderJid);
        const renderer = require('./mapRenderer');
        const extras = visibility.extrasFor(fresh, me, guildLevelOf(fresh, me));
        const buf = await renderer.renderRuinsMap(fresh, me, { mates: extras.mates, enemyPings: extras.enemyPings });
        return { text: mapCaption(`🗺️ Your chart of the Ruins.`, prefix), image: buf };
    }

    // ── look ──
    if (/^(look|l|where|whereami)$/.test(norm)) {
        const ctxDoc = await state.getMoveContext(eventDoc.eventId, player.roomId);
        if (!ctxDoc || !ctxDoc.room) return { text: 'You are between chambers...' };
        const me = player;
        // 💡 NAVIGATION OVERHAUL: same visual flow as a move - map with
        // "you are here" first, room-type card, then the scene.
        try {
            return await presentRoom(sock, chatId, BOT_MARKER, ctxDoc, me, ctxDoc.room, { prefix, withMap: true });
        } catch (e) {
            console.error('[RuinsNav] presentRoom(look) failed, falling back to text:', e?.message);
            const intro = await encounters.roomIntro(ctxDoc, me, ctxDoc.room);
            return { text: intro.text, image: intro.image || undefined };
        }
    }

    // ── relics ──
    if (/^(relics|bag)$/.test(norm)) {
        const carried = (player.relics || []).map((r) => `💎 ${r.name} (${r.tier}${r.charges ? `, ${r.charges} charges` : ''})`);
        return { text: carried.length ? `You carry:\n${carried.join('\n')}\n\nHand in with \`handin <name>\` or \`handin all\`. Carried Rare+ relics can be stolen.` : 'You carry no relics. Find them in discoveries, vaults and hidden chambers.' };
    }

    // ── hand in (relic → guild points; leaves play) ──
    if (/^handin/.test(norm)) {
        const arg = norm.replace(/^handin\s*/, '').trim();
        const carried = player.relics || [];
        if (!carried.length) return { text: 'You carry no relics to hand in.' };
        let toHand = [];
        if (!arg || arg === 'all') toHand = carried;
        else toHand = carried.filter((r) => r.name.toLowerCase().includes(arg) || r.category === arg);
        if (!toHand.length) return { text: '❌ No matching relic carried. `relics` lists what you have.' };

        let gpTotal = 0;
        for (const r of toHand) gpTotal += relics.handinGp(r);
        const GuildWarEventModel = require('../../models/GuildWarEvent');
        await GuildWarEventModel.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': senderJid },
            { $pull: { 'players.$.relics': { id: { $in: toHand.map((r) => r.id) } } } }
        );
        await points.award(eventDoc.eventId, senderJid, gpTotal, 'relic-handin', { ignoreCap: false });
        await state.pushLog(eventDoc.eventId, 'relic-handin', senderJid, `${toHand.map((r) => r.name).join(', ')} → ${gpTotal} GP`);
        feed.queue(eventDoc.eventId, 'normal', `🏛️ ${player.name} delivers ${toHand.length === 1 ? `*${toHand[0].name}*` : `${toHand.length} relics`} to the guild vault — +${gpTotal} GP of glory secured.`);
        return { text: `🏛️ Handed in: ${toHand.map((r) => `${r.name} (${r.tier})`).join(', ')} - *+${gpTotal} GP* to you and your guild. Secured.` };
    }

    // ── use relic ──
    if (/^use\b/.test(norm)) {
        return useRelic(eventDoc, player, norm.replace(/^use\s*/, ''), { sock, chatId, BOT_MARKER });
    }

    // ── pvp ──
    if (/^challenge\b/.test(norm)) {
        const room = roomOf(eventDoc, player);
        const targetName = norm.replace(/^challenge\s*@?/, '').trim();
        const target = eventDoc.players.find((p) => p.name.toLowerCase() === targetName && (p.roomId === player.roomId) && p.jid !== senderJid);
        if (!target) return { text: '❌ No such rival in this room. `challenge @name` - they must stand here.' };
        const res = await ruinsPvp.challenge(eventDoc, player, target.jid);
        return { text: res.text };
    }
    if (/^accept$/.test(norm)) {
        const res = await ruinsPvp.accept(eventDoc, player);
        if (!res.ok) return { text: res.text };
        const pvp = require('../pvpSystem');
        const virtualId = `ruins:${eventDoc.eventId}:${player.roomId}:${Date.now()}`;
        // ⚔️ RUINS DUELS: the duel renders in THIS room's plate (no arena swap)
        let ruinsBackground = null;
        try {
            const roomScene = require('./roomScene');
            const exits = roomScene.exitsFor(eventDoc, player);
            ruinsBackground = `ruins_door_${roomScene.plateKeyFor(exits, `${eventDoc.seed}:${player.roomId}`)}.png`;
        } catch (e) {}
        const begun = pvp.beginRuinsDuel(res.challenger.jid, senderJid, { eventId: eventDoc.eventId, roomKey: player.roomId, virtualChatId: virtualId, ruinsBackground });
        if (begun.success && begun.duel && ruinsBackground) begun.duel.ruinsBackground = ruinsBackground;
        if (!begun.success) return { text: begun.message };
        await touch();
        return { text: `⚔️ *THE DUEL BEGINS!* ${begun.duel.players[0].name} vs ${begun.duel.players[1].name}.\nUse your standard combat commands: \`${prefix} combat attack\`, \`${prefix} combat ability <n>\`, \`${prefix} combat flee\`.\n_Stakes: ${CFG.PVP.WIN_GP} GP + carried relics (max ${CFG.PVP.RELIC_STEAL_CAP})._` };
    }
    if (/^flee$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        const pending = await ruinsPvp.openChallengeFor(eventDoc, senderJid)
            || [...ruinsPvp._openChallenges.values()].find((c) => c.challengedJid === senderJid && Date.now() < c.expiresAt) || null;
        // ⚔️ RE-ENTRY SAFETY (owner brief §7 "leave during puzzle"): puzzle
        // chambers MUST be escapable — a champion who cannot crack the seal
        // retreats (room stays ACTIVE, spoils forfeited) instead of being
        // trapped forever. The blocked-move message promises exactly this.
        if (pending || ['combat', 'puzzle', 'coop', 'core'].includes(room?.type)) {
            // ⚔️ QA FIX: abandoning a live Ruins fight must also END the combat
            // session — otherwise the orphaned session answers every later
            // auto-start with "already in combat" until the 30-min reaper.
            try { require('../guildAdventure').abortRuinsSession(senderJid); } catch (e) {}
            await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
                roomId: player.prevRoomId,
                protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
                lastActionAt: Date.now(),
            });
            await rooms.leaveRoom(eventDoc.eventId, senderJid, player.roomId);
            feed.queue(eventDoc.eventId, 'normal', `🏃 ${player.name} withdrew from a ${room ? require('./encounters').roomFlavor(room) : 'contest'} — the spoils stay with the Ruins.`);
            // ⚔️ OWNER FIX (playtest 2026-10-05: "after you fail no generated
            // encounter image of you in the last room with the map, no
            // nothing"): retreating used to send TEXT ONLY — no scene of the
            // room you fall back into, no return map — so every forced-room
            // type (combat/puzzle/coop/core) felt like the game died on flee.
            // Replay the standard room entry (map → scene → captions) after
            // the retreat line, exactly like a move does.
            try {
                await sock.sendMessage(chatId, { text: BOT_MARKER + '🏃 You retreat to your previous room. What was here stays here, unclaimed.' });
            } catch (e) { /* best-effort */ }
            try {
                const freshAll = await state.getEvent(eventDoc.eventId, { fresh: true });
                const meFresh = playerOf(freshAll, senderJid) || player;
                const destRoom = roomOf(freshAll, meFresh);
                if (destRoom) {
                    const ctxDoc = await state.getMoveContext(eventDoc.eventId, meFresh.roomId);
                    if (ctxDoc) await presentRoom(sock, chatId, BOT_MARKER, ctxDoc, meFresh, destRoom, { prefix });
                }
            } catch (e) {
                console.error('[RuinsNav] post-flee presentation failed (non-fatal):', e?.message);
            }
            return {};
        }
        return { text: 'There is nothing here to flee from.' };
    }

    // ── share map with a guildmate (fog cooperation) ──
    if (/^share map/.test(norm)) {
        const mateName = norm.replace(/^share map\s*@?/, '').trim();
        const mate = eventDoc.players.find((p) => p.name.toLowerCase() === mateName && p.guildId === player.guildId && p.jid !== senderJid);
        if (!mate) return { text: '❌ No guildmate by that name in this war.' };
        await GuildWarEvent.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': mate.jid },
            { $addToSet: { 'players.$.discovered': { $each: (player.discovered || []) } } }
        );
        return { text: `🗺️ Your chart has been copied to ${mate.name}.` };
    }

    // ── room encounter interactions (dig/take/cross/touch/record/claim/fight/answers) ──
    const room = roomOf(eventDoc, player);
    if (room) {
        // ⚔️ GRAMMAR FIX: pass the PREFIX-STRIPPED verb (norm), not the raw
        // input — resolveInput matches bare verbs ('dig'/'take'/'cross'…), so
        // '.j dig' (the documented grammar!) fell through every comparison and
        // every room interaction silently no-op'd under prefixed play.
        const res = await encounters.resolveInput(eventDoc, player, room, norm, { sock, chatId, BOT_MARKER });
        if (res.handled) {
            await touch();
            if (res.sentCombat) {
                const started = await encounters.startRoomCombat(sock, chatId, player, eventDoc, room, { groq: null });
                return { text: started.success ? null : started.msg };
            }
            // ⚔️ changed room: the cleared-state scene rides the result text...
            if (res.afterImage) {
                try {
                    await sock.sendMessage(chatId, { image: res.afterImage, caption: BOT_MARKER + (res.text || '') });
                } catch (e) {
                    return { text: res.text };
                }
                // 💡 OVERHAUL §4/§15: the moment an encounter resolves, the
                // player gets the RETURN map — same chart, post-encounter
                // visual state — instead of a parchment compass card.
                try {
                    const freshRoomDoc = await GuildWarEvent.findOne(
                        { eventId: eventDoc.eventId, 'rooms.key': player.roomId },
                        { rooms: { $elemMatch: { key: player.roomId } } }
                    ).lean();
                    const freshRoom = freshRoomDoc && freshRoomDoc.rooms && freshRoomDoc.rooms[0];
                    if (freshRoom && freshRoom.state === 'CLEARED') {
                        const freshAll = await state.getEvent(eventDoc.eventId, { fresh: true });
                        const meFresh = playerOf(freshAll, senderJid) || player;
                        const retBuf = await returnMapFor(freshAll, meFresh, freshRoom);
                        if (retBuf) await sock.sendMessage(chatId, { image: retBuf, caption: BOT_MARKER + mapCaption('🧭 *The way onward is clear.* The compass marks your exits.', prefix) });
                    }
                } catch (navErr) {
                    console.error('[RuinsNav] post-resolve return map failed (non-fatal):', navErr?.message);
                }
                return {};
            }
            return { text: res.text };
        }
    }

    // ── status ──
    if (/^(status|gw status|score)$/.test(norm)) {
        const byGuild = feed.computeScoreboard(eventDoc);
        const standings = byGuild.slice(0, 8).map((g, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} ${g.name}: ${g.points}`).join('\n');
        return { text: `⚔️ *Guild War* (${eventDoc.type}) - ends <t:${Math.floor((eventDoc.endsAt || 0) / 1000)}:R>\nYou: ${player.score} GP · lives ${player.lives} · position ${player.roomId}\n\n${standings}` };
    }

    if (/^(quit|leave war|abandon)$/.test(norm)) {
        await rooms.dropCarriedRelics(eventDoc.eventId, senderJid, 'quit');
        await state.updatePlayer(eventDoc.eventId, senderJid, {}, { status: 'quit' });
        await rooms.leaveRoom(eventDoc.eventId, senderJid, player.roomId);
        return { text: '🚪 You have left the war. Your carried relics dropped where you stood.' };
    }

    return null; // not a ruins action → let other handlers see the DM
}

// ── relic usage ──
async function useRelic(eventDoc, player, arg, { sock, chatId, BOT_MARKER }) {
    const carried = player.relics || [];
    if (!carried.length) return { text: 'You carry no relics.' };
    const match = carried.find((r) => r.name.toLowerCase().includes(arg) || r.category === arg) || carried.find((r) => r.category === arg);
    if (!match) return { text: '❌ No such relic. `relics` lists what you carry.' };

    const rng = mapEngine.makeRng(`${eventDoc.seed}:use:${match.id}:${Date.now()}`);

    if (match.category === 'seeker' && match.charges > 0) {
        const target = encounters.nearestRelicRoom(eventDoc, player.roomId);
        await decrementCharges(eventDoc.eventId, player.jid, match.id);
        return { text: target
            ? `🧭 The ${match.name} trembles and points: treasure lies ${encounters.describeDirection(eventDoc, player.roomId, target)}.`
            : '🧭 The seeker spins wildly - nothing left to find. (charge spent)' };
    }
    if (match.category === 'blink' && match.charges > 0) {
        const topo = state.topologyOf(eventDoc);
        // blink toward the World Core along discovered path, or any far discovered room
        const discoveredSet = new Set(player.discovered || []);
        let target = null;
        if (discoveredSet.has(eventDoc.coreKey) && eventDoc.coreKey !== player.roomId) target = eventDoc.coreKey;
        else {
            const far = [...discoveredSet].filter((k) => k !== player.roomId);
            if (far.length) target = rng.pick(far);
        }
        if (!target) return { text: '🪨 Nowhere to blink to yet - explore more, then try again. (no charge spent)' };
        const path = mapEngine.blinkPath(topo, discoveredSet, player.roomId, target, CFG.RELICS.BLINK_MAX_ROOMS);
        if (!path) return { text: `🪨 The ${match.name} fizzles - too far off your known paths. (no charge spent)` };
        const dest = path[path.length - 1];
        const fresh = await state.getEvent(eventDoc.eventId, { fresh: true });
        const destRoom = fresh.rooms.find((r) => r.key === dest);
        if (dest === fresh.coreKey || (destRoom?.occupants || []).length > 0) {
            return { text: '🪨 The blink refuses - the destination is contested ground. (no charge spent)' };
        }
        await rooms.enterRoom(eventDoc.eventId, player.jid, player.roomId, dest);
        await rooms.applyFog(eventDoc.eventId, player.jid, mapEngine.revealAround(topo, dest));
        await state.updatePlayer(eventDoc.eventId, player.jid, {}, {
            prevRoomId: player.roomId, roomId: dest, lastActionAt: Date.now(), lastMoveAt: Date.now(),
        });
        await decrementCharges(eventDoc.eventId, player.jid, match.id);
        const me = playerOf(fresh, player.jid);
        const intro = await encounters.roomIntro(fresh, me, destRoom);
        return { text: `✨ You blink through the stones... skipped rooms yield nothing.\n\n${intro.text}`, image: intro.image || undefined };
    }
    if (match.category === 'ward') {
        // ward applies to the next combat: attach buff to the room combat via player pvpMeta
        const buff = relics.wardBuff(match);
        if (!buff) return { text: 'This ward is inert.' };
        const GuildWarEventModel = require('../../models/GuildWarEvent');
        // ⚔️ §15 #6 FIX: the old activation OVERWROTE meta with { buff },
        // losing the ward's `fights` counter — and nothing downstream read
        // `ward_active` anyway. meta now carries kind+fights+buff, and
        // encounters.startRoomCombat applies + consumes the ward per fight.
        const oldMeta = typeof match.meta?.get === 'function' ? Object.fromEntries(match.meta.entries()) : (match.meta || {});
        await GuildWarEventModel.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': player.jid },
            { $pull: { 'players.$.relics': { id: match.id } } }
        );
        await GuildWarEventModel.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': player.jid },
            { $push: { 'players.$.relics': { ...match, category: 'ward_active', charges: 0, meta: { ...oldMeta, buff } } } }
        );
        return { text: `🛡️ The ${match.name} flares - its ward wraps your next fight (${buff.type}).` };
    }
    if ((match.category === 'trophy' || match.category === 'cross')) {
        return { text: '💠 This relic is not usable - hand it in with `handin` to secure its value.' };
    }
    return { text: '❌ That relic has no charges left.' };
}

async function decrementCharges(eventId, jid, relicId) {
    const doc = await GuildWarEvent.findOne({ eventId }, { players: { $elemMatch: { jid } } }).lean();
    const p = doc?.players?.[0];
    const relic = p?.relics?.find((r) => r.id === relicId);
    if (!relic) return;
    const charges = Math.max(0, (relic.charges || 0) - 1);
    await GuildWarEvent.updateOne(
        { eventId, 'players.jid': jid, 'players.relics.id': relicId },
        { $set: { 'players.$.relics.$[r].charges': charges } },
        { arrayFilters: [{ 'r.id': relicId }] }
    );
}

function guildLevelOf(eventDoc, player) {
    try {
        const guilds = require('../guilds');
        const g = guilds.getGuild(player.guildId);
        return g?.level || 1;
    } catch (e) { return 1; }
}

function displayName(jid) {
    try {
        const economy = require('../economy');
        return economy.getDisplayName(jid) || jid.split('@')[0];
    } catch (e) { return String(jid).split('@')[0]; }
}

// ── GROUP war-verb nudge (§11/§17): a player typed `.j move left` (etc.)
// in the FEED group. The war is played in DMs — so answer the group with a
// one-line war-feed line and DM the sender their actual room view. Never an
// "unknown command" error; never a group spam item.
async function handleGroupWarVerb(sock, chatId, senderJid, senderName, norm, prefix = '.') {
    try {
        const eventDoc = await getEventForPlayer(senderJid);
        if (!eventDoc) return false; // not in a war → caller falls through
        const player = playerOf(eventDoc, senderJid);
        if (!player || player.status !== 'active') return false;
        const room = roomOf(eventDoc, player);
        await sock.sendMessage(chatId, {
            text: `⚔️ *${senderName}* stirs in the Ruins (chamber ${player.roomId}${room ? `, ${room.type}` : ''}) — the war is fought in my DMs.`,
        });
        const ctxDoc = await state.getMoveContext(eventDoc.eventId, player.roomId);
        if (ctxDoc && ctxDoc.room) {
            const me = { ...player };
            await presentRoom(sock, senderJid, '\u200B', ctxDoc, me, ctxDoc.room, { prefix });
        }
        return true;
    } catch (e) {
        console.error('[RuinsNav] group war-verb nudge failed:', e?.message);
        return false;
    }
}

module.exports = { handleDM, getEventForPlayer, displayName, navCardFor, returnMapFor, computeExits, presentRoom, handleGroupWarVerb, mapCaption, fuzzyMoveToken };
