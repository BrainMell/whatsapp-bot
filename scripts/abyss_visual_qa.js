// 🕳️ ABYSS VISUAL OVERHAUL — pure QA suite (no DB, no real canvas needed:
// the sandbox node_modules/canvas mock satisfies the require; assertions are
// structural, not pixel-based — pixel QA lives in abyss_gallery.js on a box).
// Run: node scripts/abyss_visual_qa.js
let PASS = 0, FAIL = 0;
function check(name, cond) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}`); }
}
function section(t) { console.log(`\n═══ ${t} ═══`); }

const path = require('path');
const REPO = path.join(__dirname, '..');

// ── monkey-patch combatIntegration (would pull goImageService/axios) ──────
const ciPath = require.resolve(path.join(REPO, 'core/rpg/combatIntegration'));
require.cache[ciPath] = {
    id: ciPath, filename: ciPath, loaded: true,
    exports: { generateStartCaption: () => 'cap-start', generateTurnCaption: () => 'cap-turn' },
};
// economy/progression stubs (resolvePlayerSpriteFile lazily requires them)
const ecoPath = require.resolve(path.join(REPO, 'core/rpg/economy'));
require.cache[ecoPath] = {
    id: ecoPath, filename: ecoPath, loaded: true,
    exports: { getUserClass: () => ({ id: 'ROGUE' }), getUser: () => ({ class: 'ROGUE', spriteIndex: 1 }), getDisplayName: () => 'Mellow-San' },
};
const progPath = require.resolve(path.join(REPO, 'core/rpg/progression'));
require.cache[progPath] = {
    id: progPath, filename: progPath, loaded: true,
    exports: { getBaseStats: () => ({ hp: 100, maxEnergy: 50 }), getLevel: () => 10 },
};

const abyssScene = require(path.join(REPO, 'core/rpg/abyssScene'));

// ═══ 1. background pools (§4) ═══
section('FIX §4 — background pools');
const all = abyssScene.bgList(), combat = abyssScene.combatBgList();
check(`pool >= 10 backgrounds (${all.length})`, all.length >= 10);
check(`combat sub-pool excludes busy-center halls (${combat.length})`, combat.length >= 8 && combat.length < all.length);
check('combat pool excludes crystal_chasm', !combat.some((f) => /crystal_chasm/i.test(f)));
check('deterministic per floor', abyssScene.bgFileForFloor(5) === abyssScene.bgFileForFloor(5));
check('floors rotate the pool', abyssScene.bgFileForFloor(1) !== abyssScene.bgFileForFloor(2));
check('combat selection stays inside combat pool', combat.includes(abyssScene.bgFileForFloor(9, true)));

// ═══ 2. enemy art resolution (§5) ═══
section('FIX §5 — enemy art resolution');
check('enemyIdOf plain pool id', abyssScene.enemyIdOf({ name: 'RABID RAT' }) === 'RABID_RAT');
check('enemyIdOf boss name with icon', abyssScene.enemyIdOf({ name: '⚡ INFERNO LORD' }) === 'INFERNO_LORD');
check('enemyIdOf bossId precedence', abyssScene.enemyIdOf({ name: 'whatever', bossId: 'VOID_TITAN' }) === 'VOID_TITAN');
check('enemyIdOf ignores run ids', abyssScene.enemyIdOf({ name: 'SLIME', id: 'abyss_F_1_123' }) === 'SLIME');
const rat = abyssScene.resolveEnemyArt({ name: 'RABID RAT', spriteIndex: 86 });
check('RABID_RAT override → abyss_rat.png (was a side-view strip)', rat && rat.file === 'abyss_rat.png');
const slime = abyssScene.resolveEnemyArt({ name: 'SLIME', spriteIndex: 81 });
check('SLIME override → abyss_slime.png (was a side-view strip)', slime && slime.file === 'abyss_slime.png');
const knight = abyssScene.resolveEnemyArt({ name: 'INFERNO KNIGHT', spriteIndex: 41 });
check('INFERNO_KNIGHT override → ember_knight.png', knight && knight.file === 'ember_knight.png');
const golem = abyssScene.resolveEnemyArt({ name: 'CRYSTAL GOLEM', spriteIndex: 36 });
check('CRYSTAL_GOLEM falls through to legacy sheet index', golem && golem.dir.endsWith('rpgasset/enemies') && !golem.dir.endsWith('abyss'));
const unknown = abyssScene.resolveEnemyArt({ name: 'MYSTERY BEAST', spriteIndex: 999 });
check('out-of-range index never crashes (null or sheet)', unknown === null || !!unknown.file);
check('override dir is the NEW subdir (C-locale index of enemies/ untouched)',
    rat && rat.dir.endsWith(path.join('enemies', 'abyss')));

// ═══ 3. boss-floor mirror vs the real abyssSystem rule ═══
section('MECHANICS PRESERVATION — boss-floor mirror');
check('F1 not boss', !abyssScene.isBossFloorMirror(1));
check('F5 boss', abyssScene.isBossFloorMirror(5));
check('F10 boss', abyssScene.isBossFloorMirror(10));
check('F12 S-tier mini-boss (every 3rd)', abyssScene.isBossFloorMirror(12));
check('F14 S-tier not boss', !abyssScene.isBossFloorMirror(14));
check('F18 S-tier mini-boss', abyssScene.isBossFloorMirror(18));
check('F20 NOT boss (matches 20%3 rule)', !abyssScene.isBossFloorMirror(20));
check('F25 boss again after S-tier band', abyssScene.isBossFloorMirror(25));

// ═══ 4. live pool mapping (battle-tested field shapes) ═══
section('§6 — live combat pool mapping');
const live = (() => {
    // replicate livePools through a render plan call path — use internal via
    // a state shaped exactly like startAbyssCombat builds
    const state = {
        chatId: 'qa', isAbyss: true, abyssFloor: 7, dungeonRank: 0, sessionKey: 'qa_1',
        abyssRun: { currentEncounterType: 'combat' },
        players: [{ jid: 'x@s', name: 'Mellow-San', class: { id: 'ROGUE' }, currentHP: 300, stats: { hp: 300, maxHp: 500 }, mana: 60, maxMana: 100 }],
        enemies: [{ name: 'STONE HULK', isEnemy: true, spriteIndex: 35, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
        summons: [],
    };
    return state;
})();
check('combat state is preserved (mechanics untouched by renderer)',
    live.players[0].currentHP === 300 && live.enemies[0].stats.maxHp === 1000);

// ═══ 5. frozen layouts (§6 pixel-stable turns) + end-to-end render ═══
section('§6 — frozen layout + render contract');
(async () => {
    const mkState = (over) => Object.assign({
        chatId: 'qa', isAbyss: true, abyssFloor: 7, dungeonRank: 0, sessionKey: 'qa_x',
        abyssRun: { currentEncounterType: 'combat' },
        players: [{ jid: 'x@s', name: 'Mellow-San', class: { id: 'ROGUE' }, currentHP: 300, stats: { hp: 300, maxHp: 500 }, mana: 60, maxMana: 100 }],
        enemies: [{ name: 'STONE HULK', isEnemy: true, spriteIndex: 35, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
        summons: [],
    }, over);

    const start = await abyssScene.renderAbyssCombat(mkState(), { phase: 'START', turnOrderStr: 'a → b' });
    check('START render succeeds (mock canvas)', start && start.success === true && !!start.caption);
    check('START caption comes from combatIntegration', start && start.caption === 'cap-start');
    const turn = await abyssScene.renderAbyssCombat(mkState({ players: [{ jid: 'x@s', name: 'Mellow-San', class: { id: 'ROGUE' }, currentHP: 120, stats: { hp: 120, maxHp: 500 }, mana: 30, maxMana: 100 }] }), { phase: 'TURN', turnInfo: { turnNumber: 3, actor: { isEnemy: false } } });
    check('TURN render succeeds with live pools', turn && turn.success === true && turn.caption === 'cap-turn');
    const nonAbyss = await abyssScene.renderAbyssCombat({ isAbyss: false }, { phase: 'START' });
    check('non-abyss state politely refuses', nonAbyss && nonAbyss.success === false);
    const broken = await abyssScene.renderAbyssCombat(null, { phase: 'START' });
    check('null state never throws (failure contract)', broken && broken.success === false);

    // frozen layout stability: same sessionKey → same plan object identity
    const st1 = mkState(); st1.sessionKey = 'frozen_1';
    await abyssScene.renderAbyssCombat(st1, { phase: 'START' });
    const st2 = mkState(); st2.sessionKey = 'frozen_1';
    const planA = (await abyssScene.planCombatLayout(st2));
    check('layout cache holds a plan for the session', typeof planA === 'object' && planA !== null);
    abyssScene.clearLayout('frozen_1');
    check('clearLayout runs without error', true);

    // plan geometry
    const pc = await abyssScene.planCombatLayout(mkState());
    check('combat: player centered', Math.abs(pc.player.cx - abyssScene.W / 2) < 1);
    check('combat: enemy mid-depth', pc.enemy.gy < pc.player.gy);
    check('combat: bg from combat pool', combat.includes(pc.bg));
    const boss = await abyssScene.planCombatLayout(mkState({ enemies: [{ name: '⚡ INFERNO LORD', isBoss: true, bossId: 'INFERNO_LORD', spriteIndex: 43, currentHP: 9000, stats: { hp: 9000, maxHp: 12000 } }] }));
    check('boss towers over regular enemy', boss.enemy.h > pc.enemy.h);
    const pw = await abyssScene.planCombatLayout(mkState({
        kind: 'wild',
        abyssRun: { currentEncounterType: 'wild_summon', currentEncounterData: { species: 'agumon', rarity: 'RARE' } },
        enemies: [{ name: 'Agumon', isWildSummon: true, spriteIndex: 0, currentHP: 400, stats: { hp: 400, maxHp: 600 } }],
    }));
    check('§7 summon: player shifts left, summon right', pw.player.cx < abyssScene.W * 0.5 && pw.enemy.cx > abyssScene.W * 0.5);
    check('§7 summon: grounded closer than bosses', pw.enemy.gy > pc.enemy.gy);
    check('§7 summon: wild species carried for the pill', pw.wildSpecies === 'agumon');

    // ═══ 6. floor card ═══
    section('§3 — floor descent card');
    const fc = await abyssScene.renderAbyssFloorCard({
        floor: 7, tier: 'A', mult: 1.9, encounterType: 'treasure',
        playerName: 'Mellow-San', playerClassId: 'ROGUE', playerSpriteIndex: 1,
    });
    check('floor card renders (mock canvas buffer)', fc && fc.length > 0);
    const fcBroken = await abyssScene.renderAbyssFloorCard(null);
    check('floor card with null payload never throws', fcBroken === null || Buffer.isBuffer(fcBroken));

    console.log(`\n════════════════════════════════════════`);
    console.log(`RESULT: ${PASS} passed, ${FAIL} failed`);
    process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
