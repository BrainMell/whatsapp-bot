#!/usr/bin/env node
// codemod_rpg_moves.js — reorganize core/rpg into subsystem folders.
// MUST run on a PRISTINE tree right after `git mv`s (single pass, not idempotent by design).
// Usage: node scripts/codemod_rpg_moves.js rewrite   → rewrite all requires repo-wide
//        node scripts/codemod_rpg_moves.js audit     → every relative require must resolve on disk
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

// ---------- THE MOVE TABLE (old repo-relative path → new repo-relative path) ----------
const SYS = {
    shared: ['ambient', 'broadcastHelpers', 'dayNight', 'emojiBitmap', 'emojiFont', 'isoShadow', 'loreContent', 'loreDrops', 'lootArt', 'mediaCache', 'renderWarmer', 'shipCardRenderer'],
    economy: ['economy', 'investment', 'itemMarket', 'loans', 'playerMarket', 'stockMarket'],
    meta: ['altDetection', 'interactionTracker', 'profileCardRenderer', 'socialSystem', 'testerSystem', 'tutorial'],
    characters: ['abilityCards', 'classSystem', 'progression', 'skillAssets', 'skillTree'],
    combat: ['bossMechanics', 'classEncounters', 'combatImageGenerator', 'combatIntegration', 'encounterFramework', 'enemyVariants', 'monsterSkills', 'skillVfx', 'threatSystem', 'ultimateFx', 'ultimateFxCinema', 'ultimateFxCinema2', 'ultimateFxCosmic', 'ultimateFxLayers', 'ultimateFxLayers2', 'ultimateFxRecipes', 'ultimatePlateCache', 'vfxPreviewStage'],
    adventures: ['abyssScene', 'abyssSystem', 'bountySystem', 'guildAdventure', 'partyDungeonRank', 'raidSystem', 'soulReader', 'soulReaderRenderer'],
    world: ['continentMapRenderer', 'continents', 'cosmology', 'deadWorld', 'deadWorldRenderer', 'deadWorldSequences', 'dockPov', 'huntPov', 'kingdom3d', 'kingdomTerrain', 'minePov', 'structureScenes', 'wilds', 'worldAlignment', 'worldAtlasRenderer', 'worldMap', 'worldMapRenderer'],
    guildwar: ['guilds', 'guildCard', 'guildCardWarmer', 'guildBaseRenderer', 'guildPerks'],
    homestead: ['baseActivities', 'baseBuilder', 'homestead', 'homesteadBaseRenderer', 'homesteadRenderer', 'homesteadRooms'],
    inventory: ['craftingSystem', 'durabilitySystem', 'inventorySystem', 'lootSystem', 'runeSystem', 'runeSynergies', 'weaponSynergy'],
    cards: ['cardSystem'],
    summons: ['summonAchievements', 'summonAI', 'summonBondTraits', 'summonCapture', 'summonCodexRenderer', 'summonEggSystem', 'summonForging', 'summonRegistry', 'summonRosterRenderer', 'summonSkillTrees', 'summonSprites', 'summonSystem'],
    pvp: ['pvpSystem'],
};
const MOVES = [];
for (const [sys, files] of Object.entries(SYS)) for (const f of files) {
    MOVES.push([`core/rpg/${f}.js`, `core/rpg/systems/${sys}/${f}.js`]);
}
MOVES.push(['core/rpg/guildWar', 'core/rpg/systems/guildwar']);               // whole dir
MOVES.push(['core/rpg/interior3d', 'core/rpg/systems/homestead/interior3d']); // whole dir

// expand dir moves into per-file old→new (absolute) entries.
// works whether the dir still sits at the old or already sits at the new location.
const oldToNew = new Map();
const claimedNew = new Set(), claimedOld = new Set();
function addPair(o, n) {
    if (claimedOld.has(o) || claimedNew.has(n)) return false; // don't double-claim (dir walks must not steal individually-moved files)
    claimedOld.add(o); claimedNew.add(n); oldToNew.set(o, n); return true;
}
function walkPair(dA, dB, aIsOld) {
    for (const e of fs.readdirSync(dA, { withFileTypes: true })) {
        const cA = path.join(dA, e.name), cB = path.join(dB, e.name);
        if (e.isDirectory()) walkPair(cA, cB, aIsOld);
        else if (aIsOld) addPair(cA, cB);
        else addPair(cB, cA);
    }
}
for (const [o, n] of MOVES) {
    const ao = path.join(ROOT, o), an = path.join(ROOT, n);
    if (fs.existsSync(ao) && fs.statSync(ao).isDirectory()) walkPair(ao, an, true);
    else if (fs.existsSync(an) && fs.statSync(an).isDirectory()) walkPair(an, ao, false);
    else addPair(ao, an);
}
const newToOld = new Map([...oldToNew].map(([o, n]) => [n, o]));

// ---------- repo walker ----------
const SKIP = new Set(['node_modules', '.git', 'media_cache', 'instances', 'temp', 'tmp', 'logs', 'rpgasset', 'fx_captures', 'reactions', 'docs', '.pm2', 'data']);
function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
        else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
    }
    return out;
}

