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

    switch (room.type) {
        case 'combat': {
            const variant = pickVariant(rng);
            const ringSafe = Number.isFinite(room.ring) ? room.ring : 0; // NaN ring -> empty enemies (fight bricked)
            let count = rng.int(1, Math.max(1, Math.min(3, 1 + Math.floor(ringSafe * 3))));
            let lvl = enemyLvl;
            if (variant) {
                payload.variant = variant.key;
                payload.gpMult = variant.gpMult || 1;
                count = Math.max(1, Math.min(4, count + (variant.countDelta || 0)));
                lvl = Math.max(1, enemyLvl + (variant.levelDelta || 0));
            }
            payload.enemies = Array.from({ length: count }, () => ({ level: lvl }));
            payload.boss = false;
            break;
        }
        case 'puzzle': {
            const p = puzzles.generate(rng, room, map);
            payload.puzzle = { kind: p.kind, prompt: p.prompt, answer: p.answer, altAnswers: p.altAnswers || [],
                normalize: String(p.normalize ? p.normalize(p.answer) : p.answer), maxAttempts: CFG.PUZZLE.ATTEMPTS };
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
            const variant = pickVariant(rng);
            payload.variant = variant ? variant.key : undefined;
            payload.gpMult = variant ? (variant.gpMult || 1) : 1;
            const count = Math.max(1, Math.min(4, rng.int(2, 3) + (variant ? (variant.countDelta || 0) : 0)));
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
            lines.push(`⚔️ Something moves in the dark of this ${flavor.toLowerCase()} chamber - *enemies bar the way*. The room must be resolved before you may move on.`);
            lines.push(`Use your standard combat commands here. _Fleeing retreats you to the previous room and forfeits this room\u2019s spoils._`);
            break;
        case 'puzzle':
            rooms.markActive(eventDoc.eventId, room.key);
            lines.push(`🧩 A mechanism blocks the far door.\n\n${payloadGet(room.payload, 'puzzle')?.prompt || 'The mechanism awaits an answer.'}`);
            lines.push(`_Reply with your answer. ${CFG.PUZZLE.ATTEMPTS} attempts. Wrong answers have a cost._`);
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
            if (room.payload.boss) lines.push(`But something ancient guards it... Type \`fight\` - or \`flee\` now.`);
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
        case 'core':
            rooms.markActive(eventDoc.eventId, room.key);
            lines.push(`🌍 *THE WORLD CORE* - the heart of this dead world still beats here. A mighty guardian bars the way.`);
            lines.push(`First guild to breach it earns lasting glory. Type \`fight\` to challenge the guardian.`);
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
            feed.queue(eventDoc.eventId, 'normal', `${player.name} has charted ${n} chambers of the Ruins.`);
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

// ── resolve DM input against the CURRENT room's encounter ──
// returns { text, handled, sentCombat, afterImage? }
// afterImage = the CHANGED room scene (owner directive: show what the room
// looks like after the interaction resolves).
async function resolveInput(eventDoc, player, room, input, { sock, chatId, groq } = {}) {
    const norm = String(input || '').trim().toLowerCase();
    const P = room.payload || {};

    switch (room.type) {
        // ── puzzle ──
        case 'puzzle': {
            const pz = payloadGet(P, 'puzzle');
            if (!pz) return { handled: false };
            if (!norm) return { handled: false };
            const attempts = (pz.attemptsUsed || 0) + 1;
            const result = puzzles.checkByKind(pz.kind, pz, norm, attempts);
            if (result.solved) {
                const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
                if (claim.won) {
                    const gp = CFG.PUZZLE.GP_SOLVE + (attempts - 1 === 0 ? CFG.PUZZLE.GP_GRADE_BONUS * CFG.PUZZLE.ATTEMPTS : (CFG.PUZZLE.ATTEMPTS - attempts + 1) * CFG.PUZZLE.GP_GRADE_BONUS);
                    await points.award(eventDoc.eventId, player.jid, gp, 'puzzle', { coopBonus: room.occupants?.length > 1 });
                    await awardRoomRelic(eventDoc, player, room);
                    feed.queue(eventDoc.eventId, 'normal', `🧩 ${player.name} solved the seal of a ${roomFlavor(room)}.`);
                    return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `🔓 *The mechanism clicks open!* (+GP${P.puzzle ? '' : ''}) The way onward is clear.` };
                }
                return { handled: true, text: `Someone else solved this seal a heartbeat before you.` };
            }
            if (attempts >= CFG.PUZZLE.ATTEMPTS) {
                const dmg = Math.round((player.stats?.maxHp || 100) * CFG.PUZZLE.FAIL_HAZARD_DAMAGE);
                await state.updatePlayer(eventDoc.eventId, player.jid, {}, { lastActionAt: Date.now() });
                feed.queue(eventDoc.eventId, 'minor', `${player.name} failed a seal and paid in blood.`);
                return { handled: true, text: `💥 The mechanism rejects you with a shock (-${dmg} HP). The seal resets - try again from the first inscription.` };
            }
            await rooms.setRoomPayload(eventDoc.eventId, room.key, { 'puzzle.attemptsUsed': attempts });
            return { handled: true, text: `❌ Wrong. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.` };
        }

        // ── discovery / reward / secret claim ──
        case 'discovery': {
            if (norm !== 'dig') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `Another explorer got here first - the chamber is bare.` };
            await awardRoomRelic(eventDoc, player, room);
            if (P.zeni) await points.award(eventDoc.eventId, player.jid, 5, 'discovery');
            feed.queue(eventDoc.eventId, 'normal', `🔍 ${player.name} unearthed something from a ${roomFlavor(room)}.`);
            return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `⛏️ You unearth it! ${P.zeni ? 'A small cache of Zeni comes with it. ' : ''}Check \`relics\` - hand it in with \`handin\` when ready.` };
        }
        case 'reward': {
            if (norm !== 'take') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `The vault has already been emptied.` };
            await awardRoomRelic(eventDoc, player, room);
            await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.reward, 'reward');
            feed.queue(eventDoc.eventId, 'normal', `💠 ${player.name} plundered an old-world vault.`);
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
            await awardRoomRelic(eventDoc, player, room);
            await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.secret, 'secret');
            feed.queue(eventDoc.eventId, 'major', `WORLD EVENT - ${player.name} uncovered a hidden chamber of the Ruins!`);
            return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `✨ A true find! This will be remembered.` };
        }

        // ── hazard ──
        case 'hazard': {
            if (norm !== 'cross') return { handled: false };
            const dodge = Math.random() < 0.5 + (player.stats?.spd || 10) / 200;
            if (dodge) {
                const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
                if (claim.won) {
                    await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.hazard, 'hazard');
                    return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `🤸 You slip past the hazard unscathed. (+GP) The way is open.` };
                }
                return { handled: true, text: `The hazard is spent - someone braved it first.` };
            }
            const dmg = Math.round((player.stats?.maxHp || 100) * (payloadGet(P, 'hazardDamage') || 0.08));
            feed.queue(eventDoc.eventId, 'minor', `${player.name} took a hit from a ${roomFlavor(room)} hazard.`);
            return { handled: true, text: `🩸 The hazard catches you (-${dmg} HP). Try crossing again.` };
        }

        // ── anomaly ──
        case 'anomaly': {
            if (norm !== 'touch') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (!claim.won) return { handled: true, text: `The anomaly has already been disturbed.` };
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
                return { handled: true, afterImage, text: `🌀 The rift drinks deeply of you. You feel weaker...` };
            }
            return { handled: true, afterImage, text: `🌀 The fog of war thins - distant paths flicker in your mind.` };
        }

        // ── lore / landmark / empty ──
        case 'lore':
            if (!norm || norm === 'lore' || norm === 'read') {
                await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.lore, 'lore');
                await rooms.clearRoom(eventDoc.eventId, room.key, player);
                return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `📖 You study the inscriptions and carry their memory with you. (+GP)` };
            }
            return { handled: false };
        case 'landmark': {
            if (norm !== 'record') return { handled: false };
            const claim = await rooms.clearRoom(eventDoc.eventId, room.key, player);
            if (claim.won) {
                await points.award(eventDoc.eventId, player.jid, CFG.POINTS.ROOM_CLEAR.landmark, 'landmark');
                feed.queue(eventDoc.eventId, 'major', `WORLD EVENT - ${player.name} of ${player.guildName} recorded *${P.landmarkName || 'a landmark'}* for their guild!`);
                return { handled: true, afterImage: await clearedScene(eventDoc, player, room), text: `🗿 Recorded for ${player.guildName}. The Association takes note. (+GP)` };
            }
            return { handled: true, text: `This landmark was already recorded.` };
        }
        case 'combat':
        case 'coop':
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
async function clearedScene(eventDoc, player, room) {
    try {
        const encounterScenes = require('./encounterScenes');
        return await encounterScenes.renderScene(eventDoc, player, room, { state: 'cleared' });
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
    feed.queue(eventDoc.eventId, relics.isStealable(fresh) ? 'normal' : 'minor',
        `💎 ${player.name} now carries *${fresh.name}* (${fresh.tier}).`);

    // 💡 NEW RUINS REWARD (2026-10-03, owner request): the Silver Veil Charm
    // - a rare extra find in relic chambers (10%). Using it toggles the
    // player's level veil; see inventorySystem.useItem + economy.displayLevel.
    if (rng.next ? rng.next() < 0.10 : Math.random() < 0.10) {
        try {
            const inventorySystem = require('../inventorySystem');
            await inventorySystem.addItem(player.jid, 'silver_veil', 1);
            feed.queue(eventDoc.eventId, 'normal',
                `🫥 ${player.name} unearthed a *Silver Veil Charm* among the relics.`);
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
async function startRoomCombat(sock, chatId, player, eventDoc, room, { groq } = {}) {
    const guildAdventure = require('../guildAdventure');
    const theme = worldTheme(payloadGet(room.payload, 'theme') || eventDoc.deadWorld);
    // ⚔️ robustness: an empty enemies array (e.g. NaN-ring map build) must
    // never brick a fight - always fall back to a ring-scaled default spec.
    const rawSpecs = payloadGet(room.payload, 'enemies');
    const enemySpecs = (Array.isArray(rawSpecs) && rawSpecs.length) ? rawSpecs : [{ level: 10 + Math.round((room.ring || 0) * 6) }];
    const variant = variantOf(room);
    const isCore = !!payloadGet(room.payload, 'coreGuardian');

    // pull enemies from the level pools (real enemy templates) + world flavor names
    const enemies = enemySpecs.map((e) => {
        const template = classEncounters.selectRandomEnemy(e.level || 10, 'COMMON');
        return { type: template?.id, level: e.level || 10, name: template ? `${theme.flavor} ${template.name}` : undefined };
    });

    await rooms.markActive(eventDoc.eventId, room.key);
    return guildAdventure.startRuinsCombat(sock, chatId, player.jid, {
        enemies: enemies.filter((e) => e.type),
        eventId: eventDoc.eventId, roomKey: room.key,
        rank: 'C', background: theme.bg, groq,
        greeting: variant ? `${variant.line}` : null,
        name: isCore ? 'World Core Guardian' : (variant ? `Ruins ${variant.name}` : 'Ruins Encounter'),
        // ⚔️ square map rides into the battle scene (bottom-right panel)
        mapFragment: require('./encounterScenes').buildMapFragment(eventDoc, player, room),
    });
}

// ── room intro WITH encounter scene: { text, image, extraImage } ──
// 2026-10-02 owner directive: every room renders as a battle-style scene
// (player standing, per-type prop, square map bottom-right, NO combat UI).
// Exploration rooms: scene image rides the intro text. Puzzle rooms ALSO
// emit the actual game board as a follow-up image card (extraImage).
// Combat kinds keep the classic battle render (enemies + square map panel)
// produced by startCombat, so no scene here. The parchment card remains
// only as a render-failure fallback - never the primary visual.
async function roomIntro(eventDoc, player, room) {
    const text = await onRoomEnter(eventDoc, player, room);
    try {
        const encounterScenes = require('./encounterScenes');
        const P = room.payload || {};
        const theme = worldTheme(payloadGet(P, 'theme') || eventDoc.deadWorld);
        const variant = variantOf(room);
        let body = null, actionHint = null, title = null;

        // combat kinds: the battle image IS the intro (enemies + map panel)
        if (['combat', 'coop', 'core'].includes(room.type)) return { text };

        if (room.state === 'CLEARED') {
            // the changed room: show what it looks like now
            const cleared = await encounterScenes.renderScene(eventDoc, player, room, { state: 'cleared' });
            if (cleared) return { text, image: cleared };
            return { text };
        }
        switch (room.type) {
            case 'combat':
                body = variant ? variant.line : 'Something moves in the dark - enemies bar the way. The room must be resolved before you may move on.';
                actionHint = 'Type fight to engage. Fleeing retreats you and forfeits this room\'s spoils.';
                break;
            case 'coop':
                body = variant ? variant.line : 'A guardian pack blocks this hall. Allies in the room may fight it together.';
                actionHint = 'Type fight to engage - allies share the reward.';
                break;
            case 'core':
                body = 'The heart of this dead world still beats here. A mighty guardian bars the way. First guild to breach it earns lasting glory.';
                actionHint = 'Type fight to challenge the guardian.';
                break;
            case 'puzzle': {
                const pz = payloadGet(P, 'puzzle');
                body = (pz && pz.prompt) || 'A mechanism blocks the far door.';
                actionHint = `Reply with your answer - ${CFG.PUZZLE.ATTEMPTS} attempts. Wrong answers have a cost.`;
                break;
            }
            case 'discovery':
                body = payloadGet(P, 'text') || 'Something is hidden here.';
                actionHint = 'Type dig to unearth it.';
                break;
            case 'reward':
                body = 'A vault-chamber of the old world - untouched since the world died.';
                actionHint = 'Type take to claim what lies within.';
                break;
            case 'hazard':
                body = payloadGet(P, 'hazardText') || 'Danger lurks here.';
                actionHint = 'Type cross to attempt passage.';
                break;
            case 'lore':
                body = payloadGet(P, 'lore') || 'Old words cover these walls.';
                actionHint = 'Type read to study the inscriptions.';
                break;
            case 'secret':
                body = payloadGet(P, 'boss') ? 'A hidden chamber - and something ancient guards it.' : 'A hidden chamber! The air shivers with concentrated power.';
                actionHint = payloadGet(P, 'boss') ? 'Type fight - or flee now.' : 'Type claim to take what it holds.';
                break;
            case 'anomaly':
                body = 'Reality thins here - the walls between worlds bleed through.';
                actionHint = 'Type touch to interact... or move on.';
                break;
            case 'landmark':
                title = payloadGet(P, 'landmarkName') || null;
                body = payloadGet(P, 'lore') || 'A marker of the old world.';
                actionHint = 'Type record to claim it for your guild.';
                break;
            default:
                return { text }; // empty rooms need no card
        }
        // primary visual: the battle-style scene (prop + square map, no UI).
        // 💡 cardBody/cardAction ride along so the caller's room-TYPE card can
        // show the payload-specific flavour instead of a generic hint.
        const scene = await encounterScenes.renderScene(eventDoc, player, room, { state: 'intact' });
        if (scene) {
            const out = { text, image: scene, cardBody: body, cardAction: actionHint };
            // puzzle rooms: the actual game board rides as the follow-up card
            if (room.type === 'puzzle') {
                const pz = payloadGet(P, 'puzzle');
                if (pz) {
                    const puzzleCards = require('./puzzleCards');
                    out.extraImage = await puzzleCards.renderPuzzleCard({
                        kind: pz.kind, prompt: pz.prompt,
                        attemptsUsed: pz.attemptsUsed || 0,
                        attemptsMax: pz.maxAttempts || CFG.PUZZLE.ATTEMPTS,
                        world: theme.name, ring: Math.max(1, Math.round((room.ring || 0) * 4) + 1),
                    });
                }
            }
            return out;
        }
        // fallback: parchment decree card (scene render failure never blocks play)
        const encounterCards = require('./encounterCards');
        const image = await encounterCards.renderRoomCard({
            type: room.type,
            variant: (room.type === 'combat' || room.type === 'coop') ? variant : null,
            title, body, actionHint,
            world: theme.name,
            ring: room.ring,
            boss: room.type === 'core' || (room.type === 'secret' && !!payloadGet(P, 'boss')),
        });
        return { text, image, cardBody: body, cardAction: actionHint };
    } catch (e) {
        return { text }; // card failure never blocks play
    }
}

module.exports = {
    DEAD_WORLDS, worldTheme,
    buildRoomPayload, onRoomEnter, roomIntro, resolveInput, startRoomCombat,
    nearestRelicRoom, describeDirection, awardRoomRelic, variantOf, pickVariant,
};
