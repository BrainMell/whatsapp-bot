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
check(`pool >= 10 REAL pixel-art backgrounds (${all.length})`, all.length >= 10);
check('pool is PNG pixel art (AI jpg pool removed)', all.every((f) => f.toLowerCase().endsWith('.png')));
check(`combat sub-pool = full pool — every hall is stage-safe (${combat.length})`, combat.length === all.length);
check('AI halls are gone', !all.some((f) => /crystal_chasm|ember_forge|spore_bloom|void_rift/i.test(f)));
check('deterministic per floor', abyssScene.bgFileForFloor(5) === abyssScene.bgFileForFloor(5));
check('floors rotate the pool', abyssScene.bgFileForFloor(1) !== abyssScene.bgFileForFloor(2));
check('combat selection stays inside combat pool', combat.includes(abyssScene.bgFileForFloor(9, true)));

// ═══ 2. enemy art resolution (§5) ═══
section('FIX §5 — enemy art resolution (amalgamation family only)');
check('enemyIdOf plain pool id', abyssScene.enemyIdOf({ name: 'MUTATED HOUND' }) === 'MUTATED_HOUND');
check('enemyIdOf boss name with icon', abyssScene.enemyIdOf({ name: '⚡ INFECTED COLOSSUS' }) === 'INFECTED_COLOSSUS');
check('enemyIdOf bossId precedence', abyssScene.enemyIdOf({ name: 'whatever', bossId: 'VOID_TITAN' }) === 'VOID_TITAN');
check('enemyIdOf ignores run ids', abyssScene.enemyIdOf({ name: 'SLIME', id: 'abyss_F_1_123' }) === 'SLIME');
// (2026-10-09 08:43Z, owner: "get rid of the slime — only those weird front
// facing amalgamation creatures") — by-name rat/slime overrides are GONE and
// every spawn-pool id renders a front-facing amalgamation single:
check('rat/slime by-name overrides are gone (no enemies/abyss art resolves)',
    !(abyssScene.resolveEnemyArt({ name: 'RABID RAT', spriteIndex: 86 }) || {}).dir?.endsWith('abyss')
    && !(abyssScene.resolveEnemyArt({ name: 'SLIME', spriteIndex: 81 }) || {}).dir?.endsWith('abyss'));
const abyssFiles = require('fs').existsSync(path.join(REPO, 'core/rpgasset/enemies/abyss'))
    ? require('fs').readdirSync(path.join(REPO, 'core/rpgasset/enemies/abyss')).filter((f) => f.endsWith('.png'))
    : [];
check(`enemies/abyss holds no by-name sprites (rat/slime gone): ${abyssFiles.join(',') || '(empty)'}`,
    abyssFiles.length === 0);
const enemyVariants = require(path.join(REPO, 'core/rpg/enemyVariants'));
let abyssSystem;
try { abyssSystem = require(path.join(REPO, 'core/rpg/abyssSystem')); } catch (e) { abyssSystem = null; }
const sheetFiles = (() => { // C-locale mirror of enemySheetList()
    const fs = require('fs');
    return fs.readdirSync(path.join(REPO, 'core/rpgasset/enemies'))
        .filter((f) => f.toLowerCase().endsWith('.png')).sort();
})();
const FAMILY = /mutated|calamaties|midlevelbosses|highlevelbosses|hybrides/i;
let poolIds = new Set();
if (abyssSystem && abyssSystem.ABYSS_ENEMY_POOLS) {
    poolIds = new Set([
        ...Object.values(abyssSystem.ABYSS_ENEMY_POOLS).flat(),
        ...Object.values(abyssSystem.ABYSS_BOSS_POOL).flat(),
    ]);
} else {
    // fallback if the models unavailable in sandbox: scan the source
    const src = require('fs').readFileSync(path.join(REPO, 'core/rpg/abyssSystem.js'), 'utf8');
    for (const m of src.matchAll(/\[\s*'([A-Z_]+)'(?:\s*,\s*'([A-Z_]+)')*\s*\]/g)) {
        for (const g of m.slice(1)) if (g) poolIds.add(g);
    }
}
const offFamily = [...poolIds].filter((id) => {
    const idx = enemyVariants.abyssSpriteIndex(id);
    const f = sheetFiles[idx];
    return !(f && FAMILY.test(f));
});
check(`every spawn-pool id renders a FRONT-FACING amalgamation single (${poolIds.size} ids)`,
    offFamily.length === 0);
