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
const notice = require('./noticeCard');
const guilds = require('../guilds');

// ── combat hooks (installed once at boot) ──
function installCombatHooks() {
    const guildAdventure = require('../guildAdventure');
    guildAdventure.setRuinsHooks({
        // flee → back to previous room, room forfeited (stays ACTIVE)
        // ⚔️ §15 #1 FIX: the hook param was named `state`, SHADOWING the
        // module's own `const state = require('./state')` — every hook call
        // threw `state.getEvent is not a function` and was swallowed
        // upstream, so rooms never cleared, GP never paid, lives never
        // dropped. Param renamed to `session` (the combat session object).
        onFlee(session) {
            const meta = session.ruinsMeta;
            if (!meta) return;
            const player = (session.players || [])[0];
            if (!player) return;
            // teleport the session's player back to their previous room
            session.playerRetreated = true; // hint for any group combat flows
            require('./index')._noteRetreat(meta.eventId, player.jid).catch((e) =>
                console.error('[GW] onFlee note failed:', e?.message));
        },
        // combat end → victory clears the room + awards; defeat respawns.
        // 💡 NAVIGATION OVERHAUL: on victory the player is DM'd the VISUAL
        // navigation card (arrows for every open path) instead of text exits.
        async onEnd(session, victory, sessionKey, sock) {
            const meta = session.ruinsMeta;
            if (!meta) return;
            const player = (session.players || [])[0];
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

                    // 💡 FEED (§17): boss-tier kills are war headlines
                    if (room.type === 'core' || (room.type === 'secret' && room.payload && (room.payload.boss || room.payload.get?.('boss')))) {
                        feed.queue(meta.eventId, 'major',
                            `💀 ${me.name} of ${me.guildName} has SLAIN the guardian of a ${room.type === 'core' ? 'WORLD CORE' : 'hidden chamber'}! The way stands open.`);
                    }

                    // World Core: first guild to breach
                    if (room.type === 'core' && !ev.coreClaimedBy) {
                        await GuildWarEvent.updateOne(
                            { eventId: meta.eventId, coreClaimedBy: null },
                            { $set: { coreClaimedBy: me.guildId } }
                        );
                        feed.queue(meta.eventId, 'major',
                            `WORLD EVENT - ${me.name} of ${me.guildName} has breached the WORLD CORE! First-guild glory: +${CFG.POINTS.CORE_FIRST_GUILD} GP to every member!`);
                        for (const mate of ev.players.filter((p) => p.guildId === me.guildId)) {
                            await points.award(meta.eventId, mate.jid, CFG.POINTS.CORE_FIRST_GUILD, 'core-guild', { ignoreCap: false });
                        }
                        await points.award(meta.eventId, jid, CFG.POINTS.CORE_BREACH_PLAYER, 'core-breach');
                    }

                    feed.queue(meta.eventId, 'normal',
                        `⚔️ ${me.name} cleared a ${room.type === 'core' ? 'World Core guardian' : 'guarded chamber'}${coopBonus ? ' (with guild help)' : ''}.`);

                    // 💡 NAVIGATION OVERHAUL §4/§15: post-victory the player
                    // gets the RETURN map (same chart, post-encounter visual
                    // state) — the world re-renders around them, no parchment.
                    if (sock) {
                        try {
                            const freshAfter = await state.getEvent(meta.eventId, { fresh: true });
                            const meAfter = freshAfter.players.find((p) => p.jid === jid) || me;
                            const roomAfter = freshAfter.rooms.find((r) => r.key === meAfter.roomId) || room;
                            const dmRouter = require('./dmRouter');
                            const retBuf = await dmRouter.returnMapFor(freshAfter, meAfter, roomAfter);
                            await sock.sendMessage(state.chatId || jid, {
                                image: retBuf,
                                caption: '🧭 *The chamber is yours.* The compass marks your exits.',
                            });
                        } catch (navErr) {
                            console.error('[GW] victory return map failed (non-fatal):', navErr?.message);
                        }
                    }
                } else {
                    feed.queue(meta.eventId, 'minor', `${me.name} arrived a moment too late - the chamber was already taken.`);
                }
            } else {
                // defeat: lives--, respawn at spawn corner with protection, room stays ACTIVE
                // (§15 #1 fix: this path was unreachable before the shadowing fix)
                const freshLives = Math.max(0, (player.lives ?? CFG.COMBAT.LIVES) - 1);
                if (freshLives > 0) {
                    await state.updatePlayer(meta.eventId, jid, {}, {
                        lives: freshLives,
                        roomId: player.spawnRoomId || player.roomId,
                        prevRoomId: player.spawnRoomId || player.roomId,
                        protectedUntil: Date.now() + CFG.COMBAT.RESPAWN_PROTECT_MS,
                        lastActionAt: Date.now(),
                    });
                    feed.queue(meta.eventId, 'minor', `💀 ${player.name} fell in the Ruins - they will return at the edge (${freshLives} lives left).`);
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
    feed.queue(eventId, 'minor', `${p.name} fled a chamber - the spoils stay behind.`);
}

// ── group command surface: .j gw <sub> ──
async function handleGroupCommand(sock, chatId, senderJid, senderName, args, ctx = {}) {
    const prefix = String(ctx.prefix || '.'); // dynamic per-bot prefix (owner rule: never hardcode .j/.s)
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

            const regMin = Math.round(CFG.REGISTRATION_MS / 60000);
            const buf = await notice.renderWarCalledCard({
                type,
                title: type === 'alignment' ? 'ALIGNMENT WAR CALLED' : 'GUILD WAR CALLED',
                host: senderName,
                regMinutes: regMin,
                prefix,
            });
            await sock.sendMessage(chatId, {
                image: buf,
                caption: `⚔️ *GUILD WAR ${type === 'alignment' ? '- WORLD ALIGNMENT' : 'CALLED'}*\n\n` +
                    `Registration open: \`${prefix} gw join\` (or DM me \`join\`).\n` +
                    `Registration closes in ${regMin} minutes · deployment automatic.\n` +
                    `Players act through bot DMs - this group receives the live feed.\n` +
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
            // ⚔️ owner brief: DM every champion the start card ("the war has
            // begun + how you play") - fire and forget, never block the GC reply
            dmWarStartCards(sock, '\u200B', res.event, prefix).catch((e) => console.error('[GW] start-card DM:', e?.message));
            return sock.sendMessage(chatId, { text: `⚔️ *DEPLOYED!* ${res.event.players.length} players, grid ${res.event.side}×${res.event.side}.\nPlayers: open my DMs and \`look\` around.` });
        }

        case 'status': case 'score': {
            const active = await state.getActiveEvents();
            if (!active.length) {
                return sock.sendMessage(chatId, {
                    text: `🕊️ *No war is running right now.*\nThe Ruins stand quiet. Mods raise the call: \`${prefix} gw start\`\nOrganic alignment wars announce themselves in RPG-friendly GCs (\`${prefix} gw rpg on\`).`,
                });
            }
            for (const ev of active) {
                const board = feed.computeScoreboard(ev).slice(0, 8);
                const standings = board
                    .map((g, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} *${g.name}:* ${g.points} GP`).join('\n') || '_no scores yet: chambers, relics and the World Core await_';
                const minsLeft = ev.endsAt ? Math.round((ev.endsAt - Date.now()) / 60000) : null;
                const caption = `⚔️ *GUILD WAR: THE RUINS* (${ev.type}, ${ev.state})\n` +
                    `👥 ${ev.players.length} champions · ${minsLeft != null ? `${Math.max(0, minsLeft)} min left` : 'no clock'}\n\n${standings}\n\n_Act in my DMs: \`look\`, \`move w/a/s/d\`, \`map\`, \`paths\`._`;
                try {
                    const buf = await notice.renderWarStatusCard({
                        type: ev.type, state: ev.state, players: ev.players.length,
                        endsInMin: minsLeft, standings: board,
                    });
                    await sock.sendMessage(chatId, { image: buf, caption });
                } catch (e) {
                    console.error('[GW] status card failed:', e?.message);
                    await sock.sendMessage(chatId, { text: caption });
                }
            }
            return;
        }

        case 'end': {
            if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
            const targetId = args[1] || (await state.getActiveEvents())[0]?.eventId;
            if (!targetId) return sock.sendMessage(chatId, { text: '❌ No war to end. Mods open one with `${prefix} gw start`.' });
            const ev = await require('../../models/GuildWarEvent').findOne({ eventId: targetId });
            if (!ev) return sock.sendMessage(chatId, { text: `❌ No war found (\`${targetId}\`).` });

            // still registering / initiated: close it quietly, nobody deployed
            if (ev.state === 'INITIATED' || ev.state === 'REGISTRATION') {
                await state.abortEvent(targetId, 'ended by mod during registration');
                return sock.sendMessage(chatId, { text: `🏳️ *War closed during registration.*\nNobody deployed, so no rewards are due. The call card already posted in this GC stays as the record.` });
            }
            if (ev.state !== 'ACTIVE') {
                return sock.sendMessage(chatId, { text: `ℹ️ That war is already *${ev.state}*. Nothing to end.` });
            }

            // quietFeed: the richer end card below already announces the end
            // to the host GC — skip the generic feed major to avoid doubles.
            const ended = await state.endEvent(targetId, 'Called to an end by the Association.', { quietFeed: true });
            if (!ended) return sock.sendMessage(chatId, { text: '❌ No active war found.' });
            feed.queue(targetId, 'major', `🏳️ THE WAR HAS ENDED. The Association tallies the spoils: ${ended.rewards.guilds.length} guilds took the field.`);

            const board = ended.rewards.guilds.slice(0, 8).map((g, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} *${g.name}:* ${g.points} GP`).join('\n') || '_no guild scored_';
            const topPlayers = ended.rewards.top.slice(0, 3).map((p, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} ${p.name} (${p.guild})`).join('\n') || '';
            const caption = `🏳️ *THE WAR HAS ENDED*\n\n*Guild standings:*\n${board}\n${topPlayers ? `\n*Heroes of the war:*\n${topPlayers}\n` : ''}\n_Guild Points have been added to the guild level curve._`;
            try {
                const buf = await notice.renderWarStatusCard({
                    type: ended.event.type, final: true, players: ended.event.players.length,
                    standings: ended.rewards.guilds,
                });
                await sock.sendMessage(chatId, { image: buf, caption });
            } catch (e) {
                console.error('[GW] end card failed:', e?.message);
                await sock.sendMessage(chatId, { text: caption });
            }
            return;
        }

        case 'abort': {
            if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
            const target = args[1] || (await state.getActiveEvents())[0]?.eventId;
            if (!target) return sock.sendMessage(chatId, { text: '❌ No war to abort.' });
            await state.abortEvent(target, 'aborted by mod');
            return sock.sendMessage(chatId, { text: '🚫 *War aborted.* No rewards, the record is closed.' });
        }

        case 'rpg': {
            // `.j gw rpg on|off|list|status` — mark this GC as RPG-friendly:
            // organic alignment wars broadcast their call card here (paced).
            const action = (args[1] || 'status').toLowerCase();
            if (!chatId || !chatId.endsWith('@g.us')) {
                return sock.sendMessage(chatId, { text: '❌ Mark whole groups - run this inside the GC you want to mark.' });
            }
            const system = require('../../utils/system');
            let botId = 'global';
            try { botId = require('../../../botConfig').getBotId() || 'global'; } catch (e) {}
            const GCS_KEY = `gw_rpg_gcs_${botId}`;
            const list = system.get(GCS_KEY, []) || [];
            const normJ = (j) => String(j || '').split('@')[0].split(':')[0];
            let allowed = canStart;
            if (!allowed) {
                try {
                    const meta = await sock.groupMetadata(chatId);
                    const meP = (meta.participants || []).find((p) => normJ(p.id) === normJ(senderJid));
                    allowed = !!(meP && (meP.admin === 'admin' || meP.admin === 'superadmin'));
                } catch (e) { allowed = false; }
            }

            if (action === 'on' || action === 'add' || action === 'mark') {
                if (!allowed) {
                    return sock.sendMessage(chatId, { text: '❌ Only group admins or bot mods can mark a GC as RPG-friendly.' });
                }
                if (list.includes(chatId)) {
                    return sock.sendMessage(chatId, { text: '🌍 This group is already marked RPG-friendly. Organic alignment war calls will land here.' });
                }
                list.push(chatId);
                system.set(GCS_KEY, list);
                console.log(`[GuildWar] RPG-friendly GC marked (${botId}): ${chatId} (${list.length} total)`);
                return sock.sendMessage(chatId, {
                    text: `🌍 *This group is now RPG-friendly.*\nWhen the worlds align on their own, the Guild Association's call to war will be announced here - one card per alignment window, paced, no spam.\nUnmark anytime: \`${prefix} gw rpg off\` · marked GCs on this bot: *${list.length}*`,
                });
            }
            if (action === 'off' || action === 'remove' || action === 'unmark') {
                if (!allowed) {
                    return sock.sendMessage(chatId, { text: '❌ Only group admins or bot mods can unmark a GC.' });
                }
                const next = list.filter((c) => c !== chatId);
                system.set(GCS_KEY, next);
                return sock.sendMessage(chatId, { text: `🕯️ This group is no longer RPG-friendly. (${next.length} marked on this bot)` });
            }
            if (action === 'list') {
                if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
                return sock.sendMessage(chatId, {
                    text: `🌍 *RPG-friendly GCs on this bot* (${list.length}):\n${list.map((c, i) => `  ${i + 1}. ${c}`).join('\n') || '  none yet - mark one with \`${prefix} gw rpg on\`'}`,
                });
            }
            // status: is THIS group marked?
            return sock.sendMessage(chatId, {
                text: list.includes(chatId)
                    ? `🌍 This group *is* marked RPG-friendly - organic alignment war calls land here. Remove: \`${prefix} gw rpg off\``
                    : `🕯️ This group is not marked. Mark it: \`${prefix} gw rpg on\` (group admins or bot mods)`,
            });
        }

        case 'help': default: {
            const caption = `⚔️ *GUILD WAR: THE RUINS*\n` +
                `\`${prefix} gw start\` mods: open registration (this GC = feed HQ)\n` +
                `\`${prefix} gw start alignment\` mods: alignment-scale war\n` +
                `\`${prefix} gw join\` enter the registering war\n` +
                `\`${prefix} gw forcestart\` mods: deploy now\n` +
                `\`${prefix} gw status\` live standings\n` +
                `\`${prefix} gw end\` mods: conclude and pay rewards\n` +
                `\`${prefix} gw abort\` mods: shut it down, no rewards\n` +
                `\`${prefix} gw rpg on|off\` admins: mark this GC for alignment calls\n\n` +
                `In my DMs once deployed: \`look\`, \`move w/a/s/d\`, \`map\`, \`paths\`, \`relics\`, \`handin\`, \`challenge @name\`, \`share map @mate\`, \`status\`, \`quit\`.`;
            try {
                const buf = await notice.renderWarHelpCard({ prefix });
                await sock.sendMessage(chatId, { image: buf, caption });
            } catch (e) {
                console.error('[GW] help card failed:', e?.message);
                return sock.sendMessage(chatId, { text: caption });
            }
            return;
        }
    }
}

// ⚔️ DM the deployment to every champion. Fired on deploy — both manual
// forcestart and auto registration-expiry start.
// 💡 OVERHAUL 2026-10-04 (owner spec §1): the parchment 'THE WAR HAS BEGUN
// — to begin: LOOK' card is DEAD. The deployment DM IS the game: a short
// martial text, then the spawn room presents itself (map with the YOU
// marker → the scene with the champion standing in it). Nobody is told to
// "look" — the world shows itself.
async function dmWarStartCards(sock, BOT_MARKER = '\u200B', event, prefix = '.') {
    if (!sock || !event) return 0;
    const dmRouter = require('./dmRouter');
    const players = (event.players || []).filter((p) => p && p.jid && p.status !== 'quit');
    let sent = 0;
    for (const p of players) {
        try {
            await sock.sendMessage(p.jid, {
                text: `${BOT_MARKER}⚔️ *THE WAR HAS BEGUN, ${p.name}.*\nYou are deployed into the Ruins of a dead world. My DMs are now your game screen - your surroundings await below.`,
            });
            sent += 1;
        } catch (e) {
            console.error('[GW] start DM failed:', p.jid, e?.message);
        }
        // auto-present the spawn room: MAP first (§2 order), then the scene
        // with the champion standing in it. deployOrder flag kept for any
        // caller that wants scene-first — default flow is map-first now.
        try {
            const ctx = await state.getMoveContext(event.eventId, p.roomId);
            if (ctx && ctx.room) {
                const me = ctx.players?.find?.((x) => x.jid === p.jid) || p;
                await dmRouter.presentRoom(sock, p.jid, BOT_MARKER, ctx, me, ctx.room, { prefix });
            }
        } catch (e) {
            console.error('[GW] spawn auto-present failed:', p.jid, e?.message);
        }
        await new Promise((r) => setTimeout(r, 700)); // pace the deployment wave
    }
    return sent;
}

module.exports = {
    CFG, state, feed, points, encounters, rooms, mapEngine,
    installCombatHooks, handleGroupCommand, dmWarStartCards, _noteRetreat,
};
