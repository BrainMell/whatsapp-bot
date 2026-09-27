// ============================================
// IMAGE GATE (2026-09-27) - pixel-level renderability checks
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
// ============================================

let _sharp = null;
function sharpLazy() {
  if (!_sharp) _sharp = require("sharp");
  return _sharp;
}

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

// The gate. opts:
//   minW/minH    - minimum pixel dimensions (default 200; logos pass 64)
//   label        - for logs
// Returns { ok: true, width, height, format } or { ok: false, reason }.
async function inspectImageBuffer(buf, opts = {}) {
  const minW = opts.minW || 200;
  const minH = opts.minH || 200;
  const label = opts.label || "img";
  if (!buf || !Buffer.isBuffer(buf)) return { ok: false, reason: "no-buffer" };
  if (buf.length < 1200) return { ok: false, reason: "too-small(<1.2KB)" };

  // GIF/SVG can't be sent as WhatsApp images - reject by magic early
  const head = buf.slice(0, 12);
  if (head.slice(0, 3).toString() === "GIF") return { ok: false, reason: "gif-unsupported" };
  if (head.slice(0, 4).toString() === "<svg" || head.slice(0, 5).toString() === "<?xml") {
    return { ok: false, reason: "svg-unsupported" };
  }

  const sharp = sharpLazy();
  let meta, flat;
  try {
    meta = await sharp(buf, { failOn: "error" }).metadata();
    if (!meta.width || !meta.height) return { ok: false, reason: "no-dimensions" };
    if (meta.width < minW || meta.height < minH) {
      return { ok: false, reason: `tiny(${meta.width}x${meta.height})` };
    }
    // flatten onto white so transparent logos/alpha PNGs get real stats;
    // ensureAlpha to guarantee 4 channels for the raw pass below
    flat = await sharp(buf, { failOn: "error" })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    return { ok: false, reason: `undecodable(${String(e.message).slice(0, 40)})` };
  }

  if (!ALLOWED_FORMATS.has(meta.format)) {
    return { ok: false, reason: `format(${meta.format})` };
  }

  // full-image transparency check (before flatten): count fully-opaque ratio
  try {
    if (meta.hasAlpha) {
      const raw = await sharp(buf, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ch = raw.info.channels; // 4
      const px = raw.data.length / ch;
      let opaque = 0;
      const step = Math.max(1, Math.floor(px / 60000)); // sample <=60k px
      let sampled = 0;
      for (let i = 0; i < px; i += step) {
        sampled += 1;
        if (raw.data[i * ch + ch - 1] > 24) opaque += 1;
      }
      const opaqueRatio = opaque / Math.max(1, sampled);
      if (opaqueRatio < 0.05) return { ok: false, reason: "transparent(<5% visible)" };
    }
  } catch { /* alpha probe failed -> continue with flatten stats */ }

  // luminance statistics on the flattened RGB pixels
  const { data, info } = flat;
  const px = info.width * info.height;
  const ch = info.channels; // 3 after removeAlpha
  const step = Math.max(1, Math.floor(px / 80000)); // sample <=80k px
  let n = 0, sum = 0, sumSq = 0, dark = 0, white = 0;
  for (let i = 0; i < px; i += step) {
    const o = i * ch;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum; sumSq += lum * lum; n += 1;
    if (lum < 16) dark += 1;
    if (lum > 244) white += 1;
  }
  if (!n) return { ok: false, reason: "no-pixels" };
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const stdev = Math.sqrt(variance);
  // calibrated on real assets: pitch-black frames mean<10 (dark SCENES sit
  // at 20+); blank-white requires >246 AND near-flat (bright photos with
  // content carry stdev 25+); flat = compression-noise-only frames
  if (mean < 10) return { ok: false, reason: "black(mean=" + mean.toFixed(1) + ")" };
  if (mean > 246 && stdev < 8) return { ok: false, reason: "blank-white(mean=" + mean.toFixed(1) + ")" };
  if (stdev < 2.5) return { ok: false, reason: "flat(mean=" + mean.toFixed(1) + ",std=" + stdev.toFixed(2) + ")" };
  const darkRatio = dark / n, whiteRatio = white / n;
  if (darkRatio > 0.985 || whiteRatio > 0.985) return { ok: false, reason: "monoframe" };

  return { ok: true, width: meta.width, height: meta.height, format: meta.format };
}

module.exports = { inspectImageBuffer };
