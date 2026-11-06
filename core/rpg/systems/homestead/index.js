// ============================================
// SUBSYSTEM: homestead  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('homestead')
// ============================================
module.exports = {
    name: 'homestead',
    baseActivities: require('./baseActivities'),
    baseBuilder: require('./baseBuilder'),
    homestead: require('./homestead'),
    homesteadBaseRenderer: require('./homesteadBaseRenderer'),
    homesteadRenderer: require('./homesteadRenderer'),
    homesteadRooms: require('./homesteadRooms'),
    interior3d: require('./interior3d'),
};
