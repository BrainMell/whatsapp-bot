// ============================================
// QUIZ BANK (2026-09-26 audit - Priority 13/14/15)
// ============================================
// Persistent, validated question bank + duplicate prevention.
//
// STABLE IDENTITY (P15): every question gets a factKey derived from
//   mediaKey + domain(factType) + subject(page or character) + property(correct fact)
// NOT from the question text. "Who is this character?" and "Can you identify
// this character?" over the same image produce the SAME factKey, so reworded
// duplicates can never both be stored. Extends to media questions: image
// identity = the verified source URL of the asset; audio identity = song id
// + clip window.
//
// FLOW (P13/P14): a question is banked ONLY after it has passed the full
// validation pipeline (schema + media-relevance + fact-check + asset
// verification where applicable). bankLookup serves validated questions
// back BEFORE new generation spends LLM calls (P21 - reuse beats regen).
//
// Storage: system KV (MongoDB) "quiz_bank:<mediaKey>" - same clobber-safety
// pattern as quiz_seen / quiz_scores (per-franchise keys, not one big map).
// Media assets are NOT stored as bytes - we store the verified source URL +
// bytes hash and re-download lazily at post time through the media cache.
// ============================================

const crypto = require("crypto");
const system = require("../utils/system");

const _KEY = (mediaKey) => `quiz_bank:${mediaKey}`;
const BANK_CAP_PER_MEDIA = 60; // keep the newest 60 validated questions per franchise

function _sha(s) {
  return crypto.createHash("sha1").update(String(s).toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

// ── identity ──
// parts: [mediaKey, domain, subject, property] - any part may be "" but the
// more specific the identity, the better the dedup. For image/audio
// questions pass the asset identity as part of `property` (or set
// assetKey separately; it is folded into the identity).
function factKey({ mediaKey, domain, subject, property, assetKey }) {
  return _sha([mediaKey, domain, subject || "", property || "", assetKey || ""].join("|"));
}

// ── CRUD ──
function loadBank(mediaKey) {
  const v = system.get(_KEY(mediaKey), null);
  return Array.isArray(v) ? v : [];
}

function saveBank(mediaKey, entries) {
  system.set(_KEY(mediaKey), entries.slice(-BANK_CAP_PER_MEDIA));
}

// Store a validated question. Refuses duplicates (same factKey already in
// the bank, or same stem hash - belt and suspenders against rewording that
// also changed subject formatting). Returns true when stored.
function bankPut(mediaKey, question) {
  if (!mediaKey || !question || !question.q) return false;
  const identity = question.factKey || factKey({
    mediaKey,
    domain: question.domain || "",
    subject: (question.loreRef && question.loreRef.page) || "",
    property: (question.options && question.options[question.correct]) || "",
    assetKey: question.assetKey || "",
  });
  const bank = loadBank(mediaKey);
  if (bank.some((e) => e.identity === identity)) return false;
  const stemHash = _sha(question.q);
  if (bank.some((e) => e.stemHash === stemHash)) return false;
  bank.push({
    identity,
    stemHash,
    q: question.q,
    options: question.options,
    correct: question.correct,
    difficulty: question.difficulty,
    domain: question.domain || null,
    topic: question.topic || null,
    type: question.type || "text", // text | image | audio | theme
    // media reference (P13/P14): verified source, never raw bytes
    asset: question.asset || null, // {kind:"image"|"audio", url, bytesHash, mime, subject}
    loreRef: question.loreRef || null,
    ts: Date.now(),
    uses: 0,
  });
  saveBank(mediaKey, bank);
  return true;
}

// Serve validated bank questions that are NOT in the seen list.
// order: shuffle for variety. Marks entries used (best-effort counter).
function bankLookup(mediaKey, seenHashes, count, filter = {}) {
  if (!count || count <= 0) return [];
  const seen = new Set(seenHashes || []);
  let bank = loadBank(mediaKey);
  if (filter.difficulty) bank = bank.filter((e) => e.difficulty === filter.difficulty);
  if (filter.domain) bank = bank.filter((e) => e.domain === filter.domain);
  if (filter.type) bank = bank.filter((e) => (filter.type === "media" ? e.type !== "text" : e.type === filter.type));
  const fresh = bank.filter((e) => !seen.has(e.stemHash));
  // prefer least-used for variety across sessions
  fresh.sort((a, b) => (a.uses || 0) - (b.uses || 0) || Math.random() - 0.5);
  const picked = fresh.slice(0, count).map((e) => ({
    q: e.q,
    options: e.options,
    correct: e.correct,
    difficulty: e.difficulty,
    topic: e.topic || "Lore",
    domain: e.domain,
    type: e.type,
    asset: e.asset,
    loreRef: e.loreRef,
    factKey: e.identity,
    fromBank: true,
  }));
  // bump use counters (in-bank only)
  if (picked.length) {
    const usedIds = new Set(picked.map((p) => p.factKey));
    for (const e of bank) if (usedIds.has(e.identity)) e.uses = (e.uses || 0) + 1;
    saveBank(mediaKey, bank);
  }
  return picked;
}

// Media asset cache shared with the live quiz: verified download keyed by
// URL, so a banked image/audio question re-fetches once per process.
const _assetCache = new Map(); // url -> { ts, buf, mime, kind }

async function getCachedAsset(url, downloader) {
  const hit = _assetCache.get(url);
  if (hit && Date.now() - hit.ts < 30 * 60 * 1000) return hit;
  const dl = await downloader(url);
  if (!dl) return null;
  const entry = { ts: Date.now(), ...dl };
  _assetCache.set(url, entry);
  if (_assetCache.size > 200) _assetCache.delete(_assetCache.keys().next().value);
  return entry;
}

// P26: seed the cache with bytes we already downloaded and verified during
// generation, so the post-time send reuses them instead of re-fetching the
// same URL (2 CDN fetches per fresh image question -> 1).
function putCachedAsset(url, dl) {
  if (!url || !dl || !dl.buf) return false;
  _assetCache.set(url, { ts: Date.now(), ...dl });
  if (_assetCache.size > 200) _assetCache.delete(_assetCache.keys().next().value);
  return true;
}

module.exports = {
  factKey,
  bankPut,
  bankLookup,
  loadBank,
  getCachedAsset,
  putCachedAsset,
  _internal: { _KEY, _assetCache, _sha, BANK_CAP_PER_MEDIA },
};
