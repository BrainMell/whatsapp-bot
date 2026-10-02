// ============================================
// ⚔️ GUILD WAR — public API + group command surface
// Guild War Overhaul (Ruins + Alignment) 2026-10-03
//
// Umbrella event framework: a mod/global/owner starts a war from a group
// (that group becomes the live-feed command center); players act via DMs
// through dmRouter. The Ruins is the first encounter mode; Alignment is the
// rare peak variant. Future encounter modes plug into the same state machine.
// ============================================

const CFG = require('./config');
const state = require('./state');
const feed = require('./feed');
const points = require('./points');
const encounters = require('./encounters');
const rooms = require('./rooms');
const mapEngine = require('./mapEngine');
const guilds = require('../guilds');

// ── combat hooks (installed once at boot) ──
function installCombatHooks() {
    const guildAdventure = require('../guildAdventure');
    guildAdventure.setRuinsHooks({
        // flee → back to previous room, room forfeited (stays ACTIVE)
        onFlee(state) {
            const meta = state.ruinsMeta;
            if (!meta) return;
            const player = (state.players || [])[0];
            if (!player) return;
            // teleport the session's player back to their previous room
            state.playerRetreated = true; // hint for any group combat flows
            require('./index')._noteRetreat(meta.eventId, player.jid).catch((e) =>
                console.error('[GW] onFlee note failed:', e?.message));
        },
        // combat end → victory clears the room + awards; defeat respawns
        async onEnd(state, victory, sessionKey) {
            const meta = state.ruinsMeta;
            if (!meta) return;
            const player = (state.players || [])[0];
            if (!player) return;
            const GuildWarEvent = require('../../models/GuildWarEvent');
            const jid = player.jid;

            if (victory) {
                const ev = await state.getEvent(meta.eventId, { fresh: true });
                if (!ev || ev.state !== 'ACTIVE') return;
                const me = ev.players.find((p) => p.jid === jid);
                const room = ev.rooms.find((r) => r.key === meta.roomKey);
                if (!me || !room) return;

                const claim = await rooms.clearRoom(meta.eventId, room.key, me);
                if (claim.won) {
                    // battle-variant adjustment: elite/cursed/bounty rooms pay more
                    const variant = require('./encounters').variantOf(room);
                    const gpValue = Math.round((CFG.POINTS.ROOM_CLEAR[room.type] ?? 10) * (variant?.gpMult || 1));
                    const coopBonus = (room.occupants || []).filter((j) => j !== jid)
                        .some((j) => ev.players.find((p) => p.jid === j)?.guildId === me.guildId);
                    await points.award(meta.eventId, jid, gpValue, 'room-clear', { coopBonus });

                    // relic award for relic-bearing room types
                    if (['discovery', 'reward', 'secret'].includes(room.type)) {
                        await encounters.awardRoomRelic(ev, me, room);
                    }

                    // World Core: first guild to breach
                    if (room.type === 'core' && !ev.coreClaimedBy) {
                        await GuildWarEvent.updateOne(
                            { eventId: meta.eventId, coreClaimedBy: null },
                            { $set: { coreClaimedBy: me.guildId } }
                        );
                        feed.queue(meta.eventId, 'major',
                            `WORLD EVENT — ${me.name} of ${me.guildName} has breached the WORLD CORE! First-guild glory: +${CFG.POINTS.CORE_FIRST_GUILD} GP to every member!`);
                        for (const mate of ev.players.filter((p) => p.guildId === me.guildId)) {
                            await points.award(meta.eventId, mate.jid, CFG.POINTS.CORE_FIRST_GUILD, 'core-guild', { ignoreCap: false });
                        }
                        await points.award(meta.eventId, jid, CFG.POINTS.CORE_BREACH_PLAYER, 'core-breach');
                    }

                    feed.queue(meta.eventId, 'normal',
                        `⚔️ ${me.name} cleared a ${room.type === 'core' ? 'World Core guardian' : 'guarded chamber'}${coopBonus ? ' (with guild help)' : ''}.`);
                } else {
                    feed.queue(meta.eventId, 'minor', `${me.name} arrived a moment too late — the chamber was already taken.`);
                }
            } else {
                // defeat: lives--, respawn at spawn corner with protection, room stays ACTIVE
                const freshLives = Math.max(0, (player.lives ?? CFG.COMBAT.LIVES) - 1);
                if (freshLives > 0) {
                    await state.updatePlayer(meta.eventId, jid, {}, {
                        lives: freshLives,
                        roomId: player.spawnRoomId || player.roomId,
                        prevRoomId: player.spawnRoomId || player.roomId,
                        protectedUntil: Date.now() + CFG.COMBAT.RESPAWN_PROTECT_MS,
                        lastActionAt: Date.now(),
                    });
                    feed.queue(meta.eventId, 'minor', `💀 ${player.name} fell in the Ruins — they will return at the edge (${freshLives} lives left).`);
                } else {
                    await rooms.dropCarriedRelics(meta.eventId, jid, 'final death');
                    await state.updatePlayer(meta.eventId, jid, {}, { status: 'defeated', lives: 0 });
                    feed.queue(meta.eventId, 'normal', `💀 ${player.name} has fallen for the last time this war.`);
                }
            }
        },
    });
}

