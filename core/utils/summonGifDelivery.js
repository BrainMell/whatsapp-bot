// ============================================
// 🎞️ SUMMON GIF DELIVERY - resilient animated card pipeline
// ============================================
// Shared by .summon (roster), .summon <#> (detail) and .summon codex.
//
// Incident this fixes (2026-10-10, live joker):
//   Go roster GIF renders measured 9-39s (base ~7s + ~0.7s/species on Box2).
//   The old pipeline stacked THREE timeouts on top of each other:
//     axios 30s → intermittent fail on big rosters (Go logged 38.9s renders)
//     ffmpeg execFileSync 15s → "spawnSync ffmpeg ETIMEDOUT" even on success
//     command watchdog 45s → killed the command → user saw NOTHING (not even
//     the text fallback) → "can't use summons at all" / "codex no longer
//     renders animations".
//
// Design (keeps the same look & feel — identical payloads, captions, MP4 flags):
//   1. MP4 LRU cache keyed by sha256(kind + JSON payload). Codex pages are
//      deterministic → instant repeat views. Rosters re-render only when the
//      player's summon data changes (payload hash changes).
//   2. In-flight dedupe: concurrent identical requests share one render.
//   3. Soft-budget race (default 20s): GIF arrives in time → ffmpeg (30s,
//      unique tmpfiles) → send single MP4. Not in time → text fallback sent
//      IMMEDIATELY (user always gets a fast reply), render continues in the
//      background and the finished MP4 is delivered as a follow-up message
//      with the SAME caption.
//   4. Unique tmp file names — the old fixed /tmp/summon_codex.gif names were
//      clobbered by concurrent commands of the same kind.
//   5. Never throws. Worst case: text fallback was already delivered.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min
const CACHE_MAX = 40;                // ~40 x ~150KB MP4 ≈ 6MB worst case
const SOFT_BUDGET_MS = Number(process.env.SUMMON_GIF_SOFT_MS || 20000);
const FFMPEG_TIMEOUT_MS = 30000;     // was 15000 - ETIMEDOUTed on real renders

// ---- MP4 LRU cache ----
const _mp4Cache = new Map(); // key -> { mp4: Buffer, at: number }

function cacheGet(key) {
  const hit = _mp4Cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    _mp4Cache.delete(key);
    return null;
  }
  // LRU refresh
  _mp4Cache.delete(key);
  _mp4Cache.set(key, hit);
  return hit.mp4;
}

function cachePut(key, mp4) {
  if (_mp4Cache.size >= CACHE_MAX) {
    // evict oldest
    const oldestKey = _mp4Cache.keys().next().value;
    _mp4Cache.delete(oldestKey);
  }
  _mp4Cache.set(key, { mp4, at: Date.now() });
}

// ---- in-flight render dedupe ----
const _inFlight = new Map(); // key -> Promise<Buffer|null>

function payloadKey(kind, payload) {
  let json;
  try { json = JSON.stringify(payload); } catch (e) { json = String(payload); }
  return crypto.createHash('sha256').update(kind + '|' + json).digest('hex');
}

