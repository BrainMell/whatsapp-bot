// ============================================
// SHARP CHILD WORKER (2026-09-28) - crash isolation for native sharp/libvips
// ============================================
// WHY THIS EXISTS: sharp (libvips/librsvg) can SIGSEGV the whole Node process
// on certain inputs - malformed webp/png, SVGs that slip past magic-byte
// checks (BOM/comment-prefixed), exotic formats. On the box this killed the
// bot mid-quiz-prep (pm2 log: SIGSEGV at 19:19/19:33/19:37 on 2026-09-27,
// each right after a media job) - "quiz says starting then nothing".
//
// All untrusted-image sharp work now runs HERE instead of in the bot
// process. Worst case: THIS child dies, the parent's job fails gracefully
// (quiz skips the image, antinude fails open), and the parent respawns a
// fresh worker. Never a dead bot.
//
// Protocol (serialization:'advanced', Buffers survive IPC):
//   parent -> { id, op, buf, opts?, timeoutMs? }
//   child  -> { id, ok:true, result, ms } | { id, ok:false, error, ms }
//
// Ops:
//   gate             - imageGate pixel checks (format/dims/alpha/luminance)
//   asticker-frames  - animated sticker -> up to 5 PNG page buffers
// ============================================
'use strict';

let sharp = null;
try {
  sharp = require('sharp');
  try { sharp.concurrency(1); } catch { /* older sharp */ }
} catch (e) {
  try { process.send({ id: -1, ok: false, error: 'sharp-load-failed:' + String(e.message).slice(0, 80) }); } catch { /* dying anyway */ }
  process.exit(4);
}

const LIMITS = { limitInputPixels: 268402687 }; // 16384x16384 - well beyond any WA media
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// Robust SVG sniff - the OLD check (`head === '<svg'`) let BOM-prefixed and
// comment-prefixed SVGs through into librsvg (GLib GObject crash vector).
function looksLikeSvg(buf) {
  const head = buf.subarray(0, 1024).toString('latin1').replace(/^\uFEFF/, '').trimStart();
  if (/<svg[\s>]/i.test(head)) return true;
  if (/<!DOCTYPE\s+svg/i.test(head)) return true;
  return false;
}

