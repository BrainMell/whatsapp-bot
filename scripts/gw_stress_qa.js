// ═══ STRESS + CRAFT MENU QA (owner brief §13 stress testing) ═══
// - N players firing rapid mixed inputs (moves, looks, maps, answers) at once
// - duplicate/rapid room transitions, simultaneous encounter triggers
// - craft menu shop-parity smoke (menu render + craft-by-number)
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) process.env[m[1]] = m[2];
}
const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond, detail: String(detail).slice(0, 200) });
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + String(detail).slice(0, 150) : ''}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    await require(path.join(ROOT, 'db'))();
    const mongoose = require('mongoose');
    for (const c of ['guildwarevents', 'guilds', 'systems', 'users', 'inventories']) {
        try { await mongoose.connection.db.collection(c).deleteMany({}); } catch (e) {}
    }
    const state = require(path.join(ROOT, 'core/rpg/guildWar/state'));
    const rooms = require(path.join(ROOT, 'core/rpg/guildWar/rooms'));
    const dmRouter = require(path.join(ROOT, 'core/rpg/guildWar/dmRouter'));
    const GuildWarEvent = require(path.join(ROOT, 'core/models/GuildWarEvent'));
    const guilds = require(path.join(ROOT, 'core/rpg/guilds'));
    const economy = require(path.join(ROOT, 'core/rpg/economy'));
    await guilds.loadGuilds();
    try { await guilds.createGuild('StressA', 'u-sa', 'ADVENTURER'); } catch (e) {}
    try { await guilds.createGuild('StressB', 'u-sb', 'ADVENTURER'); } catch (e) {}

    // 6 players, 2 guilds
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'stress@g.us', initiatedBy: 'x' });
    const EV = created.event.eventId;
    for (let i = 0; i < 6; i++) {
        const g = i % 2 ? 'StressB' : 'StressA';
        const jid = `p${i}@s.whatsapp.net`;
        if (!economy.getUser(jid)) economy.registerUser(jid, `P${i}`);
        await state.registerPlayer(EV, { jid, name: `P${i}`, guildId: g, guildName: g });
    }
    await state.startEvent(EV);

    // ── S1: rapid mixed inputs from ALL players concurrently ──
    console.log('\n──── S1: concurrent mixed input storm ────');
    const sock = { sent: [], async sendMessage(chatId, content) { this.sent.push({ chatId, text: String(content.text || content.caption || '').slice(0, 40), hasImage: !!content.image }); } };
    const verbs = ['move left', 'move right', 'move forward', 'move back', 'left', 'map', 'paths', 'look', 'status', 'zzz'];
    const jids = Array.from({ length: 6 }, (_, i) => `p${i}@s.whatsapp.net`);
    const storm = [];
    for (let round = 0; round < 4; round++) {
        for (const jid of jids) {
            for (const v of verbs) {
                storm.push(dmRouter.handleDM(sock, jid, jid, v, '', { prefix: '.j', prefixed: true }).catch((e) => ({ __threw: e.message })));
            }
        }
    }
    const settled = await Promise.allSettled(storm);
    const threw = settled.filter((r) => r.status === 'rejected' || (r.value && r.value.__threw));
    check('input storm: zero throws (240 concurrent inputs)', threw.length === 0, threw.length ? JSON.stringify(threw.slice(0, 2).map((t) => t.reason?.message || t.value?.__threw)) : 'clean');

    // state coherence: every player occupies exactly the room their row says
    const evC = await state.getEvent(EV, { fresh: true });
    let coherent = true, detail = '';
    for (const p of evC.players) {
        const room = evC.rooms.find((r) => r.key === p.roomId);
        if (!room) { coherent = false; detail = `${p.jid} in missing room ${p.roomId}`; break; }
        if (!(room.occupants || []).includes(p.jid)) { coherent = false; detail = `${p.jid} not in occupants of ${p.roomId}`; break; }
    }
    check('storm: room occupancy coherent with player rows', coherent, detail);

    // no duplicate combat sessions per player
    const guildAdventure = require(path.join(ROOT, 'core/rpg/guildAdventure'));
    let dupCombat = 0;
    for (const jid of jids) {
        const sessions = [...guildAdventure.gameStates.values()].filter((s) => (s.players || []).some((p) => p.jid === jid) && s.mode === 'RUINS');
        if (sessions.length > 1) dupCombat++;
    }
    check('storm: at most ONE combat session per player', dupCombat === 0, `${dupCombat} players with duplicates`);

    // ── S2: rapid room transitions (double-move same tick) ──
    console.log('\n──── S2: double-move race ────');
    const p0 = evC.players.find((p) => p.jid === 'p0@s.whatsapp.net');
    await state.updatePlayer(EV, p0.jid, {}, { lastMoveAt: 0 }); // clear cooldown
    const doubleMove = await Promise.allSettled([
        dmRouter.handleDM(sock, p0.jid, p0.jid, 'move left', '', { prefix: '.j', prefixed: true }),
        dmRouter.handleDM(sock, p0.jid, p0.jid, 'move right', '', { prefix: '.j', prefixed: true }),
        dmRouter.handleDM(sock, p0.jid, p0.jid, 'move forward', '', { prefix: '.j', prefixed: true }),
    ]);
    const evD = await state.getEvent(EV, { fresh: true });
    const p0d = evD.players.find((p) => p.jid === p0.jid);
    const roomD = evD.rooms.find((r) => r.key === p0d.roomId);
    check('double-move: all handled', doubleMove.every((r) => r.status === 'fulfilled'), '');
    check('double-move: player lands in a valid room with occupancy', roomD && (roomD.occupants || []).includes(p0.jid), `${p0d.roomId}`);

    // ── S3: craft menu shop parity ──
    console.log('\n──── S3: craft menu ────');
    const rpgCommands = require(path.join(ROOT, 'core/commands/rpgCommands'));
    const csock = { sent: [], async sendMessage(chatId, content) { this.sent.push({ text: String(content.text || '') }); } };
    const dmJid = 'p0@s.whatsapp.net';
    await rpgCommands.craftItem(csock, dmJid, dmJid, ''); // open the menu
    const menuText = csock.sent[0]?.text || '';
    check('craft menu renders with shop layout', /CRAFTING MENU/.test(menuText) && /\*1\./.test(menuText), `${menuText.split('\n')[0]}`);
    check('craft menu has category/rank/search nav line', /craft all · forge · brew · cook/.test(menuText), '');
    check('craft menu footer powers craft-by-number', /craft <#>/.test(menuText), '');
    // craft by number against the remembered list
    const numMatch = /\*(\d+)\.\*/.exec(menuText);
    if (numMatch) {
        csock.sent.length = 0;
        await rpgCommands.craftItem(csock, dmJid, dmJid, numMatch[1]);
        const resp = csock.sent[0]?.text || '';
        check('craft <#> resolves against the shown list', resp.length > 0 && !/No recipe #/.test(resp), resp.slice(0, 60));
    }
    // rank filter view
    csock.sent.length = 0;
    await rpgCommands.craftItem(csock, dmJid, dmJid, 'forge legendary');
    check('craft rank filter view renders', /LEGENDARY|No recipes/.test(csock.sent[0]?.text || ''), '');

    console.log(`\n══════ STRESS+MENU QA: ${results.filter((r) => r.ok).length}/${results.length} passed ══════`);
    const fails = results.filter((r) => !r.ok);
    if (fails.length) { console.log('FAILURES:'); for (const f of fails) console.log(`  ❌ ${f.name} — ${f.detail}`); process.exit(1); }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
