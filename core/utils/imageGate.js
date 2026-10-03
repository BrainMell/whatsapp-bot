// ============================================
// IMAGE GATE (2026-09-27, v2 2026-09-28) - pixel-level renderability checks
// ============================================
// Owner brief section 4: "sometimes the returned image is completely black,
// blank, corrupted, or otherwise unusable. Detect these cases before sending
// the image." Magic bytes alone (P13) catch truncated downloads but NOT:
//   - 1x1 / tiny placeholder images
//   - all-black / all-white frames
//   - fully transparent PNGs
//   - images WhatsApp cannot render (svg -> sent as image, gif)
//
// Every quiz image goes through inspectImageBuffer() before it is accepted
// into a question. Zero ML - pure sharp pixel statistics, <15ms per image.
//
// v2 (2026-09-28): ALL sharp work moved into the crash-isolated worker
// (sharpChild.js / sharpChildWorker.js). Root cause: libvips/librsvg can
// SIGSEGV the whole Node process on hostile/corrupt inputs (BOM- or
// comment-prefixed SVGs that bypass naive magic-byte checks included) -
// this killed the bot mid-quiz-prep on 2026-09-27 (pm2 SIGSEGV logs).
// Now the worst case is a rejected image, never a dead bot. The SVG sniff
// also got robust (BOM/comments/DOCTYPE) and the worker additionally
// rejects any decoded format outside jpeg/png/webp (svgz included).
// ============================================

const sharpChild = require("./sharpChild");

const GATE_TIMEOUT_MS = 9000;

// The gate. opts:
//   minW/minH    - minimum pixel dimensions (default 200; logos pass 64)
//   label        - for logs
// Returns { ok: true, width, height, format } or { ok: false, reason }.
async function inspectImageBuffer(buf, opts = {}) {
  const minW = opts.minW || 200;
  const minH = opts.minH || 200;
  if (!buf || !Buffer.isBuffer(buf)) return { ok: false, reason: "no-buffer" };
  if (buf.length < 1200) return { ok: false, reason: "too-small(<1.2KB)" };

  // cheap local rejects (no sharp): GIF magic + robust SVG sniff
  const head = buf.slice(0, 12);
  if (head.slice(0, 3).toString() === "GIF") return { ok: false, reason: "gif-unsupported" };
  const sniff = buf.slice(0, 1024).toString("latin1").replace(/^\uFEFF/, "").trimStart();
  if (/<svg[\s>]/i.test(sniff) || /<!DOCTYPE\s+svg/i.test(sniff)) {
    return { ok: false, reason: "svg-unsupported" };
  }

  try {
    // verdict computed inside the isolated worker (native-crash proof)
    return await sharpChild.runJob("gate", buf, { minW, minH }, GATE_TIMEOUT_MS);
  } catch (e) {
    // worker crash/timeout/circuit on THIS input -> reject the image,
    // never crash the bot. The worker itself poisons the sha so repeat
    // submissions fail fast without respawning into the same crash.
    return { ok: false, reason: `undecodable(${String(e.message).slice(0, 40)})` };
  }
}

module.exports = { inspectImageBuffer };
