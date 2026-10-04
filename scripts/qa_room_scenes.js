// Visual QA: render room scenes for every doorway variant + type treatment.
// Output → /home/z/my-project/scripts/qa_out/*.png (viewed by the agent).
process.env.GW_TEST = '1';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'qa_out');
fs.mkdirSync(OUT, { recursive: true });

function fakeEvent() {
    // 8-room 3x3-ish world with edges matching each variant we want to see
    const rooms = [
        { key: '1,1', x: 1, y: 1, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.3 },
        { key: '0,1', x: 0, y: 1, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.4 },
        { key: '2,1', x: 2, y: 1, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.4 },
        { key: '1,0', x: 1, y: 0, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.4 },
        { key: '1,2', x: 1, y: 2, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.4 },
        { key: '0,2', x: 0, y: 2, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.5 },
    ];
    return {
        eventId: 'qa', seed: 'qa-seed', side: 3, coreKey: '1,1', deadWorld: 'ember',
        type: 'normal', state: 'ACTIVE',
        rooms,
        edges: ['1,1|w', '0,1|e', '1,1|e', '2,1|w', '1,1|n', '1,0|s', '1,1|s', '1,2|n', '0,1|s', '0,2|n'],
        players: [],
    };
}

const PLAYER = {
    jid: 'qa@x', name: 'QA', classId: 'SAMURAI', spriteIndex: 3,
    roomId: '1,1', discovered: ['1,1', '0,1', '2,1', '1,0'], score: 0, lives: 3,
};

async function main() {
    const roomScene = require('../core/rpg/guildWar/roomScene');
    const ev = fakeEvent();
    const me = { ...PLAYER };

    const variants = [
        ['LFR_all_doors', ['n', 'e', 's', 'w']],
        ['LF_left_forward', ['n', 'w']],
        ['FR_right_forward', ['n', 'e']],
        ['LR_left_right', ['e', 'w']],
        ['F_forward_only', ['n']],
        ['R_right_only', ['e']],
        ['L_left_only', ['w']],
        ['S_back_only', ['s']],
        ['sealed_dead_end', []],
    ];
    for (const [name, dirs] of variants) {
        const doc = { ...ev };
        const player = { ...me, discovered: ['1,1'] };
        const room = ev.rooms[0];
        const buf = await roomScene.renderRoomScene(doc, player, room, {
            exits: dirs.map((d) => ({ dir: d, edge: true, known: true })),
            prefix: '.',
        });
        fs.writeFileSync(path.join(OUT, `variant_${name}.png`), buf);
        console.log('✓ variant_' + name);
    }

    // type treatments
    for (const t of ['combat', 'puzzle', 'reward', 'hazard', 'secret', 'core', 'cleared-empty']) {
        const doc = { ...ev };
        const room = { ...ev.rooms[0], type: t === 'cleared-empty' ? 'empty' : t, state: t === 'cleared-empty' ? 'CLEARED' : 'UNEXPLORED' };
        const buf = await roomScene.renderRoomScene(doc, me, room, {
            exits: [{ dir: 'n', edge: true, known: true }, { dir: 'w', edge: true, known: true }, { dir: 's', edge: true, known: true }],
            prefix: '.',
        });
        fs.writeFileSync(path.join(OUT, `type_${t}.png`), buf);
        console.log('✓ type_' + t);
    }
    console.log('done →', OUT);
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
