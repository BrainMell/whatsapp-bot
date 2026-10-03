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

async function getEventForPlayer(jid) {
    return GuildWarEvent.findOne({
        state: 'ACTIVE',
        'players.jid': jid,
        'players.status': { $ne: 'quit' },
    }).lean(); // skip casting the full map on every DM action
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
const MOVE_WORDS = {
    n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e',
    w: 'n', a: 'w', d: 'e',
    west: 'w', forward: 'n', back: 's', left: 'w', right: 'e',
};
const MOVE_TOKEN_RE = 'n|north|s|south|e|east|w|west|a|d|forward|back|left|right';

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

// ── ROOM ENTRY PRESENTATION (owner: "reactive and visual") ──
// 💡 PHASE 3 (presentation overhaul): image discipline — the old flow sent
// map + room-type parchment + scene on EVERY entry (2-3 images for an empty
// hall). Now:
//   • empty rooms → ONE message: the map, with the situation as its caption
//     (the QUIET HALL parchment is gone — silence is one image, not three)
//   • typed rooms → map + scene (+ the type card ONLY when it carries a
//     payload-specific body/hint, and never on a revisit of a cleared room)
//   • puzzle rooms still append the live game board
// Returns {} - everything was already sent.
async function presentRoom(sock, chatId, BOT_MARKER, ctxDoc, me, newRoom, opts = {}) {
    const prefix = opts.prefix || '.';
    const withMap = opts.withMap !== false;
    const send = async (payload) => {
        try { await sock.sendMessage(chatId, payload); } catch (e) { /* best-effort */ }
    };

    const theme = encounters.worldTheme((newRoom.payload && newRoom.payload.theme) || eventDocWorldOf(ctxDoc));
    const meta = navCard.typeMeta(newRoom.type);
    const intro = await encounters.roomIntro(ctxDoc, me, newRoom);

    // meeting lines (kept short - they are gameplay-critical)
    const others = (newRoom.occupants || []).filter((j) => j !== me.jid)
        .map((j) => (ctxDoc.players || []).find((p) => p.jid === j)).filter(Boolean);
    const foes = others.filter((o) => o.guildId !== me.guildId);
    const mates = others.filter((o) => o.guildId === me.guildId);
    let social = '';
    if (mates.length) social += `\n\n🤝 ${mates.map((m) => m.name).join(', ')} of your guild ${mates.length > 1 ? 'are' : 'is'} here - fight together for a shared reward.`;
    if (foes.length) social += `\n\n⚠️ ${foes.map((f) => f.name).join(', ')} (${foes[0].guildName}) ${foes.length > 1 ? 'are' : 'is'} here - rival guild. \`challenge @name\` or move carefully.`;

    const isEmpty = newRoom.type === 'empty' && newRoom.state !== 'CLEARED';
    // 💡 OVERHAUL MD §3: on DEPLOY the character stands in the scene FIRST
    // and the map rides UNDERNEATH it — "I am here" before "here is the
    // world". Ordinary movement keeps the lightweight map-first flow (§6).
    const deployOrder = !!opts.deployOrder;

    // deploy flow: scene (the character, in place) → map (the world below)
    if (deployOrder) {
        const sitCaption = BOT_MARKER + ((intro.text || '') + social).trim();
        if (intro.image) {
            await send({ image: intro.image, caption: sitCaption });
        } else if (intro.text || social) {
            await send({ text: sitCaption });
        }
        if (withMap) {
            try {
                const fresh = await state.getEvent(ctxDoc.eventId, { fresh: true });
                const freshMe = fresh.players.find((p) => p.jid === me.jid) || me;
                const renderer = require('./mapRenderer');
                const extras = visibility.extrasFor(fresh, freshMe, guildLevelOf(fresh, freshMe));
                const buf = await renderer.renderRuinsMap(fresh, freshMe, { mates: extras.mates, enemyPings: extras.enemyPings });
                if (buf) {
                    await send({ image: buf, caption: BOT_MARKER + `📍 *YOU ARE HERE* - ${meta.label} (chamber ${newRoom.key}). Walk with w/a/s/d.` });
                }
            } catch (e) {
                console.error('[RuinsNav] deploy map render failed (non-fatal):', e?.message);
            }
        }
        return {};
    }

    // 1) map first - "clearly indicate where the player currently is".
    //    Empty rooms: the map CAPTION carries the situation (1 message total).
    if (withMap) {
        try {
            const fresh = await state.getEvent(ctxDoc.eventId, { fresh: true });
            const freshMe = fresh.players.find((p) => p.jid === me.jid) || me;
            const renderer = require('./mapRenderer');
            const extras = visibility.extrasFor(fresh, freshMe, guildLevelOf(fresh, freshMe));
            const buf = await renderer.renderRuinsMap(fresh, freshMe, { mates: extras.mates, enemyPings: extras.enemyPings });
            if (buf) {
                const caption = isEmpty
                    ? BOT_MARKER + ((intro.text || '') + social).trim()
                    : BOT_MARKER + `📍 *YOU ARE HERE* - ${meta.label} (chamber ${newRoom.key})`;
                await send({ image: buf, caption });
            }
        } catch (e) {
            console.error('[RuinsNav] map render failed (non-fatal):', e?.message);
        }
    }
    if (isEmpty) return {}; // one image, one caption — the hall says all

    // 2) room-type card - ONLY when it has something non-generic to say
    const hasTypeBody = !!(intro.cardBody || intro.cardAction);
    if (newRoom.state !== 'CLEARED' && hasTypeBody) {
        let typeBuf = null;
        try {
            typeBuf = await navCard.renderRoomTypeCard({
                roomType: newRoom.type,
                world: theme.name,
                ring: newRoom.ring,
                landmarkName: (newRoom.payload && newRoom.payload.landmarkName) || null,
                cleared: newRoom.state === 'CLEARED',
                body: intro.cardBody || null,
                prefix,
            });
        } catch (e) { /* best-effort */ }
        if (typeBuf) {
            const typeCaption = intro.cardAction || (intro.text || '').split('\n')[0];
            await send({ image: typeBuf, caption: BOT_MARKER + typeCaption });
        }
    }

    // 3) the encounter scene (player standing in the room)
    if (intro.image) {
        await send({ image: intro.image, caption: BOT_MARKER + ((intro.text || '') + social).trim() });
    } else if (social) {
        await send({ text: BOT_MARKER + social.trim() });
    }

    // 4) puzzle rooms: the actual game board rides last, up close.
    if (intro.extraImage) {
        await send({ image: intro.extraImage, caption: BOT_MARKER + '_the mechanism, up close_' });
    }
    return {};
}

function eventDocWorldOf(doc) {
    return (doc && doc.deadWorld) || 'ember';
}

// main entry: returns null if this DM text is not a Ruins action (bot falls
// through to other handlers); otherwise { text, image?, mentions? }
async function handleDM(sock, senderJid, chatId, txt, BOT_MARKER, opts = {}) {
    const prefix = String(opts.prefix || '.'); // dynamic per-bot prefix (owner rule)
    const raw = String(txt || '').trim();
    if (!raw) return null;
    // tolerate own prefix or not - strip the ACTUAL per-bot prefix dynamically
    // (owner rule: never hardcode .j/.s). Legacy bare ".j" still tolerated.
    const lower = raw.toLowerCase();
    const norm = lower.startsWith(prefix.toLowerCase())
        ? lower.slice(prefix.length).trim()
        : lower.replace(/^\.j\s*/, '');

    // ── ruins action grammar: any DM verb this router understands ──
    const QUIET_ACTION_RE = new RegExp(`^(?:look|l|where(?:\\s?am\\s?i)?|map|gw map|paths|relics|bag|status|score|rejoin|return|quit|leave|exit|accept|flee|handin(?:\\s\\S.*)?|use(?:\\s\\S.*)?|challenge(?:\\s\\S.*)?|share map(?:\\s\\S.*)?|move\\s+(?:${MOVE_TOKEN_RE})|(?:${MOVE_TOKEN_RE}))$`);

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
        if (QUIET_ACTION_RE.test(norm)) {
            return { text: `🕯️ *The Ruins stand quiet.* No war is running right now.\n\nWhen one deploys, my DMs become your game screen: \`look\`, \`move w/a/s/d\` (or \`move forward/left/back/right\`), \`map\`, \`paths\`, \`relics\`, \`handin\`, \`challenge @name\`, \`status\`, \`quit\`.\nMods start it with \`${prefix} gw start\` - players join with \`${prefix} gw join\`.` };
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
    const moveMatch = new RegExp(`^(?:move\\s+)?(${MOVE_TOKEN_RE})$`).exec(norm);
    if (moveMatch) {
        const topo = state.topologyOf(eventDoc);
        const dir = MOVE_WORDS[moveMatch[1]];
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
        // 💡 NAVIGATION OVERHAUL: map first (you are here), then the room-type
        // card, then the encounter scene - short captions, no text walls.
        try {
            return await presentRoom(sock, chatId, BOT_MARKER, ctxDoc, me, newRoom, { prefix, withMap: true });
        } catch (e) {
            console.error('[RuinsNav] presentRoom failed, falling back to text:', e?.message);
            const intro = await encounters.roomIntro(ctxDoc, me, newRoom);
            return { text: intro.text, image: intro.image || undefined };
        }
    }

    // ── visual navigation card (also sent after every resolved encounter) ──
    if (/^paths$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        const buf = await navCardFor(eventDoc, player, room, prefix);
        return { text: `🧭 Your paths from chamber ${player.roomId}.`, image: buf };
    }

    // ── personal map ──
    if (/^(map|gw map)$/.test(norm)) {
        const fresh = await state.getEvent(eventDoc.eventId, { fresh: true });
        const me = playerOf(fresh, senderJid);
        const renderer = require('./mapRenderer');
        const extras = visibility.extrasFor(fresh, me, guildLevelOf(fresh, me));
        const buf = await renderer.renderRuinsMap(fresh, me, { mates: extras.mates, enemyPings: extras.enemyPings });
        return { text: `🗺️ Your chart of the Ruins.`, image: buf };
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
        feed.queue(eventDoc.eventId, 'normal', `🏛️ ${player.name} handed ${toHand.length === 1 ? `*${toHand[0].name}*` : `${toHand.length} relics`} to their guild (+${gpTotal} GP).`);
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
        const begun = pvp.beginRuinsDuel(res.challenger.jid, senderJid, { eventId: eventDoc.eventId, roomKey: player.roomId, virtualChatId: virtualId });
        if (!begun.success) return { text: begun.message };
        await touch();
        return { text: `⚔️ *THE DUEL BEGINS!* ${begun.duel.players[0].name} vs ${begun.duel.players[1].name}.\nUse your standard combat commands: \`${prefix} combat attack\`, \`${prefix} combat ability <n>\`, \`${prefix} combat flee\`.\n_Stakes: ${CFG.PVP.WIN_GP} GP + carried relics (max ${CFG.PVP.RELIC_STEAL_CAP})._` };
    }
    if (/^flee$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        const pending = await ruinsPvp.openChallengeFor(eventDoc, senderJid)
            || [...ruinsPvp._openChallenges.values()].find((c) => c.challengedJid === senderJid && Date.now() < c.expiresAt) || null;
        if (pending || room?.type === 'combat' || room?.type === 'coop' || room?.type === 'core') {
            await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
                roomId: player.prevRoomId,
                protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
                lastActionAt: Date.now(),
            });
            await rooms.leaveRoom(eventDoc.eventId, senderJid, player.roomId);
            feed.queue(eventDoc.eventId, 'normal', `🏃 ${player.name} retreated from a ${room?.type || 'contest'} - the spoils stay behind.`);
            return { text: '🏃 You retreat to your previous room. What was here stays here, unclaimed.' };
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
        const res = await encounters.resolveInput(eventDoc, player, room, raw, { sock, chatId, BOT_MARKER });
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
                // 💡 NAVIGATION OVERHAUL: ...and the moment the encounter is
                // resolved, the player gets the VISUAL choice of where to go
                // next instead of a wall of exit text.
                try {
                    const freshRoomDoc = await GuildWarEvent.findOne(
                        { eventId: eventDoc.eventId, 'rooms.key': player.roomId },
                        { rooms: { $elemMatch: { key: player.roomId } } }
                    ).lean();
                    const freshRoom = freshRoomDoc && freshRoomDoc.rooms && freshRoomDoc.rooms[0];
                    if (freshRoom && freshRoom.state === 'CLEARED') {
                        const navBuf = await navCardFor(eventDoc, player, freshRoom, prefix);
                        if (navBuf) await sock.sendMessage(chatId, { image: navBuf, caption: BOT_MARKER + '🧭 *The way onward is clear.* Choose your path:' });
                    }
                } catch (navErr) {
                    console.error('[RuinsNav] post-resolve nav card failed (non-fatal):', navErr?.message);
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

module.exports = { handleDM, getEventForPlayer, displayName, navCardFor, computeExits, presentRoom };
