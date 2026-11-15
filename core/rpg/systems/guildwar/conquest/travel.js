'use strict';
// 🧭 Builds the `route` payload the war-map renderer draws (dashed path, markers, panel) and the matching reminder texts.
const E = require('./engine'); const map = require('./mapgen');
const NEXT = { skirmish: 'Open ground - it is claimed the moment you arrive.', siege: 'A SIEGE begins - watch your DMs each round.', titan: 'The TITAN awakens - bring your whole party.', ritual: 'Ancient rite - solve it with `cq ritual` + 4 glyphs.', treaty: 'The spirits will treat - `cq offer supplies|gems|oath`.' };
function defenceLines(v) { const out = []; if (v.wall) out.push(`Wall: ${v.wall.type} ${v.wall.hp} HP`); if (v.golems && v.golems.length) out.push('Golems: ' + v.golems.map((g) => `${g.kind} L${g.lvl}`).join(', ')); if (v.turrets && v.turrets.length) out.push('Turrets: ' + v.turrets.map((g) => `${g.kind} L${g.lvl}`).join(', ')); if (v.kind === 'titan' && !v.owner) out.push('Titan guards: iron + rune golems'); return out; }
/** m = {id,from,to,path,depart,arrive,type,members,dist}; mode depart|transit|arrive */
function routeOf(s, m, mode, now = Date.now(), jid) {
    const v = E.view(s, m.to) || {}; const f = E.view(s, m.from) || {}; const kind = map.KINDS[v.kind] || map.KINDS.plain; const total = Math.max(1, (m.arrive || now) - (m.depart || now));
    const th = E.threat(s, m.to); const me = jid && s.players[jid]; const own = v.owner && m.guild && v.owner === m.guild;
    return {
        id: m.id, mode, type: m.type || 'solo', path: m.path || [m.from, m.to], from: m.from, to: m.to, fromName: f.name, toName: v.name, kindLabel: kind.label, owner: v.owner || null, distance: m.dist != null ? m.dist : Math.max(0, (m.path || []).length - 1),
        progress: mode === 'depart' ? 0 : mode === 'arrive' ? 1 : Math.max(0, Math.min(1, (now - m.depart) / total)), etaSec: Math.max(0, Math.round(((m.arrive || now) - now) / 1000)), totalSec: Math.round(total / 1000), party: (m.members || []).length,
        defence: defenceLines(v), warn: me && th && me.power < th * 0.5 && !own ? `Strong garrison - advised power ~${th}` : '', next: own ? 'Your own tile - reinforcing.' : v.owner && v.shieldUntil > now ? 'Freshly conquered - shielded, you will bounce.' : NEXT[kind.claim] || '',
    };
}
const soonText = (s, m) => `⏳ *Arriving at ${(E.view(s, m.tile) || {}).name} in ~20s.* Get ready${NEXT[(map.KINDS[(E.view(s, m.tile) || {}).kind] || {}).claim] ? ' - ' + NEXT[map.KINDS[(E.view(s, m.tile) || {}).kind].claim] : '.'}`;
const halfText = (s, m, left) => `🚶 *Halfway to ${(E.view(s, m.tile) || {}).name}* - about ${left}s to go. \`cq status\` shows the route.`;
module.exports = { routeOf, soonText, halfText, NEXT };
