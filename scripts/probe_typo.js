process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300';
const fs = require('fs'); const path = require('path');
async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    const uri = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
    process.env.MONGO_URI = uri;
    await require('mongoose').connect(uri, { serverSelectionTimeoutMS: 8000 });
}
(async () => {
    await connectDB();
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const GWE = require('../core/models/GuildWarEvent');
    await GWE.updateMany({ state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } }, { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'typoqa@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, { jid: 'ty@s.whatsapp.net', name: 'TY', guildId: 'G', guildName: 'G' });
    const started = await state.startEvent(created.event.eventId);
    const ev = started.event;
    const sock = { sent: [], async sendMessage(c, p) { this.sent.push(p); } };
    const dm = (txt) => dmRouter.handleDM(sock, 'ty@s.whatsapp.net', 'ty@s.whatsapp.net', txt, '\u200B', { prefix: '.j', prefixed: true });
    const pos = async () => (await state.getEvent(ev.eventId, { fresh: true })).players.find(p => p.jid === 'ty@s.whatsapp.net');
    const spawn = (await pos()).spawnRoomId;
    console.log('spawn:', spawn);
    const reset = async () => state.updatePlayer(ev.eventId, 'ty@s.whatsapp.net', {}, { roomId: spawn, prevRoomId: spawn, lastMoveAt: 0 });

    await reset();
    const r1 = await dm('.j move lwft');
    console.log('typo res:', JSON.stringify(r1), '| pos:', (await pos()).roomId);
    await reset();
    const r2 = await dm('.j move left');
    console.log('exact res:', JSON.stringify(r2), '| pos:', (await pos()).roomId);
    await require('mongoose').disconnect();
    process.exit(0);
})().catch(e => { console.error('fatal', e); process.exit(1); });
