'use strict';
// ASSET BAKE FOUNDATION (2026-11-09). One shared toolkit for "bake the expensive part once,
// glue the cheap part per request". See docs/GENERATION_BLUEPRINT.md for the per-generator recipes.
//   const cache = makeBakeCache({ ns:'skill', version:'v1', maxMB:200 });
//   const buf = await cache.getOrBake(cache.key(skillId, spriteHash), () => renderExpensive());
//   registerPrewarm('skill', { keys: () => [...], bake: async (k) => {...} });  prewarmAll();
//   await encodeBgraFrames({ w, h, fps, outW, outH, frames: async function*(){ yield rawBgraBuffer; } })
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = process.env.BAKE_DIR || path.join(os.homedir(), '.cache', 'bot_bake'); // keep OUTSIDE git
const OFF = process.env.ASSET_BAKE === '0';
const lowMem = () => process.memoryUsage().rss / 1048576 > (Number(process.env.BAKE_RSS_MB) || 620);

function makeBakeCache({ ns, version = 'v1', maxMB = 150, ext = 'bin' }) {
  const dir = path.join(ROOT, ns + '-' + version);
  const inflight = new Map();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const key = (...parts) => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex');
  const file = (k) => path.join(dir, k + '.' + ext);
  const get = (k) => { try { const f = file(k); const b = fs.readFileSync(f); const t = new Date(); fs.utimes(f, t, t, () => {}); return b; } catch (_) { return null; } };
  const put = (k, buf) => { try { const t = file(k) + '.tmp' + process.pid; fs.writeFileSync(t, buf); fs.renameSync(t, file(k)); setImmediate(prune); } catch (_) {} };
  function prune() {
    try {
      const cap = maxMB * 1048576;
      const items = fs.readdirSync(dir).map(n => { const s = fs.statSync(path.join(dir, n)); return { n, s: s.size, t: s.mtimeMs }; });
      let tot = items.reduce((a, b) => a + b.s, 0);
      for (const it of items.sort((a, b) => a.t - b.t)) { if (tot <= cap) break; try { fs.unlinkSync(path.join(dir, it.n)); tot -= it.s; } catch (_) {} }
    } catch (_) {}
  }
  async function getOrBake(k, bakeFn) {
    if (OFF) return bakeFn();
    const hit = get(k); if (hit) return hit;
    if (inflight.has(k)) return inflight.get(k);
    const p = (async () => { const b = await bakeFn(); if (Buffer.isBuffer(b) && b.length && !lowMem()) put(k, b); return b; })()
      .finally(() => inflight.delete(k));
    inflight.set(k, p); return p;
  }
  return { dir, key, get, put, prune, getOrBake };
}

// Raw BGRA frames -> H.264 mp4 (no PNG round-trip). frames = async iterable of Buffers (w*h*4).
function encodeBgraFrames({ w, h, fps = 20, outW = w, outH = h, frames, crf = 24, preset = 'veryfast' }) {
  return new Promise(async (resolve, reject) => {
    const out = path.join(os.tmpdir(), 'bake_' + crypto.randomBytes(6).toString('hex') + '.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', w + 'x' + h, '-r', String(fps), '-i', '-',
      '-vf', `scale=${outW}:${outH}:flags=bicubic,format=yuv420p`, '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-movflags', '+faststart', out]);
    let err = ''; ff.stderr.on('data', d => { err += d; });
    ff.on('error', reject);
    ff.on('close', c => { if (c !== 0) return reject(new Error('ffmpeg ' + c + ' ' + err.slice(0, 200))); try { const b = fs.readFileSync(out); fs.unlinkSync(out); resolve(b); } catch (e) { reject(e); } });
    try { for await (const f of frames) { if (!ff.stdin.write(f)) await new Promise(r => ff.stdin.once('drain', r)); } ff.stdin.end(); }
    catch (e) { try { ff.kill('SIGKILL'); } catch (_) {} reject(e); }
  });
}

// Low-priority background prewarm. Never competes with a live request: yields between jobs,
// stops when RAM is high. Call prewarmAll() once after boot (setTimeout 30s) and after content changes.
const registry = new Map();
function registerPrewarm(name, spec) { registry.set(name, spec); }
async function prewarmAll({ gapMs = 400 } = {}) {
  if (OFF) return { baked: 0 };
  let baked = 0;
  for (const [name, spec] of registry) {
    let keys = []; try { keys = await spec.keys(); } catch (_) {}
    for (const k of keys) {
      if (lowMem()) return { baked, stopped: 'lowmem' };
      try { await spec.bake(k); baked++; } catch (e) { console.warn('[prewarm]', name, e.message); }
      await new Promise(r => setTimeout(r, gapMs));
    }
  }
  return { baked };
}
module.exports = { makeBakeCache, encodeBgraFrames, registerPrewarm, prewarmAll, lowMem, ROOT };
