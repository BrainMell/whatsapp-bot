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

const repoRoot = path.join(__dirname, '..', '..');
const ROOT = process.env.QA_MODE
    ? path.join(os.tmpdir(), 'qa-media-cache')
    : path.join(repoRoot, 'media_cache');
const CAP = 300; // per kind (mp4s ~260KB, png cards <1MB → ≤ ~300MB worst case)
const MIN_SIZE = 500; // smaller than this is a broken render — never cache

function pathsFor(kind, key) {
    return {
        dir: path.join(ROOT, kind),
        data: path.join(ROOT, kind, `${key}.data`),
        meta: path.join(ROOT, kind, `${key}.json`),
    };
}

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
 * cached(kind, key, produce) → { buffer, contentType }
 *   hit:  { buffer, contentType, cached: true }   (disk read, milliseconds)
 *   miss: runs produce() once, stores the result, returns it unchanged.
 */
async function cached(kind, key, produce) {
    const { dir, data, meta } = pathsFor(kind, key);
    try {
        const [metaRaw, buf] = await Promise.all([
            fs.promises.readFile(meta, 'utf8').catch(() => null),
            fs.promises.readFile(data).catch(() => null),
        ]);
        const ct = metaRaw ? (JSON.parse(metaRaw) || {}).ct : null;
        if (ct && buf && buf.length > MIN_SIZE) {
            touch(data);
            return { buffer: buf, contentType: ct, cached: true };
        }
    } catch (e) { /* fall through to produce */ }

    const out = await produce();
    if (out && out.buffer && out.contentType
        && out.buffer.length > MIN_SIZE && out.buffer.length < 8 * 1024 * 1024) {
        try {
            await fs.promises.mkdir(dir, { recursive: true });
            const tmpData = `${data}.${process.pid}.tmp`;
            const tmpMeta = `${meta}.${process.pid}.tmp`;
            await fs.promises.writeFile(tmpData, out.buffer);
            await fs.promises.writeFile(tmpMeta, JSON.stringify({ ct: out.contentType }));
            await Promise.all([
                fs.promises.rename(tmpData, data),
                fs.promises.rename(tmpMeta, meta),
            ]);
            trim(kind);
        } catch (e) { /* cache write is best-effort; the media still ships */ }
    }
    return out;
}

module.exports = { cached };
