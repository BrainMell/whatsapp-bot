'use strict';
// ⏱️ Called from guildwar/state.js tick (flow-lease holder only). Resolves arrivals + siege rounds and DMs the people involved.
const store = require('./store'); const E = require('./engine'); const breach = require('./breach'); const envCards = require('./envCards'); const { enabled } = require('./config');
async function tickWar(ev, sock) {
    if (!enabled() || !ev || !ev.eventId || !sock) return;
    let ended = false; const sends = []; const imgs = []; const arrivals = []; const chatMap = {}; let hostGroup = null; const gcLines = []; const caps = []; const arenas = []; const map = require('./mapgen');
    const me = sock.user && String(sock.user.id).split(':')[0].split('@')[0]; const vparts = [];
    await store.mutate(ev.eventId, (s) => {
        if (s.status !== 'active') return;
        if (me) { if (s.tickOwner && s.tickOwner !== me && Date.now() - (s.tickOwnerAt || 0) < 30000) return; s.tickOwner = me; s.tickOwnerAt = Date.now(); }   // one bot delivers: the one players talk to
        for (const m of Object.values(s.marches)) if (m.status === 'marching' && m.vidAt && Date.now() >= m.vidAt - 14000) { const at = m.vidAt; const left = m.arrive - at; m.vidAt = left > 3000 ? at + 50000 : null; if (left > 3000) for (const j of m.members) { try { const cq = require('./commands'); const d = cq.mapSnap(s, m.guild, j); d.route = require('./travel').routeOf(s, m, 'transit', at, j); vparts.push([j, d, at]); } catch (e) { /* skip */ } } }
        hostGroup = s.hostGroup || null; for (const p of Object.values(s.players)) if (p.chat) chatMap[p.jid] = p.chat;
        const before = Object.fromEntries(Object.entries(s.breaches).map(([id, b]) => [id, Object.keys(b.party)]));
        const events = E.tick(s, Date.now());
        for (const e of events) {
            const guildMembers = (g) => Object.values(s.players).filter((p) => p.guild === g).map((p) => p.jid);
            if (e.type === 'breach_round') { const b = s.breaches[e.id]; const t = e.lines.join('\n') + (b ? '\n\n' + breach.statusText(b) + '\n\n_Your move: ' + (b.phase === 'wall' ? breach.WALL_ACTIONS : breach.GOLEM_ACTIONS).map((a) => 'cq ' + a).join(' · ') + '_' : ''); for (const j of (before[e.id] || [])) sends.push([j, t]); if (b) imgs.push([before[e.id] || [], JSON.parse(JSON.stringify(b))]); }
            else if (e.type === 'breach_start') { const b = s.breaches[e.id]; if (b) { imgs.push([Object.keys(b.party), JSON.parse(JSON.stringify(b))]); const c = envCards.BY_ID[b.env]; for (const j of Object.keys(b.party)) sends.push([j, `🧱 *Siege of ${b.tileName}!*\n${breach.statusText(b)}\n\n${c ? c.icon + ' ' + c.text + '\n\n' : ''}Actions: ${breach.WALL_ACTIONS.concat(breach.GOLEM_ACTIONS.filter((x) => b.phase === 'golems')).map((a) => `${a} — ${breach.ACTION_HELP[a]}`).join('\n')}\n\nSend e.g. \`cq ram gate\`. Round ends when all act or in ${75}s.`]); } }
            else if (e.type === 'march_soon') { for (const j of e.members) sends.push([j, require('./travel').soonText(s, e)]); }
            else if (e.type === 'march_half') { const mm = s.marches[e.id]; for (const j of e.members) sends.push([j, require('./travel').halfText(s, e, mm ? Math.max(0, Math.round((mm.arrive - Date.now()) / 1000)) : 0)]); }
            else if (e.type === 'arrived') { for (const j of e.members) { const p = s.players[j]; if (!p) continue; try { const cq = require('./commands'); const d = cq.mapSnap(s, e.guild, j); d.route = require('./travel').routeOf(s, { id: 'arr', guild: e.guild, from: e.from, to: e.tile, path: e.path, dist: e.dist, type: e.mtype, depart: e.depart, arrive: e.arriveAt, members: e.members }, 'arrive', Date.now(), j); arrivals.push([j, d, E.view(s, e.tile).name]); } catch (er) { /* card is optional */ } } }
            else if (e.type === 'claimed') { const vv = E.view(s, e.tile); const prev = (s.prevOwner || {})[e.tile]; const t = `🚩 *${vv.name}* now flies the *${e.guild}* banner!${prev ? ` (taken from ${prev})` : ''}`; if (hostGroup) gcLines.push(t); else for (const j of guildMembers(e.guild)) sends.push([j, t]);
                const gi = Object.keys(s.guilds).indexOf(e.guild); const col = ['#3a86ff', '#ef476f', '#06d6a0', '#ffd166', '#9b5de5', '#fb8500', '#adb5bd', '#c08457'][Math.max(0, gi) % 8]; const realm = map.parse(e.tile).realm; const owned = Object.entries(s.overlays).filter(([id]) => id.startsWith(realm + ':')).map(([id, o]) => ({ id, owner: o.owner || null })); const gl = Object.values(s.guilds).map((q) => ({ name: q.name }));
                const base = { seed: s.seed, realm, owned, guilds: gl, tile: { id: e.tile, name: vv.name, kind: vv.kind } };
                caps.push([hostGroup || null, guildMembers(e.guild), { ...base, mode: 'won', color: col, headline: `${e.guild} takes ${vv.name}`, lines: [`${(map.KINDS[vv.kind] || {}).label}${prev ? ' · wrested from ' + prev : ' · claimed from the wild'}`, `+${(map.KINDS[vv.kind] || {}).gp || 1} score per hour · shielded for a short while`] }]);
                if (prev) caps.push([null, guildMembers(prev), { ...base, mode: 'lost', headline: `${vv.name} has fallen`, lines: [`${e.guild} now holds the banner.`, 'Muster your guild and take it back: .j cq targets'] }]); }
            else if (e.type === 'repelled') { for (const j of guildMembers(e.guild)) sends.push([j, `🛡️ The assault on *${E.view(s, e.tile).name}* was repelled.`]); if (e.defender) for (const j of guildMembers(e.defender)) sends.push([j, `🛡️ Your garrison at *${E.view(s, e.tile).name}* held against ${e.guild}!`]); }
            else if (e.type === 'titan_slain') { const t = `☠️ *TITAN SLAIN* at ${E.view(s, e.tile).name} by *${e.guild}*! +4 writs, +120 supplies, +200 gems to their treasury.`; if (hostGroup) gcLines.push(t); else for (const j of guildMembers(e.guild)) sends.push([j, t]); }
            else if (e.type === 'ritual_start') { const en = s.encounters[e.id]; if (en) arenas.push([en.members, { kind: 'ruins', seed: en.id, biome: (s.tiles && s.tiles[en.tile] && s.tiles[en.tile].biome) || 'highlands', title: en.tileName, sub: 'Ancient rite', lines: ['The glyphs awaken', 'cq ritual ☀ ☾ ✦ ❄'], party: en.members.slice(0, 5).map((j) => ({ name: (s.players[j] || {}).name || 'Hero', sprite: (s.players[j] || {}).sprite })) }]); if (en) for (const j of en.members) sends.push([j, `🏛️ *${en.tileName}* — an ancient rite blocks the way. Arrange 4 glyphs: ${E.GLYPHS.join(' ')}\n\`cq ritual ☀ ☾ ✦ ❄\` (${en.tries} tries; 🟢 exact / ⚪ misplaced hints).`]); }
            else if (e.type === 'treaty_start') { const en = s.encounters[e.id]; if (en) arenas.push([en.members, { kind: 'shrine', seed: en.id, biome: (s.tiles && s.tiles[en.tile] && s.tiles[en.tile].biome) || 'highlands', title: en.tileName, sub: 'Spirit treaty', lines: ['The spirits will treat', 'cq offer supplies · gems · oath'], party: en.members.slice(0, 5).map((j) => ({ name: (s.players[j] || {}).name || 'Hero', sprite: (s.players[j] || {}).sprite })) }]); if (en) for (const j of en.members) sends.push([j, `⛩️ *${en.tileName}* — the spirits will treat. \`cq offer supplies\` (20) · \`cq offer gems\` (40 from treasury) · \`cq offer oath\` (3+ warriors).`]); }
            else if (e.type === 'war_end') { ended = true; const t = '🏁 *CONQUEST ENDS*\n' + e.standings.map((x, i) => `${i + 1}. ${x.guild} — ${x.score}`).join('\n'); if (hostGroup) gcLines.push(t); else for (const p of Object.values(s.players)) sends.push([p.jid, t]); }
        }
    });
    if (ended) { try { await require('../state').endEvent(ev.eventId, 'Conquest concluded', { quietFeed: true }); } catch (e) { /* already ended */ } }
    const rr = (imgs.length || arrivals.length || caps.length || arenas.length) ? require('./render') : null;
    for (const [jids, data] of arenas) { try { const img = await rr.renderCard('arena', data); if (!img) continue; for (const d of [...new Set(jids.map((j) => chatMap[j] || j))]) await sock.sendMessage(d, { image: img, caption: `🏟️ *${data.title}*` }); } catch (er) { /* bonus */ } }
    for (const [grp, jids, data] of caps) { try { const img = await rr.renderCard('capture', data); if (!img) continue; const caption = data.mode === 'lost' ? `🏴 *${data.tile.name} LOST* — ${data.lines[0]}` : `🚩 *${data.tile.name} CAPTURED*`; const dests = grp && data.mode === 'won' ? [grp] : [...new Set(jids.map((j) => chatMap[j] || j))]; for (const d of dests) await sock.sendMessage(d, { image: img, caption }); } catch (er) { /* card is a bonus */ } }
    const to = (jid) => chatMap[jid] || jid; const mention = (jid) => (to(jid).endsWith('@g.us') ? { mentions: [jid] } : {}); const tag = (jid, t) => (to(jid).endsWith('@g.us') ? `@${String(jid).split('@')[0]} ${t}` : t);
    for (const [jid, d, nm] of arrivals) { const img = await rr.renderMap(d); if (img) { try { await sock.sendMessage(to(jid), { image: img, caption: tag(jid, `📍 Arrived at ${nm}`), ...mention(jid) }); } catch (er) { /* unreachable */ } } }
    for (const [jids, b] of imgs) { const img = await rr.renderSiege(b); if (img) for (const j of new Set(jids.map(to))) { try { await sock.sendMessage(j, { image: img, caption: `🧱 ${b.tileName} — round ${b.round}` }); } catch (e) { /* unreachable */ } } }
    for (const [jid, text] of sends) { try { await sock.sendMessage(to(jid), { text: tag(jid, text), ...mention(jid) }); } catch (e) { /* unreachable */ } }
    // 🎞️ chained travel video notes: render the next ~50s segment a little early, deliver it exactly when the previous one ends
    for (const [jid, d, at] of vparts) {
        try {
            const rv = require('./render'); const vid = await rv.renderVideo(d); if (!vid) continue;
            const wait = Math.max(0, at - Date.now()); if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 20000)));
            await sock.sendMessage(chatMap[jid] || jid, { video: vid, ptv: true, mimetype: 'video/mp4' });
        } catch (e) { console.warn('[conquest] video part', e && e.message); }
    }
    if (hostGroup && gcLines.length) { try { await sock.sendMessage(hostGroup, { text: gcLines.slice(0, 6).join('\n') }); } catch (e) { /* GC unreachable */ } }
}
module.exports = { tickWar };
