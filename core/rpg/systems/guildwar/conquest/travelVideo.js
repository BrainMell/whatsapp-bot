'use strict';
// 🎞️ Travel video note: a round (ptv) mini-cutscene of the march — pixel world pans along the route, marching-ants path,
// the party walking with footsteps + wind, progress ring around the edge. Pure node-canvas + ffmpeg (mp4/h264/aac).
const path = require('path'); const fs = require('fs'); const os = require('os'); const { spawn } = require('child_process');
const { createCanvas } = require('canvas');
const map = require('./mapgen'); const C = require('./cards');
const AUDIO = path.join(__dirname, '..', '..', '..', '..', 'rpgasset', 'packs', 'audio', 'kenney-rpg-audio', 'Audio');
const SZ = 480, FPS = 12; const OUT = 'mp4';

function ff(args, input) { return new Promise((res, rej) => { const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'pipe'] }); let err = ''; p.stderr.on('data', (d) => { err += d; }); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c + ' ' + err.slice(-300))))); if (input) { p.stdin.on('error', () => {}); p.stdin.end(input); } else p.stdin.end(); }); }

/** footsteps + wind bed, `sec` long -> wav path */
async function makeAudio(dir, sec, mode) {
    const steps = ['footstep00', 'footstep01', 'footstep02', 'footstep03', 'footstep04'].map((n) => path.join(AUDIO, n + '.ogg')).filter((f) => fs.existsSync(f));
    const wav = path.join(dir, 'a.wav'); const gap = mode === 'arrive' ? 0.62 : 0.46; const n = Math.floor(sec / gap); const inputs = []; const delays = [];
    for (let i = 0; i < n; i++) { inputs.push('-i', steps[i % Math.max(1, steps.length)]); delays.push(`[${i + 1}:a]adelay=${Math.round(i * gap * 1000)}|${Math.round(i * gap * 1000)},volume=0.9[s${i}]`); }
    if (!steps.length) { await ff(['-f', 'lavfi', '-i', `anoisesrc=d=${sec}:c=pink:a=0.05`, '-t', String(sec), wav]); return wav; }
    const mixIn = delays.map((_, i) => `[s${i}]`).join('') + '[w]';
    const fc = `[0:a]anull[w];${delays.join(';')};${mixIn}amix=inputs=${n + 1}:normalize=0,afade=t=out:st=${Math.max(0, sec - 0.5)}:d=0.5,volume=1.4[o]`;
    await ff(['-f', 'lavfi', '-i', `anoisesrc=d=${sec}:c=pink:a=0.035,lowpass=f=700`, ...inputs, '-filter_complex', fc, '-map', '[o]', '-t', String(sec), wav]); return wav;
}

