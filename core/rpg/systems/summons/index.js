// ============================================
// SUBSYSTEM: summons  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('summons')
// ============================================
module.exports = {
    name: 'summons',
    summonAchievements: require('./summonAchievements'),
    summonAI: require('./summonAI'),
    summonBondTraits: require('./summonBondTraits'),
    summonCapture: require('./summonCapture'),
    summonCodexRenderer: require('./summonCodexRenderer'),
    summonEggSystem: require('./summonEggSystem'),
    summonForging: require('./summonForging'),
    summonRegistry: require('./summonRegistry'),
    summonRosterRenderer: require('./summonRosterRenderer'),
    summonSkillTrees: require('./summonSkillTrees'),
    summonSprites: require('./summonSprites'),
    summonSystem: require('./summonSystem'),
};
