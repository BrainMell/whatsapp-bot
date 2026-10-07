// ============================================
// RENDER QUEUE (2026-10-08) — owner-approved memory-smoothing gate (#4/#5)
// ============================================
// Owner directive 2026-10-07 (Mellow, approved "I'd prefer you go"):
//   "What if we que the image processing? Since individually they are super
//    fast, it would be better if they worked one after the other, so instead
//    of a ram spike, it's more like a ram steady move"
//
// WHY (Task 4 forensics): 20+ canvas renderers each allocate a W×H×4 cairo
// surface + PNG + base64 + upload buffers (30-80MB native transients per
// image). Concurrent bursts (.j combat ×4 in 35s) stack them on a 952MB box
// -> swap pressure -> event-loop stall >75s -> livenessCanary SIGKILL
// (87× Box1 / 5× Box2) or pm2 380M cap kill.
//
// WHAT this module provides:
//   run(label, fn, opts)          one-at-a-time render slot (FIFO), with
//                                 queue cap + job timeout + memory gate
//   getOrRender(key, fn, opts)    same, plus TTL cache + in-flight dedup
//                                 (identical payloads render once)
//   assertCanAllocate(w, h)       EMERGENCY BRAKE: throws MemoryGateError
//                                 when MemAvailable is under the hard floor
//                                 (wired into canvasAutoGate.createCanvas —
//                                 applies to EVERY renderer, current and
//                                 future, with zero per-file wiring)
//   trackSurface(w, h, ref)       live-canvas accounting (+GC tracking)
//   canSpawnChild()               memory-aware gate for forked render
//                                 workers (GW pool uses this)
//   stats()                       telemetry
//
// REENTRANCY: code running INSIDE a job bypasses the queue (AsyncLocalStorage),
// so a wrapped renderer whose auto-patched toBuffer also queues can never
// self-deadlock.
//
// ESCAPE HATCH: RENDERQ_DISABLE=1 (+ pm2 restart) turns every gate into a
// passthrough without a redeploy. Tracking stays on (harmless, useful).
// ============================================
'use strict';

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const DISABLED = process.env.RENDERQ_DISABLE === '1';
const CONCURRENCY = Math.max(1, parseInt(process.env.RENDERQ_CONCURRENCY || '1', 10) || 1);
const MAXWAIT = Math.max(1, parseInt(process.env.RENDERQ_MAXWAIT || '5', 10) || 5);
const JOB_TIMEOUT_MS = Math.max(2000, parseInt(process.env.RENDERQ_JOB_TIMEOUT_MS || '15000', 10) || 15000);
const SOFT_MB = parseInt(process.env.RENDERQ_SOFT_MB || '200', 10) || 200;
const HARD_MB = parseInt(process.env.RENDERQ_HARD_MB || '140', 10) || 140;
const CACHE_TTL_MS = Math.max(1000, parseInt(process.env.RENDERQ_CACHE_TTL_MS || '60000', 10) || 60000);
const CACHE_MAX = 32;
const SURFACE_WARN_COUNT = 6;
const SURFACE_WARN_BYTES = 128 * 1048576;

class QueueFullError extends Error {
    constructor(msg) { super(msg); this.name = 'QueueFullError'; this.code = 'EQUEUEFULL'; }
}
class MemoryGateError extends Error {
    constructor(msg) { super(msg); this.name = 'MemoryGateError'; this.code = 'EMEM'; }
}

const _als = new AsyncLocalStorage();
const _queue = [];          // FIFO of pending jobs
let _active = 0;
const _counters = {
    jobs: 0, rejectedFull: 0, rejectedMem: 0, rejectedAlloc: 0,
    timeouts: 0, cacheHits: 0, syncEncodes: 0, slowEncodes: 0,
};

// ── system memory probe ──────────────────────────────────────────────
// MemAvailable (Linux) is the honest number on these boxes: it counts
// reclaimable caches, which os.freemem() ignores (freemem said 60MB while
// 400MB was reclaimable during Task 4 sampling).
let _memProbe = null;               // test hook
let _memCache = { v: null, at: 0 };
function memAvailMB(maxAgeMs = 500) {
    if (_memProbe) return _memProbe();
    const now = Date.now();
    if (_memCache.at && (now - _memCache.at) < maxAgeMs) return _memCache.v;
    let v = null;
    try {
        const txt = fs.readFileSync('/proc/meminfo', 'utf8');
        const m = /MemAvailable:\s+(\d+)\s*kB/.exec(txt);
        if (m) v = Math.floor(parseInt(m[1], 10) / 1024);
    } catch (e) { /* non-Linux / container without meminfo */ }
    if (v === null) {
        try { v = Math.floor(os.freemem() / 1048576); } catch (e) { /* leave null */ }
    }
    _memCache = { v, at: now };
    return v;
}

