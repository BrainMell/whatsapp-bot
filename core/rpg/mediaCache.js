'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// mediaCache — disk L2 for baked render media (mp4 "GIFs" + PNG cards).
//
// Owner 2026-10-16 10:09Z: "bring gifs back and make the generation faster".
// The GIFs come back at the call sites (homestead viewRoom / baseBuilder
// viewBase); THIS module is the "faster": every render is deterministic per
// stateHash, so the baked mp4/png is stored once and every repeat view is a
// disk read instead of a 14-frame canvas bake (~15-20s on box hw).
//
// Layering per renderer: in-memory Map (hot, 10-min TTL) → THIS disk cache
// (survives pm2 restarts AND deploys — untracked dir, `git reset --hard`
// keeps untracked files) → full 14-frame bake (first view only).
//
// Write path is pid-suffixed tmp + rename, so sibling processes on the same
// box (jake/subaru share Box1's repo copy) can never tear a cache file.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');

// 47-k9: optional render-queue gate for heavy bakes. The 2026-10-20 03:11Z
// incident: owner fired `.j world` + `.j base` + `.j guild` back to back and
// THREE 20-frame bakes ran concurrently (nothing in core/rpg went through
// renderQueue.run except abilityCards) — RSS 424MB vs the pm2 430M cap on a
// 952MB box → pm2 memory kill mid-command, zero JS stack, "it just crashed".
// Queued bakes serialize one-at-a-time; every command-level caller already
// has a text/charter/legacy fallback for QueueFullError/MemoryGateError.
const renderQueue = require('../utils/renderQueue');

const repoRoot = path.join(__dirname, '..', '..');
const ROOT = process.env.QA_MODE
    ? path.join(os.tmpdir(), 'qa-media-cache')
    : path.join(repoRoot, 'media_cache');
const CAP = 300; // per kind (mp4s ~260KB, png cards <1MB → ≤ ~300MB worst case)
const MIN_SIZE = 500; // smaller than this is a broken render — never cache

// CODE-VERSIONED CACHE KEY — 2026-10-16 incident: this disk cache survives
// deploys BY DESIGN (untracked dir), and the ALL-FOREST art deploy (80d496cb)
// landed while every repeat view kept serving bakes baked by the OLD code —
// the owner's .j base kept showing the pre-forest island for hours (stale
// mp4 from 11:50Z, deploy restart at 12:44Z). stateHash only hashes game
// state, never the rendering code. Mixing the running code's git short-HEAD
// into the key makes every code deploy invalidate every cached render
// automatically — art changes can never again be masked by disk hits.
// Non-git runtimes fall back to a bumped literal that can never collide with
// the pre-fix key namespace.
let CODE_VER = 'v2';
// Key on the CONTENT of the render code + sprite manifest, NOT git HEAD: unrelated deploys
// (every bot commit) no longer throw away every baked card and force a cold re-render
// (owner 2026-10-20: ".j base / .j guild generate super slow now"). Art/render changes still bust it.
try {
    const crypto = require('crypto');
    const rpg = path.join(__dirname);
    const files = ['kingdom3d.js', 'kingdomTerrain.js', 'ambient.js', 'guildBaseRenderer.js', 'homesteadBaseRenderer.js', 'worldAtlasRenderer.js', 'structureScenes.js', 'baseBuilder.js']
        .map((f) => path.join(rpg, f)).concat([path.join(rpg, '..', 'rpgasset', 'kingdom3d', 'manifest.json')]);
    const h = crypto.createHash('sha1');
    for (const f of files) { try { h.update(fs.readFileSync(f)); } catch (e) { /* optional file */ } }
    CODE_VER = `c${h.digest('hex').slice(0, 10)}`;
} catch (e) { /* keeps 'v2' */ }
    // env override: proof bakes/QA set CODE_VER to bust stale disk entries without touching production keys
    if (process.env.CODE_VER) CODE_VER = process.env.CODE_VER;

function pathsFor(kind, key) {
    return {
        dir: path.join(ROOT, kind),
        data: path.join(ROOT, kind, `${key}.data`),
        meta: path.join(ROOT, kind, `${key}.json`),
    };
}

// 47-k10: in-flight produce dedup (see cached() below)
const _inflight = new Map();

async function touch(f) {
    try { const n = new Date(); await fs.promises.utimes(f, n, n); } catch (e) { /* best-effort */ }
}

async function trim(kind) {
    try {
        const dir = path.join(ROOT, kind);
        const files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.data'));
        if (files.length <= CAP) return;
        const stats = await Promise.all(files.map(async (f) => {
            const p = path.join(dir, f);
            try { return { p, m: (await fs.promises.stat(p)).mtimeMs }; } catch (e) { return { p, m: 0 }; }
        }));
        stats.sort((a, b) => a.m - b.m);
        const victims = stats.slice(0, files.length - CAP);
        for (const v of victims) {
            fs.promises.unlink(v.p).catch(() => {});
            fs.promises.unlink(v.p.replace(/\.data$/, '.json')).catch(() => {});
        }
    } catch (e) { /* best-effort */ }
}

