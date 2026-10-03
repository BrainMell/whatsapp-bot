// Renders every Guild War visual for the vision pass → scripts/render_out/gw_*.png
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
(async () => {
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const renderer = require('../core/rpg/guildWar/mapRenderer');
    const notice = require('../core/rpg/guildWar/noticeCard');
    const outDir = path.join(__dirname, 'render_out');
    fs.mkdirSync(outDir, { recursive: true });

    const mk = (seed, players, alignment, worldIds) => mapEngine.generate(seed, players, { alignment, worldIds });
    const playersFor = (map, n) => Array.from({ length: n }, (_, i) => ({
        jid: `p${i}@s.whatsapp.net`, name: `Player${i}`, guildId: i % 2 ? 'GuildB' : 'GuildA',
        guildName: i % 2 ? 'GuildB' : 'GuildA', roomId: map.spawns[i % map.spawns.length],
        prevRoomId: map.spawns[i % map.spawns.length], spawnRoomId: map.spawns[i % map.spawns.length],
        status: 'active', discovered: [], relics: [], score: 10 + i, lives: 3,
    }));
    const fogFor = (map, player, radius) => {
        const [x, y] = player.roomId.split(',').map(Number);
        const seen = [];
        for (const r of map.rooms.values()) {
            const d = Math.abs(r.x - x) + Math.abs(r.y - y);
            const inRing = Math.random() < 0.55 + r.ring * 0.2; // organic exploration shape
            if (d <= 6 + radius * 2 || (inRing && d <= Math.floor(map.side / 1.8))) seen.push(r.key);
        }
        return seen;
    };

    const shots = [
        ['gw_map_small', 'gw-vis-small', 10, false, null, 2],
        ['gw_map_medium', 'gw-vis-medium', 40, false, null, 3],
        ['gw_map_large', 'gw-vis-large', 100, false, null, 4],
        ['gw_map_alignment', 'gw-vis-align', 150, true, ['ember', 'frost', 'ash'], 5],
    ];
    for (const [name, seed, players, alignment, worldIds, heroIdx] of shots) {
        const map = mk(seed, players, alignment, worldIds);
        const doc = {
            eventId: 'vis', type: alignment ? 'alignment' : 'normal', side: map.side, seed,
            coreKey: map.coreKey, edges: [...map.adjacency].flatMap(([k, d]) => Object.entries(d).filter(([, v]) => v).map(([dir]) => `${k}|${dir}`)),
            rooms: [...map.rooms.values()],
            players: playersFor(map, Math.min(players, 20)),
        };
        const hero = doc.players[heroIdx % doc.players.length];
        hero.discovered = fogFor(map, hero, heroIdx % 3);
        const mates = doc.players.filter((p) => p !== hero).slice(0, 3).map((p) => ({ jid: p.jid, name: p.name, roomId: p.roomId }));
        const enemies = doc.players.filter((p) => p.guildId !== hero.guildId).slice(0, 2).map((p) => ({ jid: p.jid, name: p.name, roomId: p.roomId, movedAt: Date.now() }));
        const buf = await renderer.renderRuinsMap(doc, hero, { mates, enemyPings: enemies });
        fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
        console.log(`rendered ${name} (${map.side}x${map.side}, ${buf.length} bytes)`);
    }
    // official notice card
    const nbuf = await notice.renderNotice('The Guild Association declares a GUILD WAR. The Ruins of a dead world await: exploration, discovery, rival guilds, and relics of the old order. Players join now; the live feed follows here. Registration closes in 10 minutes.');
    fs.writeFileSync(path.join(outDir, 'gw_notice.png'), nbuf);
    console.log('rendered gw_notice');
    const abuf = await notice.renderNotice('The walls between worlds have grown weak. The Guild Association calls all guilds to war across the joined worlds: greater dangers, greater glory, the largest Guild Points the system has ever offered.', { title: 'WORLD ALIGNMENT', kicker: 'BY DECREE OF THE GUILD ASSOCIATION' });
    fs.writeFileSync(path.join(outDir, 'gw_notice_alignment.png'), abuf);
    console.log('rendered gw_notice_alignment');
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
