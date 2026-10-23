'use strict';
// ===========================================================================
// ANIMATED MEDIA UTIL - make shoob .webm event cards visible in WhatsApp
// Owner bug ".j eshop some cards aren't showing, 9 and 4"
// Root cause: the only two T6 cards in the deck (E-03004 Sylphiette,
// E-03000 Kurisu) point at cdn.shoob.gg *.webm files. WhatsApp cannot
// render WebM at all - raw webm bytes sent as {video} surface as an
// invisible/broken bubble, so those cards "don't show".
// Fix = the same pipeline mentoringCommands shipped for the
// IDENTICAL E-03004 white-screen report: local ffmpeg → H.264 mp4
// (yuv420p, +faststart, -an) sent as {video, gifPlayback:true} which
// WhatsApp plays like a GIF. Extracted here so every card path (eshop
// flex, coll view, spawns) can share it without a circular dependency
// (mentoringCommands requires cardSystem, so cardSystem can't require it).
// Disk cache is keyed by sha1 of the SOURCE bytes - same file never
// converts twice, works with or without a card id, and is safe across
// multiple bot processes on one box (unique tmp name + atomic rename).
// ===========================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const CACHE_DIR = process.env.ANIMATED_MEDIA_CACHE_DIR || '/tmp/card-media';
const FFMPEG_TIMEOUT_MS = 90000;   // matches mentoring's proven budget
const POSTER_TIMEOUT_MS = 25000;   // single frame - much cheaper than a remux
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024; // WhatsApp media ceiling guard

const stats = { conversions: 0, cacheHits: 0, posterHits: 0, failures: 0 };

function isWebm(buf) {
  return !!buf && buf.length >= 4 &&
    buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3; // EBML
}
function isMp4(buf) {
  return !!buf && buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp';
}

function cachedPath(name) {
  const p = path.join(CACHE_DIR, name);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  } catch {}
  return null;
}

function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, { timeout: timeoutMs }, (err, _stdout, stderr) => {
      if (err) {
        const tail = String(stderr || '').split('\n').filter(Boolean).slice(-2).join(' | ');
        return reject(new Error(`ffmpeg: ${err.message}${tail ? ' - ' + tail : ''}`));
      }
      resolve();
    });
  });
}

/**
 * Convert WebM bytes → WhatsApp-playable MP4 (H.264 yuv420p +faststart, -an).
 * Returns a Buffer, or null when the input isn't WebM / ffmpeg failed.
 * Cached by sha1(source bytes) in CACHE_DIR.
 */
async function webmToMp4(buf) {
  if (!isWebm(buf)) return null;
  const sha = crypto.createHash('sha1').update(buf).digest('hex');
  const hit = cachedPath(`${sha}.mp4`);
  if (hit) {
    stats.cacheHits++;
    try { return fs.readFileSync(hit); } catch { stats.cacheHits--; }
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
 // unique tmp names + atomic rename: two bot processes converting the same
 // card at once must never hand WhatsApp a half-written file
  const rnd = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const srcPath = path.join(CACHE_DIR, `${sha}.src-${rnd}`);
  const tmpPath = path.join(CACHE_DIR, `${sha}.mp4-${rnd}.tmp`);
  const outPath = path.join(CACHE_DIR, `${sha}.mp4`);
  fs.writeFileSync(srcPath, buf);
  try {
 // -an: shoob cards carry no audio; libx264+yuv420p+faststart plays everywhere
 // (same argument set as mentoringCommands.ffmpegToMp4 - proven in production)
    await runFfmpeg(['-y', '-i', srcPath, '-f', 'mp4', '-c:v', 'libx264', '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', tmpPath], FFMPEG_TIMEOUT_MS);
    if (!fs.statSync(tmpPath).size) throw new Error('ffmpeg produced an empty file');
    fs.renameSync(tmpPath, outPath);
    const mp4 = fs.readFileSync(outPath);
    if (mp4.length > MAX_OUTPUT_BYTES) {
      try { fs.unlinkSync(outPath); } catch {}
      throw new Error(`converted mp4 too large for WA (${mp4.length}B)`);
    }
    stats.conversions++;
    return mp4;
  } catch (e) {
    stats.failures++;
    console.error('[animatedMedia] webm→mp4 failed:', e.message);
    return null;
  } finally {
    try { fs.unlinkSync(srcPath); } catch {}
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Extract the first frame of WebM bytes as a PNG poster (static fallback so
 * the card at least SHOWS when a remux isn't possible). Cached like webmToMp4.
 * Returns a Buffer, or null.
 */
async function webmPoster(buf) {
  if (!isWebm(buf)) return null;
  const sha = crypto.createHash('sha1').update(buf).digest('hex');
  const hit = cachedPath(`${sha}.poster.png`);
  if (hit) {
    stats.posterHits++;
    try { return fs.readFileSync(hit); } catch { stats.posterHits--; }
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const rnd = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const srcPath = path.join(CACHE_DIR, `${sha}.poster-src-${rnd}`);
  const tmpPath = path.join(CACHE_DIR, `${sha}.poster-${rnd}.tmp`);
  const outPath = path.join(CACHE_DIR, `${sha}.poster.png`);
  fs.writeFileSync(srcPath, buf);
  try {
    await runFfmpeg(['-y', '-i', srcPath, '-frames:v', '1', '-vf', 'scale=540:-2', tmpPath], POSTER_TIMEOUT_MS);
    if (!fs.statSync(tmpPath).size) throw new Error('ffmpeg produced an empty poster');
    fs.renameSync(tmpPath, outPath);
    stats.posterHits += 0; // first extraction counts as a conversion, not a hit
    stats.conversions++;
    return fs.readFileSync(outPath);
  } catch (e) {
    stats.failures++;
    console.error('[animatedMedia] webm poster failed:', e.message);
    return null;
  } finally {
    try { fs.unlinkSync(srcPath); } catch {}
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

module.exports = { isWebm, isMp4, webmToMp4, webmPoster, stats, CACHE_DIR };
