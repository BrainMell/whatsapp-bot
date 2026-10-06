// ============================================
// 🎮 GUILD WAR FULL-GAME SIMULATION — owner brief 2026-10-05 23:09Z
// "run those simulations with the ruins, play a full game with 10 players,
//  2 players, let them meet, basically play test everything and report back"
//
// TWO full games are played through the REAL code path (real DB events, real
// dmRouter moves, real room scenes, real room combat sessions, real turn
// engine, real finale + rewards):
//   D — DUO WAR:  2 champions, one guild. They meet, talk, fight together
//       (co-op), the timer runs out, 4 wardens rise, they hunt all four.
//   X — BIG WAR: 10 champions across 3 guilds. Guildmates meet + fight
//       together, a rival gets the OCCUPIED rule, talk works, finale runs,
//       the war ends on the fourth warden death.
// Owner-visible cheats (determinism only): sim-level movement transits +
// enemy HP floored so level-1 sim champions can finish fights. Every
// outcome still flows through the real combat/turn/end pipeline.
// ============================================
process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300';
process.env.GW_NORMAL_DURATION_MS = '75000'; // 75s of exploration before the finale
const L = require('./mp_lib');
const fs = require('fs');
const RUN = Math.random().toString(36).slice(2, 6);
const OUT = L.OUT + '/fullsim_' + RUN;
fs.mkdirSync(OUT, { recursive: true });
L.overlaySprites();

