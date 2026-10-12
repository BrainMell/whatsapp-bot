// QA: sheet-single-frame fix — render the exact owner-reported encounters
// (F40 MIRROR boss / F38 WANDERER side) + sheet-pool regression set on-box.
const path = require('path');
const fs = require('fs');
const R = '/home/ubuntu/whatsapp-bot/core/rpg';
const OUT = '/home/ubuntu/whatsapp-bot/data/qa_sheetfix';
fs.mkdirSync(OUT, { recursive: true });

const scene = require(path.join(R, 'abyssScene'));
const ev = require(path.join(R, 'enemyVariants'));

function mkState(enemy, floor, extra = {}) {
    return {
        isAbyss: true,
        abyssFloor: floor,
        sessionKey: `qa_${floor}_${Math.random().toString(36).slice(2, 8)}`,
        players: [{
            name: 'QA Hero', class: { id: 'FIGHTER', name: 'Fighter' }, level: floor,
            spriteIndex: 3, currentHP: 5000,
            stats: { hp: 5000, maxHp: 5000, energy: 100, maxEnergy: 100 },
        }],
        enemies: [enemy],
        abyssRun: { packQueue: [] },
        summons: [],
        ...extra,
    };
}

function mkPoolEnemy(id, name, floor, isBoss) {
    const mult = 1.0 + (floor - 1) * 0.15 + Math.pow(floor - 1, 1.5) * 0.05;
    const hp = Math.floor((isBoss ? 2000 : 500) * mult);
    return {
        id: `abyss_qa_${id}_${floor}`, name, hp, maxHp: hp,
        atk: Math.floor(40 * mult), def: Math.floor(15 * mult), spd: Math.floor(15 * mult),
        isBoss, level: floor, spriteIndex: ev.abyssSpriteIndex(id),
        bossId: isBoss ? id : undefined,
    };
}

const CASES = [
    // the two owner-reported renders
    ['mirror_f40', mkState(ev.buildVariantEnemy('MIRROR', { floor: 40, isBoss: true, playerClassId: 'FIGHTER' }), 40)],
    ['wanderer_f38', mkState(ev.buildVariantEnemy('WANDERER', { floor: 38, playerClassId: 'FIGHTER' }), 38)],
    // sheet-pool + single-pool regressions
    ['slime_side', mkState(mkPoolEnemy('SLIME', 'Slime', 7, false), 7)],
    ['venom_spider_side', mkState(mkPoolEnemy('VENOM_SPIDER', 'Venom Spider', 3, false), 3)],
    ['void_titan_boss', mkState(mkPoolEnemy('VOID_TITAN', 'Void Titan', 40, true), 40)],
    ['wolf_rat_side', mkState(mkPoolEnemy('RABID_RAT', 'Rabid Rat', 2, false), 2)],
];

(async () => {
    let fail = 0;
    for (const [label, state] of CASES) {
        const res = await scene.renderAbyssCombat(state, { phase: 'START' });
        if (!res || !res.success || !res.buffer) {
            console.log(`FAIL - ${label}: render failed`);
            fail++;
            continue;
        }
        const f = path.join(OUT, `${label}.png`);
        fs.writeFileSync(f, res.buffer);
        const kb = Math.round(res.buffer.length / 1024);
        console.log(`OK - ${label}: ${kb}KB -> ${f}`);
    }
    console.log(fail === 0 ? 'RENDER QA: ALL RENDERED' : `RENDER QA: ${fail} FAILURES`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('QA crashed:', e); process.exit(2); });
