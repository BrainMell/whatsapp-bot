// QA: v3 asset pack mapping integrity (no canvas needed — file/data checks)
const path = require('path');
const fs = require('fs');
const R = path.join(__dirname, '..', 'core', 'rpg');
const V3 = path.join(__dirname, '..', 'core', 'rpgasset', 'v3');
const st = require(path.join(R, 'skillTree'));
const rs = require(path.join(R, 'runeSystem'));
const { SUMMON_SKILL_TREES } = require(path.join(R, 'summonSkillTrees'));
const ms = require(path.join(R, 'monsterSkills'));
const sa = require(path.join(R, 'skillAssets'));

let fail = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} - ${name}${detail ? `: ${detail}` : ''}`);
    if (!ok) fail++;
};

const idx = sa.v3SkillIndex();
const man = sa.v3Manifest();
check('v3 manifest parses with sections', !!(man.skills && man.runes && man.summons && man.monsters),
    `${(man.skills || []).length} skills, ${(man.runes || []).length} runes, ${(man.summons || []).length} summons, ${(man.monsters || []).length} monsters`);
check('skill_index non-trivial', Object.keys(idx).length > 400, `${Object.keys(idx).length} entries`);

// 1) skillTree coverage
let total = 0, covered = 0;
const missing = [];
for (const [cls, tree] of Object.entries(st.SKILL_TREES)) {
    for (const [, br] of Object.entries(tree.trees || {})) {
        for (const [sid] of Object.entries(br.skills || {})) {
            total++;
            if (idx[`${cls}:${sid}`] || idx[sid]) covered++;
            else missing.push(`${cls}:${sid}`);
        }
    }
}
check(`skillTree art coverage >= 95%`, covered / total >= 0.95, `${covered}/${total} (${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''})`);

// every index entry points to a real file
let badFiles = 0;
for (const rel of Object.values(idx)) {
    if (!fs.existsSync(path.join(__dirname, '..', 'core', 'rpgasset', 'v3', rel))) badFiles++;
}
check('all skill_index files exist', badFiles === 0, `${badFiles} missing`);

// 2) runes: base + 4 tiers on disk for every RUNE_TYPE
let runeMiss = [];
for (const [type] of Object.entries(rs.RUNE_TYPES)) {
    const base = sa.v3RuneSprite(type);
    if (!base || !fs.existsSync(path.join(__dirname, '..', 'core', 'rpgasset', base))) runeMiss.push(`${type}:base`);
    for (const t of ['lesser', 'normal', 'greater', 'abyssal']) {
        const p = sa.v3RuneSprite(type, t);
        if (!p || !fs.existsSync(path.join(__dirname, '..', 'core', 'rpgasset', p))) runeMiss.push(`${type}:${t}`);
    }
}
check('all 39 runes have base + 4 tier sprites', runeMiss.length === 0, runeMiss.slice(0, 6).join(', '));

// 3) summon nodes: all 75 icon fields point to real files
let nodeMiss = 0, nodeCount = 0;
for (const [arch, paths] of Object.entries(SUMMON_SKILL_TREES)) {
    for (const [pk, pd] of Object.entries(paths)) {
        for (let n = 1; n <= 5; n++) {
            nodeCount++;
            const nd = pd.nodes[`${pk}${n}`];
            if (!nd || !nd.icon || !fs.existsSync(path.join(V3, 'hires', nd.icon))) nodeMiss++;
        }
    }
}
check(`all ${nodeCount} summon node icons exist`, nodeMiss === 0, `${nodeMiss} missing`);

// 4) monster kits
let kitMiss = [];
for (const [k, v] of Object.entries(ms.MONSTER_ARCHETYPES)) {
    if (!v.kitIcon || !fs.existsSync(path.join(V3, 'hires', v.kitIcon))) kitMiss.push(k);
}
check('all 12 monster kit icons exist', kitMiss.length === 0, kitMiss.join(','));

// 5) v3 skill art spot checks (the 39 new sheet sprites)
const spot = ['MAGE:mana_drain', 'BERSERKER:blood_frenzy', 'DRAGON_GOD:leviathans_bane', 'REAPER:grim_reaping', 'WARLORD:banner_charge', 'NIGHTBLADE:eclipse'];
const spotMiss = spot.filter((k) => !idx[k]);
check('new sheet sprites indexed (spot)', spotMiss.length === 0, spotMiss.join(','));

// 6) substitute flags cleared in manifest for the 39
const manNoSub = (man.skills || []).filter((s) => s.note && s.note.includes('dedicated art 2026-10-12')).length;
check('manifest flags 39 dedicated-art skills', manNoSub === 39, `${manNoSub}`);

console.log(fail === 0 ? '\nV3 PACK QA: ALL GREEN' : `\nV3 PACK QA: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
