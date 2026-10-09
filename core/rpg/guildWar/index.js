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
// ⏳ FINALE SUPPORT (owner 2026-10-05 23:09Z): when a warden boss dies, the
// ledger on the event doc is updated atomically; when all four are dead the
// war ENDS right there (rewards distribute immediately — no waiting for the
// next tick).
// shared prefix lookup for hook-side DM copy (waiter resume etc.)
function _gwPrefix() {
    try { return require('../../../botConfig').getPrefix() || '.'; } catch (e) { return '.'; }
}

async function _wardenDown(eventId, room) {
    const GuildWarEvent = require('../../models/GuildWarEvent');
    const payload = room.payload || {};
    const idx = typeof payload.get === 'function' ? payload.get('wardenIndex') : payload.wardenIndex;
    const name = (typeof payload.get === 'function' ? payload.get('wardenName') : payload.wardenName) || 'a Warden';
    // mark this warden dead (arrayFilter binds ONE ledger entry)
    await GuildWarEvent.updateOne(
        { eventId, 'finale.bosses.index': idx },
        { $set: { 'finale.bosses.$[b].dead': true } },
        { arrayFilters: [{ 'b.index': idx }] }
    ).catch(() => {});
    const ev = await state.getEvent(eventId, { fresh: true });
    const bosses = (ev && ev.finale && Array.isArray(ev.finale.bosses)) ? ev.finale.bosses : [];
    const dead = bosses.filter((b) => b.dead).length;
    const total = bosses.length || CFG.FINALE.BOSS_COUNT;
    feed.queue(eventId, 'major',
        `⏳💀 *${name.toUpperCase()} HAS FALLEN* — warden ${dead} of ${total} destroyed!${dead < total ? `\n${total - dead} still hold the Ruins. The war goes on.` : ''}`);
    if (dead >= total && total > 0) {
        feed.queue(eventId, 'major', '⏳ *ALL FOUR WARDENS ARE DEAD.* The Ruins fall silent — the war is OVER. The Association tallies the final spoils…');
        await state.endEvent(eventId, 'All four wardens have fallen. The Ruins fall silent.');
        return { allDead: true, dead, total, ended: true };
    }
    return { allDead: false, dead, total, ended: false };
}

// defeat bookkeeping for ONE event player (life lost → respawn / final death)
async function _defeatPlayer(eventId, evPlayer) {
    const jid = evPlayer.jid;
    const freshLives = Math.max(0, (evPlayer.lives ?? CFG.COMBAT.LIVES) - 1);
    const spawnRoom = evPlayer.spawnRoomId || evPlayer.roomId;
    if (freshLives > 0) {
        await state.updatePlayer(eventId, jid, {}, {
            lives: freshLives,
            roomId: spawnRoom,
            prevRoomId: spawnRoom,
            protectedUntil: Date.now() + CFG.COMBAT.RESPAWN_PROTECT_MS,
            lastActionAt: Date.now(),
        });
        // 🤝 occupancy hygiene: the body leaves the death chamber and wakes
        // at its spawn hall — otherwise the dead champion lingers in the old
        // room's occupants (talk ghosts, co-op seating reads stale mates).
        await rooms.leaveRoom(eventId, jid, evPlayer.roomId).catch(() => {});
        await rooms.enterRoom(eventId, jid, null, spawnRoom).catch(() => {});
        feed.queue(eventId, 'normal',
            `💀 *${evPlayer.name || jid} of ${evPlayer.guildName || 'the unsworn'}* has fallen deep within the Ruins.\n` +
            `The dead world claims another life.\n` +
            `*${freshLives}* ${freshLives === 1 ? 'life' : 'lives'} remain${freshLives === 1 ? 's' : ''}.`);
        return { jid, kind: 'respawn', name: evPlayer.name, lives: freshLives, spawnRoom };
    }
    await rooms.dropCarriedRelics(eventId, jid, 'final death');
    await rooms.leaveRoom(eventId, jid, evPlayer.roomId).catch(() => {});
    await state.updatePlayer(eventId, jid, {}, { status: 'defeated', lives: 0 });
    feed.queue(eventId, 'normal',
        `💀 *${evPlayer.name || jid} of ${evPlayer.guildName || 'the unsworn'}* has fallen for the last time this war.\n` +
        `The Ruins keep what they take — their carried relics lie where they fell.`);
    return { jid, kind: 'final', name: evPlayer.name, lives: 0, spawnRoom };
}