async function opGate(buf, opts = {}) {
  const minW = opts.minW || 200;
  const minH = opts.minH || 200;
  if (!Buffer.isBuffer(buf)) return { ok: false, reason: 'no-buffer' };
  if (buf.length < 1200) return { ok: false, reason: 'too-small(<1.2KB)' };
  const head = buf.subarray(0, 12);
  if (head.subarray(0, 3).toString() === 'GIF') return { ok: false, reason: 'gif-unsupported' };
  if (looksLikeSvg(buf)) return { ok: false, reason: 'svg-unsupported' };

  let meta, flat;
  try {
    meta = await sharp(buf, { failOn: 'error', ...LIMITS }).metadata();
    if (!meta.width || !meta.height) return { ok: false, reason: 'no-dimensions' };
    if (meta.width < minW || meta.height < minH) {
      return { ok: false, reason: `tiny(${meta.width}x${meta.height})` };
    }
    flat = await sharp(buf, { failOn: 'error', ...LIMITS })
      .flatten({ background: '#ffffff' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    return { ok: false, reason: `undecodable(${String(e.message).slice(0, 40)})` };
  }

  // svgz / mis-typed formats that decode but must never go to WhatsApp
  if (meta.format === 'svg' || !ALLOWED_FORMATS.has(meta.format)) {
    return { ok: false, reason: `format(${meta.format})` };
  }

  // full-image transparency check
  try {
    if (meta.hasAlpha) {
      const raw = await sharp(buf, { failOn: 'error', ...LIMITS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const ch = raw.info.channels;
      const px = raw.data.length / ch;
      let opaque = 0;
      const step = Math.max(1, Math.floor(px / 60000));
      let sampled = 0;
      for (let i = 0; i < px; i += step) {
        sampled += 1;
        if (raw.data[i * ch + ch - 1] > 24) opaque += 1;
      }
      if (opaque / Math.max(1, sampled) < 0.05) return { ok: false, reason: 'transparent(<5% visible)' };
    }
  } catch { /* alpha probe failed -> continue with flatten stats */ }

  // luminance statistics on flattened RGB pixels
  const { data, info } = flat;
  const px = info.width * info.height;
  const ch = info.channels;
  const step = Math.max(1, Math.floor(px / 80000));
  let n = 0, sum = 0, sumSq = 0, dark = 0, white = 0;
  for (let i = 0; i < px; i += step) {
    const o = i * ch;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum; sumSq += lum * lum; n += 1;
    if (lum < 16) dark += 1;
    if (lum > 244) white += 1;
  }
  if (!n) return { ok: false, reason: 'no-pixels' };
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const stdev = Math.sqrt(variance);
  if (mean < 10) return { ok: false, reason: 'black(mean=' + mean.toFixed(1) + ')' };
  if (mean > 246 && stdev < 8) return { ok: false, reason: 'blank-white(mean=' + mean.toFixed(1) + ')' };
  if (stdev < 2.5) return { ok: false, reason: 'flat(mean=' + mean.toFixed(1) + ',std=' + stdev.toFixed(2) + ')' };
  if (dark / n > 0.985 || white / n > 0.985) return { ok: false, reason: 'monoframe' };

  return { ok: true, width: meta.width, height: meta.height, format: meta.format };
}

// shrink - downscale for vision-verify uploads (a 960px image burns ~13k
// vision tokens on the provider; 384px is plenty for "does this depict X"
// and keeps the provider's per-minute token budget intact).
async function opShrink(buf, opts = {}) {
  const max = Math.max(96, Math.min(1024, opts.max || 384));
  const out = await sharp(Buffer.from(buf), { ...LIMITS })
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { buf: out, mime: 'image/jpeg' };
}

async function opAstickerFrames(buf) {
  let pages = 1;
  try { pages = Math.max(1, (await sharp(buf, { pages: -1, ...LIMITS }).metadata()).pages || 1); } catch { /* single */ }
  const FRAMES = 5;
  const positions = pages <= FRAMES
    ? Array.from({ length: pages }, (_, i) => i)
    : [0, 0.25, 0.5, 0.75, 0.9].map((p) => Math.min(pages - 1, Math.floor(pages * p)));
  const frames = [];
  for (const page of positions) {
    try {
      const png = await sharp(Buffer.from(buf), { page, pages: 1, ...LIMITS }).png().toBuffer();
      if (png.length > 500) frames.push({ pos: page, buf: png });
    } catch { /* skip page */ }
  }
  return frames;
}

process.on('message', async (msg) => {
  if (!msg || typeof msg.id !== 'number' || typeof msg.op !== 'string') return;
  const t0 = Date.now();
  // per-op watchdog: a wedged op kills THIS child so the parent respawns a
  // clean one - the parent's own timeout is the outer safety net.
  const watchdog = setTimeout(() => process.exit(9), (msg.timeoutMs || 20000) + 5000);
  try {
    let result;
    if (msg.op === 'gate') result = await opGate(msg.buf, msg.opts || {});
    else if (msg.op === 'shrink') result = await opShrink(msg.buf, msg.opts || {});
    else if (msg.op === 'asticker-frames') result = await opAstickerFrames(msg.buf);
    else throw new Error('unknown-op:' + msg.op);
    clearTimeout(watchdog);
    try { process.send({ id: msg.id, ok: true, result, ms: Date.now() - t0 }); } catch { /* parent gone */ }
  } catch (e) {
    clearTimeout(watchdog);
    try { process.send({ id: msg.id, ok: false, error: String((e && e.message) || e).slice(0, 120), ms: Date.now() - t0 }); } catch { /* parent gone */ }
  }
});

// stay alive; the parent kills us on timeout/shutdown
setInterval(() => {}, 1 << 30);
