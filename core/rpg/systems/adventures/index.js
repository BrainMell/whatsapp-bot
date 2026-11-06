// ============================================
// SUBSYSTEM: adventures  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('adventures')
// ============================================
module.exports = {
    name: 'adventures',
    abyssScene: require('./abyssScene'),
    abyssSystem: require('./abyssSystem'),
    bountySystem: require('./bountySystem'),
    guildAdventure: require('./guildAdventure'),
    partyDungeonRank: require('./partyDungeonRank'),
    raidSystem: require('./raidSystem'),
    soulReader: require('./soulReader'),
    soulReaderRenderer: require('./soulReaderRenderer'),
};
