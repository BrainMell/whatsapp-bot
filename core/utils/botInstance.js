// ============================================
// 🪪 PROCESS-LEVEL BOT IDENTITY — context-independent
// ============================================
// WHY THIS EXISTS: botConfig.getBotId() reads the AsyncLocalStorage store,
// which is only populated inside per-message storage.run(...) scopes. Code
// that runs from the engine's 60s interval (Guild War sweeper, world
// alignment tick, feed flush) has NO store → every instance resolves to
// 'global' there. That broke the RPG-friendly GC registry:
//   - `.j gw rpg on` (command context)      → gw_rpg_gcs_Joker
//   - tick broadcast / feed flush (interval) → gw_rpg_gcs_global  ← never matches
// and collapsed the per-bot announce stamp to ONE shared key, so only the
// first announcing bot ever posted the call card.
//
// FIX (owner 2026-10-09 Guild War overhaul): each pm2 app hosts exactly ONE
// tenant (BOT_INSTANCE=Joker/Jake/Subaru — see ecosystem.config.js), so the
// process env is the stable identity in EVERY context. ALS stays the
// fallback for single-process dev runs without BOT_INSTANCE.
function resolveBotId() {
    const env = String(process.env.BOT_INSTANCE || '').trim();
    if (env) return env;
    try {
        return require('../../botConfig').getBotId() || 'global';
    } catch (e) {
        return 'global';
    }
}

module.exports = { resolveBotId };
