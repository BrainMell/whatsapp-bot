'use strict';
// 🚀 CONQUEST LAUNCH — Conquest IS the guild war. Called when a war deploys (forcestart / auto-start / `start -test`):
// builds the war state, indexes every member so `cq` works from ANY chat (group or DM — nobody has to DM the bot),
// and posts the "THE MAP IS OPEN" card to the host group. Test wars run ~7x faster and add two NPC rival guilds.
//   GW_CONQUEST=1            enables the layer;  GW_CONQUEST_MODE=legacy keeps the old ruins-war flow instead (default: conquest)
const E = require('./engine'); const map = require('./mapgen'); const store = require('./store'); const { enabled } = require('./config');
const mode = () => (String(process.env.GW_CONQUEST_MODE || 'conquest').toLowerCase());
const replacesLegacy = () => enabled() && mode() !== 'legacy';
const NPC = ['Iron Wardens', 'Ashen Court'];

function guildsOf(ev) {
    const cmd = require('./commands'); const names = [...new Set((ev.players || []).filter((p) => p.guildName).map((p) => p.guildName))];
    return names.map((n) => ({ name: n, roles: cmd.rolesFor(n), members: (ev.players || []).filter((p) => p.guildName === n && p.status !== 'quit').map((p) => p.jid) }));
}
function helpCaption(prefix, test, guildNames) {
    const P = `${prefix} cq`;
    return `🗺️ *THE MAP IS OPEN* — Guild Conquest has begun${test ? ' (🧪 TEST WAR: everything runs ~7x faster, 2 NPC rival guilds hold keeps for you to siege)' : ''}!\n\n` +
        `Guilds in the field: ${guildNames.map((n) => `*${n}*`).join(' · ')}\n\n` +
        `Nothing is forced and nobody has to DM: play right here in the group — or DM the bot if you prefer.\n` +
        `• \`${P}\` — your map (zoomed, with your Keep)\n• \`${P} targets\` — numbered places to claim\n• \`${P} march <#>\` — walk there (route card + arrival reminders)\n` +
        `• \`${P} realm\` — whole-realm overview\n• \`${P} help\` — everything else\n\n` +
        `Every place is different: open ground & villages claim on arrival · fortresses, passes & gates need a *Wall Breach* siege · ruins hide a *glyph rite* · shrines want a *treaty* · Titan lairs hold a *boss*. ` +
        `Explore, mine ◆ Aether veins, and fly your banner over the realm.`;
}
async function launch(sock, ev, { chatId = null, prefix = '.', test = false } = {}) {
    const guilds = guildsOf(ev); const host = chatId || ev.hostGroupId || null;
    if (test) for (const n of NPC) if (!guilds.some((g) => g.name === n)) guilds.push({ name: n, roles: {}, members: [], npc: true });
    const create = () => { const s = E.newWar({ key: ev.eventId, seed: map.hashStr(String(ev.eventId)), guilds, hours: test ? 1 : 3, test, hostGroup: host }); for (const g of guilds) if (g.npc && s.guilds[g.name]) s.guilds[g.name].npc = true; for (const p of Object.values(s.players)) p.chat = host; return s; };
    await store.mutate(ev.eventId, () => true, create);
    for (const g of guilds) for (const j of g.members) { try { await store.setIndex(j, ev.eventId); } catch (e) { console.warn('[conquest] index', e.message); } }
    const first = guilds.find((g) => g.members.length); let img = null;
    try { if (first) { const s = await store.load(ev.eventId); const d = require('./commands').mapSnap(s, first.name, first.members[0]); d.view = 'overview'; d.route = null; img = await require('./render').renderMap(d); } } catch (e) { console.warn('[conquest] launch card', e.message); }
    const caption = helpCaption(prefix, test, guilds.map((g) => g.name));
    if (host && sock) { try { await sock.sendMessage(host, img ? { image: img, caption } : { text: caption }); } catch (e) { console.warn('[conquest] announce', e.message); } }
    try { setTimeout(() => require('./cards').warm(map.hashStr(String(ev.eventId))), 3000).unref(); } catch (e) { /* warm-up only */ }
    return { ok: true, guilds: guilds.map((g) => g.name), test };
}
module.exports = { launch, replacesLegacy, mode, NPC };
