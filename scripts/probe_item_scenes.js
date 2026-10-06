// Evidence probe: render every encounter-item room type so we can audit
// item shadows + the broken open-chest sprite (owner 2026-10-06).
process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300';
process.env.GW_SIM_DB = 'gwitemqa' + Math.floor(Math.random() * 100000);
const L = require('./mp_lib');
const fs = require('fs');
const state = require('../core/rpg/guildWar/state');
const roomScene = require('../core/rpg/guildWar/roomScene');
const GWE = require('../core/models/GuildWarEvent');

(async () => {
    await L.connectDB();
    L.overlaySprites();
    const roster = L.makeRoster([
        { jid: 'qa1', name: 'Aria', guild: 'GQ', class: 'FIGHTER', sprite: 0 },
    ]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = doc.players.find((p) => p.jid === roster[0].jid);
    const out = '/home/z/my-project/download/item_fix_qa';
    fs.mkdirSync(out, { recursive: true });

    // one showcase room per item type — vary ground line so shadows are visible
    const cases = [
        ['reward_closed', 'reward', 'ACTIVE', {}],
        ['reward_open', 'reward', 'CLEARED', {}],
        ['discovery', 'discovery', 'ACTIVE', {}],
        ['discovery_cleared', 'discovery', 'CLEARED', {}],
        ['puzzle', 'puzzle', 'ACTIVE', {}],
        ['trapped', 'trapped', 'ACTIVE', {}],
        ['lore', 'lore', 'ACTIVE', {}],
        ['anomaly', 'anomaly', 'ACTIVE', {}],
        ['landmark', 'landmark', 'ACTIVE', {}],
        ['secret', 'secret', 'ACTIVE', {}],
    ];
    for (const [name, type, st, payload] of cases) {
        const room = {
            key: '5,3', type, state: st, ring: 1, occupants: [me.jid],
            payload,
        };
        const buf = await roomScene._renderInProcess(doc, me, room, {});
        if (buf) fs.writeFileSync(`${out}/${name}.png`, buf);
        console.log(name, buf ? 'rendered ' + buf.length + 'b' : 'FAILED');
    }
    await GWE.deleteMany({ eventId: ev.eventId });
    L.restoreSprites();
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); try { L.restoreSprites(); } catch (_) {} process.exit(1); });