async function travelVideo(snap, opts = {}) {
    const sec = opts.sec || 6; const frames = sec * FPS; const R = snap.route; if (!R || !(R.path || []).length) return null;
    // 🗺️ the world is the SAME 3D hex map + pixel shader as the realm card (rendered once, bare), then the camera pans along the route
    const world = await require('./scene3d').warMapScene(Object.assign({}, snap, { portrait: true, bare: true })); const IW = world.width, IH = world.height;
    const pts = R.path.map((id) => world.P(id)).filter(Boolean).map((p) => [p.x, p.y]); if (pts.length < 2) return null; const dest = pts[pts.length - 1];
    const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const total = lens[lens.length - 1] || 1;
    const at = (d) => { d = Math.max(0, Math.min(total, d)); let i = 1; while (i < lens.length - 1 && lens[i] < d) i++; const f = (d - lens[i - 1]) / Math.max(0.0001, lens[i] - lens[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, pts[i][0] - pts[i - 1][0]]; };
    const ZOOM = Math.max(1.1, Math.min(2.2, SZ / (IW / 4.2))); const VW = SZ / ZOOM;
    const SPm = require('./sprites'); const hero = snap.me && snap.me.sprite ? await SPm.character(snap.me.sprite).catch(() => null) : null; const boot = hero || await C.icon('boot', '#ffffff', 26, 2); const flag = await C.icon('flag', '#ff4d4d', 40, 2); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-')); const jpgs = [];
    const arrive = R.mode === 'arrive'; const p0 = arrive ? 0.85 : Math.max(0, R.progress || 0);
    for (let f = 0; f < frames; f++) {
        const t = f / (frames - 1); const ease = t * t * (3 - 2 * t); const prog = Math.min(1, p0 + (1 - p0) * ease * (arrive ? 1 : 0.55 + 0.45 * 0)); const d = total * (arrive ? Math.min(1, 0.7 + 0.3 * ease) : Math.min(1, 0.06 + 0.9 * ease)); const [px, py, vx] = at(d);
        const cv = createCanvas(SZ, SZ); const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
        let camx = px - VW / 2, camy = py - VW / 2; camx = Math.max(0, Math.min(IW - VW, camx)); camy = Math.max(0, Math.min(IH - VW, camy));
        x.drawImage(world, camx, camy, VW, VW, 0, 0, SZ, SZ);
        const X = (v) => (v - camx) * ZOOM, Y = (v) => (v - camy) * ZOOM;
        x.imageSmoothingEnabled = true; x.lineCap = 'round'; x.lineJoin = 'round';
        // marching ants route (remaining = bright, walked = dim)
        x.setLineDash([14, 12]); x.lineDashOffset = -f * 2.2; x.lineWidth = 9; x.strokeStyle = C.INK; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])))); x.stroke(); x.lineWidth = 5; x.strokeStyle = '#ffe066'; x.stroke(); x.setLineDash([]);
        // destination flag (waving)
        if (flag) x.drawImage(flag, X(dest[0]) - 8, Y(dest[1]) - flag.height + 10 + Math.sin(f * 0.6) * 2);
        // walkers (party)
        const n = Math.min(4, Math.max(1, R.party || 1)); for (let k = n - 1; k >= 0; k--) { const off = k * 9; const [qx, qy] = at(Math.max(0, d - off)); const bob = Math.abs(Math.sin(f * 0.9 + k)) * 5; x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(X(qx), Y(qy) + 14, 14, 5, 0, 0, 7); x.fill(); if (boot) { x.save(); x.translate(X(qx), Y(qy) - bob); if (vx < 0) x.scale(-1, 1); { const bs = hero ? 64 / boot.height : 1; x.imageSmoothingEnabled = !!hero; x.drawImage(boot, -boot.width * bs / 2, -boot.height * bs + 14, boot.width * bs, boot.height * bs); } x.restore(); } }
        // dust
        for (let k = 0; k < 6; k++) { const age = ((f * 0.5 + k * 3) % 8) / 8; x.globalAlpha = (1 - age) * 0.5; x.fillStyle = '#e8dcc0'; const dx = X(px) - (vx >= 0 ? 1 : -1) * (14 + age * 40) + Math.sin(k * 2) * 6; x.fillRect(dx, Y(py) + 12 - age * 12, 5 - age * 3, 5 - age * 3); } x.globalAlpha = 1;
        // vignette + round mask
        const vg = x.createRadialGradient(SZ / 2, SZ / 2, SZ * 0.32, SZ / 2, SZ / 2, SZ * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,20,.65)'); x.fillStyle = vg; x.fillRect(0, 0, SZ, SZ);
        // progress ring
        x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.arc(SZ / 2, SZ / 2, SZ / 2 - 9, 0, 7); x.stroke(); x.strokeStyle = '#ffe066'; x.beginPath(); x.arc(SZ / 2, SZ / 2, SZ / 2 - 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (arrive ? 1 : Math.min(1, p0 + (1 - p0) * ease * 0.5))); x.stroke();
        // caption
        x.textAlign = 'center'; C.lbl(x, arrive ? 'ARRIVED' : `→ ${R.toName || ''}`.slice(0, 24), SZ / 2, SZ - 74, 26, '#fff'); if (!arrive && R.etaSec != null) C.lbl(x, `ETA ${R.etaSec >= 90 ? Math.round(R.etaSec / 60) + ' min' : R.etaSec + 's'}`, SZ / 2, SZ - 44, 22, '#ffe066');
        jpgs.push(cv.toBuffer('image/jpeg', { quality: 0.82 })); if (process.env.DUMP && f === 20) require('fs').writeFileSync(process.env.DUMP, jpgs[f]);
    }
    const wav = await makeAudio(dir, sec, R.mode); const out = path.join(dir, 'travel.' + OUT);
    for (let i = 0; i < jpgs.length; i++) fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), jpgs[i]);
    await ff(['-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-i', wav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '27', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', out]);
    const buf = fs.readFileSync(out); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* tmp */ } return buf;
}
module.exports = { travelVideo };
