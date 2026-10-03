// ============================================
// QUIZ AUDIO CACHE (2026-09-28, owner spec §3 - audio bottleneck fix)
// ============================================
// Audio clips are the most expensive quiz asset: every fresh retrieval runs
// the Go service chain (Deezer anchor -> JioSaavn -> WARP-YouTube -> ffmpeg),
// which costs tens of seconds per candidate and is the #1 reason large audio
// quizzes stalled. Until now clips lived ONLY in the session ("live bytes")
// - the moment a quiz ended, the bytes were gone and the NEXT quiz re-paid
// the full retrieval cost for the same song.
//
// This module persists verified clips on Box 1 disk, keyed by stable asset
// identity (theme:<show> / song:<song>:<artist>), with a TTL and a size cap.
// Second-and-later quizzes serve the same clip instantly, zero external
// calls. It also keeps a short-lived NEGATIVE cache (failure marks) so a
// candidate whose retrieval just failed isn't re-attempted by every
// following quiz in the same day - the retry budget goes to fresh
// candidates instead.
//
// Disk (not the 48MB RAM asset cache): audio clips are ~0.5-1MB each, the
// useful set for active groups is hundreds of clips, and they must survive
// process restarts. 256MB cap with LRU-by-mtime eviction.
// ============================================

const fs = require("fs");
const path = require("path");
const system = require("./system");

const CACHE_DIR = path.join(__dirname, "..", "data", "quiz_audio_cache");
const TTL_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days - songs/shows don't change
const MAX_BYTES = 256 * 1024 * 1024;       // 256MB disk budget
const FAIL_KEY = "quiz_audio_failmarks";   // system KV: { key: lastFailTs }
const FAIL_TTL_MS = 24 * 60 * 60 * 1000;   // retry failed candidates after a day

function _keyFile(key) {
  // key is already normalized ASCII-ish (norm() output) - harden anyway
  const safe = String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return path.join(CACHE_DIR, `${safe}.mp3`);
}

function _ensureDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* read-only fs? */ }
}

function get(key) {
  try {
    const f = _keyFile(key);
    const st = fs.statSync(f);
    if (!st.isFile() || st.size < 20 * 1024) return null;      // too small = truncated/corrupt
    if (Date.now() - st.mtimeMs > TTL_MS) { fs.unlink(f, () => {}); return null; }
    const buf = fs.readFileSync(f);
    // touch for LRU-by-mtime
    try { const now = new Date(); fs.utimesSync(f, now, now); } catch {}
    return buf;
  } catch { return null; }
}

function put(key, buf) {
  try {
    if (!key || !buf || buf.length < 20 * 1024) return false;
    _ensureDir();
    const f = _keyFile(key);
    fs.writeFileSync(f, buf);
    _evict();
    return true;
  } catch { return false; }
}

function _evict() {
  try {
    let files;
    try { files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".mp3")); } catch { return; }
    let total = 0;
    const stats = [];
    for (const f of files) {
      try {
        const st = fs.statSync(path.join(CACHE_DIR, f));
        total += st.size;
        stats.push({ f, size: st.size, mtime: st.mtimeMs });
      } catch {}
    }
    if (total <= MAX_BYTES) return;
    stats.sort((a, b) => a.mtime - b.mtime); // oldest first
    for (const s of stats) {
      if (total <= MAX_BYTES) break;
      try { fs.unlinkSync(path.join(CACHE_DIR, s.f)); total -= s.size; } catch {}
    }
  } catch {}
}

// ── negative cache (failure marks) ──

function _loadFails() {
  const v = system.get(FAIL_KEY, null);
  return v && typeof v === "object" ? v : {};
}

function markFail(key) {
  try {
    if (!key) return;
    const fails = _loadFails();
    fails[key] = Date.now();
    // cap the map
    const keys = Object.keys(fails);
    if (keys.length > 500) {
      keys.sort((a, b) => fails[a] - fails[b]);
      for (const k of keys.slice(0, keys.length - 500)) delete fails[k];
    }
    system.set(FAIL_KEY, fails);
  } catch { /* never fatal */ }
}

function clearFail(key) {
  try {
    if (!key) return;
    const fails = _loadFails();
    if (fails[key]) { delete fails[key]; system.set(FAIL_KEY, fails); }
  } catch {}
}

function isFreshFail(key) {
  try {
    const ts = _loadFails()[key];
    return !!(ts && Date.now() - ts < FAIL_TTL_MS);
  } catch { return false; }
}

function stats() {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".mp3"));
    let bytes = 0;
    for (const f of files) { try { bytes += fs.statSync(path.join(CACHE_DIR, f)).size; } catch {} }
    return { files: files.length, bytes, dir: CACHE_DIR };
  } catch { return { files: 0, bytes: 0, dir: CACHE_DIR }; }
}

module.exports = { get, put, markFail, clearFail, isFreshFail, stats, _internal: { CACHE_DIR, TTL_MS, MAX_BYTES } };
