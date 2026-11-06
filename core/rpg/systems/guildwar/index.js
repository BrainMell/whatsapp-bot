// ============================================
// SUBSYSTEM: guildwar — public API surface
// war.js is the former guildWar/index.js (war engine: state, dmRouter wiring, tick).
// Its full export set is spread here so legacy dir-requires keep working untouched.
// Access from other subsystems:  require('../../registry').use('guildwar')
// ============================================
const war = require('./war');
module.exports = {
    name: 'guildwar',
    ...war,
    war,
    guilds: require('./guilds'),
    guildPerks: require('./guildPerks'),
    guildCard: require('./guildCard'),
    guildCardWarmer: require('./guildCardWarmer'),
    guildBaseRenderer: require('./guildBaseRenderer'),
};
