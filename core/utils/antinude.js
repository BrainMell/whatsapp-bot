// ============================================
// ANTINUDE v2 (2026-09-27) - NSFW image/sticker/video moderation
// ============================================
// Owner brief §7 - a SEPARATE group-moderation feature (like .s antilink),
// NOT part of the quiz system.
//
// v2 CHANGES (after production failure report: "spammed with porn, nothing
// happened" + "check 5 frames across the video from start to finish"):
//   1. ROOT CAUSE FOUND: the Falconsai ViT int8 classifier is functionally
//      blind - real public-nudity PHOTOS scored 0.000-0.003 (validated on 8
//      Wikimedia nudity photos + classical art). Every "safe <= 0.03"
//      calibration number was meaningless because EVERYTHING scored <= 0.03.
//   2. The Box 2 vision-worker /nsfw now runs NudeNet 320n (YOLOv8 part
//      detector, 12MB) as PRIMARY - exposed genitals/breast/buttocks boxes
//      are the violation signal (calibrated: real nudity 0.44-0.9, safe
//      matrix empty, ~40ms/img) - and keeps Falconsai as SECONDARY signal.
//      Combined score = max(partScore, falconsai).
//   3. VIDEO + ANIMATED STICKER scanning (was completely missing - typical
//      WA porn spam is videos): 5 frames sampled start->finish (10/30/50/70/
//      90% via ffmpeg on Box 1; 5 webp pages for animated stickers), every
//      frame classified, MAX frame score decides.
//   4. Every scan now LOGS a one-line verdict - silent failures were
//      impossible to diagnose before. Download/extract skips are logged too.
//
// Architecture unchanged: classification on Box 2 via the Go facade
// (NSFW_SERVICE_URL, default http://10.0.1.56:7860/vision/nsfw); fully
// async bounded-concurrency queue; sha256 verdict cache; fail-open.
// Exemptions (2026-09-28 owner directive, refined same day): bot itself,
// bot owner, General Mods, GC owner. GROUP ADMINS are SUBJECT to antinude
// ("the antinude should affect admins except the owner" -> "I meant ONLY
// ADMINS minus mods and GC owner, I specifically said admins").
// ============================================

const crypto = require("crypto");
const botConfig = require("../../botConfig");

const SERVICE_URL = process.env.NSFW_SERVICE_URL || "http://10.0.1.56:7860/vision/nsfw";
const SERVICE_TIMEOUT_MS = Math.min(30000, parseInt(process.env.NSFW_TIMEOUT_MS, 10) || 15000);
const MAX_BYTES_IMAGE = 8 * 1024 * 1024;
const MAX_BYTES_VIDEO = 16 * 1024 * 1024;
const CONCURRENCY = Math.max(1, parseInt(process.env.NSFW_CONCURRENCY, 10) || 2);
const CACHE_MAX = 2000;
const FRAMES_PER_MEDIA = 5;

// verdict cache: sha256 -> { nsfw, parts, at }
const _cache = new Map();
let _inFlight = 0;
let _stats = { checked: 0, flagged: 0, errors: 0, cacheHits: 0, videos: 0, astickers: 0 };
// test hooks (see module.exports._internal)
const _internal = { _classifyFrame, downloadImpl: null, classifyImpl: null };

// ── NOT-NUDE SAFELIST (2026-09-28 owner request) ───────────────────
// Mods can whitelist a specific image ("mark an image as not nude") so the
// classifier's false positives never fire on it again. Keyed by sha256 of
// the media bytes -> judgment is content-based, survives re-uploads, and
// applies GLOBALLY (nudity is not group-relative). Persisted through the
// engine's system-KV (injected at boot via initSafelistStore) so restarts
// keep the whitelist.
const SAFELIST_MAX = 5000;
const _safelist = new Map(); // hash -> { by, chat, at, note }
let _safelistSave = null;
let _safelistLoaded = false;
// per-chat ring of the last flagged hashes - "antinude ok" with no reply
// resolves the most recent flagged image in that chat (the original message
// is usually already deleted by the time a mod reacts, so reply-to-media
// alone is not enough).
const FLAG_RING_MAX = 10;
const _flagRing = new Map(); // chatId -> [{ hash, at, sender, kind }]

