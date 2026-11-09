'use strict';
// ══════════════════════════════════════════════════════════════════════
// ⚡ BOOT SNAPSHOT (2026-11-09) — instant boot from disk dumps
//
// MEASURED PROBLEM (owner report "even regular text messages seem slow"):
// Atlas M0 (free tier) throttles bulk reads to ~70-100 KB/s. From box1:
//   · users collection find({})  = 3,938 docs / ~11 MB  → 125 s measured
//   · systems find({})           = 90 keys / ~3.1 MB    → ~38 s in boot logs
//   · LID mappings find({})      = 9,968 rows           → ~7 s in boot logs
// initSocket() awaited ALL of them SERIALLY BEFORE the WhatsApp socket
// connected — 3.2 minutes of dead air on EVERY restart (logs 2026-11-09
// 07:20-07:24: two pings answered 80 s and 110 s late while the loaders
// were still running, then the backlog replayed).
//
// FIX: periodically dump the in-memory caches to gzip JSON on disk; at
// boot restore them in ~1-2 s and let the normal correctness machinery
// handle staleness:
//   · economy stale-guard: every user cache entry carries a sync stamp
//     (updatedAt) — on save, the live DB doc's updatedAt is compared and a
//     three-way merge protects sibling writes. A snapshot-restored cache
//     is EXACTLY the "stale cache" case that guard was built for, so
//     restoring a ≤N-minute-old dump is semantically safe by design.
//     (loadEconomy revives the top-level updatedAt Date so stampSyncMeta
//     keeps working.)
//   · LID resolver already re-syncs the full mapping list from Mongo every
//     5 minutes in the background — snapshot staleness self-heals.
//   · system KV consumers read through system.get()/getFresh() — getFresh
//     always hits Mongo.
//
// Age guard: if a snapshot is older than MAX_AGE_MS the loader falls back
// to the (slow, fresh) Mongo pull. Kill switch: BOOT_SNAPSHOT=0 disables
// BOTH restore and dump (pure legacy behavior).
// ══════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_AGE_MS = parseInt(process.env.BOOT_SNAPSHOT_MAX_AGE_MS || '1800000', 10); // 30 min
const enabled = () => String(process.env.BOOT_SNAPSHOT || '1') !== '0';

// ── replacer/reviver: keep Dates (the stale-guard compares updatedAt as a
// real Date), Maps (some cache entries hold Maps) and Buffers intact.
// ⚠️ JSON.stringify quirk: Date.prototype.toJSON() runs BEFORE the replacer,
// so the replacer never sees a Date instance in `v` — the original value must
// be read from `this[k]` (standard JSON.stringify escape hatch).
function _replacer(k, v) {
  const raw = this ? this[k] : v;
  if (raw instanceof Date) return { __date: raw.toISOString() };
  if (raw instanceof Map) return { __map: Array.from(raw.entries()) };
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return { __buf: raw.toString('base64') };
  return v;
}
function _reviver(k, v) {
  if (v && typeof v === 'object') {
    if (typeof v.__date === 'string') return new Date(v.__date);
    if (Array.isArray(v.__map)) return new Map(v.__map);
    if (typeof v.__buf === 'string') return Buffer.from(v.__buf, 'base64');
  }
  return v;
}

function _dir(instanceDir) {
  const d = path.join(instanceDir, 'cache', 'boot');
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* may be read-only; save fails below */ }
  return d;
}

/**
 * Dump data → instances/<bot>/cache/boot/<name>.json.gz (atomic rename).
 * gzip runs on the libuv threadpool — never blocks the event loop.
 * @returns {Promise<{ms:number,bytes:number}|{err:string}>}
 */
async function saveSnapshot(instanceDir, name, data) {
  if (!enabled()) return { err: 'disabled' };
  try {
    const t0 = Date.now();
    const json = JSON.stringify(data, _replacer);
    const gz = await new Promise((res, rej) =>
      zlib.gzip(Buffer.from(json, 'utf8'), { level: 3 }, (e, b) => (e ? rej(e) : res(b))));
    const p = path.join(_dir(instanceDir), name + '.json.gz');
    const tmp = p + '.tmp' + process.pid;
    fs.writeFileSync(tmp, gz);
    fs.renameSync(tmp, p); // atomic swap — a concurrent restore never sees a partial file
    return { ms: Date.now() - t0, bytes: gz.length };
  } catch (e) {
    return { err: e.message };
  }
}

/**
 * Restore a snapshot. Returns {ok:true, data, ageMin} or {ok:false, reason}.
 * parse with the reviver so Dates/Maps/Buffers come back as real objects.
 */
function loadSnapshot(instanceDir, name) {
  if (!enabled()) return { ok: false, reason: 'disabled' };
  try {
    const p = path.join(_dir(instanceDir), name + '.json.gz');
    const st = fs.statSync(p);
    const ageMs = Date.now() - st.mtimeMs;
    if (ageMs > MAX_AGE_MS) {
      return { ok: false, reason: 'stale', ageMin: Math.round(ageMs / 60000) };
    }
    const gz = fs.readFileSync(p);
    const data = JSON.parse(zlib.gunzipSync(gz).toString('utf8'), _reviver);
    return { ok: true, data, ageMin: Math.round(ageMs / 60000), bytes: gz.length };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { saveSnapshot, loadSnapshot, MAX_AGE_MS, enabled };