// ---- ffmpeg GIF → MP4 (promisified, unique tmpfiles) ----
function gifToMp4(gifBuffer, kind) {
  return new Promise((resolve, reject) => {
    const uniq = `${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const tmpGif = path.join('/tmp', `summon_${kind}_${uniq}.gif`);
    const tmpMp4 = path.join('/tmp', `summon_${kind}_${uniq}.mp4`);
    try {
      fs.writeFileSync(tmpGif, gifBuffer);
    } catch (e) {
      return reject(e);
    }
    execFile('ffmpeg', [
      '-y', '-i', tmpGif,
      '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
      '-an', // no audio
      tmpMp4,
    ], { timeout: FFMPEG_TIMEOUT_MS, stdio: 'pipe' }, (err) => {
      if (err) {
        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
        return reject(err);
      }
      try {
        const mp4Buffer = fs.readFileSync(tmpMp4);
        try { fs.unlinkSync(tmpGif); } catch (e) {}
        try { fs.unlinkSync(tmpMp4); } catch (e) {}
        resolve(mp4Buffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function sendMp4(sock, chatId, mp4Buffer, caption) {
  await sock.sendMessage(chatId, { video: mp4Buffer, gifPlayback: true, caption });
}

/**
 * Deliver a summon animated card.
 * @param {object} opts
 *   kind           'roster' | 'detail' | 'codex' - cache namespace + log tag
 *   payload        Go service payload (JSON-serializable)
 *   sock, chatId   WhatsApp target
 *   caption        caption for the MP4 (identical foreground & follow-up)
 *   goCall         async (payload) => Promise<Buffer> - the Go GIF call
 *   textFallback   string | async () => void - sent when the render is slow
 *                  or failed (string is sent as-is; function does its own send)
 *   pngFallback    async () => {image, caption} | null - static card attempt
 *                  (used when the GIF fails FAST in the foreground, or as the
 *                  background failure follow-up)
 *   logTag         e.g. '[SummonRoster]'
 */
async function deliverSummonGif(opts) {
  const {
    kind, payload, sock, chatId, caption,
    goCall, textFallback = null, pngFallback = null,
    logTag = '[SummonGif]',
  } = opts;

  const key = payloadKey(kind, payload);

  // 1. Cache hit → instant single message (the common case after first view)
  const cached = cacheGet(key);
  if (cached) {
    try {
      console.log(`${logTag} MP4 cache hit (${key.slice(0, 10)}), sending instantly`);
      await sendMp4(sock, chatId, cached, caption);
      return;
    } catch (e) {
      console.error(`${logTag} cached MP4 send failed:`, e.message);
      // fall through to the fresh-render path
    }
  }

  // 2. Kick off (or join) the render
  let renderPromise = _inFlight.get(key);
  const joined = !!renderPromise;
  if (!renderPromise) {
    renderPromise = (async () => {
      try {
        const gifBuffer = await goCall(payload);
        return (gifBuffer && gifBuffer.length > 0) ? gifBuffer : null;
      } catch (e) {
        console.error(`${logTag} GIF render failed:`, e.message);
        return null;
      }
    })();
    _inFlight.set(key, renderPromise);
    // drop the entry when settled (keep the map small); cache handles reuse
    renderPromise.finally(() => { if (_inFlight.get(key) === renderPromise) _inFlight.delete(key); }).catch(() => {});
  } else {
    console.log(`${logTag} joining in-flight render ${key.slice(0, 10)}`);
  }

  // 3. Soft-budget race
  let timer;
  const budget = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), SOFT_BUDGET_MS); });
  const outcome = await Promise.race([renderPromise.then((b) => (b ? 'gif' : 'fail')), budget]);
  clearTimeout(timer);

  if (outcome === 'gif') {
    // GIF landed in time → convert + send (single message, old UX)
    try {
      const gifBuffer = await renderPromise;
      const mp4 = await gifToMp4(gifBuffer, kind);
      cachePut(key, mp4);
      await sendMp4(sock, chatId, mp4, caption);
      return;
    } catch (e) {
      console.error(`${logTag} foreground convert/send failed:`, e.message);
      // fall through to fallbacks below
    }
  } else if (outcome === 'fail' && !joined) {
    // Fast failure in the foreground → PNG fallback → text (old behavior)
    if (pngFallback) {
      try {
        const png = await pngFallback();
        if (png && png.image) {
          await sock.sendMessage(chatId, { image: png.image, caption: png.caption || caption });
          return;
        }
      } catch (e) {
        console.error(`${logTag} PNG fallback failed:`, e.message);
      }
    }
    if (textFallback) {
      try {
        if (typeof textFallback === 'function') await textFallback();
        else await sock.sendMessage(chatId, { text: textFallback });
      } catch (e) {
        console.error(`${logTag} text fallback failed:`, e.message);
      }
    }
    return;
  }

  // 4. Soft budget exceeded (or joined a slow render) → text NOW,
  //    background-deliver the MP4 when it lands.
  try {
    if (typeof textFallback === 'function') await textFallback();
    else if (textFallback) await sock.sendMessage(chatId, { text: textFallback });
  } catch (e) {
    console.error(`${logTag} text fallback failed:`, e.message);
  }

  // Background continuation - do NOT await (command context may already be over)
  (async () => {
    try {
      const gifBuffer = await renderPromise;
      if (!gifBuffer) throw new Error('render returned null');
      const mp4 = await gifToMp4(gifBuffer, kind);
      cachePut(key, mp4);
      await sendMp4(sock, chatId, mp4, caption);
      console.log(`${logTag} background MP4 delivered (${mp4.length} bytes, key ${key.slice(0, 10)})`);
    } catch (e) {
      console.error(`${logTag} background delivery failed:`, e.message);
      // last resort: static PNG follow-up (still better than nothing)
      if (pngFallback) {
        try {
          const png = await pngFallback();
          if (png && png.image) {
            await sock.sendMessage(chatId, { image: png.image, caption: png.caption || caption });
          }
        } catch (e2) {
          console.error(`${logTag} background PNG follow-up failed:`, e2.message);
        }
      }
    }
  })();
}

function cacheStats() {
  return { entries: _mp4Cache.size, inFlight: _inFlight.size };
}

module.exports = { deliverSummonGif, cacheStats, gifToMp4, payloadKey };
