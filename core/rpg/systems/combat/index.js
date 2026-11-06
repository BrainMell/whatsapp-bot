// ============================================
// SUBSYSTEM: combat  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('combat')
// ============================================
module.exports = {
    name: 'combat',
    bossMechanics: require('./bossMechanics'),
    classEncounters: require('./classEncounters'),
    combatImageGenerator: require('./combatImageGenerator'),
    combatIntegration: require('./combatIntegration'),
    encounterFramework: require('./encounterFramework'),
    enemyVariants: require('./enemyVariants'),
    monsterSkills: require('./monsterSkills'),
    skillVfx: require('./skillVfx'),
    threatSystem: require('./threatSystem'),
    ultimateFx: require('./ultimateFx'),
    ultimateFxCinema: require('./ultimateFxCinema'),
    ultimateFxCinema2: require('./ultimateFxCinema2'),
    ultimateFxCosmic: require('./ultimateFxCosmic'),
    ultimateFxLayers: require('./ultimateFxLayers'),
    ultimateFxLayers2: require('./ultimateFxLayers2'),
    ultimateFxRecipes: require('./ultimateFxRecipes'),
    ultimatePlateCache: require('./ultimatePlateCache'),
    vfxPreviewStage: require('./vfxPreviewStage'),
};
