// ============================================
// ANTINUDE (2026-09-27) - NSFW / sexual-content image+sticker moderation
// ============================================
// Owner brief §7 - a SEPARATE group-moderation feature (like .s antilink),
// NOT part of the quiz system.
//
// ARCHITECTURE (sized for a 1GB Box 1):
//   - classification runs on BOX 2's vision-worker via the Go facade
//     (NSFW_SERVICE_URL, default http://10.0.1.56:7860/vision/nsfw) so the
//     bot's own RAM/CPU is untouched. Model: Falconsai nsfw_image_detection
//     (ViT-224, int8 ONNX) - benchmarked: safe anime/memes/swimwear/classical
//     art all <= 0.03 nsfw; ~600ms per image on Box 2; zero Box 1 model RAM.
//   - fully ASYNC: the moderation queue runs concurrently-capped in the
//     background; normal commands are never blocked.
//   - verdict cache by media sha256 (media re-sent/forwarded is NOT re-analyzed)
//   - size/time limits: skip > 8MB, 15s service timeout, fail-open on errors
//   - exemptions: bot itself, group admins, General Mods, bot owner, GC owner
//
// KNOWN LIMITS (documented honestly):
//   - the model detects SEXUAL content (nudity/porn). Graphic gore is NOT
//     covered by this binary classifier - a VLM-based gore pass can plug into
//     the same queue later (visionVerify.js interface exists).
//   - true-positive validation against explicit material was not performed
//     here for content-policy reasons; false-positive matrix WAS validated
//     (13 real images). The 0.70 delete threshold is deliberately high.
// ============================================

const crypto = require("crypto");
const botConfig = require("../../botConfig");

const SERVICE_URL = process.env.NSFW_SERVICE_URL || "http://10.0.1.56:7860/vision/nsfw";
const SERVICE_TIMEOUT_MS = Math.min(30000, parseInt(process.env.NSFW_TIMEOUT_MS, 10) || 15000);
const MAX_BYTES = 8 * 1024 * 1024;
const CONCURRENCY = Math.max(1, parseInt(process.env.NSFW_CONCURRENCY, 10) || 2);
const CACHE_MAX = 2000;

// verdict cache: sha256 -> { nsfw, at }
const _cache = new Map();
let _inFlight = 0;
const _queue = [];
let _stats = { checked: 0, flagged: 0, errors: 0, cacheHits: 0 };

function _cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > 6 * 3600 * 1000) { _cache.delete(key); return null; }
  return hit.nsfw;
}
function _cachePut(key, nsfw) {
  _cache.set(key, { nsfw, at: Date.now() });
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
    if (node.stickerMessage) return { node: node.stickerMessage, type: "sticker" };
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
  // quoted media is NOT scanned - only what a user directly posts
  return null;
}

async function _downloadMediaBuffer(node, type) {
  const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
  const stream = await downloadContentFromMessage(node, type);
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_BYTES) return null; // oversize -> skip
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function _classify(buf) {
  const key = crypto.createHash("sha256").update(buf).digest("hex");
  const cached = _cacheGet(key);
  if (cached !== null) { _stats.cacheHits++; return { nsfw: cached, cached: true }; }
  // bounded concurrency: excess requests wait in the queue (never dropped)
  while (_inFlight >= CONCURRENCY) {
    await new Promise((r) => setTimeout(r, 120));
  }
  _inFlight++;
  try {
    const axios = require("axios");
    const r = await axios.post(SERVICE_URL, { image_b64: buf.toString("base64") }, { timeout: SERVICE_TIMEOUT_MS });
    const nsfw = Number(r.data?.nsfw);
    if (!Number.isFinite(nsfw)) throw new Error("bad service response");
    _cachePut(key, nsfw);
    _stats.checked++;
    return { nsfw, cached: false };
  } finally {
    _inFlight--;
  }
}

// main entry. ctx: { senderIsAdmin, isOwner, isGlobalMod, isGcOwner, senderJid, chatId }
// Returns true if a violation was handled (engine should not double-act).
async function handleAntinude(sock, m, settings, addWarning, getWarningCount, ctx) {
  try {
    if (!settings || !settings.antinude) return false;
    if (!ctx || !ctx.chatId || !ctx.chatId.endsWith("@g.us")) return false;
    if (m.key?.fromMe) return false;
    if (ctx.senderIsAdmin || ctx.isOwner || ctx.isGlobalMod || ctx.isGcOwner) return false;

    const media = extractImageMedia(m);
    if (!media) return false;

    let buf;
    try { buf = await _downloadMediaBuffer(media.node, media.type === "sticker" ? "sticker" : "image"); }
    catch { return false; }
    if (!buf || buf.length < 800) return false;

    let nsfw;
    try { ({ nsfw } = await _classify(buf)); }
    catch (e) { _stats.errors++; console.log("[Antinude] classify failed (fail-open):", String(e.message).slice(0, 60)); return false; }

    const threshold = Number.isFinite(settings.antinudeThreshold) ? settings.antinudeThreshold : 0.7;
    if (nsfw < threshold) return false;

    // ── VIOLATION ──
    _stats.flagged++;
    const sender = m.key.participant || ctx.senderJid;
    const action = settings.antinudeAction || "delete";
    try { await sock.sendMessage(ctx.chatId, { delete: m.key }); } catch { /* not admin */ }

    const name = String(sender || "").split("@")[0];
    const pct = Math.round(nsfw * 100);
    if (action === "kick") {
      await sock.sendMessage(ctx.chatId, {
        text: `🚨 *ANTINUDE* 🚨\n@${name} posted prohibited content (confidence ${pct}%). Removed.`,
        mentions: [sender],
      }).catch(() => {});
      setTimeout(() => sock.groupParticipantsUpdate(ctx.chatId, [sender], "remove").catch(() => {}), 1000);
    } else if (action === "warn") {
      let warningCount = 0;
      try { warningCount = addWarning(sender, ctx.chatId, `Antinude violation (nsfw ${pct}%)`); } catch { /* no warning pool */ }
      const strike = "⚠️".repeat(Math.min(warningCount, 3));
      await sock.sendMessage(ctx.chatId, {
        text: `${strike} *ANTINUDE WARNING* ${strike}\n@${name}: prohibited content removed (confidence ${pct}%).\nCount: ${warningCount}/3`,
        mentions: [sender],
      }).catch(() => {});
      if (warningCount >= 3) {
        setTimeout(() => sock.groupParticipantsUpdate(ctx.chatId, [sender], "remove").catch(() => {}), 2000);
      }
    } else {
      await sock.sendMessage(ctx.chatId, {
        text: `🚨 *ANTINUDE* 🚨\n@${name}'s prohibited content was removed (confidence ${pct}%).`,
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
  stats,
  _internal: {
    _classify: (buf) => _classify(buf), // test hook (real service or stub)
  },
};
