// REJOIN PRESENTATION QA (owner 2026-10-06: "when they come back, map and
// encounter card per usual") — verifies the rejoin verb sends the standard
// room presentation (map card + encounter card) + the welcome text, instead
// of the old text-only reply.
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
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
(async () => {
    await connectDB();
    const state = require('../core/rpg/guildWar/state');
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const GWE = require('../core/models/GuildWarEvent');
    const ev0 = await state.createEvent({ type: 'normal', hostGroupId: 'rejoinqa@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(ev0.event.eventId, { jid: 'rj@s.whatsapp.net', name: 'RJ', guildId: 'G', guildName: 'G' });
    const started = await state.startEvent(ev0.event.eventId);
    const eventId = started.event.eventId;
    const me0 = (await state.getEvent(eventId, { fresh: true })).players.find(p => p.jid === 'rj@s.whatsapp.net');
    console.log('deployed: roomId', me0.roomId, '| status', me0.status);

    // force the chamber into an ACTIVE combat encounter so card #2 is the
    // encounter-scene card, the exact "per usual" shape after a move
    await GWE.updateOne({ eventId, 'rooms.key': me0.roomId }, { $set: { 'rooms.$.type': 'combat', 'rooms.$.state': 'ACTIVE' } });

    // go inactive (what the inactivity sweeper does)
    await state.updatePlayer(eventId, me0.jid, {}, { status: 'inactive', lastActionAt: 0 });

    // ── 1) inactive player asking something else still gets the nudge ──
    const sock1 = { sent: [], async sendMessage(c, p) { this.sent.push(p); } };
    const r1 = await dmRouter.handleDM(sock1, me0.jid, me0.jid, '.j look', '\u200B', { prefix: '.j', prefixed: true });
    check('inactive gate: nudge text mentions rejoin', !!r1 && /rejoin/.test(r1.text || ''), JSON.stringify(r1 && r1.text || '').slice(0, 80));

    // ── 2) the rejoin itself ──
    const sock = { sent: [], async sendMessage(c, p) { this.sent.push(p); } };
    const res = await dmRouter.handleDM(sock, me0.jid, me0.jid, '.j rejoin', '\u200B', { prefix: '.j', prefixed: true });
    const texts = sock.sent.map(s => (s.text || '').toString());
    const images = sock.sent.filter(s => s.image).length;
    console.log('sock messages:', sock.sent.length, '| images:', images, '| texts:', JSON.stringify(texts.map(t => t.slice(0, 70))));
    check('map card sent (image #1)', images >= 1, 'images=' + images);
    check('encounter card sent (image #2)', images >= 2, 'images=' + images);
    check('welcome/protection text present', !!(res && res.text && /Welcome back/.test(res.text)) || texts.some(t => /Welcome back/.test(t)));
    check('protection seconds quoted', !!(res && res.text && /\d+s/.test(res.text)));

    const doc = await state.getEvent(eventId, { fresh: true });
    const me = doc.players.find(p => p.jid === 'rj@s.whatsapp.net');
    check('status restored to active', me.status === 'active', 'status=' + me.status);
    check('spawn protection set in DB', (me.protectedUntil || 0) > Date.now());

    // ── 3) `return` alias works the same ──
    await state.updatePlayer(eventId, me0.jid, {}, { status: 'inactive' });
    const sock3 = { sent: [], async sendMessage(c, p) { this.sent.push(p); } };
    await dmRouter.handleDM(sock3, me0.jid, me0.jid, '.j return', '\u200B', { prefix: '.j', prefixed: true });
    check('alias `return` also presents cards', sock3.sent.filter(s => s.image).length >= 2);

    // ── 4) presentation failure still answers (fallback text) ──
    await state.updatePlayer(eventId, me0.jid, {}, { status: 'inactive', roomId: '9,9' }); // nonexistent chamber
    const sock4 = { sent: [], async sendMessage(c, p) { this.sent.push(p); } };
    const r4 = await dmRouter.handleDM(sock4, me0.jid, me0.jid, '.j rejoin', '\u200B', { prefix: '.j', prefixed: true });
    check('stale-room rejoin still gets welcome text', !!(r4 && r4.text && /Welcome back/.test(r4.text)));
    const doc4 = await state.getEvent(eventId, { fresh: true });
    check('stale-room rejoin still reactivates', doc4.players.find(p => p.jid === me0.jid).status === 'active');

    console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
    await require('mongoose').disconnect();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('fatal', e); process.exit(1); });
