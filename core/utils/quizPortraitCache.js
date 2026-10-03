// ============================================
// QUIZ PORTRAIT CACHE (2026-09-30) - disk cache for character portraits
// ============================================
// WHY: the image-question rebuild (2026-09-30) makes AniList's character-
// native portraits the PRIMARY source (empirical bake-off on Box 1:
// AniList 60/60 ok @ 18ms/img vs Fandom 0/60 - downloads blocked). Identity
// is guaranteed by the database (the portrait belongs to the character
// entity), so what remains is QUALITY (pixel gate) and SPEED. Caching the
// verified bytes on disk gives:
//   - repeat quizzes serve portraits with ZERO network calls
//   - AniList API budget is spent once per cast per day, not per candidate
//     per quiz (the old per-candidate re-query pattern got Box 1 429'd)
//
// Layout (under data/quiz_cache/):
//   portraits/<key>.img          raw image bytes (jpeg/png/webp)
//   portraits/<key>.json         { mime, url, name, w, h, ts, ok }
//   portraits/<key>.neg          negative mark (download/gate failed) - 24h
//   casts/al-<mediaId>.json      AniList cast roster (TTL 24h)
//   casts/al-<mediaId>.neg       negative mark for cast fetch - 6h
//
// Keying portraits by AniList CHARACTER id (not URL) is deliberate: the id
// is the stable entity identity; URLs can rotate.
// ============================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(process.cwd(), "data", "quiz_cache");
const PORTRAITS = path.join(ROOT, "portraits");
const CASTS = path.join(ROOT, "casts");

const PORTRAIT_TTL_MS = 30 * 24 * 3600 * 1000; // character art is stable
const NEG_TTL_MS = 24 * 3600 * 1000;           // retry failed downloads daily
const CAST_TTL_MS = 24 * 3600 * 1000;          // roster refresh daily
const CAST_NEG_TTL_MS = 6 * 3600 * 1000;
const MAX_DIR_BYTES = 200 * 1024 * 1024;       // 200MB cap
const PRUNE_EVERY_MS = 10 * 60 * 1000;

let _lastPrune = 0;

function _ensureDirs() {
  try { fs.mkdirSync(PORTRAITS, { recursive: true }); } catch { }
  try { fs.mkdirSync(CASTS, { recursive: true }); } catch { }
}

function _safeUnlink(p) { try { fs.unlinkSync(p); } catch { } }

// ── portrait bytes ──────────────────────────────────────────────────────
function getPortrait(key) {
  if (!key) return null;
  const base = path.join(PORTRAITS, _slug(key));
  try {
    const meta = JSON.parse(fs.readFileSync(`${base}.json`, "utf8"));
    if (Date.now() - (meta.ts || 0) > PORTRAIT_TTL_MS) { _safeUnlink(`${base}.img`); _safeUnlink(`${base}.json`); return null; }
    const buf = fs.readFileSync(`${base}.img`);
    if (!buf || buf.length < 1024) { _safeUnlink(`${base}.img`); _safeUnlink(`${base}.json`); return null; }
    return { buf, mime: meta.mime || "image/jpeg", url: meta.url, name: meta.name, w: meta.w, h: meta.h };
  } catch { return null; }
}

function putPortrait(key, buf, meta = {}) {
  if (!key || !buf || !Buffer.isBuffer(buf) || buf.length < 1024) return false;
  _ensureDirs();
  const base = path.join(PORTRAITS, _slug(key));
  try {
    const tmpImg = `${base}.img.${process.pid}.${crypto.randomBytes(2).toString("hex")}`;
    fs.writeFileSync(tmpImg, buf);
    fs.renameSync(tmpImg, `${base}.img`);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ mime: meta.mime || "image/jpeg", url: meta.url || "", name: meta.name || "", w: meta.w || 0, h: meta.h || 0, ts: Date.now() }));
    _safeUnlink(`${base}.neg`);
    _schedulePrune();
    return true;
  } catch { return false; }
}

