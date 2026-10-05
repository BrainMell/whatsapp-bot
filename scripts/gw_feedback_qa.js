#!/usr/bin/env node
// ============================================
// QA HARNESS — GW owner feedback pass 2026-10-05
// Renders the scenarios behind the owner's seven feedback items:
//   1. chest CLAIMED open sprite after `take`      (reward CLEARED scene)
//   2. PvE pack spawns OPPOSITE the entry door     (w/e/n/s battle scenes)
//   3/4. decree Ruins victory/defeat end cards     (endCard.js)
//   5. floating blue crystal replaces the gold ring (battle scenes)
//   7. natural contact shadow at the back wall     (n-entry scene)
// Pure in-process renders (same code path the render worker runs), no DB.
// ============================================

const fs = require('fs');
const path = require('path');
const roomScene = require('../core/rpg/guildWar/roomScene');
const endCard = require('../core/rpg/guildWar/endCard');

const OUT = '/home/z/my-project/download/gw_qa_1005';
fs.mkdirSync(OUT, { recursive: true });

function makeDoc(seed, roomsExtra = []) {
    // small fixed world: 3x3 grid with a plus-shaped topology
    const side = 3;
    const rooms = [];
    const types = { '0,0': 'empty', '1,0': 'combat', '2,0': 'empty', '0,1': 'empty', '1,1': 'core', '2,1': 'empty', '0,2': 'empty', '1,2': 'reward', '2,2': 'empty' };
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
        const key = `${x},${y}`;
        rooms.push({ key, x, y, region: 0, type: types[key] || 'empty', state: 'UNEXPLORED', payload: {}, ring: 0.3, clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: [], residue: null, ...roomsExtra.find((r) => r.key === key) });
    }
    // full grid edges (every orthogonal neighbour open) — simple for QA
    const edges = [];
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
        if (x + 1 < side) edges.push(`${x},${y}|e`);
        if (y + 1 < side) edges.push(`${x},${y}|s`);
    }
    return {
        eventId: 'gw_qa', seed, type: 'normal', state: 'ACTIVE', side,
        rooms, edges, coreKey: '1,1', deadWorld: 'ember', players: [],
    };
}

function makePlayer(entryDir, overrides = {}) {
    // entry door = the INVERSE of the move delta, same rule roomScene uses:
    // dx=+1 → 'w', dx=-1 → 'e', dy=+1 → 'n', dy=-1 → 's'. Each entry needs
    // a (prev → cur) pair exactly one grid step apart.
    const pos = {
        w: { cur: '1,0', prev: '0,0' },   // moved east → entered through west
        e: { cur: '1,0', prev: '2,0' },   // moved west → entered through east
        n: { cur: '1,1', prev: '1,0' },   // moved south → entered through back
        s: { cur: '0,1', prev: '0,2' },   // moved north → entered through front
    }[entryDir];
    return {
        jid: 'qa@s.whatsapp.net', name: 'Brainard', classId: 'FIGHTER', spriteIndex: 0,
        roomId: pos.cur, prevRoomId: pos.prev, discovered: [pos.cur],
        guildId: 'ember', guildName: 'Ember',
        level: 9, stats: { hp: 84, maxHp: 110, energy: 60, maxEnergy: 142 },
        ...overrides,
    };
}

const battleFor = (active) => ({
    player: { hp: 84, maxHp: 110, energy: 121, maxEnergy: 142, state: 'TURN 4' },
    enemyStates: [
        { name: 'Ash-choked Gloomhound', hp: 66, maxHp: 120, alive: true },
        { name: 'Ember Warden', hp: 0, maxHp: 100, alive: false },
        { name: 'Cinder Skulk', hp: 100, maxHp: 100, alive: true },
    ],
    active,
    panel: true,
});

const combatPayload = { enemies: [{ level: 12 }, { level: 12 }, { level: 12 }], theme: 'ember', flavor: 'Ash-choked' };

(async () => {
    const renders = [];

    // ── 1) the four entry directions, live battle, crystal on the player ──
    for (const dir of ['w', 'e', 'n', 's']) {
        const doc = makeDoc(`qa-battle-${dir}`);
        const player = makePlayer(dir);
        const room = doc.rooms.find((r) => r.key === player.roomId);
        room.type = 'combat';
        room.payload = combatPayload;
        const exits = roomScene.exitsFor(doc, player);
        const plan = roomScene.planFor(doc, player, room, exits);
        const png = await roomScene._renderInProcess(doc, player, room, { exits, plan, battle: battleFor('player') });
        fs.writeFileSync(path.join(OUT, `battle_entry_${dir}.png`), png);
        renders.push(`battle_entry_${dir}.png  entry=${player.prevRoomId}->${player.roomId} pack=${plan.enemies.map((e) => `${e.x},${e.y}`).join(' | ')}`);
    }

    // ── 1b) crystal on an enemy (enemy turn) ──
    {
        const doc = makeDoc('qa-battle-w');
        const player = makePlayer('w');
        const room = doc.rooms.find((r) => r.key === player.roomId);
        room.type = 'combat';
        room.payload = combatPayload;
        const exits = roomScene.exitsFor(doc, player);
        const plan = roomScene.planFor(doc, player, room, exits);
        const png = await roomScene._renderInProcess(doc, player, room, { exits, plan, battle: battleFor(0) });
        fs.writeFileSync(path.join(OUT, `battle_entry_w_enemy_turn.png`), png);
        renders.push('battle_entry_w_enemy_turn.png  crystal on enemy 0');
    }

    // ── 2) chest: intact vs CLAIMED ──
    for (const [state, name] of [['UNEXPLORED', 'reward_intact'], ['CLEARED', 'reward_claimed']]) {
        const doc = makeDoc('qa-chest');
        const player = makePlayer('w');
        const room = doc.rooms.find((r) => r.key === player.roomId);
        room.type = 'reward';
        room.state = state;
        room.payload = { relic: { name: 'Ember Sigil', category: 'trophies', tier: 'rare' }, zeni: 900 };
        const exits = roomScene.exitsFor(doc, player);
        const plan = roomScene.planFor(doc, player, room, exits);
        const png = await roomScene._renderInProcess(doc, player, room, { exits, plan });
        fs.writeFileSync(path.join(OUT, `${name}.png`), png);
        renders.push(`${name}.png  chest state=${state}`);
    }

    // ── 3) decree end cards ──
    const victoryCard = await endCard.renderRuinsEndCard({
        victory: true, playerName: 'Brainard', guildName: 'Ember Wardens',
        roomLabel: 'guarded hall', chamberKey: '3,4', gp: 1480,
        relicNames: ['Ember Sigil', 'Ashen Crown Shard', 'Vault Key', 'Cracked Idol'],
        lives: 2,
    });
    fs.writeFileSync(path.join(OUT, 'end_card_victory.png'), victoryCard);
    renders.push('end_card_victory.png  decree parchment');

    const defeatCard = await endCard.renderRuinsEndCard({
        victory: false, playerName: 'Brainard', guildName: 'Ember Wardens',
        roomLabel: 'guarded hall', chamberKey: '1,0', gp: 620,
        relicNames: ['Ember Sigil'], lives: 1,
    });
    fs.writeFileSync(path.join(OUT, 'end_card_defeat.png'), defeatCard);
    renders.push('end_card_defeat.png  decree parchment (cracked seal)');

    console.log('RENDERS:');
    for (const r of renders) console.log('  ' + r);
    console.log('OUT:', OUT);
    process.exit(0);
})().catch((e) => { console.error('QA FAILED:', e); process.exit(1); });
