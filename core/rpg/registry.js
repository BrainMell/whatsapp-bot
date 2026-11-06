// ============================================
// RPG SUBSYSTEM REGISTRY
// The single wiring point between gameplay subsystems.
//   const { use } = require('../rpg/registry');
//   const summons = use('summons');          // → systems/summons/index.js exports
//   summons.summonSystem.captureMonster(...)
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
    if (!fs.existsSync(p)) throw new Error(`[rpg.registry] unknown subsystem '${name}'`);
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
