'use strict';
// ⚡ DEATH OVERLAY CACHE (2026-11-06, owner: "death animation rendered and set in less than a second").
// The expensive part of a death clip is PAINTING the dissolve (hundreds of ms locally, 5-8s on the prod boxes). That painting
// depends only on the dying sprite + element kind + boss flag - NOT on the scene. So we paint it ONCE per (sprite, kind, boss)
// as transparent PNG frames (disk + memory cache) and every later kill is just: cheap scene plate (bg + survivors) + one
// ffmpeg overlay pass (~0.2s). Falls back (returns null) on any problem so the caller uses the full engine render.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const VW = 640, VH = 480, LOCAL = { x: 512, feet: 560 };   // local anchor in the 1024x687 layers space
const ROOT = process.env.DEATH_OV_DIR || path.join(os.tmpdir(), 'joker_deathov');
const mem = new Map();   // key -> Promise<{dir, n, fps}|null>

function ffmpegBin() { return process.env.FFMPEG_PATH || 'ffmpeg'; }
function run(args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let err = ''; let done = false;
    const p = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, timeoutMs);
    p.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    p.on('error', () => { if (!done) { done = true; clearTimeout(to); resolve({ ok: false, err: 'spawn' }); } });
    p.on('close', (code) => { if (!done) { done = true; clearTimeout(to); resolve({ ok: code === 0, err }); } });
  });
}

/** picks: [{ png(Buffer), x, y, w, h }] in layers space (dying sprites). Returns the local-space layers + union box. */
async function localLayers(picks, W0, H0) {
  const { createCanvas, loadImage } = require('canvas');
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, ft = -1e9;
  for (const p of picks) { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); bx1 = Math.max(bx1, p.x + p.w); ft = Math.max(ft, p.y + p.h); }
  const ux = (bx0 + bx1) / 2, dx = LOCAL.x - ux, dy = LOCAL.feet - ft;
  const cv = createCanvas(W0, H0), c = cv.getContext('2d');
  for (const p of picks) c.drawImage(await loadImage(p.png), p.x + dx, p.y + dy, p.w, p.h);
  const blank = createCanvas(W0, H0).toBuffer('image/png');
  const bg = createCanvas(W0, H0); { const g = bg.getContext('2d'); g.fillStyle = '#202020'; g.fillRect(0, 0, W0, H0); }
  const layers = {
    bg: bg.toBuffer('image/png'), sprites: blank, focus: cv.toBuffer('image/png'), cuts: [], w: W0, h: H0,
    anchors: [{ side: 'enemy', index: 0, x: LOCAL.x, feetY: LOCAL.feet, w: bx1 - bx0, h: ft - by0 }, { side: 'player', index: 0, x: 200, feetY: 560, w: 80, h: 120 }],
  };
  return { layers, ux, ft, bw: bx1 - bx0, bh: ft - by0 };
}

function keyOf(picks, kind, boss) {
  const h = crypto.createHash('sha1');
  let bx0 = 1e9, by0 = 1e9;
  for (const p of picks) { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); }
  for (const p of picks) { h.update(p.png); h.update(`|${Math.round(p.x - bx0)},${Math.round(p.y - by0)},${Math.round(p.w)},${Math.round(p.h)};`); }
  h.update(`${kind}:${boss ? 1 : 0}:v1`);
  return h.digest('hex').slice(0, 20);
}

/** Paint (or fetch) the transparent overlay frames. */
function getOverlay(picks, kind, boss, W0, H0) {
  const key = keyOf(picks, kind, boss);
  if (mem.has(key)) return mem.get(key);
  const pr = (async () => {
    const dir = path.join(ROOT, key);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      if (meta && meta.n > 0 && fs.existsSync(path.join(dir, `f${String(meta.n - 1).padStart(3, '0')}.png`))) return Object.assign({ dir }, meta);
    } catch (e) { /* not on disk yet */ }
    const { layers } = await localLayers(picks, W0, H0);
    const vid = await require('./ultimateFx').renderUltimateVideo({
      classId: 'DEATH_' + kind + (boss ? '_BOSS' : ''), name: '', side: 'enemy', palette: ['#ffffff', '#ffcb45', '#e85a37'],
      skillLevel: 1, maxLevel: 1, intensity: 0, layers, casterIndex: 0, targetIndex: 0, focusIndex: 0,
      targetSide: 'enemy', aoe: false, targets: [], death: true, overlayOnly: true,
    });
    if (!vid || !Array.isArray(vid.frames) || !vid.frames.length) return null;
    fs.mkdirSync(dir, { recursive: true });
    vid.frames.forEach((b, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), b));
    const meta = { n: vid.frames.length, fps: vid.fps || 15 };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
    return Object.assign({ dir }, meta);
  })().catch((e) => { console.warn('[DeathOv] overlay paint failed:', e && e.message || e); return null; });
  mem.set(key, pr);
  pr.then((r) => { if (!r) mem.delete(key); });
  if (mem.size > 200) mem.delete(mem.keys().next().value);
  return pr;
}

