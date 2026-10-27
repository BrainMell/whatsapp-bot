'use strict';
// qa26b_freeze — live test of the Task 26-R2 time-freeze turn-card dim against the
// REAL Go renderer: builds a PVE roster where both enemies carry locked_in_time,
// renders a normal TURN card, then runs applyTimeFreezeDim and writes both PNGs
// for the visual before/after. Needs NODE_PATH=<bot>/node_modules; run anywhere
// on the box (Go service is a localhost HTTP microservice).
const fs = require('fs');
const cig = require('../core/rpg/combatImageGenerator');

function mkPlayer(i, name) {
    return {
        name, class: { id: 'FIGHTER' }, level: 40,
        hp: 900, stats: { hp: 900, maxHp: 900, energy: 100, maxEnergy: 100 },
        currentHP: 900, adventurerRank: 'A', spriteIndex: i, statusEffects: [],
    };
}
function mkEnemy(i, name, frozen) {
    return {
        name, level: 38,
        stats: { hp: 700, maxHp: 700 },
        currentHP: 700, spriteIndex: i, isBoss: false, statusEffects: [],
    };
}

(async () => {
    const outDir = process.argv[2] || '/tmp/r26bfull/freezeout';
    fs.mkdirSync(outDir, { recursive: true });
    const players = [mkPlayer(0, 'ChronoMain'), mkPlayer(1, 'PartyDuelist')];
    const enemies = [mkEnemy(0, 'Magma Brute'), mkEnemy(1, 'Ember Spellbreaker')];
    // the status shape guildAdventure.applyStatusEffect pushes
    enemies[0].statusEffects.push({ type: 'locked_in_time', duration: 2, icon: '⏳' });
    enemies[1].statusEffects.push({ type: 'locked_in_time', duration: 2, icon: '⏳' });

    const card = await cig.generateCombatImage(players, enemies, {
        combatType: 'PVE', rank: 'A', floor: 0, hud: 'v2', bypassQueue: true,
    });
    if (!card || !card.success) { console.error('card render failed', card && card.error); process.exit(2); }
    fs.writeFileSync(outDir + '/turn_normal.png', card.buffer);

    const dimmed = await cig.applyTimeFreezeDim(players, enemies, card.buffer, { combatType: 'PVE', rank: 'A', floor: 0 });
    if (dimmed) {
        fs.writeFileSync(outDir + '/turn_frozen.png', dimmed);
        console.log('[qa26b_freeze] OK — dimmed bytes:', dimmed.length, 'normal:', card.buffer.length);
        process.exit(0);
    }
    console.error('[qa26b_freeze] dim returned null');
    process.exit(1);
})().catch((e) => { console.error('[qa26b_freeze] fatal:', e); process.exit(2); });
