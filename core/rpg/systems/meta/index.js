// ============================================
// SUBSYSTEM: meta  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('meta')
// ============================================
module.exports = {
    name: 'meta',
    altDetection: require('./altDetection'),
    interactionTracker: require('./interactionTracker'),
    profileCardRenderer: require('./profileCardRenderer'),
    socialSystem: require('./socialSystem'),
    testerSystem: require('./testerSystem'),
    tutorial: require('./tutorial'),
};