function hasNegative(key) {
  if (!key) return false;
  try {
    const ts = parseInt(fs.readFileSync(path.join(PORTRAITS, `${_slug(key)}.neg`), "utf8"), 10);
    if (Number.isFinite(ts) && Date.now() - ts < NEG_TTL_MS) return true;
    _safeUnlink(path.join(PORTRAITS, `${_slug(key)}.neg`));
  } catch { }
  return false;
}

function putNegative(key) {
  if (!key) return;
  _ensureDirs();
  try { fs.writeFileSync(path.join(PORTRAITS, `${_slug(key)}.neg`), String(Date.now())); } catch { }
}

// ── cast rosters ────────────────────────────────────────────────────────
function getCast(mediaId) {
  if (!mediaId) return null;
  const p = path.join(CASTS, `al-${mediaId}.json`);
  try {
    const meta = JSON.parse(fs.readFileSync(p, "utf8"));
    if (Date.now() - (meta.ts || 0) > CAST_TTL_MS) { _safeUnlink(p); return null; }
    if (!Array.isArray(meta.cast) || !meta.cast.length) { _safeUnlink(p); return null; }
    return meta.cast;
  } catch { return null; }
}

function putCast(mediaId, cast) {
  if (!mediaId || !Array.isArray(cast) || !cast.length) return false;
  _ensureDirs();
  const p = path.join(CASTS, `al-${mediaId}.json`);
  try {
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ts: Date.now(), cast }));
    fs.renameSync(tmp, p);
    _safeUnlink(path.join(CASTS, `al-${mediaId}.neg`));
    return true;
  } catch { return false; }
}

function hasCastNegative(mediaId) {
  if (!mediaId) return false;
  const p = path.join(CASTS, `al-${mediaId}.neg`);
  try {
    const ts = parseInt(fs.readFileSync(p, "utf8"), 10);
    if (Number.isFinite(ts) && Date.now() - ts < CAST_NEG_TTL_MS) return true;
    _safeUnlink(p);
  } catch { }
  return false;
}

function putCastNegative(mediaId) {
  if (!mediaId) return;
  _ensureDirs();
  try { fs.writeFileSync(path.join(CASTS, `al-${mediaId}.neg`), String(Date.now())); } catch { }
}

// ── maintenance ─────────────────────────────────────────────────────────
function _slug(key) { return String(key).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80); }

function _schedulePrune() {
  const now = Date.now();
  if (now - _lastPrune < PRUNE_EVERY_MS) return;
  _lastPrune = now;
  setImmediate(() => {
    try {
      const files = fs.readdirSync(PORTRAITS).filter((f) => f.endsWith(".img")).map((f) => {
        const p = path.join(PORTRAITS, f);
        let sz = 0, mt = 0;
        try { const st = fs.statSync(p); sz = st.size; mt = st.mtimeMs; } catch { }
        return { p, sz, mt };
      });
      let total = files.reduce((a, f) => a + f.sz, 0);
      if (total <= MAX_DIR_BYTES) return;
      files.sort((a, b) => a.mt - b.mt); // oldest first
      for (const f of files) {
        if (total <= MAX_DIR_BYTES * 0.85) break;
        _safeUnlink(f.p); _safeUnlink(f.p.replace(/\.img$/, ".json"));
        total -= f.sz;
      }
    } catch { }
  });
}

function stats() {
  try {
    const files = fs.readdirSync(PORTRAITS).filter((f) => f.endsWith(".img"));
    let bytes = 0;
    for (const f of files) { try { bytes += fs.statSync(path.join(PORTRAITS, f)).size; } catch { } }
    return { portraits: files.length, bytes };
  } catch { return { portraits: 0, bytes: 0 }; }
}

_ensureDirs();

module.exports = { getPortrait, putPortrait, hasNegative, putNegative, getCast, putCast, hasCastNegative, putCastNegative, stats };
