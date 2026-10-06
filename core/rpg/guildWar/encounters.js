// ============================================
// 🏛️ ENCOUNTER ENGINE — Guild War Overhaul 2026-10-03
// Common encounter interface + per-room-type runners. Combat rooms delegate
// to the REAL combat pipeline (guildAdventure.startRuinsCombat); puzzles,
// discoveries, hazards, lore, co-op and the World Core live here.
// Room payloads are seeded server-side at event start (answers never leave).
// ============================================

const CFG = require('./config');
const mapEngine = require('./mapEngine');
const puzzles = require('./puzzles');
const relics = require('./relics');
const rooms = require('./rooms');
const state = require('./state');
const points = require('./points');
const feed = require('./feed');
const classEncounters = require('../classEncounters');

const DEAD_WORLDS = [
    { key: 'ember', name: 'the ember fields', flavor: 'Ash-choked', bg: 'spark_3.png' },
    { key: 'frost', name: 'the frost reach', flavor: 'Frost-bitten', bg: 'spark_8.png' },
    { key: 'wildwood', name: 'the wildwood', flavor: 'Overgrown', bg: 'spark_12.png' },
    { key: 'stormreach', name: 'the storm reach', flavor: 'Storm-torn', bg: 'spark_5.png' },
    { key: 'venom', name: 'the venom marsh', flavor: 'Blighted', bg: 'spark_16.png' },
    { key: 'sunscorch', name: 'the sunscorch', flavor: 'Sun-scorched', bg: 'spark_7.png' },
    { key: 'drowned', name: 'the drowned sea', flavor: 'Tide-drowned', bg: 'spark_11.png' },
    { key: 'blackkeep', name: 'the black keep', flavor: 'Shadowed', bg: 'spark_10.png' },
    { key: 'ash', name: 'the ash gardens', flavor: 'Garden-gone-grey', bg: 'spark_2.png' },
];
function worldTheme(worldKey) { return DEAD_WORLDS.find((w) => w.key === worldKey) || DEAD_WORLDS[0]; }

// ── battle variants: weighted, deterministic pick per room seed ──
function pickVariant(rng) {
    const entries = Object.entries(CFG.COMBAT.VARIANTS || {});
    if (!entries.length) return null;
    const total = entries.reduce((s, [, v]) => s + (v.weight || 1), 0);
    let roll = rng.next() * total;
    for (const [key, v] of entries) {
        roll -= (v.weight || 1);
        if (roll <= 0) return { key, ...v };
    }
    return { key: entries[0][0], ...entries[0][1] };
}

function variantOf(room) {
    const key = payloadGet(room.payload, 'variant');
    if (!key) return null;
    const v = (CFG.COMBAT.VARIANTS || {})[key];
    return v ? { key, ...v } : null;
}

// ── seeding: server-side payload per room (called once at event start) ──
function buildRoomPayload(eventDoc, room, map) {
    const rng = mapEngine.makeRng(`${eventDoc.seed}:${room.key}`);
    const theme = worldTheme(eventDoc.deadWorld || rng.pick(DEAD_WORLDS).key);
    const enemyLvl = Math.max(1, Math.round(CFG.COMBAT.BASE_ENEMY_LEVEL + room.ring * 10 * CFG.COMBAT.LEVEL_RING_SCALE));
    const payload = { theme: theme.key, flavor: theme.flavor };
    // 🛡️ OWNER RULE 2026-10-05 (live playtest): a champion must NEVER wake up
    // in a room with monsters — "players that are weaker than the monsters
    // in a ruin should never spawn into a room with monsters." state.startEvent
    // rebakes combat/coop spawn rooms as 'empty' (first belt); this guard is
    // the second: whatever a spawn room's type, it seeds NO enemies and NO
    // boss. Weak or strong, everyone lands somewhere calm.
    const isSpawnRoom = Array.isArray(map && map.spawns) && map.spawns.includes(room.key);

    switch (room.type) {
        case 'combat': {
            if (isSpawnRoom) break; // safe landing hall — no pack
            const variant = pickVariant(rng);
            const ringSafe = Number.isFinite(room.ring) ? room.ring : 0; // NaN ring -> empty enemies (fight bricked)
            let count = rng.int(1, Math.max(1, Math.min(3, 1 + Math.floor(ringSafe * 3))));
            let lvl = enemyLvl;
            if (variant) {
                payload.variant = variant.key;
                payload.gpMult = variant.gpMult || 1;
                // OWNER RULE 2026-10-05: max THREE enemies in any given room —
                // variant bumps can no longer push a pack past the cap.
                count = Math.max(1, Math.min(3, count + (variant.countDelta || 0)));
                lvl = Math.max(1, enemyLvl + (variant.levelDelta || 0));
            }
            payload.enemies = Array.from({ length: count }, () => ({ level: lvl }));
            payload.boss = false;
            break;
        }
        case 'puzzle': {
            const p = puzzles.generate(rng, room, map);
            payload.puzzle = { kind: p.kind, prompt: p.prompt, answer: p.answer, altAnswers: p.altAnswers || [],
                normalize: String(p.normalize ? p.normalize(p.answer) : p.answer), maxAttempts: CFG.PUZZLE.ATTEMPTS,
                // 🖨️ owner 2026-10-06: symbol puzzles carry their glyph/shape
                // list so `examine` can follow with the STANDALONE copy-paste
                // line (the prompt embeds them in prose/markup — annoying to
                // copy). Symbols are shown to the player anyway: no leak.
                symbols: Array.isArray(p.symbols) ? p.symbols : null };
            payload.puzzleRaw = { meta: p.meta || null };
            break;
        }
        case 'discovery': {
            payload.relic = relics.rollRoomRelic(rng, room);
            if (rng.next() < 0.4) payload.zeni = rng.int(200, 2000);
            payload.text = rng.pick([
                'Half-buried beneath the rubble, something still hums with old power.',
                'A shattered shrine hides a cavity beneath - something inside survived the world\u2019s death.',
                'Time-worn wrappings guard an object the end of the world could not claim.',
            ]);
            break;
        }
        case 'reward': {
            payload.relic = relics.rollRoomRelic(rng, room);
            payload.zeni = rng.int(500, 4000);
            break;
        }
        case 'hazard': {
            payload.hazardDamage = 0.05 + room.ring * 0.1; // fraction of maxHP
            payload.hazardText = rng.pick([
                'The floor gives way to a spiked pit...',
                'A pressure plate hisses - green gas floods the hall...',
                'The ceiling groans and drops stone shards...',
            ]);
            break;
        }
        case 'lore': {
            payload.lore = rng.pick([
                `This hall once belonged to ${theme.name}. The murals still burn faintly.`,
                'A dead world\u2019s last message is scratched here: "We were not warned."',
                'Statues line the walls - each face eroded to smoothness except their eyes.',
                `The air tastes of ${theme.flavor.toLowerCase()} stone. Something great fell here.`,
            ]);
            break;
        }
        case 'secret': {
            payload.relic = relics.rollRoomRelic(rng, { ...room, ring: Math.max(0.8, room.ring) });
            payload.boss = rng.next() < CFG.COMBAT.BOSS_CHANCE_SECRET;
            if (isSpawnRoom) payload.boss = false; // no boss at the landing hall
            if (payload.boss) payload.enemies = [{ level: enemyLvl + 8 }];
            break;
        }
        case 'anomaly': {
            payload.anomaly = rng.pick(['relic_ping', 'hp_drain', 'gp_windfall', 'fog_burst']);
            break;
        }
        case 'landmark': {
            payload.landmarkName = rng.pick(['The Silent Obelisk', 'Fallen Colossus', 'Gate of the Old World', 'Weeping Arch']);
            payload.lore = `A landmark of ${theme.name}, visible from far away. First guild to record it earns recognition.`;
            break;
        }
        case 'coop': {
            if (isSpawnRoom) break; // safe landing hall — no guardian pack
            const variant = pickVariant(rng);
            payload.variant = variant ? variant.key : undefined;
            payload.gpMult = variant ? (variant.gpMult || 1) : 1;
            // OWNER RULE 2026-10-05: max THREE enemies in any given room.
            const count = Math.max(1, Math.min(3, rng.int(2, 3) + (variant ? (variant.countDelta || 0) : 0)));
            payload.enemies = Array.from({ length: count }, () => ({ level: Math.max(1, enemyLvl + 2 + (variant ? (variant.levelDelta || 0) : 0)) }));
            payload.coopEncounter = true;
            break;
        }
        case 'core': {
            payload.enemies = [{ level: Math.round(CFG.COMBAT.BASE_ENEMY_LEVEL * CFG.COMBAT.CORE_GUARD_LEVEL_MULT) }];
            payload.boss = true;
            payload.coreGuardian = true;
            break;
        }
        default:
            return {}; // empty rooms: no payload
    }
    return payload;
}

