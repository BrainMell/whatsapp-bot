'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  DAY & NIGHT CYCLE — one shared sky-clock for every render in the game
//  (owner 2026-10-21, Task 21: "for all the renders … from the world map to
//  all the 3D and even the 2D ones like the fish and hunt — implement a day
//  and night cycle where it gets darker, but there are light sources, of
//  course. Make the colors for this day and night cycle realistic.")
//
//  Every renderer calls phaseAt() → paints normally (its own true day colours)
//  → calls grade() to wear the hour → adds its own LIGHT SOURCES on top at
//  night with light() (additive glows: windows, lanterns, campfires, the
//  moon). The darkening is realistic: never flat black — deep blue moonlight,
//  warm orange horizons at golden hour, pink-gold dawn.
//
//  Phases are quantised from the real UTC clock (cache keys bake per phase —
//  every render stays deterministic and disk-cached per phase):
//      dawn   05:00–07:00   pink-gold, long cool shadows
//      day    07:00–17:00   true colours, no grade
//      golden 17:00–18:30   low warm sun, amber wash
//      dusk   18:30–20:00   orange → violet, first lights come on
//      night  20:00–05:00   deep blue moonlight, windows + fires glow
// ═══════════════════════════════════════════════════════════════════════════

const PHASES = {
    dawn:   { label: 'dawn',   dark: 0.18, lightsOn: false, h0: 5,  h1: 7 },
    day:    { label: 'day',    dark: 0.00, lightsOn: false, h0: 7,  h1: 17 },
    golden: { label: 'golden', dark: 0.10, lightsOn: false, h0: 17, h1: 18.5 },
    dusk:   { label: 'dusk',   dark: 0.30, lightsOn: true,  h0: 18.5, h1: 20 },
    night:  { label: 'night',  dark: 0.55, lightsOn: true,  h0: 20, h1: 29 },   // 20..24+0..5
};

/** The phase for a moment (Date | ms | undefined=now), quantised to PHASES. */
function phaseAt(when) {
    const d = when instanceof Date ? when : new Date(Number(when) || Date.now());
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (h >= 5 && h < 7) return 'dawn';
    if (h >= 7 && h < 17) return 'day';
    if (h >= 17 && h < 18.5) return 'golden';
    if (h >= 18.5 && h < 20) return 'dusk';
    return 'night';                                   // 20:00 → 05:00
}

function phaseInfo(id) { return PHASES[id] || PHASES.day; }

// ── the grade — realistic colour over a finished (day-painted) scene ────────
// Each stop: [y0, y1, color, alpha] bands, painted top→bottom. Colours are
// chosen like camera grade film: dawn pink-gold, golden amber, dusk orange
// falling into violet, night deep blue moonlight. None of them are grey/black.
const GRADES = {
    dawn: [
        [0.00, 0.45, 'rgba(255,196,150,1)', 0.14],
        [0.45, 1.00, 'rgba(120,130,190,1)', 0.07],
        [0.00, 1.00, 'rgba(255,170,120,1)', 0.05],
    ],
    golden: [
        [0.00, 0.40, 'rgba(255,190,110,1)', 0.13],
        [0.40, 1.00, 'rgba(255,150,70,1)', 0.09],
    ],
    dusk: [
        [0.00, 0.35, 'rgba(255,130,72,1)', 0.14],
        [0.35, 0.75, 'rgba(150,88,150,1)', 0.13],
        [0.75, 1.00, 'rgba(40,44,110,1)', 0.16],
        [0.00, 1.00, 'rgba(24,26,64,1)', 0.10],
    ],
    night: [
        [0.00, 1.00, 'rgba(16,30,66,1)', 0.44],
        [0.00, 1.00, 'rgba(6,12,36,1)', 0.20],
        [0.55, 1.00, 'rgba(4,8,26,1)', 0.14],
    ],
};

/** Wear the hour onto a finished day-lit scene. `box` limits the grade to a
 *  sub-rectangle (the world atlas grades only its map area, not the parchments).
 *  Each band feathers at its edges so no hard seam crosses the scene. */
