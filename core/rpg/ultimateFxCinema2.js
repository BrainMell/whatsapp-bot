'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  SHORT CLASS CINEMATICS (owner 2026-10-28: "do all of them" - every class gets
//  its own idea). ~1.4s each, then they dissolve straight back onto the normal
//  arena and the class attack plays. Registered into LAYERS.cinema (see
//  ultimateFxCinema.js). Signature: (c, t, D, W, Hh, wd, snap).
//
//   NECROMANCER soul spiral -> skull sigil     FIGHTER   iron fist punches the camera
//   WARRIOR     banners drop, sword is planted  SAMURAI   letterbox, red sun, one iai line
//   SHOGUN      war-banner army on the ridge    BERSERKER rage throb + claw rips
//   SCOUT       hawk-eye scope locks on         ROGUE     lights out, dagger glints
//   NINJA       leap across the moon            NIGHTBLADE crimson crescent sweeps
//   APPRENTICE  spellbook pages fly             DRAGONSLAYER dragon over the sunset
//   DOOMSLAYER  black sun cracks the sky        WARLORD   army charges the camera
//   CHRONOMANCER hourglass freezes mid-fall      ARTIFICER scanner HUD locks on
//   BARD        a ribbon of notes over a staff   ACOLYTE  a candle flame blooms
//   PALADIN     shield slam + light pillars      CLERIC    rose window lights
//   SAINT       heaven opens, feathers fall     MONK      lotus + water ripples
//   ZENMASTER   ink enso + mountains            TEMPLAR   cross of light + chains
//   DIVINE_FIST golden fist barrage             GOD_HAND  a giant hand descends
//   DRUID       forest time-lapse               ARCHDRUID world tree
//   MERCHANT    scales + coin flood             TYCOON    skyline + rocket chart
// ═══════════════════════════════════════════════════════════════════════════
module.exports = function install(CIN, U) {
    const { partial, grad, dimSnap, glowDot, rrng, clamp01, easeOut, easeIn, lerp, TAU, gearPath } = U;
    const bg = (c, t, snap, W, Hh, a, b, col) => { if (t < 0.25) dimSnap(c, snap, W, Hh, easeIn(t / 0.25), col || a); else grad(c, W, Hh, a, b); };
    const flash = (c, W, Hh, t, D, col = '#fff', a = 0.9) => { const f = clamp01((t - (D - 0.55)) / 0.3); if (f > 0) { c.save(); c.globalAlpha = a * f; c.fillStyle = col; c.fillRect(0, 0, W, Hh); c.restore(); } };
    const add = (c, fn) => { c.save(); c.globalCompositeOperation = 'lighter'; fn(); c.restore(); };
    const fist = (c, x, y, s, col, edge) => {
        c.save(); c.translate(x, y); c.fillStyle = col; c.strokeStyle = edge || '#000'; c.lineWidth = Math.max(2, s * 0.04); c.lineJoin = 'round';
        const rr = (X, Y, w, h, r) => { c.beginPath(); c.moveTo(X + r, Y); c.lineTo(X + w - r, Y); c.quadraticCurveTo(X + w, Y, X + w, Y + r); c.lineTo(X + w, Y + h - r); c.quadraticCurveTo(X + w, Y + h, X + w - r, Y + h); c.lineTo(X + r, Y + h); c.quadraticCurveTo(X, Y + h, X, Y + h - r); c.lineTo(X, Y + r); c.quadraticCurveTo(X, Y, X + r, Y); c.closePath(); c.fill(); c.stroke(); };
        rr(-s * 0.45, -s * 0.1, s * 0.9, s * 0.7, s * 0.14);
        for (let i = 0; i < 4; i++) rr(-s * 0.45 + i * s * 0.225, -s * 0.38, s * 0.2, s * 0.4, s * 0.09);
        rr(-s * 0.62, s * 0.05, s * 0.28, s * 0.36, s * 0.12); rr(-s * 0.4, s * 0.55, s * 0.8, s * 0.28, s * 0.06);
        c.restore();
    };
    const petals = (c, t, W, Hh, n, col) => { const r = rrng('pet' + col); for (let i = 0; i < n; i++) { const x = (r() * W + t * (60 + r() * 80)) % (W + 40) - 20, y = (r() * Hh + t * (40 + r() * 50)) % Hh; c.fillStyle = col; c.beginPath(); c.ellipse(x, y, 7, 3.5, t * 2 + i, 0, TAU); c.fill(); } };
    const rays = (c, cx, cy, n, len, rot, col, wid = 0.05) => { add(c, () => { c.fillStyle = col; for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a - wid) * len, cy + Math.sin(a - wid) * len); c.lineTo(cx + Math.cos(a + wid) * len, cy + Math.sin(a + wid) * len); c.fill(); } }); };
    const tree = (c, x, y, h, q, col, leaf) => { const hh = h * q; c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = Math.max(3, h * 0.07 * q); c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - hh * 0.7); c.stroke(); c.fillStyle = leaf; for (const [ox, oy, r] of [[0, -0.85, 0.3], [-0.22, -0.68, 0.22], [0.22, -0.68, 0.22]]) { c.beginPath(); c.arc(x + ox * h * q, y + oy * h * q, r * h * q, 0, TAU); c.fill(); } };

    // ── physical ────────────────────────────────────────────────────────────
    CIN.FIGHTER = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#1a1c24', '#3a4050');
        add(c, () => { c.strokeStyle = 'rgba(210,225,255,0.6)'; c.lineWidth = 2; for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, r0 = Hh * (0.15 + 0.5 * (1 - easeOut(clamp01(t / 0.6)))), r1 = r0 + Hh * 0.5; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * r0, Hh / 2 + Math.sin(a) * r0); c.lineTo(W / 2 + Math.cos(a) * r1, Hh / 2 + Math.sin(a) * r1); c.stroke(); } });
        const q = easeIn(clamp01((t - 0.3) / 0.7)); fist(c, W / 2, Hh * 0.5, Hh * (0.25 + q * 1.8), '#e8c8a0', '#2a1a10');
        add(c, () => { for (let k = 0; k < 3; k++) { const r = easeOut(clamp01((t - 0.9 - k * 0.07) / 0.35)); if (r > 0) { c.strokeStyle = `rgba(255,255,255,${1 - r})`; c.lineWidth = 6; c.beginPath(); c.arc(W / 2, Hh / 2, r * W * 0.7, 0, TAU); c.stroke(); } } }); flash(c, W, Hh, t, D);
    };
    CIN.WARRIOR = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#3a0c04', '#c8501a');
        for (let i = 0; i < 5; i++) { const x = W * (0.12 + i * 0.19), drop = easeOut(clamp01((t - 0.1 - i * 0.08) / 0.35)) * Hh * 0.42; c.fillStyle = i % 2 ? '#7a0a0a' : '#b01818'; c.beginPath(); c.moveTo(x - 30, -10); c.lineTo(x + 30, -10); c.lineTo(x + 30 + Math.sin(t * 5 + i) * 6, drop); c.lineTo(x, drop - 26); c.lineTo(x - 30 + Math.sin(t * 5 + i) * 6, drop); c.closePath(); c.fill(); c.fillStyle = '#ffd24a'; c.fillRect(x - 30, -10, 60, 10); }
        const sw = easeIn(clamp01((t - 0.5) / 0.35)), sy = lerp(-Hh * 0.7, Hh * 0.62, sw), cx = W / 2;
        c.fillStyle = '#dfe6ee'; c.beginPath(); c.moveTo(cx - 12, sy - Hh * 0.55); c.lineTo(cx + 12, sy - Hh * 0.55); c.lineTo(cx + 10, sy); c.lineTo(cx, sy + 30); c.lineTo(cx - 10, sy); c.closePath(); c.fill(); c.fillStyle = '#7a5a2a'; c.fillRect(cx - 46, sy - Hh * 0.55 - 8, 92, 14); c.fillRect(cx - 7, sy - Hh * 0.55 - 70, 14, 62);
        if (t > 0.85) { const r = easeOut(clamp01((t - 0.85) / 0.5)); add(c, () => { c.strokeStyle = `rgba(255,200,120,${1 - r})`; c.lineWidth = 8 * (1 - r) + 1; c.beginPath(); c.ellipse(cx, Hh * 0.7, r * W * 0.6, r * W * 0.14, 0, 0, TAU); c.stroke(); }); }
        flash(c, W, Hh, t, D, '#ffd9a0', 0.7);
    };
    CIN.SAMURAI = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#e8e0d0', '#d8cdb8', '#d8cfc0'); const bar = easeOut(clamp01(t / 0.35)) * Hh * 0.17;
        c.fillStyle = '#c8281e'; c.beginPath(); c.arc(W / 2, Hh * 0.5, Hh * 0.2, 0, TAU); c.fill(); petals(c, t, W, Hh, 40, 'rgba(255,170,190,0.9)');
        c.fillStyle = '#000'; c.fillRect(0, 0, W, bar); c.fillRect(0, Hh - bar, W, bar);
        const s = clamp01((t - 0.7) / 0.12); if (s > 0) { add(c, () => { c.strokeStyle = '#fff'; c.lineWidth = 6 * (1 - clamp01((t - 0.85) / 0.4)) + 1; c.beginPath(); c.moveTo(0, Hh * 0.62); c.lineTo(W * s, Hh * 0.38); c.stroke(); }); }
        if (t > 0.85) { c.fillStyle = `rgba(0,0,0,${clamp01((t - 0.85) / 0.2) * 0.8})`; c.fillRect(0, 0, W, Hh); add(c, () => { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, Hh * 0.62); c.lineTo(W, Hh * 0.38); c.stroke(); }); }
    };
    CIN.SHOGUN = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#2a0a08', '#ff9a3a');
        glowDot(c, W / 2, Hh * 0.62, Hh * 0.5, '#ffd27a', 0.5); c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(W / 2, Hh * 0.6, Hh * 0.14, 0, TAU); c.fill();
        c.fillStyle = '#12040a'; c.beginPath(); c.moveTo(0, Hh); c.lineTo(0, Hh * 0.68); for (let x = 0; x <= W; x += 40) c.lineTo(x, Hh * 0.66 + Math.sin(x * 0.02) * 12); c.lineTo(W, Hh); c.fill();
        const up = easeOut(clamp01((t - 0.2) / 0.6)); for (let i = 0; i < 26; i++) { const x = W * (0.03 + i * 0.037), h = Hh * (0.1 + 0.1 * ((i * 7) % 3) / 3) * up; c.strokeStyle = '#12040a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, Hh * 0.7); c.lineTo(x + 6, Hh * 0.7 - h * 2.4); c.stroke(); c.beginPath(); c.arc(x, Hh * 0.7 - 14, 9, Math.PI, 0); c.fill(); }
        for (const bx of [0.2, 0.5, 0.8]) { const h = Hh * 0.3 * easeOut(clamp01((t - 0.4) / 0.4)); c.fillStyle = '#b01818'; c.fillRect(W * bx - 3, Hh * 0.7 - h * 1.5, 5, h * 1.5); c.fillRect(W * bx - 26, Hh * 0.7 - h * 1.5, 26, h * 0.7); c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(W * bx - 13, Hh * 0.7 - h * 1.15, 8, 0, TAU); c.fill(); }
        flash(c, W, Hh, t, D, '#ffd27a', 0.6);
    };
    CIN.BERSERKER = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh); const th = 0.5 + 0.5 * Math.sin(t * 14); const g = c.createRadialGradient(W / 2, Hh / 2, Hh * 0.2, W / 2, Hh / 2, Hh * 0.9); g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(190,0,10,${(0.5 + 0.35 * th) * clamp01(t / 0.3)})`); c.fillStyle = g; c.fillRect(0, 0, W, Hh);
        c.fillStyle = `rgba(160,0,0,${0.18 * th})`; c.fillRect(0, 0, W, Hh); const r = rrng('claw');
        for (let k = 0; k < 4; k++) { const f = clamp01((t - 0.4 - k * 0.12) / 0.14); if (f <= 0) continue; const ox = W * (0.2 + 0.2 * k), a = 0.9; for (let i = 0; i < 3; i++) { add(c, () => { c.strokeStyle = '#ffdede'; c.lineWidth = 7 - i; c.lineCap = 'round'; c.beginPath(); c.moveTo(ox + i * 22, Hh * 0.05); c.lineTo(ox + i * 22 + (W * 0.12) * f * a, Hh * 0.05 + Hh * 0.9 * f); c.stroke(); }); } }
        if (t > 0.5) { c.fillStyle = `rgba(0,0,0,${clamp01((t - 0.9) / 0.4) * 0.6})`; c.fillRect(0, 0, W, Hh); } flash(c, W, Hh, t, D, '#ff2a2a', 0.5);
    };
    CIN.SCOUT = (c, t, D, W, Hh, wd, snap) => {
        const z = easeIn(clamp01(t / 0.9)), s = 1 + z * 0.35; c.save(); c.translate(W / 2, Hh / 2); c.scale(s, s); c.translate(-W / 2, -Hh / 2); c.drawImage(snap, 0, 0, W, Hh); c.restore();
        const vg = c.createRadialGradient(W / 2, Hh / 2, Hh * 0.18, W / 2, Hh / 2, Hh * 0.62); vg.addColorStop(0, 'rgba(0,20,0,0)'); vg.addColorStop(1, 'rgba(0,10,0,0.92)'); c.fillStyle = vg; c.fillRect(0, 0, W, Hh);
        c.strokeStyle = '#9fff8a'; c.lineWidth = 2; const R = Hh * 0.3 * (1.6 - 0.6 * easeOut(clamp01(t / 0.7))); c.beginPath(); c.arc(W / 2, Hh / 2, R, 0, TAU); c.stroke(); c.beginPath(); c.arc(W / 2, Hh / 2, R * 0.4, 0, TAU); c.stroke();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.beginPath(); c.moveTo(W / 2 + dx * R * 0.2, Hh / 2 + dy * R * 0.2); c.lineTo(W / 2 + dx * R * 1.5, Hh / 2 + dy * R * 1.5); c.stroke(); }
        const lk = clamp01((t - 0.8) / 0.2); if (lk > 0) { add(c, () => { glowDot(c, W / 2, Hh / 2, 50 * lk + 10, '#9fff8a', 0.9 * lk); c.strokeStyle = '#ff4a3a'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, Hh / 2, R * 0.4 * (1.8 - 0.8 * lk), 0, TAU); c.stroke(); }); }
    };
    CIN.ROGUE = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh); c.fillStyle = `rgba(2,0,8,${easeIn(clamp01(t / 0.35))})`; c.fillRect(0, 0, W, Hh);
        const gl = [[0.5, 0.2, 0.55], [0.82, 0.55, 0.7], [0.18, 0.62, 0.85], [0.6, 0.78, 1.0]];
        add(c, () => { gl.forEach(([x, y, st], i) => { const f = clamp01((t - st * 0.8) / 0.3); if (f <= 0) return; const s = Math.sin(f * Math.PI), len = 130 * s; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * x - len, Hh * y - len * 0.35); c.lineTo(W * x + len, Hh * y + len * 0.35); c.stroke(); c.beginPath(); c.moveTo(W * x - len * 0.3, Hh * y - len * 0.8); c.lineTo(W * x + len * 0.3, Hh * y + len * 0.8); c.stroke(); glowDot(c, W * x, Hh * y, 30 * s, '#cfe0ff', 0.9 * s); }); });
        const sm = clamp01((t - 0.9) / 0.4); if (sm > 0) { const r = rrng('smoke'); for (let i = 0; i < 16; i++) glowDot(c, W / 2 + (r() - 0.5) * W * 0.8, Hh * (0.3 + r() * 0.5), 60 + r() * 80, '#7a7a90', 0.35 * sm * (1 - sm * 0.3)); }
    };
    CIN.NINJA = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#04122a', '#0e3a5a'); glowDot(c, W * 0.5, Hh * 0.35, Hh * 0.45, '#cfefff', 0.35); c.fillStyle = '#f2fbff'; c.beginPath(); c.arc(W * 0.5, Hh * 0.35, Hh * 0.17, 0, TAU); c.fill();
        c.fillStyle = '#020a14'; for (let i = 0; i < 12; i++) { const x = W * (i / 11), h = Hh * (0.45 + 0.2 * ((i * 5) % 3) / 3); c.fillRect(x - 6, Hh - h, 12, h); for (let k = 1; k < 5; k++) c.fillRect(x - 12, Hh - h * (k / 5), 24, 3); }
        const q = clamp01((t - 0.2) / 0.8), x = lerp(-W * 0.05, W * 1.05, q), y = Hh * 0.55 - Math.sin(q * Math.PI) * Hh * 0.32, rot = lerp(-0.4, 0.9, q);
        for (let g = 6; g >= 0; g--) { const qq = Math.max(0, q - g * 0.03), gx = lerp(-W * 0.05, W * 1.05, qq), gy = Hh * 0.55 - Math.sin(qq * Math.PI) * Hh * 0.32; c.fillStyle = `rgba(2,10,20,${g ? 0.14 : 1})`; c.save(); c.translate(gx, gy); c.rotate(lerp(-0.4, 0.9, qq)); c.beginPath(); c.ellipse(0, 0, 14, 26, 0, 0, TAU); c.fill(); c.fillRect(-34, -3, 70, 6); c.restore(); }
        add(c, () => { glowDot(c, x + 20, y, 14, '#6fe0ff', 0.8); }); flash(c, W, Hh, t, D, '#cfefff', 0.6);
    };
    CIN.NIGHTBLADE = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#0a0208', '#2a0618'); const q = easeOut(clamp01((t - 0.15) / 0.55)), cx = lerp(-W * 0.4, W * 0.5, q), cy = Hh * 0.5;
        add(c, () => { for (let g = 0; g < 8; g++) { const o = g * 36; c.fillStyle = `rgba(255,60,110,${0.12 * (1 - g / 8)})`; c.beginPath(); c.arc(cx - o, cy, Hh * 0.38, -Math.PI * 0.62, Math.PI * 0.62); c.arc(cx - o - Hh * 0.2, cy, Hh * 0.33, Math.PI * 0.6, -Math.PI * 0.6, true); c.fill(); } c.fillStyle = '#ff7a9a'; c.beginPath(); c.arc(cx, cy, Hh * 0.38, -Math.PI * 0.62, Math.PI * 0.62); c.arc(cx - Hh * 0.2, cy, Hh * 0.33, Math.PI * 0.6, -Math.PI * 0.6, true); c.fill(); });
        const r = rrng('nb'); c.fillStyle = '#ffd0da'; for (let i = 0; i < 40; i++) c.fillRect(r() * W, r() * Hh, 2, 2); flash(c, W, Hh, t, D, '#ff5a7a', 0.6);
    };
    CIN.APPRENTICE = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#120a24', '#3a2260'); const cx = W / 2, cy = Hh * 0.58, o = easeOut(clamp01(t / 0.45));
        c.fillStyle = '#5a2a10'; c.fillRect(cx - W * 0.2, cy, W * 0.4, 14); for (const s of [-1, 1]) { c.fillStyle = '#f4ead0'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + s * W * 0.19 * o, cy - Hh * 0.06 * o); c.lineTo(cx + s * W * 0.19 * o, cy + 4); c.lineTo(cx, cy + 6); c.fill(); }
        for (let p = 0; p < 4; p++) { const f = (t * 1.6 + p * 0.25) % 1; c.fillStyle = `rgba(244,234,208,${1 - f * 0.4})`; c.save(); c.translate(cx, cy); c.scale(Math.cos(f * Math.PI), 1); c.fillRect(0, -Hh * 0.12, W * 0.17, Hh * 0.12); c.restore(); }
        const r = rrng('rune'); add(c, () => { for (let i = 0; i < 30; i++) { const f = clamp01((t - 0.3 - r() * 0.5) / 0.7), a = r() * TAU, d = f * Hh * (0.3 + r() * 0.5); glowDot(c, cx + Math.cos(a) * d * 1.4, cy - 20 - Math.abs(Math.sin(a)) * d, 8 + r() * 8, i % 2 ? '#c9a8ff' : '#ffe27a', 0.8 * (1 - f)); } }); flash(c, W, Hh, t, D, '#c9a8ff', 0.6);
    };
    CIN.DRAGONSLAYER = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#2a0c04', '#ff8a2a'); glowDot(c, W * 0.7, Hh * 0.55, Hh * 0.5, '#ffd27a', 0.5);
        c.fillStyle = '#1a0804'; c.beginPath(); c.moveTo(0, Hh); c.lineTo(0, Hh * 0.8); c.lineTo(W * 0.3, Hh * 0.72); c.lineTo(W * 0.6, Hh * 0.82); c.lineTo(W, Hh * 0.74); c.lineTo(W, Hh); c.fill();
        const q = clamp01((t - 0.1) / 1.0), x = lerp(-W * 0.1, W * 1.1, q), y = Hh * 0.28 + Math.sin(q * 6) * 14; c.fillStyle = '#12060a'; c.beginPath(); c.moveTo(x + 70, y); c.lineTo(x - 70, y + 12); c.lineTo(x - 22, y - 8); c.lineTo(x - 60, y - 70 - Math.sin(t * 9) * 16); c.lineTo(x + 6, y - 14); c.lineTo(x + 40, y - 60 - Math.sin(t * 9) * 16); c.lineTo(x + 24, y - 6); c.closePath(); c.fill();
        add(c, () => { for (let i = 0; i < 12; i++) glowDot(c, x + 70 + i * 16, y + 4 + Math.sin(i + t * 10) * 5, 18 - i, i % 2 ? '#ffb24a' : '#ff5a1a', 0.8 * (1 - i / 12)); });
        const sw = easeOut(clamp01((t - 0.6) / 0.5)); c.save(); c.translate(W * 0.3, Hh * 0.9); c.rotate(-0.25); c.fillStyle = '#eef4ff'; c.fillRect(-7, -Hh * 0.55 * sw, 14, Hh * 0.55 * sw); c.fillStyle = '#7a5a2a'; c.fillRect(-26, 0, 52, 8); c.restore(); if (sw > 0.5) add(c, () => glowDot(c, W * 0.3 - Hh * 0.55 * sw * 0.25, Hh * 0.9 - Hh * 0.55 * sw, 34, '#ffffff', 0.9)); flash(c, W, Hh, t, D, '#ffb24a', 0.7);
    };
    CIN.DOOMSLAYER = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#1a0206', '#5a0a10'); const cx = W / 2, cy = Hh * 0.42, R = Hh * 0.2 * (0.6 + 0.4 * easeOut(clamp01(t / 0.5)));
        add(c, () => { glowDot(c, cx, cy, R * 2.8, '#ff2a1a', 0.55); rays(c, cx, cy, 24, Hh, t * 0.5, 'rgba(255,60,30,0.18)', 0.03); });
        c.fillStyle = '#000'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill(); const r = rrng('crk'); add(c, () => { c.strokeStyle = '#ff5a2a'; c.lineCap = 'round'; for (let i = 0; i < 22; i++) { const a = r() * TAU, L = Hh * (0.3 + r() * 0.9) * easeOut(clamp01((t - 0.35 - i * 0.015) / 0.55)); c.lineWidth = 2 + r() * 3; c.beginPath(); c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); let x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; for (let k = 1; k <= 6; k++) { x += Math.cos(a) * L / 6 + (r() - 0.5) * 24; y += Math.sin(a) * L / 6 + (r() - 0.5) * 24; c.lineTo(x, y); } c.stroke(); } });
        flash(c, W, Hh, t, D, '#ff3a1a', 0.7);
    };
    CIN.WARLORD = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#1a1a22', '#6a6a7a'); const up = clamp01(t / 1.0);
        for (let row = 0; row < 5; row++) { const sc = 0.4 + row * 0.35, y = Hh * (0.5 + row * 0.1), adv = easeIn(up); c.fillStyle = `rgba(${10 + row * 6},${10 + row * 6},${16 + row * 6},1)`; for (let i = 0; i < 14; i++) { const x = W * (i / 13) + (row % 2) * 20, bob = Math.abs(Math.sin(t * 9 + i + row)) * 6; const s = sc * (0.6 + adv * 0.7); c.beginPath(); c.arc(x, y - 56 * s - bob, 9 * s, 0, TAU); c.fill(); c.fillRect(x - 10 * s, y - 48 * s - bob, 20 * s, 40 * s); c.fillRect(x + 12 * s, y - 130 * s - bob, 3 * s, 100 * s); } }
        add(c, () => { for (let k = 0; k < 4; k++) { const r2 = ((t * 1.4 + k * 0.25) % 1); c.strokeStyle = `rgba(255,220,160,${0.4 * (1 - r2)})`; c.lineWidth = 4; c.beginPath(); c.ellipse(W / 2, Hh * 0.9, r2 * W * 0.7, r2 * W * 0.12, 0, 0, TAU); c.stroke(); } }); flash(c, W, Hh, t, D, '#ffe0b0', 0.5);
    };
    CIN.NECROMANCER = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#02100a', '#0a3a22'); const cx = W / 2, cy = Hh * 0.5, r = rrng('nec');
        add(c, () => { for (let i = 0; i < 60; i++) { const a0 = r() * TAU, d0 = Hh * (0.4 + r() * 0.5), f = easeIn(clamp01((t - 0.1 - r() * 0.4) / 0.8)), a = a0 + f * 5, d = d0 * (1 - f); glowDot(c, cx + Math.cos(a) * d * 1.4, cy + Math.sin(a) * d, 8 + r() * 8, i % 3 ? '#7affb0' : '#d8fff0', 0.7); } const g = clamp01((t - 0.8) / 0.4); if (g > 0) { c.strokeStyle = '#9fffc8'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, Hh * 0.3 * g, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, cy, Hh * 0.22 * g, 0, TAU); c.stroke(); glowDot(c, cx, cy, Hh * 0.4 * g, '#7affb0', 0.5 * g); } });
        if (t > 0.9) { const g = easeOut(clamp01((t - 0.9) / 0.3)); c.fillStyle = `rgba(0,0,0,${0.9 * g})`; c.beginPath(); c.arc(cx, cy - 4, Hh * 0.12 * g, 0, TAU); c.fill(); c.fillRect(cx - Hh * 0.06 * g, cy + 4, Hh * 0.12 * g, Hh * 0.07 * g); c.fillStyle = `rgba(190,255,220,${g})`; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * Hh * 0.045, cy - 6, Hh * 0.03 * g, 0, TAU); c.fill(); } } flash(c, W, Hh, t, D, '#7affb0', 0.6);
    };
    CIN.CHRONOMANCER = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh); c.fillStyle = `rgba(30,20,4,${easeIn(clamp01(t / 0.3)) * 0.85})`; c.fillRect(0, 0, W, Hh); const cx = W / 2, cy = Hh / 2, hh = Hh * 0.36, hw = Hh * 0.17, o = easeOut(clamp01(t / 0.4));
        c.globalAlpha = o; c.strokeStyle = '#ffd98a'; c.lineWidth = 5; c.fillStyle = 'rgba(255,217,138,0.12)'; c.beginPath(); c.moveTo(cx - hw, cy - hh); c.lineTo(cx + hw, cy - hh); c.lineTo(cx + 8, cy); c.lineTo(cx + hw, cy + hh); c.lineTo(cx - hw, cy + hh); c.lineTo(cx - 8, cy); c.closePath(); c.fill(); c.stroke(); c.fillRect(cx - hw - 12, cy - hh - 10, hw * 2 + 24, 10); c.fillRect(cx - hw - 12, cy + hh, hw * 2 + 24, 10);
        const f = clamp01((t - 0.3) / 0.6); c.fillStyle = '#ffd98a'; c.beginPath(); c.moveTo(cx - hw * (1 - f), cy - hh + 8); c.lineTo(cx + hw * (1 - f), cy - hh + 8); c.lineTo(cx, cy - 6); c.fill(); c.beginPath(); c.moveTo(cx - hw * f * 0.9, cy + hh - 4); c.lineTo(cx + hw * f * 0.9, cy + hh - 4); c.lineTo(cx, cy + hh - hh * 0.8 * f); c.fill(); c.globalAlpha = 1;
        const r = rrng('sand'); add(c, () => { for (let i = 0; i < 36; i++) { const frozen = t > 0.9, y = frozen ? cy - hh * 0.5 + r() * hh * 0.9 : cy - 6 + ((t * 300 + r() * 200) % (hh * 0.9)); const x = cx + (r() - 0.5) * 12 + (frozen ? (r() - 0.5) * hw * 0.8 : 0); glowDot(c, x, y, 4 + r() * 3, '#fff1c4', 0.9); } if (t > 0.9) { const k = easeOut(clamp01((t - 0.9) / 0.4)); c.strokeStyle = `rgba(255,241,196,${1 - k})`; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, k * W * 0.6, 0, TAU); c.stroke(); } });
    };
    CIN.ARTIFICER = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh); c.fillStyle = `rgba(2,16,26,${easeIn(clamp01(t / 0.3)) * 0.82})`; c.fillRect(0, 0, W, Hh);
        c.strokeStyle = 'rgba(111,224,255,0.25)'; c.lineWidth = 1; const hs = 34; for (let y = 0; y < Hh + hs; y += hs * 0.87) for (let x = ((Math.round(y / (hs * 0.87)) % 2) * hs * 0.5); x < W + hs; x += hs) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; k ? c.lineTo(x + Math.cos(a) * hs * 0.5, y + Math.sin(a) * hs * 0.5) : c.moveTo(x + Math.cos(a) * hs * 0.5, y + Math.sin(a) * hs * 0.5); } c.closePath(); c.stroke(); }
        const sy = ((t * 1.4) % 1) * Hh; add(c, () => { const g = c.createLinearGradient(0, sy - 60, 0, sy); g.addColorStop(0, 'rgba(111,224,255,0)'); g.addColorStop(1, 'rgba(111,224,255,0.5)'); c.fillStyle = g; c.fillRect(0, sy - 60, W, 60); });
        const lk = easeOut(clamp01((t - 0.5) / 0.5)), R = Hh * (0.5 - 0.28 * lk); add(c, () => { c.strokeStyle = '#6fe0ff'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, Hh / 2, R, 0, TAU); c.stroke(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + t * 2; c.beginPath(); c.arc(W / 2, Hh / 2, R + 12, a, a + 0.5); c.stroke(); } c.fillStyle = '#ff5a4a'; c.font = 'bold 22px sans-serif'; c.fillText('LOCK', W / 2 - 28, Hh / 2 + R + 34); });
        flash(c, W, Hh, t, D, '#6fe0ff', 0.55);
    };
    // ── support / holy / nature / money ────────────────────────────────────
    CIN.BARD = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#1a0a2a', '#5a2a6a'); c.strokeStyle = 'rgba(255,240,200,0.8)'; c.lineWidth = 2; const sy = Hh * 0.35; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(0, sy + i * 14); c.lineTo(W * easeOut(clamp01(t / 0.4)), sy + i * 14); c.stroke(); }
        const r = rrng('bard'); add(c, () => { for (let i = 0; i < 22; i++) { const f = clamp01((t - 0.2 - i * 0.03) / 0.5); if (f <= 0) continue; const x = W * (0.06 + i * 0.042), y = sy + 70 - Math.sin(i * 0.8 + t * 3) * 40 - f * 6; c.fillStyle = i % 2 ? '#ffe27a' : '#ff9ad0'; c.beginPath(); c.ellipse(x, y, 8, 6, -0.4, 0, TAU); c.fill(); c.fillRect(x + 6, y - 28, 2.5, 28); glowDot(c, x, y, 18, '#ffd0f0', 0.4); } for (let k = 0; k < 3; k++) { const q = ((t * 1.2 + k * 0.33) % 1); c.strokeStyle = `rgba(255,220,240,${0.5 * (1 - q)})`; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, Hh * 0.72, q * Hh * 0.6, 0, TAU); c.stroke(); } });
        flash(c, W, Hh, t, D, '#ffd0f0', 0.5);
    };
    CIN.ACOLYTE = (c, t, D, W, Hh, wd, snap) => {
        c.drawImage(snap, 0, 0, W, Hh); c.fillStyle = `rgba(4,2,0,${easeIn(clamp01(t / 0.3)) * 0.93})`; c.fillRect(0, 0, W, Hh); const cx = W / 2, cy = Hh * 0.55, g = easeOut(clamp01((t - 0.3) / 0.8));
        c.fillStyle = '#e8dcc0'; c.fillRect(cx - 10, cy, 20, Hh * 0.25); add(c, () => { glowDot(c, cx, cy - 18, 40 + 460 * g * g, '#ffd98a', 0.55 + 0.3 * g); glowDot(c, cx, cy - 20, 18 + 12 * Math.sin(t * 20), '#fff4d0', 1); rays(c, cx, cy - 20, 16, Hh * 0.9 * g, t * 0.3, 'rgba(255,236,170,0.18)', 0.04); });
        c.fillStyle = '#ffb24a'; c.beginPath(); c.ellipse(cx, cy - 16, 7, 18 + 3 * Math.sin(t * 22), 0, 0, TAU); c.fill(); flash(c, W, Hh, t, D, '#fff2b0', 0.7);
    };
    CIN.PALADIN = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#0a1228', '#2a4a8a'); for (const s of [-1, 1]) { const f = easeOut(clamp01((t - 0.1) / 0.5)); add(c, () => { const g = c.createLinearGradient(W / 2 + s * W * 0.3, Hh, W / 2 + s * W * 0.3, 0); g.addColorStop(0, 'rgba(255,240,180,0.7)'); g.addColorStop(1, 'rgba(255,240,180,0)'); c.fillStyle = g; c.fillRect(W / 2 + s * W * 0.3 - 26 * f, 0, 52 * f, Hh); }); }
        const sl = easeIn(clamp01((t - 0.3) / 0.35)), sc = lerp(2.6, 1, sl), cx = W / 2, cy = Hh * 0.5, w = Hh * 0.3 * sc, h = Hh * 0.38 * sc; c.globalAlpha = clamp01(t / 0.3);
        c.fillStyle = '#c8d0e0'; c.strokeStyle = '#ffd24a'; c.lineWidth = 8 * sc; c.beginPath(); c.moveTo(cx - w, cy - h * 0.6); c.lineTo(cx + w, cy - h * 0.6); c.lineTo(cx + w, cy + h * 0.1); c.quadraticCurveTo(cx + w, cy + h * 0.7, cx, cy + h); c.quadraticCurveTo(cx - w, cy + h * 0.7, cx - w, cy + h * 0.1); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#ffd24a'; c.fillRect(cx - 10 * sc, cy - h * 0.45, 20 * sc, h * 1.2); c.fillRect(cx - w * 0.6, cy - h * 0.08, w * 1.2, 18 * sc); c.globalAlpha = 1;
        if (t > 0.62) { const r = easeOut(clamp01((t - 0.62) / 0.5)); add(c, () => { c.strokeStyle = `rgba(255,240,180,${1 - r})`; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, r * W * 0.6, 0, TAU); c.stroke(); }); } flash(c, W, Hh, t, D, '#fff2b0', 0.7);
    };
    CIN.CLERIC = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#0a0618', '#1a1040'); const cx = W / 2, cy = Hh * 0.5, R = Hh * 0.42, cols = ['#ff5a5a', '#ffb24a', '#ffe27a', '#6fe08a', '#5ac8ff', '#b07aff']; const lit = clamp01(t / 0.9);
        for (let i = 0; i < 12; i++) { const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU, on = clamp01(lit * 12 - i); c.fillStyle = cols[i % 6]; c.globalAlpha = 0.15 + 0.7 * on; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a1); c.closePath(); c.fill(); c.globalAlpha = 1; c.strokeStyle = '#2a2040'; c.lineWidth = 5; c.stroke(); }
        c.strokeStyle = '#2a2040'; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 0.32, 0, TAU); c.stroke(); rays(c, cx, cy, 14, Hh * 1.1 * lit, t * 0.2, 'rgba(255,240,200,0.16)', 0.05); flash(c, W, Hh, t, D, '#fff2d0', 0.7);
    };
    CIN.SAINT = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#4a8ad8', '#f4faff'); const cx = W / 2, op = easeOut(clamp01(t / 0.8)); rays(c, cx, Hh * 0.25, 18, Hh * 1.3 * op, t * 0.1, 'rgba(255,248,210,0.35)', 0.05);
        for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(255,255,255,0.88)'; const x = cx + s * (W * 0.25 + (1 - op) * W * 0.4 + i * 46); for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + s * k * 26, Hh * (0.2 + i * 0.12) + k * 4, 40 + k * 4, 0, TAU); c.fill(); } }
        add(c, () => { c.strokeStyle = '#fff2b0'; c.lineWidth = 6; c.beginPath(); c.ellipse(cx, Hh * 0.2, Hh * 0.18 * op, Hh * 0.05 * op, 0, 0, TAU); c.stroke(); glowDot(c, cx, Hh * 0.2, Hh * 0.3 * op, '#fff2b0', 0.5); });
        const r = rrng('fe'); c.fillStyle = 'rgba(255,255,255,0.95)'; for (let i = 0; i < 28; i++) { const x = (r() * W + Math.sin(t * 2 + i) * 30), y = (r() * Hh + t * (80 + r() * 80)) % Hh; c.beginPath(); c.ellipse(x, y, 4, 12, 0.5 + Math.sin(t + i) * 0.5, 0, TAU); c.fill(); } flash(c, W, Hh, t, D, '#ffffff', 0.8);
    };
    CIN.MONK = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#0a2028', '#2a6a78'); const cx = W / 2, cy = Hh * 0.62;
        c.strokeStyle = 'rgba(200,245,255,0.7)'; c.lineWidth = 2.5; for (let k = 0; k < 6; k++) { const q = ((t * 0.9 + k / 6) % 1); c.globalAlpha = 1 - q; c.beginPath(); c.ellipse(cx, cy, q * W * 0.5, q * W * 0.12, 0, 0, TAU); c.stroke(); } c.globalAlpha = 1;
        const o = easeOut(clamp01((t - 0.2) / 0.6)); for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + ring * 0.4; c.fillStyle = ring ? '#ffd0e8' : '#ffb0d4'; c.save(); c.translate(cx, cy - 6); c.rotate(a); c.scale(1, 0.5); c.beginPath(); c.ellipse(Hh * 0.1 * o * (1 + ring * 0.4), 0, Hh * 0.1 * o, Hh * 0.04 * o, 0, 0, TAU); c.fill(); c.restore(); }
        add(c, () => glowDot(c, cx, cy - 6, Hh * 0.4 * o, '#fff2b0', 0.35)); flash(c, W, Hh, t, D, '#e8fff8', 0.6);
    };
    CIN.ZENMASTER = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#f2ecdc', '#e0d8c4', '#e8e0cc'); c.fillStyle = 'rgba(40,50,60,0.55)'; for (const [x, h, w] of [[0.15, 0.4, 0.3], [0.4, 0.55, 0.36], [0.72, 0.38, 0.3]]) { c.beginPath(); c.moveTo(W * (x - w / 2), Hh * 0.8); c.lineTo(W * x, Hh * (0.8 - h)); c.lineTo(W * (x + w / 2), Hh * 0.8); c.fill(); }
        const cx = W / 2, cy = Hh * 0.46, R = Hh * 0.27, pts = []; for (let i = 0; i <= 60; i++) { const a = -Math.PI / 2 + (i / 60) * TAU * 0.93 + 0.2; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
        c.strokeStyle = '#141414'; c.lineCap = 'round'; c.lineWidth = 16; partial(c, pts, easeOut(clamp01((t - 0.2) / 0.7))); c.lineWidth = 6; partial(c, pts.map(([x, y]) => [x + 3, y + 2]), easeOut(clamp01((t - 0.25) / 0.7)));
        const r = rrng('ink2'); c.fillStyle = '#141414'; if (t > 0.9) for (let i = 0; i < 14; i++) { const a = r() * TAU, d = R * (1 + r() * 0.5) * easeOut(clamp01((t - 0.9) / 0.2)); c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + r() * 5, 0, TAU); c.fill(); } flash(c, W, Hh, t, D, '#ffffff', 0.8);
    };
    CIN.TEMPLAR = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#0a0a14', '#1a2038'); const cx = W / 2, cy = Hh * 0.5, g = easeOut(clamp01(t / 0.7));
        add(c, () => { for (const [dx, dy, len, wid] of [[0, 1, Hh * 0.46, 22], [0, -1, Hh * 0.46, 22], [1, 0, Hh * 0.26, 22], [-1, 0, Hh * 0.26, 22]]) { const l = len * g; c.fillStyle = '#fff2c0'; c.fillRect(cx + Math.min(0, dx * l) - (dx ? 0 : wid / 2), cy + Math.min(0, dy * l) - (dy ? 0 : wid / 2) - (dy === -1 ? 0 : 0), dx ? Math.abs(l) : wid, dy ? Math.abs(l) : wid); } glowDot(c, cx, cy, Hh * 0.7 * g, '#ffe27a', 0.4); });
        c.strokeStyle = '#8a94a8'; c.lineWidth = 5; for (const s of [-1, 1]) for (let k = 0; k < 14; k++) { const f = clamp01((t - 0.3) / 0.6), x = W * 0.5 + s * (W * 0.12 + k * 26 * f), y = Hh * 0.2 + Math.sin(k * 0.7) * 18 + k * 12 * f; c.beginPath(); c.ellipse(x, y, 9, 5, k % 2 ? 0 : 1.57, 0, TAU); c.stroke(); }
        flash(c, W, Hh, t, D, '#fff2c0', 0.8);
    };
    CIN.DIVINE_FIST = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#2a1a02', '#a8761a'); const r = rrng('df'); add(c, () => rays(c, W / 2, Hh / 2, 20, Hh * 1.3, t * 0.4, 'rgba(255,236,160,0.2)', 0.04));
        for (let i = 0; i < 16; i++) { const st = 0.1 + i * 0.045, f = clamp01((t - st) / 0.28); if (f <= 0) continue; const x = W * (0.12 + r() * 0.76), y = Hh * (0.18 + r() * 0.64), s = Hh * (0.12 + r() * 0.14) * (0.5 + f); c.globalAlpha = 1 - f * 0.75; fist(c, x, y, s, '#ffe9a0', '#7a5a10'); add(c, () => glowDot(c, x, y, s * 1.1, '#fff2b0', 0.5)); c.globalAlpha = 1; }
        flash(c, W, Hh, t, D, '#fff2b0', 0.85);
    };
    CIN.GOD_HAND = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#2a1e04', '#f0c85a'); const d = easeOut(clamp01(t / 0.85)), cx = W / 2, ty = lerp(-Hh * 0.6, Hh * 0.28, d);
        add(c, () => { rays(c, cx, ty, 18, Hh * 1.3, t * 0.2, 'rgba(255,245,190,0.25)', 0.04); glowDot(c, cx, ty + 60, Hh * 0.5, '#fff2b0', 0.6); });
        c.fillStyle = '#fff2c0'; c.strokeStyle = '#d8a83a'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); c.roundRect ? c.roundRect(cx - Hh * 0.16, ty - Hh * 0.2, Hh * 0.32, Hh * 0.3, 40) : c.rect(cx - Hh * 0.16, ty - Hh * 0.2, Hh * 0.32, Hh * 0.3); c.fill(); c.stroke();
        for (let i = 0; i < 5; i++) { const fa = (-0.55 + i * 0.275), L = Hh * (i === 2 ? 0.34 : i === 0 || i === 4 ? 0.22 : 0.3) * (0.7 + 0.3 * d), bx = cx + (i - 2) * Hh * 0.062, by = ty + Hh * 0.08; c.save(); c.translate(bx, by); c.rotate(fa * 0.5); c.beginPath(); c.roundRect ? c.roundRect(-Hh * 0.03, 0, Hh * 0.06, L, 22) : c.rect(-Hh * 0.03, 0, Hh * 0.06, L); c.fill(); c.stroke(); c.restore(); }
        flash(c, W, Hh, t, D, '#fff8d0', 0.85);
    };
    CIN.DRUID = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#0a2a10', '#4a9a40'); const r = rrng('dru'); for (let i = 0; i < 9; i++) { const q = easeOut(clamp01((t - 0.1 - i * 0.07) / 0.6)); tree(c, W * (0.06 + i * 0.11) + (r() - 0.5) * 20, Hh * (0.8 + (i % 3) * 0.05), Hh * (0.35 + r() * 0.2), q, '#3a2410', i % 2 ? '#2a7a2a' : '#3a9a3a'); }
        c.strokeStyle = '#2a8a2a'; c.lineWidth = 5; c.lineCap = 'round'; for (let i = 0; i < 12; i++) { const x = W * (i / 11), g = easeOut(clamp01((t - 0.2 - i * 0.03) / 0.7)); c.beginPath(); c.moveTo(x, Hh); c.bezierCurveTo(x + 30, Hh - Hh * 0.2 * g, x - 30, Hh - Hh * 0.35 * g, x + 10, Hh - Hh * 0.5 * g); c.stroke(); }
        add(c, () => { for (let i = 0; i < 30; i++) glowDot(c, (r() * W + t * 40 * (i % 3 + 1)) % W, Hh - ((r() * Hh + t * 70) % Hh), 5 + r() * 5, '#caff8a', 0.7); }); flash(c, W, Hh, t, D, '#caff8a', 0.55);
    };
    CIN.ARCHDRUID = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#06180e', '#1a4a26'); const g = easeOut(clamp01(t / 0.9)), cx = W / 2; c.strokeStyle = '#2a1a0a'; c.lineCap = 'round';
        c.lineWidth = 46 * g; c.beginPath(); c.moveTo(cx, Hh); c.lineTo(cx, Hh * (1 - 0.75 * g)); c.stroke(); for (const s of [-1, 1]) { c.lineWidth = 22 * g; c.beginPath(); c.moveTo(cx, Hh * 0.95); c.quadraticCurveTo(cx + s * 120, Hh * 0.9, cx + s * 260 * g, Hh); c.stroke(); c.beginPath(); c.moveTo(cx, Hh * (1 - 0.5 * g)); c.quadraticCurveTo(cx + s * 120 * g, Hh * (1 - 0.6 * g), cx + s * 300 * g, Hh * (1 - 0.62 * g)); c.stroke(); }
        const season = clamp01((t - 0.7) / 0.5), r = rrng('can'); for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Hh * (0.1 + r() * 0.42) * g; const col = season > 0.5 && i % 2 ? '#ff9a3a' : '#3aa83a'; c.fillStyle = col; c.beginPath(); c.arc(cx + Math.cos(a) * d * 1.7, Hh * 0.32 + Math.sin(a) * d * 0.9, 18 + r() * 22, 0, TAU); c.fill(); }
        add(c, () => { for (let i = 0; i < 40; i++) glowDot(c, r() * W, (r() * Hh + t * 50) % Hh, 4 + r() * 5, '#caff8a', 0.8); glowDot(c, cx, Hh * 0.35, Hh * 0.5 * g, '#9fff8a', 0.25); }); flash(c, W, Hh, t, D, '#e0ffc0', 0.6);
    };
    CIN.MERCHANT = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#2a1c06', '#6a4a14'); const cx = W / 2, cy = Hh * 0.42, tilt = Math.sin(clamp01(t / 1.0) * Math.PI * 1.5) * 0.25 * (1 - clamp01((t - 0.9) / 0.3)); c.strokeStyle = '#ffd24a'; c.lineWidth = 7; c.lineCap = 'round';
        c.beginPath(); c.moveTo(cx, cy + Hh * 0.3); c.lineTo(cx, cy - Hh * 0.05); c.stroke(); c.save(); c.translate(cx, cy - Hh * 0.05); c.rotate(tilt); c.beginPath(); c.moveTo(-Hh * 0.3, 0); c.lineTo(Hh * 0.3, 0); c.stroke(); for (const s of [-1, 1]) { c.lineWidth = 2; c.beginPath(); c.moveTo(s * Hh * 0.3, 0); c.lineTo(s * Hh * 0.38, Hh * 0.18); c.moveTo(s * Hh * 0.3, 0); c.lineTo(s * Hh * 0.22, Hh * 0.18); c.stroke(); c.fillStyle = '#ffd24a'; c.beginPath(); c.ellipse(s * Hh * 0.3, Hh * 0.2, Hh * 0.1, Hh * 0.03, 0, 0, TAU); c.fill(); } c.restore();
        const r = rrng('coin'); add(c, () => { for (let i = 0; i < 70; i++) { const f = clamp01((t - 0.35 - r() * 0.5)); const x = r() * W, y = -20 + (f * 1.8) * (Hh + 40) * (0.7 + r() * 0.6); if (f <= 0) continue; c.fillStyle = '#ffd24a'; c.beginPath(); c.ellipse(x, y, 11, 11 * Math.abs(Math.cos(t * 8 + i)), 0, 0, TAU); c.fill(); glowDot(c, x, y, 18, '#fff2b0', 0.3); } }); flash(c, W, Hh, t, D, '#ffe27a', 0.6);
    };
    CIN.TYCOON = (c, t, D, W, Hh, wd, snap) => {
        bg(c, t, snap, W, Hh, '#06121c', '#1a3a52'); for (let i = 0; i < 14; i++) { const x = W * (i / 13), h = Hh * (0.25 + 0.4 * ((i * 37) % 10) / 10) * easeOut(clamp01((t - 0.05 - i * 0.03) / 0.5)); c.fillStyle = '#0a1a28'; c.fillRect(x - 28, Hh - h, 56, h); c.fillStyle = 'rgba(255,226,122,0.8)'; for (let y = Hh - h + 10; y < Hh - 10; y += 18) for (let k = 0; k < 3; k++) if ((i + y + k) % 3) c.fillRect(x - 20 + k * 16, y, 8, 8); }
        const pts = []; for (let i = 0; i <= 18; i++) { const x = W * (0.06 + i * 0.05), y = Hh * 0.8 - i * Hh * 0.036 - Math.sin(i * 1.7) * 14; pts.push([x, y]); } add(c, () => { c.strokeStyle = '#6fffb0'; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round'; partial(c, pts, easeOut(clamp01((t - 0.3) / 0.7))); });
        const r = rrng('bill'); for (let i = 0; i < 30; i++) { const f = clamp01(t - 0.6 - r() * 0.5); if (f <= 0) continue; c.save(); c.translate(r() * W, -20 + f * 1.6 * Hh * (0.7 + r() * 0.5)); c.rotate(Math.sin(t * 3 + i)); c.fillStyle = '#6fd88a'; c.fillRect(-16, -8, 32, 16); c.restore(); } flash(c, W, Hh, t, D, '#9fffd0', 0.6);
    };
};