// ── enter: room intro + state transitions ──
async function onRoomEnter(eventDoc, player, room) {
    const lines = [];
    const flavor = payloadGet(room.payload, 'flavor') || worldTheme(eventDoc.deadWorld).flavor;

    // residue for later visitors
    const residue = mapToObj(room.residue);
    if (room.state === 'CLEARED') {
        lines.push(`🚶 This chamber has already been dealt with${room.clearedByGuild ? ` by *${room.clearedByGuild}*` : ''}.`);
        if (residue?.loot?.gp) {
            await points.award(eventDoc.eventId, player.jid, residue.loot.gp, 'residue');
            lines.push(`You sweep up a few leftover valuables (+GP).`);
        }
        if (residue?.note) lines.push(`_${residue.note}_`);
        return lines.join('\n');
    }

    switch (room.type) {
        case 'empty':
            lines.push(`🌫️ An empty hall of ${flavor.toLowerCase()} stone. The silence is heavy, but the way onward is clear.`);
            // exploring empty rooms still counts as discovery progress
            await maybeDiscoveryMilestone(eventDoc, player);
            break;
        case 'combat':
            rooms.markActive(eventDoc.eventId, room.key);
            lines.push(`⚔️ Something moves in the dark of this ${flavor.toLowerCase()} chamber - *enemies bar the way*. The battle begins!`);
            lines.push(`_Fleeing retreats you to the previous room and forfeits this room\u2019s spoils._`);
            break;
        case 'puzzle':
            rooms.markActive(eventDoc.eventId, room.key);
            // 🔄 owner ruins_fixes.txt #8: the encounter does NOT start on
            // entry — the player must interact first (spawn → interact →
            // encounter begins). The prompt itself rides the `examine`.
            lines.push(`🧩 A sealed mechanism blocks the far door. Ancient grooves wait under a skin of dust.`);
            lines.push(`_Type \`examine\` to study it. Wrong answers have a cost._`);
            break;
        case 'discovery':
            lines.push(`🔍 ${payloadGet(room.payload, 'text') || 'Something is hidden here.'}`);
            lines.push(`Type \`dig\` to unearth it.`);
            break;
        case 'reward':
            lines.push(`💠 A vault-chamber of the old world - untouched. Type \`take\` to claim what lies within.`);
            break;
        case 'hazard':
            lines.push(`☠️ ${payloadGet(room.payload, 'hazardText') || 'Danger lurks here.'} Type \`cross\` to attempt passage.`);
            break;
        case 'lore':
            lines.push(`📖 ${payloadGet(room.payload, 'lore') || 'Old words cover these walls.'}`);
            break;
        case 'secret':
            lines.push(`✨ A hidden chamber! The air shivers with concentrated power.`);
            if (room.payload.boss) lines.push(`But something ancient guards it - *and it has noticed you!*`);
            else lines.push(`Type \`claim\` to take what it holds.`);
            break;
        case 'anomaly':
            lines.push(`🌀 Reality thins here - the walls between worlds bleed through. Type \`touch\` to interact... or move on.`);
            break;
        case 'landmark':
            lines.push(`🗿 *${payloadGet(room.payload, 'landmarkName') || 'A landmark'}* - ${payloadGet(room.payload, 'lore') || 'a marker of the old world.'}`);
            break;
        case 'coop':
            rooms.markActive(eventDoc.eventId, room.key);
            lines.push(`🤝 A guardian pack blocks this hall. Allies in the room may fight it together (shared reward).`);
            break;
        case 'finale': {
            // ⏳ WARDEN FINALE (owner 2026-10-05): the timer-end boss hunt
            rooms.markActive(eventDoc.eventId, room.key);
            const wName = payloadGet(room.payload, 'wardenName') || 'the Warden';
            lines.push(`⏳ *${wName.toUpperCase()}* rises from the floor of this ${flavor.toLowerCase()} hall — one of the four wardens holding the war open.`);
            lines.push(`*It attacks!* Allies in the room fight it together. The war ends when all four wardens fall.`);
            break;
        }
        case 'core':
            rooms.markActive(eventDoc.eventId, room.key);
            lines.push(`🌍 *THE WORLD CORE* - the heart of this dead world still beats here. A mighty guardian bars the way.`);
            lines.push(`First guild to breach it earns lasting glory. *The guardian attacks!*`);
            break;
        default:
            lines.push(`You stand in the ${flavor.toLowerCase()} ruins.`);
    }
    return lines.join('\n');
}

