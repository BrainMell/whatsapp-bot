// ============================================
// QUIZ IMAGE PIPELINE (2026-10-01) - owner bug report §5/§7
// Retrieve -> Validate -> Detect transparency -> Normalize background ->
// Normalize dimensions -> Validate final -> Cache -> Serve
// ============================================
// Every quiz image (logo or character) passes through normalize() before it
// is attached to a question. Guarantees for the quiz UI:
//   - transparent/empty backgrounds are flattened onto SOLID WHITE
//   - every output is CANVAS x CANVAS (default 800x800) uniform dimensions
//   - content is contain-fit + centered: NEVER stretched, never distorted
//   - extreme aspect (>3:1 wordmarks/banners) center-cropped to 3:1 first
//   - output JPEG q85 (universally sendable, WhatsApp re-encodes anyway)
//
// PROCESSING PATH: sharp inside the crash-isolated worker (sharpChild) -
// NEVER in-process on the box (rule 13: GLib SIGSEGV kills the bot). If the
// worker is unavailable (tests, native load failure) we fall back to jimp
// (pure JS, already a dependency) for a best-effort normalize.
//
// CACHING: processed bytes are cached by quizPortraitCache keyed on the
// source URL sha1 + "norm" - repeated questions skip reprocessing entirely.
// ============================================

const crypto = require("crypto");
const imageGate = require("./imageGate");
const sharpChild = require("./sharpChild");

const CANVAS = parseInt(process.env.QUIZ_IMG_CANVAS, 10) || 800;
const PROCESSED_MIN_BYTES = 1200;

function _key(url) {
  return `norm-${crypto.createHash("sha1").update(String(url || "")).digest("hex").slice(0, 24)}`;
}

// ── jimp fallback (pure JS, no native crash risk) - jimp 1.x API ──
async function _jimpNormalize(buf) {
  const { Jimp } = require("jimp");
  const img = await Jimp.read(buf);
  let w = img.bitmap.width, h = img.bitmap.height;
  if (!w || !h) throw new Error("no-dimensions");
  const ASPECT_LIMIT = 3;
  if (w / h > ASPECT_LIMIT || h / w > ASPECT_LIMIT) {
    let cw = w, ch = h, cx = 0, cy = 0;
    if (w / h > ASPECT_LIMIT) { cw = Math.round(h * ASPECT_LIMIT); cx = Math.round((w - cw) / 2); }
    else { ch = Math.round(w * ASPECT_LIMIT); cy = Math.round((h - ch) / 2); }
    img.crop({ x: cx, y: cy, w: Math.min(cw, w), h: Math.min(ch, h) });
    w = Math.min(cw, w); h = Math.min(ch, h);
  }
  // composite over white FIRST (transparency flatten)
  const white = new Jimp({ width: w, height: h, color: 0xffffffff });
  white.composite(img, 0, 0);
  const scale = Math.min(CANVAS / w, CANVAS / h, 1);
  const rw = Math.max(1, Math.round(w * scale));
  const rh = Math.max(1, Math.round(h * scale));
  white.resize({ w: rw, h: rh });
  const out = new Jimp({ width: CANVAS, height: CANVAS, color: 0xffffffff });
  out.composite(white, Math.floor((CANVAS - rw) / 2), Math.floor((CANVAS - rh) / 2));
  const jbuf = await out.getBuffer("image/jpeg", { quality: 85 });
  return { buf: jbuf, mime: "image/jpeg", width: CANVAS, height: CANVAS, flattened: true, via: "jimp" };
}

// ── main entry ──
// buf: raw downloaded bytes (any of jpeg/png/webp/gif-rejected upstream)
// Returns { ok, buf, mime, width, height, flattened, cached, gate } or { ok:false, reason }
async function normalize(buf, { url = "", minW = 100, minH = 80, label = "norm" } = {}) {
  if (!buf || buf.length < PROCESSED_MIN_BYTES) return { ok: false, reason: "too-small" };
  const ck = _key(url || crypto.createHash("sha1").update(buf).digest("hex"));
  // 1) pixel gate on the RAW bytes (rejects gif/svg/tiny/blank/monoframe early)
  const gate = await imageGate.inspectImageBuffer(buf, { minW, minH, label: label.slice(0, 60) }).catch(() => ({ ok: false, reason: "gate-crash" }));
  if (!gate.ok) return { ok: false, reason: `gate:${gate.reason}` };
  // 2) processed cache
  const cached = portraitCacheGet(ck);
  if (cached) return { ok: true, ...cached, cached: true };
  // 3) normalize in the crash-isolated worker (jimp fallback)
  let out = null;
  try {
    const r = await sharpChild.runJob("normalize", buf, { canvas: CANVAS }, 15000);
    if (r && r.buf && r.buf.length >= PROCESSED_MIN_BYTES) out = { ...r, via: "sharp" };
  } catch { /* worker unavailable/crashed - jimp below */ }
  if (!out) {
    try { out = await _jimpNormalize(buf); } catch (e) { return { ok: false, reason: `normalize-fail:${String(e.message || e).slice(0, 40)}` }; }
  }
  // 4) validate the FINAL image (defense in depth: normalize can only
  //    shrink/pad, but a source that becomes uniform-white after flatten
  //    must never serve as a clue)
  const fgate = await imageGate.inspectImageBuffer(out.buf, { minW: 200, minH: 200, label: `${label}:out`.slice(0, 60) }).catch(() => ({ ok: false, reason: "fgate-crash" }));
  if (!fgate.ok) return { ok: false, reason: `final-gate:${fgate.reason}` };
  const rec = { buf: out.buf, mime: out.mime, width: out.width, height: out.height, flattened: true, via: out.via };
  portraitCachePut(ck, rec);
  return { ok: true, ...rec, cached: false };
}

// ── portrait cache wiring (lazy require to avoid cycles in tests) ──
let _pc = null;
function _pcMod() { try { _pc = _pc || require("./quizPortraitCache"); return _pc; } catch { return null; } }
function portraitCacheGet(key) {
  const pc = _pcMod();
  try { const p = pc && pc.getPortrait && pc.getPortrait(key); return p && p.buf ? { buf: p.buf, mime: p.mime, width: p.w, height: p.h } : null; } catch { return null; }
}
function portraitCachePut(key, rec) {
  const pc = _pcMod();
  try { pc && pc.putPortrait && pc.putPortrait(key, rec.buf, { mime: rec.mime, w: rec.width, h: rec.height }); } catch { /* non-fatal */ }
}

module.exports = { normalize, CANVAS };