function grade(ctx, w, h, phaseId, box) {
    const stops = GRADES[phaseId];
    if (!stops) return;                               // day: true colours
    const x0 = box ? box.x : 0, y0 = box ? box.y : 0;
    const ww = box ? box.w : w, hh = box ? box.h : h;
    const setA = (col, a) => col.replace(/,[\d.]+\)$/, `,${a})`);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, ww, hh); ctx.clip();
    for (const [a, b, col, alpha] of stops) {
        const f = Math.min(0.28, (b - a) * 0.4);
        const g = ctx.createLinearGradient(0, y0 + hh * a, 0, y0 + hh * b);
        if (a > 0) g.addColorStop(0, setA(col, 0));
        g.addColorStop(a > 0 ? f : 0, setA(col, alpha));
        g.addColorStop(b < 1 ? 1 - f : 1, setA(col, alpha));
        if (b < 1) g.addColorStop(1, setA(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0 + hh * a, ww, hh * (b - a) + 1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
}

/** A LIGHT SOURCE at night — additive warm/cool glow that punches through the
 *  dark (windows, lanterns, campfires, moon glints). Drawn AFTER grade(). */
function light(ctx, x, y, r, color = '#ffcf7a', alpha = 0.34, core = true) {
    if (r <= 0 || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, Math.max(1, r * 0.06), x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (core) {   // the hot centre of the light (flame/bulb itself)
        ctx.globalAlpha = Math.min(1, alpha * 1.6);
        ctx.fillStyle = '#fff3d0';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, r * 0.10), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

/** Stars + moon for scenes that own a sky. Drawn AFTER grade() (they shine
 *  through). Seedable so the same sky gets the same stars every frame. */
function moonStars(ctx, w, h, { seed = 7, moonX = 0.78, moonY = 0.16, mr = null, stars = 26, starAlpha = 0.9, skyH = 0.34 } = {}) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx.save();
    for (let i = 0; i < stars; i++) {                 // scattered stars, upper sky
        const sx = rnd() * w, sy = rnd() * h * skyH, sr = rnd() < 0.82 ? 1 : 1.8;
        ctx.globalAlpha = starAlpha * (0.35 + 0.65 * rnd());
        ctx.fillStyle = i % 5 ? '#e8f0ff' : '#fff6d8';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    // the moon: pale disc, soft halo, a bite of shadow for texture
    const mx = w * moonX, my = h * moonY, R = mr || Math.max(10, h * 0.038);
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(mx, my, R * 0.4, mx, my, R * 3.2);
    halo.addColorStop(0, 'rgba(210,225,255,0.30)'); halo.addColorStop(1, 'rgba(210,225,255,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(mx, my, R * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.fillStyle = '#eef2f8';
    ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,205,225,0.55)';
    ctx.beginPath(); ctx.arc(mx - R * 0.28, my - R * 0.18, R * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + R * 0.22, my + R * 0.3, R * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

/** Fireflies — warm drifting motes for dusk/night meadows. t = loop position. */
function fireflies(ctx, w, h, t, seed = 11, n = 7, box = null) {
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
        const bx = box ? box.x + rnd() * box.w : rnd() * w;
        const by = box ? box.y + rnd() * box.h : h * (0.4 + rnd() * 0.5);
        const ph = (t * (0.6 + rnd() * 0.8) + rnd()) % 1;
        const fx = bx + Math.sin(ph * Math.PI * 2 + i * 2.1) * w * 0.02;
        const fy = by + Math.sin(ph * Math.PI * 4 + i) * h * 0.018;
        const glow = Math.sin(ph * Math.PI);
        ctx.globalAlpha = 0.75 * glow;
        ctx.fillStyle = '#ffe9a0';
        ctx.beginPath(); ctx.arc(fx, fy, 1.4 + glow * 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.25 * glow;
        ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

module.exports = { phaseAt, phaseInfo, grade, light, moonStars, fireflies, PHASES, GRADES };