async function maybeDiscoveryMilestone(eventDoc, player) {
    const n = (player.discovered || []).length;
    if (n > 0 && n % CFG.POINTS.DISCOVERY_EVERY === 0) {
        const res = await points.award(eventDoc.eventId, player.jid, CFG.POINTS.DISCOVERY_GP, 'discovery');
        if (res.awarded > 0) {
            feed.queue(eventDoc.eventId, 'normal', `🗺️ *${player.name}* has charted ${n} chambers of the Ruins — the dead world keeps fewer secrets with every step.`);
        }
    }
}

function mapToObj(m) {
    if (!m) return null;
    if (typeof m.get === 'function') {
        const out = {};
        for (const [k, v] of m.entries()) out[k] = (v && typeof v.get === 'function') ? Object.fromEntries(v.entries()) : v;
        return out;
    }
    return m;
}

// mongoose Map-safe payload read: returns plain object for a payload field
function payloadGet(payload, key) {
    if (!payload) return undefined;
    const v = typeof payload.get === 'function' ? payload.get(key) : payload[key];
    if (v && typeof v.get === 'function' && !(v instanceof Date)) {
        const out = {};
        for (const [k, val] of v.entries()) out[k] = val;
        return out;
    }
    return v;
}

// ── real HP damage (§15 #5): hazards/puzzles/anomalies used to be PURE TEXT
// — damage was displayed, never written anywhere. The Ruins draw on the
// player's PERSISTENT HP (same pool combat uses), so entering the next fight
// wounded is now real. Never kills: floor of 1 HP — only combat takes lives.
async function applyWarDamage(playerJid, dmg, maxHp) {
    try {
        const economy = require('../economy');
        const cap = maxHp || 100;
        const cur = economy.getPersistentHP(playerJid, cap);
        const next = Math.max(1, (Number(cur) || cap) - Math.max(0, Math.round(dmg)));
        economy.setPersistentHP(playerJid, next, cap);
        return next;
    } catch (e) {
        console.error('[Ruins] war damage failed (non-fatal):', e?.message);
        return null;
    }
}

