'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  ULTIMATE FX LAYERS v2 (2026-10-27, owner VFX redesign round).
//  Physical classes no longer "lunge" at the target (the glued-on moving
//  square); they cut the target in place. New building blocks:
//    focus     - transform the isolated target sprite (press/suck/echo) + red hurt pulse
//    vortex    - REAL warp of the battlefield bg: swirl + pinch into a black hole
//    bgfill    - replace the bg with a gradient (void / stage)
//    invert    - colour inversion (caster stays normal; the HUD is drawn later)
//    slashes   - tapered blade cuts / radial burst lines on the target
//    swarm     - coins / kunai / souls orbiting then darting THROUGH the target
//    scythe    - giant scythe swing
//    robohand  - giant mechanical hand pressing the target into the ground
//    breath    - stream of fire from a mouth
//    dragon    - giant procedural dragon head
//    tether    - chain of souls between caster and target
//    soulflow  - a soul leaves the target and enters the caster (heal)
//    elements  - four elemental orbs orbit, then fuse over the target
//    reticle   - tech targeting reticle
//    staff     - music staff + equaliser bars
//    ripple    - rings that contract (rewind) or expand
//  Every layer is a pure function of env.time (deterministic).
// ═══════════════════════════════════════════════════════════════════════════
const { createCanvas } = require('canvas');

