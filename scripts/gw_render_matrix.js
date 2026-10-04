// Render matrix for the entry-door spawn + over-head HUD redesign.
// Usage: node scripts/gw_render_matrix.js [outdir]
'use strict';
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || '/home/z/my-project/envwork/gw_matrix';
fs.mkdirSync(OUT, { recursive: true });

const roomScene = require('../core/rpg/guildWar/roomScene');

function mkEvent() {
    return {
        eventId: 'qa', seed: 'qa-seed-1', deadWorld: 'emberfall',
        side: 9, coreKey: '4,4', edges: [
            '2,2|e', '2,3|e', '3,3|e', '2,2|s', '2,3|s', '3,3|s',
        ],
        rooms: [
            { key: '2,2', type: 'empty', state: 'UNEXPLORED', ring: 0, payload: {}, occupants: [] },
            { key: '3,3', type: 'empty', state: 'UNEXPLORED', ring: 0, payload: {}, occupants: [] },
        ],
        players: [],
    };
}

function mkPlayer(prev, cur, extra = {}) {
    return {
        jid: 'champ@s.whatsapp.net', name: 'Brainard', guildId: 'g1', guildName: 'Valhalla',
        roomId: cur, prevRoomId: prev, discovered: ['3,3'],
        stats: { hp: 52, maxHp: 100, energy: 142, maxEnergy: 142 },
        level: 9, classId: 'APPRENTICE', spriteIndex: 0, adventurerRank: 'D',
        ...extra,
    };
}

function exitsForKeys(eventDoc, player, keys) {
    // keys: array of ['w'|'e'|'n'|'s', known?] — hand-built exits
    return ['n', 'e', 's', 'w'].map((dir) => {
        const hit = keys.find((k) => k[0] === dir);
        if (!hit) return { dir, edge: false };
        return { dir, edge: true, known: hit[1] !== false, kind: 'empty', cleared: false, key: '3,3' };
    });
}

const CASES = [
    { name: 'entry_w',   player: mkPlayer('1,2', '2,2'), exits: [['w'], ['e']] },
    { name: 'entry_e',   player: mkPlayer('3,2', '2,2'), exits: [['w'], ['e']] },
    { name: 'entry_n',   player: mkPlayer('2,1', '2,2'), exits: [['n'], ['w']] },
    { name: 'entry_s',   player: mkPlayer('2,3', '2,2'), exits: [['w'], ['e']] },
    { name: 'war_start', player: mkPlayer(null, '2,2'),  exits: [['w'], ['e']] },
    { name: 'combat_w',  player: mkPlayer('1,2', '2,2'), exits: [['w'], ['e']],
      room: { type: 'combat', state: 'ACTIVE', payload: { enemies: [{ level: 10 }, { level: 10 }, { level: 12 }] } } },
    { name: 'combat_e',  player: mkPlayer('3,2', '2,2'), exits: [['w'], ['e']],
      room: { type: 'combat', state: 'ACTIVE', payload: { enemies: [{ level: 10 }, { level: 10 }] } } },
    { name: 'cleared',   player: mkPlayer('1,2', '2,2'), exits: [['w'], ['e']],
      room: { type: 'combat', state: 'CLEARED', payload: {} } },
    { name: 'meeting',   player: mkPlayer('1,2', '2,2'), exits: [['w'], ['e']],
      room: { type: 'empty', state: 'UNEXPLORED', occupants: ['mate@s.whatsapp.net', 'rival@s.whatsapp.net'],
              payload: {} },
      extraPlayers: [
          { jid: 'mate@s.whatsapp.net', name: 'Ulfric', guildId: 'g1', classId: 'FIGHTER', spriteIndex: 0 },
          { jid: 'rival@s.whatsapp.net', name: 'Sable', guildId: 'g2', classId: 'ROGUE', spriteIndex: 1 },
      ] },
    { name: 'landmark',  player: mkPlayer('1,2', '2,2'), exits: [['w'], ['e']],
      room: { type: 'landmark', state: 'UNEXPLORED', payload: { landmarkName: 'The Pale Obelisk' } } },
    { name: 'variant_mossy', player: mkPlayer('3,2', '2,2'), exits: [['w'], ['e']],
      room: { type: 'empty', state: 'UNEXPLORED', variant: 'mossy', payload: {} } },
];

(async () => {
    for (const c of CASES) {
        const eventDoc = mkEvent();
        if (c.extraPlayers) eventDoc.players.push(...c.extraPlayers);
        const room = { key: '2,2', ring: 0, occupants: [], payload: {}, ...(c.room || {}) };
        const opts = { exits: exitsForKeys(eventDoc, c.player, c.exits), prefix: '.jk' };
        try {
            const buf = await roomScene._renderInProcess(eventDoc, c.player, room, opts);
            fs.writeFileSync(path.join(OUT, c.name + '.png'), buf);
            console.log('OK', c.name);
        } catch (e) {
            console.error('FAIL', c.name, e.message);
        }
    }
    process.exit(0);
})();
