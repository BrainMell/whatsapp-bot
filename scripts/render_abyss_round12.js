// Round-12 abyss samples (owner 2026-10-10 01:56Z round):
//  1) CLEARED result card — the new per-floor victory card (old VICTORY
//     portrait is banned from the abyss)
//  2) FALLEN + EXTRACTED regression — same family, must be unchanged
//  3) ELDER_CHAOS side layout — now FACES RIGHT (owner: "some enemies face
//     the wrong direction"; F19 screenshot proof)
//  4) PRIMORDIAL_CHAOS side layout — front-facing, never flipped
//  5) regular pool rotation on F18/F19/F20 — mist_hollow GONE (owner: "REMOVE
//     IT FROM THE FUCKING POOL"), 3 side stages rotate
// Run: node scripts/render_abyss_round12.js  (writes scripts/render_out/abyss_r12/)
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');

const ciPath = require.resolve(path.join(REPO, 'core/rpg/combatIntegration'));
require.cache[ciPath] = { id: ciPath, filename: ciPath, loaded: true,
    exports: { generateStartCaption: () => 'cap-start', generateTurnCaption: () => 'cap-turn' } };
const ecoPath = require.resolve(path.join(REPO, 'core/rpg/economy'));
require.cache[ecoPath] = { id: ecoPath, filename: ecoPath, loaded: true,
    exports: { getUserClass: () => ({ id: 'FIGHTER' }), getUser: () => ({ class: 'FIGHTER', spriteIndex: 0 }), getDisplayName: () => 'pink dildo' } };
const progPath = require.resolve(path.join(REPO, 'core/rpg/progression'));
require.cache[progPath] = { id: progPath, filename: progPath, loaded: true,
    exports: { getBaseStats: () => ({ hp: 100, maxEnergy: 50 }), getLevel: () => 30 } };

const abyssScene = require(path.join(REPO, 'core/rpg/abyssScene'));

const OUT = path.join(__dirname, 'render_out', 'abyss_r12');
fs.mkdirSync(OUT, { recursive: true });

const mkState = (over) => Object.assign({
    chatId: 'sample', isAbyss: true, dungeonRank: 0, sessionKey: null,
    abyssRun: { currentEncounterType: 'combat' },
    players: [{ jid: 'x@s', name: 'pink dildo', class: { id: 'FIGHTER' }, currentHP: 5053, stats: { hp: 5053, maxHp: 5053 }, mana: 60, maxMana: 100 }],
    enemies: [{ name: 'MUTATED HOUND', isEnemy: true, spriteIndex: 72, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
    summons: [],
}, over);

const results = [];
(async () => {
    // 1) CLEARED — the abyss victory card (what endCombat now sends)
    const clr = await abyssScene.renderAbyssResultCard({
        outcome: 'CLEARED', floor: 20, score: 20 * 100 + 38 * 5,
        keptXp: 37795, keptGold: 25197, runes: 2, monstersKilled: 38, bossesKilled: 5,
        playerClassId: 'FIGHTER', playerSpriteIndex: 0,
    });
    fs.writeFileSync(path.join(OUT, 'r12_cleared_f20.png'), clr);
    results.push(['r12_cleared_f20.png', clr && clr.length > 100]);
    console.log('r12_cleared_f20.png', clr && clr.length, clr && clr[0] === 0x89 ? 'PNG' : 'NOT-PNG');

    // 2) FALLEN / EXTRACTED regression
    const fal = await abyssScene.renderAbyssResultCard({
        outcome: 'FALLEN', floor: 20, score: 2038, keptXp: 3779, keptGold: 2519, runes: 2,
        monstersKilled: 38, bossesKilled: 5, playerClassId: 'FIGHTER', playerSpriteIndex: 0,
    });
    fs.writeFileSync(path.join(OUT, 'r12_fallen_f20.png'), fal);
    results.push(['r12_fallen_f20.png', fal && fal.length > 100]);
    console.log('r12_fallen_f20.png', fal && fal.length);
    const ext = await abyssScene.renderAbyssResultCard({
        outcome: 'EXTRACTED', floor: 20, score: 2038, keptXp: 377950, keptGold: 251970, runes: 5,
        monstersKilled: 38, bossesKilled: 5, playerClassId: 'FIGHTER', playerSpriteIndex: 0,
    });
    fs.writeFileSync(path.join(OUT, 'r12_extracted_f20.png'), ext);
    results.push(['r12_extracted_f20.png', ext && ext.length > 100]);
    console.log('r12_extracted_f20.png', ext && ext.length);

    // 3) ELDER_CHAOS side — the facing fix (must face RIGHT toward the player).
    // Real F19 regular mob: NO bossId/isBoss (either would pick the frozen
    // boss tower) — id is the abyss run id, spriteIndex from ABYSS_SPRITE_MAP.
    const shoot = async (file, state, opts) => {
        const r = await abyssScene.renderAbyssCombat(state, opts || { phase: 'START', turnOrderStr: 'pink dildo' });
        if (r.success) fs.writeFileSync(path.join(OUT, file), r.buffer);
        results.push([file, r.success]);
        console.log(file, r.success, r.success && r.buffer.length);
    };
    await shoot('r12_elder_chaos_f19.png', mkState({
        abyssFloor: 19,
        enemies: [{ name: 'ELDER CHAOS', isEnemy: true, id: 'abyss_S_19_1', spriteIndex: 28, currentHP: 3000, stats: { hp: 3000, maxHp: 3759 } }],
    }));

    // 4) PRIMORDIAL_CHAOS side — front-facing blob, never flipped
    await shoot('r12_primordial_chaos_f16.png', mkState({
        abyssFloor: 16,
        enemies: [{ name: 'PRIMORDIAL CHAOS', isEnemy: true, id: 'abyss_S_16_1', spriteIndex: 29, currentHP: 6000, stats: { hp: 6000, maxHp: 8000 } }],
    }));

    // 5) pool rotation F18/F19/F20 — 3 stages, no mist_hollow anywhere
    const reg = abyssScene.bgListRegular();
    console.log('regular pool now:', reg.join(', '));
    results.push(['pool-has-no-mist_hollow', !reg.some((f) => /mist_hollow/i.test(f))]);
    results.push(['pool-is-3', reg.length === 3]);
    for (const f of [18, 19, 20]) {
        await shoot(`r12_pool_f${f}.png`, mkState({
            abyssFloor: f,
            enemies: [{ name: 'MUTATED HOUND', isEnemy: true, spriteIndex: 72, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
        }));
    }

    const ok = results.every(([, good]) => good);
    console.log('DONE', ok ? 'ALL OK' : 'SOME FAILED');
    process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