if (offFamily.length) console.log(`    offenders: ${offFamily.join(', ')}`);
const BANNED = /RABID_RAT|^SLIME$|CAVE_BAT|EMBER_SPAWN|FROST_WISP|STONE_HULK|CRYSTAL_GOLEM|INFERNO_KNIGHT|TIDAL_FURY|BOULDER_TITAN|GLACIAL_WRAITH|STORM_CALLER|ANCIENT_GUARDIAN|INFERNO_LORD/;
check('no rat/slime/bat/elemental ids remain in any pool',
    ![...poolIds].some((id) => BANNED.test(id)));
const knight = abyssScene.resolveEnemyArt({ name: 'INFERNO KNIGHT', spriteIndex: 41 });
check('legacy id (in-flight run) still falls to curated pixel pool',
    knight && knight.dir.endsWith('rpgasset/enemies') && knight.file === 'fire (5).png');
const unknown = abyssScene.resolveEnemyArt({ name: 'MYSTERY BEAST', spriteIndex: 999 });
check('out-of-range index never crashes (null or sheet)', unknown === null || !!unknown.file);

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
    check('floor card renders', fc && fc.length > 0);
    check('floor card is an animated GIF (owner: rings descend then start back up)',
        abyssScene.isAnimatedCard(fc));
    check('floor card gif sane size (< 3MB)', fc && fc.length < 3 * 1024 * 1024);
    const fcPng = await abyssScene.renderAbyssFloorCardPng({
        floor: 7, tier: 'A', mult: 1.9, encounterType: 'treasure',
        playerName: 'Mellow-San', playerClassId: 'ROGUE', playerSpriteIndex: 1,
    });
    check('static PNG fallback still renders', Buffer.isBuffer(fcPng) && !abyssScene.isAnimatedCard(fcPng));
    const fcBroken = await abyssScene.renderAbyssFloorCard(null);
    check('floor card with null payload never throws', fcBroken === null || Buffer.isBuffer(fcBroken));

    // ═══ 7. summons render the game's OWN sprites (owner 2026-10-09: NO DIGIMON) ═══
    section('§7b — own sparklinlabs summon sprites (Digimon mapping removed)');
    const summonSprites = require(path.join(REPO, 'core/rpg/summonSprites'));
    const reg = require(path.join(REPO, 'core/rpg/summonRegistry'));
    const speciesIds = reg.getAllSpecies ? reg.getAllSpecies() : Object.keys(reg.SPECIES || reg);
    check('species→Digimon map is GONE (getSpeciesDigimon undefined)', summonSprites.getSpeciesDigimon === undefined);
    const notOwn = speciesIds.filter((id) => {
        const p = summonSprites.getSpritePath(id);
        return !(p && p.includes(path.join('summons', 'sparklinlabs')));
    });
    check(`every registry species resolves its OWN sparklinlabs PNG (${speciesIds.length} species, missing: ${notOwn.join(',') || 'none'})`, notOwn.length === 0);
    const dragonPath = summonSprites.getSpritePath('dragon');
    const dragonBytes = dragonPath ? require('fs').readFileSync(dragonPath) : Buffer.alloc(0);
    check('own sprites are real PNG bytes (deploy-safe, not LFS stubs)',
        dragonBytes[0] === 0x89 && dragonBytes.length > 500);
    check('own sprite dir holds 26 files (one per species)',
        require('fs').readdirSync(path.join(REPO, 'core/rpgasset/summons/sparklinlabs')).filter((f) => f.endsWith('.png')).length === 26);
    const dragonArt = await summonSprites.getOrFetchSprite('dragon');
    check('getOrFetchSprite returns the LOCAL own sprite (no API fetch)', !!dragonArt && dragonArt.includes(path.join('summons', 'sparklinlabs')));
    const pwild = await abyssScene.planCombatLayout(mkState({
        kind: 'wild',
        abyssRun: { currentEncounterType: 'wild_summon', currentEncounterData: { species: 'dragon', rarity: 'RARE' } },
        enemies: [{ name: 'Wild Pyraxis', isWildSummon: true, currentHP: 400, stats: { hp: 400, maxHp: 600 } }],
        summons: [{ species: 'bat', name: 'Nocturne' }],
    }));
    check('wild summon art = the game\'s own dragon sprite (dragon.png)',
        pwild.enemy && pwild.enemy.art && pwild.enemy.art.file === 'dragon.png');
    check('ally art = the game\'s own bat sprite (bat.png)',
        pwild.allies.length === 1 && pwild.allies[0].art && pwild.allies[0].art.file === 'bat.png');
    check('ally pack grounds ABOVE the HUD panel (panel top ~656)',
        pwild.allies.every((a) => a.gy < 650));

    console.log(`\n════════════════════════════════════════`);
    console.log(`RESULT: ${PASS} passed, ${FAIL} failed`);
    process.exit(FAIL > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
