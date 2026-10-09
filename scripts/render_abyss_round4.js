// Round-4 abyss samples (owner 2026-10-09 10:19Z round):
//  1) BOSS room — centered tower kept, grounded on the floor plane
//  2) REGULAR single — Pokémon side layout (enemy left facing right, player right facing left)
//  3) REGULAR PACK — multiple enemies on stage
//  4) WILD SUMMON duel — side layout + ally summons on the party side
//  5) TURN hit — dark purple tint on the struck enemy
//  6) floor card PNG — regular side stage for non-boss floors
// Run: node scripts/render_abyss_round4.js  (writes scripts/render_out/abyss_r4/)
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');

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

const OUT = path.join(__dirname, 'render_out', 'abyss_r4');
fs.mkdirSync(OUT, { recursive: true });

const mkState = (over) => Object.assign({
    chatId: 'sample', isAbyss: true, dungeonRank: 0, sessionKey: null,
    abyssRun: { currentEncounterType: 'combat' },
    players: [{ jid: 'x@s', name: 'Mellow-San', class: { id: 'ROGUE' }, currentHP: 300, stats: { hp: 300, maxHp: 500 }, mana: 60, maxMana: 100 }],
    enemies: [{ name: 'MUTATED HOUND', isEnemy: true, spriteIndex: 72, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
    summons: [],
}, over);

(async () => {
    const results = [];
    const shoot = async (file, state, opts) => {
        const r = await abyssScene.renderAbyssCombat(state, opts || { phase: 'START', turnOrderStr: 'Mellow-San' });
        if (r.success) fs.writeFileSync(path.join(OUT, file), r.buffer);
        results.push([file, r.success, r.success ? r.buffer.length : 0]);
        console.log(file, r.success, r.success && r.buffer.length);
    };

    // 1) BOSS — hall pool + centered tower, feet on the floor plane
    await shoot('r4_boss_colossus.png', mkState({
        abyssFloor: 5,
        enemies: [{ name: '⚡ INFECTED COLOSSUS', isEnemy: true, isBoss: true, bossId: 'INFECTED_COLOSSUS',
                    spriteIndex: 65, currentHP: 9000, stats: { hp: 9000, maxHp: 12000 } }],
    }));

    // 2) REGULAR single — side layout (enemy left →, player right ←) on mist_hollow
    await shoot('r4_regular_hound.png', mkState({ abyssFloor: 2 }));

    // 3) REGULAR PACK — primary + 2 queued members on stage (dark_hall stage)
    await shoot('r4_pack_triple.png', mkState({
        abyssFloor: 4,
        enemies: [{ name: 'SHADOW STALKER', isEnemy: true, spriteIndex: 54, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
        abyssRun: { currentEncounterType: 'combat', packQueue: [
            { name: 'VENOM SPIDER', isEnemy: true, spriteIndex: 73, currentHP: 300, stats: { hp: 300, maxHp: 550 } },
            { name: 'MUTATED HOUND', isEnemy: true, spriteIndex: 72, currentHP: 300, stats: { hp: 300, maxHp: 550 } },
        ] },
    }));

    // 4) WILD SUMMON duel — dragon (flipped to face right) + bat ally on party side
    await shoot('r4_wild_dragon.png', mkState({
        abyssFloor: 11,
        abyssRun: { currentEncounterType: 'wild_summon', currentEncounterData: { species: 'dragon', rarity: 'RARE' } },
        enemies: [{ name: 'Wild Pyraxis', isWildSummon: true, currentHP: 400, stats: { hp: 400, maxHp: 600 } }],
        summons: [{ species: 'bat', name: 'Nocturne' }, { species: 'dino', name: 'Rexy' }],
    }));

    // 5) TURN with a player hit — dark purple tint on the enemy (drowned_vault)
    const st5 = mkState({ abyssFloor: 6, sessionKey: 'r4hit' });
    await abyssScene.renderAbyssCombat(st5, { phase: 'START', turnOrderStr: 'Mellow-San' });
    await shoot('r4_turn_hit_tint.png', st5, { phase: 'TURN', turnInfo: {
        turnNumber: 2, actor: { isEnemy: false, name: 'Mellow-San' },
        action: { name: 'Basic Attack' }, damage: 184, target: st5.enemies[0], effects: [],
    } });

    // 6) floor descent card (regular floor → side stage)
    const rf = await abyssScene.renderAbyssFloorCardPng({ floor: 7, tier: 'C', mult: 2.1, playerName: 'Mellow-San', playerClassId: 'ROGUE' });
    if (rf && rf.length) fs.writeFileSync(path.join(OUT, 'r4_floorcard_f7.png'), rf);
    console.log('r4_floorcard_f7.png', !!(rf && rf.length), rf && rf.length);

    console.log('DONE', results.every(([, ok]) => ok) ? 'ALL OK' : 'SOME FAILED');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
