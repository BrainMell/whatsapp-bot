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
    const ga = require('../core/rpg/guildAdventure');
    ga.startRuinsCombat = async () => ({ success: true, sessionKey: 'sim' });
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'fleeqa2@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, { jid: 'pz@s.whatsapp.net', name: 'PZ', guildId: 'G', guildName: 'G' });
    const started = await state.startEvent(created.event.eventId);
    const ev = started.event;
    const doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = doc.players.find(p => p.jid === 'pz@s.whatsapp.net');
    console.log('status:', me.status, '| spawn:', me.spawnRoomId, '| roomId:', me.roomId);
    const types = doc.rooms.map(r => `${r.key}:${r.type}:${r.state}`).join(' ');
    console.log('rooms:', types);
    const puzzle = doc.rooms.find(r => r.type === 'puzzle') || doc.rooms.find(r => r.key !== me.spawnRoomId);
    const GWE = require('../core/models/GuildWarEvent');
    const ur = await GWE.updateOne({ eventId: ev.eventId, 'rooms.key': puzzle.key }, { $set: { 'rooms.$.type': 'puzzle', 'rooms.$.state': 'ACTIVE' } });
    console.log('forced', puzzle.key, '→ puzzle, matched:', ur.matchedCount, 'modified:', ur.modifiedCount);
    await state.updatePlayer(ev.eventId, me.jid, {}, { roomId: puzzle.key, prevRoomId: me.spawnRoomId, lastMoveAt: 0 });
    const doc2 = await state.getEvent(ev.eventId, { fresh: true });
    const me2 = doc2.players.find(p => p.jid === 'pz@s.whatsapp.net');
    const room2 = doc2.rooms.find(r => r.key === me2.roomId);
    console.log('pre-flee: roomId:', me2.roomId, '| room.type:', room2 && room2.type, '| room.state:', room2 && room2.state, '| prev:', me2.prevRoomId);
    const sock = { sent: [], async sendMessage(c, p) { this.sent.push(p); } };
    const res = await dmRouter.handleDM(sock, me.jid, me.jid, '.j flee', '\u200B', { prefix: '.j', prefixed: true });
    console.log('flee res:', JSON.stringify(res));
    console.log('sock sent:', sock.sent.length, JSON.stringify(sock.sent.map(s => (s.text || (s.image ? '[img]' : '?')).toString().slice(0, 60))));
    const doc3 = await state.getEvent(ev.eventId, { fresh: true });
    console.log('post-flee roomId:', doc3.players.find(p => p.jid === 'pz@s.whatsapp.net').roomId);
    await require('mongoose').disconnect();
    process.exit(0);
})().catch(e => { console.error('fatal', e); process.exit(1); });
