'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  renderWarmer — kills the post-deploy cold-bake stall on .j base / .j guild
//
//  Owner 2026-10-20 02:50Z, right after the 47-k8b revert deploy: "the .j base
//  and .j guild is taking a while to load up". Measured on box hw (probe):
//  cold = 12.7s (base) / 5.5s (guild) — 20-frame bake + ffmpeg; warm = instant.
//  mediaCache CODE_VER deliberately changes on EVERY deploy (stale-art fix,
//  2026-10-16 incident), which invalidates every cached render at once — so
//  the first view of every base/guild after each deploy eats the full bake.
//
//  The fix: renderers journal the state+opts of every successful bake INSIDE
//  the cache meta (mediaCache `j` field — lives/dies with its entry, so no
//  unbounded growth). ~45s after boot this module replays the newest N
//  journals through the normal render path: disk cache misses under the new
//  CODE_VER, re-bakes into it, and by the time players view, they get instant
//  disk hits. Nothing is sent to anyone — purely background cache seeding.
//
//  Bounds: newest-first, capped per kind (20 base / 30 guild — guild bakes are
//  cheaper), 500ms gaps, 8-minute hard deadline, once per process. A journal
//  that fails to replay (schema drift, missing assets) has its meta dropped so
//  dead entries can't haunt every future deploy. Kill switch: RENDER_WARMER=off.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const mediaCache = require('./mediaCache');

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const DEADLINE_MS = 8 * 60000;
const GAP_MS = 500;

let _ran = false;

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
                await k.render(e.j);
                n++; baked++;
            } catch (err) {
                dead++;
                try { fs.unlinkSync(e.metaPath); } catch (e2) { /* journal dies with its meta */ }
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