// ── resolve DM input against the CURRENT room's encounter ──
// returns { text, handled, sentCombat, afterImage? }
// afterImage = the CHANGED room scene (owner directive: show what the room
// looks like after the interaction resolves).
async function resolveInput(eventDoc, player, room, input, { sock, chatId, groq } = {}) {
    const norm = String(input || '').trim().toLowerCase();
    const P = room.payload || {};

    // 🔄 IMMEDIATE OUTCOME SPRITE (owner ruins_fixes.txt #2/#4, 2026-10-05):
    // clearRoom flips the room in the DB only — the in-memory room stayed
    // ACTIVE, so the VERY NEXT render (the dig/take result image) still
    // showed the rubble / closed chest. The outcome only appeared after the
    // player LEFT the room — exactly when the sprite was supposed to
    // despawn. Syncing the in-memory room to the won claim makes the
    // outcome sprite generate IMMEDIATELY after the interaction.
    const markClearedLocal = () => {
        try {
            room.state = 'CLEARED';
            room.clearedBy = player.jid;
            if (player.guildId) room.clearedByGuild = player.guildId;
            room.clearedAt = new Date();
            room.lootFresh = true;   // 🪙 spoils still render for THIS presence; despawns when the looter leaves
        } catch (e) { /* read-only room objects just keep the old sprite */ }
    };

    switch (room.type) {
        // ── puzzle ──
        // ⚔️ MECHANISM OVERHAUL (owner brief §7 — full state/lifecycle fix):
        //   • ONE authoritative evaluation per message — the attempt is an
        //     ATOMIC $inc claim (rooms.claimPuzzleAttempt). Concurrent/rapid
        //     answers can never share an attempt or evaluate stale state
        //     (the old read-modify-write lost updates under bursts).
        //   • Exhaustion = TRUE RESET: one shock, counter back to 0, the seal
        //     restarts from the first inscription exactly as the message
        //     promises. No treadmill where every further input shocks forever.
        //   • NO autonomous loop anywhere: this handler runs strictly inside
        //     the dmRouter's per-player serialization and only ever runs when
        //     a player message arrives. Nothing here schedules, retries or
        //     re-sends itself (verified by the silence check in the QA suite).
        //   • Re-entry safe: claim() refuses CLEARED rooms, so re-entering a
        //     solved/failing chamber can never fork a second instance.
        case 'puzzle': {
            if (!norm) return { handled: false };
            // 🔄 ENCOUNTER GATE (owner ruins_fixes.txt #8): spawn/appear →
            // player interacts → encounter begins. The mechanism no longer
            // wakes on entry: the board stays hidden and NO answer attempt
            // is consumed until the player `examine`s it. Carved Verse and
            // every other puzzle kind share this same gated flow.
            const pzLive = payloadGet(P, 'puzzle');
            const pzStarted = !!(pzLive && (pzLive.started || (pzLive.attemptsUsed || 0) > 0));
            if (!pzStarted) {
                if (!['examine', 'inspect', 'study', 'check', 'interact'].includes(norm)) {
                    return { handled: true, text: '🧩 A sealed mechanism dominates the chamber. Type `examine` to study it.' };
                }
                await rooms.startPuzzle(eventDoc.eventId, room.key);
                try { if (pzLive && typeof pzLive === 'object') pzLive.started = true; } catch (e) { /* immutable payload */ }
                // 🖨️ owner 2026-10-06: for the symbol games (rune lock, memory
                // mosaic) the examine reply is FOLLOWED by a standalone
                // message holding just the symbols — the player copies that
                // line, reorders it, sends it back. No markup, no prose.
                const symLine = pzLive && Array.isArray(pzLive.symbols) && pzLive.symbols.length
                    ? pzLive.symbols.join(' ') : null;
                return {
                    handled: true,
                    afterImage: await puzzleBoardScene(eventDoc, player, room),
                    text: `🧩 You study the mechanism - it hums awake under your fingers...\n\n${(pzLive && pzLive.prompt) || 'The mechanism awaits an answer.'}\n\n_Reply with your answer. ${(pzLive && pzLive.maxAttempts) || CFG.PUZZLE.ATTEMPTS} attempts. Wrong answers have a cost._`,
                    afterText: symLine || undefined,
                };
            }
            const claimed = await rooms.claimPuzzleAttempt(eventDoc.eventId, room.key);
            if (!claimed) return { handled: true, text: '🧱 The mechanism is inert - its seal has already been broken.' };
            const { attempts, puzzle: pz } = claimed;
            const maxAttempts = pz.maxAttempts || CFG.PUZZLE.ATTEMPTS;
            const result = puzzles.checkByKind(pz.kind, pz, norm, attempts);
            if (result.solved) {
                const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
                if (claim.won) {
                    markClearedLocal();
                    const gp = CFG.PUZZLE.GP_SOLVE + (attempts - 1 === 0 ? CFG.PUZZLE.GP_GRADE_BONUS * maxAttempts : (maxAttempts - attempts + 1) * CFG.PUZZLE.GP_GRADE_BONUS);
                    await points.award(eventDoc.eventId, player.jid, gp, 'puzzle', { coopBonus: room.occupants?.length > 1 });
                    await awardRoomRelic(eventDoc, player, room);
                    feed.queue(eventDoc.eventId, 'normal', `🧩 The seal shatters — ${player.name} has out-thought a ${roomFlavor(room)}.`);
                    return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `🔓 *The mechanism clicks open!* (+GP) The way onward is clear.` };
                }
                return { handled: true, text: `Someone else solved this seal a heartbeat before you.` };
            }
            if (attempts >= maxAttempts) {
                const maxHp = player.stats?.maxHp || 100;
                const dmg = Math.round(maxHp * CFG.PUZZLE.FAIL_HAZARD_DAMAGE);
                await applyWarDamage(player.jid, dmg, maxHp);
                await rooms.resetPuzzleAttempts(eventDoc.eventId, room.key);
                await state.updatePlayer(eventDoc.eventId, player.jid, {}, { lastActionAt: Date.now() });
                feed.queue(eventDoc.eventId, 'minor', `🧩 ${player.name} gambled on a seal and the mechanism drew blood.`);
                // 🔁 owner 2026-10-07 (Carved Verse rage-quit): a fail must
                // never strand the player on a bare text line — the verdict
                // rides AFTER a full re-presentation (map card + encounter
                // card) so they always know where they stand.
                return { handled: true, represent: true, text: `💥 The mechanism rejects you with a shock (-${dmg} HP — that was real). The seal resets - the first inscription glows anew. ${maxAttempts} fresh attempts.` };
            }
            return { handled: true, represent: true, text: `❌ Wrong. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.` };
        }

        // ── discovery / reward / secret claim ──
        case 'discovery': {
            if (norm !== 'dig') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `Another explorer got here first - the chamber is bare.` };
            markClearedLocal();
            await awardRoomRelic(eventDoc, player, room);
            if (P.zeni) await points.award(eventDoc.eventId, player.jid, 5, 'discovery');
            feed.queue(eventDoc.eventId, 'normal', `⛏️ Dust and bone give way — ${player.name} digs something old out of a ${roomFlavor(room)}.`);
            return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `⛏️ You unearth it! ${P.zeni ? 'A small cache of Zeni comes with it. ' : ''}Check \`relics\` - hand it in with \`handin\` when ready.` };
        }
        case 'reward': {
            if (norm !== 'take') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `The vault has already been emptied.` };
            markClearedLocal();
            await awardRoomRelic(eventDoc, player, room);
            await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.reward, 'reward');
            feed.queue(eventDoc.eventId, 'normal', `💠 ${player.name} cracked a pre-war vault — its wards still sputtering as the spoils see daylight.`);
            return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `💠 Claimed! The vault is yours. Hand the relic in with \`handin\` to secure its value.` };
        }
        case 'secret': {
            if (payloadGet(P, 'boss')) {
                if (norm !== 'fight') return { handled: false };
                return { handled: true, sentCombat: true, text: null };
            }
            if (norm !== 'claim') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `Someone claimed this secret before you.` };
            markClearedLocal();
            await awardRoomRelic(eventDoc, player, room);
            await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.secret, 'secret');
            feed.queue(eventDoc.eventId, 'major', `🌐 *WORLD EVENT* — ${player.name} has torn open a HIDDEN CHAMBER the Ruins swallowed whole!`);
            return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `✨ A true find! This will be remembered.` };
        }

        // ── hazard ──
        case 'hazard': {
            if (norm !== 'cross') return { handled: false };
            const dodge = Math.random() < 0.5 + (player.stats?.spd || 10) / 200;
            if (dodge) {
                const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
                if (claim.won) {
                    markClearedLocal();
                    await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.hazard, 'hazard');
                    return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `🤸 You slip past the hazard unscathed. (+GP) The way is open.` };
                }
                return { handled: true, text: `The hazard is spent - someone braved it first.` };
            }
            const dmg = Math.round((player.stats?.maxHp || 100) * (payloadGet(P, 'hazardDamage') || 0.08));
            await applyWarDamage(player.jid, dmg, player.stats?.maxHp || 100);
            feed.queue(eventDoc.eventId, 'minor', `🩸 A ${roomFlavor(room)} hazard caught ${player.name} — they limp onward, bleeding.`);
            return { handled: true, text: `🩸 The hazard catches you (-${dmg} HP — that was real). Try crossing again.` };
        }

        // ── anomaly ──
        case 'anomaly': {
            if (norm !== 'touch') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `The anomaly has already been disturbed.` };
            markClearedLocal();
            const kind = payloadGet(P, 'anomaly') || 'relic_ping';
            const afterImage = await clearedScene(eventDoc, player, room);
            if (kind === 'relic_ping') {
                const target = nearestRelicRoom(eventDoc, player.roomId);
                return { handled: true, afterImage, text: target ? `🌀 Through the rift you glimpse treasure ${describeDirection(eventDoc, player.roomId, target)}.` : `🌀 The rift shows only dust.` };
            }
            if (kind === 'gp_windfall') {
                await points.award(eventDoc.eventId, player.jid, 20, 'anomaly');
                return { handled: true, afterImage, text: `🌀 Old-world coin rains through the rift! (+GP)` };
            }
            if (kind === 'hp_drain') {
                await applyWarDamage(player.jid, (player.stats?.maxHp || 100) * 0.15, player.stats?.maxHp || 100);
                return { handled: true, afterImage, text: `🌀 The rift drinks deeply of you (-15% HP — that was real). You feel weaker...` };
            }
            return { handled: true, afterImage, text: `🌀 The fog of war thins - distant paths flicker in your mind.` };
        }

        // ── lore / landmark / empty ──
        case 'lore':
            if (!norm || norm === 'lore' || norm === 'read') {
                await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.lore, 'lore');
                await rooms.clearRoom(eventDoc.eventId, room.key, player);
                markClearedLocal();
                return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `📖 You study the inscriptions and carry their memory with you. (+GP)` };
            }
            return { handled: false };
        case 'landmark': {
            if (norm !== 'record') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (claim.won) {
                markClearedLocal();
                await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.landmark, 'landmark');
                feed.queue(eventDoc.eventId, 'major', `🌐 *WORLD EVENT* — ${player.name} of ${player.guildName} inscribed *${P.landmarkName || 'a landmark'}* into the Association's maps for their guild!`);
                return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `🗿 Recorded for ${player.guildName}. The Association takes note. (+GP)` };
            }
            return { handled: true, text: `This landmark was already recorded.` };
        }
        case 'combat':
        case 'coop':
        case 'finale':
        case 'core': {
            if (!['fight', 'attack', 'engage'].includes(norm)) return { handled: false };
            return { handled: true, sentCombat: true, text: null };
        }
        default:
            return { handled: false };
    }
}

