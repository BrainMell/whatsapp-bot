// ============================================
// SUBSYSTEM: pvp  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('pvp')
// ============================================
module.exports = {
    name: 'pvp',
    pvpSystem: require('./pvpSystem'),
};
