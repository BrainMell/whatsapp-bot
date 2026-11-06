// ============================================
// SUBSYSTEM: cards  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('cards')
// ============================================
module.exports = {
    name: 'cards',
    cardSystem: require('./cardSystem'),
};
