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
// Exemptions (2026-09-28 owner directive): bot itself + bot owner ONLY.
// Group admins, General Mods and GC owners are SUBJECT to antinude
// ("the antinude should affect admins except the owner").
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
const _internal = { _classifyFrame, downloadImpl: null };

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
    _classifyFrame(f.buf).then((v) => ({ pos: f.pos, ok: true, v })).catch((e) => {
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
// EXEMPTIONS (2026-09-28 owner directive): ONLY the bot owner is exempt.
// Group admins, General Mods and GC owners are subject to antinude like
// everyone else ("the antinude should affect admins except the owner").
// senderIsAdmin/isGlobalMod/isGcOwner are still accepted in ctx for
// compatibility but no longer grant exemption. The bot itself is excluded
// earlier via m.key.fromMe.
// Returns true if a violation was handled (engine should not double-act).
function _isExempt(ctx) {
  if (!ctx) return false;
  // defensive: if isOwner ever arrives as a function, CALL it (a function
  // is truthy - truthiness-checking it would exempt everyone, the exact
  // bug class that broke the original exemption logic)
  if (typeof ctx.isOwner === "function") {
    try { return ctx.isOwner(ctx.senderJid) === true; } catch { return false; }
  }
  return ctx.isOwner === true;
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
      console.log(`[Antinude] skip ${media.type} from ${String(ctx.senderJid || "?").split("@")[0]}: sender exempt (owner)`);
      return false;
    }

    let buf;
    try { buf = await (_internal.downloadImpl || _downloadMediaBuffer)(media.node, media.type, media.dlType); }
    catch (e) { console.log(`[Antinude] ${media.type} download failed: ${String(e.message).slice(0, 50)}`); return false; }
    if (!buf || buf.length < 800) { console.log(`[Antinude] ${media.type} skipped: ${buf ? buf.length + "B too small" : "oversize/empty"}`); return false; }

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
      let warningCount = 0;
      try { warningCount = addWarning(sender, ctx.chatId, `Antinude violation (nsfw ${pct}%)`); } catch { /* no warning pool */ }
      const strike = "⚠️".repeat(Math.min(warningCount, 3));
      await sock.sendMessage(ctx.chatId, {
        text: `${strike} *ANTINUDE WARNING* ${strike}\n@${name}: prohibited ${what} removed (confidence ${pct}%).\nCount: ${warningCount}/3`,
        mentions: [sender],
      }).catch(() => {});
      if (warningCount >= 3) {
        setTimeout(() => sock.groupParticipantsUpdate(ctx.chatId, [sender], "remove").catch(() => {}), 2000);
      }
    } else {
      await sock.sendMessage(ctx.chatId, {
        text: deleted
          ? `🚨 *ANTINUDE* 🚨\n@${name}'s prohibited ${what} was removed (confidence ${pct}%).`
          : `⚠️ *ANTINUDE* ⚠️\n@${name} posted prohibited content (${what}, confidence ${pct}%) but I couldn't remove it - make me a *group admin* so I can delete messages.`,
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
  _internal, // { _classifyFrame (real service or stub), downloadImpl (on-box E2E hook) }
};