function roomFlavor(room) {
    return { combat: 'guarded hall', puzzle: 'sealed chamber', discovery: 'buried cache', reward: 'old vault',
             hazard: 'trapped passage', secret: 'hidden chamber', anomaly: 'world-thin hall', coop: 'guarded hall',
             core: 'World Core', lore: 'inscribed hall', landmark: 'landmark' }[room.type] || 'chamber';
}

// the changed room: cleared-state scene (best-effort, never blocks)
// 💡 OVERHAUL 2026-10-04: same roomScene renderer, cleared wash — the room
// stays visually consistent before/after (no engine swap mid-flow).
async function clearedScene(eventDoc, player, room) {
    try {
        const roomScene = require('./roomScene');
        return await roomScene.renderRoomScene(eventDoc, player, room, { prefix: '.' });
    } catch (e) {
        return null;
    }
}

async function awardRoomRelic(eventDoc, player, room) {
    const rel = payloadGet(room.payload, 'relic');
    if (!rel) return null;
    const rng = mapEngine.makeRng(`${eventDoc.seed}:relic:${room.key}:${player.jid}`);
    const fresh = relics.makeRelic(rng, { category: rel.category, tier: rel.tier, meta: rel.meta || {} });
    fresh.name = rel.name || fresh.name;
    await GuildWarEventPushRelic(eventDoc.eventId, player.jid, fresh);
    // 💬 tier-flavored pickup lines (owner copy overhaul 2026-10-05): a
    // Mythic find should NOT read like a Common one.
    const tierIdx = CFG.RELICS.TIERS.indexOf(fresh.tier);
    const carryLine = tierIdx >= 3
        ? `💎 *${fresh.name}* (${fresh.tier}) — a treasure of the old world — now rides with ${player.name}!`
        : tierIdx === 0
            ? `💎 ${player.name} pried *${fresh.name}* (${fresh.tier}) loose from the Ruins.`
            : `💎 ${player.name} walks out of the dark carrying *${fresh.name}* (${fresh.tier}).`;
    feed.queue(eventDoc.eventId, relics.isStealable(fresh) ? 'normal' : 'minor', carryLine);

    // 💡 NEW RUINS REWARD (2026-10-03, owner request): the Silver Veil Charm
    // - a rare extra find in relic chambers (10%). Using it toggles the
    // player's level veil; see inventorySystem.useItem + economy.displayLevel.
    if (rng.next ? rng.next() < 0.10 : Math.random() < 0.10) {
        try {
            const inventorySystem = require('../inventorySystem');
            await inventorySystem.addItem(player.jid, 'silver_veil', 1);
            feed.queue(eventDoc.eventId, 'normal',
                `🫥 Among the relics, ${player.name} finds a *Silver Veil Charm* — a whisper of silver that can veil their strength.`);
        } catch (e) {
            console.error('[Ruins] silver_veil drop failed (non-fatal):', e?.message);
        }
    }
    return fresh;
}

async function GuildWarEventPushRelic(eventId, jid, relic) {
    const GuildWarEvent = require('../../models/GuildWarEvent');
    await GuildWarEvent.updateOne(
        { eventId, 'players.jid': jid },
        { $push: { 'players.$.relics': relic } }
    );
}

// nearest room still holding a relic (seeker/anomaly support)
function nearestRelicRoom(eventDoc, fromKey) {
    const [fx, fy] = fromKey.split(',').map(Number);
    let best = null, bestD = Infinity;
    for (const r of eventDoc.rooms) {
        if (r.state === 'CLEARED') continue;
        const hasRelic = r.payload?.relic || (r.payload?.droppedRelics?.length);
        const pending = r.type === 'reward' || r.type === 'discovery' || r.type === 'secret';
        if (!hasRelic && !pending) continue;
        const [x, y] = r.key.split(',').map(Number);
        const d = Math.abs(x - fx) + Math.abs(y - fy);
        if (d < bestD) { bestD = d; best = r.key; }
    }
    return best;
}

function describeDirection(eventDoc, fromKey, toKey) {
    const [fx, fy] = fromKey.split(',').map(Number);
    const [tx, ty] = toKey.split(',').map(Number);
    const dx = tx - fx, dy = ty - fy;
    return `${Math.abs(dx)} room${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'} and ${Math.abs(dy)} room${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'}`;
}

