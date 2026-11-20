'use strict';
// 💬 CONQUEST text interface. Grammar (all DM verbs start with "cq"):
//   cq | cq map | cq targets | cq tile | cq march <#> | cq muster <#> | cq join | cq launch | cq recall
//   cq roster | cq send <target#> <member#...> | cq accept | cq decline | cq auto on|off
//   cq tp <target#> <member#...> | cq skyfall <target#> <member#...>
//   in a fight: ram|ladder|sapper|fire|rune|shield|scout [gate|left|right|curtain]  strike|guard|shatter|lure|rally [#]
//   cq ritual <4 glyphs> | cq offer supplies|gems|oath
//   cq fortify wall [wood|stone|runed] | golem <kind> | turret <kind> | upgrade | buff atk|hp
//   cq mine | cq bank | cq gems | cq shop | cq buy <card> | cq status | cq top | cq help
const { CFG, enabled } = require('./config');
const E = require('./engine'); const breach = require('./breach'); const gems = require('./gems'); const shop = require('./summonShop'); const store = require('./store');
const map = require('./mapgen'); const envCards = require('./envCards'); const travel = require('./travel');

const targetsCache = new Map(); // jid -> [tileIds] (numbered lists the player last saw)
const FIGHT_VERBS = new Set([...breach.WALL_ACTIONS, ...breach.GOLEM_ACTIONS]);

function lazy() { return { guilds: require('./../guilds'), economy: require('../../economy/economy'), summons: require('../../summonCards') }; }
function powerOf(jid) { try { const sh = require('../../characters/progression').getCharacterSheet(jid); if (!sh) return 100; const s = sh.stats || {}; return Math.max(50, Math.round((s.atk || 0) + (s.mag || 0) * 0.8 + (s.def || 0) * 0.5 + (s.hp || 0) / 8 + (sh.level || 1) * 8)); } catch (e) { return 100; } }
function spriteOf(jid) { try { return require('../roomScene').resolvePlayerSpriteFile({ jid }); } catch (e) { return 'apprentice1.png'; } }
function nameOf(jid) { try { return require('../../economy/economy').getDisplayName(jid) || jid.split('@')[0]; } catch (e) { return jid.split('@')[0]; } }
function minesLevel(jid) { try { return Math.max(1, require('../../homestead/baseBuilder').getStructureLevel(jid, 'mines')); } catch (e) { return 1; } }

/** roles for engine: guild leader -> master */
function rolesFor(guildName) { const L = lazy(); const g = L.guilds.getGuild(guildName) || {}; const roles = {}; for (const m of g.members || []) roles[m] = g.owner === m ? 'master' : (g.admins || []).includes(m) ? 'officer' : 'member'; return roles; }
function createFor(eventDoc) {
    const names = [...new Set((eventDoc.players || []).filter((p) => p.guildName).map((p) => p.guildName))]; const guilds = names.map((n) => ({ name: n, roles: rolesFor(n), members: (eventDoc.players || []).filter((p) => p.guildName === n && p.status !== 'quit').map((p) => p.jid) }));
    return () => E.newWar({ key: eventDoc.eventId, seed: map.hashStr(String(eventDoc.eventId)), guilds, hours: 3 });
}
const label = (s, id) => { const v = E.view(s, id); return `${map.KINDS[v.kind].glyph} ${v.name} (${v.provName}${v.owner ? ', ' + v.owner : ''})`; };
const fmtSec = (ms) => `${Math.max(0, Math.round(ms / 1000))}s`;

function targetsText(s, guild, jid) {
    const list = [...E.frontier(s, guild)].map((id) => E.view(s, id)).sort((a, b) => (b.kind === 'titan') - (a.kind === 'titan') || map.KINDS[b.kind].gp - map.KINDS[a.kind].gp).slice(0, 15);
    targetsCache.set(jid, list.map((t) => t.id));
    return '🎯 *Targets on your border* (use the number):\n' + list.map((t, i) => `${i + 1}. ${map.KINDS[t.kind].glyph} ${t.name} — ${map.KINDS[t.kind].label}${t.owner ? ` 🏴 ${t.owner}` : ''}${t.wall ? ` 🧱${t.wall.type}` : ''}${t.golems.length ? ` 🗿×${t.golems.length}` : ''}${t.turrets.length ? ` 🏹×${t.turrets.length}` : ''} · ⚔️~${E.threat(s, t.id)}${t.veinLeft ? ` · 💎${t.veinLeft}` : ''}`).join('\n');
}