module.exports = function install(LAYERS, H) {
    const { pt, glowDot, sprite, mulberry, hashS, clamp01, easeOut, easeIn, bell, setFr, tintImg } = H;
    const lerp = (a, b, t) => a + (b - a) * t;
    const TAU = Math.PI * 2;
    const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return [255, 255, 255]; const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    // in / hold / out envelope for a layer window
    const env3 = (t, dur, fin, fout) => easeOut(clamp01(t / Math.max(0.001, fin))) * (1 - easeIn(clamp01((t - (dur - fout)) / Math.max(0.001, fout))));

    // ── focus: transform the isolated target sprite ────────────────────────
    LAYERS.focus = (ctx, tr, env) => {
        if (!env.focImg) return;
        const t = env.time - tr.at, dur = tr.dur || 1, u = clamp01(t / dur), inWin = t >= 0 && t <= dur;
        const rect = env.focRect || [env.A.T[0], env.A.T[1], 90, 130];
        const cx = rect[0], feet = rect[1], mid = feet - rect[3] / 2;
        let dy = 0, s = 1, sy = 1, rot = 0, alpha = 1, clipGround = false, ghosts = 0, shakeX = 0;
        if (inWin) {
            if (tr.mode === 'suck') {
                const k = easeIn(clamp01(u / 0.6)) * (1 - easeOut(clamp01((u - 0.78) / 0.22)));
                s = Math.max(0.04, 1 - 0.96 * k); rot = k * 9; alpha = 1 - 0.3 * k;
            } else if (tr.mode === 'press') {
                const k = easeIn(clamp01(u / (tr.downFrac || 0.22))) * (1 - easeOut(clamp01((u - (tr.holdTo || 0.7)) / 0.3)));
                dy = (tr.depth || 120) * k; clipGround = k > 0.02; sy = 1 - 0.08 * k; shakeX = Math.sin(t * 70) * 2 * k;
            } else if (tr.mode === 'echo') ghosts = 4;
            else if (tr.mode === 'drain') { alpha = 1 - 0.55 * bell(u); }
        }
        const draw = (img, a, comp, ox) => {
            ctx.save();
            if (clipGround) { ctx.beginPath(); ctx.rect(-20, 0, env.W + 40, feet + 4); ctx.clip(); }
            ctx.globalAlpha = a; if (comp) ctx.globalCompositeOperation = comp;
            ctx.translate(cx + (ox || 0) + shakeX, mid + dy); ctx.rotate(rot); ctx.scale(s, s * sy); ctx.translate(-cx, -mid);
            ctx.drawImage(img, 0, 0, env.W, env.H);
            ctx.restore();
        };
        for (let g = ghosts; g >= 1; g--) draw(env.focImg, 0.30 * bell(u) / g, 'lighter', Math.sin(u * TAU * 1.5 + g) * g * 15);
        draw(env.focImg, alpha, null, 0);
        if (clipGround) { ctx.save(); ctx.fillStyle = 'rgba(2,0,8,0.85)'; ctx.beginPath(); ctx.ellipse(cx, feet + 2, 56, 15, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        // hurt pulse (the cutout path skips focus-owned targets)
        const ht = env.time - (tr.hit !== undefined ? tr.hit : env.impact || 1.05);
        if (ht >= 0 && ht < 0.5 && !env.self) {
            if (!env._redFoc) {
                const cv = createCanvas(env.W, env.H), c = cv.getContext('2d');
                c.drawImage(env.focImg, 0, 0, env.W, env.H); c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#ff2222'; c.fillRect(0, 0, env.W, env.H);
                env._redFoc = cv;
            }
            const k = Math.min(1, bell(clamp01(ht / 0.15)) + 0.62 * bell(clamp01((ht - 0.2) / 0.17)));
            if (k > 0.01) draw(env._redFoc, 0.85 * k, 'lighter', 0);
        }
    };

    // ── vortex: real warp of the bg into a black hole ──────────────────────
    const _src = new WeakMap(), _oc = new Map();
    function srcPixels(env) {
        let o = _src.get(env.base);
        if (!o) { const cv = createCanvas(env.W, env.H), c = cv.getContext('2d'); c.drawImage(env.base, 0, 0, env.W, env.H); o = c.getImageData(0, 0, env.W, env.H); _src.set(env.base, o); }
        return o;
    }
    LAYERS.vortex = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.2;
        if (t < 0 || t > dur || !env.base) return;
        const u = t / dur;
        const s = easeOut(clamp01(u / (tr.inFrac || 0.45))) * (1 - easeIn(clamp01((u - (tr.outFrom || 0.82)) / (1 - (tr.outFrom || 0.82)))));
        if (s < 0.01) return;
        const W = env.W, Hh = env.H;
        const [cx, cy0] = pt(env, tr.pos || 'T', tr), cy = cy0 - (tr.hy === undefined ? 40 : tr.hy);
        const R = tr.R || 220;
        const x0 = Math.max(0, Math.floor(cx - R)), y0 = Math.max(0, Math.floor(cy - R)), x1 = Math.min(W, Math.ceil(cx + R)), y1 = Math.min(Hh, Math.ceil(cy + R));
        const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
        // 🔥 perf (R3, V8 profile: LAYERS.vortex ≈ 19% of a DRAGON_GOD render):
        // the warp is computed at HALF resolution and upscaled by drawImage —
        // 4x fewer atan2/pow pixel ops, and the bilinear upscale just softens
        // an already-swirling distortion. Full-res coords (+1 = sample centre)
        // keep the mapping identical, so output stays deterministic.
        const SS = 2;
        const w2 = Math.max(1, Math.ceil(w / SS)), h2 = Math.max(1, Math.ceil(h / SS));
        const key = w2 + 'x' + h2; let oc = _oc.get(key); if (!oc) { const cv = createCanvas(w2, h2); oc = { cv, c: cv.getContext('2d') }; _oc.set(key, oc); }
        const od = oc.c.createImageData(w2, h2), o = od.data, sd = srcPixels(env).data;
        const twist = (tr.twist || 5) * s, pull = (tr.pull || 2.4) * s, hr = (tr.hole || 18) * s;
        const rim = hexRgb(tr.rim || '#9d6bff');
        for (let y = 0; y < h2; y++) {
            for (let x = 0; x < w2; x++) {
                const px = x0 + x * SS + 1 - cx, py = y0 + y * SS + 1 - cy, r = Math.sqrt(px * px + py * py), i = (y * w2 + x) * 4;
                if (r >= R) { o[i + 3] = 0; continue; }
                if (r < hr) { o[i] = 2; o[i + 1] = 0; o[i + 2] = 6; o[i + 3] = 255; continue; }
                const n = r / R, th = Math.atan2(py, px) + twist * (1 - n) * (1 - n), rs = R * Math.pow(n, 1 / (1 + pull));
                const sx = Math.max(0, Math.min(W - 1, Math.round(cx + Math.cos(th) * rs))), sy = Math.max(0, Math.min(Hh - 1, Math.round(cy + Math.sin(th) * rs)));
                const j = (sy * W + sx) * 4, rr = sd[j], gg = sd[j + 1], bb = sd[j + 2];
                const dark = Math.pow(1 - n, 1.8) * 0.5 * s, glow = Math.max(0, 1 - (r - hr) / 26) * 0.9 * s;
                o[i] = Math.min(255, rr * (1 - dark) + rim[0] * glow); o[i + 1] = Math.min(255, gg * (1 - dark) + rim[1] * glow); o[i + 2] = Math.min(255, bb * (1 - dark) + rim[2] * glow); o[i + 3] = 255;
            }
        }
        oc.c.putImageData(od, 0, 0);
        ctx.drawImage(oc.cv, x0, y0, w, h);
        // accretion ring around the hole
        ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 2; k++) { ctx.save(); ctx.rotate(t * (2 + k) + k); ctx.scale(1, 0.42); ctx.globalAlpha = 0.65 * s; ctx.strokeStyle = k ? '#ffffff' : (tr.rim || '#9d6bff'); ctx.lineWidth = 4 - k; ctx.beginPath(); ctx.arc(0, 0, hr * (1.5 + k * 0.45) + 4, 0.2, 5.3); ctx.stroke(); ctx.restore(); }
        ctx.restore();
    };

    // ── bgfill: gradient replaces the bg (under pass) ──────────────────────
    LAYERS.bgfill = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1; if (t < 0 || t > dur) return;
        const a = (tr.a === undefined ? 1 : tr.a) * env3(t, dur, tr.fin || 0.3, tr.fout || 0.3);
        if (a < 0.01) return;
        const [cx, cy] = pt(env, tr.pos || [0.5, 0.5], tr);
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(env.W, env.H) * 0.8);
        g.addColorStop(0, (tr.colors || ['#bfe8ff', '#5aa8e0'])[0]); g.addColorStop(1, (tr.colors || ['#bfe8ff', '#5aa8e0'])[1]);
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(-80, -80, env.W + 160, env.H + 160); ctx.restore();
    };

    // ── invert ─────────────────────────────────────────────────────────────
    LAYERS.invert = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1; if (t < 0 || t > dur) return;
        const a = (tr.a === undefined ? 1 : tr.a) * env3(t, dur, tr.fin || 0.15, tr.fout || 0.25);
        if (a < 0.01) return;
        ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.fillRect(-80, -80, env.W + 160, env.H + 160); ctx.restore();
        if (env.casterCut && !env.self) { ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.4); ctx.drawImage(env.casterCut.img, env.casterCut.x, env.casterCut.y, env.casterCut.w, env.casterCut.h); ctx.restore(); }
    };

    // ── slashes: tapered cuts / radial bursts on the target ────────────────
    LAYERS.slashes = (ctx, tr, env) => {
        // 💡 REAL ART (owner 2026-10-27): polygon blades -> the claw sprite strip
        // (attack7, real asset) tinted to the class colour; burst fans real Kenney
        // p_slash singles. n/gap/life/angles/jitter contracts unchanged.
        const n = tr.n || 5, gap = tr.gap === undefined ? 0.07 : tr.gap, life = tr.life || 0.3;
        const [x, y] = pt(env, tr.pos || 'T', tr), cy0 = y - (tr.rise === undefined ? 55 : tr.rise);
        const col = tr.color || '#ffffff', mid = tr.mid || '#ffffff';
        for (let i = 0; i < n; i++) {
            const t = env.time - (tr.at + i * gap); if (t < 0 || t > life) continue;
            const rr = mulberry(hashS('sl' + i + tr.at + (tr.kind || '')));
            const u = t / life, fade = 1 - easeIn(clamp01((u - 0.35) / 0.65)), jit = tr.jit || [30, 36];
            if (tr.kind === 'burst') {
                const a = rr() * TAU, r0 = 8 + rr() * 16, L = (tr.len || 120) * (0.6 + rr() * 0.7) * easeOut(clamp01(u / 0.4));
                const mx = x + (rr() - 0.5) * jit[0], my = cy0 + (rr() - 0.5) * jit[1];
                const pick = env.spr('p_slash_0' + (1 + (i % 4)));
                if (pick) sprite(ctx, tintImg(pick, col, 0.35), mx + Math.cos(a) * r0 * 0.5, my + Math.sin(a) * r0 * 0.5, L * 1.25, a, fade, true);
                else {
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade; ctx.lineCap = 'round';
                    for (const [lw, c2] of [[8, col], [3, mid]]) { ctx.strokeStyle = c2; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0); ctx.lineTo(mx + Math.cos(a) * (r0 + L), my + Math.sin(a) * (r0 + L)); ctx.stroke(); }
                    ctx.restore();
                }
                if (i % 3 === 0) glowDot(ctx, mx, my, 46 * fade + 10, col, 0.55 * fade);
                continue;
            }
            const ang = tr.angles ? tr.angles[i % tr.angles.length] : (-0.95 + rr() * 1.9);
            const mx = x + (rr() - 0.5) * jit[0] * 2, my = cy0 + (rr() - 0.5) * jit[1] * 2;
            const L = (tr.len || 170) * (0.85 + rr() * 0.3);
            const cimg = setFr(env, 'claw', Math.floor((env.time - tr.at) * 14) + i);
            if (cimg) {
                sprite(ctx, tintImg(cimg, col, 0.45), mx, my, L * 1.15, ang, fade, true);
                if (u < 0.45) glowDot(ctx, mx, my, 26, col, 0.7 * (1 - u / 0.45));
                continue;
            }
            const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
            const head = lerp(-L, L, easeOut(clamp01(u / 0.3))), tail = u > 0.3 ? lerp(-L, L * 0.5, clamp01((u - 0.3) / 0.7)) : -L;
            if (head <= tail) continue;
            const w0 = (tr.w || 11) * (tr.kind === 'stab' ? 1.3 : 1);
            const poly = (ww) => { const N = 12, a = [], b = []; for (let k = 0; k <= N; k++) { const p = lerp(tail, head, k / N), f = (p + L) / (2 * L), hw = ww * Math.pow(Math.sin(Math.PI * clamp01(f)), 0.8); a.push([mx + dx * p + nx * hw, my + dy * p + ny * hw]); b.push([mx + dx * p - nx * hw, my + dy * p - ny * hw]); } return a.concat(b.reverse()); };
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (const [ww, c2, al] of [[w0, col, 0.55], [w0 * 0.6, mid, 0.85], [w0 * 0.25, '#ffffff', 1]]) {
                ctx.globalAlpha = al * fade; ctx.fillStyle = c2; const pl = poly(ww); ctx.beginPath(); pl.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
            if (u < 0.45) glowDot(ctx, mx + dx * head, my + dy * head, 26, col, 0.7 * (1 - u / 0.45));
        }
    };

    // ── swarm: items orbit the target, then dart THROUGH it ────────────────
    function drawProj(ctx, kind, x, y, ang, sz, col, t, i) {
        ctx.save(); ctx.translate(x, y);
        if (kind === 'coin') {
            const sq = Math.max(0.2, Math.abs(Math.cos(t * 16 + i))); ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#9a6a00'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, 0, sz * sq, sz, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff6b0'; ctx.fillRect(-1.5, -sz * 0.6, 3, sz * 0.5);
        } else if (kind === 'kunai') {
            ctx.rotate(ang); ctx.fillStyle = '#cfd6e6'; ctx.beginPath(); ctx.moveTo(sz * 1.6, 0); ctx.lineTo(-sz * 0.3, -sz * 0.5); ctx.lineTo(-sz * 0.3, sz * 0.5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#2a2236'; ctx.fillRect(-sz * 1.1, -sz * 0.14, sz * 0.8, sz * 0.28); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-sz * 1.3, 0, sz * 0.32, 0, TAU); ctx.stroke();
        } else if (kind === 'soul') {
            glowDot(ctx, 0, 0, sz * 2.2, col, 0.85); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; ctx.fillRect(-2, -3, 5, 6);
        } else if (kind === 'shard') {
            ctx.rotate(ang); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(sz * 1.4, 0); ctx.lineTo(0, -sz * 0.4); ctx.lineTo(-sz, 0); ctx.lineTo(0, sz * 0.4); ctx.closePath(); ctx.fill();
        } else if (kind === 'note') {
            ctx.rotate(-0.3); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, sz * 0.7, sz * 0.5, 0, 0, TAU); ctx.fill(); ctx.fillRect(sz * 0.5, -sz * 1.7, 2, sz * 1.7);
        }
        ctx.restore();
    }
    LAYERS.swarm = (ctx, tr, env) => {
        const n = tr.n || 12, kind = tr.kind || 'coin', dur = tr.dur || 1, pass = tr.pass || 0.26, orbit = tr.orbit || 0;
        const [x, y] = pt(env, tr.pos || 'T', tr), cy = y - (tr.rise === undefined ? 55 : tr.rise), col = tr.color || '#ffd24a', sz = tr.size || 9;
        const orbPos = (i, rr0, rr1, rr2, tt, k) => {
            const dirn = i % 2 ? 1 : -1, ang = rr0 * TAU + tt * (7 + k * 11) * dirn, rad = (tr.rad || 120) * (1 - 0.5 * k) * (0.7 + rr1 * 0.5);
            return [x + Math.cos(ang) * rad * 1.15, cy + Math.sin(ang) * rad * 0.55, ang + dirn * Math.PI / 2];
        };
        for (let i = 0; i < n; i++) {
            const rr = mulberry(hashS('sw' + i + tr.at + kind)), r0 = rr(), r1 = rr(), r2 = rr();
            const t = env.time - (tr.at + (i / n) * dur * 0.55); if (t < 0) continue;
            if (orbit && t < orbit) {
                const k = t / orbit;
                for (let j = 5; j >= 1; j--) { const tt = Math.max(0, t - j * 0.016), p = orbPos(i, r0, r1, r2, tt, tt / orbit); ctx.save(); ctx.globalAlpha = 0.5 * (1 - j / 6); drawProj(ctx, kind, p[0], p[1], p[2], sz * 0.8, col, tt, i); ctx.restore(); }
                const p = orbPos(i, r0, r1, r2, t, k); drawProj(ctx, kind, p[0], p[1], p[2], sz, col, t, i);
                continue;
            }
            const tt = t - orbit; if (tt > pass + 0.12) continue;
            let sx, sy;
            if (orbit) { const p = orbPos(i, r0, r1, r2, orbit, 1); sx = p[0]; sy = p[1]; }
            else { const a = r0 * TAU, R0 = tr.from || 330; sx = x + Math.cos(a) * R0; sy = cy + Math.sin(a) * R0 * 0.75; }
            const ex = tr.inward ? x : 2 * x - sx, ey = tr.inward ? cy : 2 * cy - sy;
            const u = clamp01(tt / pass), e = easeIn(u), px = lerp(sx, ex, e), py = lerp(sy, ey, e), ang = Math.atan2(ey - sy, ex - sx);
            if (tt <= pass) {
                for (let j = 4; j >= 1; j--) { const e2 = easeIn(clamp01(u - j * 0.06)); ctx.save(); ctx.globalAlpha = 0.5 * (1 - j / 5); drawProj(ctx, kind, lerp(sx, ex, e2), lerp(sy, ey, e2), ang, sz * 0.85, col, tt, i); ctx.restore(); }
                drawProj(ctx, kind, px, py, ang, sz, col, tt, i);
            }
            // cut flash when the item crosses the body
            const hu = tr.inward ? 1 : 0.5, hd = Math.abs(u - hu);
            if (hd < 0.1 || (tr.inward && tt >= pass && tt < pass + 0.12)) {
                const f = tr.inward ? 1 - (tt - pass) / 0.12 : 1 - hd / 0.1;
                if (f > 0) {
                    glowDot(ctx, x, cy, 34, col, 0.5 * f);
                    if (!tr.inward) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * 70, cy - Math.sin(ang) * 70); ctx.lineTo(x + Math.cos(ang) * 70, cy + Math.sin(ang) * 70); ctx.stroke(); ctx.restore(); }
                }
            }
        }
    };

    // ── scythe ─────────────────────────────────────────────────────────────
    // 💀 REAL SCYTHE (owner 2026-10-27: "The reapers syth should be a real syth ... I want
    // um to became tiny and a gaint syth hits"): when the recipe passes art:'scythe_art',
    // the pendulum swings the Wenrexa dark scythe sprite (CC0, purple-tinted) instead of
    // the procedural handle+blade. The sprite is drawn along the swing arm so the BLADE
    // leads the arc; the swoosh, glow and cut flash are unchanged. artRot aligns the
    // sprite's own blade direction with the arm (+x) — tuned on the Wenrexa sheet.
    LAYERS.scythe = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 0.9; if (t < 0 || t > dur) return;
        const u = t / dur, [x, y] = pt(env, tr.pos || 'T', tr), cy = y - (tr.rise === undefined ? 60 : tr.rise), R = tr.R || 250;
        const a0 = tr.a0 === undefined ? 0.25 : tr.a0, a1 = tr.a1 === undefined ? 2.9 : tr.a1;       // radians from +x, pendulum around the pivot
        const sw = easeIn(clamp01(u / 0.5)), ang = lerp(a0, a1, sw), fade = 1 - easeIn(clamp01((u - 0.6) / 0.4)), appear = easeOut(clamp01(u / 0.2));
        const Px = x - R * Math.cos((a0 + a1) / 2) * 0.0 + (tr.px || 0), Py = cy - R * 0.95;      // pivot above the target
        const Q = [Px + Math.cos(ang) * R, Py + Math.sin(ang) * R];
        const col = tr.color || '#a58bff', edge = tr.mid || '#efe6ff';
        // swoosh
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const [lw, c2, al] of [[34, col, 0.28], [12, edge, 0.6]]) { ctx.strokeStyle = c2; ctx.globalAlpha = al * fade * appear; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(Px, Py, R * 1.02, Math.min(a0, ang), Math.max(a0, ang)); ctx.stroke(); }
        ctx.restore();
        // the scythe itself
        const art = tr.art && env.sets && env.sets[tr.art] && env.sets[tr.art][0];
        ctx.save(); ctx.globalAlpha = fade * appear;
        if (art) {
            // real sprite: centered on the arm at 45% out, rotated to lead with the blade
            const armX = Px + Math.cos(ang) * R * 0.45, armY = Py + Math.sin(ang) * R * 0.45;
            const w = R * (tr.artW || 1.5);
            ctx.translate(armX, armY); ctx.rotate(ang + (tr.artRot === undefined ? Math.PI * 0.78 : tr.artRot));
            if (tr.tintArt !== false) {
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * appear * 0.5;
                ctx.drawImage(art, -w / 2, -w / 2, w, w); ctx.restore();
            }
            ctx.drawImage(art, -w / 2, -w / 2, w, w);
        } else {
            // procedural handle + blade (fallback when no art shipped)
            ctx.translate(Px, Py); ctx.rotate(ang);
            ctx.strokeStyle = '#150f24'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-R * 0.35, 0); ctx.lineTo(R, 0); ctx.stroke();
            ctx.strokeStyle = '#6b5a8f'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-R * 0.35, 0); ctx.lineTo(R, 0); ctx.stroke();
            const B = R * (tr.blade || 0.95); ctx.translate(R, 0);
            const blade = ctx.createLinearGradient(0, 0, 0, B); blade.addColorStop(0, edge); blade.addColorStop(1, col);
            ctx.fillStyle = blade; ctx.strokeStyle = '#150f24'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(B * 0.25, B * 0.9, -B * 0.75, B * 1.05); ctx.quadraticCurveTo(-B * 0.1, B * 0.55, -6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        glowDot(ctx, Q[0], Q[1], 60, col, 0.5 * fade);
        // the cut (when the blade passes the target)
        const passed = clamp01((ang - (a0 + a1) / 2) / ((a1 - a0) / 2) + 0.2);
        if (passed > 0 && u < 0.85) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - easeIn(clamp01((u - 0.5) / 0.35))); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 150 * passed, cy - 90 * passed); ctx.lineTo(x + 150 * passed, cy + 90 * passed); ctx.stroke(); ctx.restore(); }
    };

    // ── robohand: giant REAL mech fist slam (BrawlBot, OGA CC0) ─────────────
    // 💡 REAL ART (owner 2026-10-27): the blocky fillRect forearm/palm/fingers
    // are replaced by a segmented knuckle-plate fist sprite (robo_1, 273px,
    // teal seam glow) falling on the target. Fall/press/lift envelopes, the
    // ground-shadow warning and the cyan core glow are kept; motion-trail
    // ghosts add the weight the old blocks lacked.
    LAYERS.robohand = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.4; if (t < 0 || t > dur) return;
        const fall = tr.fall || 0.42, S = tr.s || 1.7, [x, y] = pt(env, tr.pos || 'T', tr);
        const rect = env.focRect || [x, y, 90, 130], topY = rect[1] - rect[3];
        const land = clamp01(t / fall), lift = easeOut(clamp01((t - (dur - 0.4)) / 0.4));
        const press = t >= fall ? 14 * Math.min(1, (t - fall) / 0.12) : 0;
        const glowC = tr.color || '#59e6ff';
        const fr = (env.sets && env.sets.robo_hand) || [];
        if (!fr.length) return;
        const img = fr[0];
        const w = 105 * S * 1.8, h = w * (img.height / img.width);
        // bottom edge lands on the target's head, presses 14px, lifts away
        const bottom = lerp(-h * 0.6, topY + 10, easeIn(land)) + press - lift * 560;
        const cy = bottom - h * 0.42;
        // ground shadow warning
        if (t < fall + 0.1) { ctx.save(); ctx.globalAlpha = 0.45 * easeOut(land); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, rect[1] + 2, 90 * S * 0.6 * (0.5 + land * 0.5), 20, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        // motion trail (weight)
        for (let g = 3; g >= 1; g--) {
            const gy2 = bottom - g * 46 * (1 - land * 0.5);
            ctx.save(); ctx.globalAlpha = 0.16 * (1 - g / 4) * (1 - land); ctx.drawImage(img, x - w / 2, gy2 - h * 0.42, w, h); ctx.restore();
        }
        sprite(ctx, img, x, cy, w, 0, 1, false);
        // power core + impact
        glowDot(ctx, x, cy, w * 0.30, glowC, 0.55);
        if (land >= 1 && lift < 0.9) {
            const ik = 1 - lift;
            glowDot(ctx, x, bottom, 90 * S * ik + 30, glowC, 0.85 * ik);
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * ik; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x - 120 * S * ik - 20, bottom - 6); ctx.lineTo(x + 120 * S * ik + 20, bottom - 6); ctx.stroke(); ctx.restore();
        }
    };

    // ── breath: stream of fire from a mouth ────────────────────────────────
    LAYERS.breath = (ctx, tr, env) => {
        const [sx, sy] = pt(env, tr.from || 'C', { off: tr.offFrom }), [tx, ty] = pt(env, tr.to || 'T', { off: tr.offTo, _pt: tr._pt });
        const dur = tr.dur || 0.9, n = tr.n || 90, life = tr.life || 0.5, w = tr.w || 70, sz = tr.size || 1;
        const dx = tx - sx, dy = ty - sy, Ld = Math.hypot(dx, dy) || 1, ux = dx / Ld, uy = dy / Ld, nx = -uy, ny = ux;
        const cols = tr.cols || ['#fff6c0', '#ffc030', '#ff6a10', '#b01808'];
        const mouth = env3(env.time - tr.at, dur + life, 0.1, 0.3);
        if (mouth > 0.02 && env.time - tr.at < dur) glowDot(ctx, sx, sy, 50 * sz, '#ffd070', 0.85 * mouth);
        for (let i = 0; i < n; i++) {
            const rr = mulberry(hashS('br' + i + tr.at)), t = env.time - (tr.at + (i / n) * dur); if (t < 0 || t > life) continue;
            const k = t / life, dist = easeOut(k) * Ld * (tr.reach || 1.08), spread = (rr() - 0.5) * 2 * (w * k + 4) + Math.sin(t * 18 + i) * 6 * k;
            const px = sx + ux * dist + nx * spread, py = sy + uy * dist + ny * spread, r = (9 + k * 30) * sz;
            const col = k < 0.22 ? cols[0] : k < 0.5 ? cols[1] : k < 0.78 ? cols[2] : cols[3], a = Math.pow(1 - k, 0.7) * 0.75;
            // 💡 REAL ART (owner 2026-10-27): cone particles ride real Fire-Wrath frames
            const fimg = setFr(env, 'fire_jet', Math.floor(t * 16 + i));
            if (fimg) sprite(ctx, fimg, px, py, r * 3.6, Math.atan2(uy, ux) + (k - 0.5) * 2.2 + (rr() - 0.5), a, true);
            else glowDot(ctx, px, py, r * 1.7, col, a);
            if (i % 3 === 0) sprite(ctx, env.spr('p_flame_03'), px, py, r * 3.2, Math.atan2(uy, ux) + Math.PI / 2 + (rr() - 0.5), a, true);
        }
    };

    // ── dragon: giant REAL dragon head (Dragon - Fully Animated, OGA CC0) ───
    // 💡 REAL ART (owner 2026-10-27, "dragon Sprites"): the procedural skull/jaw/
    // teeth/horns are replaced by a 6-frame jaw-open sequence from cethiel's CC0
    // pack (dragon_1..6, faces LEFT natively -> mirrored to face the target).
    // The frame index follows the same `open` envelope the old jaw used, so the
    // recipe contract (pos/s/dur/open) is unchanged. Envelope/bob/mouth glow kept.
    LAYERS.dragon = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.5; if (t < 0 || t > dur) return;
        const S = tr.s || 2.2, [x, y] = pt(env, tr.pos || [0.2, 0.42], tr), a = env3(t, dur, 0.35, 0.3);
        const open = tr.open === undefined ? easeOut(clamp01((t - 0.25) / 0.3)) : tr.open, bob = Math.sin(t * 5) * 3;
        // tr.set picks a variant set (DRAGON_LORD: 'dragon_head_inv' = color-inverted frames)
        const fr = (env.sets && env.sets[tr.set || 'dragon_head']) || [];
        if (!fr.length) return;
        const fi = Math.min(fr.length - 1, Math.max(0, Math.round(open * (fr.length - 1))));
        const img = fr[fi];
        const w = 235 * S, h = w * (img.height / img.width);
        const face = tr.face === 'left' ? 1 : -1;          // native art faces LEFT
        ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y - h * 0.28 + bob);
        // fire under-glow separates the head from the bg + keeps the class flame identity
        glowDot(ctx, face * w * 0.18, h * 0.10, w * 0.55, tr.flame || '#ff9a30', 0.25 * a);
        ctx.save(); ctx.scale(face, 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
        // ember spray from the jaws once they open (real fire frames drifting forward)
        const fj = (env.sets && env.sets.fire_jet) || [];
        if (open > 0.45 && fj.length) {
            ctx.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 4; k++) {
                const rr = mulberry(hashS('dg' + k + tr.at));
                const fk = (open - 0.45) / 0.55, dist = (0.25 + rr() * 0.4) * fk * w;
                const ex = face * (w * 0.30 + dist), ey = -h * 0.02 + (rr() - 0.5) * h * 0.16 * fk + fk * 26;
                sprite(ctx, fj[(k + Math.floor(t * 16)) % fj.length], ex, ey, w * (0.14 + rr() * 0.12), face * (0.5 + (rr() - 0.5)) + (rr() - 0.5) * 0.8, 0.8 * a * fk, true);
            }
        }
        ctx.restore();
    };

    // ── tether: chain of souls between caster and target ───────────────────
    LAYERS.tether = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.5; if (t < 0 || t > dur) return;
        const [x0, y0] = pt(env, 'C', { off: tr.offFrom || [10, -60] }), [x1, y1] = pt(env, 'T', { off: tr.offTo || [0, -60] });
        const col = tr.color || '#c43bff', reach = easeOut(clamp01(t / 0.3)), fade = 1 - easeIn(clamp01((t - dur + 0.3) / 0.3));
        const N = 26, pulse = 1 + 0.35 * Math.sin(t * 24);
        // 💡 REAL ART (owner 2026-10-27): the rect soul links are now real
        // Cosmic orb frames (fx library CC0) strung along the wobble curve,
        // purple-biased so the class colour still reads.
        const so = (env.sets && env.sets.soul_orb) || [];
        ctx.save(); ctx.globalAlpha = fade;
        for (let k = 0; k <= N * reach; k++) {
            const f = k / N, wob = Math.sin(f * 14 - t * 12) * 12 * Math.sin(Math.PI * f), px = lerp(x0, x1, f), py = lerp(y0, y1, f) + wob - Math.sin(Math.PI * f) * 26;
            if (so.length) {
                const simg = so[(k * 3 + Math.floor(t * 12)) % so.length];
                glowDot(ctx, px, py, 20, col, 0.30 * fade);
                sprite(ctx, tintImg(simg, col, 0.4), px, py, 30, f * 9 + t * 2, 0.85, true);
            } else {
                ctx.save(); ctx.translate(px, py); ctx.rotate(f * 9 + t * 2); ctx.fillStyle = '#17061f'; ctx.fillRect(-9, -5, 18, 10); ctx.fillStyle = k % 2 ? col : '#7d1fb0'; ctx.fillRect(-7, -3, 14, 6); ctx.restore();
            }
        }
        ctx.restore();
        glowDot(ctx, x1, y1, 50 * pulse, col, 0.7 * fade * reach); glowDot(ctx, x0, y0, 36 * pulse, col, 0.6 * fade);
        // souls streaming T -> C along the chain
        for (let i = 0; i < 10; i++) { const f = 1 - (((t * 0.9 + i / 10) % 1)); const wob = Math.sin(f * 14 - t * 12) * 12 * Math.sin(Math.PI * f); const px = lerp(x0, x1, f), py = lerp(y0, y1, f) + wob - Math.sin(Math.PI * f) * 26; if (f > reach) continue; glowDot(ctx, px, py, 16, '#e9c8ff', 0.8 * fade); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(px) - 2, Math.round(py) - 3, 4, 6); ctx.restore(); }
    };

    // ── soulflow: a soul leaves the target and enters the caster ───────────
    LAYERS.soulflow = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.0; if (t < 0 || t > dur + 0.8) return;
        const [x0, y0] = pt(env, 'T', { off: tr.offFrom || [0, -70] }), [x1, y1] = pt(env, 'C', { off: tr.offTo || [0, -70] });
        const col = tr.color || '#8dff9c', cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 120;
        const bez = (f) => [(1 - f) * (1 - f) * x0 + 2 * (1 - f) * f * cx + f * f * x1, (1 - f) * (1 - f) * y0 + 2 * (1 - f) * f * cy + f * f * y1];
        const u = clamp01(t / dur);
        // 💡 REAL ART (owner 2026-10-27): the traveling soul is a real Cosmic
        // orb frame (fx library CC0) flickering along the bezier arc.
        const so = (env.sets && env.sets.soul_orb) || [];
        if (t < dur) {
            // soul tears out of the target
            if (u < 0.25) { glowDot(ctx, x0, y0, 70 * bell(u / 0.25) + 20, col, 0.7); }
            for (let j = 14; j >= 0; j--) { const f = easeIn(clamp01(u - j * 0.022)); const p = bez(f); glowDot(ctx, p[0], p[1], 26 - j * 1.4, j < 2 ? '#ffffff' : col, 0.8 * (1 - j / 16)); }
            const p = bez(easeIn(u));
            if (so.length) sprite(ctx, so[(Math.floor(t * 14)) % so.length], p[0], p[1], 44, t * 3, 0.95, true);
            else { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(p[0]) - 3, Math.round(p[1]) - 5, 7, 10); ctx.restore(); }
        } else {
            const a = t - dur;
            if (a < 0.5) {
                glowDot(ctx, x1, y1, 120 * easeOut(a / 0.5), col, 0.8 * (1 - a / 0.5));
                for (let k = 0; k < 6; k++) { const px = x1 - 50 + k * 20, py = y1 - 30 - a * 90 - (k % 2) * 18; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - a / 0.5; ctx.fillStyle = col; ctx.fillRect(px - 2, py - 8, 4, 16); ctx.fillRect(px - 8, py - 2, 16, 4); ctx.restore(); }
            }
        }
    };

    // ── elements: four orbs orbit, then fuse and detonate ──────────────────
    LAYERS.elements = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.0; if (t < 0 || t > dur) return;
        const cols = tr.colors || ['#ff6a1a', '#59d2ff', '#ffe84a', '#8a6a3a'], u = t / dur;
        const [tx, ty] = pt(env, tr.pos || 'T', tr), fx = tx, fy = ty - (tr.fuseUp || 120), [cx, cy] = pt(env, 'C', { off: [0, -90] });
        const ph1 = clamp01(u / 0.4), ph2 = clamp01((u - 0.4) / 0.6);
        const S = tr.s || 1;
        // 💡 REAL ART (owner 2026-10-27): each orb is a real elemental sprite
        // (Fire-Wrath / Water / LightEffect / Earth-Impact, fx library CC0)
        const orbSets = [env.sets && env.sets.elem_fire, env.sets && env.sets.elem_water, env.sets && env.sets.elem_light, env.sets && env.sets.elem_earth];
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + u * 9 * (1 - ph2 * 0.5);
            const orbR = lerp(60, 14, easeIn(ph2)) * S, base = [lerp(cx, fx, easeInOut(ph2)), lerp(cy, fy, easeInOut(ph2))];
            const px = base[0] + Math.cos(a) * orbR, py = base[1] + Math.sin(a) * orbR * 0.7, r = (14 + 10 * ph1) * S * (1 - 0.3 * ph2);
            const oimg = orbSets[i] && orbSets[i].length ? orbSets[i][(i * 3 + Math.floor(t * 12)) % orbSets[i].length] : null;
            for (let j = 6; j >= 1; j--) { const a2 = a - j * 0.18; glowDot(ctx, base[0] + Math.cos(a2) * orbR, base[1] + Math.sin(a2) * orbR * 0.7, r * (1 - j / 8), cols[i], 0.35); }
            if (oimg) sprite(ctx, oimg, px, py, r * 3.4, t * 2 + i, 0.95, true);
            else { glowDot(ctx, px, py, r * 2, cols[i], 0.9); glowDot(ctx, px, py, r * 0.9, '#ffffff', 0.9); }
        }
        if (ph2 > 0.6) { const k = (ph2 - 0.6) / 0.4, rr = (18 + 70 * k) * S; glowDot(ctx, fx, fy, rr * 2.2, '#ffffff', 0.6 * k); glowDot(ctx, fx, fy, rr, '#ffffff', 0.95); }
    };
    function easeInOut(v) { v = clamp01(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; }

    // ── reticle: tech targeting ────────────────────────────────────────────
    LAYERS.reticle = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1; if (t < 0 || t > dur) return;
        const [x, y] = pt(env, tr.pos || 'T', tr), cy = y - 55, u = t / dur, col = tr.color || '#ff3a3a';
        const lock = easeOut(clamp01(u / 0.7)), r = lerp(150, 46, lock), fade = 1 - easeIn(clamp01((u - 0.85) / 0.15));
        ctx.save(); ctx.translate(x, cy); ctx.globalAlpha = fade; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.save(); ctx.rotate(t * 2.6 * (1 - lock * 0.8)); ctx.beginPath(); ctx.arc(0, 0, r, 0.3, 2.5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r, 3.4, 5.6); ctx.stroke(); ctx.restore();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.stroke();
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14)); ctx.lineTo(Math.cos(a) * (r * 0.3), Math.sin(a) * (r * 0.3)); ctx.stroke(); }
        if (lock > 0.9 && Math.floor(t * 14) % 2 === 0) { ctx.fillStyle = col; ctx.globalAlpha = fade * 0.5; ctx.fillRect(-r, -r, r * 2, r * 2); }
        ctx.restore();
        // scan line
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 * fade; ctx.fillStyle = col; const sy = cy - 90 + ((t * 260) % 180); ctx.fillRect(x - 70, sy, 140, 2); ctx.restore();
    };

    // ── staff: music staff + equaliser (Virtuoso) ──────────────────────────
    LAYERS.staff = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.5; if (t < 0 || t > dur) return;
        const a = env3(t, dur, 0.3, 0.4), col = tr.color || '#d9b3ff', col2 = tr.color2 || '#ff9ad5';
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * a; ctx.lineWidth = 2;
        for (let l = 0; l < 5; l++) {
            ctx.strokeStyle = l % 2 ? col : col2; ctx.beginPath();
            for (let xx = -20; xx <= env.W + 20; xx += 10) { const yy = env.H * 0.28 + l * 16 + Math.sin(xx * 0.02 + t * 5 + l * 0.6) * 10 * a; xx === -20 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy); }
            ctx.stroke();
        }
        for (let i = 0; i < 28; i++) { const bh = (0.2 + 0.8 * Math.abs(Math.sin(t * 7 + i * 1.7))) * 90 * a; ctx.fillStyle = i % 2 ? col : col2; ctx.globalAlpha = 0.45 * a; ctx.fillRect(i * (env.W / 28) + 3, env.H - bh, env.W / 28 - 6, bh); }
        ctx.restore();
        // 💡 REAL ART (owner 2026-10-27): floating notes are real music-note frames
        const mn = (env.sets && env.sets.music_note) || [];
        for (let i = 0; i < 10; i++) { const rr = mulberry(hashS('stf' + i)), sp = 80 + rr() * 90, xx = ((rr() * env.W + t * sp) % (env.W + 60)) - 30, l = Math.floor(rr() * 5); const yy = env.H * 0.28 + l * 16 + Math.sin(xx * 0.02 + t * 5 + l * 0.6) * 10 * a; if (mn.length) { sprite(ctx, mn[(i + Math.floor(t * 8)) % mn.length], xx, yy, 30, -0.25, a, true); continue; } ctx.save(); ctx.globalAlpha = a; ctx.translate(xx, yy); ctx.rotate(-0.3); ctx.fillStyle = i % 2 ? col : col2; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, TAU); ctx.fill(); ctx.fillRect(7, -22, 2, 22); ctx.restore(); }
    };

    // ── ripple: contracting (rewind) or expanding rings ────────────────────
    LAYERS.ripple = (ctx, tr, env) => {
        const [x, y] = pt(env, tr.pos || 'T', tr), n = tr.n || 4;
        for (let i = 0; i < n; i++) {
            const t = env.time - tr.at - i * (tr.gap || 0.12), life = tr.dur || 0.7; if (t < 0 || t > life) continue;
            const u = t / life, r = (tr.r || 200) * (tr.inward ? 1 - easeOut(u) : easeOut(u)), ratio = tr.ratio === undefined ? 0.5 : tr.ratio;
            ctx.save(); ctx.translate(x, y - (tr.rise || 50)); ctx.scale(1, ratio); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (tr.inward ? Math.sin(Math.PI * u) : 1 - u) * 0.85; ctx.strokeStyle = tr.color || '#ffe27a'; ctx.lineWidth = (tr.lw || 8) / Math.max(0.5, ratio);
            ctx.setLineDash(tr.dash ? [18, 12] : []); ctx.beginPath(); ctx.arc(0, 0, Math.max(1, r), 0, TAU); ctx.stroke(); ctx.restore();
        }
    };

    // ── eclipse: dark moon with a corona behind the target ─────────────────
    LAYERS.eclipse = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 1.2; if (t < 0 || t > dur) return;
        const a = env3(t, dur, 0.3, 0.3), [x, y] = pt(env, tr.pos || 'T', tr), cy = y - (tr.rise === undefined ? 110 : tr.rise), R = (tr.r || 90) * (0.8 + 0.2 * a);
        glowDot(ctx, x, cy, R * 2.6, tr.color || '#9fd0ff', 0.7 * a);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = tr.mid || '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, cy, R * 1.04, 0, TAU); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.fill(); ctx.restore();
    };

    // ── lunge: the caster dashes to the target and snaps back, with motion blur ──
    // Uses the caster's REAL cutout (the renderer hides the caster in the base while this runs):
    // sub-frame ghost samples along the path = motion blur, plus speed streaks.
    LAYERS.lunge = (ctx, tr, env) => {
        const c = env.casterCut; if (!c || env.self) return;
        const t = env.time - tr.at, dur = tr.dur || 0.55; if (t < 0 || t > dur) return;
        const hitX = env.A.T[0] - (tr.gap || 95), hitY = env.A.T[1];
        const cx0 = c.x + c.w / 2, feet0 = c.y + c.h;
        const dx = hitX - cx0, dy = hitY - feet0;
        const prof = (tt) => { const u = clamp01(tt / dur); return u < 0.42 ? easeIn(u / 0.42) : u < 0.6 ? 1 : 1 - easeOut((u - 0.6) / 0.4) * 1; };
        const SAMPLES = 9, span = 0.05;   // blur length in seconds
        const speed = Math.abs(prof(t) - prof(t - 0.03));
        const blur = Math.min(1, speed * 9);
        for (let k = SAMPLES; k >= 0; k--) {
            const tt = Math.max(0, t - (k / SAMPLES) * span * (0.3 + blur)), p = prof(tt);
            const a = k === 0 ? 1 : (1 - k / (SAMPLES + 1)) * 0.38 * (0.25 + blur);
            if (a <= 0.01) continue;
            ctx.save(); ctx.globalAlpha = a;
            ctx.drawImage(c.img, c.x + dx * p, c.y + dy * p, c.w * (1 + 0.25 * blur * (k ? 1 : 0.3)), c.h);
            if (k && tr.color) { ctx.globalCompositeOperation = 'source-atop'; }
            ctx.restore();
        }
        // streaks while moving fast
        if (blur > 0.25) {
            const p = prof(t); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = tr.color || '#ffffff'; ctx.lineCap = 'round';
            for (let i = 0; i < 7; i++) { const yy = feet0 + dy * p - c.h * (0.15 + i * 0.12), xx = cx0 + dx * p, dir = (t / dur) < 0.5 ? -1 : -1; ctx.globalAlpha = 0.5 * blur; ctx.lineWidth = 2 + (i % 3); ctx.beginPath(); ctx.moveTo(xx + dir * 20, yy); ctx.lineTo(xx + dir * (70 + i * 14) * blur, yy + (i % 2 ? 3 : -3)); ctx.stroke(); }
            ctx.restore();
        }
    };

    // ── camera: marker track read by the renderer (zoom delta) ─────────────
    LAYERS.camera = () => { };
    LAYERS.hidecaster = () => { };
};