function _sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function initSafelistStore({ load, save }) {
  if (_safelistLoaded) return;
  _safelistLoaded = true;
  _safelistSave = typeof save === "function" ? save : null;
  try {
    const data = typeof load === "function" ? load() : null;
    if (data && typeof data === "object") {
      for (const [h, meta] of Object.entries(data)) _safelist.set(h, meta);
    }
    console.log(`[Antinude] safelist loaded: ${_safelist.size} entr${_safelist.size === 1 ? "y" : "ies"}`);
  } catch (e) {
    console.log(`[Antinude] safelist load failed (starting empty): ${String(e.message).slice(0, 60)}`);
  }
}

function _safelistPersist() {
  try { if (_safelistSave) _safelistSave(Object.fromEntries(_safelist)); } catch (e) { console.log(`[Antinude] safelist save failed: ${String(e.message).slice(0, 60)}`); }
}

function safelistAdd(hash, meta = {}) {
  if (typeof hash !== "string" || hash.length < 16) return false;
  _safelist.set(hash, { by: meta.by || "", chat: meta.chat || "", at: meta.at || new Date().toISOString(), kind: meta.kind || "" });
  while (_safelist.size > SAFELIST_MAX) _safelist.delete(_safelist.keys().next().value);
  _safelistPersist();
  return true;
}

function safelistHas(hash) { return _safelist.has(hash); }
function safelistRemove(hash) { const had = _safelist.delete(hash); if (had) _safelistPersist(); return had; }
function safelistClear() { _safelist.clear(); _safelistPersist(); }
function safelistInfo() {
  const recent = [..._safelist.entries()].slice(-5).map(([h, m2]) => ({ hash: h.slice(0, 12), by: m2.by, at: m2.at }));
  return { size: _safelist.size, recent };
}

// resolve what "antinude ok" should mark: an explicit hash (full or >=6-char
// prefix) searched in the safelist first then this chat's flag ring, else the
// most recent flagged hash in the chat. Returns { hash, source } or null.
function resolveFlaggedHash(chatId, hashArg) {
  const raw = String(hashArg || "").trim();
  const arg = raw.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (arg.length >= 6) {
    if (_safelist.has(arg)) return { hash: arg, source: "argument" };
    const inSafelist = [..._safelist.keys()].find((h) => h.startsWith(arg));
    if (inSafelist) return { hash: inSafelist, source: "argument" };
    const ring = _flagRing.get(chatId) || [];
    const inRing = ring.find((r) => r.hash === arg || r.hash.startsWith(arg));
    if (inRing) return { hash: inRing.hash, source: "flag-history" };
    return null; // explicit arg that matches nothing -> null (never silently fall back)
  }
  // no arg -> most recent flag in this chat. A non-empty arg that lost all
  // its hex chars (e.g. "zzzzzz") must NOT fall through to this.
  if (raw) return null;
  const ring = _flagRing.get(chatId) || [];
  if (ring.length) return { hash: ring[ring.length - 1].hash, source: ring.length > 1 ? `last-flagged (of ${ring.length})` : "last-flagged" };
  return null;
}

function _recordFlag(chatId, hash, sender, kind) {
  if (!chatId || !hash) return;
  const ring = _flagRing.get(chatId) || [];
  ring.push({ hash, at: Date.now(), sender: sender || "", kind: kind || "" });
  while (ring.length > FLAG_RING_MAX) ring.shift();
  _flagRing.set(chatId, ring);
}

// split a user's shared warning entries into { kept, removed } - antinude
// resets clear ONLY "Antinude violation" entries (manual warns / antilink
// strikes / the 5-strike manual counter stay untouched). Single source of
// truth for the engine's `antinude reset` command + unit tests.
function filterAntinudeWarnings(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  const kept = arr.filter((w) => !/^Antinude violation/i.test(String(w?.reason || "")));
  return { kept, removed: arr.length - kept.length };
}

