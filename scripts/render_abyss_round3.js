// Render this round's abyss samples (owner 2026-10-09 08:43Z round):
//  1) combat START — amalgamation enemy (MUTATED HOUND) + floor-number banner
//  2) combat START — boss (INFECTED COLOSSUS) on a new hall, banner visible
//  3) combat START — ELDER CHAOS on blood_chapel
//  4) TURN variant — banner + turn pill coexist
// Run: node scripts/render_abyss_round3.js (writes scripts/render_out/abyss_r3/)
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

const OUT = path.join(__dirname, 'render_out', 'abyss_r3');
fs.mkdirSync(OUT, { recursive: true });

const mkState = (over) => Object.assign({
    chatId: 'sample', isAbyss: true, dungeonRank: 0, sessionKey: null,
    abyssRun: { currentEncounterType: 'combat' },
    players: [{ jid: 'x@s', name: 'Mellow-San', class: { id: 'ROGUE' }, currentHP: 300, stats: { hp: 300, maxHp: 500 }, mana: 60, maxMana: 100 }],
    enemies: [{ name: 'MUTATED HOUND', isEnemy: true, spriteIndex: 72, currentHP: 700, stats: { hp: 700, maxHp: 1000 } }],
    summons: [],
}, over);

(async () => {
    // floors picked to land on specific halls via (floor % 15) C-locale order:
    // pool sorted: blood_chapel, chained_cells, crystal_vault, dark_hall,
    // drowned_crypt, drowned_vault, ember_depths, frost_reliquary,
    // fungal_grotto, obsidian_throne, ossuary_hall, ruined_library,
    // violet_sanctum, void_sanctum, web_lair
    const samples = [
        { file: 'r3_combat_hound.png', floor: 10, enemy: ['MUTATED HOUND', 72], boss: false },
        { file: 'r3_boss_colossus.png', floor: 5, enemy: ['INFECTED COLOSSUS', 65], boss: true },
        { file: 'r3_elder_chaos.png', floor: 1, enemy: ['ELDER CHAOS', 28], boss: false },
        { file: 'r3_spider.png', floor: 15, enemy: ['VENOM SPIDER', 73], boss: false },
    ];
    for (const s of samples) {
        const st = mkState({
            abyssFloor: s.floor,
            enemies: [{ name: s.enemy[0], isEnemy: true, spriteIndex: s.enemy[1],
                        currentHP: 700, stats: { hp: 700, maxHp: 1000 },
                        isBoss: s.boss, bossId: s.boss ? s.enemy[0].replace(/\s+/g, '_') : undefined }],
        });
        const r = await abyssScene.renderAbyssCombat(st, { phase: 'START', turnOrderStr: 'Mellow-San' });
        if (r.success) fs.writeFileSync(path.join(OUT, s.file), r.buffer);
        console.log(s.file, r.success, r.success && r.buffer.length);
    }
    // TURN phase on floor 3 (banner + TURN pill)
    const st = mkState({ abyssFloor: 3, sessionKey: 'r3turn' });
    const start = await abyssScene.renderAbyssCombat(st, { phase: 'START', turnOrderStr: 'Mellow-San' });
    const rt = await abyssScene.renderAbyssCombat(st, { phase: 'TURN', turnInfo: { turnNumber: 2 }, turnOrderStr: 'Mellow-San' });
    if (rt.success) fs.writeFileSync(path.join(OUT, 'r3_turn.png'), rt.buffer);
    console.log('turn:', rt.success, rt.success && rt.buffer.length);
    // floor card PNG (static fallback — quick sanity that §3 untouched)
    const rf = await abyssScene.renderAbyssFloorCardPng({ floor: 7, tier: 'C', mult: 2.1, playerName: 'Mellow-San', playerClassId: 'ROGUE' });
    if (rf && rf.length) fs.writeFileSync(path.join(OUT, 'r3_floorcard.png'), rf);
    console.log('floorcard:', !!(rf && rf.length), rf && rf.length);
})();
