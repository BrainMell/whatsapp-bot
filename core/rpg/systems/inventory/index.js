// ============================================
// SUBSYSTEM: inventory  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('inventory')
// ============================================
module.exports = {
    name: 'inventory',
    craftingSystem: require('./craftingSystem'),
    durabilitySystem: require('./durabilitySystem'),
    inventorySystem: require('./inventorySystem'),
    lootSystem: require('./lootSystem'),
    runeSystem: require('./runeSystem'),
    runeSynergies: require('./runeSynergies'),
    weaponSynergy: require('./weaponSynergy'),
};