// onFlee support: move the player back to their previous room in event state
async function _noteRetreat(eventId, jid) {
    const ev = await state.getEvent(eventId, { fresh: true });
    if (!ev) return;
    const p = ev.players.find((x) => x.jid === jid);
    if (!p) return;
    await rooms.leaveRoom(eventId, jid, p.roomId);
    await rooms.enterRoom(eventId, jid, p.roomId, p.prevRoomId);
    await state.updatePlayer(eventId, jid, {}, {
        roomId: p.prevRoomId,
        prevRoomId: p.prevRoomId,
        protectedUntil: Date.now() + CFG.PVP.PROTECT_AFTER_LOSS_MS,
        lastActionAt: Date.now(),
    });
    feed.queue(eventId, 'minor', `${p.name} fled a chamber — the spoils stay behind.`);
}

// ── group command surface: .j gw <sub> ──
async function handleGroupCommand(sock, chatId, senderJid, senderName, args, ctx = {}) {
    const engine = require('../../engine');
    const isOwner = engine.isBotOwner(senderJid);
    const isGMod = engine.isGlobalMod(senderJid);
    const isRMod = engine.isRpgMod(senderJid);
    const canStart = isOwner || isGMod || isRMod;
    const sub = (args[0] || 'help').toLowerCase();

    switch (sub) {
        case 'start': {
            if (!canStart) {
                return sock.sendMessage(chatId, { text: '❌ Only RPG mods, global mods or the owner can start a Guild War.' });
            }
            if (chatId && !chatId.endsWith('@g.us')) {
                return sock.sendMessage(chatId, { text: '❌ Start the war from the group that will host the live feed.' });
            }
            const type = (args[1] || '').toLowerCase() === 'alignment' ? 'alignment' : 'normal';
            if (type === 'alignment' && !canStart) return sock.sendMessage(chatId, { text: '❌ Alignment wars require mod authorization.' });

            // participating guilds: every registered player's guild as they join
            const res = await state.createEvent({ type, hostGroupId: chatId, initiatedBy: senderJid });
            if (!res.ok) return sock.sendMessage(chatId, { text: `❌ ${res.reason}` });

            const notice = require('./noticeCard');
            const buf = await notice.renderNotice(
                type === 'alignment'
                    ? 'THE WORLDS ALIGN. The Guild Association calls all guilds to war across the newly joined worlds. Registration is open — declare your champions.'
                    : 'The Guild Association declares a GUILD WAR. The Ruins of a dead world await. Registration is open — players, join now.',
                { title: type === 'alignment' ? 'WORLD ALIGNMENT' : 'GUILD WAR CALLED' }
            );
            await sock.sendMessage(chatId, {
                image: buf,
                caption: `⚔️ *GUILD WAR ${type === 'alignment' ? '— WORLD ALIGNMENT' : 'CALLED'}*\n\n` +
                    `Registration open: \`.j gw join\` (or DM me \`join\`).\n` +
                    `Registration closes in ${CFG.REGISTRATION_MS / 60000} minutes · deployment automatic.\n` +
                    `Players act through bot DMs — this group receives the live feed.\n` +
                    `_Initiated by ${senderName}._`,
            });
            return;
        }

        case 'join': {
            const pending = await require('../../models/GuildWarEvent').findOne({ state: 'REGISTRATION' }).sort({ createdAt: -1 });
            if (!pending) return sock.sendMessage(chatId, { text: '❌ No war is registering right now.' });
            const ug = guilds.getUserGuild(senderJid);
            if (!ug) return sock.sendMessage(chatId, { text: '❌ You must be in a guild to enter the war.' });
            const g = guilds.getGuild(ug);
            const res = await state.registerPlayer(pending.eventId, {
                jid: senderJid, name: senderName, guildId: ug, guildName: g?.name || ug,
            });
            if (!res) return sock.sendMessage(chatId, { text: '✅ You are already registered.' });
            return sock.sendMessage(chatId, { text: `✅ ${senderName} of *${g?.name || ug}* joins the war! (${pending.players.length} registered)\nWait for deployment, then act in my DMs.` });
        }

        case 'forcestart': {
            if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
            const pending = await require('../../models/GuildWarEvent').findOne({ state: 'REGISTRATION' }).sort({ createdAt: -1 });
            if (!pending) return sock.sendMessage(chatId, { text: '❌ Nothing to start.' });
            const res = await state.startEvent(pending.eventId, { deadWorld: args[1] || null });
            if (!res.ok) return sock.sendMessage(chatId, { text: `❌ ${res.reason}` });
            feed.queue(pending.eventId, 'major', `The war has begun! ${res.event.players.length} champions deploy into the Ruins of a dead world.`);
            return sock.sendMessage(chatId, { text: `⚔️ *DEPLOYED!* ${res.event.players.length} players, grid ${res.event.side}×${res.event.side}.\nPlayers: open my DMs and \`look\` around.` });
        }

        case 'status': case 'score': {
            const active = await state.getActiveEvents();
            if (!active.length) return sock.sendMessage(chatId, { text: 'No war is running. Mods start one with `.j gw start`.' });
            for (const ev of active) {
                const standings = feed.computeScoreboard(ev).slice(0, 8)
                    .map((g, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} ${g.name}: ${g.points} GP`).join('\n') || 'no scores yet';
                await sock.sendMessage(chatId, {
                    text: `⚔️ *Guild War* (${ev.type}, ${ev.state}) — ${ev.players.length} players\n` +
                        `Ends: ${ev.endsAt ? new Date(ev.endsAt).toUTCString() : 'after registration'}\n\n${standings}`,
                });
            }
            return;
        }

        case 'end': {
            if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
            const ended = await state.endEvent(args[1] || (await state.getActiveEvents())[0]?.eventId, 'Called to an end by the Association.');
            if (!ended) return sock.sendMessage(chatId, { text: '❌ No active war found.' });
            return sock.sendMessage(chatId, { text: '🏳️ The war has ended. Rewards are being distributed.' });
        }

        case 'abort': {
            if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
            const target = args[1] || (await state.getActiveEvents())[0]?.eventId;
            await state.abortEvent(target, 'aborted by mod');
            return sock.sendMessage(chatId, { text: '🚫 War aborted. No rewards.' });
        }

        case 'help': default: {
            return sock.sendMessage(chatId, {
                text: `⚔️ *GUILD WAR*\n` +
                    `\`.j gw start\` — mod: open registration (this group = feed HQ)\n` +
                    `\`.j gw start alignment\` — mod: alignment-scale war\n` +
                    `\`.j gw join\` — enter the registering war\n` +
                    `\`.j gw forcestart\` — mod: deploy now\n` +
                    `\`.j gw status\` — live standings\n` +
                    `\`.j gw end | abort\` — mod: conclude\n\n` +
                    `In my DMs once deployed: \`look\`, \`move n/s/e/w\`, \`map\`, \`relics\`, \`handin\`, \`challenge @name\`, \`share map @mate\`, \`status\`, \`quit\`.`,
            });
        }
    }
}

module.exports = {
    CFG, state, feed, points, encounters, rooms, mapEngine,
    installCombatHooks, handleGroupCommand, _noteRetreat,
};