// ── combat integration ──
// ⚔️ §15 #6 (ward relics): a `ward_active` relic now REALLY wraps the next
// fight — its buff rides into startRuinsCombat via spec.ward, and the ward
// is consumed per CFG.RELICS.WARD_FIGHTS fights (removed at zero).
async function consumeWard(eventId, playerJid, relicId) {
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const doc = await GuildWarEvent.findOne({ eventId }, { players: { $elemMatch: { jid: playerJid } } }).lean();
    const relic = doc?.players?.[0]?.relics?.find((r) => r.id === relicId);
    if (!relic) return;
    const meta = typeof relic.meta?.get === 'function' ? Object.fromEntries(relic.meta.entries()) : (relic.meta || {});
    const fights = (meta.fights ?? CFG.RELICS.WARD_FIGHTS) - 1;
    if (fights <= 0) {
        await GuildWarEvent.updateOne(
            { eventId, 'players.jid': playerJid },
            { $pull: { 'players.$.relics': { id: relicId } } }
        );
    } else {
        await GuildWarEvent.updateOne(
            { eventId, 'players.jid': playerJid, 'players.relics.id': relicId },
            { $set: { 'players.$.relics.$[r].meta.fights': fights } },
            { arrayFilters: [{ 'r.id': relicId }] }
        );
    }
}

// ══════════════════════════════════════════════════════════════════════
// 🎚️ PvE BAND LADDER — owner spec 2026-10-06 (ruins_pve_boss_scaling_prompt)
// Regular encounters resolve at ENGAGE time against the ENGAGING player and
// the guild's SHARED exploration progress; bosses anchor to the roster's
// high range, capped so the strongest champion can solo them. The map's
// spatial danger (room.ring 0..1) keeps pushing the mix hotter — deep rooms
// are scary even in an unexplored ruin, outer halls stay calm late into a
// well-explored one. Team co-op seating follows the ENGAGER's lane (the
// player who opened the fight set its difficulty). Falls back to the seeded
// payload levels (legacy ring curve) whenever bands can't be computed.
// ══════════════════════════════════════════════════════════════════════

const _bandCache = new Map(); // eventId → bands (in-process fast path; doc copy is shared truth)

// Roster percentiles → band anchors. Nearest-rank over the REAL progression
// levels of every registered player. Cached on the event doc so both boxes
// read one truth (each box computing independently yields the same values —
// percentiles over the same roster are deterministic).
async function getRosterBands(eventDoc) {
    if (!CFG.COMBAT.BANDS.ENABLED) return null;
    if (eventDoc.bands && eventDoc.bands.p80) return eventDoc.bands;
    if (_bandCache.has(eventDoc.eventId)) return _bandCache.get(eventDoc.eventId);
    try {
        const progression = require('../progression');
        const players = Array.isArray(eventDoc.players) ? eventDoc.players : [];
        const levels = players.map((p) => Math.max(1, Math.round(Number(progression.getLevel(p.jid)) || 1)));
        if (levels.length < 2) return null; // solo registrations: keep the legacy ring curve
        levels.sort((a, b) => a - b);
        const q = (f) => levels[Math.min(levels.length - 1, Math.max(0, Math.ceil(f * levels.length) - 1))];
        const bands = { p50: q(0.5), p80: q(0.8), maxLvl: levels[levels.length - 1], n: levels.length, at: Date.now() };
        _bandCache.set(eventDoc.eventId, bands);
        require('../../models/GuildWarEvent').updateOne(
            { eventId: eventDoc.eventId },
            { $set: { bands } }
        ).catch((e) => console.error('[Ruins] bands persist failed (non-fatal):', e?.message));
        return bands;
    } catch (e) {
        console.error('[Ruins] band compute failed (non-fatal):', e?.message);
        return null;
    }
}

// Shared exploration progress 0..1: share of rooms no longer UNEXPLORED.
// Rooms only ever move UNEXPLORED→ACTIVE→CLEARED, so this is monotonic —
// the map expanding never un-earns progress, no ratchet needed.
function explorationProgress(eventDoc) {
    const roomsList = Array.isArray(eventDoc.rooms) ? eventDoc.rooms : [];
    if (!roomsList.length) return 0;
    let touched = 0;
    for (const r of roomsList) if (r && r.state && r.state !== 'UNEXPLORED') touched++;
    return Math.min(1, touched / roomsList.length);
}

// Mix of {low, mid, high} rolls at shared exploration t∈[0..1]: piecewise
// lerp EARLY→MID→LATE, normalized defensively.
function bandWeights(t) {
    const B = CFG.COMBAT.BANDS;
    const lerp = (a, b, u) => a + (b - a) * u;
    const [from, to, u] = t <= 0.5
        ? [B.MIX_EARLY, B.MIX_MID, t / 0.5]
        : [B.MIX_MID, B.MIX_LATE, (t - 0.5) / 0.5];
    const w = { low: lerp(from.low, to.low, u), mid: lerp(from.mid, to.mid, u), high: lerp(from.high, to.high, u) };
    const total = (w.low + w.mid + w.high) || 1;
    return { low: w.low / total, mid: w.mid / total, high: w.high / total };
}

function pickBand(w, roll) {
    if (roll < w.high) return 'high';
    if (roll < w.high + w.mid) return 'mid';
    return 'low';
}

// Per-engage resolution → { level, band, boss } or null (→ legacy curve).
// - Regular bands key to the ENGAGING player: LOW sits at/below them, MED
//   is slightly above, HIGH is the roster's high lower-edge — but never a
//   wall (MAX_PLAYER_GAP). A lvl-1 tester rolling HIGH meets a +5 fight,
//   not the ace's tier; the ace rolling anything meets the roster ceiling.
// - Bosses are ROSTER-anchored (same fight for every party that walks in)
//   and capped at strongest+BOSS_CAP_ABOVE_TOP so the top champion can solo.
async function resolveEngagement(eventDoc, room, player, { boss = false, bossKind = 'secret', coop = false, variantDelta = 0, rng = Math.random } = {}) {
    const B = CFG.COMBAT.BANDS;
    const bands = await getRosterBands(eventDoc);
    if (!bands) return null;
    const pl = Math.max(1, Math.round(Number(player && player.level) || 1));
    const ring = Math.min(1, Math.max(0, Number(room && room.ring) || 0));
    const t = Math.min(1, explorationProgress(eventDoc) + ring * B.RING_LOCAL_WEIGHT);
    const band = boss ? 'boss' : pickBand(bandWeights(t), rng());
    let level;
    if (boss) {
        level = Math.max(2, Math.min(
            bands.p80 + (bossKind === 'core' ? B.BOSS_LEVEL_ADD_CORE : B.BOSS_LEVEL_ADD_SECRET),
            bands.maxLvl + B.BOSS_CAP_ABOVE_TOP
        ));
    } else {
        const base = band === 'low'
            ? Math.min(bands.p50, Math.max(1, pl - B.LOW_DROP))
            : band === 'mid'
                ? Math.min(bands.p80, pl + B.MED_GAP)
                : Math.min(bands.p80, pl + B.HIGH_GAP);
        level = Math.max(1, Math.min(base + variantDelta + (coop ? 2 : 0), pl + B.MAX_PLAYER_GAP));
    }
    return { level, band, boss };
}