function _cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > 6 * 3600 * 1000) { _cache.delete(key); return null; }
  return hit;
}
function _cachePut(key, val) {
  _cache.set(key, { ...val, at: Date.now() });
  if (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
}

// extract the underlying media node from a message (incl. view-once wrappers)
function extractImageMedia(m) {
  if (!m || !m.message) return null;
  const unwrap = (node) => {
    if (!node) return null;
    if (node.imageMessage && node.imageMessage.mimetype && /image\//.test(node.imageMessage.mimetype)) {
      return { node: node.imageMessage, type: "image" };
    }
    if (node.stickerMessage) {
      return { node: node.stickerMessage, type: node.stickerMessage.isAnimated ? "asticker" : "sticker" };
    }
    if (node.videoMessage && node.videoMessage.mimetype) {
      const vm = node.videoMessage;
      // GIFs and animated webps arrive as videoMessage on many clients -
      // they were silently IGNORED before (not video/, not image/), which
      // is exactly the hole porn-spam GIFs slipped through.
      if (/^image\/(gif|webp)$/i.test(vm.mimetype)) {
        // node is a videoMessage -> Baileys downloads it with type "video"
        return { node: vm, type: "asticker", dlType: "video" };
      }
      if (/video\//.test(vm.mimetype)) return { node: vm, type: "video" };
    }
    return null;
  };
  let hit = unwrap(m.message);
  if (hit) return hit;
  for (const wrapper of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"]) {
    const inner = m.message[wrapper];
    if (!inner) continue;
    hit = unwrap(inner.message || {});
    if (hit) return hit;
  }
  // quoted media is NOT scanned by the auto path - only what a user directly posts
  return null;
}

async function _downloadMediaBuffer(node, type, dlType) {
  const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
  // dlType = the BAILEYS store type of the node ("video" for a videoMessage
  // even when we decode it as an animated sticker); type = how we analyze it.
  const store = dlType || type;
  const stream = await downloadContentFromMessage(node, store === "video" ? "video" : store === "asticker" ? "sticker" : store);
  const cap = type === "video" ? MAX_BYTES_VIDEO : MAX_BYTES_IMAGE;
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > cap) return null; // oversize -> skip (logged by caller)
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ── frame extraction ────────────────────────────────────────────────
// Videos: 5 frames at 10/30/50/70/90% of duration via ffmpeg (Box 1).
// Animated stickers: 5 evenly-spaced webp pages via sharp.
async function _videoFrameBuffers(buf) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { execFile } = require("child_process");
  const tmp = path.join(os.tmpdir(), `antinude_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  fs.writeFileSync(tmp, buf);
  try {
    const run = (cmd, args, timeout) => new Promise((resolve) => {
      // encoding "buffer" is CRITICAL for ffmpeg PNG frames - the default utf8
      // encoding corrupts binary output (this exact bug made every video 400)
      execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024, encoding: "buffer" }, (err, stdout) => resolve(err ? null : stdout));
    });
    // duration via ffprobe
    let dur = 0;
    try {
      const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", tmp], 8000);
      dur = parseFloat(JSON.parse(String(probe || "{}") || "{}")?.format?.duration) || 0;
    } catch { /* fall through to fixed positions */ }
    const positions = dur > 1
      ? [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => Math.min(dur - 0.05, Math.max(0, dur * p)))
      : [0.2, 0.8, 1.5, 2.5, 3.5];
    // parallel extraction - small videos, quick seeks, ~2 cores can take 5 at once
    const outs = await Promise.all(positions.map((pos) =>
      run("ffmpeg", ["-ss", String(pos), "-i", tmp, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], 10000)
    ));
    const frames = [];
    positions.forEach((pos, i) => {
      const out = outs[i];
      if (out && out.length > 500) frames.push({ pos: Number(pos.toFixed(2)), buf: out });
    });
    if (frames.length) return frames;
    // ffmpeg produced nothing (webp/gif input hits "unsupported chunk ANIM"
    // and writes zero packets) - fall back to the sharp page decoder, which
    // reads animated webp/gif natively.
    if (/^RIFF/.test(buf.toString("latin1", 0, 4).toString()) || /^GIF8/.test(buf.toString("latin1", 0, 4).toString())) {
      return _astickerFrameBuffers(buf);
    }
    return frames;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
  }
}

async function _astickerFrameBuffers(buf) {
  // v2.1 (2026-09-28): sharp runs in the crash-isolated worker now. An
  // animated sticker that used to SIGSEGV the whole bot mid-scan (native
  // libvips crash) now costs at most one failed job - fail-open, logged.
  try {
    return await require("./sharpChild").runJob("asticker-frames", buf);
  } catch (e) {
    console.log(`[Antinude] asticker decode failed (isolated): ${String(e.message).slice(0, 70)}`);
    return [];
  }
}

// ── classification (worker call, cached) ────────────────────────────
async function _classifyFrame(buf) {
  const key = crypto.createHash("sha256").update(buf).digest("hex");
  const cached = _cacheGet(key);
  if (cached) { _stats.cacheHits++; return { ...cached, cached: true }; }
  while (_inFlight >= CONCURRENCY) {
    await new Promise((r) => setTimeout(r, 120));
  }
  _inFlight++;
  try {
    const axios = require("axios");
    const r = await axios.post(SERVICE_URL, { image_b64: buf.toString("base64") }, { timeout: SERVICE_TIMEOUT_MS });
    const nsfw = Number(r.data?.nsfw);
    if (!Number.isFinite(nsfw)) throw new Error("bad service response");
    const val = { nsfw, parts: Array.isArray(r.data?.parts) ? r.data.parts : [], falconsai: Number(r.data?.falconsai ?? nsfw) };
    _cachePut(key, val);
    _stats.checked++;
    return val;
  } finally {
    _inFlight--;
  }
}

// ── main analyzer (shared by auto-moderation and .s nsfwcheck) ──────
// kind: "image" | "sticker" | "asticker" | "video"
// Returns { kind, nsfw, parts, frames, ms, cached } or null on skip/error.
async function analyzeMediaBuffer(kind, buf, label = "") {
  const t0 = Date.now();
  let frameList;
  if (kind === "video") {
    _stats.videos++;
    frameList = await _videoFrameBuffers(buf);
    if (!frameList.length) { console.log(`[Antinude] ${label}video: no frames extracted (${buf.length}B) - skipping (fail-open)`); return null; }
  } else if (kind === "asticker") {
    _stats.astickers++;
    frameList = await _astickerFrameBuffers(buf);
    if (!frameList.length) { console.log(`[Antinude] ${label}animated sticker: no pages decoded (${buf.length}B) - skipping`); return null; }
  } else {
    frameList = [{ pos: 0, buf }];
  }

  let nsfw = 0, parts = [], anyError = false;
  // classify frames through the bounded-concurrency queue in parallel
  const results = await Promise.all(frameList.map((f) =>
    (_internal.classifyImpl || _classifyFrame)(f.buf).then((v) => ({ pos: f.pos, ok: true, v })).catch((e) => {
      anyError = true;
      console.log(`[Antinude] ${label}frame ${f.pos} classify failed: ${String(e.message).slice(0, 60)}`);
      return { pos: f.pos, ok: false };
    })
  ));
  const frameScores = [];
  for (const rres of results) {
    if (!rres.ok) continue;
    frameScores.push({ pos: rres.pos, nsfw: rres.v.nsfw, cached: !!rres.v.cached });
    if (rres.v.nsfw > nsfw) { nsfw = rres.v.nsfw; parts = rres.v.parts || []; }
    else if (rres.v.nsfw === nsfw && (rres.v.parts || []).length) parts = rres.v.parts;
  }
  if (anyError && nsfw === 0) { _stats.errors++; return null; } // fail-open only when nothing scored
  return { kind, nsfw, parts, frames: frameScores, ms: Date.now() - t0, cached: frameScores.some((f) => f.cached) };
}

// main entry. ctx: { senderIsAdmin, isOwner, isGlobalMod, isGcOwner, senderJid, chatId }
// EXEMPTIONS (2026-09-28 owner directive, refined after correction):
//   exempt:  bot owner, General Mods (isGlobalMod), GC owner (isGcOwner)
//   ENFORCED: GROUP ADMINS - senderIsAdmin deliberately NOT checked here
//   ("the antinude should affect admins except the owner" / "I meant ONLY
//   ADMINS minus mods and GC owner, I specifically said admins").
// isGlobalMod/isGcOwner may be passed as FUNCTIONS (engine injects them) - a
// function is truthy, so checking them as booleans exempted EVERY sender
// ("sender exempt (admin/mod/owner)" on every scan - the whole "antinude
// isnt checking/warning anyone" report). Resolve each check properly here.
// Returns true if a violation was handled (engine should not double-act).
function _isExempt(ctx) {
  if (!ctx) return false;
  if (typeof ctx.isOwner === "function") {
    try { if (ctx.isOwner(ctx.senderJid) === true) return true; } catch { /* treat as non-exempt */ }
  } else if (ctx.isOwner === true) return true;
  if (typeof ctx.isGlobalMod === "function") {
    try { if (ctx.isGlobalMod(ctx.senderJid)) return true; } catch { /* treat as non-exempt */ }
  } else if (ctx.isGlobalMod === true) return true;
  if (typeof ctx.isGcOwner === "function") {
    try { if (ctx.isGcOwner(ctx.senderJid, ctx.chatId)) return true; } catch { /* treat as non-exempt */ }
  } else if (ctx.isGcOwner === true) return true;
  // NOTE: senderIsAdmin is intentionally ignored - group admins are enforced
  return false;
}

async function handleAntinude(sock, m, settings, addWarning, getWarningCount, ctx) {
  try {
    if (!settings || !settings.antinude) return false;
    if (!ctx || !ctx.chatId || !ctx.chatId.endsWith("@g.us")) return false;
    if (m.key?.fromMe) return false;

    const media = extractImageMedia(m);
    if (!media) return false;

    // exemptions AFTER media detection so every skip is visible in logs
    // (the "isnt deleting" report was undiagnosable while skips were silent)
    if (_isExempt(ctx)) {
      console.log(`[Antinude] skip ${media.type} from ${String(ctx.senderJid || "?").split("@")[0]}: sender exempt (mod/owner)`);
      return false;
    }

    let buf;
    try { buf = await (_internal.downloadImpl || _downloadMediaBuffer)(media.node, media.type, media.dlType); }
    catch (e) { console.log(`[Antinude] ${media.type} download failed: ${String(e.message).slice(0, 50)}`); return false; }
    if (!buf || buf.length < 800) { console.log(`[Antinude] ${media.type} skipped: ${buf ? buf.length + "B too small" : "oversize/empty"}`); return false; }

    // 💡 NOT-NUDE SAFELIST (owner request): a mod-marked image is allowed
    // BEFORE any classification - no vision call, no false positive, ever.
    const mediaHash = _sha256(buf);
    if (_safelist.has(mediaHash)) {
      console.log(`[Antinude] skip ${media.type} ${mediaHash.slice(0, 12)}: safelisted (marked not-nude)`);
      return false;
    }

    const result = await analyzeMediaBuffer(media.type, buf, `${media.type} ${buf.length}B `);
    if (!result) return false;

    const threshold = Number.isFinite(settings.antinudeThreshold) ? settings.antinudeThreshold : 0.45;
    const partsStr = (result.parts || []).map((p) => `${p.label}:${p.score}`).join(", ") || "none";
    console.log(`[Antinude] scanned ${media.type} (${buf.length}B) chat=${ctx.chatId.slice(0, 20)} nsfw=${result.nsfw.toFixed(3)} thr=${threshold} parts=[${partsStr}] frames=${result.frames.map((f) => f.nsfw.toFixed(2)).join("/")} ${result.ms}ms${result.cached ? " cached" : ""}`);

    if (result.nsfw < threshold) return false;

    // ── VIOLATION ──
    _stats.flagged++;
    const sender = m.key.participant || ctx.senderJid;
    const action = settings.antinudeAction || "delete";
    // record in the per-chat flag ring + a false-positive hint goes into
    // every notice - once the message is deleted the media is unrecoverable
    // from chat, so the hash is the only handle a mod has left.
    _recordFlag(ctx.chatId, mediaHash, sender, media.type);
    const fpHint = `\n_False positive? Mods: \`${botConfig.getPrefix()} antinude ok ${mediaHash.slice(0, 12)}\`_`;
    let deleted = true;
    try { await sock.sendMessage(ctx.chatId, { delete: m.key }); }
    catch (e) {
      // bot lacks admin rights - DO NOT fail silently (that was the whole
      // "antinude isnt deleting" confusion). Log + tell the group what to do.
      deleted = false;
      console.log(`[Antinude] DELETE FAILED in ${ctx.chatId.slice(0, 20)}: ${String(e.message).slice(0, 60)} - bot needs to be a group admin`);
    }

    const name = String(sender || "").split("@")[0];
    const pct = Math.round(result.nsfw * 100);
    const what = media.type === "video" ? "video" : media.type === "asticker" ? "animated sticker" : media.type;
    if (action === "kick") {
      await sock.sendMessage(ctx.chatId, {
        text: `🚨 *ANTINUDE* 🚨\n@${name} posted prohibited content (${what}, confidence ${pct}%). Removed.`,
        mentions: [sender],
      }).catch(() => {});
      setTimeout(() => sock.groupParticipantsUpdate(ctx.chatId, [sender], "remove").catch(() => {}), 1000);
    } else if (action === "warn") {
      // 💡 OWNER DIRECTIVE (2026-09-28): removal limit configurable, default
      // 10 (was hardcoded 3). Set per-group via `<prefix> antinude limit <n>`.
      const warnLimit = Number.isFinite(settings.antinudeWarnLimit) && settings.antinudeWarnLimit >= 1 ? Math.floor(settings.antinudeWarnLimit) : 10;
      let warningCount = 0;
      try { warningCount = addWarning(sender, ctx.chatId, `Antinude violation (nsfw ${pct}%)`); } catch { /* no warning pool */ }
      const strike = "⚠️".repeat(Math.min(warningCount, warnLimit));
      await sock.sendMessage(ctx.chatId, {
        text: `${strike} *ANTINUDE WARNING* ${strike}\n@${name}: prohibited ${what} removed (confidence ${pct}%).\nCount: ${warningCount}/${warnLimit}${warningCount >= warnLimit ? " - REMOVED from the group" : ""}${fpHint}`,
        mentions: [sender],
      }).catch(() => {});
      if (warningCount >= warnLimit) {
        setTimeout(() => sock.groupParticipantsUpdate(ctx.chatId, [sender], "remove").catch(() => {}), 2000);
      }
    } else {
      await sock.sendMessage(ctx.chatId, {
        text: deleted
          ? `🚨 *ANTINUDE* 🚨\n@${name}'s prohibited ${what} was removed (confidence ${pct}%).${fpHint}`
          : `⚠️ *ANTINUDE* ⚠️\n@${name} posted prohibited content (${what}, confidence ${pct}%) but I couldn't remove it - make me a *group admin* so I can delete messages.${fpHint}`,
        mentions: [sender],
      }).catch(() => {});
    }
    return true;
  } catch (e) {
    console.log("[Antinude] handler error (fail-open):", e?.message?.slice(0, 60));
    return false;
  }
}

function stats() { return { ..._stats, cacheSize: _cache.size, inFlight: _inFlight }; }

module.exports = {
  handleAntinude,
  extractImageMedia,
  analyzeMediaBuffer,
  downloadMedia: _downloadMediaBuffer,
  stats,
  // not-nude safelist (owner request 2026-09-28)
  initSafelistStore,
  safelistAdd,
  safelistHas,
  safelistRemove,
  safelistClear,
  safelistInfo,
  resolveFlaggedHash,
  filterAntinudeWarnings,
  mediaHash: _sha256,
  _internal, // { _classifyFrame (real service or stub), downloadImpl (on-box E2E hook), classifyImpl (unit-QA hook) }
};