// ── live canvas surface accounting ───────────────────────────────────
const _reg = typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry((held) => { _live.count--; _live.estBytes -= held.bytes; })
    : null;
const _live = { count: 0, estBytes: 0, lastWarn: 0 };

function trackSurface(w, h, ref) {
    const bytes = Math.max(0, (w | 0) * (h | 0) * 4);
    _live.count++;
    _live.estBytes += bytes;
    if (_reg && ref) {
        try { _reg.register(ref, { bytes }); } catch (e) { /* non-object ref */ }
    }
    const now = Date.now();
    if ((_live.count > SURFACE_WARN_COUNT || _live.estBytes > SURFACE_WARN_BYTES)
        && (now - _live.lastWarn) > 60000) {
        _live.lastWarn = now;
        console.warn(`[RenderQ] ${_live.count} live canvas surfaces (~${Math.round(_live.estBytes / 1048576)}MB est) — renders piling up`);
    }
}

// ── the emergency brake (called from patched createCanvas) ───────────
function assertCanAllocate(w, h) {
    if (DISABLED) return;
    const avail = memAvailMB(250);
    if (avail !== null && avail < HARD_MB) {
        _counters.rejectedAlloc++;
        console.warn(`[RenderQ] BRAKE: canvas ${w}x${h} refused — MemAvailable ${avail}MB < ${HARD_MB}MB hard floor`);
        throw new MemoryGateError(`canvas ${w}x${h} refused: MemAvailable ${avail}MB < ${HARD_MB}MB hard floor`);
    }
}

// memory-aware gate for forked render workers (GW child pool)
function canSpawnChild() {
    const avail = memAvailMB(1000);
    if (avail === null) return true;
    return avail >= (HARD_MB + 20);
}

// ── the queue ────────────────────────────────────────────────────────
function run(label, fn, opts = {}) {
    if (typeof fn !== 'function') return Promise.reject(new TypeError('renderQueue.run(label, fn)'));
    if (DISABLED || _als.getStore()) {
        // passthrough (escape hatch) or reentrant (already hold a slot)
        return Promise.resolve().then(fn);
    }
    const avail = memAvailMB(500);
    if (avail !== null && avail < SOFT_MB) {
        _counters.rejectedMem++;
        console.warn(`[RenderQ] reject(${label}): MemAvailable ${avail}MB < ${SOFT_MB}MB soft floor — caller should fall back to text`);
        return Promise.reject(new MemoryGateError(`render gate: MemAvailable ${avail}MB < ${SOFT_MB}MB soft floor`));
    }
    if (_queue.length >= MAXWAIT) {
        _counters.rejectedFull++;
        console.warn(`[RenderQ] reject(${label}): queue full (${_queue.length}/${MAXWAIT}) — caller should fall back to text`);
        return Promise.reject(new QueueFullError(`render queue full (${MAXWAIT} waiting)`));
    }
    return new Promise((resolve, reject) => {
        _queue.push({ label, fn, resolve, reject, enqueuedAt: Date.now(), timeoutMs: opts.timeoutMs });
        _tick();
    });
}

function _tick() {
    if (_active >= CONCURRENCY) return;
    const job = _queue.shift();
    if (!job) return;
    // re-check pressure at dispatch time: if the box dipped under the soft
    // floor while jobs waited, shed the WHOLE queue (fail fast to text —
    // stalling here is what got the canary to SIGKILL us 87 times).
    const avail = memAvailMB(500);
    if (avail !== null && avail < SOFT_MB) {
        _counters.rejectedMem++;
        job.reject(new MemoryGateError(`render gate at dispatch: MemAvailable ${avail}MB < ${SOFT_MB}MB`));
        while (_queue.length) {
            const j = _queue.shift();
            _counters.rejectedMem++;
            j.reject(new MemoryGateError(`render gate (queue shed): MemAvailable ${avail}MB < ${SOFT_MB}MB`));
        }
        return;
    }
    _active++;
    _exec(job);
}

