// Render live Abyss samples on-box (real canvas, deployed assets @859adad):
//  1) combat scene — forward-facing pool monster (ref style), stalactite hall
//  2) CAVE BAT combat — winged front-facing single (was a broken sheet)
//  3) wild summon duel — the game's OWN dragon sprite right, player left
//  4) floor descent card GIF — ring stack descend/return loop
// Run: node scripts/render_abyss_fix.js  (writes scripts/render_out/abyss_fix/)
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');

// stub the heavy/DB-ish modules the same way abyss_visual_qa.js does
const ciPath = require.resolve(path.join(REPO, 'core/rpg/combatIntegration'));
require.cache[ciPath] = { id: ciPath, filename: ciPath, loaded: true,
    exports: { generateStartCaption: () => 'cap-start', generateTurnCaption: () => 'cap-turn' } };
const ecoPath = require.resolve(path.join(REPO, 'core/rpg/economy'));
require.cache[ecoPath] = { id: ecoPath, filename: ecoPath, loaded: true,
    exports: { getUserClass: () => ({ id: 'ROGUE' }), getUser: () => ({ class: 'ROGUE', spriteIndex: 1 }), getDisplayName: () => 'Mellow-San' } };
const progPath = require.resolve(path.join(REPO, 'core/rpg/progression'));
require.cache[progPath] = { id: progPath, filename: progPath, loaded: true,
    exports: { getBaseStats: () => ({ hp: 100, maxEnergy: 50 }), getLevel: () => 10 } };

const abyssScene = require(path.join(REPO, 'core/rpg/abyssScene'));

const OUT = path.join(__dirname, 'render_out', 'abyss_fix');
fs.mkdirSync(OUT, { recursive: true });

const mkState = (over) => Object.assign({
    chatId: 'sample', isAbyss: true, dungeonRank: 0, sessionKey: null,
    abyssRun: { currentEncounterType: 'combat' },
    players: [{ jid: 'x@s', name: 'Mellow-San', class: { id: 'ROGUE' }, currentHP: 300, stats: { hp: 300, maxHp: 500 }, mana: 60, maxMana: 100 }],
    enemies: [{ name: 'STONE HULK', isEnemy: true, spriteIndex: 35, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
    summons: [],
}, over);

(async () => {
    // 1) combat — forward-facing single like the reference
    const r1 = await abyssScene.renderAbyssCombat(mkState({ abyssFloor: 7 }), { phase: 'START', turnOrderStr: 'Mellow-San' });
    if (r1.success) fs.writeFileSync(path.join(OUT, 'abyss_fix_combat.png'), r1.buffer);
    console.log('combat:', r1.success, r1.success && r1.buffer.length);

    // 2) CAVE BAT — winged front-facing single (was a scattered sheet render)
    const r2 = await abyssScene.renderAbyssCombat(mkState({
        abyssFloor: 3,
        enemies: [{ name: 'CAVE BAT', isEnemy: true, spriteIndex: 42, currentHP: 260, stats: { hp: 260, maxHp: 420 } }],
    }), { phase: 'START' });
    if (r2.success) fs.writeFileSync(path.join(OUT, 'abyss_fix_bat.png'), r2.buffer);
    console.log('bat:', r2.success, r2.success && r2.buffer.length);

    // 3) wild summon duel — OWN dragon sprite (player LEFT, summon RIGHT)
    const r3 = await abyssScene.renderAbyssCombat(mkState({
        abyssFloor: 2,
        abyssRun: { currentEncounterType: 'wild_summon', currentEncounterData: { species: 'dragon', rarity: 'RARE' } },
        enemies: [{ name: 'Wild Pyraxis', isWildSummon: true, currentHP: 400, stats: { hp: 400, maxHp: 600 } }],
        summons: [{ species: 'bat', name: 'Nocturne' }],
    }), { phase: 'START' });
    if (r3.success) fs.writeFileSync(path.join(OUT, 'abyss_fix_summon.png'), r3.buffer);
    console.log('summon:', r3.success, r3.success && r3.buffer.length);

    // 4) floor descent card GIF (ring stack slowly descends, starts back up)
    const gif = await abyssScene.renderAbyssFloorCard({
        floor: 7, tier: 'A', mult: 1.9, encounterType: 'combat', enemyName: 'Stone Hulk',
        playerName: 'Mellow-San', playerClassId: 'ROGUE', playerSpriteIndex: 1,
    });
    fs.writeFileSync(path.join(OUT, 'abyss_fix_floor.gif'), gif);
    console.log('floor gif:', gif.length, 'animated:', abyssScene.isAnimatedCard(gif));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