/** Scene plate (video space JPEG): bg + every surviving combatant cutout. */
async function scenePlate(layers, dyingIdx) {
  const { createCanvas, loadImage } = require('canvas');
  const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
  const kx = VW / W0, ky = VH / H0;
  const cv = createCanvas(VW, VH), c = cv.getContext('2d');
  c.drawImage(await loadImage(layers.bg), 0, 0, VW, VH);
  const cuts = (layers.cuts || []).filter((x) => x && x.png && !(String(x.side) === 'enemy' && dyingIdx.has(Math.floor(Number(x.index) || 0))));
  cuts.sort((a, b) => (Number(a.y) + Number(a.h)) - (Number(b.y) + Number(b.h)));
  for (const x of cuts) { try { c.drawImage(await loadImage(Buffer.from(x.png, 'base64')), x.x * kx, x.y * ky, x.w * kx, x.h * ky); } catch (e) {} }
  return cv.toBuffer('image/jpeg', { quality: 0.85 });
}

/** Full fast path. picks = dying cutouts (layers space); layers = the fight's shared scene. Returns { mp4, thumb } | null. */
async function renderFast({ layers, picks, kind, boss }) {
  const t0 = Date.now();
  if (!layers || !Buffer.isBuffer(layers.bg) || !picks || !picks.length) return null;
  const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
  const pk = [];
  for (const p of picks) pk.push({ png: Buffer.from(p.c.png, 'base64'), x: Number(p.c.x) || 0, y: Number(p.c.y) || 0, w: Number(p.c.w) || 0, h: Number(p.c.h) || 0, idx: Math.max(0, Math.floor(Number(p.c.index) || 0)) });
  if (pk.some((p) => !p.w || !p.h)) return null;
  const ov = await getOverlay(pk, kind, boss, W0, H0);
  if (!ov) return null;
  const tOv = Date.now() - t0;
  let bx0 = 1e9, bx1 = -1e9, ft = -1e9;
  for (const p of pk) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x + p.w); ft = Math.max(ft, p.y + p.h); }
  const kx = VW / W0, ky = VH / H0;
  const ox = Math.round(((bx0 + bx1) / 2) * kx - LOCAL.x * (VW / 1024)), oy = Math.round(ft * ky - LOCAL.feet * (VH / 687));
  const plate = await scenePlate(layers, new Set(pk.map((p) => p.idx)));
  const id = crypto.randomBytes(5).toString('hex');
  const platePath = path.join(ov.dir, `plate_${id}.jpg`), outPath = path.join(ov.dir, `out_${id}.mp4`);
  fs.writeFileSync(platePath, plate);
  const tPlate = Date.now() - t0;
  const r = await run(['-v', 'error', '-y', '-loop', '1', '-framerate', String(ov.fps), '-i', platePath,
    '-framerate', String(ov.fps), '-i', path.join(ov.dir, 'f%03d.png'),
    '-filter_complex', `[0:v][1:v]overlay=x=${ox}:y=${oy}:shortest=1,format=yuv420p`,
    '-frames:v', String(ov.n), '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'baseline', '-crf', '24', '-movflags', '+faststart', '-an', outPath]);
  let mp4 = null;
  try { if (r.ok) mp4 = fs.readFileSync(outPath); } catch (e) {}
  try { fs.unlinkSync(platePath); } catch (e) {} try { fs.unlinkSync(outPath); } catch (e) {}
  if (!mp4 || mp4.length < 1000) { console.warn('[DeathOv] composite failed:', (r.err || '').slice(0, 200)); return null; }
  console.log(`[DeathOv] ${kind}${boss ? '_BOSS' : ''} ${mp4.length}B overlay ${tOv}ms plate ${tPlate - tOv}ms total ${Date.now() - t0}ms`);
  return { mp4, thumb: plate };
}

module.exports = { renderFast, getOverlay, scenePlate, _ROOT: ROOT };
