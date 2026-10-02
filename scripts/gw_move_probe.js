process.env.GW_TEST = '1';
const mongoose = require('mongoose');
(async () => {
    const connectDB = require('../db');
    await connectDB();
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    await GuildWarEvent.deleteMany({});
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'm@g.us', initiatedBy: 'x' });
    await state.registerPlayer(created.event.eventId, { jid: 'mp@s.whatsapp.net', name: 'MP', guildId: 'G', guildName: 'G' });
    const s = await state.startEvent(created.event.eventId);
    const p = s.event.players[0];
    // wait out cooldown
    await new Promise((r) => setTimeout(r, 6100));
    try {
        const r = await dmRouter.handleDM({ async sendMessage() {} }, p.jid, p.jid, 'move n', 'GW');
        console.log('move result:', r ? (r.text || '').slice(0, 80) : 'null');
    } catch (e) {
        console.log('MOVE THREW:', e.message);
        console.log(e.stack.split('\n').slice(1, 4).join('\n'));
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
