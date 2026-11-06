// ============================================
// SUBSYSTEM: economy  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('economy')
// ============================================
module.exports = {
    name: 'economy',
    economy: require('./economy'),
    investment: require('./investment'),
    itemMarket: require('./itemMarket'),
    loans: require('./loans'),
    playerMarket: require('./playerMarket'),
    stockMarket: require('./stockMarket'),
};