/**
 * cached(kind, key, produce, journal, qopts) → { buffer, contentType }
 *   hit:  { buffer, contentType, cached: true }   (disk read, milliseconds)
 *   miss: runs produce() once, stores the result, returns it unchanged.
 *
 * `journal` (optional, must be plain JSON-able) is recorded INSIDE the meta
 * file (`{ct, j}`) so it lives and dies with its cache entry (trim() unlinks
 * both). renderWarmer.js reads these back after a code deploy: stateHash keys
 * change with CODE_VER, so the journaled state+opts are the only way to know
 * WHAT to re-bake under the new key without a user having to stare at a
 * 13-second cold view first. Null / absent journal = entry not replayable.
 *
 * `qopts` (optional, 47-k9): `{ label, timeoutMs }` — when present, produce()
 * runs inside renderQueue.run (one bake at a time, memory-gated). Heavy
 * callers (base / guildbase / room) pass it; absent = direct produce()
 * exactly as before (backward compatible). Rejections propagate to the
 * command layer's existing fallbacks.
 */
async function cached(kind, key, produce, journal, qopts) {
    key = `${CODE_VER}_${key}`; // code-version prefix — see CODE-VERSIONED note above
    const { dir, data, meta } = pathsFor(kind, key);
    try {
        const [metaRaw, buf] = await Promise.all([
            fs.promises.readFile(meta, 'utf8').catch(() => null),
            fs.promises.readFile(data).catch(() => null),
        ]);
        const mt = metaRaw ? (JSON.parse(metaRaw) || {}) : null;
        const ct = mt ? mt.ct : null;
        if (ct && buf && buf.length > MIN_SIZE) {
            touch(data);
            return { buffer: buf, contentType: ct, cached: true };
        }
    } catch (e) { /* fall through to produce */ }

    const run = (qopts && typeof qopts === 'object')
        ? () => renderQueue.run(String(qopts.label || `bake:${kind}`), produce, { timeoutMs: Math.max(5000, qopts.timeoutMs || 90000) })
        : produce;
    // 47-k10: in-flight dedup — two callers asking for the SAME state while a
    // bake is running (user view racing the renderWarmer replay, two members
    // opening the same guild) share ONE produce instead of queueing two
    // identical 10-19s bakes back to back.
    const dkey = `${kind}:${key}`;
    const cur = _inflight.get(dkey);
    if (cur) return cur;
    const p = (async () => {
        const out = await run();
        if (out && out.buffer && out.contentType
            && out.buffer.length > MIN_SIZE && out.buffer.length < 8 * 1024 * 1024) {
            try {
                await fs.promises.mkdir(dir, { recursive: true });
                const tmpData = `${data}.${process.pid}.tmp`;
                const tmpMeta = `${meta}.${process.pid}.tmp`;
                await fs.promises.writeFile(tmpData, out.buffer);
                await fs.promises.writeFile(tmpMeta, JSON.stringify({ ct: out.contentType, ...(journal !== undefined ? { j: journal } : {}) }));
                await Promise.all([
                    fs.promises.rename(tmpData, data),
                    fs.promises.rename(tmpMeta, meta),
                ]);
                trim(kind);
            } catch (e) { /* cache write is best-effort; the media still ships */ }
        }
        return out;
    })();
    _inflight.set(dkey, p);
    try { return await p; } finally { _inflight.delete(dkey); }
}

/**
 * listJournal(kind) → newest-first [{ hash, j, metaPath, fresh, mtime }]
 * One entry per cache meta that carries a journal, regardless of which
 * CODE_VER wrote it. `fresh` = the entry's media already exists under the
 * CURRENT CODE_VER (nothing to re-bake); renderWarmer replays the rest.
 */
function listJournal(kind) {
    const dir = path.join(ROOT, kind);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
    const cur = `${CODE_VER}_`;
    const out = [];
    for (const f of files) {
        let meta = null;
        try { meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
        if (!meta || meta.j === undefined || meta.j === null) continue;
        const hash = f.startsWith(cur) ? f.slice(cur.length, -5) : f.slice(f.indexOf('_') + 1, -5);
        let mtime = 0;
        try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { /* keep 0 */ }
        out.push({ hash, j: meta.j, metaPath: path.join(dir, f),
            fresh: fs.existsSync(path.join(dir, cur + hash + '.data')), mtime });
    }
    out.sort((a, b) => b.mtime - a.mtime);
    return out;
}

module.exports = { cached, listJournal };
