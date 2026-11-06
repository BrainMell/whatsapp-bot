// ============================================
// SUBSYSTEM: characters  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('characters')
// ============================================
module.exports = {
    name: 'characters',
    abilityCards: require('./abilityCards'),
    classSystem: require('./classSystem'),
    progression: require('./progression'),
    skillAssets: require('./skillAssets'),
    skillTree: require('./skillTree'),
};
