// 🕳️ ABYSS OVERHAUL — gallery: renders every new card type through the REAL
// abyssScene module (real canvas + real assets). Run on a box:
//   node scripts/abyss_gallery.js <repoDir> <outDir>
const REPO = process.argv[2] || '/home/ubuntu/whatsapp-bot';
const OUT = process.argv[3] || '/tmp/abyss_gallery';
const path = require('path');
const fs = require('fs');
process.chdir(REPO);

// stub economy BEFORE abyssScene's lazy requires run (no DB on this path)
const economy = require(path.join(REPO, 'core', 'rpg', 'economy'));
economy.getUserClass = () => ({ id: 'ROGUE', name: 'Rogue', icon: '🗡️' });
economy.getUser = () => ({ class: 'ROGUE', spriteIndex: 1, nickname: 'Mellow-San' });
economy.getDisplayName = () => 'Mellow-San';
const progression = require(path.join(REPO, 'core', 'rpg', 'progression'));
progression.getBaseStats = () => ({ hp: 520, maxHp: 520, atk: 60, def: 30, mag: 20, spd: 40, luck: 5, crit: 5, maxEnergy: 120 });
progression.getLevel = () => 34;

const abyssScene = require(path.join(REPO, 'core', 'rpg', 'abyssScene'));

function mkState(opts) {
    const o = Object.assign({ floor: 1, kind: 'combat', hp: 340, maxHp: 520, en: 80, maxEn: 120, ehp: 1450, emax: 2100, turn: 0 }, opts);
    return {
        chatId: 'gallery', isAbyss: true, abyssFloor: o.floor, dungeonRank: 0,
        sessionKey: `gallery_${o.floor}_${o.kind}_${o.turn}`,
        abyssRun: { currentEncounterType: o.kind === 'wild' ? 'wild_summon' : 'combat', currentEncounterData: { species: 'agumon', rarity: 'RARE' } },
        players: [{ jid: 'gallery@s', name: 'Mellow-San', class: { id: 'ROGUE' }, spriteIndex: 1, currentHP: o.hp, stats: { hp: o.hp, maxHp: o.maxHp }, mana: o.en, maxMana: o.maxEn }],
        enemies: [Object.assign({
            id: `abyss_x_${o.floor}`, name: o.enemyName, icon: '👾',
            isEnemy: true, isBoss: !!o.isBoss, isWildSummon: o.kind === 'wild',
            spriteIndex: o.spriteIndex != null ? o.spriteIndex : 0, bossId: o.bossId || '',
            stats: { hp: o.ehp, maxHp: o.emax }, currentHP: o.ehp, maxHP: o.emax,
        })],
        summons: o.allies || [],
    };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const jobs = [];
    const save = (name, buf) => { fs.writeFileSync(path.join(OUT, name), buf); console.log('WROTE', name, buf.length, 'bytes'); };

    // ── combat START scenes across tiers/biomes (real pipeline) ──
    jobs.push(['combat_f1_rat.png', abyssScene.renderAbyssCombat(mkState({
        floor: 1, enemyName: 'RABID RAT', spriteIndex: 86,
    }), { phase: 'START', turnOrderStr: '🗡️ Mellow-San → 👾 RABID RAT' })]);
    jobs.push(['combat_f6_golem.png', abyssScene.renderAbyssCombat(mkState({
        floor: 6, enemyName: 'CRYSTAL GOLEM', spriteIndex: 36,
    }), { phase: 'START' })]);
    jobs.push(['combat_f8_knight.png', abyssScene.renderAbyssCombat(mkState({
        floor: 8, enemyName: 'INFERNO KNIGHT', spriteIndex: 41,
    }), { phase: 'START' })]);
    jobs.push(['combat_f12_void.png', abyssScene.renderAbyssCombat(mkState({
        floor: 12, enemyName: 'VOID HARBINGER', spriteIndex: 55,
    }), { phase: 'START' })]);
    jobs.push(['combat_f15_boss.png', abyssScene.renderAbyssCombat(mkState({
        floor: 15, enemyName: '⚡ INFERNO LORD', isBoss: true, bossId: 'INFERNO_LORD', spriteIndex: 43, ehp: 9000, emax: 12000,
    }), { phase: 'START' })]);
    // ── TURN render (same frozen layout, HP drained) ──
    const turnState = mkState({ floor: 8, enemyName: 'INFERNO KNIGHT', spriteIndex: 41, hp: 180, en: 30, ehp: 500, turn: 3 });
    jobs.push(['combat_f8_turn3.png', abyssScene.renderAbyssCombat(turnState, {
        phase: 'TURN', turnInfo: { turnNumber: 3, actor: { isEnemy: false } },
    })]);
    // ── wild summon encounter (player left, summon right) ──
    jobs.push(['summon_f4_wild.png', abyssScene.renderAbyssCombat(mkState({
        floor: 4, kind: 'wild', enemyName: 'Agumon', spriteIndex: 0,
    }), { phase: 'START' })]);
    // ── floor descent cards ──
    jobs.push(['floorcard_f1.png', abyssScene.renderAbyssFloorCard({
        floor: 1, tier: 'F', mult: 1.0, encounterType: 'combat', enemyName: 'RABID RAT',
        playerName: 'Mellow-San', playerClassId: 'ROGUE', playerSpriteIndex: 1,
    })]);
    jobs.push(['floorcard_f7.png', abyssScene.renderAbyssFloorCard({
        floor: 7, tier: 'A', mult: 1.9, encounterType: 'treasure',
        playerName: 'Mellow-San', playerClassId: 'ROGUE', playerSpriteIndex: 1,
    })]);
    jobs.push(['floorcard_f23.png', abyssScene.renderAbyssFloorCard({
        floor: 23, tier: 'SS', mult: 4.3, encounterType: 'event', isBoss: false,
        playerName: 'Mellow-San', playerClassId: 'ROGUE', playerSpriteIndex: 1,
    })]);

    for (const [name, p] of jobs) {
        try {
            const r = await p;
            const buf = (r && r.success && r.buffer) ? r.buffer : (Buffer.isBuffer(r) ? r : null);
            if (buf) save(name, buf);
            else console.log('FAIL', name, JSON.stringify(r && r.success != null ? { success: r.success } : r).slice(0, 120));
        } catch (e) { console.log('ERR', name, e.message); }
    }
    console.log('GALLERY DONE');
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
