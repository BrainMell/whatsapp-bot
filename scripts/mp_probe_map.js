// PROBE: .j map render — why no image?
const L = require('./mp_lib');
const RUN = Math.random().toString(36).slice(2, 6);
(async () => {
    await L.connectDB();
    L.overlaySprites();
    const roster = L.makeRoster([{ jid: 'mp' + RUN, name: 'Aria', guild: 'Alpha', class: 'FIGHTER', sprite: 0 }]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    const sock = L.makeSock('A');
    const res = await L.dm(sock, roster[0].jid, '.j map');
    console.log('res:', JSON.stringify(res ? { hasText: !!res.text, hasImage: !!res.image, text: (res.text || '').slice(0, 80) } : String(res)));
    console.log('sock images:', sock.sent.filter(s => s.payload.image).length);
    for (const s of sock.sent) console.log('msg:', s.payload.image ? '[IMG]' : '[txt]', (s.payload.caption || s.payload.text || '').slice(0, 90).replace(/\n/g, ' '));
    await require('../core/rpg/guildWar/state').abortEvent(ev.eventId, 'probe');
    L.restoreSprites();
    await require('mongoose').disconnect();
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
