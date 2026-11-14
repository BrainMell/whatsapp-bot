'use strict';
// 🏰 CONQUEST ENGINE — pure state machine over one JSON war document (see store.js for persistence).
// Every public op takes (state, args, now) and returns {ok, msg, ...}; it never touches I/O.
const { CFG } = require('./config');
const map = require('./mapgen');
const breach = require('./breach');
const { mulberry32, hashStr } = map;

const uid = (state, p) => `${p}${(state.seq = (state.seq || 0) + 1).toString(36)}`;
const fail = (msg, extra) => Object.assign({ ok: false, msg }, extra);
const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra);
const gmap = (state) => map.generate(state.seed);

// ── setup ────────────────────────────────────────────────────────────────────────────────────
function newWar({ key, seed, guilds, now = Date.now(), hours = 3 }) {
    const state = { v: 0, key, seed: seed >>> 0, status: 'active', startedAt: now, endsAt: now + hours * 3600e3, overlays: {}, guilds: {}, marches: {}, musters: {}, breaches: {}, encounters: {}, players: {}, log: [], seq: 0, lastEco: now, titans: {} };
    const g = gmap(state); const keeps = [...g.tiles.values()].filter((t) => t.kind === 'keep');
    const rng = mulberry32(state.seed ^ 0xBEEF); const order = keeps.map((k) => [rng(), k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    // spread guilds across realms first: pick keeps round-robin by realm
    const byRealm = {}; for (const k of order) (byRealm[k.realm] = byRealm[k.realm] || []).push(k);
    const realms = Object.keys(byRealm); let ri = 0;
    for (const gd of guilds) {
        let k = null; for (let i = 0; i < realms.length && !k; i++) { const r = realms[(ri + i) % realms.length]; k = byRealm[r].shift() || null; } ri++;
        if (!k) break;
        state.guilds[gd.name] = { name: gd.name, keep: k.id, realm: k.realm, writs: CFG.WRIT_START, supplies: 60, treasury: 0, skyfalls: CFG.SKYFALL_PER_WAR, roles: gd.roles || {}, orders: {}, orderHour: 0, score: 0, tiles: [k.id], research: {}, pacts: {}, log: [] };
        state.overlays[k.id] = { owner: gd.name, claimedAt: now, shieldUntil: now + CFG.TILE_SHIELD_SEC * 1000, wall: { type: 'stone', hp: CFG.WALL_BASE_HP.stone, max: CFG.WALL_BASE_HP.stone }, golems: [{ id: 'g0', kind: 'clay', lvl: 1 }, { id: 'g1', kind: 'clay', lvl: 1 }], turrets: [{ id: 't0', kind: 'ballista', lvl: 1 }], buffs: {} };
        for (const jid of gd.members || []) registerPlayer(state, gd.name, jid, null, 400, k.id);
    }
    return state;
}
function registerPlayer(state, guild, jid, name, power, at) {
    const p = state.players[jid] || (state.players[jid] = { jid, status: 'idle', carried: 0, banked: 0, orders: [], auto: false });
    p.guild = guild; p.name = name || p.name || String(jid).split('@')[0]; p.power = Math.max(1, Number(power) || p.power || 100);
    if (at || !p.at) p.at = at || (state.guilds[guild] && state.guilds[guild].keep); return p;
}
const roleOf = (state, guild, jid) => ((state.guilds[guild] || {}).roles || {})[jid] || 'member';
const isLeader = (state, guild, jid) => ['master', 'officer'].includes(roleOf(state, guild, jid));

// ── tiles ────────────────────────────────────────────────────────────────────────────────────
function view(state, id) {
    const t = gmap(state).tiles.get(id); if (!t) return null; const o = state.overlays[id] || {};
    const d = t.defaults || { wall: null, golems: [], turrets: [] };
    const owner = o.owner || null;
    const wall = 'wall' in o ? o.wall : (owner ? null : (d.wall ? { type: d.wall.type, hp: d.wall.hp, max: d.wall.hp } : null));
    const golems = o.golems || (owner ? [] : d.golems.map((g, i) => ({ id: 'n' + i, kind: g.kind, lvl: g.lvl || 1 })));
    const turrets = o.turrets || (owner ? [] : d.turrets.map((x, i) => ({ id: 'nt' + i, kind: x.kind, lvl: x.lvl || 1 })));
    const veinLeft = t.vein ? (o.veinLeft == null ? t.vein : o.veinLeft) : 0;
    return { ...t, owner, claimedAt: o.claimedAt || 0, shieldUntil: o.shieldUntil || 0, restUntil: o.restUntil || 0, wall, golems, turrets, buffs: o.buffs || {}, veinLeft, held: !!o.held };
}
function ov(state, id) { return state.overlays[id] || (state.overlays[id] = {}); }
const hasDefence = (v) => (v.wall && v.wall.hp > 0) || v.golems.length > 0 || v.turrets.length > 0;
function ownedBy(state, guild) { return state.guilds[guild] ? state.guilds[guild].tiles : []; }
function frontier(state, guild) { // tiles a guild may march against without teleport
    const g = gmap(state); const own = new Set(ownedBy(state, guild)); const out = new Set();
    for (const id of own) for (const n of map.neighbors(g, id)) if (!own.has(n)) out.add(n);
    return out;
}
const power = (state, jids) => jids.reduce((s, j) => s + ((state.players[j] || {}).power || 0), 0);
/** rough recommended power for a tile so leaders get a warning rather than a blind send */
function threat(state, id) { const v = view(state, id); let t = 0; if (v.wall) t += v.wall.hp * 0.8; for (const g of v.golems) t += (CFG.GOLEM_BASE[g.kind] || CFG.GOLEM_BASE.clay).hp * 1.2; t += v.turrets.length * 120; if (v.kind === 'titan') t += 6000; return Math.round(t * 1.5); }

// ── orders & budgets ─────────────────────────────────────────────────────────────────────────
function spendOrder(state, guild, jid, now) {
    const g = state.guilds[guild]; const role = roleOf(state, guild, jid); if (role === 'member') return fail('Only the guild master or officers can give orders.');
    const hour = Math.floor(now / 3600e3); if (g.orderHour !== hour) { g.orderHour = hour; g.orders = {}; }
    const cap = role === 'master' ? CFG.ORDER_BUDGET_MASTER : CFG.ORDER_BUDGET_OFFICER;
    if ((g.orders[jid] || 0) >= cap) return fail(`Order budget spent (${cap}/hr). Wait for the next hour or ask the master.`);
    g.orders[jid] = (g.orders[jid] || 0) + 1; return null;
}
const travelSec = (d) => Math.max(CFG.MARCH_MIN_SEC, Math.min(CFG.MARCH_MAX_SEC, d * CFG.MARCH_SEC_PER_TILE));
const locked = (state, jid) => { const p = state.players[jid]; return !!p && (p.status === 'transit' || p.status === 'breach'); };
function validTarget(state, guild, to) {
    const v = view(state, to); if (!v) return fail('Unknown tile.');
    if (v.owner === guild) return fail('You already hold that tile.');
    if (!frontier(state, guild).has(to) && !ownedGateHop(state, guild, to)) return fail('Out of reach — march against a tile bordering your territory, or use a Ley Gate / War Writ.');
    if (v.owner && v.shieldUntil > Date.now()) return fail('That tile was just conquered and is shielded for a few minutes.');
    if (v.restUntil > Date.now()) return fail('That garrison is still shaken from the last assault — try again shortly.');
    return null;
}
function ownedGateHop(state, guild, to) { const v = view(state, to); if (!v || v.kind !== 'ley_gate') return false; return ownedBy(state, guild).some((id) => id !== to && view(state, id).kind === 'ley_gate' && map.parse(id).realm === v.realm); }
function startMarch(state, { guild, jids, to, type, by, now }) {
    const from = (state.players[jids[0]] || {}).at || state.guilds[guild].keep;
    const d = map.distance(gmap(state), from, to); const dist = Number.isFinite(d) ? d : 40;
    const id = uid(state, 'M'); const sec = travelSec(dist);
    const m = state.marches[id] = { id, guild, type, by, members: jids.slice(), from, to, depart: now, arrive: now + sec * 1000, status: 'marching', dist };
    for (const j of jids) { const p = state.players[j]; p.status = 'transit'; p.marchId = id; }
    return m;
}
function marchSolo(state, { guild, by, to, now = Date.now() }) {
    const p = state.players[by]; if (!p || p.guild !== guild) return fail('You are not in this war.');
    if (locked(state, by)) return fail('You are already on the move or in a fight.');
    const e = spendOrder(state, guild, by, now); if (e) return e; const bad = validTarget(state, guild, to); if (bad) { refund(state, guild, by); return bad; }
    const m = startMarch(state, { guild, jids: [by], to, type: 'solo', by, now });
    const th = threat(state, to); const warn = p.power < th * 0.5 ? ` ⚠️ Strong garrison (recommended power ~${th}).` : '';
    return ok(`🚩 Marching to *${view(state, to).name}* (${m.dist} tiles, arrive in ${Math.round((m.arrive - now) / 1000)}s).${warn}`, { march: m });
}
function refund(state, guild, jid) { const g = state.guilds[guild]; if (g.orders[jid]) g.orders[jid] -= 1; }
/** master/officer sends solo players; those with auto-accept go at once, others get an order to accept */
function detach(state, { guild, by, targets, to, now = Date.now() }) {
    if (!isLeader(state, guild, by)) return fail('Only the guild master or officers can send detachments.');
    targets = [...new Set(targets)].slice(0, CFG.DETACH_MAX_PER_ORDER); if (!targets.length) return fail('Name who to send.');
    const e = spendOrder(state, guild, by, now); if (e) return e; const bad = validTarget(state, guild, to); if (bad) { refund(state, guild, by); return bad; }
    const sent = [], offered = [], skipped = [];
    for (const j of targets) { const p = state.players[j]; if (!p || p.guild !== guild) { skipped.push(j); continue; } if (locked(state, j)) { skipped.push(j); continue; }
        if (p.auto) { startMarch(state, { guild, jids: [j], to, type: 'detach', by, now }); sent.push(j); } else { p.orders = (p.orders || []).filter((o) => o.exp > now).concat([{ id: uid(state, 'O'), to, by, exp: now + 180e3, tileName: view(state, to).name }]).slice(-3); offered.push(j); } }
    return ok(`📨 ${sent.length} marching, ${offered.length} awaiting acceptance${skipped.length ? `, ${skipped.length} unavailable` : ''}.`, { sent, offered, skipped });
}
function acceptOrder(state, { guild, jid, now = Date.now() }) {
    const p = state.players[jid]; if (!p) return fail('Not in this war.'); const o = (p.orders || []).filter((x) => x.exp > now).pop(); if (!o) return fail('No pending orders.');
    if (locked(state, jid)) return fail('Finish what you are doing first.'); const bad = validTarget(state, guild, o.to); if (bad) { p.orders = []; return bad; }
    p.orders = []; const m = startMarch(state, { guild, jids: [jid], to: o.to, type: 'detach', by: o.by, now }); return ok(`🚩 Marching to *${o.tileName}* (${Math.round((m.arrive - now) / 1000)}s).`, { march: m });
}
function declineOrder(state, { jid }) { const p = state.players[jid]; if (p) p.orders = []; return ok('Order declined.'); }
function setAuto(state, { jid, on }) { const p = state.players[jid]; if (!p) return fail('Not in this war.'); p.auto = !!on; return ok(`Auto-accept orders: ${p.auto ? 'ON (you will march at once when sent)' : 'OFF'}.`); }

// muster: bigger areas, together
function openMuster(state, { guild, by, to, now = Date.now() }) {
    if (!isLeader(state, guild, by)) return fail('Only the guild master or officers can call a muster.'); if (locked(state, by)) return fail('You are busy.');
    const e = spendOrder(state, guild, by, now); if (e) return e; const bad = validTarget(state, guild, to); if (bad) { refund(state, guild, by); return bad; }
    const id = uid(state, 'U'); state.musters[id] = { id, guild, leader: by, to, members: [by], closes: now + CFG.MUSTER_WINDOW_SEC * 1000 };
    return ok(`📯 Muster called for *${view(state, to).name}*! Members: reply \`join\` within ${CFG.MUSTER_WINDOW_SEC}s (need ${CFG.MUSTER_MIN}+). Leader: \`launch\`.`, { muster: state.musters[id] });
}
const musterOf = (state, guild) => Object.values(state.musters).find((m) => m.guild === guild);
function joinMuster(state, { guild, jid, now = Date.now() }) {
    const m = musterOf(state, guild); if (!m || m.closes < now) return fail('No open muster.'); const p = state.players[jid]; if (!p || p.guild !== guild) return fail('Not in this war.');
    if (locked(state, jid)) return fail('You are busy.'); if (m.members.includes(jid)) return fail('Already in the muster.'); if (m.members.length >= CFG.MUSTER_MAX) return fail('The muster is full.');
    m.members.push(jid); return ok(`🛡️ Joined the muster (${m.members.length}/${CFG.MUSTER_MAX}).`, { muster: m });
}
function launchMuster(state, { guild, by, now = Date.now() }) {
    const m = musterOf(state, guild); if (!m) return fail('No open muster.'); if (m.leader !== by && roleOf(state, guild, by) !== 'master') return fail('Only the muster leader can launch.');
    const mem = m.members.filter((j) => !locked(state, j)); if (mem.length < CFG.MUSTER_MIN) return fail(`Need at least ${CFG.MUSTER_MIN} members.`);
    const bad = validTarget(state, guild, m.to); if (bad) { delete state.musters[m.id]; return bad; }
    delete state.musters[m.id]; const march = startMarch(state, { guild, jids: mem, to: m.to, type: 'muster', by, now });
    return ok(`⚔️ Muster of ${mem.length} marches on *${view(state, m.to).name}* — arrive in ${Math.round((march.arrive - now) / 1000)}s. Combined power ${power(state, mem)}.`, { march });
}
function recall(state, { guild, by, marchId }) {
    const m = state.marches[marchId] || Object.values(state.marches).find((x) => x.guild === guild && x.members.includes(by) && x.status === 'marching'); if (!m || m.guild !== guild) return fail('No such march.');
    if (!(m.members.includes(by) || isLeader(state, guild, by))) return fail('Not your march.'); if (m.status !== 'marching') return fail('They have already arrived.');
    for (const j of m.members) { const p = state.players[j]; p.status = 'idle'; p.marchId = null; } m.status = 'recalled'; delete state.marches[m.id]; return ok('📯 Recalled — the claim is forfeited.');
}

// ── War Writs: teleport sacrifice ───────────────────────────────────────────────────────────
function writCost(state, guild, jids, to) {
    const g = gmap(state); const from = state.guilds[guild].keep; const d = map.distance(g, from, to); const dist = Number.isFinite(d) ? d : 25;
    return CFG.WRIT_COST_BASE + Math.floor(dist / 5) * CFG.WRIT_COST_PER_5_TILES + Math.floor((jids.length - 1) / 3) * CFG.WRIT_COST_PER_3_HEADS;
}
/** the master spends War Writs to snap engaged (in other fights/transit) members onto a front-line tile */
function teleport(state, { guild, by, jids, to, skyfall = false, now = Date.now() }) {
    if (roleOf(state, guild, by) !== 'master') return fail('Only the guild master can spend War Writs.');
    const gd = state.guilds[guild]; const bad = validTarget(state, guild, to); if (bad && !skyfall) return bad; if (skyfall && !view(state, to)) return fail('Unknown tile.');
    const crew = jids.filter((j) => state.players[j] && state.players[j].guild === guild && state.players[j].status !== 'breach'); if (!crew.length) return fail('Nobody eligible to teleport.');
    if (!skyfall && !(ownedGateHop(state, guild, to) || frontier(state, guild).has(to))) return fail('Writs only reach held Ley Gates or one tile past your border (use Skyfall for deep strikes).');
    const cost = skyfall ? CFG.SKYFALL_COST : writCost(state, guild, crew, to);
    if (skyfall && gd.skyfalls <= 0) return fail('Your Skyfall for this war is spent.'); if (gd.writs < cost) return fail(`Need ${cost} War Writs (you have ${gd.writs}).`);
    gd.writs -= cost; if (skyfall) gd.skyfalls -= 1;
    for (const j of crew) { const p = state.players[j]; if (p.marchId && state.marches[p.marchId]) { const mm = state.marches[p.marchId]; mm.members = mm.members.filter((x) => x !== j); if (!mm.members.length) delete state.marches[mm.id]; } p.status = 'idle'; p.marchId = null; }
    const m = startMarch(state, { guild, jids: crew, to, type: skyfall ? 'skyfall' : 'teleport', by, now }); m.arrive = now + 8000; m.dist = 0;
    return ok(`✨ ${skyfall ? '☄️ SKYFALL' : 'War Writ'}: ${crew.length} warriors blink toward *${view(state, to).name}* (−${cost} writs, ${gd.writs} left).`, { march: m, cost });
}

// ── arrival & encounters ────────────────────────────────────────────────────────────────────
function tick(state, now = Date.now(), events = []) {
    for (const m of Object.values(state.marches)) if (m.status === 'marching' && now >= m.arrive) arrive(state, m, now, events);
    for (const b of Object.values(state.breaches)) if (!b.outcome && (breach.allSubmitted(b) || breach.due(b, now))) { const r = breach.resolveRound(b); events.push({ type: 'breach_round', id: b.id, lines: r.lines, guild: b.attacker }); if (b.outcome) finishBreach(state, b, now, events); else breach.startRound(b, now); }
    for (const e of Object.values(state.encounters)) if (e.exp && now >= e.exp) { ov(state, e.tile).restUntil = now + 60e3; endEncounter(state, e); events.push({ type: 'encounter_expired', guild: e.guild, tile: e.tile }); }
    for (const [id, mu] of Object.entries(state.musters)) if (mu.closes < now - 600e3) delete state.musters[id];
    economy(state, now, events);
    if (state.status === 'active' && now >= state.endsAt) { state.status = 'ended'; events.push({ type: 'war_end', standings: standings(state) }); }
    return events;
}
function arrive(state, m, now, events) {
    m.status = 'arrived'; const v = view(state, m.to); const guild = m.guild;
    for (const j of m.members) { const p = state.players[j]; p.at = m.to; p.marchId = null; p.status = 'idle'; }
    delete state.marches[m.id];
    if (v.owner === guild) { events.push({ type: 'reinforce', guild, tile: m.to }); return; }
    if (v.owner && v.shieldUntil > now) { events.push({ type: 'bounced', guild, tile: m.to }); return; }
    const kind = v.claim = require('./mapgen').KINDS[v.kind].claim;
    if (hasDefence(v) || kind === 'siege' || kind === 'titan') return startBreach(state, m, v, now, events);
    if (kind === 'ritual') return startRitual(state, m, v, now, events);
    if (kind === 'treaty') return startTreaty(state, m, v, now, events);
    claimTile(state, guild, m.to, now); events.push({ type: 'claimed', guild, tile: m.to, by: m.members });
}
function titanDefence(state, v) { const lv = 3 + Math.floor(map.hashStr(v.realm) % 3); return { wall: null, golems: [{ kind: 'iron', lvl: lv }, { kind: 'rune', lvl: lv }, { kind: 'iron', lvl: lv }], turrets: [], buffs: { atk: 0.1, hp: 0.4 } }; }
function startBreach(state, m, v, now, events) {
    const def = v.kind === 'titan' && !v.owner ? titanDefence(state, v) : { wall: v.wall ? { type: v.wall.type, hp: v.wall.hp, max: v.wall.max || v.wall.hp } : null, golems: v.golems, turrets: v.turrets, buffs: v.buffs };
    const id = uid(state, 'B'); const b = breach.create({ id, tileId: v.id, biome: v.biome, tileName: v.name, attacker: m.guild, defender: v.owner, party: m.members.map((j) => ({ jid: j, name: state.players[j].name, power: state.players[j].power, sprite: state.players[j].sprite })), defence: def, now, isTitan: v.kind === 'titan' });
    b.kind = v.kind; const gi = (n) => n ? Math.abs(map.hashStr(n)) % 4 : -1; b.defIdx = gi(v.owner); b.attIdx = gi(m.guild);
    b.surround = {}; for (const n of map.neighbors(gmap(state), v.id) || []) { const k = (view(state, n) || {}).kind; if (k) b.surround[k] = (b.surround[k] || 0) + 1; }
    state.breaches[id] = b; for (const j of m.members) { const p = state.players[j]; p.status = 'breach'; p.breachId = id; }
    if (b.outcome) return finishBreach(state, b, now, events); breach.startRound(b, now); events.push({ type: 'breach_start', id, guild: m.guild, tile: v.id, defender: v.owner });
}
function finishBreach(state, b, now, events) {
    for (const j of Object.keys(b.party)) { const p = state.players[j]; p.status = 'idle'; p.breachId = null; if (b.outcome === 'lost') { const lost = Math.floor((p.carried || 0) * CFG.GEM_DROP_ON_DEFEAT); p.carried -= lost; } }
    const o = ov(state, b.tileId);
    if (b.outcome === 'won') { claimTile(state, b.attacker, b.tileId, now); events.push({ type: 'claimed', guild: b.attacker, tile: b.tileId, by: Object.keys(b.party), breach: b.id }); if (b.tileId && view(state, b.tileId).kind === 'titan') titanSlain(state, b, events); }
    else { o.restUntil = now + CFG.CLAIM_ATTACK_COOLDOWN_SEC * 1000; const rem = breach.wallRemaining(b); if (b.wallType && !o.owner) { o.wall = { type: b.wallType, hp: rem, max: (view(state, b.tileId).wall || { max: rem }).max || rem }; o.golems = view(state, b.tileId).golems; o.turrets = view(state, b.tileId).turrets; } else if (b.wallType && o.owner && o.wall) o.wall.hp = Math.max(1, rem); events.push({ type: 'repelled', guild: b.attacker, tile: b.tileId, defender: b.defender, breach: b.id }); }
    delete state.breaches[b.id];
}
function titanSlain(state, b, events) { state.titans[b.tileId] = { by: b.attacker, at: Date.now() }; const g = state.guilds[b.attacker]; g.writs += 4; g.supplies += 120; g.treasury += 200; events.push({ type: 'titan_slain', guild: b.attacker, tile: b.tileId }); }
function claimTile(state, guild, id, now) {
    const o = ov(state, id); const prev = o.owner; const g = state.guilds[guild]; const v = view(state, id);
    if (prev && state.guilds[prev]) state.guilds[prev].tiles = state.guilds[prev].tiles.filter((t) => t !== id);
    o.owner = guild; o.claimedAt = now; o.shieldUntil = now + CFG.TILE_SHIELD_SEC * 1000; o.wall = null; o.golems = []; o.turrets = []; o.buffs = {}; o.restUntil = 0;
    if (v.vein && o.veinLeft == null) o.veinLeft = v.vein;
    if (!g.tiles.includes(id)) g.tiles.push(id); return o;
}

// ── rituals (puzzle claim) & treaties ───────────────────────────────────────────────────────
const GLYPHS = ['☀', '☾', '✦', '❄', '🔥', '🌊', '🌿', '⚡'];
function startRitual(state, m, v, now, events) {
    const rng = mulberry32(hashStr(v.id + ':' + m.id + ':ritual')); const n = 4; const seq = []; while (seq.length < n) { const gph = GLYPHS[Math.floor(rng() * GLYPHS.length)]; if (!seq.includes(gph)) seq.push(gph); }
    const id = uid(state, 'R'); state.encounters[id] = { id, type: 'ritual', tile: v.id, guild: m.guild, members: m.members.slice(), seq, tries: 4, tileName: v.name, exp: now + 6 * 60e3 };
    for (const j of m.members) { state.players[j].status = 'breach'; state.players[j].breachId = id; } events.push({ type: 'ritual_start', id, guild: m.guild, tile: v.id });
}
function ritualGuess(state, { jid, glyphs, now = Date.now() }) {
    const p = state.players[jid]; const e = p && state.encounters[p.breachId]; if (!e || e.type !== 'ritual') return fail('No ritual in progress.');
    const g = (Array.isArray(glyphs) ? glyphs : String(glyphs).split(/[\s,]+/)).filter(Boolean); if (g.length !== e.seq.length) return fail(`Give ${e.seq.length} glyphs from: ${GLYPHS.join(' ')}`);
    const exact = g.filter((x, i) => x === e.seq[i]).length; const near = g.filter((x) => e.seq.includes(x)).length - exact; e.tries -= 1;
    if (exact === e.seq.length) { claimTile(state, e.guild, e.tile, now); endEncounter(state, e); return ok(`🌟 The rite completes — *${e.tileName}* is yours!`, { claimed: true }); }
    if (e.tries <= 0) { endEncounter(state, e); ov(state, e.tile).restUntil = now + 60e3; return ok('💥 The circle fizzles out. The ruin rejects you for now.', { failed: true }); }
    return ok(`🔮 ${exact} glyph(s) in the right place, ${near} right but misplaced. ${e.tries} attempts left.`);
}
function startTreaty(state, m, v, now, events) {
    const id = uid(state, 'T'); state.encounters[id] = { id, type: 'treaty', tile: v.id, guild: m.guild, members: m.members.slice(), tileName: v.name, exp: now + 5 * 60e3, price: { supplies: 20, gems: 40, oath: 3 } };
    for (const j of m.members) { state.players[j].status = 'breach'; state.players[j].breachId = id; } events.push({ type: 'treaty_start', id, guild: m.guild, tile: v.id });
}
function treatyOffer(state, { jid, offer, now = Date.now() }) {
    const p = state.players[jid]; const e = p && state.encounters[p.breachId]; if (!e || e.type !== 'treaty') return fail('No treaty talks.'); const g = state.guilds[e.guild];
    offer = String(offer || '').toLowerCase();
    if (offer === 'supplies') { if (g.supplies < e.price.supplies) return fail(`Need ${e.price.supplies} supplies.`); g.supplies -= e.price.supplies; }
    else if (offer === 'gems') { if (g.treasury < e.price.gems) return fail(`Need ${e.price.gems} gems in the guild treasury.`); g.treasury -= e.price.gems; }
    else if (offer === 'oath') { if (e.members.length < e.price.oath) return fail(`An oath needs ${e.price.oath}+ warriors present.`); }
    else return fail('Offer: supplies, gems or oath.');
    claimTile(state, e.guild, e.tile, now); ov(state, e.tile).allied = true; endEncounter(state, e); return ok(`🕊️ The spirits accept your ${offer}. *${e.tileName}* joins your cause.`, { claimed: true });
}
function endEncounter(state, e) { for (const j of e.members) { const p = state.players[j]; if (p) { p.status = 'idle'; p.breachId = null; } } delete state.encounters[e.id]; }

// ── defences ────────────────────────────────────────────────────────────────────────────────
function fortify(state, { guild, by, tile, op, arg }) {
    if (!isLeader(state, guild, by)) return fail('Only the guild master or officers can fortify.'); const v = view(state, tile); const g = state.guilds[guild];
    if (!v || v.owner !== guild) return fail('You can only fortify tiles you hold.'); const o = ov(state, tile);
    const spend = (n) => { if (g.supplies < n) return fail(`Need ${n} supplies (have ${g.supplies}).`); g.supplies -= n; return null; };
    if (op === 'wall') { const order = ['wood', 'stone', 'runed']; const cur = v.wall && v.wall.hp > 0 ? v.wall.type : null; const want = arg && order.includes(arg) ? arg : order[Math.min(2, order.indexOf(cur) + 1)];
        if (cur === want && v.wall.hp >= v.wall.max) return fail('That wall is already at full strength.'); const same = cur === want; const cost = same ? Math.ceil((v.wall.max - v.wall.hp) / 20) : CFG.WALL_UPGRADE_COST[want] + 10; const e = spend(cost); if (e) return e;
        const mx = CFG.WALL_BASE_HP[want]; o.wall = { type: want, hp: mx, max: mx }; ensureSlots(o, v); return ok(`🧱 ${same ? 'Repaired' : 'Raised'} a ${want} wall at *${v.name}* (−${cost} supplies).`); }
    if (op === 'golem') { if (!CFG.GOLEM_COST[arg]) return fail(`Golem kinds: ${Object.keys(CFG.GOLEM_COST).join(', ')}.`); if (v.golems.length >= CFG.MAX_GOLEMS) return fail('Garrison is full.'); const e = spend(CFG.GOLEM_COST[arg]); if (e) return e; ensureSlots(o, v); o.golems.push({ id: uid(state, 'g'), kind: arg, lvl: 1 }); return ok(`🗿 A ${arg} golem takes post at *${v.name}* (−${CFG.GOLEM_COST[arg]}).`); }
    if (op === 'turret') { if (!CFG.TURRET_COST[arg]) return fail(`Turrets: ${Object.keys(CFG.TURRET_COST).join(', ')}.`); if (v.turrets.length >= CFG.MAX_TURRETS) return fail('No more mounts.'); const e = spend(CFG.TURRET_COST[arg]); if (e) return e; ensureSlots(o, v); o.turrets.push({ id: uid(state, 't'), kind: arg, lvl: 1 }); return ok(`🏹 ${arg} turret mounted (−${CFG.TURRET_COST[arg]}).`); }
    if (op === 'upgrade') { ensureSlots(o, v); const list = [...o.golems, ...o.turrets].sort((a, b) => a.lvl - b.lvl); const t = list[0]; if (!t) return fail('Nothing to upgrade.'); if (t.lvl >= 4) return fail('Everything is max level.'); const cost = 30 * t.lvl; const e = spend(cost); if (e) return e; t.lvl += 1; return ok(`⬆️ ${t.kind} → level ${t.lvl} (−${cost}).`); }
    if (op === 'buff') { const kind = arg === 'hp' ? 'hp' : 'atk'; o.buffs = o.buffs || {}; const stacks = Math.round((o.buffs[kind] || 0) / 0.15); if (stacks >= CFG.BUFF_MAX_STACKS) return fail('Buff is at max stacks.'); const cost = 25 * (stacks + 1); if (g.treasury < cost) return fail(`Buffs are paid in gems from the guild treasury: need ${cost} (have ${g.treasury}).`); g.treasury -= cost; o.buffs[kind] = +((o.buffs[kind] || 0) + 0.15).toFixed(2); return ok(`✨ Garrison ${kind === 'hp' ? 'toughness' : 'might'} +15% (−${cost} gems).`); }
    return fail('Fortify ops: wall, golem <kind>, turret <kind>, upgrade, buff <atk|hp>.');
}
function ensureSlots(o, v) { if (!o.golems) o.golems = v.golems.map((x) => ({ ...x })); if (!o.turrets) o.turrets = v.turrets.map((x) => ({ ...x })); if (!('wall' in o)) o.wall = v.wall; }

// ── economy & scoring ───────────────────────────────────────────────────────────────────────
function economy(state, now, events) {
    const dt = (now - state.lastEco) / 3600e3; if (dt < 1 / 120) return; state.lastEco = now; const g = gmap(state);
    for (const gd of Object.values(state.guilds)) {
        let gp = 0, sup = 0; for (const id of gd.tiles) { const t = g.tiles.get(id); const k = map.KINDS[t.kind]; gp += k.gp; sup += k.sup; }
        const upkeep = Math.max(0, gd.tiles.length - CFG.FREE_TILES) * CFG.UPKEEP_PER_TILE_HOUR; gd.supplies = Math.max(0, gd.supplies + (sup - upkeep) * dt); gd.writs += CFG.WRIT_PER_HOUR * dt; gd.score += gp * dt;
        if (gd.supplies === 0 && upkeep > sup && gd.tiles.length > 1) { const lost = gd.tiles.filter((t) => t !== gd.keep).pop(); if (lost && Math.random() < 0.05) { delete state.overlays[lost].owner; gd.tiles = gd.tiles.filter((t) => t !== lost); events.push({ type: 'abandoned', guild: gd.name, tile: lost }); } }
    }
}
function standings(state) { return Object.values(state.guilds).map((g) => ({ guild: g.name, tiles: g.tiles.length, score: Math.round(g.score + g.tiles.length * 2 + g.tiles.filter((t) => view(state, t).kind === 'titan').length * 25) })).sort((a, b) => b.score - a.score); }
module.exports = { newWar, registerPlayer, view, frontier, threat, power, marchSolo, detach, acceptOrder, declineOrder, setAuto, openMuster, joinMuster, launchMuster, recall, teleport, writCost, tick, claimTile, ritualGuess, treatyOffer, fortify, standings, locked, isLeader, roleOf, GLYPHS, validTarget, hasDefence, ov };