function _exec(job) {
    const startedAt = Date.now();
    const waitedMs = startedAt - job.enqueuedAt;
    const timeoutMs = Math.max(1000, job.timeoutMs || JOB_TIMEOUT_MS);
    let timer = null;
    let done = false;
    const finish = (err, val) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        _active--;
        const ms = Date.now() - startedAt;
        if (err) {
            if (/timeout/.test(String(err.message))) _counters.timeouts++;
            job.reject(err);
        } else {
            _counters.jobs++;
            if (ms > 1000 || waitedMs > 1000) {
                console.log(`[RenderQ] ${job.label}: ${ms}ms (waited ${waitedMs}ms, queued behind ${_queue.length})`);
            }
            job.resolve(val);
        }
        setImmediate(_tick);
    };
    timer = setTimeout(() => finish(new Error(`render job timeout (${timeoutMs}ms): ${job.label}`)), timeoutMs);
    // ALS store marks this async chain as "inside a job" — nested run()
    // calls and auto-patched toBuffer calls bypass the queue (no deadlock).
    Promise.resolve()
        .then(() => _als.run({ inJob: true }, job.fn))
        .then((v) => finish(null, v), (e) => finish(e));
}

// ── TTL cache + in-flight dedup ──────────────────────────────────────
// Two users firing the same .trends/.chart inside the TTL window -> one
// render. The entry is stored BEFORE completion, so concurrent identical
// calls share the in-flight promise instead of stacking renders.
const _cache = new Map(); // key -> { p, exp }
function getOrRender(key, fn, opts = {}) {
    const now = Date.now();
    const hit = _cache.get(key);
    if (hit) {
        if (hit.exp > now) {
            _counters.cacheHits++;
            return hit.p;
        }
        _cache.delete(key);
    }
    const ttl = opts.ttlMs || CACHE_TTL_MS;
    const p = run(opts.label || `cache:${String(key).slice(0, 28)}`, fn, opts)
        .then((v) => {
            const e = _cache.get(key);
            if (e && e.p === p) e.exp = Date.now() + ttl;
            return v;
        }, (e) => {
            const cur = _cache.get(key);
            if (cur && cur.p === p) _cache.delete(key);
            throw e;
        });
    _cache.set(key, { p, exp: now + ttl });
    if (_cache.size > CACHE_MAX) {
        const oldest = _cache.keys().next().value;
        if (oldest !== undefined) _cache.delete(oldest);
    }
    return p;
}

// stable cache key: sha1 of JSON — returns null when the payload can't be
// serialized (callers should then run uncached instead of failing)
function keyFor(...parts) {
    try {
        const s = JSON.stringify(parts);
        return crypto.createHash('sha1').update(s).digest('hex');
    } catch (e) {
        return null;
    }
}

// ── sync encode telemetry (patched Canvas.prototype.toBuffer sync path) ─
function noteSyncEncode(ms, bytes) {
    _counters.syncEncodes++;
    if (ms > 1000) {
        _counters.slowEncodes++;
        console.log(`[RenderQ] slow sync encode: ${ms}ms, ${Math.round((bytes || 0) / 1024)}KB out`);
    }
}

function stats() {
    return {
        enabled: !DISABLED,
        concurrency: CONCURRENCY,
        maxWait: MAXWAIT,
        softMB: SOFT_MB,
        hardMB: HARD_MB,
        active: _active,
        queued: _queue.length,
        memAvailMB: memAvailMB(1000),
        liveSurfaces: _live.count,
        estSurfaceMB: Math.round(_live.estBytes / 1048576),
        ..._counters,
    };
}

function _setMemProbe(fn) { _memProbe = typeof fn === 'function' ? fn : null; }

if (DISABLED) console.log('[RenderQ] RENDERQ_DISABLE=1 — queue gates are PASSTHROUGH (tracking only)');

module.exports = {
    run, getOrRender, keyFor,
    assertCanAllocate, trackSurface, canSpawnChild,
    noteSyncEncode, memAvailMB, stats,
    QueueFullError, MemoryGateError,
    _setMemProbe,
};