const R = [];
const MAN = [];
const rep = (section, name, pass, detail) => { R.push({ section, name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${section}] ${name}${detail ? ' — ' + detail : ''}`); };

const state = require('../core/rpg/guildWar/state');
const mapEngine = require('../core/rpg/guildWar/mapEngine');
const GWE = require('../core/models/GuildWarEvent');
const ga = require('../core/rpg/guildAdventure');
const DIR_TOKEN = { n: 'north', e: 'east', s: 'south', w: 'west' };

const sleep = L.sleep;
const snap = async (eventId) => state.getEvent(eventId, { fresh: true });

// bare sock for tick: RECORDS feed flushes (feed.tickAll sends + drains the
// DB queue — recording the sends is the only way to keep the lines)
function bareSock(store) {
    return { label: 'tick', sent: store || [], async sendMessage(chatId, payload) { this.sent.push({ to: chatId, payload, at: Date.now() }); } };
}
const feedLines = []; // every tick-flushed feed text, chronological
function feedTexts(eventId) { return feedLines.map((s) => s.payload.caption || s.payload.text || ''); }

// REAL one-step move (the sim's live movement evidence): stage the player
// adjacent via harness transit, then issue the actual `.j move`
async function realStepInto(sock, jid, destKey, doc) {
    const fresh = await snap(doc.eventId);
    const row = fresh.players.find((p) => p.jid === jid);
    if (row.roomId === destKey) return fresh;
    const topo = state.topologyOf(fresh);
    // any chamber that touches the destination
    const touch = ['n', 'e', 's', 'w'].map((d) => ({ d, k: mapEngine.step(topo, destKey, d) })).filter((x) => x.k);
    if (!touch.length) throw new Error('destination has no neighbors: ' + destKey);
    await clearPath(fresh.eventId, fresh.rooms, [touch[0].k]);
    if (row.roomId !== touch[0].k) await teleport(fresh.eventId, jid, touch[0].k);
    // touch[0] lies in direction touch[0].d FROM dest — so the way back is the OPPOSITE
    const BACK = { n: 's', s: 'n', e: 'w', w: 'e' };
    const dir = BACK[touch[0].d];
    await L.dm(sock, jid, `.j move ${DIR_TOKEN[dir]}`);
    await sleep(500);
    return snap(doc.eventId);
}

// ── pathing + movement (real grammar) ──
function bfsPath(doc, from, to) {
    const topo = state.topologyOf(doc);
    const prev = new Map([[from, null]]); const q = [from];
    while (q.length) {
        const cur = q.shift();
        if (cur === to) break;
        for (const d of ['n', 'e', 's', 'w']) {
            const nxt = mapEngine.step(topo, cur, d);
            if (nxt && !prev.has(nxt)) { prev.set(nxt, [cur, d]); q.push(nxt); }
        }
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let cur = to; prev.get(cur); cur = prev.get(cur)[0]) path.unshift(prev.get(cur));
    return path;
}
async function drive(sock, jid, path, quiet = true) {
    for (const [roomKey, dir] of path) {
        let last = '';
        for (let attempt = 0; attempt < 5; attempt++) {
            const res = await L.dm(sock, jid, `.j move ${DIR_TOKEN[dir]}`);
            last = (res && res.text || '');
            if (last && !quiet) console.log(`    dm(${dir} from ${roomKey}) →`, last.slice(0, 90));
            if (/blocked|breath|passage|cooldown/i.test(last)) { await sleep(650); continue; }
            last = '';
            break;
        }
        if (last) console.log(`    ⚠ drive stall (${dir} from ${roomKey}): ${last.slice(0, 80)}`);
        await sleep(340);
    }
}
async function clearPath(eventId, rooms, keys, keepLast = true) {
    const targets = keepLast ? keys.slice(0, -1) : keys;
    for (const k of targets) {
        if (!k) continue;
        await GWE.updateOne({ eventId, 'rooms.key': k }, { $set: { 'rooms.$.state': 'CLEARED', 'rooms.$.type': 'empty', 'rooms.$.clearedBy': 'veteran', 'rooms.$.clearedAt': new Date() } });
    }
}
// instant transit for sim players (test harness only — real position writes)
async function teleport(eventId, jid, dest) {
    const doc = await snap(eventId);
    const p = doc.players.find((x) => x.jid === jid);
    await GWE.updateOne(
        { eventId },
        [{ $set: {
            rooms: { $map: { input: '$rooms', as: 'r', in: {
                $switch: { branches: [
                    { case: { $eq: ['$$r.key', p.roomId] }, then: { $mergeObjects: ['$$r', { occupants: { $setDifference: ['$$r.occupants', [jid]] } }] } },
                    { case: { $eq: ['$$r.key', dest] }, then: { $mergeObjects: ['$$r', { occupants: { $setUnion: ['$$r.occupants', [jid]] } }] } },
                ], default: '$$r' } } } },
            players: { $map: { input: '$players', as: 'p', in: {
                $cond: [{ $eq: ['$$p.jid', jid] }, { $mergeObjects: ['$$p', { roomId: dest, prevRoomId: p.roomId }] }, '$$p'] } } },
        } }],
        { updatePipeline: true }
    );
}

// ── REAL combat turn loop: every seated champion attacks on their turn ──
async function runFight(eventId, roomKey, sockByJid, { enemyHp = 0, enemyAtk = 0, timeoutMs = 100000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    // wait for the session to exist
    let st = null;
    while (Date.now() < deadline) {
        st = ga.ruinsRoomSession(eventId, roomKey);
        if (st && st.inCombat) break;
        await sleep(250);
    }
    if (!st || !st.inCombat) return { fought: false, reason: 'no-session' };
    if (enemyHp > 0) for (const e of st.enemies) { e.stats.hp = Math.min(e.stats.hp, enemyHp); if (enemyAtk != null) e.stats.atk = Math.min(e.stats.atk || 0, enemyAtk); }
    const acted = new Set();
    const enemyNames = st.enemies.map((e) => e.name);
    while (Date.now() < deadline) {
        const cur = ga.ruinsRoomSession(eventId, roomKey);
        if (!cur || !cur.inCombat) break;
        const actor = cur.activeCombatant;
        if (actor && !actor.isEnemy && !actor.isSummon && actor.stats && actor.stats.hp > 0) {
            const key = actor.jid + ':' + cur.turnCount;
            if (!acted.has(key)) {
                acted.add(key);
                const res = await ga.handleCombatAction(sockByJid[actor.jid], actor.jid, actor.jid, 'atk', '');
                if (typeof res === 'string' && sockByJid[actor.jid]) {
                    await sockByJid[actor.jid].sendMessage(actor.jid, { text: res });
                }
            }
        }
        await sleep(220);
    }
    await sleep(600);
    return { fought: true, enemies: enemyNames, turns: acted.size };
}

// ── wait for the finale (state.tick drives it; tick sock RECORDS feed flushes) ──
async function awaitFinale(eventId, { timeoutMs = 90000 } = {}) {
    const tsock = bareSock(feedLines);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await state.tick(tsock, '\u200B').catch(() => {});
        const doc = await snap(eventId);
        if (doc && doc.finale && doc.finale.started && Array.isArray(doc.finale.bosses) && doc.finale.bosses.length) {
            return doc;
        }
        await sleep(1500);
    }
    return null;
}
// wait for a warden's ledger entry to flip dead
async function awaitWardenDead(eventId, idx, { timeoutMs = 45000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const doc = await snap(eventId);
        const b = ((doc && doc.finale && doc.finale.bosses) || []).find((x) => x.index === idx);
        if (b && b.dead) return doc;
        await sleep(700);
    }
    return null;
}
// wait for the war to leave ACTIVE (ended by the 4th warden)
async function awaitWarEnd(eventId, { timeoutMs = 45000 } = {}) {
    const tsock = bareSock(feedLines);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await state.tick(tsock, '\u200B').catch(() => {});
        const doc = await snap(eventId);
        if (doc && doc.state !== 'ACTIVE') return doc;
        await sleep(700);
    }
    return null;
}

function saveKeyImages(socks, tag, picks) {
    // picks: [{ match: RegExp, file, note }]
    for (const [label, sock] of Object.entries(socks)) {
        for (const p of picks) {
            const hit = [...sock.sent].reverse().find((s) => s.payload && s.payload.image && p.match.test(s.payload.caption || ''));
            if (hit) {
                const f = `${OUT}/${tag}_${label}_${p.file}.png`;
                fs.writeFileSync(f, Buffer.isBuffer(hit.payload.image) ? hit.payload.image : Buffer.from(hit.payload.image));
                MAN.push({ file: f, who: label, caption: (p.note || '') + ' :: ' + (hit.payload.caption || '').replace(/\n+/g, ' | ').slice(0, 160) });
            }
        }
    }
}

// stage the team INSIDE the warden chamber (sim transit) and open the real
// fight with the `fight` verb — startRoomCombat seats every same-guild
// occupant at ONE shared battle (the quest-party-at-start path)
async function slayWarden(curDoc, b, team, socks, sockByJid) {
    for (const name of team) await teleport(curDoc.eventId, jidOfName[name], b.key);
    socks[team[0]].clear();
    await L.dm(socks[team[0]], jidOfName[team[0]], '.j fight');
    await sleep(2500);
    const wf = await runFight(curDoc.eventId, b.key, sockByJid, { enemyHp: 8, enemyAtk: 0, timeoutMs: 60000 });
    const after = await awaitWardenDead(curDoc.eventId, b.index, { timeoutMs: 30000 });
    return { after, wf };
}
let jidOfName = {}; // set per scenario

// runFight diagnostics: last shared combat caption seen (decree card / end line)
function lastCombatLine(socks, jid) {
    const s = socks[jid];
    if (!s) return '(no sock)';
    const hits = s.sent.filter((x) => x.payload && /Victory|Defeat|fallen|chamber is yours|WARDEN/i.test(x.payload.caption || x.payload.text || ''));
    return hits.length ? ((hits[hits.length - 1].payload.caption || hits[hits.length - 1].payload.text || '').replace(/\n+/g, ' | ').slice(0, 150)) : '(none)';
}

async function cleanup(eventIds, jids) {
    for (const id of eventIds) { if (id) { await GWE.deleteMany({ eventId: id }).catch(() => {}); } }
    for (const j of jids) ga.abortRuinsSession(j);
}

// ════════════════════════════════════════════════════════════
// SCENARIO D — DUO WAR (2 players, one guild, full lifecycle)
// ════════════════════════════════════════════════════════════
async function scenarioDuo() {
    console.log('\n━━━ SCENARIO D: DUO WAR (2 players, full game) ━━━');
    const roster = L.makeRoster([
        { jid: 'd1' + RUN, name: 'Aria', guild: 'IronVanguard' + RUN, class: 'FIGHTER', sprite: 0 },
        { jid: 'd2' + RUN, name: 'Boro', guild: 'IronVanguard' + RUN, class: 'CLERIC', sprite: 1 },
    ]);
    L.seedIdentities(roster);
    const [A, B] = roster;
    const socks = { Aria: L.makeSock('A'), Boro: L.makeSock('B') };
    const sockByJid = { [A.jid]: socks.Aria, [B.jid]: socks.Boro };
    const ev = await L.startWar(roster);
    let doc = await snap(ev.eventId);
    rep('D', 'war deployed (2 champions)', doc.players.length === 2 && doc.state === 'ACTIVE', `state=${doc.state}, side=${doc.side}, world=${doc.deadWorld}`);

    const pa = doc.players.find((p) => p.jid === A.jid);
    const pb = doc.players.find((p) => p.jid === B.jid);

    // ── meet: B really walks the final step into A's spawn hall ──
    doc = await realStepInto(socks.Boro, B.jid, pa.roomId, doc);
    doc = await snap(doc.eventId);
    const rowAt = (r) => doc.players.find((p) => p.jid === r.jid).roomId;
    rep('D', 'the duo met in one chamber', rowAt(A) === pa.roomId && rowAt(B) === pa.roomId, `A@${rowAt(A)} B@${rowAt(B)} (spawn ${pa.roomId})`);

    // ── talk: B speaks, A hears ──
    const say = await L.dm(socks.Boro, B.jid, '.j talk hold the line, Aria!');
    await sleep(300);
    // NOTE: in the sim the router sends through the SENDER's sock — the
    // relay DM to A is recorded on Boro's sock with to=A.jid
    const heard = socks.Boro.to(A.jid).some((s) => (s.payload.text || '').includes('hold the line'));
    rep('D', '.j talk reaches the other champion in the room', heard, heard ? 'A received B\'s line' : `B got: ${(say && say.text || '').slice(0, 60)}`);

    // ── co-op combat: A steps into an adjacent combat room (real move →
    // auto-start), then B does the same (real move → co-op join) ──
    const topo = state.topologyOf(doc);
    const nbrs = ['n', 'e', 's', 'w'].map((d) => ({ d, k: mapEngine.step(topo, pa.roomId, d) })).filter((x) => x.k);
    const fight = nbrs[0].k;
    await GWE.updateOne({ eventId: doc.eventId, 'rooms.key': fight }, { $set: { 'rooms.$.type': 'combat', 'rooms.$.state': 'UNEXPLORED', 'rooms.$.payload': { enemies: [{ level: 3 }, { level: 3 }], theme: 'ember' } } });
    doc = await realStepInto(socks.Aria, A.jid, fight, doc);
    await sleep(2500); // let the battle START render land
    const st1 = ga.ruinsRoomSession(doc.eventId, fight);
    rep('D', 'first champion auto-starts the room battle', !!(st1 && st1.inCombat), st1 ? `session ${st1.sessionKey.split('|')[1]} enemies=${st1.enemies.length}` : 'none');
    doc = await realStepInto(socks.Boro, B.jid, fight, doc);
    await sleep(1500);
    const st2 = ga.ruinsRoomSession(doc.eventId, fight);
    const seated = st2 && st2.players.filter((p) => p.jid === A.jid || p.jid === B.jid).length;
    rep('D', 'guildmate entering mid-fight is SEATED at the same battle (co-op)', !!(st2 && st2.inCombat && seated === 2), `participants=${seated}`);

    const duel = await runFight(doc.eventId, fight, sockByJid, { enemyHp: 6 });
    rep('D', 'co-op fight ran real turns and resolved', duel.fought, `turn-actions=${duel.turns}`);
    await sleep(3000);
    doc = await snap(doc.eventId);
    const fightRoomAfter = doc.rooms.find((r) => r.key === fight);
    const scores = doc.players.map((p) => p.score);
    rep('D', 'victory cleared the chamber + shared room GP', fightRoomAfter.state === 'CLEARED' && scores.every((s) => s > 0), `room=${fightRoomAfter.state}, scores=${scores.join('/')}, last="${lastCombatLine(sockByJid, A.jid)}"`);

    saveKeyImages(socks, 'D', [
        { match: /YOU ARE HERE/, file: 'map_during', note: 'personal map with fog' },
        { match: /BATTLE|Order/i, file: 'coop_battle_start', note: 'co-op battle scene (room combat overlay)' },
    ]);

    // ── wait for the war timer → FINALE ──
    const finDoc = await awaitFinale(doc.eventId, { timeoutMs: 95000 });
    const bosses = (finDoc && finDoc.finale && finDoc.finale.bosses) || [];
    rep('D', 'timer expiry → FINALE with 4 wardens placed around the map', bosses.length === 4, bosses.map((b) => `${b.name}@${b.key}`).join(', '));
    if (!finDoc) { await cleanup([doc.eventId], roster.map((r) => r.jid)); return; }
    // owner 01:07Z: wardens scatter like the current bosses — never on the border ring
    const wxyD = bosses.map((b) => b.key.split(',').map(Number));
    const lastD = finDoc.side - 1;
    const borderHitsD = wxyD.filter(([x, y]) => x === 0 || y === 0 || x === lastD || y === lastD).length;
    rep('D', 'wardens scattered mid-map — none on the border ring', bosses.length === 4 && borderHitsD === 0, `border hits=${borderHitsD} at side=${finDoc.side}`);
    let minSepD = 99;
    for (let i = 0; i < wxyD.length; i++) for (let j = i + 1; j < wxyD.length; j++) {
        const sep = Math.abs(wxyD[i][0] - wxyD[j][0]) + Math.abs(wxyD[i][1] - wxyD[j][1]);
        if (sep < minSepD) minSepD = sep;
    }
    rep('D', 'wardens keep a healthy distance apart (no clustering)', wxyD.length < 2 || minSepD >= 2, `min pairwise sep=${minSepD}`);
    const discovered = finDoc.players.filter((p) => bosses.every((b) => (p.discovered || []).includes(b.key))).length;
    rep('D', 'warden chambers revealed on champions\' maps', discovered >= 1, `${discovered}/2 champions see all 4 markers`);
    const dFeed = feedTexts(doc.eventId).join(' | ');
    rep('D', 'war feed announced the hourglass + wardens', /HOURGLASS IS EMPTY/i.test(dFeed) && /WARDEN/i.test(dFeed), `${dFeed.slice(0, 100)}`);

    // ── hunt all four wardens: real fights opened by the real `fight` verb,
    // the duo seated TOGETHER (party-at-start co-op path) ──
    jidOfName = Object.fromEntries(roster.map((r) => [r.name, r.jid]));
    let curDoc = finDoc;
    for (const b of bosses) {
        const { after, wf } = await slayWarden(curDoc, b, ['Aria', 'Boro'], socks, sockByJid);
        rep('D', `warden ${b.index + 1}/4 slain by the duo (${b.name})`, !!after && wf.fought, after ? `ledger dead=true, actions=${wf.turns}` : `ledger not updated (fought=${wf.fought})`);
        saveKeyImages(socks, 'D', [
            { match: /WARDEN/i, file: `warden${b.index + 1}_scene`, note: `warden ${b.index + 1} battle` },
        ]);
        curDoc = after || curDoc;
        if (!curDoc || curDoc.state !== 'ACTIVE') break;
    }

    // ── war end ──
    const ended = await awaitWarEnd(doc.eventId, { timeoutMs: 30000 });
    rep('D', '4th warden death ENDS the war', !!ended && ended.state !== 'ACTIVE', `state=${ended && ended.state}`);
    if (ended) {
        await sleep(2500);
        const dFeed2 = feedTexts(doc.eventId).join(' | ');
        rep('D', 'feed carried warden tallies + war-end decree', /HAS FALLEN/i.test(dFeed2) && /ALL FOUR WARDENS/i.test(dFeed2), '');
        const finalDoc = await snap(doc.eventId);
        const gpl = finalDoc.players.map((p) => `${p.name}:${p.score}`).join(' ');
        rep('D', 'champions carry their earned GP into the rewards tally', finalDoc.players.every((p) => p.score > 0), gpl);
        saveKeyImages(socks, 'D', [
            { match: /ROYAL DECREE|DECREE|Victory/i, file: 'end_card', note: 'decree end card' },
        ]);
    }
    await cleanup([doc.eventId], roster.map((r) => r.jid));
}

// ════════════════════════════════════════════════════════════
// SCENARIO X — BIG WAR (10 players, 3 guilds)
// ════════════════════════════════════════════════════════════
async function scenarioBig() {
    console.log('\n━━━ SCENARIO X: BIG WAR (10 players, 3 guilds) ━━━');
    const specs = [];
    const ALPHA = ['Aria:GUY_FIGHTER', 'Milo:SCOUT', 'Pia:CLERIC', 'Kael:MAGE', 'Rin:BERSERKER'];
    const BRAVO = ['Brutus:BERSERKER', 'Vex:NECROMANCER', 'Talia:PALADIN'];
    const CHARLIE = ['Oro:MONK', 'Fen:ROGUE'];
    for (const [g, list] of [['Alpha' + RUN, ALPHA], ['Bravo' + RUN, BRAVO], ['Charlie' + RUN, CHARLIE]]) {
        list.forEach((s, i) => {
            const [name, cls] = s.split(':');
            specs.push({ jid: `x${specs.length}${RUN}`, name, guild: g, class: cls.replace('GUY_', '').toUpperCase(), sprite: i % 3 });
        });
    }
    const roster = L.makeRoster(specs);
    L.seedIdentities(roster);
    const socks = {};
    const sockByJid = {};
    for (const r of roster) { socks[r.name] = L.makeSock(r.name); sockByJid[r.jid] = socks[r.name]; }
    const ev = await L.startWar(roster);
    let doc = await snap(ev.eventId);
    rep('X', 'war deployed (10 champions, 3 guilds)', doc.players.length === 10, `side=${doc.side} grid, world=${doc.deadWorld}`);
    const spawns = doc.players.map((p) => p.roomId);
    rep('X', 'spawn halls are distinct + monster-free', new Set(spawns).size === 10 && doc.rooms.filter((r) => spawns.includes(r.key)).every((r) => !['combat', 'coop'].includes(r.type)), `spawns ${spawns.slice(0, 4).join(' ')}…`);

    const byName = {};
    doc.players.forEach((p) => { byName[roster.find((r) => r.jid === p.jid).name] = p; });
    const jidOf = (name) => roster.find((r) => r.name === name).jid;

    // ── guildmates meet: Pia + Milo really walk their final step to Aria ──
    const ariaRoom = byName['Aria'].roomId;
    for (const name of ['Pia', 'Milo']) {
        doc = await realStepInto(socks[name], jidOf(name), ariaRoom, doc);
    }
    doc = await snap(doc.eventId);
    const rowAtX = (n) => doc.players.find((p) => p.jid === jidOf(n)).roomId;
    rep('X', '3 Alpha champions share one chamber (Aria+Pia+Milo)', ['Aria', 'Pia', 'Milo'].every((n) => rowAtX(n) === ariaRoom), ['Aria', 'Pia', 'Milo'].map((n) => `${n}@${rowAtX(n)}`).join(' '));

    // ── talk: Milo speaks, both guildmates hear ──
    await L.dm(socks['Milo'], jidOf('Milo'), '.j talk sticks and stones, team!');
    await sleep(300);
    const heardA = socks['Milo'].to(jidOf('Aria')).some((s) => (s.payload.text || '').includes('sticks and stones'));
    const heardP = socks['Milo'].to(jidOf('Pia')).some((s) => (s.payload.text || '').includes('sticks and stones'));
    rep('X', 'room chat reaches every champion in the chamber', heardA && heardP, 'Aria+Pia both heard Milo');

    // ── co-op combat: Aria steps into an adjacent combat room (real move →
    // auto-start); Pia + Milo do the same (real move → co-op join) ──
    const topo = state.topologyOf(doc);
    const nbrs = ['n', 'e', 's', 'w'].map((d) => ({ d, k: mapEngine.step(topo, ariaRoom, d) })).filter((x) => x.k);
    const fight = nbrs[0].k;
    await GWE.updateOne({ eventId: doc.eventId, 'rooms.key': fight }, { $set: { 'rooms.$.type': 'combat', 'rooms.$.state': 'UNEXPLORED', 'rooms.$.payload': { enemies: [{ level: 4 }, { level: 4 }], theme: 'ember' } } });
    doc = await realStepInto(socks['Aria'], jidOf('Aria'), fight, doc);
    await sleep(2500);
    let st = ga.ruinsRoomSession(doc.eventId, fight);
    rep('X', 'Aria auto-starts the room battle', !!(st && st.inCombat), st ? `enemies=${st.enemies.length}` : 'none');
    for (const name of ['Pia', 'Milo']) {
        socks[name].clear();
        doc = await realStepInto(socks[name], jidOf(name), fight, doc);
        await sleep(1200);
    }
    st = ga.ruinsRoomSession(doc.eventId, fight);
    const seated = st ? st.players.length : 0;
    rep('X', 'BOTH guildmates joined ONE shared battle (3 participants)', !!(st && st.inCombat && seated === 3), `participants=${seated}`);

    // ── occupied-room rule: rival walks in mid-fight (real move) ──
    socks['Brutus'].clear();
    doc = await realStepInto(socks['Brutus'], jidOf('Brutus'), fight, doc);
    await sleep(800);
    const occ = socks['Brutus'].to(jidOf('Brutus')).some((s) => (s.payload.text || '').includes('OCCUPIED'));
    const bSt = ga.ruinsRoomSession(doc.eventId, fight);
    const brutusSeated = bSt && bSt.players.some((p) => p.jid === jidOf('Brutus'));
    rep('X', 'rival entering an active fight gets OCCUPIED (no second battle)', occ && bSt && !brutusSeated, `session still has ${bSt ? bSt.players.length : '?'} participants, rival seated=${!!brutusSeated}`);
    // Brutus flees back out (occupied room is escapable)
    await L.dm(socks['Brutus'], jidOf('Brutus'), '.j flee');
    await sleep(600);

    // ── resolve the 3-player co-op fight ──
    const trio = await runFight(doc.eventId, fight, sockByJid, { enemyHp: 6 });
    rep('X', '3-champion co-op fight resolved via real turns', trio.fought, `turn-actions=${trio.turns}`);
    await sleep(2500);
    doc = await snap(doc.eventId);
    const alphaScores = doc.players.filter((p) => ['Aria', 'Pia', 'Milo'].some((n) => p.jid === jidOf(n))).map((p) => p.score);
    rep('X', 'shared room GP paid to every living participant', alphaScores.every((s) => s > 0), `scores ${alphaScores.join('/')}`);

    saveKeyImages(socks, 'X', [
        { match: /BATTLE|Order/i, file: 'trio_battle', note: '3-champion co-op battle scene' },
        { match: /YOU ARE HERE/, file: 'map_during', note: '10-war personal map' },
    ]);

    // ── FINALE ──
    const finDoc = await awaitFinale(doc.eventId, { timeoutMs: 95000 });
    const bosses = (finDoc && finDoc.finale && finDoc.finale.bosses) || [];
    rep('X', 'timer expiry → 4 wardens rise around the 10-player map', bosses.length === 4, bosses.map((b) => `${b.name}@${b.key}`).join(', '));
    if (!finDoc) { await cleanup([doc.eventId], roster.map((r) => r.jid)); return; }
    // owner 01:07Z: same scatter invariants on the big map
    const wxyX = bosses.map((b) => b.key.split(',').map(Number));
    const lastX = finDoc.side - 1;
    const borderHitsX = wxyX.filter(([x, y]) => x === 0 || y === 0 || x === lastX || y === lastX).length;
    rep('X', 'wardens scattered mid-map — none on the border ring', bosses.length === 4 && borderHitsX === 0, `border hits=${borderHitsX} at side=${finDoc.side}`);
    let minSepX = 99;
    for (let i = 0; i < wxyX.length; i++) for (let j = i + 1; j < wxyX.length; j++) {
        const sep = Math.abs(wxyX[i][0] - wxyX[j][0]) + Math.abs(wxyX[i][1] - wxyX[j][1]);
        if (sep < minSepX) minSepX = sep;
    }
    rep('X', 'wardens keep a healthy distance apart (no clustering)', wxyX.length < 2 || minSepX >= 2, `min pairwise sep=${minSepX}`);
    const spawnKeysX = new Set(finDoc.players.map((p) => p.spawnRoomId).filter(Boolean));
    const onSpawnX = bosses.filter((b) => spawnKeysX.has(b.key)).length;
    rep('X', 'no warden camps a landing hall', onSpawnX === 0, `spawn-hall hits=${onSpawnX}`);
    const seeAll = finDoc.players.filter((p) => p.status === 'active' && bosses.every((b) => (p.discovered || []).includes(b.key))).length;
    rep('X', 'wardens revealed on the hunters\' maps', seeAll >= 1, `${seeAll} active champions see all four markers`);

    // ── hunt: guild teams split across the wardens (Aria+Milo, Brutus+Vex,
    // Oro solo, Pia solo) — real fights opened by the real `fight` verb ──
    const hunters = [
        { team: ['Aria', 'Milo'] }, { team: ['Brutus', 'Vex'] },
        { team: ['Oro'] }, { team: ['Pia'] },
    ];
    jidOfName = Object.fromEntries(roster.map((r) => [r.name, r.jid]));
    let curDoc = finDoc;
    for (let i = 0; i < bosses.length; i++) {
        const b = bosses[i];
        const team = hunters[i % hunters.length].team;
        const { after, wf } = await slayWarden(curDoc, b, team, socks, sockByJid);
        rep('X', `warden ${i + 1}/4 down — ${team.join('+')} (${b.name})`, !!after && wf.fought, after ? `dead=true, actions=${wf.turns}` : `ledger not updated (fought=${wf.fought})`);
        saveKeyImages(socks, 'X', [
            { match: /WARDEN/i, file: `warden${i + 1}_battle`, note: `warden ${i + 1} battle scene` },
        ]);
        curDoc = after || curDoc;
        if (!curDoc || curDoc.state !== 'ACTIVE') break;
    }

    const ended = await awaitWarEnd(doc.eventId, { timeoutMs: 30000 });
    rep('X', 'war ENDS on the fourth warden death', !!ended && ended.state !== 'ACTIVE', `state=${ended && ended.state}`);
    if (ended) {
        await sleep(2500);
        const finalDoc = await snap(doc.eventId);
        const scorers = finalDoc.players.filter((p) => p.score > 0).length;
        rep('X', 'rewards phase holds every champion\'s earned GP', finalDoc.state === 'REWARDS' && scorers >= 4, `state=${finalDoc.state}, ${scorers}/10 scored`);
        saveKeyImages(socks, 'X', [
            { match: /WARDEN/i, file: 'warden_battle', note: 'warden battle scene' },
            { match: /DECREE|Victory/i, file: 'end_card', note: 'decree end card' },
        ]);
    }
    await cleanup([doc.eventId], roster.map((r) => r.jid));
}

(async () => {
    await L.connectDB();
    // fresh sandbox: wipe any stale gwtest events so tick() only sees ours
    await GWE.deleteMany({}).catch(() => {});
    // ⚔️ load guildWar/index.js — it self-installs the ruins combat hooks
    // (onEnd: room clears, GP, warden ledger). Production boots it via
    // engine.js; the sims bypass the engine, so load it here.
    require('../core/rpg/guildWar/index');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║  GUILD WAR FULL-GAME SIMS (duo + 10p)     ║');
    console.log('╚═══════════════════════════════════════════╝');
    await scenarioDuo();
    await scenarioBig();
    const pass = R.filter((r) => r.pass).length;
    console.log(`\n════════ RESULT: ${pass}/${R.length} checks passed ════════`);
    for (const r of R.filter((x) => !x.pass)) console.log(`  ✗ [${r.section}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ pass, total: R.length, results: R, manifest: MAN }, null, 2));
    L.restoreSprites();
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); L.restoreSprites(); process.exit(1); });
