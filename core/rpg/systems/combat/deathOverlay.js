'use strict';
// ⚡ DEATH OVERLAY CACHE (2026-11-06, owner: "death animation rendered and set in less than a second").
// The expensive part of a death clip is PAINTING the dissolve (hundreds of ms locally, 5-8s on the prod boxes). That painting
// depends only on the dying sprite + element kind + boss flag - NOT on the scene. So we paint it ONCE per (sprite, kind, boss)
// as transparent PNG frames (disk + memory cache) and every later kill is just: cheap scene plate + ONE encode.
//
// 2026-11-06 <1s hammer (bench-driven, box2 2-core EPYC):
//   - v1: the fast path never ran in prod — this file sat in core/rpg/ while
//     skillVfx requires './deathOverlay' (systems/combat). Fixed by the git mv.
//   - v3: `-loop 1 -i still.jpg` re-decodes the jpeg EVERY output frame —
//     stills are now fed once and cloned in-filter (or streamed raw).
//   - v5: canvas blits the plate+overlay composite and streams RAW BGRA
//     frames straight into ffmpeg stdin (rawvideo demuxer). No still I/O, no
//     filter graph for the clip side; canvas blits overlap with x264 encode.
//     node-canvas 'raw' = premultiplied ARGB32 = bgra on little-endian; the
//     composite is fully opaque (plate under everything) so premultiplied ==
//     straight. renderFast returns `mats` so the kill-turn card merge
//     (guildAdventure) reuses the same streaming trick.
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

function keyOf(picks, kind, boss, atk) {
  const h = crypto.createHash('sha1');
  let bx0 = 1e9, by0 = 1e9;
  for (const p of picks) { bx0 = Math.min(bx0, p.x); by0 = Math.min(by0, p.y); }
  for (const p of picks) { h.update(p.png); h.update(`|${Math.round(p.x - bx0)},${Math.round(p.y - by0)},${Math.round(p.w)},${Math.round(p.h)};`); }
  // 💡 v2: full-length dissolve overlays (v1 keys hold 1.0s truncated bakes) · ⚔️ v3: atk —
  // basic-attack kills bake the animated slash intro (DEATHATTACK_* recipes), so the same
  // sprite now has TWO distinct overlays per (kind, boss).
  h.update(`${kind}:${boss ? 1 : 0}:${atk ? 'atk' : 'plain'}:v4`);
  return h.digest('hex').slice(0, 20);
}

/** Paint (or fetch) the transparent overlay frames. ⚔️ atk = killed by a basic attack → the
 * clip opens on the animated basic attack (2 slashes + impact sparks) before the dissolve. */
