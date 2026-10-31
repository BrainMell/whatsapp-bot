'use strict';
// Pre-bakes the dedicated guild card for EVERY existing guild, for every time-of-day phase, in the background
// (boot + whenever the phase flips + hourly top-up). Cached cards are disk hits (~ms), so `.j guild` is instant.
// Cheap (one Go card call + a grade per guild/phase), spaced out, never throws. Kill switch: RENDER_WARMER=off.
const dayNight = require('./dayNight');
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
let _busy = false, _lastPhase = null, _lastFull = 0;

async function warmAll({ allPhases = true } = {}) {
    if (_busy) return { baked: 0, skipped: true };
    _busy = true;
    let baked = 0, hit = 0, failed = 0;
    try {
        const guilds = require('./guilds');
        const gc = require('./guildCard');
        const all = (guilds.getAllGuilds ? guilds.getAllGuilds() : {}) || {};
        const cur = dayNight.phaseAt();
        const phases = allPhases ? [cur, ...Object.keys(dayNight.PHASES).filter((p) => p !== cur)] : [cur];
        for (const ph of phases) {
            for (const [name, g] of Object.entries(all)) {
                try {
                    const r = await gc.render(name, g, { phase: ph });
                    if (!r) failed++; else if (r.cached) hit++; else baked++;
                } catch (e) { failed++; }
                await SLEEP(150);
            }
        }
        if (baked || failed) console.log(`[guildCardWarmer] ${Object.keys(all).length} guild(s): ${baked} baked, ${hit} already cached, ${failed} failed`);
    } finally { _busy = false; }
    return { baked, hit, failed };
}

function schedule() {
    if (process.env.QA_MODE || process.env.RENDER_WARMER === 'off') return;
    setTimeout(() => { _lastFull = Date.now(); warmAll().catch((e) => console.log('[guildCardWarmer] ' + e.message)); }, 60000).unref();
    // phase flip -> warm the new phase first; hourly -> top up guilds whose stats changed
    setInterval(() => {
        const ph = dayNight.phaseAt();
        const flipped = _lastPhase && ph !== _lastPhase; _lastPhase = ph;
        if (flipped || Date.now() - _lastFull > 3600000) { _lastFull = Date.now(); warmAll({ allPhases: false }).catch(() => {}); }
    }, 5 * 60000).unref();
}
module.exports = { schedule, warmAll };
