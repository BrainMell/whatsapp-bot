// Round-20 proof: warrior family + ninja player facing (Node abyss path).
// Run ON BOX: node scripts/render_abyss_r20.js → scripts/render_out/abyss_r20/
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');

const ciPath = require.resolve(path.join(REPO, 'core/rpg/combatIntegration'));
require.cache[ciPath] = { id: ciPath, filename: ciPath, loaded: true,
    exports: { generateStartCaption: () => 'cap-start', generateTurnCaption: () => 'cap-turn' } };
const ecoPath = require.resolve(path.join(REPO, 'core/rpg/economy'));
require.cache[ecoPath] = { id: ecoPath, filename: ecoPath, loaded: true,
    exports: { getUserClass: () => ({ id: 'WARRIOR' }), getUser: () => ({ class: 'WARRIOR', spriteIndex: 0 }), getDisplayName: () => 'Mellow', getPersistentHP: () => null, getPersistentEnergy: () => null } };
const progPath = require.resolve(path.join(REPO, 'core/rpg/progression'));
require.cache[progPath] = { id: progPath, filename: progPath, loaded: true,
    exports: { getBaseStats: () => ({ hp: 5053, maxEnergy: 100 }), getLevel: () => 50 } };

const abyssScene = require(path.join(REPO, 'core/rpg/abyssScene'));
const OUT = path.join(__dirname, 'render_out', 'abyss_r20');
fs.mkdirSync(OUT, { recursive: true });

const player = (cls, idx, name) => ({
    jid: 'x@s', name: name || 'Mellow', class: { id: cls }, spriteIndex: idx,
    currentHP: 4100, stats: { hp: 5053, maxHp: 5053 }, mana: 60, maxMana: 100,
});
const enemy = (name, hp, maxHp, i) => ({
    name, isEnemy: true, id: `abyss_B_20_${i}`, spriteIndex: 72,
    currentHP: hp, stats: { hp, maxHp },
});

const cards = [
    ['r20_N1_warrior1_gloombrute.png', {
        abyssFloor: 20,
        players: [player('WARRIOR', 0)],
        enemies: [enemy('GLOOM BRUTE', 2600, 4000, 1)],
        summons: [],
    }],
    ['r20_N2_warrior4_pack.png', {
        abyssFloor: 20,
        players: [player('WARRIOR', 3)],
        enemies: [enemy('MUTATED HOUND', 900, 1400, 1), enemy('DUSK CRAWLER', 700, 1400, 2)],
        summons: [],
    }],
    ['r20_N3_ninja1_pack.png', {
        abyssFloor: 20,
        players: [player('NINJA', 0)],
        enemies: [enemy('GLOOM BRUTE', 2600, 4000, 1), enemy('MUTATED HOUND', 900, 1400, 2)],
        summons: [],
    }],
    ['r20_N4_warrior2_dragon_ally.png', {
        abyssFloor: 20,
        players: [player('WARRIOR', 1)],
        enemies: [enemy('GLOOM BRUTE', 2600, 4000, 1)],
        summons: [{ name: 'Emberwyrm', species: 'dragon', currentHP: 300, stats: { hp: 300, maxHp: 300 }, mana: 50, maxMana: 50 }],
    }],
].map(([file, state]) => [file, Object.assign({
    chatId: 'sample', isAbyss: true, dungeonRank: 0, sessionKey: null,
    abyssRun: { currentEncounterType: 'combat' },
}, state)]);

(async () => {
    for (const [file, state] of cards) {
        try {
            const r = await abyssScene.renderAbyssCombat(state, { phase: 'START', turnOrderStr: 'Mellow' });
            const b = r && r.buffer;
            const isPng = b && b.length > 1000 && b[0] === 0x89;
            const isGif = b && b.length > 1000 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
            if (r && r.success && (isPng || isGif)) {
                const out = isGif ? file.replace(/\.png$/, '.gif') : file;
                fs.writeFileSync(path.join(OUT, out), b);
                console.log(out, 'OK', isGif ? 'GIF' : 'PNG', b.length);
            } else {
                console.log(file, 'FAIL', r && (r.error || 'no buffer'));
            }
        } catch (e) {
            console.log(file, 'THREW', e.message);
        }
    }
    console.log('DONE');
})();
