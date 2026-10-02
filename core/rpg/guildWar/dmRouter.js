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
const CFG = require('./config');
const GuildWarEvent = require('../../models/GuildWarEvent');

async function getEventForPlayer(jid) {
    return GuildWarEvent.findOne({
        state: 'ACTIVE',
        'players.jid': jid,
        'players.status': { $ne: 'quit' },
    });
}

function playerOf(eventDoc, jid) {
    return eventDoc.players.find((p) => p.jid === jid);
}

function roomOf(eventDoc, player) {
    return eventDoc.rooms.find((r) => r.key === player.roomId);
}

const MOVE_WORDS = {
    n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w',
    forward: 'n', back: 's', left: 'w', right: 'e',
};

// main entry: returns null if this DM text is not a Ruins action (bot falls
// through to other handlers); otherwise { text, image?, mentions? }
async function handleDM(sock, senderJid, chatId, txt, BOT_MARKER) {
    const raw = String(txt || '').trim();
    if (!raw) return null;
    const norm = raw.toLowerCase().replace(/^\.j\s*/, ''); // tolerate prefix or not

    const eventDoc = await getEventForPlayer(senderJid);
    if (!eventDoc) {
        // not in an event: only "join" matters (during registration)
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
        }
        return null;
    }

    const player = playerOf(eventDoc, senderJid);
    if (!player) return null;

    // ── registration-phase actions ──
    if (eventDoc.state === 'REGISTRATION') {
        if (/^(join|gw join)$/.test(norm)) {
            const res = await state.registerPlayer(eventDoc.eventId, { jid: senderJid, name: displayName(senderJid), guildId: player.guildId, guildName: player.guildName });
            return res ? { text: '✅ Already registered — stand by.' } : null;
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
            return { text: `🛡️ Welcome back. Spawn protection for ${CFG.REJOIN_PROTECT_MS / 1000}s. Your carried relics dropped where you fell — your position is unchanged.` };
        }
        return { text: '💤 You went inactive. Type `rejoin` to return to the war.' };
    }

    // touch lastAction for any recognized command from here on
    const touch = () => state.updatePlayer(eventDoc.eventId, senderJid, {}, { lastActionAt: Date.now() });

    // ── movement ──
    const moveMatch = /^(?:move\s+)?(n|north|s|south|e|east|w|west|forward|back|left|right)$/.exec(norm);
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
        if (!dest) return { text: '🧱 No passage that way — the walls of the dead world are unbroken.' };

        await rooms.enterRoom(eventDoc.eventId, senderJid, player.roomId, dest);
        const reveal = visibility.revealFor(eventDoc, dest, guildLevelOf(eventDoc, player));
        const discovered = await rooms.applyFog(eventDoc.eventId, senderJid, reveal);
        await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
            prevRoomId: player.roomId, roomId: dest, lastActionAt: Date.now(), lastMoveAt: Date.now(),
        });
        await touch();

        // fresh doc for the new room + occupants
        const fresh = await state.getEvent(eventDoc.eventId, { fresh: true });
        const me = playerOf(fresh, senderJid);
        const newRoom = roomOf(fresh, me);
        const intro = await encounters.onRoomEnter(fresh, me, newRoom);

        // meeting other players
        const others = (newRoom.occupants || []).filter((j) => j !== senderJid).map((j) => playerOf(fresh, j)).filter(Boolean);
        const foes = others.filter((o) => o.guildId !== me.guildId);
        const mates = others.filter((o) => o.guildId === me.guildId);
        const lines = [intro];
        if (mates.length) lines.push(`🤝 Your guildmate${mates.length > 1 ? 's' : ''} ${mates.map((m) => m.name).join(', ')} ${mates.length > 1 ? 'are' : 'is'} here — work together for a shared reward.`);
        if (foes.length) lines.push(`⚠️ ${foes.map((f) => `${f.name} of ${f.guildName}`).join(', ')} ${foes.length > 1 ? 'are' : 'is'} here — rival guild. \`challenge @${foes[0].name}\` or move carefully... (they may challenge YOU).`);
        return { text: lines.join('\n\n') };
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
        const fresh = await state.getEvent(eventDoc.eventId, { fresh: true });
        const me = playerOf(fresh, senderJid);
        const room = roomOf(fresh, me);
        return { text: await encounters.onRoomEnter(fresh, me, room) };
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
        return { text: `🏛️ Handed in: ${toHand.map((r) => `${r.name} (${r.tier})`).join(', ')} — *+${gpTotal} GP* to you and your guild. Secured.` };
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
        if (!target) return { text: '❌ No such rival in this room. `challenge @name` — they must stand here.' };
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
        return { text: `⚔️ *THE DUEL BEGINS!* ${begun.duel.players[0].name} vs ${begun.duel.players[1].name}.\nUse your standard combat commands: \`.j combat attack\`, \`.j combat ability <n>\`, \`.j combat flee\`.\n_Stakes: ${CFG.PVP.WIN_GP} GP + carried relics (max ${CFG.PVP.RELIC_STEAL_CAP})._` };
    }
    if (/^flee$/.test(norm)) {
        const room = roomOf(eventDoc, player);
        const pending = [...ruinsPvp._openChallenges.values()].find((c) => c.challengedJid === senderJid && Date.now() < c.expiresAt);
        if (pending || room?.type === 'combat' || room?.type === 'coop' || room?.type === 'core') {
            await state.updatePlayer(eventDoc.eventId, senderJid, {}, {
                roomId: player.prevRoomId,
                protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
                lastActionAt: Date.now(),
            });
            await rooms.leaveRoom(eventDoc.eventId, senderJid, player.roomId);
            feed.queue(eventDoc.eventId, 'normal', `🏃 ${player.name} retreated from a ${room?.type || 'contest'} — the spoils stay behind.`);
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
            return { text: res.text };
        }
    }

    // ── status ──
    if (/^(status|gw status|score)$/.test(norm)) {
        const byGuild = feed.computeScoreboard(eventDoc);
        const standings = byGuild.slice(0, 8).map((g, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} ${g.name}: ${g.points}`).join('\n');
        return { text: `⚔️ *Guild War* (${eventDoc.type}) — ends <t:${Math.floor((eventDoc.endsAt || 0) / 1000)}:R>\nYou: ${player.score} GP · lives ${player.lives} · position ${player.roomId}\n\n${standings}` };
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
            : '🧭 The seeker spins wildly — nothing left to find. (charge spent)' };
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
        if (!target) return { text: '🪨 Nowhere to blink to yet — explore more, then try again. (no charge spent)' };
        const path = mapEngine.blinkPath(topo, discoveredSet, player.roomId, target, CFG.RELICS.BLINK_MAX_ROOMS);
        if (!path) return { text: `🪨 The ${match.name} fizzles — too far off your known paths. (no charge spent)` };
        const dest = path[path.length - 1];
        const fresh = await state.getEvent(eventDoc.eventId, { fresh: true });
        const destRoom = fresh.rooms.find((r) => r.key === dest);
        if (dest === fresh.coreKey || (destRoom?.occupants || []).length > 0) {
            return { text: '🪨 The blink refuses — the destination is contested ground. (no charge spent)' };
        }
        await rooms.enterRoom(eventDoc.eventId, player.jid, player.roomId, dest);
        await rooms.applyFog(eventDoc.eventId, player.jid, mapEngine.revealAround(topo, dest));
        await state.updatePlayer(eventDoc.eventId, player.jid, {}, {
            prevRoomId: player.roomId, roomId: dest, lastActionAt: Date.now(), lastMoveAt: Date.now(),
        });
        await decrementCharges(eventDoc.eventId, player.jid, match.id);
        const me = playerOf(fresh, player.jid);
        const intro = await encounters.onRoomEnter(fresh, me, destRoom);
        return { text: `✨ You blink through the stones... skipped rooms yield nothing.\n\n${intro}` };
    }
    if (match.category === 'ward') {
        // ward applies to the next combat: attach buff to the room combat via player pvpMeta
        const buff = relics.wardBuff(match);
        if (!buff) return { text: 'This ward is inert.' };
        const GuildWarEventModel = require('../../models/GuildWarEvent');
        await GuildWarEventModel.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': player.jid },
            { $pull: { 'players.$.relics': { id: match.id } } }
        );
        await GuildWarEventModel.updateOne(
            { eventId: eventDoc.eventId, 'players.jid': player.jid },
            { $push: { 'players.$.relics': { ...match, category: 'ward_active', charges: 0, meta: { buff } } } }
        );
        return { text: `🛡️ The ${match.name} flares — its ward wraps your next fight (${buff.type}).` };
    }
    if ((match.category === 'trophy' || match.category === 'cross')) {
        return { text: '💠 This relic is not usable — hand it in with `handin` to secure its value.' };
    }
    return { text: '❌ That relic has no charges left.' };
}

async function decrementCharges(eventId, jid, relicId) {
    const doc = await GuildWarEvent.findOne({ eventId }, { players: { $elemMatch: { jid } } });
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

module.exports = { handleDM, getEventForPlayer, displayName };
