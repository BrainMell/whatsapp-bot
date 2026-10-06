// ISOLATE: does planFor build rivals/mates, and does renderRoomScene draw them?
const { createCanvas, loadImage } = require('/home/z/my-project/repo/node_modules/canvas');
const roomScene = require('/home/z/my-project/repo/core/rpg/guildWar/roomScene');

const A = { jid: 'a@s.whatsapp.net', name: 'Aria', guildId: 'Alpha', guildName: 'Alpha', classId: 'FIGHTER', spriteIndex: 0, roomId: '2,2', prevRoomId: '1,2', discovered: [], lives: 3, status: 'active' };
const B = { jid: 'b@s.whatsapp.net', name: 'Brutus', guildId: 'Bravo', guildName: 'Bravo', classId: 'BERSERKER', spriteIndex: 1, roomId: '2,2', prevRoomId: '2,2', discovered: [], lives: 3, status: 'active' };

function makeDoc() {
    const rooms = ['1,2', '2,2', '3,2', '2,1', '2,3'].map((key) => {
        const [x, y] = key.split(',').map(Number);
        return { key, x, y, region: 0, type: 'empty', state: 'UNEXPLORED', payload: {}, ring: 0, variant: 'intact', clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: key === '2,2' ? [A.jid, B.jid] : [], residue: null };
    });
    return { eventId: 'gw_planprobe', seed: 's1', type: 'normal', state: 'ACTIVE', side: 8, rooms, edges: ['1,2|e', '2,2|w', '2,2|e', '3,2|w', '2,1|s', '2,2|n', '2,3|n', '2,2|s'], coreKey: '9,9', deadWorld: 'ember', players: [A, B] };
}

(async () => {
    const doc = makeDoc();
    const room = doc.rooms.find(r => r.key === '2,2');
    // exits for A who entered from west (1,2 → 2,2)
    const exits = roomScene.exitsFor(doc, A);
    console.log('exits:', JSON.stringify(exits.filter(e => e.edge)));
    const plan = roomScene.planFor(doc, A, room, exits);
    console.log('playerSpot:', JSON.stringify(plan.playerSpot));
    console.log('mates:', plan.mates.length, 'rivals:', plan.rivals.length);
    console.log('rival[0]:', JSON.stringify(plan.rivals[0]));
    console.log('rival file:', plan.rivals[0] && plan.rivals[0].file);
    // _renderInProcess is the internal full render; call it directly
    const buf = await roomScene._renderInProcess(doc, A, room, {});
    require('fs').writeFileSync('/home/z/my-project/download/mp_playtest/smoke/plan_isolate.png', buf);
    console.log('rendered plan_isolate.png');
    process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