function targetsData(s, guild, jid, page = 1) {
    const all = [...E.frontier(s, guild)].map((id) => E.view(s, id)).sort((a, b) => (b.kind === 'titan') - (a.kind === 'titan') || map.KINDS[b.kind].gp - map.KINDS[a.kind].gp);
    targetsCache.set(jid, all.map((t) => t.id)); const PER = 6; const pages = Math.max(1, Math.ceil(all.length / PER)); page = Math.max(1, Math.min(pages, page | 0 || 1)); const p = s.players[jid];
    const g = map.generate(s.seed); const mine = map.parse(p.at);
    const list = all.slice((page - 1) * PER, page * PER).map((t, i) => { let dist = 1; try { dist = map.distance(g, p.at, t.id) || 1; } catch (e) { /* keep 1 */ } return { n: (page - 1) * PER + i + 1, id: t.id, name: t.name, kind: t.kind, owner: t.owner, wall: t.wall ? { type: t.wall.type } : null, golems: t.golems.length, turrets: t.turrets.length, veinLeft: t.veinLeft, dist, eta: Math.round(E.travelSec ? E.travelSec(dist, s) : dist * 8), threat: E.threat(s, t.id) }; });
    return { seed: s.seed, realm: mine.realm, title: guild, page, pages, list, guilds: Object.values(s.guilds).map((q) => ({ name: q.name })), owned: Object.entries(s.overlays).filter(([id]) => id.startsWith(mine.realm + ':')).map(([id, o]) => ({ id, owner: o.owner || null })), myPower: (s.players[jid] || {}).power || 100 };
}
function tileData(s, guild, jid, id) {
    const v = E.view(s, id); const k = map.KINDS[v.kind]; const mine = map.parse(id); const th = E.threat(s, id);
    const rows = [['Claim', k.claim.toUpperCase()], ['Holder', v.owner || 'Unclaimed'], ['Defences', [v.wall ? `${v.wall.type} wall ${v.wall.hp}/${v.wall.max}` : null, v.golems.length ? `${v.golems.length} golems` : null, v.turrets.length ? `${v.turrets.length} turrets` : null].filter(Boolean).join(' · ') || 'None'], ['Danger', `~${th} power`], ['Yield', `${k.gp} score · ${k.sup} supplies/h${k.gem ? ' · 💎' : ''}`]];
    return { seed: s.seed, realm: mine.realm, tile: { id, name: v.name, kind: v.kind, provName: v.provName }, rows, owned: [], guilds: [], hint: `.j cq march <#> to go · .j cq muster <#> to bring the guild` };
}
function territoryData(s, guild, jid) {
    const g = s.guilds[guild]; const upkeep = Math.max(0, g.tiles.length - CFG.FREE_TILES) * CFG.UPKEEP_PER_TILE_HOUR; const mins = Math.max(0, Math.round((s.endsAt - Date.now()) / 60000));
    const gm = map.generate(s.seed); const exposedIds = new Set(g.tiles.filter((id) => { try { return map.neighbors(gm, id).some((n) => { const o = E.view(s, n); return o && o.owner && o.owner !== guild; }); } catch (e) { return false; } })); const exposed = [...exposedIds];
    const stats = [{ k: 'TILES', v: g.tiles.length, icon: 'flag', col: '#7ed957' }, { k: 'SCORE', v: Math.round(g.score), icon: 'keep', col: '#ffd166' }, { k: 'SUPPLIES', v: Math.floor(g.supplies), icon: 'village', col: '#ffb86b' }, { k: 'UPKEEP/H', v: upkeep, icon: 'clock', col: '#ff9d6c' }, { k: 'WRITS', v: Math.floor(g.writs), icon: 'scroll', col: '#c9a0ff' }, { k: 'GEMS', v: g.treasury, icon: 'gem_vein', col: '#ff7bd5' }, { k: 'SKYFALLS', v: g.skyfalls, icon: 'titan', col: '#ff6b5e' }, { k: 'EXPOSED', v: exposed.length, icon: 'shield', col: exposed.length ? '#ff4d6d' : '#7df9c4' }];
    const holdings = g.tiles.map((id) => E.view(s, id)).sort((a, b) => map.KINDS[b.kind].gp - map.KINDS[a.kind].gp).slice(0, 8).map((t) => ({ name: `${map.KINDS[t.kind].glyph} ${t.name}`, note: exposedIds.has(t.id) ? 'EXPOSED to rivals' : (t.wall ? `${t.wall.type} wall ${t.wall.hp}` : 'open'), warn: exposedIds.has(t.id) }));
    const mine = map.parse(g.keep); return { guild, sub: `${mins} min left`, stats, holdings, seed: s.seed, realm: mine.realm, guilds: Object.values(s.guilds).map((q) => ({ name: q.name })), owned: Object.entries(s.overlays).filter(([id]) => id.startsWith(mine.realm + ':')).map(([id, o]) => ({ id, owner: o.owner || null })) };
}
const id_of = (t) => t.id;
function gridText(s, guild, jid) {
    const p = s.players[jid]; const v = E.view(s, p.at); const own = new Set(s.guilds[guild].tiles); const owners = {}; Object.keys(s.guilds).forEach((n, i) => { owners[n] = ['🟦', '🟥', '🟩', '🟨', '🟪', '🟧', '⬛', '🟫'][i % 8]; });
    const rows = []; for (let y = Math.max(0, v.y - 3); y <= Math.min(map.H - 1, v.y + 4); y++) { let r = ''; for (let x = Math.max(0, v.x - 6); x <= Math.min(map.W - 1, v.x + 6); x++) { const id = map.tileId(v.realm, x, y); const t = E.view(s, id); if (!t) { r += '🌊'; continue; } r += id === p.at ? '🧍' : t.owner ? owners[t.owner] : ({ gem_vein: '💎', fortress: '🏰', titan: '☠️', ruins: '🏛️', shrine: '⛩️', ley_gate: '🌀', village: '🏘️', forest: '🌲', pass: '⛰️', keep: '👑' }[t.kind] || '⬜'); } rows.push(r); }
    return `🗺️ *${v.provName}* — ${label(s, p.at)}\n` + rows.join('\n') + '\n' + Object.entries(owners).map(([n, e]) => `${e} ${n}`).join('  ');
}
function mapSnap(s, guild, jid) {
    const p = s.players[jid]; const realm = map.parse(p.at).realm; const tiles = Object.entries(s.overlays).filter(([id]) => id.startsWith(realm + ':')).map(([id, o]) => ({ id, owner: o.owner || null, shield: (o.shieldUntil || 0) > Date.now() }));
    const ms = Object.values(s.marches).filter((m) => m.guild === guild).map((m) => ({ id: m.id, from: m.from, to: m.to }));
    const mine = p.status === 'transit' && s.marches[p.marchId] ? s.marches[p.marchId] : null;
    return { route: mine ? travel.routeOf(s, mine, 'transit', Date.now(), jid) : null, seed: s.seed, realm, tiles, guilds: Object.values(s.guilds).map((g) => ({ name: g.name, score: Math.round(g.score), tiles: g.tiles.length })).sort((a, b) => b.score - a.score), me: { at: p.at, sprite: p.sprite }, marches: ms, targets: (targetsCache.get(jid) || []), title: guild, sub: Math.max(0, Math.round((s.endsAt - Date.now()) / 60000)) + ' min left' };
}
function status(s, guild, jid) {
    const g = s.guilds[guild]; const p = s.players[jid]; const mins = Math.max(0, Math.round((s.endsAt - Date.now()) / 60000));
    return [`🏰 *${guild}* — ${g.tiles.length} tiles · score ${Math.round(g.score)}`, `📦 Supplies ${Math.floor(g.supplies)} · 📜 War Writs ${Math.floor(g.writs)} · 💎 Treasury ${g.treasury} · ☄️ Skyfall ${g.skyfalls}`, `🧍 ${p.status}${p.status === 'transit' && s.marches[p.marchId] ? ' → ' + label(s, s.marches[p.marchId].to) + ' in ' + fmtSec(s.marches[p.marchId].arrive - Date.now()) : ''} · at ${label(s, p.at)}`, `⛏️ Carrying ${p.carried || 0} ore · banked this war ${p.banked || 0}`, `⏳ ${mins} min left`].join('\n');
}
function pushEvents(events, guildOf) { return events; }

