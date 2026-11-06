// ============================================
// SUBSYSTEM: world  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('world')
// ============================================
module.exports = {
    name: 'world',
    continentMapRenderer: require('./continentMapRenderer'),
    continents: require('./continents'),
    cosmology: require('./cosmology'),
    deadWorld: require('./deadWorld'),
    deadWorldRenderer: require('./deadWorldRenderer'),
    deadWorldSequences: require('./deadWorldSequences'),
    dockPov: require('./dockPov'),
    huntPov: require('./huntPov'),
    kingdom3d: require('./kingdom3d'),
    kingdomTerrain: require('./kingdomTerrain'),
    minePov: require('./minePov'),
    structureScenes: require('./structureScenes'),
    wilds: require('./wilds'),
    worldAlignment: require('./worldAlignment'),
    worldAtlasRenderer: require('./worldAtlasRenderer'),
    worldMap: require('./worldMap'),
    worldMapRenderer: require('./worldMapRenderer'),
};
