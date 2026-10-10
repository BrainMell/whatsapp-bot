// Round-15 abyss samples (owner 09:15Z rebuke: arena/dunes stages don't fit,
// generated enemies face the wrong way, formation arrangement trash):
//  A) formations on the NEW stages: 1 / 2 / 3 enemies — ladder steps back
//     toward the vanishing point (deeper = higher + leftward), no edge-hug
//  B) facing solos for every REPAIRED id (bisector audit + regenerated art)
//  C) all 8 regular stages in rotation F18..F25 (arena/dunes replaced)
//  D) boss-floor regression (F12/F15) — frozen boss composition untouched
//  E) CLEARED result card regression
// Run on-box: node scripts/render_abyss_round15.js  → scripts/render_out/abyss_r15/
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');

const ciPath = require.resolve(path.join(REPO, 'core/rpg/combatIntegration'));
require.cache[ciPath] = { id: ciPath, filename: ciPath, loaded: true,
    exports: { generateStartCaption: () => 'cap-start', generateTurnCaption: () => 'cap-turn' } };
const ecoPath = require.resolve(path.join(REPO, 'core/rpg/economy'));
require.cache[ecoPath] = { id: ecoPath, filename: ecoPath, loaded: true,
    exports: { getUserClass: () => ({ id: 'ROGUE' }), getUser: () => ({ class: 'ROGUE', spriteIndex: 1 }), getDisplayName: () => 'Mellow' } };
const progPath = require.resolve(path.join(REPO, 'core/rpg/progression'));
require.cache[progPath] = { id: progPath, filename: progPath, loaded: true,
    exports: { getBaseStats: () => ({ hp: 100, maxEnergy: 50 }), getLevel: () => 12 } };

const abyssScene = require(path.join(REPO, 'core/rpg/abyssScene'));
const OUT = path.join(__dirname, 'render_out', 'abyss_r15');
fs.mkdirSync(OUT, { recursive: true });