async function handle({ jid, text, prefix = '.', eventDoc, chatId = null, botId = null }) {
    if (!enabled()) return null;
    const raw = String(text || '').trim().toLowerCase().replace(/^[.!/#]?\s*(j\s+)?/, '');
    const m = raw.match(/^(cq|conquest)\b\s*(.*)$/); if (!m) return null;
    const rest = m[2].trim(); const parts = rest.split(/\s+/).filter(Boolean); const verb = (parts[0] || 'map'); const args = parts.slice(1);
    const L = lazy(); const guildName0 = L.guilds.getUserGuild(jid);
    if (verb === 'shop' || verb === 'gemshop' || verb === 'buy' || verb === 'gems') { // works without a live war
        const u = L.economy.getUser(jid); if (!u) return { text: '❌ Register first.' };
        if (verb === 'buy') { const r = shop.buy({ economy: L.economy, summons: L.summons, jid, card: args.join(' ') }); return { text: r.msg }; }
        if (verb === 'gems') return { text: `💎 You have *${u.gems || 0}* ${CFG.GEM_NAME}. Earn them by mining ◆ veins during guild wars (or a rare Aether Seam in the Mines), then \`cq shop\`.` };
        return { text: shop.render((u.summonCards || []).map((c) => String(c.cardId).toLowerCase()), u.gems || 0) };
    }
    if (verb === 'help') return { text: helpText() };
    let key = eventDoc && eventDoc.eventId; if (!key) { try { key = await store.keyFor(jid); } catch (e) { key = null; } }   // any chat works: group or DM
    if (!key) return { text: `⚔️ No conquest war is active for you right now. Mods: \`${prefix} cqtest\` starts a fast test war (no guild needed). \`cq shop\` still works.` };
    let guildName = guildName0; if (!guildName) { try { const st0 = await store.load(key); guildName = st0 && st0.players && st0.players[jid] && st0.players[jid].guild; } catch (e) { /* none */ } }   // test wars: guildless players
    if (!guildName) return { text: '❌ Join a guild first.' };
    const now = Date.now(); const events = [];
    let out = null;
    await store.mutate(key, (s) => {
        out = run(s, { jid, guildName, verb, args, rest, now, L, events }); if (s.players[jid]) s.players[jid].chat = chatId || jid; if (botId) { s.tickOwner = botId; s.tickOwnerAt = now; }   // replies/reminders go back to where they play
        E.tick(s, now, events);
    }, eventDoc ? createFor(eventDoc) : undefined);
    if (out === undefined || out === null && !(await store.load(key))) return { text: '⚔️ That war has ended.' };
    if (out && out.afterApply) { try { out.afterApply(); } catch (e) { console.warn('[conquest] afterApply', e.message); } }
    if (out && out.render) { const rr = require('./render'); const W = out.render.what; const img = W === 'map' ? await rr.renderMap(out.render.data) : W === 'card' ? await rr.renderEnvCard(out.render.data.id) : W === 'siege' ? await rr.renderSiege(out.render.data) : await rr.renderCard(W, out.render.data); if (img) return { image: img, video: out.video ? await rr.renderVideo(out.video).catch(() => null) : null, text: ['map', 'targets', 'territory', 'tile', 'capture'].includes(W) ? (out.imageText || out.text || '').split('\n').slice(0, W === 'map' ? 1 : 3).join('\n') : out.text }; return { text: out.imageText || out.text }; }
    return out || { text: '…' };
}
/** departure card for a freshly started march (leader's own screen) */
function routeReply(s, r, guildName, jid, now) { if (!r.ok || !r.march) return { text: r.msg }; const d = mapSnap(s, guildName, jid); d.route = travel.routeOf(s, r.march, 'depart', now, jid); return { text: r.msg, render: { what: 'map', data: d }, imageText: r.msg, video: d }; }
function run(s, { jid, guildName, verb, args, rest, now, L, events }) {
    if (s.status !== 'active') return { text: '🏁 The conquest has ended. ' + JSON.stringify(E.standings(s)) };
    if (!s.guilds[guildName]) return { text: '❌ Your guild did not enter this war.' };
    const role = rolesFor(guildName); s.guilds[guildName].roles = role;
    E.registerPlayer(s, guildName, jid, nameOf(jid), powerOf(jid)); const p = s.players[jid]; p.sprite = spriteOf(jid);
    const T = (n) => (targetsCache.get(jid) || [])[parseInt(n, 10) - 1];
    const roster = () => Object.values(s.players).filter((x) => x.guild === guildName);
    const R = (n) => (roster()[parseInt(n, 10) - 1] || {}).jid;
    const reply = (r) => ({ text: r.msg });
    // fight verbs
    if (FIGHT_VERBS.has(verb)) { const b = s.breaches[p.breachId]; if (!b) return { text: 'You are not in a fight. `cq targets` → `cq march <#>`.' }; const r = breach.submit(b, jid, verb, args[0]); const extra = r.ok ? '\n' + breach.statusText(b) : ''; if (r.ok && breach.allSubmitted(b)) { const ev = []; E.tick(s, now, ev); events.push(...ev); } return { text: (r.ok ? `✔ ${r.action}${r.target ? ' → ' + r.target : ''}` : '❌ ' + r.msg) + extra }; }
    switch (verb) {
        case 'map': case 'm': return { text: gridText(s, guildName, jid), render: { what: 'map', data: mapSnap(s, guildName, jid) }, imageText: gridText(s, guildName, jid) };
        case 'realm': case 'overview': { const d = mapSnap(s, guildName, jid); d.view = 'overview'; return { text: gridText(s, guildName, jid), render: { what: 'map', data: d }, imageText: gridText(s, guildName, jid) }; }
        case 'cards': return { text: '🃏 Environment cards: ' + envCards.CARDS.map((c) => c.id).join(', ') + '\nSee one: `cq card <id>`' };
        case 'card': { const c = envCards.BY_ID[(args[0] || '').toLowerCase()]; if (!c) return { text: 'Unknown card. `cq cards` lists them.' }; return { text: `${c.name}: ${c.text}`, render: { what: 'card', data: { id: c.id } } }; }
        case 'siege': { const b = s.breaches[p.breachId]; if (!b) return { text: 'You are not in a siege.' }; return { text: breach.statusText(b), render: { what: 'siege', data: JSON.parse(JSON.stringify(b)) } }; }
        case 'targets': case 't': { const td = targetsData(s, guildName, jid, parseInt(args[0], 10) || 1); return { text: `🎯 ${td.list.length} targets on your border — pick a number: \`${'.j'} cq march <#>\`.`, render: { what: 'targets', data: td }, imageText: `🎯 *Targets on your border* — page ${td.page}/${td.pages}\nPick a number: \`cq march <#>\` · details: \`cq tile <#>\`` }; }
        case 'territory': case 'land': { const td = territoryData(s, guildName, jid); return { text: '🏰 Territory', render: { what: 'territory', data: td }, imageText: `🏰 *${guildName}* — territory & upkeep` }; }
        case 'tile': { const tid = T(args[0]) || p.at; const v = E.view(s, tid); if (!v) return { text: 'No such tile.' }; return { text: `${v.name}`, render: { what: 'tile', data: tileData(s, guildName, jid, tid) }, imageText: `🔎 *${v.name}* — ${map.KINDS[v.kind].label}` }; }
        case 'status': case 's': case 'travel': case 'where': { const m = p.status === 'transit' && s.marches[p.marchId]; if (m) return { text: status(s, guildName, jid), render: { what: 'map', data: mapSnap(s, guildName, jid) }, imageText: status(s, guildName, jid) }; return { text: status(s, guildName, jid) }; }
        case 'top': return { text: '🏆 ' + E.standings(s).map((x, i) => `${i + 1}. ${x.guild} — ${x.score} (${x.tiles} tiles)`).join('\n') };
        case 'roster': return { text: roster().map((x, i) => `${i + 1}. ${x.name} · ⚔️${x.power} · ${x.status}`).join('\n') };
        case 'march': { const to = T(args[0]); if (!to) return { text: 'Run `cq targets` first, then `cq march <#>`.' }; return routeReply(s, E.marchSolo(s, { guild: guildName, by: jid, to, now }), guildName, jid, now); }
        case 'muster': { const to = T(args[0]); if (!to) return { text: 'Run `cq targets` first, then `cq muster <#>`.' }; return reply(E.openMuster(s, { guild: guildName, by: jid, to, now })); }
        case 'join': return reply(E.joinMuster(s, { guild: guildName, jid, now }));
        case 'launch': return reply(E.launchMuster(s, { guild: guildName, by: jid, now }));
        case 'recall': return reply(E.recall(s, { guild: guildName, by: jid }));
        case 'send': { const to = T(args[0]); if (!to) return { text: '`cq send <target#> <member#...>` (see `cq roster`, `cq targets`).' }; return reply(E.detach(s, { guild: guildName, by: jid, to, targets: args.slice(1).map(R).filter(Boolean), now })); }
        case 'accept': return reply(E.acceptOrder(s, { guild: guildName, jid, now }));
        case 'decline': return reply(E.declineOrder(s, { jid }));
        case 'auto': return reply(E.setAuto(s, { jid, on: args[0] !== 'off' }));
        case 'tp': case 'skyfall': { const to = T(args[0]); if (!to) return { text: '`cq tp <target#> <member#...>`' }; return reply(E.teleport(s, { guild: guildName, by: jid, to, jids: args.slice(1).map(R).filter(Boolean), skyfall: verb === 'skyfall', now })); }
        case 'ritual': return reply(E.ritualGuess(s, { jid, glyphs: args, now }));
        case 'offer': return reply(E.treatyOffer(s, { jid, offer: args[0], now }));
        case 'fortify': case 'f': return reply(E.fortify(s, { guild: guildName, by: jid, tile: p.at, op: args[0], arg: args[1] }));
        case 'dbg': case 'debug': {   // 🧪 test wars only: jump straight to any encounter type
            if (!s.test) return { text: 'Debug jumps only work in a test war (`.j cqtest`).' };
            const kinds = ['plain', 'village', 'forest', 'gem_vein', 'ruins', 'shrine', 'pass', 'fortress', 'ley_gate', 'titan'];
            const kind = (args[0] || '').toLowerCase();
            if (!kinds.includes(kind)) return { text: '🧪 *dbg* — jump to an encounter:\n' + kinds.map((k) => `\`cq dbg ${k}\` — ${map.KINDS[k].label} (${map.KINDS[k].claim})`).join('\n') };
            if (E.locked(s, jid)) return { text: 'Finish or flee your current fight/march first.' };
            const gm = map.generate(s.seed); const home = map.parse(p.at).realm; let best = null, bd = 1e9;
            for (const t of gm.tiles.values()) { if (t.kind !== kind || t.realm !== home) continue; const v = E.view(s, t.id); if (v.owner) continue; const d = map.distance(gm, p.at, t.id); const dd = Number.isFinite(d) ? d : 99; if (dd < bd) { bd = dd; best = t.id; } }
            if (!best) for (const t of gm.tiles.values()) { if (t.kind !== kind) continue; const v = E.view(s, t.id); if (v.owner) continue; best = t.id; break; }
            if (!best) return { text: `No free ${kind} tile left in this war.` };
            const mm = E.startMarch(s, { guild: guildName, jids: [jid], to: best, type: 'solo', by: jid, now });
            mm.arrive = now + 2500; mm.depart = now;   // lands on the next tick (~4s) so the ticker posts the real arrival/arena cards
            return { text: `🧪 Jumping to *${E.view(s, best).name}* (${map.KINDS[kind].label}). The encounter starts in a few seconds.` };
        }
        case 'mine': { const r = gems.mine(s, { jid, level: minesLevel(jid), now }); if (r.ok) { const u = L.economy.getUser(jid); if (u && u.professions && u.professions.mining) u.professions.mining.xp = (u.professions.mining.xp || 0); } return reply(r); }
        case 'bank': { const r = gems.bank(s, { jid }); if (r.ok) { const u = L.economy.getUser(jid); gems.credit(u, r.credit); if (L.economy.scheduleSave) L.economy.scheduleSave(jid); } return reply(r); }
        default: return { text: helpText() };
    }
}
function helpText() { return ['⚔️ *CONQUEST*', '🧪 Test war: `cqtest` then `cq dbg <kind>` jumps to any encounter', '`cq map` · `cq targets` · `cq tile [#]` · `cq status` · `cq top`', 'Leaders: `cq march #` · `cq muster #` → `join` → `launch` · `cq send # members…` · `cq tp # members…` · `cq skyfall #` · `cq fortify wall|golem k|turret k|upgrade|buff`', 'Everyone: `cq accept|decline` · `cq auto on|off` · `cq recall`', 'In a siege: `ram ladder sapper fire rune shield scout` + gate/left/right/curtain; vs golems: `strike guard shatter lure rally`', 'Rituals: `cq ritual ☀ ☾ ✦ ❄` · Treaties: `cq offer supplies|gems|oath`', '💎 `cq mine` (on a ◆ vein) · `cq bank` (at your Keep/Ley Gate) · `cq shop` · `cq buy <card>`'].join('\n'); }
module.exports = { createFor, rolesFor, mapSnap, handle, run, helpText, targetsText, gridText, status };