// ---------- require scanner ----------
const REQ_RE = /require\(\s*('([^'\n]+)'|"([^"\n]+)")\s*\)/g;
function candidates(base) { return [base, base + '.js', path.join(base, 'index.js')]; }
function resolveOld(spec, oldDir) {
    if (!spec.startsWith('.')) return {};
    const base = path.resolve(oldDir, spec);
    for (const c of candidates(base)) {
        if ((fs.existsSync(c) && fs.statSync(c).isFile()) || oldToNew.has(c)) return { abs: c, hadExt: spec.endsWith('.js') };
    }
    return { missing: true };
}
function relSpec(fromDir, toFile, hadExt) {
    let r = path.relative(fromDir, toFile).split(path.sep).join('/');
    if (!r.startsWith('.')) r = './' + r;
    if (!hadExt && r.endsWith('.js')) r = r.slice(0, -3);
    return r;
}

// ---------- mode: rewrite ----------
function rewrite() {
    const files = walk(ROOT, []);
    let changed = 0, totalRefs = 0;
    const unresolved = [];
    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        if (!src.includes('require(')) continue;
        const selfOld = newToOld.get(file);
        const oldDir = path.dirname(selfOld || file); // resolve specs as if pre-move
        const newDir = path.dirname(file);
        let n = 0;
        const out = src.replace(REQ_RE, (m, _q, sq, dq) => {
            const spec = sq || dq, quote = sq ? "'" : '"';
            const res = resolveOld(spec, oldDir);
            if (!res.abs) { if (res.missing) unresolved.push(`${path.relative(ROOT, file)} → ${spec}`); return m; }
            const target = oldToNew.get(res.abs) || res.abs;
            if (target === res.abs && !selfOld) return m; // unmoved requirer + unmoved target
            n++; totalRefs++;
            return `require(${quote}${relSpec(newDir, target, res.hadExt)}${quote})`;
        });
        if (n > 0) { fs.writeFileSync(file, out); changed++; }
    }
    console.log(`rewrote ${totalRefs} require refs across ${changed} files`);
    if (unresolved.length) {
        console.log(`PRE-EXISTING UNRESOLVED (left untouched): ${unresolved.length}`);
        [...new Set(unresolved)].forEach((u) => console.log('  ! ' + u));
    }
}

// ---------- mode: audit (strict — post-move disk must satisfy every relative require) ----------
// Runtime code (core/** + root index.js) must resolve 100%; scripts/ is dev-side and only reported.
const ALLOWLIST = [
    'core/engine.js → ./goImageService',
    'core/engine.js → ../models/System',
    'core/rpg/systems/adventures/guildAdventure.js → ../economy',   // pre-existing broken (fixed separately)
    'core/rpg/systems/economy/playerMarket.js → ../botConfig',      // pre-existing broken (fixed separately)
    'core/rpg/systems/meta/tutorial.js → ../botConfig',             // pre-existing broken (fixed separately)
    'core/rpg/systems/world/worldAlignment.js → ../botConfig',      // pre-existing broken (fixed separately)
    'core/rpg/systems/guildwar/state.js → ../../botConfig',         // pre-existing broken (fixed separately)
];
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(?<=[^:'"\\])\/\/.*$/gm, '');
}
function auditOne(file, src, bad, okCounter, report) {
    for (const m of stripComments(src).matchAll(REQ_RE)) {
        const spec = m[2] || m[3];
        if (!spec.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), spec);
        const hit = candidates(base).some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
        if (hit) { okCounter.n++; continue; }
        const tag = `${path.relative(ROOT, file)} → ${spec}`;
        if (ALLOWLIST.includes(tag)) { okCounter.n++; continue; }
        bad.push(tag);
        if (report) console.log(`  BROKEN ${tag}`);
    }
}
function audit() {
    const files = walk(ROOT, []);
    const badRuntime = [], badScripts = [];
    const okCounter = { n: 0 };
    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        if (!src.includes('require(')) continue;
        const isScript = file.includes(`${path.sep}scripts${path.sep}`);
        auditOne(file, src, isScript ? badScripts : badRuntime, okCounter, !isScript);
    }
    console.log(`audit: ${okCounter.n} relative requires resolve, runtime BROKEN: ${badRuntime.length}, dev-scripts BROKEN (pre-existing, non-fatal): ${badScripts.length}`);
    badScripts.slice(0, 10).forEach((t) => console.log('  (scripts) ' + t));
    process.exit(badRuntime.length ? 1 : 0);
}

if (process.argv[2] === 'rewrite') rewrite();
else if (process.argv[2] === 'audit') audit();
else if (process.argv[2] === 'debug') {
    const fl = walk(ROOT, []);
    const ff = fl.find((x) => x.endsWith(process.argv[3]));
    console.log('walked file:', ff);
    console.log('selfOld:', newToOld.get(ff));
    console.log('map size:', oldToNew.size, '| total walked:', fl.length, '| under systems/:', fl.filter((x) => x.includes('/systems/')).length);
    console.log('resolve ./kingdom3d from core/rpg:', JSON.stringify(resolveOld('./kingdom3d', path.join(ROOT, 'core/rpg'))));
} else { console.error('usage: node codemod_rpg_moves.js rewrite|audit|debug <file>'); process.exit(2); }