function getOverlay(picks, kind, boss, W0, H0, atk) {
  const key = keyOf(picks, kind, boss, atk);
  if (mem.has(key)) return mem.get(key);
  const pr = (async () => {
    const dir = path.join(ROOT, key);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      if (meta && meta.n > 0 && fs.existsSync(path.join(dir, `f${String(meta.n - 1).padStart(3, '0')}.png`))) return Object.assign({ dir }, meta);
    } catch (e) { /* not on disk yet */ }
    const { layers } = await localLayers(picks, W0, H0);
    const vid = await require('./ultimateFx').renderUltimateVideo({
      // ⚔️ #5: DEATHATTACK_* recipes open on the animated basic attack before the dissolve
      classId: (atk ? 'DEATHATTACK_' : 'DEATH_') + kind + (boss ? '_BOSS' : ''), name: '', side: 'enemy', palette: ['#ffffff', '#ffcb45', '#e85a37'],
      skillLevel: 1, maxLevel: 1, intensity: 0, layers, casterIndex: 0, targetIndex: 0, focusIndex: 0,
      targetSide: 'enemy', aoe: false, targets: [], death: true, overlayOnly: true,
      // 💡 OWNER FIX round 5 (2026-11-07: "the stone type animation … stops half way through"):
      // the overlay used to paint only the FIRST 1.0s of the death recipe — the dissolve runs
      // 0.4→1.9s (regular) / 0.65→3.35s (boss), so every fast-path clip ended with the sprite
      // still mid-crumble (bosses cut at ~30%). Paint the FULL recipe instead: the bake stays a
      // one-time per-sprite cache cost; every future decode+encode replays it complete.
      // ⚔️ #5: attack kills add the 0.9s slash intro — durations 2.9 / 4.4 so the dissolve
      // (impact 1.3 / 1.55 + 1.5 / 2.7) still finishes inside the bake.
      duration: (atk ? 0.9 : 0) + (boss ? 3.5 : 2.0),
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

/** Scene plate (video space JPEG): bg + every surviving combatant cutout.
 *  🔧 DEATH-ORDER BACKDROP (owner voice note 2026-11-06): cutouts of enemies
 *  that died on EARLIER turns are skipped too — the fallen never stand inside
 *  a later kill's death animation. */
async function scenePlate(layers, dyingIdx, deadIdx, chrome) {
  const { createCanvas, loadImage } = require('canvas');
  const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
  const kx = VW / W0, ky = VH / H0;
  const cv = createCanvas(VW, VH), c = cv.getContext('2d');
  const __bg = await loadImage(layers.bg);
  c.drawImage(__bg, 0, 0, VW, VH);
  // ☠️ ERASE THE FALLEN'S BARS (owner 2026-11-07: "the ultimate animation still has the floating
  // HP bars visible even after the enemy is dead"): Go bakes the overhead HP bars into the scene
  // bg, so skipping a fallen unit's cutout still leaves its bar floating over the clip. Paint over
  // each fallen unit's bar with the background sampled right above it (bg pixel space = layers
  // space, so src and dst line up 1:1 before the plate's kx/ky scaling).
  {
    const __gone = new Set();
    for (const __s of [dyingIdx, deadIdx]) {
      if (__s instanceof Set || Array.isArray(__s)) for (const __i of __s) __gone.add(Math.floor(Number(__i) || 0));
    }
    if (__gone.size && Array.isArray(layers.anchors)) {
      for (const __a of layers.anchors) {
        if (!__a || String(__a.side) !== 'enemy' || !__gone.has(Math.floor(Number(__a.index) || 0))) continue;
        const __bw = 100, __bh = 12, __pad = 6;   // Go enemy-bar geometry (100x12 @ center-50, top-15)
        const __bx = (Number(__a.x) || 0) - __bw / 2 - __pad;
        const __by = (Number(__a.feetY) || 0) - Math.max(24, Number(__a.h) || 0) - 15 - __pad;
        const __sw = __bw + __pad * 2, __sh = __bh + __pad * 2;
        const __sy = Math.max(0, __by - __sh - 2);
        const __shh = Math.min(__sh, Math.max(2, __by - __sy));
        try { c.drawImage(__bg, __bx, __sy, __sw, __shh, __bx * kx, __by * ky, __sw * kx, __sh * ky); } catch (e) {}
      }
    }
  }
  const __dead = deadIdx instanceof Set ? deadIdx : new Set();
  const cuts = (layers.cuts || []).filter((x) => x && x.png && !(String(x.side) === 'enemy' && (dyingIdx.has(Math.floor(Number(x.index) || 0)) || __dead.has(Math.floor(Number(x.index) || 0)))));
  cuts.sort((a, b) => (Number(a.y) + Number(a.h)) - (Number(b.y) + Number(b.h)));
  for (const x of cuts) { try { c.drawImage(await loadImage(Buffer.from(x.png, 'base64')), x.x * kx, x.y * ky, x.w * kx, x.h * ky); } catch (e) {} }
  // 🎞️ same HUD chrome as the card scenes (bars of the survivors, rank chip, player hub) — uniform in every death clip
  if (chrome && process.env.DEATH_CHROME !== '0') {
    try {
      const hide = new Set([...dyingIdx, ...__dead].map((n) => Math.floor(Number(n) || 0)));
      // paint in 1024x687 layer space through the SAME anisotropic mapping as the bg (kx,ky) so the HUD matches the card scene once the clip is stretched back to 768x516
      c.save(); c.scale(kx, ky);
      await require('./combatCardNode').paintChrome(c, 1024 / 1024, { ...chrome, layers, hide });
      c.restore();
    } catch (e) {}
  }
  return cv.toBuffer('image/jpeg', { quality: 0.85 });
}

/** ⚡ v5 STREAMING COMPOSITE: blit plate + dissolve frames in node canvas
 *  and push raw BGRA buffers into an ffmpeg rawvideo stdin. Returns the
 *  number of frames streamed. */
async function streamComposite(m, stdin) {
  const { createCanvas, loadImage } = require('canvas');
  const plate = await loadImage(m.plate);
  // ⚡ parallel pre-decode: PNG frames decode on the libuv threadpool while
  // the main thread blits — a serial decode loop stalls the ffmpeg pipe
  const loaded = await Promise.all(
    Array.from({ length: m.n }, (_, i) =>
      loadImage(path.join(m.framesDir, `f${String(i).padStart(3, '0')}.png`)).catch(() => null))
  );
  const cv = createCanvas(plate.width, plate.height), c = cv.getContext('2d');
  let n = 0;
  for (const f of loaded) {
    if (!f) break;
    c.drawImage(plate, 0, 0);
    if (m.intro) { try { require('./hitFx').drawStrikeAnim(c, m.intro, n / (m.fps || 15)); } catch (e) {} }   // ⚔️ real basic-attack animation, then the dissolve
    c.drawImage(f, m.ox, m.oy);
    const buf = cv.toBuffer('raw');
    if (!stdin.write(buf)) await new Promise((r) => stdin.once('drain', r));
    n++;
  }
  return n;
}

/** Encode a materials composite into a standalone clip mp4 (raw pipe in). */
function encodeRawClip(m, outPath) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgra',
      '-s', `${VW}x${VH}`, '-r', String(m.fps), '-i', 'pipe:0',
      // 📐 the 4:3 (640x480) ultimate/death space is a vertically-squashed 1024x687 scene; restore the true 768x516 (1.49:1) frame
      // so death clips match the card scene's dimensions (no letterbox bars, no squash)
      '-vf', process.env.DEATH_RESTORE_ASPECT === '0' ? 'format=yuv420p' : 'scale=768:516:flags=bicubic,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'baseline', '-crf', '24', '-threads', '2', '-movflags', '+faststart', '-an', outPath];
    const p = spawn(ffmpegBin(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; let done = false;
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 20000);
    p.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    p.stdin.on('error', () => {});   // EPIPE after early exit is fine
    p.on('error', (e) => { if (!done) { done = true; clearTimeout(to); reject(e); } });
    p.on('close', (code) => {
      if (done) return; done = true; clearTimeout(to);
      if (code === 0) { try { resolve(fs.readFileSync(outPath)); } catch (e) { resolve(null); } }
      else { console.warn('[DeathOv] encode stderr:', err.slice(0, 200)); resolve(null); }
    });
    streamComposite(m, p.stdin).then(() => p.stdin.end()).catch((e) => {
      try { p.stdin.destroy(); } catch (e2) {}
      if (!done) { done = true; clearTimeout(to); reject(e); }
    });
  });
}

/** ⚡ CANVAS COMPOSITE (still-frame variant, kept for the N>1 merge fallback):
 *  blit plate + overlay frames in node canvas. Writes c%03d.jpg into outDir
 *  and returns the frame count (0 on total failure). */
async function compositeFrames(m, outDir) {
  try {
    const { createCanvas, loadImage } = require('canvas');
    fs.mkdirSync(outDir, { recursive: true });
    const plate = await loadImage(m.plate);
    const cv = createCanvas(plate.width, plate.height), c = cv.getContext('2d');
    let n = 0;
    for (let i = 0; i < m.n; i++) {
      let f = null;
      try { f = await loadImage(path.join(m.framesDir, `f${String(i).padStart(3, '0')}.png`)); } catch (e) { break; }
      if (!f) break;
      c.drawImage(plate, 0, 0);
      if (m.intro) { try { require('./hitFx').drawStrikeAnim(c, m.intro, i / (m.fps || 15)); } catch (e) {} }
      c.drawImage(f, m.ox, m.oy);
      fs.writeFileSync(path.join(outDir, `c${String(i).padStart(3, '0')}.jpg`), cv.toBuffer('image/jpeg', { quality: 0.88 }));
      n++;
    }
    return n;
  } catch (e) { console.warn('[DeathOv] canvas composite failed:', e && e.message || e); return 0; }
}

/** Full fast path. picks = dying cutouts (layers space); layers = the fight's shared scene.
 *  ⚔️ atk = the dying unit was killed by a basic attack → overlay opens on the slash intro. */
async function renderFast({ layers, picks, kind, boss, deadIdx, atk, chrome }) {
  const t0 = Date.now();
  if (!layers || !Buffer.isBuffer(layers.bg) || !picks || !picks.length) return null;
  const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
  const pk = [];
  for (const p of picks) pk.push({ png: Buffer.from(p.c.png, 'base64'), x: Number(p.c.x) || 0, y: Number(p.c.y) || 0, w: Number(p.c.w) || 0, h: Number(p.c.h) || 0, idx: Math.max(0, Math.floor(Number(p.c.index) || 0)) });
  if (pk.some((p) => !p.w || !p.h)) return null;
  const ov = await getOverlay(pk, kind, boss, W0, H0, atk);
  if (!ov) return null;
  const tOv = Date.now() - t0;
  let bx0 = 1e9, bx1 = -1e9, ft = -1e9;
  for (const p of pk) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x + p.w); ft = Math.max(ft, p.y + p.h); }
  const kx = VW / W0, ky = VH / H0;
  const ox = Math.round(((bx0 + bx1) / 2) * kx - LOCAL.x * (VW / 1024)), oy = Math.round(ft * ky - LOCAL.feet * (VH / 687));
  const plate = await scenePlate(layers, new Set(pk.map((p) => p.idx)), deadIdx, chrome);
  // ⚔️ strike spec: the killing basic attack, same variant / element / crit as the static card (seed = the turn counter)
  let intro = null;
  if (atk && process.env.DEATH_STRIKE_ANIM !== '0') {
    try {
      let t0y = 1e9; for (const p of pk) t0y = Math.min(t0y, p.y);
      const cs = chrome || {}, hitFx = require('./hitFx');
      const bodyH = (ft - t0y) * ky, sc = VW / 1024;
      intro = { variant: hitFx.pickVariant({ attackSeed: cs.atkSeed, attackerIndex: 0, targetIndex: pk[0].idx, damage: 0 }), cx: ((bx0 + bx1) / 2) * kx, cy: (ft - (ft - t0y) * 0.5) * ky,
        h: bodyH, dir: cs.atkDir || 1, el: cs.atkElement && cs.atkElement !== 'physical' ? cs.atkElement : null, crit: !!cs.atkCrit, s: sc };
    } catch (e) { intro = null; }
  }
  const tPlate = Date.now() - t0;
  const id = crypto.randomBytes(5).toString('hex');
  const outPath = path.join(ov.dir, `out_${id}.mp4`);
  // ⚡ v5: canvas blits the composite, raw frames stream into a pure encode
  let mp4 = null;
  try {
    mp4 = await encodeRawClip({ plate, framesDir: ov.dir, n: ov.n, fps: ov.fps, ox, oy, intro }, outPath);
  } catch (e) { console.warn('[DeathOv] stream encode failed:', e && e.message || e); }
  try { fs.unlinkSync(outPath); } catch (e) {}
  const tEnc = Date.now() - t0;
  if (!mp4 || mp4.length < 1000) { console.warn('[DeathOv] composite failed'); return null; }
  console.log(`[DeathOv] ${atk ? 'ATK+' : ''}${kind}${boss ? '_BOSS' : ''} ${mp4.length}B overlay ${tOv}ms plate ${tPlate - tOv}ms enc ${tEnc - tPlate}ms total ${Date.now() - t0}ms`);
  // ⚡ raw materials for the kill-turn merge: plate + overlay frame dir +
  // placement lets the card merge re-composite in ONE raw-stream encode.
  return { mp4, thumb: plate, mats: { plate, framesDir: ov.dir, n: ov.n, fps: ov.fps, ox, oy, intro } };
}

module.exports = { renderFast, getOverlay, scenePlate, streamComposite, encodeRawClip, compositeFrames, _ROOT: ROOT };