const mkState = (over) => Object.assign({
    chatId: 'sample', isAbyss: true, dungeonRank: 0, sessionKey: null,
    abyssRun: { currentEncounterType: 'combat' },
    players: [{ jid: 'x@s', name: 'Mellow', class: { id: 'ROGUE' }, currentHP: 5053, stats: { hp: 5053, maxHp: 5053 }, mana: 60, maxMana: 100 }],
    enemies: [{ name: 'MUTATED HOUND', isEnemy: true, spriteIndex: 72, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
    summons: [],
}, over);

const mkEnemy = (name, floor, tier, i, hp, maxHp) => ({
    name, isEnemy: true, id: `abyss_${tier}_${floor}_${i}`, spriteIndex: 72,
    currentHP: hp, stats: { hp, maxHp },
});

const results = [];
(async () => {
    const shoot = async (file, state, opts) => {
        const r = await abyssScene.renderAbyssCombat(state, opts || { phase: 'START', turnOrderStr: 'Mellow' });
        if (r.success && r.buffer && r.buffer.length > 1000 && r.buffer[0] === 0x89) {
            fs.writeFileSync(path.join(OUT, file), r.buffer);
            results.push([file, true]);
            console.log(file, 'OK', r.buffer.length);
        } else {
            results.push([file, false]);
            console.log(file, 'FAIL', r.success, r.error || '');
        }
        return r;
    };

    // ═══ A) formations on the new stages ═══
    console.log('── A) formations ──');
    await shoot('r15_A1_single_brute_grove.png', mkState({
        abyssFloor: 25,
        enemies: [mkEnemy('GLOOM BRUTE', 25, 'B', 1, 3200, 4000)],
    }));
    await shoot('r15_A2_pack2_archon_hound_basilica.png', mkState({
        abyssFloor: 24,
        enemies: [mkEnemy('ELEMENTAL ARCHON', 24, 'A', 1, 2600, 3300)],
        abyssRun: { currentEncounterType: 'combat', packQueue: [
            Object.assign(mkEnemy('MUTATED HOUND', 24, 'B', 2, 1100, 2000), { isPackMember: true, packIndex: 2, packSize: 2 }),
        ] },
        summons: [{ name: 'Drake', species: 'DRAGON', currentHP: 900, stats: { hp: 900, maxHp: 1200 } }],
    }));
    await shoot('r15_A3_pack3_harb_guardian_overseer_darkhall.png', mkState({
        abyssFloor: 18,
        enemies: [mkEnemy('VOID HARBINGER', 18, 'B', 1, 3600, 4500)],
        abyssRun: { currentEncounterType: 'combat', packQueue: [
            Object.assign(mkEnemy('CORRUPTED GUARDIAN', 18, 'SSS', 2, 1500, 2800), { isPackMember: true, packIndex: 2, packSize: 3 }),
            Object.assign(mkEnemy('MUTATED OVERSEER', 18, 'B', 3, 1200, 2200), { isPackMember: true, packIndex: 3, packSize: 3 }),
        ] },
        summons: [
            { name: 'Drake', species: 'DRAGON', currentHP: 900, stats: { hp: 900, maxHp: 1200 } },
            { name: 'Boar', species: 'BOAR', currentHP: 700, stats: { hp: 700, maxHp: 950 } },
        ],
    }));

    // ═══ B) repaired ids solo — facing registry ═══
    console.log('── B) repaired facing solos ──');
    const REPAIRED = [
        ['ELEMENTAL ARCHON', 'A', 'R'], ['GLOOM BRUTE', 'B', 'R'], ['MUTATED OVERSEER', 'B', 'R'],
        ['VOID HARBINGER', 'B', 'L'], ['CORRUPTED GUARDIAN', 'SSS', 'L'],
        ['VENOM SPIDER', 'B', 'F'], ['MUTATED HOUND', 'F', 'L'], ['NIGHT WRAITH', 'A', 'F'],
    ];
    for (const [name, tier, want] of REPAIRED) {
        const id = name.replace(/\s+/g, '_');
        const native = abyssScene.enemyNativeFacing(id);
        console.log(`  ${id}: native=${native} want=${want} ${native === want ? 'OK' : 'MISMATCH'}`);
        results.push([`facing_${id}`, native === want]);
        await shoot(`r15_B_${id.toLowerCase()}_f18.png`, mkState({
            abyssFloor: 18,
            enemies: [mkEnemy(name, 18, tier, 1, 3000, 4000)],
        }));
    }

    // ═══ C) all 8 stages rotation F18..F25 ═══
    console.log('── C) background rotation ──');
    for (let f = 18; f <= 25; f++) {
        const bg = abyssScene.bgFileForFloor(f, 'regular');
        console.log(`  F${f} → ${bg}`);
        await shoot(`r15_C_f${f}_${bg.replace('_abyss.png', '')}.png`, mkState({
            abyssFloor: f,
            enemies: [mkEnemy('DUSK CRAWLER', f, 'F', 1, 700, 1000)],
        }));
    }

    // ═══ D) boss floors regression — frozen composition ═══
    console.log('── D) boss regression ──');
    await shoot('r15_D_boss_f12.png', mkState({
        abyssFloor: 12,
        enemies: [Object.assign(mkEnemy('ABYSSAL GOD', 12, 'GOD', 1, 9000, 12000), { isBoss: true, bossId: 'ABYSSAL_GOD' })],
    }));
    await shoot('r15_D_boss_f15.png', mkState({
        abyssFloor: 15,
        enemies: [Object.assign(mkEnemy('VOID TITAN', 15, 'SS', 1, 8000, 11000), { isBoss: true, bossId: 'VOID_TITAN' })],
    }));

    // ═══ E) CLEARED result regression ═══
    console.log('── E) result card ──');
    const clr = await abyssScene.renderAbyssResultCard({
        outcome: 'CLEARED', floor: 20, score: 2038, keptXp: 37795, keptGold: 25197,
        runes: 2, monstersKilled: 38, bossesKilled: 5, playerClassId: 'ROGUE', playerSpriteIndex: 1,
    });
    if (clr && clr.length > 1000 && clr[0] === 0x89) {
        fs.writeFileSync(path.join(OUT, 'r15_E_cleared_f20.png'), clr);
        results.push(['r15_E_cleared_f20.png', true]);
        console.log('r15_E_cleared_f20.png OK', clr.length);
    } else { results.push(['r15_E_cleared_f20.png', false]); console.log('cleared FAIL'); }

    const ok = results.every(([, good]) => good);
    console.log('DONE', ok ? 'ALL OK' : 'SOME FAILED', `(${results.filter(r => r[1]).length}/${results.length})`);
    process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