async function startRoomCombat(sock, chatId, player, eventDoc, room, { groq } = {}) {
    const guildAdventure = require('../guildAdventure');
    const theme = worldTheme(payloadGet(room.payload, 'theme') || eventDoc.deadWorld);
    // ⚔️ robustness: an empty enemies array (e.g. NaN-ring map build) must
    // never brick a fight - always fall back to a ring-scaled default spec.
    const rawSpecs = payloadGet(room.payload, 'enemies');
    // OWNER RULE 2026-10-05: max THREE enemies in any given room. The slice
    // also clamps ALREADY-SEEDED events whose stored payload still carries 4.
    const enemySpecs = ((Array.isArray(rawSpecs) && rawSpecs.length)
        ? rawSpecs
        : [{ level: 10 + Math.round((room.ring || 0) * 6) }]).slice(0, 3);
    const variant = variantOf(room);
    const isCore = !!payloadGet(room.payload, 'coreGuardian');
    const isFinale = !!payloadGet(room.payload, 'finaleBoss');

    // 🎚️ BAND RESOLUTION (owner spec 2026-10-06): regular encounters key to
    // the ENGAGING player's level + the guild's SHARED exploration progress;
    // bosses (secret / warden / world core) key to the roster's high range,
    // solo-capped. Falls back to the seeded payload levels (legacy ring
    // curve) whenever bands are absent — already-seeded events and solo
    // rosters behave exactly as before. Co-op seats follow the engager.
    const isBossRoom = isCore || isFinale || !!payloadGet(room.payload, 'boss');
    const engagement = await resolveEngagement(eventDoc, room, player, {
        boss: isBossRoom,
        bossKind: (isCore || isFinale) ? 'core' : 'secret',
        coop: !!payloadGet(room.payload, 'coopEncounter'),
        variantDelta: variant ? (variant.levelDelta || 0) : 0,
    });
    let engageSpecs = enemySpecs;
    let bandRank = 'C';
    if (engagement) {
        engageSpecs = enemySpecs.map((e) => ({ ...e, level: engagement.level }));
        bandRank = engagement.boss
            ? CFG.COMBAT.BANDS.RANK_BOSS
            : (CFG.COMBAT.BANDS.RANK_BY_BAND[engagement.band] || 'C');
    } else {
        bandRank = isFinale ? 'B' : 'C'; // legacy path keeps the warden B badge
    }

    // ⚔️ THE RUINS IS THE ARENA (owner spec §12/§14: no more beach): the
    // battle background is THIS room's own door-plate — the exact image the
    // player was just shown — shipped to the Go service's environment assets.
    // Falls back to the world theme bg only if the plate name is unavailable.
    let background = theme.bg;
    try {
        const roomScene = require('./roomScene');
        const exits = roomScene.exitsFor(eventDoc, player);
        // plateKey ∈ {0, L_a, L_b, R, F, LF, FR, LR, LFR} — all exist as
        // ruins_door_<key>.png files in the Go service environment assets.
        background = `ruins_door_${roomScene.plateKeyFor(exits, `${eventDoc.seed}:${room.key}`)}.png`;
    } catch (e) { /* keep theme bg */ }

    // pull enemies from the level pools (real enemy templates) + world flavor names
    const enemies = engageSpecs.map((e) => {
        const template = classEncounters.selectRandomEnemy(e.level || 10, 'COMMON');
        return { type: template?.id, level: e.level || 10, name: template ? `${theme.flavor} ${template.name}` : undefined };
    });

    // ward relic → real buff for THIS fight (atk/def percent or shield)
    let ward = null;
    const wardRelic = (player.relics || []).find((r) => r.category === 'ward_active');
    if (wardRelic) {
        const buff = relics.wardBuff(wardRelic);
        if (buff) ward = { buff, relicId: wardRelic.id };
    }

    // 🤝 TEAM CO-OP (owner 2026-10-05 23:09Z): every ACTIVE same-guild
    // champion standing in this room is seated at ONE shared battle — the
    // quest/raid party shape on the Ruins PvE engine. Rivals (other guilds)
    // are NOT seated; the router handles them with the occupied-room rule.
    const mates = (room.occupants || [])
        .filter((j) => j && j !== player.jid)
        .map((j) => (eventDoc.players || []).find((p) => p.jid === j))
        .filter((p) => p && p.guildId === player.guildId && p.status === 'active'
            && !guildAdventure.isUserInAnyCombat(p.jid))
        .map((p) => p.jid);
    const participants = [player.jid, ...mates];

    await rooms.markActive(eventDoc.eventId, room.key);
    const started = await guildAdventure.startRuinsCombat(sock, chatId, player.jid, {
        enemies: enemies.filter((e) => e.type),
        eventId: eventDoc.eventId, roomKey: room.key,
        // 🎚️ rank badge keys to the resolved band (C outer → B mid → A deep,
        // S bosses/wardens) — a difficulty read at a glance, per the owner's
        // balance brief. Legacy C (wardens B) whenever bands didn't resolve.
        rank: bandRank, background, groq,
        greeting: variant ? `${variant.line}` : null,
        name: isCore ? 'World Core Guardian'
            : (isFinale ? `Warden — ${payloadGet(room.payload, 'wardenName') || 'the Warden'}`
                : (variant ? `Ruins ${variant.name}` : 'Ruins Encounter')),
        // ⚔️ owner directive 2026-10-05 23:39Z: the square map panel is GONE
        // from ruins battles (the fight stays IN the room scene — see
        // guildWar/battleScene.js); no map fragment rides to any renderer.
        ward: ward ? ward.buff : null,
        // 🤝 co-op: room-scoped shared session + every guildmate in the room
        sessionKey: guildAdventure.ruinsRoomRawKey(eventDoc.eventId, room.key),
        participants,
    });
    if (started.success && ward) {
        await consumeWard(eventDoc.eventId, player.jid, ward.relicId).catch((e) =>
            console.error('[Ruins] ward consume failed (non-fatal):', e?.message));
    }
    return started;
}

