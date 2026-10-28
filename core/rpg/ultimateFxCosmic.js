'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  COSMIC WORLD-SHIFT layers (owner 2026-10-28: "skills need WEIGHT - zoom out
//  so fast it blurs, see a planet, an asteroid hits it, the screen flashes and
//  the arena becomes a lava world... kage zooms out into the void world with 3D
//  black silhouettes throwing attacks from every direction").
//
//    cosmic - OVER pass. Opaque cinematic: the live frame zoom-blurs OUT into
//             space; (planet:true) a planet + asteroid -> impact -> we dive into
//             the planet; (planet:false) a warp tunnel into another dimension.
//             Ends by fading onto the new world.
//    world  - UNDER pass (drawn over the bg, behind the fighters). Procedural
//             replacement battlefield: lava / void / ice / storm / gold / blood.
//             tr.sil = true adds the black 3D silhouettes that throw things at
//             the target (Kage).
//  Both are pure functions of env.time (deterministic). Unknown layers stay LIVE
//  in the plate cache, so no cache wiring needed.
// ═══════════════════════════════════════════════════════════════════════════
const { createCanvas } = require('canvas');

module.exports = function install(LAYERS, H) {
    const { pt, glowDot, mulberry, hashS, clamp01, easeOut, easeIn } = H;
    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;

    const WORLDS = {
        lava:  { sky: ['#140303', '#7a1a06'], ground: ['#3a0c04', '#100202'], glow: '#ff6a1a', hot: '#ffd27a', planet: ['#3a1006', '#ff5a14'], ember: '#ffb050' },
        void:  { sky: ['#020006', '#1a0a30'], ground: ['#080212', '#000000'], glow: '#7a3cff', hot: '#e6d4ff', planet: ['#0e0620', '#7a3cff'], ember: '#b890ff' },
        ice:   { sky: ['#0a1e3a', '#5f9fd4'], ground: ['#bcdcf2', '#6c9cc6'], glow: '#8fe0ff', hot: '#ffffff', planet: ['#4a80b0', '#e8fbff'], ember: '#e8fbff' },
        storm: { sky: ['#080b18', '#34426e'], ground: ['#161c30', '#06080f'], glow: '#ffe070', hot: '#ffffff', planet: ['#20305a', '#ffe070'], ember: '#ffe9a0' },
        gold:  { sky: ['#241602', '#b8862a'], ground: ['#5a3e0e', '#1e1403'], glow: '#fff0a0', hot: '#ffffff', planet: ['#7a5a14', '#fff0a0'], ember: '#fff0a0' },
        arcane:    { sky: ['#04041a', '#2a1a70'], ground: ['#120a38', '#04020e'], glow: '#9fb8ff', hot: '#ffffff', planet: ['#1a1050', '#9fb8ff'], ember: '#cfe0ff' },
        clockwork: { sky: ['#140c02', '#6a4a10'], ground: ['#3a2808', '#120c02'], glow: '#ffd98a', hot: '#fff1c4', planet: ['#5a3e0e', '#ffd98a'], ember: '#ffe9a8' },
        sky:       { sky: ['#4aa0e8', '#d8f0ff'], ground: ['#e8f4ff', '#a8c8e8'], glow: '#ffffff', hot: '#ffffff', planet: ['#4aa0e8', '#ffffff'], ember: '#ffffff' },
        graveyard: { sky: ['#10020a', '#4a0a14'], ground: ['#1a0a10', '#06020a'], glow: '#9ff0c8', hot: '#e8fff4', planet: ['#2a0a14', '#9ff0c8'], ember: '#9ff0c8' },
        factory:   { sky: ['#06182a', '#1c4a6e'], ground: ['#26323e', '#0a1016'], glow: '#ffb24a', hot: '#ffe0a0', planet: ['#26323e', '#ffb24a'], ember: '#ffb24a' },
        stage:     { sky: ['#1a0408', '#5a0a1c'], ground: ['#4a2a0c', '#120802'], glow: '#fff1b0', hot: '#ffffff', planet: ['#5a0a1c', '#fff1b0'], ember: '#fff1b0' },
        spirit:    { sky: ['#020c10', '#0e4048'], ground: ['#06242a', '#020a0c'], glow: '#7af0d0', hot: '#e8fff8', planet: ['#06242a', '#7af0d0'], ember: '#7af0d0' },
        hell:      { sky: ['#0e0002', '#5a0612'], ground: ['#2a0408', '#0a0002'], glow: '#ff3a2a', hot: '#ffb0a0', planet: ['#2a0408', '#ff3a2a'], ember: '#ff7a4a' },
        blood: { sky: ['#160208', '#620a1a'], ground: ['#260410', '#0a0104'], glow: '#ff2a40', hot: '#ffb0b8', planet: ['#340810', '#ff2a40'], ember: '#ff6a7a' },
    };
    const W_OF = (k) => WORLDS[k] || WORLDS.lava;

    // ── starfield (shared by the space phase) ───────────────────────────────
    function stars(ctx, W, Hh, t, streak, seed) {
        const rr = mulberry(hashS('stars' + seed));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 150; i++) {
            const a = rr() * TAU, d = 0.05 + rr() * 0.75, tw = 0.5 + 0.5 * Math.sin(t * (2 + rr() * 3) + i);
            const x = W / 2 + Math.cos(a) * d * W * 0.9, y = Hh / 2 + Math.sin(a) * d * Hh * 0.9;
            ctx.strokeStyle = `rgba(255,255,255,${(0.25 + 0.6 * tw).toFixed(3)})`;
            ctx.lineWidth = 1 + rr() * 1.4;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (1 + streak * d * 120), y + Math.sin(a) * (1 + streak * d * 120)); ctx.stroke();
        }
        ctx.restore();
    }

    function drawPlanet(ctx, cx, cy, R, wd, hot) {
        ctx.save();
        // atmosphere
        const ag = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
        ag.addColorStop(0, wd.glow + '66'); ag.addColorStop(1, wd.glow + '00');
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, TAU); ctx.fill();
        // body, lit from the upper-left
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
        const g = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
        g.addColorStop(0, wd.planet[1]); g.addColorStop(0.45, wd.planet[0]); g.addColorStop(1, '#000000');
        ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        // surface bands / continents
        const rr = mulberry(hashS('planet' + wd.glow));
        ctx.globalAlpha = 0.35;
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = i % 2 ? '#000000' : wd.planet[1];
            ctx.beginPath(); ctx.ellipse(cx + (rr() - 0.5) * R, cy + (rr() - 0.5) * R * 1.4, R * (0.25 + rr() * 0.5), R * (0.05 + rr() * 0.12), (rr() - 0.5) * 0.9, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // terminator shadow
        const sh = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        sh.addColorStop(0.35, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.78)');
        ctx.fillStyle = sh; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        if (hot > 0) { // the planet lights up from the inside after the hit
            const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
            hg.addColorStop(0, wd.hot); hg.addColorStop(0.5, wd.glow); hg.addColorStop(1, wd.planet[0]);
            ctx.globalAlpha = clamp01(hot); ctx.fillStyle = hg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        }
        ctx.restore();
    }

    function drawAsteroid(ctx, x, y, r, ang, wd, trail) {
        // fire trail first (behind)
        for (let i = 0; i < trail.n; i++) {
            const k = i / trail.n;
            glowDot(ctx, x - trail.dx * k * trail.len, y - trail.dy * k * trail.len, r * (1.5 - k) + 6, k < 0.4 ? '#ffd27a' : '#ff7a1a', 0.55 * (1 - k));
        }
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        const rr = mulberry(hashS('ast'));
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, rad = r * (0.72 + rr() * 0.4); i ? ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath();
        const g = ctx.createRadialGradient(r * 0.3, -r * 0.3, 1, 0, 0, r * 1.1);
        g.addColorStop(0, '#d8b898'); g.addColorStop(0.5, '#6a4a38'); g.addColorStop(1, '#1c120e');
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,170,70,0.9)'; ctx.stroke();   // heated rim
        ctx.restore();
        glowDot(ctx, x, y, r * 2.2, '#ff9a3a', 0.35);
    }

    // ── cosmic: the cinematic jump ──────────────────────────────────────────
    LAYERS.cosmic = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 2.0;
        if (t < 0 || t > dur) return;
        const W = ctx.canvas.width, Hh = ctx.canvas.height, wd = W_OF(tr.world), planet = tr.planet !== false;
        const T1 = 0.42, T2 = planet ? 1.2 : 0.85, ZIN = 0.5, T3 = T2 + ZIN;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (t < T1) {                         // 1) the world rushes away: layered zoom-out ghosts = motion blur
            const p = easeIn(t / T1);
            let sc = env._cosSc; if (!sc || sc.width !== W || sc.height !== Hh) sc = env._cosSc = createCanvas(W, Hh);
            const sx = sc.getContext('2d'); sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, W, Hh); sx.drawImage(ctx.canvas, 0, 0);
            ctx.globalAlpha = p; ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, Hh);
            for (let i = 6; i >= 0; i--) {
                const k = i / 6, s = lerp(1, 0.1, p) * (1 + k * 0.7 * p);
                ctx.globalAlpha = (i === 0 ? 1 : 0.32 * (1 - k)) * (1 - p * 0.55);
                ctx.drawImage(sc, W / 2 - W * s / 2, Hh / 2 - Hh * s / 2, W * s, Hh * s);
            }
            ctx.globalAlpha = 1; stars(ctx, W, Hh, t, 6 * p, tr.world);
            ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (let i = 0; i < 44; i++) {        // speed lines
                const a = (i / 44) * TAU + hashS('sp' + i) % 7, r0 = Hh * (0.12 + 0.2 * (1 - p)), r1 = r0 + p * Hh * 0.7;
                ctx.strokeStyle = `rgba(255,255,255,${(0.5 * p).toFixed(3)})`; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, Hh / 2 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * r1, Hh / 2 + Math.sin(a) * r1); ctx.stroke();
            }
            ctx.restore(); return;
        }

        const u = clamp01((t - T1) / (T2 - T1));          // 0..1 through the approach
        const pcx = W * 0.56, pcy = Hh * 0.5, hit = t >= T2, th = t - T2;
        // space + zoom-in dive after the hit
        const z = hit ? 1 + 7 * easeIn(clamp01((th - 0.1) / (ZIN - 0.1))) : 1;
        ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, Hh);
        ctx.save();
        ctx.translate(pcx, pcy); ctx.scale(z, z); ctx.translate(-pcx, -pcy);
        const neb = ctx.createRadialGradient(W * 0.3, Hh * 0.3, 10, W * 0.3, Hh * 0.3, W * 0.6);
        neb.addColorStop(0, wd.glow + '33'); neb.addColorStop(1, wd.glow + '00'); ctx.fillStyle = neb; ctx.fillRect(0, 0, W, Hh);
        stars(ctx, W, Hh, t, Math.max(0, 1 - (t - T1) / 0.3) * 5, tr.world);

        if (planet) {
            const R = lerp(Hh * 0.13, Hh * 0.3, easeOut(u));
            const impX = pcx - R * 0.3, impY = pcy - R * 0.1;
            drawPlanet(ctx, pcx, pcy, R, wd, hit ? easeOut(clamp01(th / 0.5)) : 0);
            if (!hit) {                      // asteroid screams in from the top-left
                const q = easeIn(clamp01((u - 0.12) / 0.88));
                const sx = W * 0.02, sy = Hh * 0.02, ax = lerp(sx, impX, q), ay = lerp(sy, impY, q);
                const dx = impX - sx, dy = impY - sy, dl = Math.hypot(dx, dy);
                drawAsteroid(ctx, ax, ay, lerp(8, 34, q), t * 3, wd, { n: 16, dx: dx / dl, dy: dy / dl, len: lerp(30, 190, q) });
            } else {                         // impact: shockwave, cracks, debris
                const sw = easeOut(clamp01(th / 0.5));
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = wd.hot; ctx.globalAlpha = 1 - sw; ctx.lineWidth = 6 * (1 - sw) + 1;
                ctx.beginPath(); ctx.arc(impX, impY, R * 0.1 + sw * R * 2.2, 0, TAU); ctx.stroke();
                const rr = mulberry(hashS('imp' + tr.world));
                ctx.globalAlpha = 1; ctx.lineCap = 'round';
                for (let i = 0; i < 16; i++) {
                    const a = rr() * TAU, L = R * (0.4 + rr() * 0.9) * easeOut(clamp01(th / 0.3));
                    ctx.strokeStyle = wd.hot; ctx.lineWidth = 2 + rr() * 2;
                    ctx.beginPath(); ctx.moveTo(impX, impY); ctx.lineTo(impX + Math.cos(a) * L, impY + Math.sin(a) * L * 0.8); ctx.stroke();
                }
                for (let i = 0; i < 26; i++) {
                    const a = rr() * TAU, d = easeOut(clamp01(th / 0.8)) * R * (0.6 + rr() * 2.2);
                    glowDot(ctx, impX + Math.cos(a) * d, impY + Math.sin(a) * d, 5 + rr() * 8, i % 2 ? wd.glow : '#ffd27a', 0.8 * (1 - clamp01(th / 0.9)));
                }
                ctx.restore();
            }
        } else {                             // warp tunnel into the other dimension
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            const run = (t - T1) * 1.8;
            for (let i = 0; i < 70; i++) {
                const a = (i / 70) * TAU, ph = (run * (0.8 + (i % 5) * 0.25) + i * 0.137) % 1;
                const r0 = Hh * 0.05 + ph * ph * Hh * 0.9, r1 = r0 + 14 + ph * Hh * 0.3;
                ctx.strokeStyle = (i % 3 ? wd.glow : wd.hot) + 'cc'; ctx.lineWidth = 1 + ph * 3;
                ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, Hh / 2 + Math.sin(a) * r0 * 0.9); ctx.lineTo(W / 2 + Math.cos(a) * r1, Hh / 2 + Math.sin(a) * r1 * 0.9); ctx.stroke();
            }
            glowDot(ctx, W / 2, Hh / 2, 40 + u * 220, wd.hot, 0.35 + 0.5 * u);
            ctx.restore();
        }
        ctx.restore();

        // impact flash (planet) / portal flash (tunnel)
        const fl = planet ? (hit ? 1 - easeOut(clamp01(th / 0.3)) : 0) : clamp01((t - (T2 - 0.1)) / 0.1) * (1 - easeOut(clamp01((t - T2) / 0.3)));
        if (fl > 0.01) { ctx.globalAlpha = fl; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, Hh); ctx.globalAlpha = 1; }

        // 4) dissolve onto the new world (the `world` layer is already painting underneath)
        if (t > T3 - 0.05) {
            const fo = 1 - easeOut(clamp01((t - (T3 - 0.05)) / Math.max(0.1, dur - T3 + 0.05)));
            const g = ctx.createRadialGradient(W / 2, Hh / 2, 20, W / 2, Hh / 2, Math.max(W, Hh) * 0.75);
            g.addColorStop(0, wd.hot); g.addColorStop(0.5, wd.glow); g.addColorStop(1, wd.planet[0]);
            ctx.globalAlpha = fo; ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh); ctx.globalAlpha = 1;
        }
        ctx.restore();
    };

    require('./ultimateFxCinema')(LAYERS, H, W_OF, stars);   // bespoke per-class intro sequences

    // ── 3D silhouettes (Kage's void world) ──────────────────────────────────
    function figure(ctx, x, y, h, dir, ph, wd, t, i) {
        const sway = Math.sin(t * 1.3 + i) * 0.02 * h;
        // arm angle: wind-up back, whip forward, follow through
        const wind = ph < 0.5 ? lerp(0.2, -2.3, easeOut(ph / 0.5)) : (ph < 0.62 ? lerp(-2.3, 0.7, easeIn((ph - 0.5) / 0.12)) : 0.7);
        const body = (col, ox, oy) => {
            ctx.save(); ctx.translate(x + ox, y + oy); ctx.scale(dir, 1);
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const lw = h * 0.085;
            ctx.lineWidth = lw;
            // legs (wide throwing stance)
            ctx.beginPath(); ctx.moveTo(-h * 0.03, -h * 0.5); ctx.lineTo(-h * 0.2, -h * 0.26 + sway); ctx.lineTo(-h * 0.26, 0);
            ctx.moveTo(h * 0.03, -h * 0.5); ctx.lineTo(h * 0.2, -h * 0.25); ctx.lineTo(h * 0.3, 0); ctx.stroke();
            // torso
            ctx.beginPath(); ctx.moveTo(-h * 0.11, -h * 0.84 + sway); ctx.lineTo(h * 0.11, -h * 0.84 + sway); ctx.lineTo(h * 0.07, -h * 0.5); ctx.lineTo(-h * 0.07, -h * 0.5); ctx.closePath(); ctx.fill();
            // head + hood tail
            ctx.beginPath(); ctx.arc(0, -h * 0.95 + sway, h * 0.085, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-h * 0.05, -h * 0.97 + sway); ctx.lineTo(-h * 0.22 - Math.sin(t * 3 + i) * h * 0.02, -h * 0.88 + sway); ctx.lineTo(-h * 0.04, -h * 0.9 + sway); ctx.fill();
            // back arm (counter-balance)
            ctx.beginPath(); ctx.moveTo(-h * 0.08, -h * 0.82 + sway); ctx.lineTo(-h * 0.2, -h * 0.66); ctx.lineTo(-h * 0.1, -h * 0.55); ctx.stroke();
            // throwing arm
            const sx = h * 0.08, sy = -h * 0.82 + sway, ex = sx + Math.cos(wind) * h * 0.22, ey = sy + Math.sin(wind) * h * 0.22;
            const fx = ex + Math.cos(wind + 0.5) * h * 0.2, fy = ey + Math.sin(wind + 0.5) * h * 0.2;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
            ctx.restore();
            return [x + ox + dir * fx, y + oy + fy];
        };
        // ground shadow
        ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y + 2, h * 0.35, h * 0.07, 0, 0, TAU); ctx.fill(); ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85; body(wd.glow, -dir * 3, -2); ctx.restore();   // rim light from the arena centre
        const hand = body('#000000', 0, 0);
        // eyes
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowDot(ctx, x + dir * h * 0.045, y - h * 0.955 + sway, h * 0.05, wd.hot, 0.95); ctx.restore();
        return hand;
    }

    // ── backdrop: a downloaded sprite set / image sequence painted full-screen (manifest swap target) ──
    LAYERS.backdrop = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 2;
        if (t < 0 || t > dur) return;
        const fr = env.sets && env.sets[tr.fx]; if (!fr || !fr.length) return;
        const fps = tr.fps || 16, i = Math.floor(t * fps), img = fr[tr.loop === false ? Math.min(i, fr.length - 1) : i % fr.length];
        if (!img) return;
        const W = env.W, Hh = env.H, sc = (tr.fit === 'contain' ? Math.min : Math.max)(W / img.width, Hh / img.height);
        const a = (tr.a === undefined ? 1 : tr.a) * easeOut(clamp01(t / (tr.fin || 0.1))) * (1 - easeIn(clamp01((t - (dur - (tr.fout || 0.4))) / (tr.fout || 0.4))));
        if (a < 0.01) return;
        ctx.save(); ctx.globalAlpha = a; ctx.drawImage(img, (W - img.width * sc) / 2, (Hh - img.height * sc) / 2, img.width * sc, img.height * sc); ctx.restore();
    };

    // ── world: the replacement battlefield ──────────────────────────────────
    LAYERS.world = (ctx, tr, env) => {
        const t = env.time - tr.at, dur = tr.dur || 2;
        if (t < 0 || t > dur) return;
        const W = env.W, Hh = env.H, wd = W_OF(tr.kind);
        const a = easeOut(clamp01(t / (tr.fin || 0.2))) * (1 - easeIn(clamp01((t - (dur - (tr.fout || 0.3))) / (tr.fout || 0.3))));
        if (a < 0.01) return;
        const yH = Hh * 0.46, tt = env.time;
        ctx.save(); ctx.globalAlpha = a;
        const sky = ctx.createLinearGradient(0, 0, 0, yH + 20); sky.addColorStop(0, wd.sky[0]); sky.addColorStop(1, wd.sky[1]);
        ctx.fillStyle = sky; ctx.fillRect(-80, -80, W + 160, yH + 100);
        const gr = ctx.createLinearGradient(0, yH, 0, Hh); gr.addColorStop(0, wd.ground[0]); gr.addColorStop(1, wd.ground[1]);
        ctx.fillStyle = gr; ctx.fillRect(-80, yH, W + 160, Hh - yH + 80);
        const rr = mulberry(hashS('world' + tr.kind));

        if (tr.kind === 'lava' || tr.kind === 'blood') {         // volcano ridge + glowing rivers + embers
            ctx.fillStyle = '#080102';
            for (let i = 0; i < 5; i++) {
                const cx = W * (0.08 + i * 0.22 + rr() * 0.05), bw = W * (0.14 + rr() * 0.08), top = yH - Hh * (0.12 + rr() * 0.16);
                ctx.beginPath(); ctx.moveTo(cx - bw, yH + 2); ctx.lineTo(cx - bw * 0.18, top); ctx.lineTo(cx + bw * 0.18, top); ctx.lineTo(cx + bw, yH + 2); ctx.closePath(); ctx.fill();
                glowDot(ctx, cx, top, bw * 0.35, wd.glow, 0.55 + 0.2 * Math.sin(tt * 2 + i));
            }
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            for (let r = 0; r < 5; r++) {            // rivers flowing toward the camera
                const x0 = W * (0.1 + r * 0.2) + (rr() - 0.5) * 60;
                for (const [lw, col, al] of [[14 + r * 3, wd.glow, 0.3], [5 + r, wd.hot, 0.85]]) {
                    ctx.strokeStyle = col; ctx.globalAlpha = a * al; ctx.lineWidth = lw; ctx.beginPath();
                    for (let s = 0; s <= 12; s++) {
                        const k = s / 12, y = yH + 8 + k * (Hh - yH), x = x0 + (k * (r - 2) * 120) + Math.sin(k * 7 + r + tt * 1.4) * 26 * k;
                        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                    }
                    ctx.stroke();
                }
            }
            ctx.restore();
        } else if (tr.kind === 'ice') {                         // aurora
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let b = 0; b < 3; b++) {
                const g = ctx.createLinearGradient(0, 0, 0, yH); g.addColorStop(0, 'rgba(120,255,200,0)'); g.addColorStop(0.5, b % 2 ? 'rgba(140,200,255,0.32)' : 'rgba(120,255,200,0.3)'); g.addColorStop(1, 'rgba(120,255,200,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-40, 0);
                for (let x = -40; x <= W + 40; x += 40) ctx.lineTo(x, yH * (0.2 + b * 0.18) + Math.sin(x * 0.01 + tt * 0.8 + b * 2) * 26);
                ctx.lineTo(W + 40, yH * 0.9); ctx.lineTo(-40, yH * 0.9); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        } else if (tr.kind === 'storm') {                       // flickering lightning
            const ph = (tt * 1.7) % 1;
            if (ph < 0.12) {
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (1 - ph / 0.12); ctx.fillStyle = 'rgba(180,200,255,0.25)'; ctx.fillRect(-80, -80, W + 160, Hh + 160);
                const r2 = mulberry(hashS('bolt' + Math.floor(tt * 1.7))); let x = W * (0.15 + r2() * 0.7), y = 0;
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowColor = wd.glow; ctx.shadowBlur = 18; ctx.beginPath(); ctx.moveTo(x, y);
                while (y < yH) { x += (r2() - 0.5) * 60; y += 30 + r2() * 26; ctx.lineTo(x, y); }
                ctx.stroke(); ctx.restore();
            }
        } else if (tr.kind === 'gold') {                        // sun rays
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = wd.glow + '22';
            for (let i = 0; i < 9; i++) { const ang = -Math.PI + (i / 9) * Math.PI + Math.sin(tt * 0.5 + i) * 0.04; ctx.beginPath(); ctx.moveTo(W / 2, yH); ctx.lineTo(W / 2 + Math.cos(ang - 0.07) * W, yH + Math.sin(ang - 0.07) * W); ctx.lineTo(W / 2 + Math.cos(ang + 0.07) * W, yH + Math.sin(ang + 0.07) * W); ctx.fill(); }
            ctx.restore();
        } else if (tr.kind === 'void') {                        // nebula swirl + mist floor
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 4; i++) {
                const cx = W * (0.2 + i * 0.22) + Math.sin(tt * 0.4 + i) * 30, cy = yH * (0.4 + (i % 2) * 0.3);
                const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, W * 0.28); g.addColorStop(0, wd.glow + '30'); g.addColorStop(1, wd.glow + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, yH + 40);
            }
            ctx.restore();
        }

        const K = tr.kind;
        if (K === 'arcane') {                                   // star-sky + a huge rune circle turning on the ground
            for (let i = 0; i < 80; i++) { ctx.globalAlpha = a * (0.3 + 0.6 * Math.abs(Math.sin(tt * 2 + i))); ctx.fillStyle = '#fff'; ctx.fillRect(rr() * W, rr() * yH, 1.6, 1.6); }
            ctx.save(); ctx.globalAlpha = a * 0.7; ctx.translate(W / 2, Hh * 0.72); ctx.scale(1, 0.28); ctx.rotate(tt * 0.25); ctx.strokeStyle = wd.glow; ctx.lineWidth = 3; ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath(); ctx.arc(0, 0, W * 0.36, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, W * 0.3, 0, TAU); ctx.stroke();
            ctx.beginPath(); for (let i = 0; i <= 7; i++) { const ang = ((i * 3) % 7) / 7 * TAU; i ? ctx.lineTo(Math.cos(ang) * W * 0.3, Math.sin(ang) * W * 0.3) : ctx.moveTo(Math.cos(ang) * W * 0.3, Math.sin(ang) * W * 0.3); } ctx.stroke(); ctx.restore();
        } else if (K === 'clockwork') {                         // giant gears turning behind the fighters
            ctx.save(); ctx.lineWidth = 3;
            for (const [gx, gy, gr, tn, dir] of [[0.18, 0.28, 0.3, 14, 1], [0.5, 0.2, 0.24, 11, -1], [0.82, 0.3, 0.32, 15, 1], [0.34, 0.42, 0.16, 8, -1], [0.68, 0.44, 0.15, 8, -1]]) {
                ctx.beginPath(); for (let i = 0; i < tn * 2; i++) { const ang = tt * 0.35 * dir + (i / (tn * 2)) * TAU, rad = i % 2 ? Hh * gr * 0.86 : Hh * gr; i ? ctx.lineTo(W * gx + Math.cos(ang) * rad, Hh * gy + Math.sin(ang) * rad) : ctx.moveTo(W * gx + Math.cos(ang) * rad, Hh * gy + Math.sin(ang) * rad); }
                ctx.closePath(); ctx.fillStyle = 'rgba(90,60,12,0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,217,138,0.7)'; ctx.stroke();
            }
            ctx.restore();
        } else if (K === 'sky') {                               // bright sky, drifting clouds, floating rocks
            for (let i = 0; i < 7; i++) { const cx = ((rr() * W * 1.4 + tt * (8 + i * 3)) % (W * 1.4)) - W * 0.2, cy = yH * (0.15 + rr() * 0.7); ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(cx + k * 28, cy + Math.sin(k * 2) * 8, 24 + (k % 2) * 10, 0, TAU); ctx.fill(); } }
            for (let i = 0; i < 4; i++) { const rx = W * (0.12 + i * 0.26), ry = yH * 0.55 + Math.sin(tt + i) * 10; ctx.fillStyle = '#6a5a48'; ctx.beginPath(); ctx.moveTo(rx - 60, ry); ctx.lineTo(rx + 60, ry); ctx.lineTo(rx + 20, ry + 50); ctx.lineTo(rx - 10, ry + 62); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#6aa84a'; ctx.fillRect(rx - 60, ry - 5, 120, 6); }
        } else if (K === 'graveyard') {                         // tombstones, dead trees, a skull moon, fog
            ctx.fillStyle = '#e8dcd0'; ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.arc(W * 0.5, yH * 0.4, Hh * 0.13, 0, TAU); ctx.fill(); ctx.globalAlpha = a; ctx.fillStyle = '#14020a'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(W * 0.5 + sx * Hh * 0.045, yH * 0.38, Hh * 0.03, Hh * 0.036, 0, 0, TAU); ctx.fill(); }
            ctx.fillStyle = '#06020a'; for (let i = 0; i < 9; i++) { const x = W * (0.04 + i * 0.115), h = 36 + (i % 3) * 14; ctx.beginPath(); ctx.moveTo(x - 16, yH + 18); ctx.lineTo(x - 16, yH + 18 - h + 14); ctx.arc(x, yH + 18 - h + 14, 16, Math.PI, 0); ctx.lineTo(x + 16, yH + 18); ctx.fill(); }
            for (let i = 0; i < 3; i++) { const x = W * (0.15 + i * 0.35); ctx.strokeStyle = '#06020a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, yH + 10); ctx.lineTo(x + 6, yH - 90); ctx.moveTo(x + 4, yH - 50); ctx.lineTo(x + 40, yH - 100); ctx.moveTo(x + 5, yH - 70); ctx.lineTo(x - 34, yH - 110); ctx.stroke(); }
            for (let i = 0; i < 5; i++) { ctx.globalAlpha = a * 0.16; ctx.fillStyle = '#9ff0c8'; ctx.beginPath(); ctx.ellipse(((tt * 14 + i * 230) % (W + 300)) - 150, yH + 30 + i * 18, 190, 26, 0, 0, TAU); ctx.fill(); }
        } else if (K === 'factory') {                           // pipes, gears, sparks
            ctx.fillStyle = '#0a1420'; for (let i = 0; i < 6; i++) ctx.fillRect(W * (0.06 + i * 0.17), 0, 18, yH + 10);
            ctx.strokeStyle = '#3a4a5a'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(0, yH * 0.4); ctx.lineTo(W, yH * 0.4); ctx.moveTo(0, yH * 0.7); ctx.lineTo(W, yH * 0.7); ctx.stroke();
            for (const [gx, gy, gr, dir] of [[0.15, 0.5, 0.2, 1], [0.6, 0.35, 0.26, -1], [0.88, 0.55, 0.16, 1]]) { ctx.beginPath(); for (let i = 0; i < 24; i++) { const ang = tt * 0.5 * dir + (i / 24) * TAU, rad = i % 2 ? Hh * gr * 0.84 : Hh * gr; i ? ctx.lineTo(W * gx + Math.cos(ang) * rad, Hh * gy + Math.sin(ang) * rad) : ctx.moveTo(W * gx + Math.cos(ang) * rad, Hh * gy + Math.sin(ang) * rad); } ctx.closePath(); ctx.fillStyle = 'rgba(30,44,58,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(143,224,255,0.5)'; ctx.lineWidth = 2; ctx.stroke(); }
        } else if (K === 'stage') {                             // curtains framing the sides + spotlight cones + a floor glow
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) { const sw = Math.sin(tt * 1.4 + i * 2) * W * 0.15, g = ctx.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, 'rgba(255,241,176,0.5)'); g.addColorStop(1, 'rgba(255,241,176,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W * (0.25 + i * 0.25), 0); ctx.lineTo(W * (0.25 + i * 0.25) + 16, 0); ctx.lineTo(W * (0.25 + i * 0.25) + sw + 130, Hh); ctx.lineTo(W * (0.25 + i * 0.25) + sw - 130, Hh); ctx.fill(); }
            ctx.restore();
            for (const side of [0, 1]) { const g = ctx.createLinearGradient(side ? W : 0, 0, side ? W - W * 0.2 : W * 0.2, 0); for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, k % 2 ? '#7a0a1a' : '#b01a2c'); ctx.fillStyle = g; ctx.fillRect(side ? W * 0.8 : 0, 0, W * 0.2, Hh); }
        }
        if (K === 'void' && tr.debris) {                        // chunks of the old arena drifting in the void (singularity aftermath)
            const rd = mulberry(hashS('debris'));
            for (let i = 0; i < 16; i++) {
                const bx = rd() * W, by = Hh * (0.15 + rd() * 0.75), sz = 18 + rd() * 46, ang = rd() * TAU + tt * (0.2 + rd() * 0.5) * (i % 2 ? 1 : -1), dy = Math.sin(tt * 0.7 + i) * 10;
                ctx.save(); ctx.translate(bx, by + dy); ctx.rotate(ang); ctx.globalAlpha = a * (0.55 + 0.4 * rd());
                ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(-sz * 0.4, -sz * 0.7); ctx.lineTo(sz * 0.7, -sz * 0.3); ctx.lineTo(sz, sz * 0.4); ctx.lineTo(0, sz); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#4a8a3a'; ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(-sz * 0.4, -sz * 0.7); ctx.lineTo(sz * 0.7, -sz * 0.3); ctx.lineTo(sz * 0.6, -sz * 0.05); ctx.lineTo(-sz * 0.5, -sz * 0.1); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
        } else if (K === 'spirit') {                            // drifting souls over teal mist
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 30; i++) { glowDot(ctx, rr() * W + Math.sin(tt * 1.2 + i) * 24, Hh - ((rr() * Hh + tt * (30 + rr() * 50)) % Hh), 10 + rr() * 12, '#7af0d0', 0.5 * a); } ctx.restore();
        } else if (K === 'hell') {                              // pentagram on the floor + flame pillars
            ctx.save(); ctx.globalAlpha = a * 0.75; ctx.translate(W / 2, Hh * 0.74); ctx.scale(1, 0.26); ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 4; ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.arc(0, 0, W * 0.34, 0, TAU); ctx.stroke(); ctx.beginPath(); for (let i = 0; i <= 5; i++) { const ang = -Math.PI / 2 + ((i * 2) % 5) / 5 * TAU; i ? ctx.lineTo(Math.cos(ang) * W * 0.34, Math.sin(ang) * W * 0.34) : ctx.moveTo(Math.cos(ang) * W * 0.34, Math.sin(ang) * W * 0.34); } ctx.stroke(); ctx.restore();
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const fx of [0.08, 0.92, 0.3, 0.7]) for (let i = 0; i < 14; i++) glowDot(ctx, W * fx + Math.sin(tt * 4 + i) * 12, yH + 30 - ((tt * 120 + i * 40) % (yH * 0.9)), 22 + (i % 3) * 8, i % 2 ? '#ff5a1a' : '#ffb24a', 0.4 * a); ctx.restore();
        }

        // horizon glow + drifting particles (embers / snow / dust / motes)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const hg = ctx.createRadialGradient(W / 2, yH, 10, W / 2, yH, W * 0.6); hg.addColorStop(0, wd.glow + '66'); hg.addColorStop(1, wd.glow + '00'); ctx.fillStyle = hg; ctx.fillRect(-80, yH - Hh * 0.4, W + 160, Hh * 0.8);
        const down = tr.kind === 'ice';
        for (let i = 0; i < 60; i++) {
            const sp = 22 + rr() * 50, x0 = rr() * W, ph = rr() * Hh, y = down ? (ph + tt * sp) % Hh : Hh - ((ph + tt * sp) % Hh), x = x0 + Math.sin(tt + i) * 14;
            ctx.globalAlpha = a * (0.35 + rr() * 0.5); ctx.fillStyle = wd.ember; ctx.beginPath(); ctx.arc(x, y, 1 + rr() * 2.2, 0, TAU); ctx.fill();
        }
        ctx.restore();

        // 3D silhouettes: each winds up, whips and throws at the target, forever
        if (tr.sil) {
            const [tx, ty] = pt(env, 'T', tr);
            const spots = [[0.06, 0.8, 1.05], [0.2, 0.6, 0.78], [0.93, 0.78, 1.1], [0.8, 0.58, 0.78], [0.5, 0.45, 0.62], [0.34, 0.95, 1.3], [0.68, 0.96, 1.25], [0.03, 0.52, 0.66], [0.97, 0.52, 0.66]];
            const n = Math.min(spots.length, tr.sil === true ? 9 : tr.sil);
            for (const k of [4, 7, 8, 1, 3, 0, 2, 5, 6].filter((x) => x < n)) {          // far -> near so the near ones overlap
                const [fx, fy, sc] = spots[k], x = W * fx, y = Hh * fy, h = Hh * 0.34 * sc, dir = tx >= x ? 1 : -1;
                const per = 1.1 + (k % 3) * 0.12, cyc = ((tt * (1 / per)) + k * 0.37) % 1;
                ctx.globalAlpha = a * a * a * (0.78 + 0.22 * sc / 1.3);
                const hand = figure(ctx, x, y, h, dir, cyc, wd, tt, k);
                if (cyc > 0.55) {                       // the thrown blade
                    const q = clamp01((cyc - 0.55) / 0.4), px = lerp(hand[0], tx, easeIn(q)), py = lerp(hand[1], ty - 40, easeIn(q)), ang = Math.atan2(ty - 40 - hand[1], tx - hand[0]);
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = wd.hot; ctx.lineWidth = 2; ctx.globalAlpha = a * 0.6 * (1 - q);
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang) * 46, py - Math.sin(ang) * 46); ctx.stroke(); ctx.restore();
                    ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.fillStyle = '#000'; ctx.strokeStyle = wd.glow; ctx.lineWidth = 1.5; ctx.globalAlpha = a;
                    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
                    if (q > 0.93) glowDot(ctx, tx, ty - 40, 36, wd.hot, 0.6 * a);
                }
            }
        }
        ctx.restore();
    };
};