function installCombatHooks() {
    const guildAdventure = require('../guildAdventure');
    guildAdventure.setRuinsHooks({
        // flee → back to previous room, room forfeited (stays ACTIVE)
        // ⚔️ §15 #1 FIX: the hook param was named `state`, SHADOWING the
        // module's own `const state = require('./state')` — every hook call
        // threw `state.getEvent is not a function` and was swallowed
        // upstream, so rooms never cleared, GP never paid, lives never
        // dropped. Param renamed to `session` (the combat session object).
        // 🤝 co-op (owner 2026-10-05): guildAdventure identifies WHO fled —
        // only that champion is unseated; the shared battle continues.
        onFlee(session, fleeJid) {
            const meta = session.ruinsMeta;
            if (!meta) return;
            const player = (session.players || []).find((p) => p.jid === fleeJid) || (session.players || [])[0];
            if (!player) return;
            const realCount = (session.players || []).filter((p) => p.jid && !p.isTutorialAlly).length;
            if (realCount > 1) {
                try { require('../guildAdventure').leaveRuinsSession(player.jid); } catch (e) {}
            }
            // teleport the session's player back to their previous room
            session.playerRetreated = true; // hint for any group combat flows
            require('./index')._noteRetreat(meta.eventId, player.jid).catch((e) =>
                console.error('[GW] onFlee note failed:', e?.message));
        },
        // combat end → victory clears the room + awards; defeat respawns.
        // 💡 NAVIGATION OVERHAUL: on victory the player is DM'd the VISUAL
        // navigation card (arrows for every open path) instead of text exits.
        // 🤝 TEAM CO-OP (owner 2026-10-05 23:09Z): the session now carries a
        // PARTY (every same-guild champion seated in the room). Outcomes are
        // resolved per participant: shared room GP for the living, life-loss +
        // respawn for the fallen, warden-ledger updates for the finale.
        async onEnd(session, victory, sessionKey, sock) {
            const meta = session.ruinsMeta;
            if (!meta) return;
            const realPlayers = (session.players || []).filter((p) => p.jid && !p.isTutorialAlly);
            if (!realPlayers.length) return;
            const GuildWarEvent = require('../../models/GuildWarEvent');

            if (victory) {
                const ev = await state.getEvent(meta.eventId, { fresh: true });
                if (!ev || ev.state !== 'ACTIVE') return;
                const room = ev.rooms.find((r) => r.key === meta.roomKey);
                if (!room) return;
                const firstEv = realPlayers.map((p) => ev.players.find((x) => x.jid === p.jid)).find(Boolean) || realPlayers[0];

                const claim = await rooms.clearRoom(meta.eventId, room.key, firstEv);
                if (claim.won) {
                    // battle-variant adjustment: elite/cursed/bounty rooms pay more
                    const variant = require('./encounters').variantOf(room);
                    const gpValue = Math.round((CFG.POINTS.ROOM_CLEAR[room.type] ?? 10) * (variant?.gpMult || 1));
                    const coop = realPlayers.length > 1;
                    const results = [];
                    for (const p of realPlayers) {
                        const evP = ev.players.find((x) => x.jid === p.jid);
                        if (!evP) continue;
                        const alive = !p.isDead && (p.currentHP ?? p.stats?.hp ?? 1) > 0;
                        if (alive) {
                            // shared reward: every living participant is paid
                            await points.award(meta.eventId, p.jid, gpValue, 'room-clear', { coopBonus: coop });
                            // relic award for relic-bearing room types (per-player roll)
                            if (['discovery', 'reward', 'secret'].includes(room.type)) {
                                await encounters.awardRoomRelic(ev, evP, room);
                            }
                            results.push({ jid: p.jid, kind: 'victory', name: evP.name || p.name });
                        } else {
                            // fell mid-fight, but the chamber was won — a life is
                            // still lost and the body wakes at the spawn hall
                            results.push(await _defeatPlayer(meta.eventId, evP));
                        }
                    }

                    // 💡 FEED (§17): boss-tier kills are war headlines
                    if (room.type === 'core' || (room.type === 'secret' && room.payload && (room.payload.boss || room.payload.get?.('boss')))) {
                        feed.queue(meta.eventId, 'major',
                            `💀 ${firstEv.name} of ${firstEv.guildName} has SLAIN the guardian of the ${room.type === 'core' ? 'WORLD CORE' : 'hidden chamber'}! The way stands open.`);
                    }

                    // World Core: first guild to breach
                    if (room.type === 'core' && !ev.coreClaimedBy) {
                        await GuildWarEvent.updateOne(
                            { eventId: meta.eventId, coreClaimedBy: null },
                            { $set: { coreClaimedBy: firstEv.guildId } }
                        );
                        feed.queue(meta.eventId, 'major',
                            `🌐 *WORLD EVENT* — ${firstEv.name} of ${firstEv.guildName} has breached the WORLD CORE! First-guild glory: +${CFG.POINTS.CORE_FIRST_GUILD} GP to every member!`);
                        for (const mate of ev.players.filter((p) => p.guildId === firstEv.guildId)) {
                            await points.award(meta.eventId, mate.jid, CFG.POINTS.CORE_FIRST_GUILD, 'core-guild', { ignoreCap: false });
                        }
                        await points.award(meta.eventId, firstEv.jid, CFG.POINTS.CORE_BREACH_PLAYER, 'core-breach');
                    }

                    const heroNames = results.filter((r) => r.kind === 'victory').map((r) => r.name).join(' & ') || firstEv.name;
                    feed.queue(meta.eventId, 'normal',
                        `⚔️ ${heroNames} cleared a ${room.type === 'core' ? 'World Core guardian' : room.type === 'finale' ? 'WARDEN of the Ruins' : 'guarded chamber'}${coop ? ', standing shoulder to shoulder with guildmates' : ', alone in the dark'}.`);

                    // ⚔️ waiter resume (multiplayer brief §6, merged from the
                    // parallel branch): rivals who waited this fight out are
                    // told the moment it resolves — fire-and-forget so the
                    // winner's decree → map → scene ordering stays untouched.
                    // rawSock: the multicast sock would echo to the seated party.
                    // All victors are excluded (array-aware clearer list).
                    try { encounters.notifyRoomResolved(meta.eventId, room.key,
                        results.filter((r) => r.kind === 'victory').map((r) => r.jid),
                        session.rawSock || sock, { prefix: _gwPrefix(), kind: 'victory' })
                        .catch((e) => console.error('[GW] waiter resume failed:', e?.message)); } catch (e) {}

                    // ⏳ FINALE: a warden died here — update the ledger; when the
                    // fourth falls, the war ENDS (rewards pay immediately).
                    let finaleDone = null;
                    if (room.type === 'finale' || (room.payload && (room.payload.finaleBoss || room.payload.get?.('finaleBoss')))) {
                        finaleDone = await _wardenDown(meta.eventId, room);
                    }

                    // 🔄 ORDERING (owner 2026-10-05 11:48Z): onEnd returns a
                    // descriptor; presentAfterBattle replays the navigation
                    // AFTER the decree end card.
                    return { kind: 'victory', claimed: true, players: results, finaleDone };
                } else {
                    const late = ev.players.find((p) => p.jid === firstEv.jid);
                    feed.queue(meta.eventId, 'minor', `⏳ ${late ? late.name : firstEv.name} arrived a heartbeat too late — another's banner already flies over that chamber.`);
                    return { kind: 'victory', claimed: false, players: [] };
                }
            } else {
                // defeat: lives--, respawn at spawn corner with protection, room stays ACTIVE
                // (§15 #1 fix: this path was unreachable before the shadowing fix)
                // 💬 DEFEAT-PATH BUGFIX 2026-10-04 (owner spec §23 "Win. Lose."):
                // read the authoritative event players, not the session entities
                // (they carry no lives/spawnRoomId). 🤝 co-op: a party wipe
                // resolves EVERY participant's death individually — each
                // champion loses their own life and wakes at their own spawn.
                const evD = await state.getEvent(meta.eventId, { fresh: true }).catch(() => null);
                const results = [];
                for (const p of realPlayers) {
                    const src = (evD && evD.players && evD.players.find((x) => x.jid === p.jid)) || p;
                    results.push(await _defeatPlayer(meta.eventId, src));
                }
                // ⚔️ waiter resume (defeat): the chamber is still live — rivals
                // who waited out the wipe may `fight` it themselves or flee.
                // All fallen participants are excluded (array-aware list).
                try { encounters.notifyRoomResolved(meta.eventId, meta.roomKey,
                    results.map((r) => r.jid), session.rawSock || sock, { prefix: _gwPrefix(), kind: 'defeat' })
                    .catch((e) => console.error('[GW] waiter resume (defeat) failed:', e?.message)); } catch (e) {}
                return { kind: 'defeat-multi', players: results };
            }
        },
        // 🔄 POST-BATTLE PRESENTATION (owner 2026-10-05 11:48Z: "the defeat
        // or victory image card should come in before the map and new
        // encounter one"): the decree card used to arrive LAST because onEnd
        // sent the map/encounter long before endCombat reached the endCard
        // block. onEnd now only mutates state and returns a descriptor;
        // endCombat calls THIS hook immediately after the card is sent, so
        // the DM order becomes: decree card → navigation map → room encounter.
        async presentAfterBattle(session, victory, sessionKey, sock, desc) {
            const meta = session.ruinsMeta;
            if (!meta || !sock || !desc) return;
            // 🤝 co-op: per-PLAYER sends use the RAW sock (respawn chambers
            // differ per champion); shared visuals ride the multicast.
            const rawSock = session.rawSock || sock;
            let prefix = '.';
            try { prefix = require('../../../botConfig').getPrefix() || '.'; } catch (e) {}
            try {
                // multi-player descriptor: results per participant. Legacy
                // single-player descriptors (kind victory/respawn/final with
                // top-level fields) are normalized into the same loop.
                let results = Array.isArray(desc.players) ? desc.players : [];
                if (!results.length && desc.kind === 'respawn') {
                    const jid = (session.players || [])[0]?.jid;
                    if (jid) results = [{ jid, kind: 'respawn', name: desc.name, lives: desc.lives, spawnRoom: desc.spawnRoom }];
                }
                if (desc.kind === 'victory' && desc.claimed) {
                    // victory: the RETURN map (same chart, post-encounter state)
                    const freshAfter = await state.getEvent(meta.eventId, { fresh: true });
                    const dmRouter = require('./dmRouter');
                    for (const r of results.filter((x) => x.kind === 'victory' && x.jid)) {
                        const meAfter = freshAfter.players.find((p) => p.jid === r.jid);
                        if (!meAfter) continue;
                        const roomAfter = freshAfter.rooms.find((rr) => rr.key === meAfter.roomId);
                        if (!roomAfter) continue;
                        const retBuf = await dmRouter.returnMapFor(freshAfter, meAfter, roomAfter);
                        await rawSock.sendMessage(r.jid, {
                            image: retBuf,
                            caption: dmRouter.mapCaption('🧭 *The chamber is yours.* The compass marks your exits.', prefix),
                        });
                    }
                }
                for (const r of results.filter((x) => x.kind === 'respawn' && x.jid)) {
                    // defeat: the fall text + the spawn chamber they wake up in
                    await rawSock.sendMessage(r.jid, {
                        text: `💀 *You have fallen, ${r.name}.*\nThe Association's wards drag you back to the chamber where you deployed. ${r.lives} ${r.lives === 1 ? 'life' : 'lives'} remain - the war goes on.`,
                    });
                    const dmRouter = require('./dmRouter');
                    const ctxDoc = await state.getMoveContext(meta.eventId, r.spawnRoom);
                    if (ctxDoc && ctxDoc.room) {
                        const evNow = await state.getEvent(meta.eventId, { fresh: true });
                        const src = (evNow.players || []).find((p) => p.jid === r.jid) || {};
                        const meNow = { ...src, roomId: r.spawnRoom, prevRoomId: r.spawnRoom };
                        await dmRouter.presentRoom(rawSock, r.jid, '\u200B', ctxDoc, meNow, ctxDoc.room, { prefix });
                    }
                }
                // kind 'final': no navigation to show — the war is over for them
            } catch (e) {
                console.error('[GW] post-battle presentation failed (non-fatal):', e?.message);
            }
        },
        // ⚔️ RUINS END CARDS (owner 2026-10-05): the war's victory/defeat
        // image is the ROYAL-DECREE parchment card themed to the Ruins —
        // the default Go VICTORY/DEFEAT portrait is retired for war fights.
        async endCard(session, victory) {
            const meta = session.ruinsMeta;
            const player = (session.players || [])[0];
            if (!meta || !player) return null;
            try {
                const ev = await state.getEvent(meta.eventId, { fresh: true });
                const me = ev && ev.players.find((p) => p.jid === player.jid);
                const room = ev && ev.rooms.find((r) => r.key === meta.roomKey);
                const TYPE_LABEL = require('./roomScene').TYPE_LABEL;
                // 🤝 co-op: the decree names the whole party (capped)
                const partyNames = (session.players || [])
                    .filter((p) => p.jid && !p.isTutorialAlly).map((p) => p.name).filter(Boolean);
                const playerName = (partyNames.length > 1 ? partyNames.join(' · ') : (player.name || '')).slice(0, 60);
                return await require('./endCard').renderRuinsEndCard({
                    victory,
                    playerName,
                    guildName: (me && me.guildName) || player.guildName || '',
                    roomLabel: room ? ((TYPE_LABEL[room.type] || 'chamber').toLowerCase()) : 'chamber',
                    chamberKey: meta.roomKey,
                    gp: (me && me.score) || 0,
                    relicNames: ((me && me.relics) || []).map((r) => r.name).filter(Boolean),
                    // 🔄 lives read from the FRESH event player (post-onEnd,
                    // since the card renders after the hook mutates state) —
                    // the session entity carries no lives, so the old fallback
                    // always printed the default 3 (−1 on defeat).
                    lives: Math.max(0, (me && me.lives) ?? player.lives ?? CFG.COMBAT.LIVES),
                });
            } catch (e) {
                console.error('[GW] ruins end card failed (non-fatal):', e?.message);
                return null;
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
    feed.queue(eventId, 'minor', `🏃 ${p.name} fled the chamber — whatever it held stays with the Ruins.`);
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
            // ⚔️ 2026-10-09 OWNER SPEC (Guild War overhaul):
            //   `.j war start`       → FULL-SCALE event (alignment scale, ~4x the
            //                           test map), announced in every RPG GC
            //   `.j war start -test` → the smaller mod-initiated war (normal scale)
            // Legacy forms keep working: explicit `alignment`/`full` → full-scale,
            // explicit `normal` → test scale. The natural 4-day spawn is gone
            // (CFG.ALIGNMENT_AUTOSPAWN = false) — wars start only from here.
            const rest = args.slice(1).map((a) => String(a || '').toLowerCase());
            const wantsTest = rest.some((a) => a === '-test' || a === 'test' || a === 'normal');
            const wantsFull = rest.some((a) => a === 'alignment' || a === 'full');
            const type = wantsTest ? 'normal' : 'alignment';
            if (wantsFull && wantsTest) {
                return sock.sendMessage(chatId, { text: `❌ Pick one scale: \`${prefix} war start\` (full-scale) or \`${prefix} war start -test\` (test skirmish).` });
            }
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
                caption: `⚔️ *GUILD WAR ${type === 'alignment' ? '- FULL SCALE' : 'CALLED (TEST)'}*\n\n` +
                    `Registration open: \`${prefix} gw join\` (or DM me \`join\`).\n` +
                    `Registration closes in ${regMin} minutes · deployment automatic.\n` +
                    `Players act through bot DMs - this group receives the live feed.\n` +
                    (type === 'alignment'
                        ? `🌐 *Full-scale call:* every RPG-friendly group chat is being notified. (Small skirmish instead: \`${prefix} war start -test\` · call it off: \`${prefix} war abort\`)\n`
                        : `🧪 *Test skirmish:* this GC only - no wide announcement. (Full-scale: \`${prefix} war start\`)\n`) +
                    `_Initiated by ${senderName}._`,
            });

            // ⚔️ 2026-10-09: full-scale wars announce in EVERY RPG group chat.
            // Fire-and-forget AFTER the call card (never block the GC reply):
            // the host bot announces now; sibling bots follow via their 60s
            // worldAlignment tick (same event-id stamp guard, no doubles).
            if (type === 'alignment') {
                try {
                    const worldAlignment = require('../worldAlignment');
                    worldAlignment.announceAlignmentWar(sock, '\u200B', {
                        eventId: res.event.eventId,
                        hostGroupId: res.event.hostGroupId,
                        initiatedBy: senderJid,
                        registrationEndsAt: res.event.registrationEndsAt,
                    }).catch((e) => console.error('[GW] full-scale announce:', e?.message));
                } catch (e) {
                    console.error('[GW] full-scale announce setup:', e?.message);
                }
            }
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
            // count from the UPDATED doc — registerPlayer returns findOneAndUpdate({new:true}),
            // the `pending` snapshot was fetched BEFORE this join, so the first joiner showed "(0 registered)"
            // 💡 UX (user-side judge 2026-10-09): name the SCALE — with a full-scale
            // and a skirmish both open, players must know which war they joined.
            return sock.sendMessage(chatId, { text: `✅ ${senderName} of *${g?.name || ug}* joins the ${pending.type === 'alignment' ? '*FULL-SCALE* war' : 'test skirmish'}! (${res.players.length} registered)\nWait for deployment, then act in my DMs.` });
        }

        case 'forcestart': {
            if (!canStart) return sock.sendMessage(chatId, { text: '❌ Mod only.' });
            // 💡 UX (user-side judge 2026-10-09): with two wars registering at
            // once (full-scale + skirmish fit MAX_CONCURRENT_EVENTS), "newest
            // wins" could deploy the WRONG war. Prefer THIS group's war first.
            const GWE = require('../../models/GuildWarEvent');
            const pending = (await GWE.findOne({ state: 'REGISTRATION', hostGroupId: chatId }).sort({ createdAt: -1 }))
                || (await GWE.findOne({ state: 'REGISTRATION' }).sort({ createdAt: -1 }));
            if (!pending) return sock.sendMessage(chatId, { text: '❌ Nothing to start.' });
            const res = await state.startEvent(pending.eventId, { deadWorld: args[1] || null });
            if (!res.ok) return sock.sendMessage(chatId, { text: `❌ ${res.reason}` });
            feed.queue(pending.eventId, 'major', `🌐 *WORLD EVENT* — THE WAR HAS BEGUN! ${res.event.players.length} champion${res.event.players.length === 1 ? '' : 's'} deploy into the Ruins of a dead world. Hold fast, champions — the feed below will tell their tale.`);
            // ⚔️ owner brief: DM every champion the start card ("the war has
            // begun + how you play") - fire and forget, never block the GC reply
            dmWarStartCards(sock, '\u200B', res.event, prefix).catch((e) => console.error('[GW] start-card DM:', e?.message));

            // ⚔️ STARTUP OVERHAUL (owner spec §5): the group announcement must
            // feel like THE GUILD WAR HAS BEGUN — an event, not a debug log.
            // No "N players, grid 8×8", no "look around" — the world, the
            // stakes, and the fact that every champion's room already waits
            // in their DMs.
            const world = encounters.worldTheme(res.event.deadWorld);
            const guildNames = [...new Set(res.event.players.map((p) => p.guildName).filter(Boolean))];
            const guildLine = guildNames.length
                ? guildNames.slice(0, 6).map((n) => `*${n}*`).join(' · ')
                : 'the free companies';
            const side = res.event.side || 8;
            const deployText =
                `⚔️ *THE GUILD WAR HAS BEGUN*\n\n` +
                `${res.event.type === 'alignment' ? '🌐 *WORLD ALIGNMENT*' : '💀 *THE RUINS OF A DEAD WORLD*'}\n` +
                `The ${world ? world.name : 'dead world'} opens its gates: ~${side * side} chambers of silent halls, sealed vaults and things that never finished dying.\n\n` +
                `🚩 *Deploying now:* ${res.event.players.length} champion${res.event.players.length === 1 ? '' : 's'}\n` +
                `${guildLine}\n\n` +
                `📜 *How the war is fought*\n` +
                `• Every champion's room is ALREADY WAITING in their DMs — the world shows itself.\n` +
                `• Move: \`${prefix} move forward / left / right / back\` (bare words work too)\n` +
                `• Clear chambers, unearth relics, hand them in for Guild Points\n` +
                `• Meet rivals... or end them. The World Core crowns the boldest guild.\n\n` +
                `🔥 This group is now the WAR FEED — falls, discoveries and standings will be reported here. Fight well.`;
            return sock.sendMessage(chatId, { text: deployText });
        }

        case 'status': case 'score': {
            const active = await state.getActiveEvents();
            if (!active.length) {
                return sock.sendMessage(chatId, {
                    text: `🕊️ *No war is running right now.*\nThe Ruins stand quiet. Mods raise the call: \`${prefix} war start\` (full-scale) or \`${prefix} war start -test\` (skirmish)\nFull-scale calls announce in every RPG-friendly GC (\`${prefix} gw rpg on\`).`,
                });
            }
            for (const ev of active) {
                const board = feed.computeScoreboard(ev).slice(0, 8);
                const standings = board
                    .map((g, i) => `${['🥇', '🥈', '🥉'][i] || '▫️'} *${g.name}:* ${g.points} GP`).join('\n') || '_no scores yet: chambers, relics and the World Core await_';
                // ⏳ finale: the clock becomes the warden tally
                let clock;
                if (ev.finale && ev.finale.started) {
                    const bs = Array.isArray(ev.finale.bosses) ? ev.finale.bosses : [];
                    const down = bs.filter((b) => b.dead).length;
                    clock = `⏳ *FINALE* — wardens slain ${down}/${bs.length || CFG.FINALE.BOSS_COUNT}`;
                } else {
                    const minsLeft = ev.endsAt ? Math.round((ev.endsAt - Date.now()) / 60000) : null;
                    clock = minsLeft != null ? `${Math.max(0, minsLeft)} min left` : 'no clock';
                }
                const caption = `⚔️ *GUILD WAR: THE RUINS* (${ev.type}, ${ev.state})\n` +
                    `👥 ${ev.players.length} champions · ${clock}\n\n${standings}\n\n_Chambers open in my DMs — move with \`${prefix} move forward / left / right / back\`._`;
                try {
                    const buf = await notice.renderWarStatusCard({
                        type: ev.type, state: ev.state, players: ev.players.length,
                        endsInMin: (ev.finale && ev.finale.started) ? 0 : (ev.endsAt ? Math.max(0, Math.round((ev.endsAt - Date.now()) / 60000)) : null),
                        standings: board,
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
            feed.queue(targetId, 'major', `🏳️ *THE WAR HAS ENDED* — the dust settles over the Ruins. The Association tallies the spoils of ${ended.rewards.guilds.length} guild${ended.rewards.guilds.length === 1 ? '' : 's'} that took the field.`);

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
            // ⚔️ 2026-10-09: process-level identity (BOT_INSTANCE) — the tick
            // broadcast reads gw_rpg_gcs_<resolveBotId()> with NO ALS context,
            // so the registry key must be context-independent on both sides.
            let botId = 'global';
            try { botId = require('../../utils/botInstance').resolveBotId(); } catch (e) {}
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
                    return sock.sendMessage(chatId, { text: '🌍 This group is already marked RPG-friendly. Full-scale war calls will land here.' });
                }
                list.push(chatId);
                system.set(GCS_KEY, list);
                console.log(`[GuildWar] RPG-friendly GC marked (${botId}): ${chatId} (${list.length} total)`);
                return sock.sendMessage(chatId, {
                    text: `🌍 *This group is now RPG-friendly.*\nFull-scale Guild War calls (\`${prefix} war start\`) will be announced here - one card per war, paced, no spam.\nUnmark anytime: \`${prefix} gw rpg off\` · marked GCs on this bot: *${list.length}*`,
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
                    ? `🌍 This group *is* marked RPG-friendly - full-scale war calls land here. Remove: \`${prefix} gw rpg off\``
                    : `🕯️ This group is not marked. Mark it: \`${prefix} gw rpg on\` (group admins or bot mods)`,
            });
        }

        case 'help': default: {
            const caption = `⚔️ *GUILD WAR: THE RUINS*\n` +
                `\`${prefix} war start\` mods: FULL-SCALE war (~4x map, 3 worlds, announced in every RPG GC)\n` +
                `\`${prefix} war start -test\` mods: small test skirmish (this GC only)\n` +
                `\`${prefix} war join\` enter the registering war\n` +
                `\`${prefix} war forcestart\` mods: deploy now\n` +
                `\`${prefix} war status\` live standings\n` +
                `\`${prefix} war end\` mods: conclude and pay rewards\n` +
                `\`${prefix} war abort\` mods: shut it down, no rewards\n` +
                `\`${prefix} war rpg on|off\` admins: mark this GC for full-scale calls\n\n` +
                `In my DMs once deployed: \`map\`, \`move forward/left/back/right\`, \`paths\`, \`relics\`, \`handin\`, \`challenge @name\`, \`share map @mate\`, \`status\`, \`quit\`.`;
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
        // 📖 ONBOARDING PRIMER (UX pass #4/#7, owner brief 2026-10-07): the
        // field manual rides the deployment wave — one compact card covering
        // goal, movement, examine, relics, lives — BEFORE the spawn room
        // presents. Beta learned all of this by dying; now it ships with the
        // war. Always available again via `help` / `howto` in the DMs.
        try {
            await sock.sendMessage(p.jid, { text: BOT_MARKER + dmRouter.fieldManualText(prefix) });
        } catch (e) {
            console.error('[GW] field-manual DM failed:', p.jid, e?.message);
        }
        // auto-present the spawn room: MAP first (§2 order), then the scene
        // with the champion standing in it. deployOrder flag kept for any
        // caller that wants scene-first — default flow is map-first now.
        let presented = null;
        try {
            const ctx = await state.getMoveContext(event.eventId, p.roomId);
            if (ctx && ctx.room) {
                const me = ctx.players?.find?.((x) => x.jid === p.jid) || p;
                presented = { ctx, me };
                await dmRouter.presentRoom(sock, p.jid, BOT_MARKER, ctx, me, ctx.room, { prefix });
            }
        } catch (e) {
            console.error('[GW] spawn auto-present failed:', p.jid, e?.message);
        }
        // ⚔️ AUTO-ENCOUNTER AT DEPLOYMENT (owner spec §14: "the world reacts
        // to the player; nobody has to poke the bot"): a champion who deploys
        // into an unresolved combat/coop/core (or boss-sealed secret) chamber
        // gets the encounter STARTED for them — the monster is standing in the
        // room they were just shown, so the battle begins on its own. Without
        // this, spawn-in-combat players were movement-locked with no session
        // and no hint (the "blocked until resolved" dead-end).
        try {
            const ctx = presented ? presented.ctx : await state.getMoveContext(event.eventId, p.roomId);
            const fresh = await state.getEvent(event.eventId, { fresh: true });
            const meNow = fresh.players.find((x) => x.jid === p.jid) || p;
            const roomNow = fresh.rooms.find((r) => r.key === meNow.roomId);
            const autoCombat = ctx && roomNow && roomNow.state !== 'CLEARED' && (
                ['combat', 'coop', 'core', 'finale'].includes(roomNow.type)
                || (roomNow.type === 'secret' && require('./encounters').payloadGet(roomNow.payload, 'boss'))
            );
            if (autoCombat) {
                await require('./encounters').startRoomCombat(sock, p.jid, meNow, fresh, roomNow, { groq: null });
            }
        } catch (e) {
            console.error('[GW] spawn auto-encounter failed (non-fatal):', p.jid, e?.message);
        }
        await new Promise((r) => setTimeout(r, 700)); // pace the deployment wave
    }
    return sent;
}

// ⚔️ ROOT-CAUSE FIX (the "war pays nothing" bug): installCombatHooks() was
// exported but NO boot path ever called it — every ruins fight ran with DEAD
// hooks: victories never cleared rooms, GP was never paid (standings sat at
// 0), lives never dropped, defeat never respawned, the return map never came.
// The hooks now self-install exactly once when this module is first required
// (engine boot, sweeper, DM router — any entry point lights the fuse).
let _hooksInstalled = false;
function ensureCombatHooks() {
    if (_hooksInstalled) return;
    _hooksInstalled = true;
    try {
        installCombatHooks();
        console.log('[GuildWar] ruins combat hooks installed');
    } catch (e) {
        _hooksInstalled = false;
        console.error('[GuildWar] combat hook install failed:', e?.message);
    }
}
ensureCombatHooks();

module.exports = {
    CFG, state, feed, points, encounters, rooms, mapEngine,
    installCombatHooks, ensureCombatHooks, handleGroupCommand, dmWarStartCards, _noteRetreat,
};
