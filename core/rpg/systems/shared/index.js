// ============================================
// SUBSYSTEM: shared  — public API surface
// Private files may change freely; keep these exports stable (swap-out contract).
// Access from other subsystems:  require('../../registry').use('shared')
// ============================================
module.exports = {
    name: 'shared',
    ambient: require('./ambient'),
    broadcastHelpers: require('./broadcastHelpers'),
    dayNight: require('./dayNight'),
    emojiBitmap: require('./emojiBitmap'),
    emojiFont: require('./emojiFont'),
    isoShadow: require('./isoShadow'),
    loreContent: require('./loreContent'),
    loreDrops: require('./loreDrops'),
    lootArt: require('./lootArt'),
    mediaCache: require('./mediaCache'),
    renderWarmer: require('./renderWarmer'),
    shipCardRenderer: require('./shipCardRenderer'),
};
