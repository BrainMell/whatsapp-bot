'use strict';
// ===========================================================================
// renderWarmer - kills the post-deploy cold-bake stall on .j base / .j guild
// 02:50Z, right after the revert deploy: "the .j base
// and .j guild is taking a while to load up". Measured on box hw (probe):
// cold = 12.7s (base) / 5.5s (guild) - 20-frame bake + ffmpeg; warm = instant.
// mediaCache CODE_VER deliberately changes on EVERY deploy (stale-art fix,
// incident), which invalidates every cached render at once - so
// the first view of every base/guild after each deploy eats the full bake.
// The fix: renderers journal the state+opts of every successful bake INSIDE
// the cache meta (mediaCache `j` field - lives/dies with its entry, so no
// unbounded growth). ~45s after boot this module replays the newest N
// journals through the normal render path: disk cache misses under the new
// CODE_VER, re-bakes into it, and by the time players view, they get instant
// disk hits. Nothing is sent to anyone - purely background cache seeding.
// Bounds: newest-first, capped per kind (20 base / 30 guild - guild bakes are
// cheaper), 500ms gaps, 8-minute hard deadline, once per process. A journal
// that fails to replay (schema drift, missing assets) has its meta dropped so
// dead entries can't haunt every future deploy. Kill switch: RENDER_WARMER=off.
// ===========================================================================

const fs = require('fs');
const mediaCache = require('./mediaCache');

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEADLINE_MS = 8 * 60000;
const GAP_MS = 500;

let _ran = false;

/** retire a consumed journal entry: unlink its meta + data pair, best-effort.
 *  The old-CODE_VER media can never be hit again (CODE_VER moves forward on
 *  every deploy), and on success the journal now lives in the new meta. */
function dropOld(e) {
    try { fs.unlinkSync(e.metaPath); } catch (e2) { /* already gone */ }
    try { fs.unlinkSync(e.metaPath.replace(/\.json$/, '.data')); } catch (e2) { /* pair cleanup is cosmetic */ }
}

async function warmOnce() {
    if (_ran) return;
    _ran = true;
    const kinds = [
        { kind: 'base', max: 20, render: (j) => require('./homesteadBaseRenderer').renderBaseImage(j.state, j.opts || {}) },
        { kind: 'guildbase', max: 30, render: (j) => require('./guildBaseRenderer').renderGuildBaseImage(j.state, j.opts || {}) },
    ];
    const t0 = Date.now();
    let baked = 0, dead = 0;
    for (const k of kinds) {
        if (Date.now() - t0 > DEADLINE_MS) break;
        let entries;
        try { entries = mediaCache.listJournal(k.kind).filter((e) => !e.fresh).slice(0, k.max); }
        catch (e) { continue; }
        if (!entries.length) continue;
        console.log(`[renderWarmer] ${k.kind}: re-baking ${entries.length} journaled render(s) invalidated by the last deploy...`);
        let n = 0;
        for (const e of entries) {
            if (Date.now() - t0 > DEADLINE_MS) break;
            try {
                const out = await k.render(e.j);
                n++; baked++;
 // success → the journal now lives in the current-CODE_VER meta (mediaCache
 // carries it forward on every bake), so the old meta is a dead duplicate
 // that would otherwise be re-listed as stale on EVERY future boot. Drop it.
                dropOld(e);
            } catch (err) {
                dead++;
                dropOld(e);
                console.log(`[renderWarmer] ${k.kind} replay failed (stale journal dropped): ${String(err.message).slice(0, 120)}`);
            }
            await SLEEP(GAP_MS);
        }
        console.log(`[renderWarmer] ${k.kind}: ${n} warmed`);
    }
    if (baked + dead) console.log(`[renderWarmer] done: ${baked} re-baked, ${dead} dead journals dropped in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    else console.log('[renderWarmer] nothing to warm (first boot with journals, or cache already hot)');
}

function schedule() {
    if (process.env.QA_MODE || process.env.RENDER_WARMER === 'off') return;
 // 45s delay: let the bot finish booting + first message handling before any bake CPU
    setTimeout(() => warmOnce().catch((e) => console.log('[renderWarmer] failed: ' + e.message)), 45000).unref();
}

module.exports = { schedule, warmOnce };
