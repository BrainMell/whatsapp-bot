'use strict';
// 🐉 Idle animations for summon cards (owner 2026-11-07: "I went through a lot of trouble to get them animated - use their idle
// animations when a card transitions into the summon, and `.j summons <n>` should be the summon doing its idle inside the card").
// The animated sprites are `<name>_idle.gif` in core/rpgasset/summons/sparklinlabs (copied from the Go assets). Decoded ONCE through
// ffmpeg into RGBA frames and cached in memory + on disk. Cards without an idle gif (ifrit/leviathan/shiva) return null and callers
// fall back to the static art with a gentle float.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { loadImage } = require('canvas');

const DIR = path.join(__dirname, '..', '..', '..', 'rpgasset', 'summons', 'sparklinlabs');
const CACHE = path.join(os.tmpdir(), 'summon_idle_cache_v1');
const mem = new Map();

function gifPathFor(card) {
  const base = String((card && card.art) || '').replace(/^.*[\\/]/, '').replace(/\.[a-z]+$/i, '');
  if (!base) return null;
  const p = path.join(DIR, base + '_idle.gif');
  return fs.existsSync(p) ? p : null;
}
function ff(args) { return new Promise((resolve, reject) => { const p = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', ...args]); let e = ''; p.stderr.on('data', (d) => { e += d; }); p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg ' + c + ' ' + e.slice(0, 160))))); }); }
function gifFps(file) {
  try { const r = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', file], { encoding: 'utf8' }); const [a, b] = String(r.stdout || '').trim().split('/').map(Number); const v = a / (b || 1); return v > 1 && v < 60 ? v : 10; } catch (e) { return 10; }
}

/** -> { frames: Image[], fps, w, h } | null */
async function getIdle(card) {
  const file = gifPathFor(card); if (!file) return null;
  if (mem.has(file)) return mem.get(file);
  const job = (async () => {
    try {
      const dir = path.join(CACHE, path.basename(file, '.gif')); fs.mkdirSync(dir, { recursive: true });
      let names = fs.readdirSync(dir).filter((n) => /^f\d+\.png$/.test(n)).sort();
      if (!names.length) { await ff(['-i', file, '-vsync', '0', '-pix_fmt', 'rgba', path.join(dir, 'f%03d.png')]); names = fs.readdirSync(dir).filter((n) => /^f\d+\.png$/.test(n)).sort(); }
      if (!names.length) return null;
      const frames = []; for (const n of names) frames.push(await loadImage(path.join(dir, n)));
      return { frames, fps: gifFps(file), w: frames[0].width, h: frames[0].height };
    } catch (e) { console.warn('[SummonIdle] decode failed for', path.basename(file), e.message); return null; }
  })();
  mem.set(file, job);
  const r = await job; if (!r) mem.delete(file);
  return r;
}
/** Frame of an idle at time `sec` (loops). */
function frameAt(idle, sec) { return idle.frames[Math.floor(Math.max(0, sec) * idle.fps) % idle.frames.length]; }

module.exports = { getIdle, frameAt, gifPathFor };
