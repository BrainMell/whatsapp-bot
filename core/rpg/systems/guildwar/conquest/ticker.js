'use strict';
// ⏱️ Called from guildwar/state.js tick (flow-lease holder only). Resolves arrivals + siege rounds and DMs the people involved.
const store = require('./store'); const E = require('./engine'); const breach = require('./breach'); const envCards = require('./envCards'); const { enabled } = require('./config');
async function tickWar(ev, sock) {
    if (!enabled() || !ev || !ev.eventId || !sock) return;
    const sends = []; const imgs = [];
    await store.mutate(ev.eventId, (s) => {
        if (s.status !== 'active') return;
        const before = Object.fromEntries(Object.entries(s.breaches).map(([id, b]) => [id, Object.keys(b.party)]));
        const events = E.tick(s, Date.now());
        for (const e of events) {
            const guildMembers = (g) => Object.values(s.players).filter((p) => p.guild === g).map((p) => p.jid);
            if (e.type === 'breach_round') { const b = s.breaches[e.id]; const t = e.lines.join('\n') + (b ? '\n\n' + breach.statusText(b) + '\n\n_Your move: ' + (b.phase === 'wall' ? breach.WALL_ACTIONS : breach.GOLEM_ACTIONS).map((a) => 'cq ' + a).join(' · ') + '_' : ''); for (const j of (before[e.id] || [])) sends.push([j, t]); if (b) imgs.push([before[e.id] || [], JSON.parse(JSON.stringify(b))]); }
            else if (e.type === 'breach_start') { const b = s.breaches[e.id]; if (b) { imgs.push([Object.keys(b.party), JSON.parse(JSON.stringify(b))]); const c = envCards.BY_ID[b.env]; for (const j of Object.keys(b.party)) sends.push([j, `🧱 *Siege of ${b.tileName}!*\n${breach.statusText(b)}\n\n${c ? c.icon + ' ' + c.text + '\n\n' : ''}Actions: ${breach.WALL_ACTIONS.concat(breach.GOLEM_ACTIONS.filter((x) => b.phase === 'golems')).map((a) => `${a} — ${breach.ACTION_HELP[a]}`).join('\n')}\n\nSend e.g. \`cq ram gate\`. Round ends when all act or in ${75}s.`]); } }
            else if (e.type === 'claimed') { for (const j of guildMembers(e.guild)) sends.push([j, `🚩 *${E.view(s, e.tile).name}* now flies the ${e.guild} banner!`]); }
            else if (e.type === 'repelled') { for (const j of guildMembers(e.guild)) sends.push([j, `🛡️ The assault on *${E.view(s, e.tile).name}* was repelled.`]); if (e.defender) for (const j of guildMembers(e.defender)) sends.push([j, `🛡️ Your garrison at *${E.view(s, e.tile).name}* held against ${e.guild}!`]); }
            else if (e.type === 'titan_slain') { for (const j of guildMembers(e.guild)) sends.push([j, `☠️ *TITAN SLAIN* at ${E.view(s, e.tile).name}! +4 writs, +120 supplies, +200 gems to the treasury.`]); }
            else if (e.type === 'ritual_start') { const en = s.encounters[e.id]; if (en) for (const j of en.members) sends.push([j, `🏛️ *${en.tileName}* — an ancient rite blocks the way. Arrange 4 glyphs: ${E.GLYPHS.join(' ')}\n\`cq ritual ☀ ☾ ✦ ❄\` (${en.tries} tries; 🟢 exact / ⚪ misplaced hints).`]); }
            else if (e.type === 'treaty_start') { const en = s.encounters[e.id]; if (en) for (const j of en.members) sends.push([j, `⛩️ *${en.tileName}* — the spirits will treat. \`cq offer supplies\` (20) · \`cq offer gems\` (40 from treasury) · \`cq offer oath\` (3+ warriors).`]); }
            else if (e.type === 'war_end') { for (const p of Object.values(s.players)) sends.push([p.jid, '🏁 *CONQUEST ENDS*\n' + e.standings.map((x, i) => `${i + 1}. ${x.guild} — ${x.score}`).join('\n')]); }
        }
    });
    const rr = imgs.length ? require('./render') : null;
    for (const [jids, b] of imgs) { const img = await rr.renderSiege(b); if (img) for (const j of jids) { try { await sock.sendMessage(j, { image: img, caption: `🧱 ${b.tileName} — round ${b.round}` }); } catch (e) { /* unreachable */ } } }
    for (const [jid, text] of sends) { try { await sock.sendMessage(jid, { text }); } catch (e) { /* DM unreachable */ } }
}
module.exports = { tickWar };