// ── room intro WITH the environment scene: { text, image } ──
// 💡 OVERHAUL 2026-10-04: the scene is rendered IN-PROCESS by roomScene.js
// — the owner's own Ruins plates, door-variant selected from the room's
// REAL exits, the player's ASSIGNED sprite standing at a consistent spot,
// yellow chevrons on every open arch, floor compass generated from
// adjacency, per-type ambience. NO banner, NO rank, NO cosmetic corner
// sprite, NO parchment type card. The Go microservice is out of the
// exploration flow (it still renders actual battle scenes — §15: the
// existing combat engine stays).
// Puzzle rooms: the game board OVERLAYS the scene panel (owner directive).
// 🔄 ENCOUNTER GATE HELPERS (owner ruins_fixes.txt #8, 2026-10-05):
// "spawn/appear -> player interacts -> encounter begins". A puzzle's board
// card is attached ONLY once the encounter has actually started (the player
// typed `examine`, or an attempt was already burned in a pre-gate war).
function puzzleStarted(room) {
    const pz = payloadGet(room.payload, 'puzzle');
    return !!(pz && (pz.started || (pz.attemptsUsed || 0) > 0));
}

async function puzzleBoardOpts(eventDoc, room) {
    const P = room.payload || {};
    const pz = payloadGet(P, 'puzzle');
    if (!pz) return {};
    try {
        const board = await require('./puzzleCards').renderPuzzleCard({
            kind: pz.kind, prompt: pz.prompt,
            attemptsUsed: pz.attemptsUsed || 0,
            attemptsMax: pz.maxAttempts || CFG.PUZZLE.ATTEMPTS,
            world: worldTheme(payloadGet(P, 'theme') || eventDoc.deadWorld).name,
            ring: Math.max(1, Math.round((room.ring || 0) * 4) + 1),
        });
        return { puzzleBoard: board };
    } catch (e) { return {}; }  // board overlay is best-effort
}

// the encounter-BEGIN scene: the room WITH the board card riding on it —
// sent as the afterImage of `examine` (the moment the encounter starts).
async function puzzleBoardScene(eventDoc, player, room) {
    try {
        const roomScene = require('./roomScene');
        const sceneOpts = { prefix: '.' };
        Object.assign(sceneOpts, await puzzleBoardOpts(eventDoc, room));
        return await roomScene.renderRoomScene(eventDoc, player, room, sceneOpts);
    } catch (e) {
        return null;
    }
}

// ⚔️ MULTIPLAYER BRIEF §6 (waiter resume): players who waited out a live
// fight are told the moment it resolves — normal room behavior resumes.
// kind 'victory': chamber cleared, way open. kind 'defeat': the fighter
// fell — the encounter is still live, a waiter may take it up with `fight`.
// Fire-and-forget from the victory/defeat branches; also a sim seam.
async function notifyRoomResolved(eventId, roomKey, clearerJid, sock, { prefix = '.', kind = 'victory' } = {}) {
    try {
        const ev = await state.getEvent(eventId, { fresh: true });
        if (!ev) return 0;
        const room = ev.rooms.find((r) => r.key === roomKey);
        if (!room) return 0;
        const clearer = Array.isArray(clearerJid)
            ? ev.players.find((p) => p.jid === clearerJid[0])
            : ev.players.find((p) => p.jid === clearerJid);
        const clearerName = clearer ? clearer.name : 'a champion';
        // 🤝 co-op merge: the clearer list may be the WHOLE seated party —
        // every participant is excluded from the waiter pings
        const exclude = new Set(Array.isArray(clearerJid) ? clearerJid : [clearerJid]);
        const waiters = (room.occupants || []).filter((j) => j && !exclude.has(j));
        let n = 0;
        for (const w of waiters) {
            try {
                const wRow = ev.players.find((p) => p.jid === w);
                if (!wRow || wRow.status !== 'active') continue;
                const head = kind === 'defeat'
                    ? `💀 *${clearerName}* fell in this chamber. The fight is up for grabs — \`fight\` to engage it yourself, or \`flee\` back the way you came.`
                    : `🔁 The fight is over — *${clearerName}* cleared the chamber. Normal room behavior resumes; the way onward is open.`;
                await sock.sendMessage(w, { text: head });
                const ctxDoc = await state.getMoveContext(eventId, wRow.roomId);
                if (ctxDoc && ctxDoc.room) {
                    const dmRouter = require('./dmRouter');
                    await dmRouter.presentRoom(sock, w, '\u200B', ctxDoc, wRow, ctxDoc.room, { prefix });
                }
                n++;
            } catch (e) { /* per-waiter best-effort */ }
        }
        return n;
    } catch (e) { return 0; }
}

async function roomIntro(eventDoc, player, room, opts = {}) {
    const text = await onRoomEnter(eventDoc, player, room);
    try {
        const roomScene = require('./roomScene');
        // scene for EVERY room kind — combat kinds included (the scene is
        // the "you walk in and see them" beat; the battle render follows it)
        const sceneOpts = { prefix: opts.prefix || '.' };
        // 🔄 owner ruins_fixes.txt #8: the encounter card only shows AFTER
        // the player interacts — entry into a not-yet-examined puzzle room
        // shows the room + a prompt to examine, never the board.
        if (room.type === 'puzzle' && room.state !== 'CLEARED' && puzzleStarted(room)) {
            Object.assign(sceneOpts, await puzzleBoardOpts(eventDoc, room));
        }
        const scene = await roomScene.renderRoomScene(eventDoc, player, room, sceneOpts);
        if (scene) return { text, image: scene };
        return { text };
    } catch (e) {
        return { text }; // scene failure never blocks play
    }
}

module.exports = {
    DEAD_WORLDS, worldTheme,
    buildRoomPayload, onRoomEnter, roomIntro, resolveInput, startRoomCombat,
    nearestRelicRoom, describeDirection, awardRoomRelic, variantOf, pickVariant,
    payloadGet, puzzleStarted, roomFlavor, notifyRoomResolved,
    // 🎚️ band ladder (owner spec 2026-10-06) — exported for QA probes
    getRosterBands, explorationProgress, bandWeights, pickBand, resolveEngagement,
};
