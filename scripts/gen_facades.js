#!/usr/bin/env node
// gen_facades.js — one-time generator: registry.js + 13 subsystem index facades in ~/refactor-ws
const fs = require('fs'), path = require('path');
const ROOT = '/home/ubuntu/refactor-ws';

const registry = `// ============================================
// RPG SUBSYSTEM REGISTRY
// The single wiring point between gameplay subsystems.
//   const { use } = require('../rpg/registry');
//   const eco = use('economy');              // → systems/economy/index.js exports
//   eco.economy.addMoney(...)
//
// Swap-out contract (see core/rpg/README.md):
//   a subsystem = one folder under systems/<name>/ + one public API in its index.js.
//   Everything else in the folder is private and can be rebuilt freely.
// Rules:
//   • a subsystem may require anything in shared/ directly (foundation layer)
//   • a subsystem reaches ANOTHER subsystem only via use('<name>') or the other
//     system's index.js — never by deep-requiring its private files
//   • new subsystems: mkdir systems/<name>/, add index.js, done — registry finds it
// ============================================
const fs = require('fs');
const path = require('path');

const REG = new Map();

function load(name) {
    if (REG.has(name)) return REG.get(name);
    const p = path.join(__dirname, 'systems', name, 'index.js');
    if (!fs.existsSync(p)) throw new Error(\`[rpg.registry] unknown subsystem '\${name}'\`);
    const api = require(p);
    if (api && typeof api === 'object' && !api.name) api.name = name;
    REG.set(name, api);
    return api;
}

function names() {
    return fs.readdirSync(path.join(__dirname, 'systems'))
        .filter((d) => fs.existsSync(path.join(__dirname, 'systems', d, 'index.js')))
        .sort();
}

module.exports = {
    use: load,
    register: (name, api) => { REG.set(name, api); return api; },
    names,
    has: (name) => REG.has(name) || fs.existsSync(path.join(__dirname, 'systems', name, 'index.js')),
    _map: REG,
};
`;
fs.writeFileSync(path.join(ROOT, 'core/rpg/registry.js'), registry);

const rootIndex = `// core/rpg — one-stop import surface for the RPG engine.
//   const rpg = require('./rpg');
//   rpg.use('economy').economy.getZENI(jid)
// Individual files also keep their normal deep paths for back-compat.
module.exports = require('./registry');
`;
fs.writeFileSync(path.join(ROOT, 'core/rpg/index.js'), rootIndex);

// subsystem → [module filename stems]  (export key = filename stem, greppable)
const SYS = {
    shared: ['ambient', 'broadcastHelpers', 'dayNight', 'emojiBitmap', 'emojiFont', 'isoShadow', 'loreContent', 'loreDrops', 'lootArt', 'mediaCache', 'renderWarmer', 'shipCardRenderer'],
    economy: ['economy', 'investment', 'itemMarket', 'loans', 'playerMarket', 'stockMarket'],
    meta: ['altDetection', 'interactionTracker', 'profileCardRenderer', 'socialSystem', 'testerSystem', 'tutorial'],
    characters: ['abilityCards', 'classSystem', 'progression', 'skillAssets', 'skillTree'],
    combat: ['bossMechanics', 'classEncounters', 'combatImageGenerator', 'combatIntegration', 'encounterFramework', 'enemyVariants', 'monsterSkills', 'skillVfx', 'threatSystem', 'ultimateFx', 'ultimateFxCinema', 'ultimateFxCinema2', 'ultimateFxCosmic', 'ultimateFxLayers', 'ultimateFxLayers2', 'ultimateFxRecipes', 'ultimatePlateCache', 'vfxPreviewStage'],
    adventures: ['abyssScene', 'abyssSystem', 'bountySystem', 'guildAdventure', 'partyDungeonRank', 'raidSystem', 'soulReader', 'soulReaderRenderer'],
    world: ['continentMapRenderer', 'continents', 'cosmology', 'deadWorld', 'deadWorldRenderer', 'deadWorldSequences', 'dockPov', 'huntPov', 'kingdom3d', 'kingdomTerrain', 'minePov', 'structureScenes', 'wilds', 'worldAlignment', 'worldAtlasRenderer', 'worldMap', 'worldMapRenderer'],
    homestead: ['baseActivities', 'baseBuilder', 'homestead', 'homesteadBaseRenderer', 'homesteadRenderer', 'homesteadRooms', 'interior3d'],
    inventory: ['craftingSystem', 'durabilitySystem', 'inventorySystem', 'lootSystem', 'runeSystem', 'runeSynergies', 'weaponSynergy'],
    cards: ['cardSystem'],
    pvp: ['pvpSystem'],
};

for (const [sys, mods] of Object.entries(SYS)) {
    const lines = mods.map((m) => `    ${m}: require('./${m}'),`);
    const body = `// ============================================
// SUBSYSTEM: ${sys}  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('${sys}')
// ============================================
module.exports = {
    name: '${sys}',
${lines.join('\n')}
};
`;
    fs.writeFileSync(path.join(ROOT, `core/rpg/systems/${sys}/index.js`), body);
}

// guildwar is special: the old guildWar/index.js became war.js — spread its whole
// API at the top level so existing dir-requires (engine's war tick, dmRouter checks)
// keep every export they had, then add the guild-side modules.
const gw = `// ============================================
// SUBSYSTEM: guildwar — public API surface
// war.js is the former guildWar/index.js (war engine: state, dmRouter wiring, tick).
// Its full export set is spread here so legacy dir-requires keep working untouched.
// Access from other subsystems:  require('../../registry').use('guildwar')
// ============================================
const war = require('./war');
module.exports = {
    name: 'guildwar',
    ...war,
    war,
    guilds: require('./guilds'),
    guildPerks: require('./guildPerks'),
    guildCard: require('./guildCard'),
    guildCardWarmer: require('./guildCardWarmer'),
    guildBaseRenderer: require('./guildBaseRenderer'),
};
`;
fs.writeFileSync(path.join(ROOT, 'core/rpg/systems/guildwar/index.js'), gw);

console.log('facades written:', fs.readdirSync(path.join(ROOT, 'core/rpg/systems')).join(', '));
console.log('registry + root index written');
