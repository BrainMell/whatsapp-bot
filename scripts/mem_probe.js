'use strict';
// mem_probe.js v2 — Task 37 speed round: measure static + anim timings
// guild static (ss=1.5) / base anim (ss=1) / room anim (ss=1) / guild celebrate anim (ss=1)
const fs = require('fs');
const rss = () => {
    try {
        const s = fs.readFileSync('/proc/self/status', 'utf8');
        const m = s.match(/VmRSS:\s+(\d+) kB/);
        const h = s.match(/VmHWM:\s+(\d+) kB/);
        return { rss: +(m && m[1] || 0), hwm: +(h && h[1] || 0) };
    } catch (e) { return { rss: 0, hwm: 0 }; }
};
const MB = (kb) => (kb / 1024).toFixed(1) + 'MB';

(async () => {
    let r = rss();
    console.log(`[probe] start rss=${MB(r.rss)} hwm=${MB(r.hwm)}`);

    const guild = require('../core/rpg/guildBaseRenderer');
    const gState = (n) => ({
        name: n, level: 5, archetype: 'ADVENTURER',
        buildings: { hall: 5, training: 3, treasury: 5 },
        memberCount: 5, memberCap: 25,
        emblemColor: '#a02c3c', emblemIcon: 'V', motto: 'Steel and mead',
    });

    let t = Date.now();
    const g = await guild.renderGuildBaseImage(gState('MemProbeG3'), {});
    r = rss();
    console.log(`[probe] guild static: ${g.contentType} ${(g.buffer.length / 1048576).toFixed(2)}MB in ${((Date.now() - t) / 1000).toFixed(1)}s | rss=${MB(r.rss)} hwm=${MB(r.hwm)}`);

    const base = require('../core/rpg/homesteadBaseRenderer');
    const bState = {
        owner: 'MemProbeB3',
        structures: [
            { uid: 'h', type: 'house', level: 1, x: 6, y: 7 },
            { uid: 'm', type: 'mines', level: 1, x: 1, y: 1 },
            { uid: 'p', type: 'pond', level: 1, x: 12, y: 1 },
        ],
        freePlots: [{ x: 3, y: 12, id: 1 }],
    };
    t = Date.now();
    const b = await base.renderBaseImage(bState, {});
    r = rss();
    console.log(`[probe] base anim: ${b.contentType} ${(b.buffer.length / 1048576).toFixed(2)}MB in ${((Date.now() - t) / 1000).toFixed(1)}s | rss=${MB(r.rss)} hwm=${MB(r.hwm)}`);

    const room = require('../core/rpg/homesteadRenderer');
    const rState = { owner: 'MemProbeR3', theme: 'oakhaven', placed: [] };
    t = Date.now();
    const rm = await room.renderRoomImage(rState, {});
    r = rss();
    console.log(`[probe] room anim: ${rm.contentType} ${(rm.buffer.length / 1048576).toFixed(2)}MB in ${((Date.now() - t) / 1000).toFixed(1)}s | rss=${MB(r.rss)} hwm=${MB(r.hwm)}`);

    t = Date.now();
    const ga = await guild.renderGuildBaseImage(gState('MemProbeGA3'), { static: false });
    r = rss();
    console.log(`[probe] guild anim(celebrate): ${ga.contentType} ${(ga.buffer.length / 1048576).toFixed(2)}MB in ${((Date.now() - t) / 1000).toFixed(1)}s | rss=${MB(r.rss)} hwm=${MB(r.hwm)}`);

    console.log('[probe] done');
    process.exit(0);
})().catch((e) => { console.error('[probe] FAIL', e && e.message || e); process.exit(1); });
